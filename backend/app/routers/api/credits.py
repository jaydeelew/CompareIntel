"""Credit routes."""

import json
from datetime import UTC, datetime, timedelta
from decimal import ROUND_CEILING, Decimal

import pytz
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func
from sqlalchemy.orm import Session

from ...config.constants import DAILY_CREDIT_LIMITS
from ...credit_manager import (
    check_and_reset_credits_if_needed,
    ensure_credits_allocated,
    get_credit_usage_stats,
)
from ...database import get_db
from ...dependencies import get_current_user
from ...models import UsageLog, User
from ...rate_limiting import (
    _get_local_date,
    _validate_timezone,
    anonymous_rate_limit_storage,
)
from ...utils.request import get_client_ip

router = APIRouter(tags=["API - Credits"])


@router.get("/credits/balance")
async def get_credit_balance(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user),
    fingerprint: str | None = None,
    timezone: str | None = None,
):
    """
    Get current credit balance and usage statistics.
    For unregistered users, returns daily credit balance.
    """
    if current_user:
        check_and_reset_credits_if_needed(current_user.id, db)
        ensure_credits_allocated(current_user.id, db)
        db.refresh(current_user)

        stats = get_credit_usage_stats(current_user.id, db)

        return {
            "credits_allocated": stats["credits_allocated"],
            "credits_used_this_period": stats["credits_used_this_period"],
            "credits_remaining": stats["credits_remaining"],
            "total_credits_used": stats["total_credits_used"],
            "credits_reset_at": stats["credits_reset_at"],
            "billing_period_start": stats["billing_period_start"],
            "billing_period_end": stats["billing_period_end"],
            "period_type": stats["period_type"],
            "subscription_tier": stats["subscription_tier"],
        }

    client_ip = get_client_ip(request)
    credits_allocated = DAILY_CREDIT_LIMITS.get("unregistered", 50)

    user_timezone = "UTC"
    if timezone:
        try:
            pytz.timezone(timezone)
            user_timezone = timezone
        except (pytz.exceptions.UnknownTimeZoneError, AttributeError):
            pass
    elif request:
        header_tz = request.headers.get("X-Timezone")
        if header_tz:
            try:
                pytz.timezone(header_tz)
                user_timezone = header_tz
            except (pytz.exceptions.UnknownTimeZoneError, AttributeError):
                pass

    user_timezone = _validate_timezone(user_timezone)
    tz = pytz.timezone(user_timezone)
    now_local = datetime.now(tz)
    today_start_utc = now_local.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(UTC)
    today_end_utc = (
        (now_local + timedelta(days=1))
        .replace(hour=0, minute=0, second=0, microsecond=0)
        .astimezone(UTC)
    )

    ip_credits_query = db.query(func.sum(UsageLog.credits_used)).filter(
        UsageLog.user_id.is_(None),
        UsageLog.ip_address == client_ip,
        UsageLog.created_at >= today_start_utc,
        UsageLog.created_at < today_end_utc,
        UsageLog.credits_used.isnot(None),
    )
    ip_credits_used = ip_credits_query.scalar() or Decimal(0)
    ip_credits_used_rounded = (
        int(ip_credits_used.quantize(Decimal("1"), rounding=ROUND_CEILING))
        if ip_credits_used > 0
        else 0
    )
    ip_credits_remaining = max(0, credits_allocated - ip_credits_used_rounded)

    fingerprint_credits_remaining = ip_credits_remaining
    fp_credits_used = Decimal(0)
    if fingerprint:
        fp_credits_query = db.query(func.sum(UsageLog.credits_used)).filter(
            UsageLog.user_id.is_(None),
            UsageLog.browser_fingerprint == fingerprint,
            UsageLog.created_at >= today_start_utc,
            UsageLog.created_at < today_end_utc,
            UsageLog.credits_used.isnot(None),
        )
        fp_credits_used = fp_credits_query.scalar() or Decimal(0)
        fp_credits_used_rounded = (
            int(fp_credits_used.quantize(Decimal("1"), rounding=ROUND_CEILING))
            if fp_credits_used > 0
            else 0
        )
        fingerprint_credits_remaining = max(0, credits_allocated - fp_credits_used_rounded)

    ip_identifier = f"ip:{client_ip}"
    today_str = _get_local_date(user_timezone)

    ip_has_admin_reset = anonymous_rate_limit_storage[ip_identifier].get("_admin_reset", False)
    if ip_has_admin_reset:
        ip_credits_used_from_storage = anonymous_rate_limit_storage[ip_identifier].get("count", 0)
        ip_credits_remaining = max(0, credits_allocated - ip_credits_used_from_storage)
    else:
        anonymous_rate_limit_storage[ip_identifier] = {
            "count": (
                int(ip_credits_used.quantize(Decimal("1"), rounding=ROUND_CEILING))
                if ip_credits_used > 0
                else 0
            ),
            "date": today_str,
            "timezone": user_timezone,
            "first_seen": anonymous_rate_limit_storage[ip_identifier].get("first_seen")
            or datetime.now(UTC),
        }

    if fingerprint:
        fp_identifier = f"fp:{fingerprint}"
        fp_has_admin_reset = anonymous_rate_limit_storage[fp_identifier].get("_admin_reset", False)
        if fp_has_admin_reset:
            fp_credits_used_from_storage = anonymous_rate_limit_storage[fp_identifier].get(
                "count", 0
            )
            fingerprint_credits_remaining = max(0, credits_allocated - fp_credits_used_from_storage)
        else:
            anonymous_rate_limit_storage[fp_identifier] = {
                "count": (
                    int(fp_credits_used.quantize(Decimal("1"), rounding=ROUND_CEILING))
                    if fp_credits_used > 0
                    else 0
                ),
                "date": today_str,
                "timezone": user_timezone,
                "first_seen": anonymous_rate_limit_storage[fp_identifier].get("first_seen")
                or datetime.now(UTC),
            }

    credits_remaining = min(
        ip_credits_remaining,
        fingerprint_credits_remaining if fingerprint else ip_credits_remaining,
    )

    return {
        "credits_allocated": credits_allocated,
        "credits_used_today": credits_allocated - credits_remaining,
        "credits_remaining": credits_remaining,
        "period_type": "daily",
        "subscription_tier": "unregistered",
    }


@router.get("/credits/usage")
async def get_credit_usage(
    page: int = 1,
    per_page: int = 50,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user),
):
    """Get detailed credit usage history."""
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required")

    offset = (page - 1) * per_page

    query = db.query(UsageLog).filter(UsageLog.user_id == current_user.id)
    total_count = query.count()
    usage_logs = query.order_by(UsageLog.created_at.desc()).offset(offset).limit(per_page).all()

    results = []
    for log in usage_logs:
        try:
            models_used = json.loads(log.models_used) if log.models_used else []
        except (json.JSONDecodeError, TypeError):
            models_used = []

        results.append(
            {
                "id": log.id,
                "created_at": log.created_at.isoformat() if log.created_at else None,
                "models_used": models_used,
                "models_successful": log.models_successful,
                "models_failed": log.models_failed,
                "credits_used": float(log.credits_used) if log.credits_used else None,
                "input_tokens": log.input_tokens,
                "output_tokens": log.output_tokens,
                "total_tokens": log.total_tokens,
                "effective_tokens": log.effective_tokens,
                "processing_time_ms": log.processing_time_ms,
            }
        )

    return {
        "total": total_count,
        "page": page,
        "per_page": per_page,
        "total_pages": (total_count + per_page - 1) // per_page,
        "results": results,
    }
