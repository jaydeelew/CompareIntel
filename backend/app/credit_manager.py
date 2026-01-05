"""
Credit management module for CompareIntel credits-based system.

This module provides functions for managing user credits including:
- Getting current credit balance
- Checking if user has sufficient credits
- Deducting credits for usage
- Allocating credits based on subscription tier
- Resetting credits (daily for free/anonymous, monthly for paid)
- Getting credit usage statistics

All operations use database transactions and row-level locking to ensure
atomicity and handle concurrent requests gracefully.
"""

from sqlalchemy.orm import Session
from sqlalchemy import select, update, func, desc
from decimal import Decimal, ROUND_CEILING
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, Optional
from .models import User, UsageLog, CreditTransaction
from .config.constants import (
    DAILY_CREDIT_LIMITS,
    MONTHLY_CREDIT_ALLOCATIONS,
)
import pytz


def get_user_credits(user_id: int, db: Session) -> int:
    """
    Get current credit balance for a user.

    Calculates: monthly_credits_allocated - credits_used_this_period

    Args:
        user_id: User ID
        db: Database session

    Returns:
        Current credit balance (remaining credits)
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise ValueError(f"User {user_id} not found")

    allocated = user.monthly_credits_allocated or 0
    used = user.credits_used_this_period or 0
    return max(0, allocated - used)


def check_credits_sufficient(user_id: int, required_credits: Decimal, db: Session) -> bool:
    """
    Check if user has sufficient credits for a request.

    Args:
        user_id: User ID
        required_credits: Credits needed for the request (as Decimal)
        db: Database session

    Returns:
        True if user has sufficient credits, False otherwise
    """
    # Check and reset credits if needed before checking balance
    check_and_reset_credits_if_needed(user_id, db)

    current_credits = get_user_credits(user_id, db)
    # Convert required_credits to int (round up to be conservative)
    required_int = int(required_credits.quantize(Decimal("1"), rounding=ROUND_CEILING))
    return current_credits >= required_int


def deduct_credits(
    user_id: int,
    credits: Decimal,
    usage_log_id: Optional[int],
    db: Session,
    description: Optional[str] = None,
) -> None:
    """
    Deduct credits from user's balance atomically.

    Uses row-level locking to prevent race conditions in concurrent requests.
    Creates a CreditTransaction record for audit trail.

    Args:
        user_id: User ID
        credits: Credits to deduct (as Decimal, e.g., 4.25)
        usage_log_id: Optional UsageLog ID this deduction is related to
        db: Database session
        description: Optional description for the transaction

    Raises:
        ValueError: If user doesn't have sufficient credits
    """
    # Convert Decimal to int (round to nearest integer for User model storage)
    # User model stores credits_used_this_period as Integer
    credits_int = int(round(credits))

    # Use row-level locking for atomic update
    # SQLite and PostgreSQL handle this differently, so we use a generic approach
    user = db.query(User).filter(User.id == user_id).with_for_update().first()

    if not user:
        raise ValueError(f"User {user_id} not found")

    # Calculate new credits_used_this_period
    allocated = user.monthly_credits_allocated or 0
    used = user.credits_used_this_period or 0
    new_used = used + credits_int

    # Cap credits_used_this_period at allocated amount (zero out credits, don't go negative)
    # This allows comparisons to proceed even if they exceed remaining credits
    if new_used > allocated:
        user.credits_used_this_period = allocated
        # Still track actual usage in total_credits_used for analytics
        user.total_credits_used = (user.total_credits_used or 0) + credits_int
    else:
        # Normal deduction - credits are sufficient
        user.credits_used_this_period = new_used
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


def allocate_monthly_credits(user_id: int, tier: str, db: Session) -> None:
    """
    Allocate monthly credits to a user based on their subscription tier.

    For paid tiers: Allocates monthly credits and sets billing period.
    For free/anonymous tiers: Allocates daily credits (handled by reset_daily_credits).

    Args:
        user_id: User ID
        tier: Subscription tier
        db: Database session
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise ValueError(f"User {user_id} not found")

    # Get credit allocation for tier
    if tier in MONTHLY_CREDIT_ALLOCATIONS:
        credits = MONTHLY_CREDIT_ALLOCATIONS[tier]

        # Set billing period (monthly for paid tiers)
        now = datetime.now(timezone.utc)
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
        # Free/anonymous tiers use daily limits (handled by reset_daily_credits)
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
    """
    Get user's timezone preference, defaulting to UTC.

    Args:
        user: User object

    Returns:
        IANA timezone string (e.g., "America/Chicago")
    """
    if user.preferences and user.preferences.timezone:
        try:
            pytz.timezone(user.preferences.timezone)
            return user.preferences.timezone
        except (pytz.exceptions.UnknownTimeZoneError, AttributeError):
            pass
    return "UTC"


def _get_next_local_midnight(timezone_str: str) -> datetime:
    """
    Get the next midnight in the specified timezone, converted to UTC.

    Args:
        timezone_str: IANA timezone string

    Returns:
        UTC datetime representing next midnight in the timezone
    """
    tz = pytz.timezone(timezone_str)
    now_local = datetime.now(tz)
    # Get next midnight in local timezone
    tomorrow_local = (now_local + timedelta(days=1)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    # Convert to UTC for storage
    return tomorrow_local.astimezone(timezone.utc)


def _can_reset_user_credits(user_id: int, db: Session, min_hours_between_resets: int = 20) -> bool:
    """
    Check if user credits can be reset (safeguard against abuse).

    Prevents multiple resets within a short time period by checking the last allocation transaction.

    Args:
        user_id: User ID
        db: Database session
        min_hours_between_resets: Minimum hours between resets (default 20)

    Returns:
        True if reset is allowed, False otherwise
    """
    # Find the most recent allocation transaction
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

    now = datetime.now(timezone.utc)
    # Make created_at timezone-aware (SQLite stores as naive UTC)
    created_at = (
        last_allocation.created_at.replace(tzinfo=timezone.utc)
        if last_allocation.created_at.tzinfo is None
        else last_allocation.created_at
    )
    hours_since_reset = (now - created_at).total_seconds() / 3600
    return hours_since_reset >= min_hours_between_resets


def reset_daily_credits(user_id: int, tier: str, db: Session, force: bool = False) -> None:
    """
    Reset daily credits for free/anonymous tier users.

    Resets credits at midnight in the user's local timezone.
    Includes abuse prevention to prevent multiple resets within a short period.

    Args:
        user_id: User ID
        tier: Subscription tier (should be 'unregistered' or 'free')
        db: Database session
        force: If True, bypass abuse prevention check (for admin resets)
    """
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


def get_credit_usage_stats(user_id: int, db: Session) -> Dict[str, Any]:
    """
    Get comprehensive credit usage statistics for a user.

    Args:
        user_id: User ID
        db: Database session

    Returns:
        Dictionary with credit usage statistics
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise ValueError(f"User {user_id} not found")

    allocated = user.monthly_credits_allocated or 0
    used = user.credits_used_this_period or 0
    remaining = max(0, allocated - used)
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
        "credits_remaining": remaining,
        "total_credits_used": total_used,
        "credits_reset_at": reset_time_str,
        "billing_period_start": billing_period_start.isoformat() if billing_period_start else None,
        "billing_period_end": billing_period_end.isoformat() if billing_period_end else None,
        "period_type": period_type,
        "subscription_tier": tier,
    }


def ensure_credits_allocated(user_id: int, db: Session) -> None:
    """
    Ensure user has credits allocated based on their tier.
    Called when user makes first request or after tier change.

    Args:
        user_id: User ID
        db: Database session
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise ValueError(f"User {user_id} not found")

    tier = user.subscription_tier or "free"

    # Check if credits need to be allocated
    if user.monthly_credits_allocated is None or user.monthly_credits_allocated == 0:
        if tier in MONTHLY_CREDIT_ALLOCATIONS:
            allocate_monthly_credits(user_id, tier, db)
        elif tier in DAILY_CREDIT_LIMITS:
            # Set daily credits and reset time based on user's timezone
            credits = DAILY_CREDIT_LIMITS[tier]
            user_timezone = _get_user_timezone(user)
            next_midnight_utc = _get_next_local_midnight(user_timezone)
            user.credits_reset_at = next_midnight_utc
            user.monthly_credits_allocated = credits
            user.credits_used_this_period = 0
            db.commit()


def check_and_reset_credits_if_needed(user_id: int, db: Session) -> None:
    """
    Check if credits need to be reset based on reset time, and reset if needed.
    Called before checking credit balance to ensure fresh credits are available.

    Args:
        user_id: User ID
        db: Database session
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return

    tier = user.subscription_tier or "free"

    # Check if reset is needed
    if user.credits_reset_at:
        now = datetime.now(timezone.utc)
        # Make credits_reset_at timezone-aware (SQLite stores as naive UTC)
        reset_at = (
            user.credits_reset_at.replace(tzinfo=timezone.utc)
            if user.credits_reset_at.tzinfo is None
            else user.credits_reset_at
        )
        if now >= reset_at:
            # Reset needed - reset time has passed
            if tier in DAILY_CREDIT_LIMITS:
                reset_daily_credits(user_id, tier, db)
            elif tier in MONTHLY_CREDIT_ALLOCATIONS:
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
                allocate_monthly_credits(user_id, tier, db)
        else:
            # Credits are allocated and not exhausted, but no reset time set
            # Set the reset time based on tier
            ensure_credits_allocated(user_id, db)
