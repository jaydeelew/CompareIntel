"""
Credit-based usage for authenticated and unregistered users.

Paid tiers: monthly credit pools. Free and unregistered: daily credit limits.
Legacy daily model-response fields in API stats are unused (zeros); enforcement is credits-only.

STATELESS DESIGN: Anonymous rate limiting uses Redis when available, with automatic
fallback to in-memory storage. This enables horizontal scaling across workers/replicas.
"""

import json
import logging
from collections import defaultdict
from datetime import UTC, date, datetime, timedelta
from decimal import ROUND_CEILING, Decimal
from typing import Any

import pytz
from sqlalchemy import func
from sqlalchemy.orm import Session

# Import configuration constants
from .config import MODEL_LIMITS, SUBSCRIPTION_CONFIG
from .config.constants import (
    DAILY_CREDIT_LIMITS,
    MONTHLY_CREDIT_ALLOCATIONS,
)

# Import credit management functions
from .credit_manager import (
    check_and_reset_credits_if_needed,
    check_credits_sufficient,
    deduct_credits,
    ensure_credits_allocated,
)
from .models import UsageLog, User
from .redis_client import get_redis_client
from .type_defs import (
    AnonymousRateLimitData,
    FullUsageStatsDict,
    UsageStatsDict,
)

logger = logging.getLogger(__name__)


# In-memory storage for anonymous rate limiting (fallback when Redis unavailable)
# Structure: { "identifier": { "count": int, "date": str, "first_seen": datetime, "timezone": str, "last_reset_at": datetime } }
def _default_rate_limit_data() -> AnonymousRateLimitData:
    """Default factory for anonymous rate limit storage."""
    return {"count": 0, "date": "", "first_seen": None, "timezone": "UTC", "last_reset_at": None}


anonymous_rate_limit_storage: dict[str, AnonymousRateLimitData] = defaultdict(
    _default_rate_limit_data
)


def _validate_timezone(timezone_str: str) -> str:
    """
    Validate and return a timezone string, defaulting to UTC if invalid.

    Args:
        timezone_str: IANA timezone string (e.g., "America/Chicago")

    Returns:
        Valid timezone string (defaults to "UTC" if invalid)
    """
    try:
        pytz.timezone(timezone_str)
        return timezone_str
    except (pytz.exceptions.UnknownTimeZoneError, AttributeError):
        return "UTC"


def _get_local_date(timezone_str: str) -> str:
    """
    Get today's date string (YYYY-MM-DD) in the specified timezone.

    Args:
        timezone_str: IANA timezone string

    Returns:
        Date string in YYYY-MM-DD format
    """
    tz = pytz.timezone(_validate_timezone(timezone_str))
    now_local = datetime.now(tz)
    return now_local.date().isoformat()


def _get_next_local_midnight(timezone_str: str) -> datetime:
    """
    Get the next midnight in the specified timezone, converted to UTC.

    Args:
        timezone_str: IANA timezone string

    Returns:
        UTC datetime representing next midnight in the timezone
    """
    tz = pytz.timezone(_validate_timezone(timezone_str))
    now_local = datetime.now(tz)
    # Get next midnight in local timezone
    tomorrow_local = (now_local + timedelta(days=1)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    # Convert to UTC for storage
    return tomorrow_local.astimezone(UTC)


def _can_reset_credits(last_reset_at: datetime | None, min_hours_between_resets: int = 20) -> bool:
    """
    Check if credits can be reset (safeguard against abuse).

    Prevents multiple resets within a short time period (e.g., by changing timezone).

    Args:
        last_reset_at: UTC timestamp of last reset (None if never reset)
        min_hours_between_resets: Minimum hours between resets (default 20 to allow for timezone changes)

    Returns:
        True if reset is allowed, False otherwise
    """
    if last_reset_at is None:
        return True

    now = datetime.now(UTC)
    hours_since_reset = (now - last_reset_at).total_seconds() / 3600
    return hours_since_reset >= min_hours_between_resets


def _get_redis_rate_limit_data(identifier: str) -> AnonymousRateLimitData | None:
    """
    Get anonymous rate limit data from Redis.

    Args:
        identifier: Unique identifier (e.g., "ip:192.168.1.1")

    Returns:
        Rate limit data dict or None if Redis unavailable or key not found
    """
    redis_client = get_redis_client()
    if not redis_client or not redis_client.is_available:
        return None

    try:
        with redis_client.get_sync_connection() as conn:
            if not conn:
                return None

            key = f"rate_limit:anon:{identifier}"
            data = conn.get(key)
            if not data:
                return None

            parsed = json.loads(data)
            if "first_seen" in parsed and parsed["first_seen"]:
                parsed["first_seen"] = datetime.fromisoformat(parsed["first_seen"])
            if "last_reset_at" in parsed and parsed["last_reset_at"]:
                parsed["last_reset_at"] = datetime.fromisoformat(parsed["last_reset_at"])

            return parsed
    except Exception as e:
        logger.warning(f"Failed to get rate limit data from Redis for {identifier}: {e}")
        return None


def _set_redis_rate_limit_data(identifier: str, data: AnonymousRateLimitData) -> bool:
    """
    Set anonymous rate limit data in Redis with TTL.

    Args:
        identifier: Unique identifier
        data: Rate limit data to store

    Returns:
        True if successful, False otherwise
    """
    redis_client = get_redis_client()
    if not redis_client or not redis_client.is_available:
        return False

    try:
        with redis_client.get_sync_connection() as conn:
            if not conn:
                return False

            key = f"rate_limit:anon:{identifier}"
            serializable_data = data.copy()

            if "first_seen" in serializable_data and serializable_data["first_seen"]:
                serializable_data["first_seen"] = serializable_data["first_seen"].isoformat()
            if "last_reset_at" in serializable_data and serializable_data["last_reset_at"]:
                serializable_data["last_reset_at"] = serializable_data["last_reset_at"].isoformat()

            conn.set(key, json.dumps(serializable_data), ex=172800)
            return True
    except Exception as e:
        logger.warning(f"Failed to set rate limit data in Redis for {identifier}: {e}")
        return False


def _incr_redis_credits(identifier: str, credits_to_add: int, timezone_str: str, date_str: str) -> tuple[int, bool]:
    """
    Atomically increment credits in Redis using a Lua script for consistency.

    Args:
        identifier: Unique identifier
        credits_to_add: Credits to add
        timezone_str: Timezone string
        date_str: Date string (YYYY-MM-DD)

    Returns:
        Tuple of (new_count, success)
    """
    redis_client = get_redis_client()
    if not redis_client or not redis_client.is_available:
        return (0, False)

    try:
        with redis_client.get_sync_connection() as conn:
            if not conn:
                return (0, False)

            key = f"rate_limit:anon:{identifier}"
            allocated = DAILY_CREDIT_LIMITS.get("unregistered", 50)

            lua_script = """
            local key = KEYS[1]
            local credits_to_add = tonumber(ARGV[1])
            local allocated = tonumber(ARGV[2])
            local timezone = ARGV[3]
            local date = ARGV[4]
            local now = ARGV[5]

            local data = redis.call('GET', key)
            local current_count = 0
            local stored_date = ""
            local stored_timezone = timezone
            local first_seen = now
            local last_reset_at = nil

            if data then
                local parsed = cjson.decode(data)
                current_count = tonumber(parsed.count) or 0
                stored_date = parsed.date or ""
                stored_timezone = parsed.timezone or timezone
                first_seen = parsed.first_seen or now
                last_reset_at = parsed.last_reset_at
            end

            if stored_date ~= date then
                current_count = 0
                last_reset_at = now
            end

            local new_count = math.min(current_count + credits_to_add, allocated)

            local new_data = {
                count = new_count,
                date = date,
                timezone = timezone,
                first_seen = first_seen,
                last_reset_at = last_reset_at
            }

            redis.call('SET', key, cjson.encode(new_data), 'EX', 172800)
            return new_count
            """

            now_iso = datetime.now(UTC).isoformat()
            result = conn.eval(lua_script, 1, key, credits_to_add, allocated, timezone_str, date_str, now_iso)
            return (int(result), True)
    except Exception as e:
        logger.warning(f"Failed to increment credits in Redis for {identifier}: {e}")
        return (0, False)


def check_user_credits(user: User, required_credits: Decimal, db: Session) -> tuple[bool, int, int]:
    """
    Check if authenticated user has sufficient credits for a request.

    Args:
        user: Authenticated user object
        required_credits: Credits needed for the request (as Decimal)
        db: Database session

    Returns:
        tuple: (is_allowed, credits_remaining, credits_allocated)
    """
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
    user: User,
    credits: Decimal,
    usage_log_id: int | None,
    db: Session,
    description: str | None = None,
) -> None:
    """
    Deduct credits from authenticated user's balance.

    Args:
        user: Authenticated user object
        credits: Credits to deduct (as Decimal)
        usage_log_id: Optional UsageLog ID this deduction is related to
        db: Database session
        description: Optional description for the transaction
    """
    deduct_credits(user.id, credits, usage_log_id, db, description)


def check_anonymous_credits(
    identifier: str, required_credits: Decimal, timezone_str: str = "UTC", db: Session | None = None
) -> tuple[bool, int, int]:
    """
    Check if unregistered user has sufficient credits for a request.

    Uses Redis when available for distributed rate limiting across workers/replicas.
    Falls back to in-memory storage when Redis is unavailable.
    If db is provided, syncs with database for persistence.

    Args:
        identifier: Unique identifier (e.g., "ip:192.168.1.1" or "fp:xxx")
        required_credits: Credits needed for the request (as Decimal)
        timezone_str: IANA timezone string (e.g., "America/Chicago"), defaults to "UTC"
        db: Optional database session to sync credits from database

    Returns:
        tuple: (is_allowed, credits_remaining, credits_allocated)
    """
    # Validate and normalize timezone
    timezone_str = _validate_timezone(timezone_str)

    # Get today's date in user's timezone
    today = _get_local_date(timezone_str)

    # Try Redis first for distributed state
    redis_data = _get_redis_rate_limit_data(identifier)
    use_redis = redis_data is not None or (get_redis_client() and get_redis_client().is_available)

    if use_redis and redis_data:
        user_data = redis_data
    else:
        user_data = anonymous_rate_limit_storage[identifier]

    # Initialize timezone if not set
    if not user_data.get("timezone"):
        user_data["timezone"] = timezone_str

    # Sync with database if db session is provided (for persistence across restarts)
    # Skip sync if admin reset flag is set (prevents overwriting admin reset)
    if db is not None and not user_data.get("_admin_reset", False):
        # Extract IP or fingerprint from identifier
        if identifier.startswith("ip:"):
            ip_address = identifier[3:]  # Remove "ip:" prefix
            # Query UsageLog for credits used today in user's timezone
            # Note: Database queries use UTC dates, but we filter by UTC date range that covers the local day
            tz = pytz.timezone(timezone_str)
            now_local = datetime.now(tz)
            today_start_utc = now_local.replace(
                hour=0, minute=0, second=0, microsecond=0
            ).astimezone(UTC)
            today_end_utc = (
                (now_local + timedelta(days=1))
                .replace(hour=0, minute=0, second=0, microsecond=0)
                .astimezone(UTC)
            )

            credits_query = db.query(func.sum(UsageLog.credits_used)).filter(
                UsageLog.user_id.is_(None),  # Unregistered users only
                UsageLog.ip_address == ip_address,
                UsageLog.created_at >= today_start_utc,
                UsageLog.created_at < today_end_utc,
                UsageLog.credits_used.isnot(None),
            )
            db_credits_used = credits_query.scalar() or Decimal(0)
            # Sync memory with database (round UP to be conservative - never give free credits)
            user_data["count"] = (
                int(db_credits_used.quantize(Decimal("1"), rounding=ROUND_CEILING))
                if db_credits_used > 0
                else 0
            )
            user_data["date"] = today
            if not user_data.get("first_seen"):
                user_data["first_seen"] = datetime.now(UTC)
            print(
                f"[SYNC] {identifier}: synced from DB, credits_used={db_credits_used}, count={user_data['count']}, date_range={today_start_utc} to {today_end_utc}"
            )
        elif identifier.startswith("fp:"):
            fingerprint = identifier[3:]  # Remove "fp:" prefix
            # Query UsageLog for credits used today in user's timezone
            tz = pytz.timezone(timezone_str)
            now_local = datetime.now(tz)
            today_start_utc = now_local.replace(
                hour=0, minute=0, second=0, microsecond=0
            ).astimezone(UTC)
            today_end_utc = (
                (now_local + timedelta(days=1))
                .replace(hour=0, minute=0, second=0, microsecond=0)
                .astimezone(UTC)
            )

            credits_query = db.query(func.sum(UsageLog.credits_used)).filter(
                UsageLog.user_id.is_(None),  # Unregistered users only
                UsageLog.browser_fingerprint == fingerprint,
                UsageLog.created_at >= today_start_utc,
                UsageLog.created_at < today_end_utc,
                UsageLog.credits_used.isnot(None),
            )
            db_credits_used = credits_query.scalar() or Decimal(0)
            # Sync memory with database (round UP to be conservative - never give free credits)
            user_data["count"] = (
                int(db_credits_used.quantize(Decimal("1"), rounding=ROUND_CEILING))
                if db_credits_used > 0
                else 0
            )
            user_data["date"] = today
            if not user_data.get("first_seen"):
                user_data["first_seen"] = datetime.now(UTC)
            print(
                f"[SYNC] {identifier}: synced from DB, credits_used={db_credits_used}, count={user_data['count']}, date_range={today_start_utc} to {today_end_utc}"
            )
    elif db is not None and user_data.get("_admin_reset", False):
        print(
            f"[SYNC] {identifier}: skipping sync due to admin reset flag, count={user_data.get('count', 0)}"
        )

    # Check if timezone changed (user might be traveling or using VPN)
    stored_timezone = user_data.get("timezone", "UTC")
    if stored_timezone != timezone_str:
        # Timezone changed - check if we can reset (abuse prevention)
        if _can_reset_credits(user_data.get("last_reset_at")):
            # Allow timezone change, update stored timezone
            user_data["timezone"] = timezone_str
            # Check if it's a new day in the new timezone
            if user_data["date"] != today:
                user_data["count"] = 0
                user_data["date"] = today
                user_data["last_reset_at"] = datetime.now(UTC)
        else:
            # Too soon to reset - keep using old timezone for now
            timezone_str = stored_timezone
            today = _get_local_date(timezone_str)

    # Reset credits if it's a new day in user's timezone (with abuse prevention)
    if user_data["date"] != today:
        # Check if reset is allowed (prevent abuse)
        if _can_reset_credits(user_data.get("last_reset_at")):
            user_data["count"] = 0  # Credits used (stored as integer)
            user_data["date"] = today
            user_data["timezone"] = timezone_str
            user_data["last_reset_at"] = datetime.now(UTC)
            if not user_data.get("first_seen"):
                user_data["first_seen"] = datetime.now(UTC)

    # Get daily credit limit for unregistered users
    credits_allocated = DAILY_CREDIT_LIMITS.get("unregistered", 50)
    credits_used = user_data["count"]
    credits_remaining = max(0, credits_allocated - credits_used)

    # Convert required_credits to int (round up to be conservative)
    required_int = int(required_credits.quantize(Decimal("1"), rounding=ROUND_CEILING))

    is_allowed = credits_remaining >= required_int

    # Clear admin reset flag after first check (allows normal syncing going forward)
    if user_data.get("_admin_reset", False):
        print(
            f"[CHECK] {identifier}: admin reset flag cleared after check, credits_used={credits_used}, credits_remaining={credits_remaining}, is_allowed={is_allowed}"
        )
        user_data.pop("_admin_reset", None)

    # Save updated data back to Redis if using Redis
    if use_redis:
        _set_redis_rate_limit_data(identifier, user_data)

    return is_allowed, credits_remaining, credits_allocated


def deduct_anonymous_credits(identifier: str, credits: Decimal, timezone_str: str = "UTC") -> None:
    """
    Deduct credits from unregistered user's daily balance.

    Uses Redis for atomic operations when available, falls back to in-memory storage.
    Credits are capped at allocated amount (50 for unregistered).

    Args:
        identifier: Unique identifier (e.g., "ip:192.168.1.1" or "fp:xxx")
        credits: Credits to deduct (as Decimal)
        timezone_str: IANA timezone string (e.g., "America/Chicago"), defaults to "UTC"
    """
    from .config.constants import DAILY_CREDIT_LIMITS

    # Validate and normalize timezone
    timezone_str = _validate_timezone(timezone_str)

    # Get today's date in user's timezone
    today = _get_local_date(timezone_str)

    # Convert Decimal to int (round UP to be conservative - never give free credits)
    credits_int = int(credits.quantize(Decimal("1"), rounding=ROUND_CEILING))

    # Try Redis atomic increment first
    new_count, redis_success = _incr_redis_credits(identifier, credits_int, timezone_str, today)
    if redis_success:
        allocated = DAILY_CREDIT_LIMITS.get("unregistered", 50)
        logger.debug(
            f"[REDIS] deduct_anonymous_credits - {identifier}: deducted {credits_int} credits "
            f"(from {float(credits):.4f}), new count: {new_count} (capped at {allocated})"
        )
        return

    # Fallback to in-memory storage
    user_data = anonymous_rate_limit_storage[identifier]

    # Initialize timezone if not set
    if not user_data.get("timezone"):
        user_data["timezone"] = timezone_str

    # Reset if new day in user's timezone (with abuse prevention)
    stored_timezone = user_data.get("timezone", "UTC")
    if stored_timezone != timezone_str:
        # Timezone changed - check if we can reset
        if _can_reset_credits(user_data.get("last_reset_at")):
            user_data["timezone"] = timezone_str
            if user_data["date"] != today:
                user_data["count"] = 0
                user_data["date"] = today
                user_data["last_reset_at"] = datetime.now(UTC)
        else:
            # Too soon - use stored timezone
            timezone_str = stored_timezone
            today = _get_local_date(timezone_str)

    if user_data["date"] != today:
        # Check if reset is allowed (prevent abuse)
        if _can_reset_credits(user_data.get("last_reset_at")):
            user_data["count"] = 0
            user_data["date"] = today
            user_data["timezone"] = timezone_str
            user_data["last_reset_at"] = datetime.now(UTC)
            if not user_data.get("first_seen"):
                user_data["first_seen"] = datetime.now(UTC)

    # Get allocated amount for unregistered users (50 credits)
    allocated = DAILY_CREDIT_LIMITS.get("unregistered", 50)

    # Cap credits at allocated amount (zero out, don't go negative)
    new_count = user_data["count"] + credits_int
    user_data["count"] = min(new_count, allocated)

    logger.debug(
        f"[MEMORY] deduct_anonymous_credits - {identifier}: deducted {credits_int} credits "
        f"(from {float(credits):.4f}), new count: {user_data['count']} (capped at {allocated})"
    )


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

    # Legacy daily model-response fields: not used (credits-only); kept for API shape
    return {
        # Credits-based fields (primary)
        "credits_allocated": allocated,
        "credits_used_this_period": used,
        "credits_remaining": remaining,
        "credits_reset_date": reset_date.isoformat(),
        # Legacy fields (unused; always zero — usage is credit-limited only)
        "daily_usage": 0,
        "daily_limit": 0,
        "remaining_usage": 0,
        "subscription_tier": tier,
        "usage_reset_date": reset_date.isoformat(),
    }


def get_anonymous_usage_stats(identifier: str, timezone_str: str = "UTC") -> UsageStatsDict:
    """
    Get usage statistics for unregistered user.

    CREDITS-BASED: Returns credit-based statistics.
    Legacy model-response fields maintained for backward compatibility in API responses.

    Args:
        identifier: Unique identifier
        timezone_str: IANA timezone string (e.g., "America/Chicago"), defaults to "UTC"

    Returns:
        dict: Usage statistics including credits and legacy daily usage
    """
    # Validate and normalize timezone
    timezone_str = _validate_timezone(timezone_str)

    # Get credit-based stats
    credits_allocated = DAILY_CREDIT_LIMITS.get("unregistered", 50)
    today = _get_local_date(timezone_str)
    user_data = anonymous_rate_limit_storage[identifier]

    # Initialize timezone if not set
    if not user_data.get("timezone"):
        user_data["timezone"] = timezone_str

    # Use stored timezone if available (to be consistent)
    stored_timezone = user_data.get("timezone", timezone_str)
    today = _get_local_date(stored_timezone)

    # Reset if new day in user's timezone
    if user_data["date"] != today:
        # Check if reset is allowed (prevent abuse)
        if _can_reset_credits(user_data.get("last_reset_at")):
            credits_used = 0
            user_data["date"] = today
            user_data["timezone"] = stored_timezone
            user_data["last_reset_at"] = datetime.now(UTC)
        else:
            # Too soon to reset - use existing count
            credits_used = user_data["count"]
    else:
        credits_used = user_data["count"]

    credits_remaining = max(0, credits_allocated - credits_used)

    return {
        # Credits-based fields (primary)
        "credits_allocated": credits_allocated,
        "credits_used_today": credits_used,
        "credits_remaining": credits_remaining,
        # Legacy fields (unused; always zero — usage is credit-limited only)
        "daily_usage": 0,
        "daily_limit": 0,
        "remaining_usage": 0,
        "subscription_tier": "unregistered",
        "usage_reset_date": today,  # Use timezone-aware date
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
    For development/testing only. In production, rate limits reset automatically at midnight.
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


def get_overage_price(tier: str) -> float | None:
    """
    Get overage price per model response for a tier.

    Args:
        tier: Subscription tier name

    Returns:
        float: Price per overage model response, or None if overages not allowed
    """
    config = SUBSCRIPTION_CONFIG.get(tier, {})
    return config.get("overage_price")


def get_extended_overage_price(tier: str) -> float | None:
    """
    Get extended overage price per extended interaction for a tier.

    Args:
        tier: Subscription tier name

    Returns:
        float: Price per overage extended interaction, or None if overages not allowed
    """
    config = SUBSCRIPTION_CONFIG.get(tier, {})
    return config.get("extended_overage_price")


def get_tier_config(
    tier: str,
) -> dict[str, Any]:  # TODO: Use TierConfigDict when config.py uses TypedDict
    """
    Get complete configuration for a tier.

    Args:
        tier: Subscription tier name

    Returns:
        dict: Tier configuration
    """
    return SUBSCRIPTION_CONFIG.get(tier, SUBSCRIPTION_CONFIG["free"])


def get_rate_limit_info() -> dict[str, Any]:
    """
    Get information about all rate limits (for debugging).

    Returns:
        dict: Information about subscription tiers and anonymous limits
    """
    return {
        "monthly_credit_allocations": MONTHLY_CREDIT_ALLOCATIONS,
        "model_limits": MODEL_LIMITS,
        "anonymous_users_tracked": len(anonymous_rate_limit_storage),
    }
