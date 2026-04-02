"""
Credit management - handles allocations, deductions, and resets.
Uses row-level locking to handle concurrent requests safely.
"""

from datetime import UTC, datetime, timedelta
from decimal import ROUND_CEILING, Decimal
from typing import Any

import pytz
from sqlalchemy import desc
from sqlalchemy.orm import Session

from .config.constants import (
    DAILY_CREDIT_LIMITS,
    MONTHLY_CREDIT_ALLOCATIONS,
)
from .models import CreditTransaction, User


def get_user_credits(user_id: int, db: Session) -> int:
    """Returns remaining credits: subscription pool remainder plus purchased balance."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise ValueError(f"User {user_id} not found")

    allocated = user.monthly_credits_allocated or 0
    used = user.credits_used_this_period or 0
    sub_remaining = max(0, allocated - used)
    purchased = user.purchased_credits_balance or 0
    return sub_remaining + purchased


def check_credits_sufficient(user_id: int, required_credits: Decimal, db: Session) -> bool:
    """Check if user can afford the request. Resets credits first if needed."""
    check_and_reset_credits_if_needed(user_id, db)

    current_credits = get_user_credits(user_id, db)
    required_int = int(required_credits.quantize(Decimal("1"), rounding=ROUND_CEILING))
    return current_credits >= required_int


def deduct_credits(
    user_id: int,
    credits: Decimal,
    usage_log_id: int | None,
    db: Session,
    description: str | None = None,
) -> None:
    """Deduct credits with row-level locking. Creates audit trail."""
    credits_int = int(round(credits))

    # Use row-level locking for atomic update
    # SQLite and PostgreSQL handle this differently, so we use a generic approach
    user = db.query(User).filter(User.id == user_id).with_for_update().first()

    if not user:
        raise ValueError(f"User {user_id} not found")

    allocated = user.monthly_credits_allocated or 0
    used = user.credits_used_this_period or 0
    purchased = user.purchased_credits_balance or 0

    room_monthly = max(0, allocated - used)
    take_monthly = min(credits_int, room_monthly)
    remainder = credits_int - take_monthly

    user.credits_used_this_period = used + take_monthly
    if remainder > 0:
        user.purchased_credits_balance = max(0, purchased - remainder)

    user.total_credits_used = (user.total_credits_used or 0) + credits_int

    # Create credit transaction record
    # Store exact Decimal value in transaction (as integer representing millicredits for precision)
    credits_millicredits = int(credits * 1000)  # Store as millicredits for transaction precision
    transaction = CreditTransaction(
        user_id=user_id,
        transaction_type="usage",
        credits_amount=-credits_millicredits,  # Negative for usage, stored as millicredits
        description=description or f"Credits used for request ({float(credits):.4f} credits)",
        related_usage_log_id=usage_log_id,
    )
    db.add(transaction)

    db.commit()


def add_purchased_credits(
    user_id: int,
    credits: int,
    db: Session,
    description: str | None = None,
) -> None:
    """Add purchased credits (e.g. admin grant or legacy balance)."""
    if credits <= 0:
        return
    user = db.query(User).filter(User.id == user_id).with_for_update().first()
    if not user:
        raise ValueError(f"User {user_id} not found")
    user.purchased_credits_balance = (user.purchased_credits_balance or 0) + credits
    transaction = CreditTransaction(
        user_id=user_id,
        transaction_type="purchase",
        credits_amount=credits,
        description=description or "Purchased credits",
    )
    db.add(transaction)
    db.commit()


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

        # Allocate credits and reset usage
        user.monthly_credits_allocated = credits
        user.credits_used_this_period = 0

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
    purchased = user.purchased_credits_balance or 0
    remaining = max(0, allocated - used) + purchased
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

    return {
        "credits_allocated": allocated,
        "credits_used_this_period": used,
        "purchased_credits_balance": purchased,
        "credits_remaining": remaining,
        "total_credits_used": total_used,
        "credits_reset_at": reset_time_str,
        "billing_period_start": billing_period_start.isoformat() if billing_period_start else None,
        "billing_period_end": billing_period_end.isoformat() if billing_period_end else None,
        "period_type": period_type,
        "subscription_tier": tier,
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
