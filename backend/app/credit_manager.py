"""
Credit management - handles allocations, deductions, and resets.
Uses row-level locking to handle concurrent requests safely.
"""

import logging
import math
import time
from datetime import UTC, datetime, timedelta
from decimal import ROUND_CEILING, Decimal
from typing import Any

import pytz
from sqlalchemy import desc
from sqlalchemy.orm import Session

from .config.constants import (
    DAILY_CREDIT_LIMITS,
    MONTHLY_CREDIT_ALLOCATIONS,
    OVERAGE_USD_PER_CREDIT,
)
from .models import CreditTransaction, User

logger = logging.getLogger(__name__)


def get_user_credits(user_id: int, db: Session) -> int:
    """Returns remaining credits in the user's monthly subscription pool."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise ValueError(f"User {user_id} not found")

    allocated = user.monthly_credits_allocated or 0
    used = user.credits_used_this_period or 0
    return max(0, allocated - used)


def _overage_budget_remaining(user: User) -> int:
    """Credits still available via overage. Returns 0 when overage is off or exhausted."""
    if not user.overage_enabled:
        return 0
    used = user.overage_credits_used_this_period or 0
    if user.overage_spend_limit_cents is None:
        return 999_999_999  # effectively unlimited
    limit_credits = math.floor((user.overage_spend_limit_cents / 100) / OVERAGE_USD_PER_CREDIT)
    return max(0, limit_credits - used)


def check_credits_sufficient(user_id: int, required_credits: Decimal, db: Session) -> bool:
    """Check if user can afford the request (pool + overage). Resets credits first."""
    check_and_reset_credits_if_needed(user_id, db)

    current_credits = get_user_credits(user_id, db)
    required_int = int(required_credits.quantize(Decimal("1"), rounding=ROUND_CEILING))
    if current_credits >= required_int:
        return True

    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        return False
    shortfall = required_int - current_credits
    return _overage_budget_remaining(user) >= shortfall


def deduct_credits(
    user_id: int,
    credits: Decimal,
    usage_log_id: int | None,
    db: Session,
    description: str | None = None,
) -> None:
    """Deduct credits: monthly pool -> overage. Creates audit trail.

    Overage consumption is hard-capped at ``overage_spend_limit_cents`` — any
    actual usage beyond the cap is **absorbed by the platform** (not billed to
    the user, not reported to Stripe) and emitted as a ``CREDIT_CAP_ABSORBED``
    warning so the shortfall can be monitored. This protects users from being
    charged more than the dollar ceiling they explicitly configured, which can
    otherwise happen when the reserved-credit estimate underestimates actual
    model output.
    """
    credits_int = int(round(credits))

    user = db.query(User).filter(User.id == user_id).with_for_update().first()

    if not user:
        raise ValueError(f"User {user_id} not found")

    allocated = user.monthly_credits_allocated or 0
    used = user.credits_used_this_period or 0

    room_monthly = max(0, allocated - used)
    take_monthly = min(credits_int, room_monthly)
    remainder = credits_int - take_monthly

    user.credits_used_this_period = used + take_monthly

    overage_reported = 0
    absorbed = 0
    if remainder > 0:
        if user.overage_enabled:
            overage_room = _overage_budget_remaining(user)
            take_overage = min(remainder, overage_room)
            absorbed = remainder - take_overage
            user.overage_credits_used_this_period = (
                user.overage_credits_used_this_period or 0
            ) + take_overage
            overage_reported = take_overage
            remainder = 0

            if absorbed > 0:
                limit_credits: int | None = None
                if user.overage_spend_limit_cents is not None:
                    limit_credits = math.floor(
                        (user.overage_spend_limit_cents / 100) / OVERAGE_USD_PER_CREDIT
                    )
                logger.warning(
                    "CREDIT_CAP_ABSORBED user_id=%s absorbed_credits=%s absorbed_usd=%.4f "
                    "requested_credits=%s billed_credits=%s overage_limit_credits=%s "
                    "overage_spend_limit_cents=%s overage_used_before=%s usage_log_id=%s",
                    user_id,
                    absorbed,
                    absorbed * OVERAGE_USD_PER_CREDIT,
                    credits_int,
                    credits_int - absorbed,
                    limit_credits,
                    user.overage_spend_limit_cents,
                    (user.overage_credits_used_this_period or 0) - take_overage,
                    usage_log_id,
                )
        else:
            # Overage disabled but a shortfall slipped through the admit check
            # (e.g. race between two in-flight requests). Absorb it rather than
            # silently inflate total_credits_used.
            absorbed = remainder
            remainder = 0
            logger.warning(
                "CREDIT_CAP_ABSORBED user_id=%s absorbed_credits=%s reason=overage_disabled "
                "requested_credits=%s usage_log_id=%s",
                user_id,
                absorbed,
                credits_int,
                usage_log_id,
            )

    billed_int = credits_int - absorbed
    user.total_credits_used = (user.total_credits_used or 0) + billed_int

    if absorbed > 0:
        # Record the billed amount so the ledger reconciles with Stripe / pool state.
        credits_millicredits = billed_int * 1000
        absorbed_usd = absorbed * OVERAGE_USD_PER_CREDIT
        tx_description = (
            description or f"Credits used for request ({float(credits):.4f} credits)"
        ) + f" [cap: absorbed {absorbed} credit(s) ~${absorbed_usd:.4f} beyond overage limit]"
    else:
        credits_millicredits = int(credits * 1000)
        tx_description = description or f"Credits used for request ({float(credits):.4f} credits)"

    transaction = CreditTransaction(
        user_id=user_id,
        transaction_type="usage",
        credits_amount=-credits_millicredits,
        description=tx_description,
        related_usage_log_id=usage_log_id,
    )
    db.add(transaction)

    db.commit()

    if overage_reported > 0 and user.stripe_customer_id:
        from .stripe_metering import report_overage_credits

        idem_key = f"overage-{user_id}-{int(time.time() * 1000)}"
        report_overage_credits(
            stripe_customer_id=str(user.stripe_customer_id),
            credits=overage_reported,
            idempotency_key=idem_key,
        )


def allocate_monthly_credits(user_id: int, tier: str, db: Session) -> None:
    """Allocate monthly credits based on tier.

    For users with ``stripe_subscription_id``, billing period boundaries and
    ``credits_reset_at`` are owned by Stripe webhooks—this only refills the
    monthly pool and resets usage. For everyone else, sets a 30-day window.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise ValueError(f"User {user_id} not found")

    # Get credit allocation for tier
    if tier in MONTHLY_CREDIT_ALLOCATIONS:
        credits = MONTHLY_CREDIT_ALLOCATIONS[tier]

        if not user.stripe_subscription_id:
            now = datetime.now(UTC)
            user.billing_period_start = now
            user.billing_period_end = now + timedelta(days=30)
            user.credits_reset_at = user.billing_period_end

        # Allocate credits; reset usage, overage tracking, and overage
        # preference for the new period so users opt-in fresh each cycle.
        user.monthly_credits_allocated = credits
        user.credits_used_this_period = 0
        user.overage_credits_used_this_period = 0
        user.overage_enabled = False
        user.overage_spend_limit_cents = None

        # Create allocation transaction
        transaction = CreditTransaction(
            user_id=user_id,
            transaction_type="allocation",
            credits_amount=credits,
            description=f"Monthly credit allocation for {tier} tier",
        )
        db.add(transaction)
        db.commit()
    elif tier in DAILY_CREDIT_LIMITS:
        # Free/unregistered tiers use daily limits (handled by reset_daily_credits)
        credits = DAILY_CREDIT_LIMITS[tier]
        user.monthly_credits_allocated = credits
        user.credits_used_this_period = 0
        db.commit()
    else:
        # Unknown tier - set to 0
        user.monthly_credits_allocated = 0
        user.credits_used_this_period = 0
        db.commit()


def _get_user_timezone(user: User) -> str:
    """Get user's timezone, default to UTC if invalid or missing."""
    if user.preferences and user.preferences.timezone:
        try:
            pytz.timezone(user.preferences.timezone)
            return user.preferences.timezone
        except (pytz.exceptions.UnknownTimeZoneError, AttributeError):
            pass
    return "UTC"


def _get_next_local_midnight(timezone_str: str) -> datetime:
    """Next midnight in the given timezone, returned as UTC."""
    tz = pytz.timezone(timezone_str)
    now_local = datetime.now(tz)
    # Get next midnight in local timezone
    tomorrow_local = (now_local + timedelta(days=1)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    # Convert to UTC for storage
    return tomorrow_local.astimezone(UTC)


def _can_reset_user_credits(user_id: int, db: Session, min_hours_between_resets: int = 20) -> bool:
    """Abuse prevention - ensures min 20h between credit resets."""
    # Find most recent allocation
    last_allocation = (
        db.query(CreditTransaction)
        .filter(
            CreditTransaction.user_id == user_id, CreditTransaction.transaction_type == "allocation"
        )
        .order_by(desc(CreditTransaction.created_at))
        .first()
    )

    if last_allocation is None:
        return True

    now = datetime.now(UTC)
    # Make created_at timezone-aware (SQLite stores as naive UTC)
    created_at = (
        last_allocation.created_at.replace(tzinfo=UTC)
        if last_allocation.created_at.tzinfo is None
        else last_allocation.created_at
    )
    hours_since_reset = (now - created_at).total_seconds() / 3600
    return hours_since_reset >= min_hours_between_resets


def reset_daily_credits(user_id: int, tier: str, db: Session, force: bool = False) -> None:
    """Reset daily credits at user's local midnight. Use force=True for admin overrides."""
    if tier not in DAILY_CREDIT_LIMITS:
        # Not a daily-reset tier, skip
        return

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise ValueError(f"User {user_id} not found")

    # Check if reset is allowed (abuse prevention) - skip if force=True (admin reset)
    if not force and not _can_reset_user_credits(user_id, db):
        # Too soon to reset - return without resetting
        return

    credits = DAILY_CREDIT_LIMITS[tier]

    # Get user's timezone preference
    user_timezone = _get_user_timezone(user)

    # Calculate next midnight in user's timezone
    next_midnight_utc = _get_next_local_midnight(user_timezone)

    # Set reset time to next midnight in user's timezone (stored as UTC)
    user.credits_reset_at = next_midnight_utc

    # Reset allocation and usage
    user.monthly_credits_allocated = credits
    user.credits_used_this_period = 0

    # Create allocation transaction
    transaction = CreditTransaction(
        user_id=user_id,
        transaction_type="allocation",
        credits_amount=credits,
        description=f"Daily credit allocation for {tier} tier (timezone: {user_timezone})",
    )
    db.add(transaction)
    db.commit()


def get_credit_usage_stats(user_id: int, db: Session) -> dict[str, Any]:
    """Get full credit stats including allocation, usage, and reset time."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise ValueError(f"User {user_id} not found")

    allocated = user.monthly_credits_allocated or 0
    used = user.credits_used_this_period or 0
    pool_remaining = max(0, allocated - used)
    overage_room = _overage_budget_remaining(user)
    remaining = pool_remaining + overage_room
    total_used = user.total_credits_used or 0

    # Get reset time
    reset_at = user.credits_reset_at
    reset_time_str = reset_at.isoformat() if reset_at else None

    # Get billing period info for paid tiers
    billing_period_start = user.billing_period_start
    billing_period_end = user.billing_period_end

    # Calculate period type
    tier = user.subscription_tier or "free"
    if tier in DAILY_CREDIT_LIMITS:
        period_type = "daily"
    elif tier in MONTHLY_CREDIT_ALLOCATIONS:
        period_type = "monthly"
    else:
        period_type = "unknown"

    overage_used = user.overage_credits_used_this_period or 0
    overage_limit_credits = None
    if user.overage_spend_limit_cents is not None:
        overage_limit_credits = math.floor(
            (user.overage_spend_limit_cents / 100) / OVERAGE_USD_PER_CREDIT
        )

    return {
        "credits_allocated": allocated,
        "credits_used_this_period": used,
        "credits_remaining": remaining,
        "total_credits_used": total_used,
        "credits_reset_at": reset_time_str,
        "billing_period_start": billing_period_start.isoformat() if billing_period_start else None,
        "billing_period_end": billing_period_end.isoformat() if billing_period_end else None,
        "period_type": period_type,
        "subscription_tier": tier,
        "overage_enabled": user.overage_enabled or False,
        "overage_credits_used_this_period": overage_used,
        "overage_limit_credits": overage_limit_credits,
    }


def ensure_credits_allocated(user_id: int, db: Session) -> None:
    """Make sure user has credits - called on first request or tier change."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise ValueError(f"User {user_id} not found")

    tier = user.subscription_tier or "free"

    # Paid monthly tiers: pool size must match tier (e.g. after Stripe upgrade, free user may still
    # have daily limit 100 in monthly_credits_allocated until we realign).
    if tier in MONTHLY_CREDIT_ALLOCATIONS:
        correct_pool = MONTHLY_CREDIT_ALLOCATIONS[tier]
        current = user.monthly_credits_allocated
        if current is None or current != correct_pool:
            allocate_monthly_credits(user_id, tier, db)
        return

    # Daily / free tiers (including downgrade from paid: pool must match daily limit, not 720+)
    if tier in DAILY_CREDIT_LIMITS:
        daily = DAILY_CREDIT_LIMITS[tier]
        current_alloc = user.monthly_credits_allocated
        if current_alloc is None or current_alloc == 0 or current_alloc != daily:
            user_timezone = _get_user_timezone(user)
            next_midnight_utc = _get_next_local_midnight(user_timezone)
            user.credits_reset_at = next_midnight_utc
            user.monthly_credits_allocated = daily
            user.credits_used_this_period = 0
            db.commit()


def check_and_reset_credits_if_needed(user_id: int, db: Session) -> None:
    """Reset credits if reset time has passed. Called before balance checks."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return

    tier = user.subscription_tier or "free"

    # Check if reset is needed
    if user.credits_reset_at:
        now = datetime.now(UTC)
        # Make credits_reset_at timezone-aware (SQLite stores as naive UTC)
        reset_at = (
            user.credits_reset_at.replace(tzinfo=UTC)
            if user.credits_reset_at.tzinfo is None
            else user.credits_reset_at
        )
        if now >= reset_at:
            # Reset needed - reset time has passed
            if tier in DAILY_CREDIT_LIMITS:
                reset_daily_credits(user_id, tier, db)
            elif tier in MONTHLY_CREDIT_ALLOCATIONS:
                if not user.stripe_subscription_id:
                    allocate_monthly_credits(user_id, tier, db)
    else:
        # No reset time set - this could mean:
        # 1. New user who hasn't been allocated credits yet
        # 2. User whose credits were never properly initialized
        # Ensure credits are allocated, and if they're already allocated but exhausted,
        # reset them (this handles edge cases where credits_reset_at was lost)
        allocated = user.monthly_credits_allocated or 0
        used = user.credits_used_this_period or 0

        if allocated == 0:
            # No credits allocated - ensure they're allocated
            ensure_credits_allocated(user_id, db)
        elif allocated > 0 and used >= allocated:
            # Credits are allocated but exhausted - reset them
            if tier in DAILY_CREDIT_LIMITS:
                reset_daily_credits(user_id, tier, db)
            elif tier in MONTHLY_CREDIT_ALLOCATIONS:
                if not user.stripe_subscription_id:
                    allocate_monthly_credits(user_id, tier, db)
        else:
            # Credits are allocated and not exhausted, but no reset time set
            # Set the reset time based on tier
            ensure_credits_allocated(user_id, db)
