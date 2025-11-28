"""
Hybrid rate limiting for authenticated and anonymous users.

This module provides rate limiting functionality that works with both
authenticated users (subscription-based limits) and anonymous users
(IP/fingerprint-based limits).

CREDITS-BASED SYSTEM:
- Authenticated users: Credit-based monthly allocations (paid tiers) or daily limits (free tier)
- Anonymous users: Credit-based daily limits
- All rate limiting uses credits instead of model responses
"""

from datetime import datetime, date, timezone
from typing import Optional, Tuple, Dict, Any
from sqlalchemy.orm import Session
from decimal import Decimal, ROUND_CEILING
from .models import User, UsageLog
from sqlalchemy import func
from collections import defaultdict
from .types import (
    UsageStatsDict,
    FullUsageStatsDict,
    AnonymousRateLimitData,
)

# Import configuration constants
from .config import (
    SUBSCRIPTION_CONFIG,
    SUBSCRIPTION_LIMITS,
    MODEL_LIMITS,
    ANONYMOUS_DAILY_LIMIT,
    ANONYMOUS_MODEL_LIMIT,
    get_model_limit,
    get_daily_limit,
)

# Import credit management functions
from .credit_manager import (
    get_user_credits,
    check_credits_sufficient,
    deduct_credits,
    get_credit_usage_stats,
    check_and_reset_credits_if_needed,
    ensure_credits_allocated,
)
from .config.constants import (
    DAILY_CREDIT_LIMITS,
    MONTHLY_CREDIT_ALLOCATIONS,
)


# In-memory storage for anonymous rate limiting
# Structure: { "identifier": { "count": int, "date": str, "first_seen": datetime } }
# CREDITS-BASED: Now stores credits used instead of model responses
def _default_rate_limit_data() -> AnonymousRateLimitData:
    """Default factory for anonymous rate limit storage."""
    return {"count": 0, "date": "", "first_seen": None}


anonymous_rate_limit_storage: Dict[str, AnonymousRateLimitData] = defaultdict(_default_rate_limit_data)

# ============================================================================
# CREDITS-BASED RATE LIMITING FUNCTIONS
# ============================================================================
# Credit-based functions for rate limiting


def check_user_credits(user: User, required_credits: Decimal, db: Session) -> Tuple[bool, int, int]:
    """
    Check if authenticated user has sufficient credits for a request.

    CREDITS-BASED: Replaces check_user_rate_limit() for credit-based system.

    Args:
        user: Authenticated user object
        required_credits: Credits needed for the request (as Decimal)
        db: Database session

    Returns:
        tuple: (is_allowed, credits_remaining, credits_allocated)
    """
    # IMPORTANT: Check and reset credits FIRST if reset time has passed,
    # then ensure credits are allocated (in case they weren't allocated yet)
    check_and_reset_credits_if_needed(user.id, db)
    ensure_credits_allocated(user.id, db)

    # Refresh user to get latest credit data
    db.refresh(user)

    # Check if user has sufficient credits
    is_sufficient = check_credits_sufficient(user.id, required_credits, db)

    allocated = user.monthly_credits_allocated or 0
    used = user.credits_used_this_period or 0
    remaining = max(0, allocated - used)

    return is_sufficient, remaining, allocated


def deduct_user_credits(
    user: User, credits: Decimal, usage_log_id: Optional[int], db: Session, description: Optional[str] = None
) -> None:
    """
    Deduct credits from authenticated user's balance.

    CREDITS-BASED: Replaces increment_user_usage() for credit-based system.

    Args:
        user: Authenticated user object
        credits: Credits to deduct (as Decimal)
        usage_log_id: Optional UsageLog ID this deduction is related to
        db: Database session
        description: Optional description for the transaction
    """
    deduct_credits(user.id, credits, usage_log_id, db, description)


def check_anonymous_credits(identifier: str, required_credits: Decimal, db: Optional[Session] = None) -> Tuple[bool, int, int]:
    """
    Check if anonymous user has sufficient credits for a request.

    CREDITS-BASED: Replaces check_anonymous_rate_limit() for credit-based system.
    Uses in-memory storage to track daily credits for anonymous users.
    If db session is provided, syncs with database first (persists across restarts).

    Args:
        identifier: Unique identifier (e.g., "ip:192.168.1.1" or "fp:xxx")
        required_credits: Credits needed for the request (as Decimal)
        db: Optional database session to sync credits from database

    Returns:
        tuple: (is_allowed, credits_remaining, credits_allocated)
    """
    today = datetime.now(timezone.utc).date().isoformat()
    user_data = anonymous_rate_limit_storage[identifier]

    # Sync with database if db session is provided (for persistence across restarts)
    if db is not None:
        # Extract IP or fingerprint from identifier
        if identifier.startswith("ip:"):
            ip_address = identifier[3:]  # Remove "ip:" prefix
            # Query UsageLog for credits used today
            # Use func.date() for SQLite compatibility (CAST AS DATE doesn't work properly in SQLite)
            today_date = datetime.now(timezone.utc).date().isoformat()  # Format as 'YYYY-MM-DD'
            credits_query = db.query(func.sum(UsageLog.credits_used)).filter(
                UsageLog.user_id.is_(None),  # Anonymous users only
                UsageLog.ip_address == ip_address,
                func.date(UsageLog.created_at) == today_date,
                UsageLog.credits_used.isnot(None),
            )
            db_credits_used = credits_query.scalar() or Decimal(0)
            # Sync memory with database (round UP to be conservative - never give free credits)
            user_data["count"] = int(db_credits_used.quantize(Decimal('1'), rounding=ROUND_CEILING)) if db_credits_used > 0 else 0
            user_data["date"] = today
            if not user_data.get("first_seen"):
                user_data["first_seen"] = datetime.now(timezone.utc)
        elif identifier.startswith("fp:"):
            fingerprint = identifier[3:]  # Remove "fp:" prefix
            # Query UsageLog for credits used today
            # Use func.date() for SQLite compatibility (CAST AS DATE doesn't work properly in SQLite)
            today_date = datetime.now(timezone.utc).date().isoformat()  # Format as 'YYYY-MM-DD'
            credits_query = db.query(func.sum(UsageLog.credits_used)).filter(
                UsageLog.user_id.is_(None),  # Anonymous users only
                UsageLog.browser_fingerprint == fingerprint,
                func.date(UsageLog.created_at) == today_date,
                UsageLog.credits_used.isnot(None),
            )
            db_credits_used = credits_query.scalar() or Decimal(0)
            # Sync memory with database (round UP to be conservative - never give free credits)
            user_data["count"] = int(db_credits_used.quantize(Decimal('1'), rounding=ROUND_CEILING)) if db_credits_used > 0 else 0
            user_data["date"] = today
            if not user_data.get("first_seen"):
                user_data["first_seen"] = datetime.now(timezone.utc)

    # Reset credits if it's a new day
    if user_data["date"] != today:
        user_data["count"] = 0  # Credits used (stored as integer)
        user_data["date"] = today
        if not user_data.get("first_seen"):
            user_data["first_seen"] = datetime.now(timezone.utc)

    # Get daily credit limit for anonymous users
    credits_allocated = DAILY_CREDIT_LIMITS.get("anonymous", 50)
    credits_used = user_data["count"]
    credits_remaining = max(0, credits_allocated - credits_used)

    # Convert required_credits to int (round up to be conservative)
    required_int = int(required_credits.quantize(Decimal("1"), rounding=ROUND_CEILING))

    is_allowed = credits_remaining >= required_int

    return is_allowed, credits_remaining, credits_allocated


def deduct_anonymous_credits(identifier: str, credits: Decimal) -> None:
    """
    Deduct credits from anonymous user's daily balance.

    CREDITS-BASED: Replaces increment_anonymous_usage() for credit-based system.
    Credits are capped at allocated amount (50 for anonymous) - zero out instead of going negative.

    Args:
        identifier: Unique identifier (e.g., "ip:192.168.1.1" or "fp:xxx")
        credits: Credits to deduct (as Decimal)
    """
    from .config.constants import DAILY_CREDIT_LIMITS
    
    today = datetime.now(timezone.utc).date().isoformat()
    user_data = anonymous_rate_limit_storage[identifier]

    # Reset if new day
    if user_data["date"] != today:
        user_data["count"] = 0
        user_data["date"] = today
        user_data["first_seen"] = datetime.now(timezone.utc)

    # Convert Decimal to int (round UP to be conservative - never give free credits)
    # Use ceiling to ensure we always deduct at least 1 credit for any usage
    credits_int = int(credits.quantize(Decimal('1'), rounding=ROUND_CEILING))
    
    # Get allocated amount for anonymous users (50 credits)
    allocated = DAILY_CREDIT_LIMITS.get("anonymous", 50)
    
    # Cap credits at allocated amount (zero out, don't go negative)
    new_count = user_data["count"] + credits_int
    user_data["count"] = min(new_count, allocated)
    
    print(f"[DEBUG] deduct_anonymous_credits - {identifier}: deducted {credits_int} credits (from {float(credits):.4f}), new count: {user_data['count']} (capped at {allocated})")


def get_user_usage_stats(user: User) -> FullUsageStatsDict:
    """
    Get usage statistics for authenticated user.

    CREDITS-BASED: Returns credit-based statistics.
    Legacy model-response fields maintained for backward compatibility in API responses.

    Args:
        user: Authenticated user object

    Returns:
        dict: Usage statistics including credits and legacy daily usage fields
    """
    # Get credit-based stats
    tier = user.subscription_tier or "free"
    allocated = user.monthly_credits_allocated or 0
    used = user.credits_used_this_period or 0
    remaining = max(0, allocated - used)

    # Get reset time
    reset_at = user.credits_reset_at
    reset_date = reset_at.date() if reset_at else date.today()

    # Legacy fields (for backward compatibility in API responses)
    daily_limit = get_daily_limit(tier)
    # Approximate conversion: credits_used / 5 (since average exchange is ~5 credits)
    daily_usage = int(used / 5) if used > 0 else 0
    daily_remaining = max(0, daily_limit - daily_usage)

    return {
        # Credits-based fields (primary)
        "credits_allocated": allocated,
        "credits_used_this_period": used,
        "credits_remaining": remaining,
        "credits_reset_date": reset_date.isoformat(),
        # Legacy fields (for backward compatibility in API responses)
        "daily_usage": daily_usage,
        "daily_limit": daily_limit,
        "remaining_usage": daily_remaining,
        "subscription_tier": tier,
        "usage_reset_date": reset_date.isoformat(),
    }


def get_anonymous_usage_stats(identifier: str) -> UsageStatsDict:
    """
    Get usage statistics for anonymous user.

    CREDITS-BASED: Returns credit-based statistics.
    Legacy model-response fields maintained for backward compatibility in API responses.

    Args:
        identifier: Unique identifier

    Returns:
        dict: Usage statistics including credits and legacy daily usage
    """
    # Get credit-based stats
    credits_allocated = DAILY_CREDIT_LIMITS.get("anonymous", 50)
    today = datetime.now(timezone.utc).date().isoformat()
    user_data = anonymous_rate_limit_storage[identifier]

    # Reset if new day
    if user_data["date"] != today:
        credits_used = 0
    else:
        credits_used = user_data["count"]

    credits_remaining = max(0, credits_allocated - credits_used)

    # Legacy fields (for backward compatibility in API responses)
    # Calculate legacy daily_usage from credits (approximate: 1 credit ≈ 0.2 model responses)
    # This is only for API compatibility, actual limiting uses credits
    daily_limit = ANONYMOUS_DAILY_LIMIT
    # Approximate conversion: credits_used / 5 (since average exchange is ~5 credits)
    current_count = int(credits_used / 5) if credits_used > 0 else 0
    remaining = max(0, daily_limit - current_count)

    return {
        # Credits-based fields (primary)
        "credits_allocated": credits_allocated,
        "credits_used_today": credits_used,
        "credits_remaining": credits_remaining,
        # Legacy fields (for backward compatibility in API responses)
        "daily_usage": current_count,
        "daily_limit": daily_limit,
        "remaining_usage": remaining,
        "subscription_tier": "anonymous",
        "usage_reset_date": date.today().isoformat(),
    }


def should_send_usage_warning(user: User) -> bool:
    """
    Check if usage warning email should be sent to user.

    Sends warning at 80% of credit allocation.

    Args:
        user: Authenticated user object

    Returns:
        bool: True if warning should be sent
    """
    # Check credits usage for warning threshold
    credits_used = user.credits_used_this_period or 0
    credits_allocated = user.monthly_credits_allocated or 0
    warning_threshold_credits = int(credits_allocated * 0.8)  # 80% of credits
    return credits_used == warning_threshold_credits


def reset_anonymous_rate_limits() -> None:
    """
    Clear all anonymous rate limit storage.

    WARNING: This is for development/testing only.
    In production, rate limits reset automatically at midnight.
    """
    anonymous_rate_limit_storage.clear()


# get_model_limit is now imported from config module


def is_overage_allowed(tier: str) -> bool:
    """
    Check if overage is allowed for a tier.

    Args:
        tier: Subscription tier name

    Returns:
        bool: True if overage is allowed, False otherwise
    """
    config = SUBSCRIPTION_CONFIG.get(tier, {})
    return config.get("overage_allowed", False)


def get_overage_price(tier: str) -> Optional[float]:
    """
    Get overage price per model response for a tier.

    Args:
        tier: Subscription tier name

    Returns:
        float: Price per overage model response, or None if overages not allowed
    """
    config = SUBSCRIPTION_CONFIG.get(tier, {})
    return config.get("overage_price")


def get_extended_overage_price(tier: str) -> Optional[float]:
    """
    Get extended overage price per extended interaction for a tier.

    Args:
        tier: Subscription tier name

    Returns:
        float: Price per overage extended interaction, or None if overages not allowed
    """
    config = SUBSCRIPTION_CONFIG.get(tier, {})
    return config.get("extended_overage_price")


def get_tier_config(tier: str) -> Dict[str, Any]:  # TODO: Use TierConfigDict when config.py uses TypedDict
    """
    Get complete configuration for a tier.

    Args:
        tier: Subscription tier name

    Returns:
        dict: Tier configuration
    """
    return SUBSCRIPTION_CONFIG.get(tier, SUBSCRIPTION_CONFIG["free"])


def get_rate_limit_info() -> Dict[str, Any]:
    """
    Get information about all rate limits (for debugging).

    Returns:
        dict: Information about subscription tiers and anonymous limits
    """
    return {
        "subscription_tiers": SUBSCRIPTION_LIMITS,
        "model_limits": MODEL_LIMITS,
        "anonymous_limit": ANONYMOUS_DAILY_LIMIT,
        "anonymous_users_tracked": len(anonymous_rate_limit_storage),
    }


