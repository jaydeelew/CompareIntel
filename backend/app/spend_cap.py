"""
Global OpenRouter spend cap with Redis tracking and fail-closed enforcement.

Launch protection for free/anonymous compares. Paid users are unaffected unless a
separate paid cap is configured. See docs/ops/OPENROUTER_SPEND_CAP.md.
"""

from __future__ import annotations

import logging
import threading
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

from .config.constants import CREDITS_PER_DOLLAR
from .config.settings import settings
from .redis_client import get_redis_client

logger = logging.getLogger(__name__)

PAID_TIERS = frozenset({"starter", "starter_plus", "pro", "pro_plus"})
STAFF_ROLES = frozenset({"admin", "super_admin"})

MICRODOLLARS_PER_USD = 1_000_000
DAILY_KEY_TTL_SECONDS = 3 * 24 * 60 * 60
MONTHLY_KEY_TTL_SECONDS = 40 * 24 * 60 * 60
ALERT_THRESHOLDS = (50, 80)

TRY_AGAIN_LATER_MESSAGE = "The service is busy right now. Please try again later."

_memory_lock = threading.Lock()
_memory_counters: dict[str, int] = {}
_memory_alert_flags: set[str] = set()


@dataclass(frozen=True)
class SpendCheckResult:
    """Decision for whether a compare may start under the spend cap."""

    allowed: bool
    blocked_by: str | None
    retry_after_seconds: int
    spent_daily_usd: float
    spent_monthly_usd: float
    message: str
    storage: str


def reset_spend_state_for_tests() -> None:
    """Clear in-memory spend counters and alert flags (unit tests only)."""
    with _memory_lock:
        _memory_counters.clear()
        _memory_alert_flags.clear()


def is_paid_or_exempt(user: Any | None) -> bool:
    """Paid subscribers and staff are exempt from the free-tier spend cap."""
    if user is None:
        return False
    if getattr(user, "is_admin", False):
        return True
    role = getattr(user, "role", None) or ""
    if role in STAFF_ROLES:
        return True
    tier = getattr(user, "subscription_tier", None) or "free"
    return tier in PAID_TIERS


def spend_caps_enabled() -> bool:
    return (
        _daily_free_cap() > 0
        or _monthly_free_cap() > 0
        or _daily_paid_cap() > 0
        or _monthly_paid_cap() > 0
    )


def _daily_free_cap() -> float:
    return max(0.0, float(settings.openrouter_daily_spend_cap_usd))


def _monthly_free_cap() -> float:
    return max(0.0, float(settings.openrouter_monthly_spend_cap_usd))


def _daily_paid_cap() -> float:
    return max(0.0, float(settings.openrouter_paid_daily_spend_cap_usd))


def _monthly_paid_cap() -> float:
    return max(0.0, float(settings.openrouter_paid_monthly_spend_cap_usd))


def _utc_now() -> datetime:
    return datetime.now(UTC)


def _daily_key(now: datetime | None = None) -> str:
    day = (now or _utc_now()).date().isoformat()
    return f"openrouter:spend:daily:{day}"


def _monthly_key(now: datetime | None = None) -> str:
    stamp = (now or _utc_now()).strftime("%Y-%m")
    return f"openrouter:spend:monthly:{stamp}"


def _alert_key(period: str, threshold: int, now: datetime | None = None) -> str:
    if period == "monthly":
        stamp = (now or _utc_now()).strftime("%Y-%m")
    else:
        stamp = (now or _utc_now()).date().isoformat()
    return f"openrouter:spend:alert:{period}:{stamp}:{threshold}"


def seconds_until_utc_midnight(now: datetime | None = None) -> int:
    current = now or _utc_now()
    tomorrow = (current + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    return max(1, int((tomorrow - current).total_seconds()))


def seconds_until_next_month(now: datetime | None = None) -> int:
    current = now or _utc_now()
    if current.month == 12:
        nxt = current.replace(
            year=current.year + 1, month=1, day=1, hour=0, minute=0, second=0, microsecond=0
        )
    else:
        nxt = current.replace(
            month=current.month + 1, day=1, hour=0, minute=0, second=0, microsecond=0
        )
    return max(1, int((nxt - current).total_seconds()))


def _allow_memory_fallback() -> bool:
    if settings.openrouter_spend_memory_fallback:
        return True
    return settings.environment != "production"


def _redis_sync_client() -> Any | None:
    redis_client = get_redis_client()
    if not redis_client or not redis_client.is_available:
        return None
    try:
        return redis_client.get_sync_client()
    except Exception as exc:
        logger.warning("Redis spend-cap client unavailable: %s", exc)
        return None


def _memory_get(key: str) -> int:
    with _memory_lock:
        return int(_memory_counters.get(key, 0))


def _memory_incr(key: str, amount: int) -> int:
    with _memory_lock:
        new_val = int(_memory_counters.get(key, 0)) + amount
        _memory_counters[key] = new_val
        return new_val


def _get_counter(key: str) -> tuple[int | None, str]:
    """Return (microdollars, storage). storage is redis, memory, or unavailable."""
    client = _redis_sync_client()
    if client is not None:
        try:
            raw = client.get(key)
            if raw is None:
                return 0, "redis"
            return int(raw), "redis"
        except Exception as exc:
            logger.warning("Failed to read spend counter %s from Redis: %s", key, exc)

    if _allow_memory_fallback():
        return _memory_get(key), "memory"
    return None, "unavailable"


def _incr_counter(key: str, amount: int, ttl_seconds: int) -> tuple[int | None, str]:
    if amount <= 0:
        return _get_counter(key)

    client = _redis_sync_client()
    if client is not None:
        try:
            new_val = int(client.incrby(key, amount))
            client.expire(key, ttl_seconds)
            return new_val, "redis"
        except Exception as exc:
            logger.warning("Failed to increment spend counter %s in Redis: %s", key, exc)

    if _allow_memory_fallback():
        return _memory_incr(key, amount), "memory"
    return None, "unavailable"


def _usd_from_micro(micro: int | None) -> float:
    if micro is None:
        return 0.0
    return micro / MICRODOLLARS_PER_USD


def current_spend_usd() -> tuple[float, float, str]:
    """Return (daily_usd, monthly_usd, storage)."""
    daily_micro, daily_storage = _get_counter(_daily_key())
    monthly_micro, monthly_storage = _get_counter(_monthly_key())
    storage = daily_storage if daily_storage == monthly_storage else daily_storage
    if daily_storage == "unavailable" or monthly_storage == "unavailable":
        storage = "unavailable"
    return _usd_from_micro(daily_micro), _usd_from_micro(monthly_micro), storage


def _cap_exceeded(spent: float, cap: float) -> bool:
    return cap > 0 and spent >= cap


def check_openrouter_spend_allowed(user: Any | None) -> SpendCheckResult:
    """
    Fail closed for free/anonymous users when the cap cannot be evaluated.

    Paid/staff users are allowed unless a paid cap is configured and reached.
    """
    paid = is_paid_or_exempt(user)
    if not spend_caps_enabled():
        daily, monthly, storage = current_spend_usd()
        return SpendCheckResult(
            allowed=True,
            blocked_by=None,
            retry_after_seconds=seconds_until_utc_midnight(),
            spent_daily_usd=daily,
            spent_monthly_usd=monthly,
            message="",
            storage=storage,
        )

    daily, monthly, storage = current_spend_usd()

    if storage == "unavailable" and settings.openrouter_spend_fail_closed:
        logger.error(
            "OpenRouter spend cap cannot be evaluated (Redis unavailable); "
            "failing closed for free compares"
        )
        if paid and _daily_paid_cap() <= 0 and _monthly_paid_cap() <= 0:
            return SpendCheckResult(
                allowed=True,
                blocked_by=None,
                retry_after_seconds=seconds_until_utc_midnight(),
                spent_daily_usd=daily,
                spent_monthly_usd=monthly,
                message="",
                storage=storage,
            )
        return SpendCheckResult(
            allowed=False,
            blocked_by="unavailable",
            retry_after_seconds=seconds_until_utc_midnight(),
            spent_daily_usd=daily,
            spent_monthly_usd=monthly,
            message=TRY_AGAIN_LATER_MESSAGE,
            storage=storage,
        )

    daily_cap = _daily_paid_cap() if paid else _daily_free_cap()
    monthly_cap = _monthly_paid_cap() if paid else _monthly_free_cap()

    if paid and daily_cap <= 0 and monthly_cap <= 0:
        return SpendCheckResult(
            allowed=True,
            blocked_by=None,
            retry_after_seconds=seconds_until_utc_midnight(),
            spent_daily_usd=daily,
            spent_monthly_usd=monthly,
            message="",
            storage=storage,
        )

    if _cap_exceeded(monthly, monthly_cap):
        return SpendCheckResult(
            allowed=False,
            blocked_by="monthly",
            retry_after_seconds=seconds_until_next_month(),
            spent_daily_usd=daily,
            spent_monthly_usd=monthly,
            message=TRY_AGAIN_LATER_MESSAGE,
            storage=storage,
        )

    if _cap_exceeded(daily, daily_cap):
        return SpendCheckResult(
            allowed=False,
            blocked_by="daily",
            retry_after_seconds=seconds_until_utc_midnight(),
            spent_daily_usd=daily,
            spent_monthly_usd=monthly,
            message=TRY_AGAIN_LATER_MESSAGE,
            storage=storage,
        )

    return SpendCheckResult(
        allowed=True,
        blocked_by=None,
        retry_after_seconds=seconds_until_utc_midnight(),
        spent_daily_usd=daily,
        spent_monthly_usd=monthly,
        message="",
        storage=storage,
    )


def _claim_alert(period: str, threshold: int) -> bool:
    key = _alert_key(period, threshold)
    ttl = MONTHLY_KEY_TTL_SECONDS if period == "monthly" else DAILY_KEY_TTL_SECONDS
    client = _redis_sync_client()
    if client is not None:
        try:
            claimed = bool(client.set(key, "1", nx=True, ex=ttl))
            return claimed
        except Exception as exc:
            logger.warning("Failed to claim spend alert flag %s: %s", key, exc)

    if _allow_memory_fallback():
        with _memory_lock:
            if key in _memory_alert_flags:
                return False
            _memory_alert_flags.add(key)
            return True
    return False


def _maybe_alert(period: str, spent_usd: float, cap_usd: float) -> None:
    if cap_usd <= 0:
        return
    ratio = spent_usd / cap_usd
    for threshold in ALERT_THRESHOLDS:
        if ratio >= threshold / 100.0 and _claim_alert(period, threshold):
            _send_spend_alerts(period, threshold, spent_usd, cap_usd)


def _send_spend_alerts(period: str, threshold: int, spent_usd: float, cap_usd: float) -> None:
    level = "error" if threshold >= 80 else "warning"
    message = (
        f"OpenRouter {period} spend at {threshold}% of cap (${spent_usd:.2f} / ${cap_usd:.2f})"
    )
    logger.log(logging.ERROR if level == "error" else logging.WARNING, message)

    try:
        from .sentry import capture_message

        capture_message(
            message,
            level=level,
            period=period,
            threshold=threshold,
            spent_usd=spent_usd,
            cap_usd=cap_usd,
        )
    except Exception as exc:
        logger.warning("Failed to send Sentry spend-cap alert: %s", exc)

    try:
        _dispatch_spend_alert_email(period, threshold, spent_usd, cap_usd)
    except Exception as exc:
        logger.warning("Failed to send spend-cap alert email: %s", exc)


def _dispatch_spend_alert_email(
    period: str, threshold: int, spent_usd: float, cap_usd: float
) -> None:
    recipient = (settings.spend_alert_email or "").strip()
    if not recipient:
        import os

        recipient = os.getenv("NEW_USER_NOTIFICATION_EMAIL", "").strip()
    if not recipient or "@" not in recipient:
        return

    from . import email_service

    send = getattr(email_service, "send_spend_cap_alert_email", None)
    if send is None:
        return

    import asyncio

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop is not None and loop.is_running():
        loop.create_task(send(recipient, period, threshold, spent_usd, cap_usd))
        return

    asyncio.run(send(recipient, period, threshold, spent_usd, cap_usd))


def usd_to_microdollars(usd: Decimal | float | int) -> int:
    try:
        value = Decimal(str(usd))
    except Exception:
        return 0
    if value <= 0:
        return 0
    return int(value * MICRODOLLARS_PER_USD)


def implied_usd_from_credits(credits: Decimal | float | int) -> Decimal:
    if CREDITS_PER_DOLLAR <= 0:
        return Decimal(0)
    try:
        return Decimal(str(credits)) / Decimal(str(CREDITS_PER_DOLLAR))
    except Exception:
        return Decimal(0)


def record_openrouter_spend(usd: Decimal | float | int) -> tuple[float, float, str]:
    """
    Add USD to the daily and monthly spend counters and fire 50%/80% alerts.

    Returns (daily_usd, monthly_usd, storage).
    """
    micro = usd_to_microdollars(usd)
    if micro <= 0:
        return current_spend_usd()

    daily_micro, daily_storage = _incr_counter(_daily_key(), micro, DAILY_KEY_TTL_SECONDS)
    monthly_micro, monthly_storage = _incr_counter(_monthly_key(), micro, MONTHLY_KEY_TTL_SECONDS)
    storage = "unavailable"
    if daily_storage != "unavailable" and monthly_storage != "unavailable":
        storage = daily_storage if daily_storage == monthly_storage else daily_storage
    elif daily_storage != "unavailable":
        storage = daily_storage
    elif monthly_storage != "unavailable":
        storage = monthly_storage

    daily_usd = _usd_from_micro(daily_micro)
    monthly_usd = _usd_from_micro(monthly_micro)

    # Alerts are against the free/global cap (issue #39). Paid caps are enforcement-only.
    _maybe_alert("daily", daily_usd, _daily_free_cap())
    _maybe_alert("monthly", monthly_usd, _monthly_free_cap())

    logger.info(
        "Recorded OpenRouter spend $%s (daily=$%.4f monthly=$%.4f storage=%s)",
        usd,
        daily_usd,
        monthly_usd,
        storage,
    )
    return daily_usd, monthly_usd, storage
