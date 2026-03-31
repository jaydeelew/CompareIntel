"""Stripe Checkout and webhooks (requires STRIPE_* env configuration)."""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

from ..config.constants import MONTHLY_CREDIT_ALLOCATIONS
from ..config.settings import settings
from ..credit_manager import add_purchased_credits, allocate_monthly_credits
from ..database import get_db
from ..dependencies import get_current_user
from ..models import ProcessedStripeWebhook, User

logger = logging.getLogger(__name__)

router = APIRouter()

_TIER_TO_PRICE_SETTING = {
    "starter": "stripe_price_starter",
    "starter_plus": "stripe_price_starter_plus",
    "pro": "stripe_price_pro",
    "pro_plus": "stripe_price_pro_plus",
}


def _require_stripe():
    import stripe

    if not settings.stripe_secret_key:
        raise HTTPException(
            status_code=503,
            detail="Stripe billing is not configured (missing STRIPE_SECRET_KEY).",
        )
    stripe.api_key = settings.stripe_secret_key
    return stripe


class CheckoutSubscriptionBody(BaseModel):
    tier: str = Field(
        ...,
        description="Paid tier to subscribe",
        pattern="^(starter|starter_plus|pro|pro_plus)$",
    )
    success_url: str | None = None
    cancel_url: str | None = None


def _checkout_customer_kwargs(user: User) -> dict[str, str]:
    if user.stripe_customer_id:
        return {"customer": str(user.stripe_customer_id)}
    return {"customer_email": str(user.email)}


@router.post("/billing/create-checkout-session")
async def create_checkout_session(
    body: CheckoutSubscriptionBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, str]:
    """Create a Stripe Checkout Session for a monthly subscription."""
    stripe = _require_stripe()
    attr = _TIER_TO_PRICE_SETTING.get(body.tier)
    if not attr:
        raise HTTPException(status_code=400, detail="Invalid tier")
    price_id = getattr(settings, attr, None)
    if not price_id:
        raise HTTPException(
            status_code=503,
            detail=f"Stripe price ID not configured for tier {body.tier}.",
        )

    success = body.success_url or f"{settings.frontend_url.rstrip('/')}/?checkout=success"
    cancel = body.cancel_url or f"{settings.frontend_url.rstrip('/')}/?checkout=cancel"

    session = stripe.checkout.Session.create(
        mode="subscription",
        line_items=[{"price": price_id, "quantity": 1}],
        success_url=success + "&session_id={CHECKOUT_SESSION_ID}",
        cancel_url=cancel,
        client_reference_id=str(current_user.id),
        subscription_data={
            "metadata": {
                "user_id": str(current_user.id),
                "tier": body.tier,
            },
        },
        metadata={
            "user_id": str(current_user.id),
            "tier": body.tier,
        },
        **_checkout_customer_kwargs(current_user),
    )
    if not session.url:
        raise HTTPException(status_code=500, detail="Checkout session missing redirect URL")
    return {"url": session.url}


@router.post("/billing/create-credit-pack-checkout-session")
async def create_credit_pack_checkout_session(
    current_user: User = Depends(get_current_user),
) -> dict[str, str]:
    """One-time payment that credits ``stripe_credit_pack_credits`` via webhook metadata."""
    stripe = _require_stripe()
    if not settings.stripe_price_credit_pack:
        raise HTTPException(
            status_code=503,
            detail="Credit pack Stripe price is not configured (STRIPE_PRICE_CREDIT_PACK).",
        )
    tier = current_user.subscription_tier or "free"
    if tier not in MONTHLY_CREDIT_ALLOCATIONS:
        raise HTTPException(
            status_code=403,
            detail="Credit packs are available on paid subscription tiers.",
        )
    pack = max(1, int(settings.stripe_credit_pack_credits))
    success = f"{settings.frontend_url.rstrip('/')}/?checkout=pack_success"
    cancel = f"{settings.frontend_url.rstrip('/')}/?checkout=pack_cancel"

    session = stripe.checkout.Session.create(
        mode="payment",
        line_items=[{"price": settings.stripe_price_credit_pack, "quantity": 1}],
        success_url=success + "&session_id={CHECKOUT_SESSION_ID}",
        cancel_url=cancel,
        client_reference_id=str(current_user.id),
        metadata={
            "user_id": str(current_user.id),
            "credit_pack_credits": str(pack),
        },
        **_checkout_customer_kwargs(current_user),
    )
    if not session.url:
        raise HTTPException(status_code=500, detail="Checkout session missing redirect URL")
    return {"url": session.url}


@router.post("/billing/create-portal-session")
async def create_portal_session(
    current_user: User = Depends(get_current_user),
) -> dict[str, str]:
    """Stripe Customer Portal (cancel, payment method, invoices)."""
    stripe = _require_stripe()
    if not current_user.stripe_customer_id:
        raise HTTPException(
            status_code=400,
            detail="No billing account on file. Subscribe first to manage billing in the portal.",
        )
    session = stripe.billing_portal.Session.create(
        customer=current_user.stripe_customer_id,
        return_url=f"{settings.frontend_url.rstrip('/')}/",
    )
    if not session.url:
        raise HTTPException(status_code=500, detail="Portal session missing redirect URL")
    return {"url": session.url}


def _user_from_metadata(meta: dict[str, Any], db: Session) -> User | None:
    uid = meta.get("user_id")
    if not uid:
        return None
    try:
        return db.query(User).filter(User.id == int(uid)).first()
    except (TypeError, ValueError):
        return None


def _apply_subscription_fields(user: User, subscription: dict[str, Any], db: Session) -> None:
    """Persist tier, subscription id, and billing period boundaries (no credit allocation)."""
    tier = (subscription.get("metadata") or {}).get("tier") or user.subscription_tier
    if tier not in MONTHLY_CREDIT_ALLOCATIONS:
        tier = user.subscription_tier or "starter"
    user.subscription_tier = tier
    user.stripe_subscription_id = subscription.get("id")
    cps = subscription.get("current_period_start")
    cpe = subscription.get("current_period_end")
    if cps:
        user.billing_period_start = datetime.fromtimestamp(int(cps), tz=UTC)
    if cpe:
        user.billing_period_end = datetime.fromtimestamp(int(cpe), tz=UTC)
        user.credits_reset_at = user.billing_period_end
    user.subscription_status = "active"
    db.add(user)
    db.commit()


def _allocate_for_paid_cycle(user_id: int, tier: str, db: Session) -> None:
    """Reset monthly pool on successful invoice (renewal or first charge)."""
    allocate_monthly_credits(user_id, tier, db)


@router.post("/billing/webhooks/stripe")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)) -> dict[str, str]:
    """Verify signature and apply subscription / pack events."""
    if not settings.stripe_webhook_secret:
        raise HTTPException(status_code=503, detail="Stripe webhooks are not configured.")
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")
    if not sig_header:
        raise HTTPException(status_code=400, detail="Missing stripe-signature header")

    stripe = _require_stripe()
    try:
        event = stripe.Webhook.construct_event(payload, sig_header, settings.stripe_webhook_secret)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid webhook payload") from None
    except stripe.error.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid webhook signature") from None

    eid = event.get("id")
    if eid and db.query(ProcessedStripeWebhook).filter_by(stripe_event_id=eid).first():
        return {"status": "ok"}

    etype = event.get("type")
    obj = event.get("data", {}).get("object") or {}

    try:
        if etype == "checkout.session.completed":
            meta = obj.get("metadata") or {}
            user = _user_from_metadata(meta, db)
            if not user:
                logger.warning("checkout.session.completed: no user for metadata %s", meta)
            else:
                if obj.get("customer"):
                    user.stripe_customer_id = obj["customer"]
                pack = meta.get("credit_pack_credits")
                if pack:
                    add_purchased_credits(
                        user.id,
                        int(pack),
                        db,
                        description="Credit pack (Stripe checkout)",
                    )
                if obj.get("mode") == "subscription" and obj.get("subscription"):
                    sub = stripe.Subscription.retrieve(obj["subscription"])
                    _apply_subscription_fields(user, sub.to_dict(), db)
                elif not pack:
                    db.add(user)
                    db.commit()
        elif etype == "invoice.paid":
            sub_id = obj.get("subscription")
            cust = obj.get("customer")
            user = None
            if cust:
                user = db.query(User).filter(User.stripe_customer_id == cust).first()
            if not user and sub_id:
                user = db.query(User).filter(User.stripe_subscription_id == sub_id).first()
            if user and sub_id:
                sub = stripe.Subscription.retrieve(sub_id)
                sub_d = sub.to_dict()
                _apply_subscription_fields(user, sub_d, db)
                db.refresh(user)
                tier = user.subscription_tier or "starter"
                if tier in MONTHLY_CREDIT_ALLOCATIONS:
                    _allocate_for_paid_cycle(user.id, tier, db)
        elif etype == "customer.subscription.updated":
            meta = obj.get("metadata") or {}
            user = _user_from_metadata(meta, db)
            if not user and obj.get("id"):
                user = db.query(User).filter(User.stripe_subscription_id == obj["id"]).first()
            if user:
                _apply_subscription_fields(user, obj, db)
        elif etype == "customer.subscription.deleted":
            user = None
            if obj.get("id"):
                user = db.query(User).filter(User.stripe_subscription_id == obj["id"]).first()
            if user:
                user.subscription_status = "cancelled"
                user.stripe_subscription_id = None
                db.add(user)
                db.commit()
    except Exception as e:
        logger.exception("Stripe webhook handler error: %s", e)
        raise HTTPException(status_code=500, detail="Webhook processing failed") from e

    if eid:
        db.add(ProcessedStripeWebhook(stripe_event_id=eid))
        db.commit()

    return {"status": "ok"}
