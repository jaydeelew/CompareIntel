"""
Admin analytics and statistics endpoints.
"""

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from ...database import get_db
from ...dependencies import get_current_admin_user
from ...models import AdminActionLog, UsageLog, User
from ...schemas import AdminStatsResponse, VisitorAnalyticsResponse

router = APIRouter()


@router.get("/stats", response_model=AdminStatsResponse)
async def get_admin_stats(
    current_user: User = Depends(get_current_admin_user), db: Session = Depends(get_db)
):
    """Get admin dashboard statistics."""
    total_users = db.query(User).count()
    active_users = db.query(User).filter(User.is_active == True).count()
    verified_users = db.query(User).filter(User.is_verified == True).count()

    users_by_tier = {}
    for tier in ["free", "starter", "starter_plus", "pro", "pro_plus"]:
        count = db.query(User).filter(User.subscription_tier == tier).count()
        users_by_tier[tier] = count

    users_by_role = {}
    for role in ["user", "moderator", "admin", "super_admin"]:
        count = db.query(User).filter(User.role == role).count()
        users_by_role[role] = count

    week_ago = datetime.now(UTC) - timedelta(days=7)
    recent_registrations = db.query(User).filter(User.created_at >= week_ago).count()

    today = datetime.now(UTC).date()
    total_usage_today = (
        db.query(func.sum(User.credits_used_this_period))
        .filter(User.credits_reset_at.isnot(None))
        .scalar()
        or 0
    )

    admin_actions_today = (
        db.query(AdminActionLog).filter(func.date(AdminActionLog.created_at) == today).count()
    )

    return AdminStatsResponse(
        total_users=total_users,
        active_users=active_users,
        verified_users=verified_users,
        users_by_tier=users_by_tier,
        users_by_role=users_by_role,
        recent_registrations=recent_registrations,
        total_usage_today=total_usage_today,
        admin_actions_today=admin_actions_today,
    )


@router.get("/analytics/visitors", response_model=VisitorAnalyticsResponse)
async def get_visitor_analytics(
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    """Get visitor analytics statistics."""
    now = datetime.now(UTC)
    today_start = datetime.combine(now.date(), datetime.min.time())
    week_ago = now - timedelta(days=7)
    month_ago = now - timedelta(days=30)

    total_unique_visitors = db.query(func.count(func.distinct(UsageLog.ip_address))).scalar() or 0
    total_unique_devices = (
        db.query(func.count(func.distinct(UsageLog.browser_fingerprint)))
        .filter(UsageLog.browser_fingerprint.isnot(None))
        .scalar()
        or 0
    )
    total_comparisons = db.query(func.count(UsageLog.id)).scalar() or 0

    unique_visitors_today = (
        db.query(func.count(func.distinct(UsageLog.ip_address)))
        .filter(UsageLog.created_at >= today_start)
        .scalar()
        or 0
    )

    unique_visitors_this_week = (
        db.query(func.count(func.distinct(UsageLog.ip_address)))
        .filter(UsageLog.created_at >= week_ago)
        .scalar()
        or 0
    )

    unique_visitors_this_month = (
        db.query(func.count(func.distinct(UsageLog.ip_address)))
        .filter(UsageLog.created_at >= month_ago)
        .scalar()
        or 0
    )

    authenticated_visitors = (
        db.query(func.count(func.distinct(UsageLog.ip_address)))
        .filter(UsageLog.user_id.isnot(None))
        .scalar()
        or 0
    )

    anonymous_visitors = (
        db.query(func.count(func.distinct(UsageLog.ip_address)))
        .filter(UsageLog.user_id.is_(None))
        .scalar()
        or 0
    )

    comparisons_today = (
        db.query(func.count(UsageLog.id)).filter(UsageLog.created_at >= today_start).scalar() or 0
    )

    comparisons_this_week = (
        db.query(func.count(UsageLog.id)).filter(UsageLog.created_at >= week_ago).scalar() or 0
    )

    comparisons_this_month = (
        db.query(func.count(UsageLog.id)).filter(UsageLog.created_at >= month_ago).scalar() or 0
    )

    daily_breakdown = []
    for i in range(30):
        day_start = datetime.combine((now - timedelta(days=i)).date(), datetime.min.time())
        day_end = day_start + timedelta(days=1)

        day_unique_visitors = (
            db.query(func.count(func.distinct(UsageLog.ip_address)))
            .filter(UsageLog.created_at >= day_start, UsageLog.created_at < day_end)
            .scalar()
            or 0
        )

        day_comparisons = (
            db.query(func.count(UsageLog.id))
            .filter(UsageLog.created_at >= day_start, UsageLog.created_at < day_end)
            .scalar()
            or 0
        )

        daily_breakdown.append(
            {
                "date": day_start.date().isoformat(),
                "unique_visitors": day_unique_visitors,
                "total_comparisons": day_comparisons,
            }
        )

    daily_breakdown.reverse()

    return VisitorAnalyticsResponse(
        total_unique_visitors=total_unique_visitors,
        total_unique_devices=total_unique_devices,
        total_comparisons=total_comparisons,
        unique_visitors_today=unique_visitors_today,
        unique_visitors_this_week=unique_visitors_this_week,
        unique_visitors_this_month=unique_visitors_this_month,
        authenticated_visitors=authenticated_visitors,
        anonymous_visitors=anonymous_visitors,
        daily_breakdown=daily_breakdown,
        comparisons_today=comparisons_today,
        comparisons_this_week=comparisons_this_week,
        comparisons_this_month=comparisons_this_month,
    )
