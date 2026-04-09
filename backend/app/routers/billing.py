"""Stripe Checkout, webhooks, and overage settings (requires STRIPE_* env configuration)."""

from __future__ import annotations

import logging
import math
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func
from stripe import SignatureVerificationError, StripeError

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

from ..config.constants import MONTHLY_CREDIT_ALLOCATIONS, OVERAGE_USD_PER_CREDIT
from ..config.settings import settings
from ..credit_manager import allocate_monthly_credits
from ..database import get_db
from ..dependencies import get_current_user_required
from ..models import ProcessedStripeWebhook, User

logger = logging.getLogger(__name__)

router = APIRouter()

_TIER_TO_PRICE_SETTING = {
    "starter": "stripe_price_starter",
    "starter_plus": "stripe_price_starter_plus",
    "pro": "stripe_price_pro",
    "pro_plus": "stripe_price_pro_plus",
}


def _event_data_object(event: dict[str, Any]) -> dict[str, Any]:
    """Stripe may send ``\"data\": null``; ``dict.get(\"data\", {})`` would return None and crash."""
    data = event.get("data")
    if not isinstance(data, dict):
        return {}
    obj = data.get("object")
    return obj if isinstance(obj, dict) else {}


def _stripe_expandable_id(value: Any) -> str | None:
    """Normalize Stripe API string id or expanded object ``{\"id\": \"...\"}``."""
    if value is None:
        return None
    if isinstance(value, str) and value.strip():
        return value.strip()
    if isinstance(value, dict):
        sid = value.get("id")
        if isinstance(sid, str) and sid.strip():
            return sid.strip()
    return None


def _unix_ts_or_none(val: Any) -> int | None:
    if val is None:
        return None
    try:
        return int(val)
    except (TypeError, ValueError):
        return None


def _stripe_checkout_success_url(base: str) -> str:
    """Append Stripe's ``session_id`` template; use ``?`` or ``&`` depending on existing query string."""
    b = base.rstrip()
    q = "session_id={CHECKOUT_SESSION_ID}"
    return f"{b}&{q}" if "?" in b else f"{b}?{q}"


def _require_stripe():
    import stripe

    if not settings.stripe_secret_key:
        raise HTTPException(
            status_code=422,
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


def _cancel_other_subscriptions_for_customer(
    stripe_mod: Any,
    *,
    customer_id: str,
    keep_subscription_id: str,
) -> None:
    """Cancel every other active/trialing subscription so tier switches leave a single sub."""
    for status in ("active", "trialing"):
        try:
            list_obj = stripe_mod.Subscription.list(
                customer=customer_id,
                status=status,
                limit=100,
            )
        except StripeError as exc:
            logger.warning(
                "Subscription.list failed customer=%s status=%s: %s",
                customer_id,
                status,
                exc,
            )
            continue
        for sub in list_obj.auto_paging_iter():
            sid = getattr(sub, "id", None)
            if not sid or sid == keep_subscription_id:
                continue
            try:
                stripe_mod.Subscription.delete(sid)
                logger.info(
                    "Cancelled extra subscription %s for customer %s (keeping %s)",
                    sid,
                    customer_id,
                    keep_subscription_id,
                )
            except StripeError as exc:
                logger.warning("Subscription.delete(%s) failed: %s", sid, exc)


@router.post("/billing/create-checkout-session")
async def create_checkout_session(
    body: CheckoutSubscriptionBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
) -> dict[str, str]:
    """Create a Stripe Checkout Session for a monthly subscription."""
    stripe = _require_stripe()
    attr = _TIER_TO_PRICE_SETTING.get(body.tier)
    if not attr:
        raise HTTPException(status_code=400, detail="Invalid tier")
    price_id = getattr(settings, attr, None)
    if not price_id:
        raise HTTPException(
            status_code=422,
            detail=f"Stripe price ID not configured for tier {body.tier}.",
        )

    st = (current_user.subscription_status or "").lower()
    if (
        current_user.stripe_subscription_id
        and st == "active"
        and (current_user.subscription_tier or "") == body.tier
    ):
        raise HTTPException(
            status_code=400,
            detail="You already have this plan. Open Manage billing to change or cancel your subscription.",
        )

    success = body.success_url or f"{settings.frontend_url.rstrip('/')}/?checkout=success"
    cancel = body.cancel_url or f"{settings.frontend_url.rstrip('/')}/?checkout=cancel"

    session = stripe.checkout.Session.create(
        mode="subscription",
        line_items=[{"price": price_id, "quantity": 1}],
        success_url=_stripe_checkout_success_url(success),
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


@router.post("/billing/create-portal-session")
async def create_portal_session(
    current_user: User = Depends(get_current_user_required),
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


class OverageSettingsResponse(BaseModel):
    overage_enabled: bool
    overage_spend_limit_cents: int | None
    overage_credits_used_this_period: int
    overage_limit_credits: int | None
    overage_usd_per_credit: float
    billing_period_end: str | None


class OverageSettingsUpdate(BaseModel):
    overage_enabled: bool | None = None
    overage_limit_mode: Literal["unlimited", "capped"] | None = None
    overage_spend_limit_dollars: float | None = Field(None, ge=0.5, le=500.0)

    @field_validator("overage_spend_limit_dollars")
    @classmethod
    def round_to_cents(cls, v: float | None) -> float | None:
        if v is not None:
            return round(v, 2)
        return v


def _overage_limit_credits(limit_cents: int | None) -> int | None:
    if limit_cents is None:
        return None
    return math.floor((limit_cents / 100) / OVERAGE_USD_PER_CREDIT)


@router.get("/billing/overage-settings")
async def get_overage_settings(
    current_user: User = Depends(get_current_user_required),
) -> OverageSettingsResponse:
    """Return overage preferences for the authenticated user."""
    return OverageSettingsResponse(
        overage_enabled=current_user.overage_enabled or False,
        overage_spend_limit_cents=current_user.overage_spend_limit_cents,
        overage_credits_used_this_period=current_user.overage_credits_used_this_period or 0,
        overage_limit_credits=_overage_limit_credits(current_user.overage_spend_limit_cents),
        overage_usd_per_credit=OVERAGE_USD_PER_CREDIT,
        billing_period_end=(
            current_user.billing_period_end.isoformat() if current_user.billing_period_end else None
        ),
    )


@router.put("/billing/overage-settings")
async def update_overage_settings(
    body: OverageSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
) -> OverageSettingsResponse:
    """Update overage preferences. Only paid-tier users may enable overages."""
    tier = current_user.subscription_tier or "free"
    if tier not in MONTHLY_CREDIT_ALLOCATIONS:
        raise HTTPException(
            status_code=403,
            detail="Overages are only available on paid subscription plans.",
        )

    if body.overage_enabled is not None:
        current_user.overage_enabled = body.overage_enabled
        if not body.overage_enabled:
            current_user.overage_spend_limit_cents = None

    if body.overage_limit_mode == "unlimited":
        current_user.overage_spend_limit_cents = None
    elif body.overage_limit_mode == "capped" and body.overage_spend_limit_dollars is not None:
        current_user.overage_spend_limit_cents = int(body.overage_spend_limit_dollars * 100)
    elif body.overage_spend_limit_dollars is not None:
        current_user.overage_spend_limit_cents = int(body.overage_spend_limit_dollars * 100)

    db.add(current_user)
    db.commit()
    db.refresh(current_user)

    return OverageSettingsResponse(
        overage_enabled=current_user.overage_enabled or False,
        overage_spend_limit_cents=current_user.overage_spend_limit_cents,
        overage_credits_used_this_period=current_user.overage_credits_used_this_period or 0,
        overage_limit_credits=_overage_limit_credits(current_user.overage_spend_limit_cents),
        overage_usd_per_credit=OVERAGE_USD_PER_CREDIT,
        billing_period_end=(
            current_user.billing_period_end.isoformat() if current_user.billing_period_end else None
        ),
    )


def _user_from_metadata(meta: dict[str, Any], db: Session) -> User | None:
    uid = meta.get("user_id")
    if not uid:
        return None
    try:
        return db.query(User).filter(User.id == int(uid)).first()
    except (TypeError, ValueError):
        return None


def _stripe_event_to_dict(event: Any) -> dict[str, Any]:
    """``construct_event`` may return a dict or a StripeObject depending on SDK version."""
    if isinstance(event, dict):
        return event
    for name in ("to_dict_recursive", "to_dict"):
        fn = getattr(event, name, None)
        if callable(fn):
            try:
                out = fn()
                if isinstance(out, dict):
                    return out
            except Exception as e:
                logger.debug("Stripe event to_dict %s failed: %s", name, e)
                continue
    try:
        return dict(event)  # type: ignore[arg-type]
    except Exception:
        logger.warning("Stripe webhook event could not be converted to dict: %s", type(event))
        return {}


def _user_from_checkout_session(obj: dict[str, Any], db: Session) -> User | None:
    """Resolve CompareIntel user from Checkout Session (metadata, client_reference_id, email)."""
    meta = obj.get("metadata") or {}
    if not isinstance(meta, dict):
        meta = {}
    user = _user_from_metadata(meta, db)
    if user:
        return user
    cref = obj.get("client_reference_id")
    if cref is not None and str(cref).strip():
        try:
            uid_int = int(str(cref).strip())
            u = db.query(User).filter(User.id == uid_int).first()
            if u:
                return u
        except (TypeError, ValueError):
            pass
    email: str | None = None
    cd = obj.get("customer_details")
    if isinstance(cd, dict):
        e = cd.get("email")
        if isinstance(e, str) and e.strip():
            email = e.strip()
    if not email and isinstance(obj.get("customer_email"), str):
        email = obj["customer_email"].strip()
    if email:
        em = email.lower()
        u = db.query(User).filter(func.lower(User.email) == em).first()
        if u:
            return u
    return None


def _tier_from_subscription_prices(subscription: dict[str, Any]) -> str | None:
    """Map Stripe recurring price id on the subscription to CompareIntel tier."""
    price_id_to_tier: list[tuple[str | None, str]] = [
        (settings.stripe_price_starter, "starter"),
        (settings.stripe_price_starter_plus, "starter_plus"),
        (settings.stripe_price_pro, "pro"),
        (settings.stripe_price_pro_plus, "pro_plus"),
    ]
    items = subscription.get("items")
    if not isinstance(items, dict):
        return None
    for line in items.get("data") or []:
        if not isinstance(line, dict):
            continue
        price = line.get("price")
        pid: str | None
        if isinstance(price, str):
            pid = price
        elif isinstance(price, dict):
            p = price.get("id")
            pid = p if isinstance(p, str) else None
        else:
            pid = None
        if not pid:
            continue
        for configured, tier in price_id_to_tier:
            if configured and pid == configured:
                return tier
    return None


def _resolve_paid_tier(
    subscription: dict[str, Any],
    *,
    tier_hint: str | None,
    user: User,
) -> str:
    """Never keep ``free`` when we are persisting an active Stripe subscription."""
    sm = subscription.get("metadata") or {}
    raw = sm.get("tier")
    if isinstance(raw, str) and raw in MONTHLY_CREDIT_ALLOCATIONS:
        return raw
    if isinstance(tier_hint, str) and tier_hint in MONTHLY_CREDIT_ALLOCATIONS:
        return tier_hint
    from_price = _tier_from_subscription_prices(subscription)
    if from_price:
        return from_price
    existing = user.subscription_tier
    if isinstance(existing, str) and existing in MONTHLY_CREDIT_ALLOCATIONS:
        return existing
    return "starter"


def _apply_subscription_fields(
    user: User,
    subscription: dict[str, Any],
    db: Session,
    *,
    tier_hint: str | None = None,
) -> None:
    """Persist tier, subscription id, and billing period boundaries (no credit allocation)."""
    tier = _resolve_paid_tier(subscription, tier_hint=tier_hint, user=user)
    user.subscription_tier = tier
    user.stripe_subscription_id = subscription.get("id")
    cps = _unix_ts_or_none(subscription.get("current_period_start"))
    cpe = _unix_ts_or_none(subscription.get("current_period_end"))
    if cps is not None:
        user.billing_period_start = datetime.fromtimestamp(cps, tz=UTC)
    if cpe is not None:
        user.billing_period_end = datetime.fromtimestamp(cpe, tz=UTC)
        user.credits_reset_at = user.billing_period_end
    user.subscription_status = "active"
    db.add(user)
    db.commit()


def _allocate_for_paid_cycle(user_id: int, tier: str, db: Session) -> None:
    """Reset monthly pool on successful invoice (renewal or first charge)."""
    allocate_monthly_credits(user_id, tier, db)


@router.post("/billing/webhooks/stripe")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)) -> dict[str, str]:
    """Verify signature and apply subscription events."""
    if not settings.stripe_webhook_secret:
        raise HTTPException(status_code=422, detail="Stripe webhooks are not configured.")
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")
    if not sig_header:
        raise HTTPException(status_code=400, detail="Missing stripe-signature header")

    stripe = _require_stripe()
    try:
        raw_event = stripe.Webhook.construct_event(
            payload, sig_header, settings.stripe_webhook_secret
        )
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid webhook payload") from None
    except SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid webhook signature") from None

    event = _stripe_event_to_dict(raw_event)

    eid = event.get("id")
    if eid and db.query(ProcessedStripeWebhook).filter_by(stripe_event_id=eid).first():
        return {"status": "ok"}

    etype = event.get("type")
    obj = _event_data_object(event)

    try:
        if etype == "checkout.session.completed":
            meta = obj.get("metadata") or {}
            if not isinstance(meta, dict):
                meta = {}
            user = _user_from_checkout_session(obj, db)
            if not user:
                logger.warning(
                    "checkout.session.completed: could not resolve user metadata=%s "
                    "client_reference_id=%s customer_email=%s",
                    meta,
                    obj.get("client_reference_id"),
                    obj.get("customer_email"),
                )
            else:
                cust_id = _stripe_expandable_id(obj.get("customer"))
                if cust_id:
                    user.stripe_customer_id = cust_id
                mode_sub = obj.get("mode") == "subscription"
                sub_raw = obj.get("subscription")
                sub_id = _stripe_expandable_id(sub_raw)
                if mode_sub and sub_id:
                    sub_dict: dict[str, Any] | None = None
                    if (
                        isinstance(sub_raw, dict)
                        and _unix_ts_or_none(sub_raw.get("current_period_start")) is not None
                    ):
                        sub_dict = sub_raw
                    else:
                        try:
                            sub = stripe.Subscription.retrieve(sub_id, expand=["items.data.price"])
                            sub_dict = sub.to_dict()
                        except StripeError as exc:
                            logger.warning(
                                "checkout.session.completed: Subscription.retrieve(%s) failed: %s",
                                sub_id,
                                exc,
                            )
                    if sub_dict is not None:
                        session_tier = meta.get("tier")
                        th = (
                            session_tier
                            if isinstance(session_tier, str)
                            and session_tier in MONTHLY_CREDIT_ALLOCATIONS
                            else None
                        )
                        _apply_subscription_fields(user, sub_dict, db, tier_hint=th)
                        if cust_id:
                            _cancel_other_subscriptions_for_customer(
                                stripe,
                                customer_id=cust_id,
                                keep_subscription_id=sub_id,
                            )
                    else:
                        tier = meta.get("tier")
                        if isinstance(tier, str) and tier in MONTHLY_CREDIT_ALLOCATIONS:
                            user.subscription_tier = tier
                            user.stripe_subscription_id = sub_id
                            user.subscription_status = "active"
                        db.add(user)
                        db.commit()
                        if cust_id:
                            _cancel_other_subscriptions_for_customer(
                                stripe,
                                customer_id=cust_id,
                                keep_subscription_id=sub_id,
                            )
                elif cust_id:
                    db.add(user)
                    db.commit()
        elif etype == "invoice.paid":
            sub_id = _stripe_expandable_id(obj.get("subscription"))
            cust = _stripe_expandable_id(obj.get("customer"))
            user = None
            if cust:
                user = db.query(User).filter(User.stripe_customer_id == cust).first()
            if not user and sub_id:
                user = db.query(User).filter(User.stripe_subscription_id == sub_id).first()
            if user and sub_id:
                try:
                    sub = stripe.Subscription.retrieve(sub_id, expand=["items.data.price"])
                    sub_d = sub.to_dict()
                except StripeError as exc:
                    logger.warning(
                        "invoice.paid: Subscription.retrieve(%s) failed: %s", sub_id, exc
                    )
                    sub_d = None
                if sub_d is not None:
                    _apply_subscription_fields(user, sub_d, db)
                    db.refresh(user)
                    tier = (
                        user.subscription_tier
                        if user.subscription_tier in MONTHLY_CREDIT_ALLOCATIONS
                        else "starter"
                    )
                    if tier in MONTHLY_CREDIT_ALLOCATIONS:
                        _allocate_for_paid_cycle(user.id, tier, db)
        elif etype == "customer.subscription.updated":
            meta = obj.get("metadata") or {}
            if not isinstance(meta, dict):
                meta = {}
            user = _user_from_metadata(meta, db)
            if not user and obj.get("id"):
                user = db.query(User).filter(User.stripe_subscription_id == obj["id"]).first()
            if user:
                m_tier = meta.get("tier")
                th = (
                    m_tier
                    if isinstance(m_tier, str) and m_tier in MONTHLY_CREDIT_ALLOCATIONS
                    else None
                )
                _apply_subscription_fields(user, obj, db, tier_hint=th)
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
