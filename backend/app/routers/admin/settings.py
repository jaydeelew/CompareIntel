"""
Admin app settings and maintenance endpoints.
"""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from ...database import get_db
from ...dependencies import get_current_admin_user, require_admin_role
from ...models import AppSettings, UsageLog
from ...rate_limiting import anonymous_rate_limit_storage

from .helpers import log_admin_action

router = APIRouter()


@router.get("/settings")
async def get_app_settings(
    current_user=Depends(get_current_admin_user), db: Session = Depends(get_db)
):
    """Get global application settings."""
    import os

    is_development = os.environ.get("ENVIRONMENT") == "development"

    from ...cache import get_cached_app_settings, invalidate_app_settings_cache

    def get_settings():
        return db.query(AppSettings).first()

    settings = get_cached_app_settings(get_settings)

    if not settings:
        settings = AppSettings(anonymous_mock_mode_enabled=False)
        db.add(settings)
        db.commit()
        db.refresh(settings)
        invalidate_app_settings_cache()

    created_at_str = settings.created_at.isoformat() if settings.created_at else None
    updated_at_str = settings.updated_at.isoformat() if settings.updated_at else None

    anonymous_users_with_usage = 0
    anonymous_db_usage_count = 0

    if is_development:
        for key in list(anonymous_rate_limit_storage.keys()):
            if (key.startswith("ip:") or key.startswith("fp:")) and not key.endswith("_extended"):
                count = anonymous_rate_limit_storage[key].get("count", 0)
                if count > 0:
                    anonymous_users_with_usage += 1

        anonymous_db_usage_count = (
            db.query(UsageLog)
            .filter(UsageLog.user_id.is_(None))
            .count()
        )

    return {
        "anonymous_mock_mode_enabled": (
            settings.anonymous_mock_mode_enabled if is_development else False
        ),
        "is_development": is_development,
        "created_at": created_at_str,
        "updated_at": updated_at_str,
        "anonymous_users_with_usage": anonymous_users_with_usage,
        "anonymous_db_usage_count": anonymous_db_usage_count,
    }


@router.post("/settings/toggle-anonymous-mock-mode")
async def toggle_anonymous_mock_mode(
    request: Request,
    current_user=Depends(require_admin_role("admin")),
    db: Session = Depends(get_db),
):
    """Toggle mock mode for unregistered users."""
    import os

    is_development = os.environ.get("ENVIRONMENT") == "development"

    if not is_development:
        raise HTTPException(
            status_code=403,
            detail="Unregistered mock mode is only available in development environment",
        )

    from ...cache import invalidate_app_settings_cache

    settings = db.query(AppSettings).first()

    if not settings:
        settings = AppSettings(anonymous_mock_mode_enabled=False)
        db.add(settings)
        db.commit()
        db.refresh(settings)

    previous_state = settings.anonymous_mock_mode_enabled
    settings.anonymous_mock_mode_enabled = not settings.anonymous_mock_mode_enabled
    db.commit()
    db.refresh(settings)

    invalidate_app_settings_cache()

    try:
        log_admin_action(
            db=db,
            admin_user=current_user,
            action_type="toggle_anonymous_mock_mode",
            action_description=f"{'Enabled' if settings.anonymous_mock_mode_enabled else 'Disabled'} unregistered mock mode (dev_mode: {is_development})",
            target_user_id=None,
            details={
                "previous_state": previous_state,
                "new_state": settings.anonymous_mock_mode_enabled,
                "development_mode": is_development,
            },
            request=request,
        )
    except Exception as e:
        pass

    return {
        "anonymous_mock_mode_enabled": settings.anonymous_mock_mode_enabled,
        "message": f"Unregistered mock mode is now {'enabled' if settings.anonymous_mock_mode_enabled else 'disabled'}",
    }


@router.post("/settings/zero-anonymous-usage")
async def zero_anonymous_usage(
    request: Request,
    current_user=Depends(require_admin_role("admin")),
    db: Session = Depends(get_db),
):
    """Reset all unregistered user credits to maximum allocation."""
    import os

    is_development = os.environ.get("ENVIRONMENT") == "development"

    if not is_development:
        raise HTTPException(
            status_code=403,
            detail="Unregistered credit reset is only available in development environment",
        )

    keys_reset = []
    reset_timestamp = datetime.now(UTC)
    for key in list(anonymous_rate_limit_storage.keys()):
        if key.startswith("ip:") or key.startswith("fp:"):
            if not key.endswith("_extended"):
                anonymous_rate_limit_storage[key]["count"] = 0
                anonymous_rate_limit_storage[key]["date"] = datetime.now(UTC).date().isoformat()
                anonymous_rate_limit_storage[key]["last_reset_at"] = reset_timestamp
                anonymous_rate_limit_storage[key]["_admin_reset"] = True
                keys_reset.append(key)

    usage_logs_deleted = (
        db.query(UsageLog)
        .filter(UsageLog.user_id.is_(None))
        .delete()
    )
    db.commit()

    log_admin_action(
        db=db,
        admin_user=current_user,
        action_type="zero_anonymous_usage",
        action_description=f"Reset unregistered user credits to maximum (reset {len(keys_reset)} memory entries to 0 used, deleted {usage_logs_deleted} usage log entries)",
        target_user_id=None,
        details={
            "memory_entries_reset": len(keys_reset),
            "database_entries_deleted": usage_logs_deleted,
            "keys_reset": keys_reset,
            "environment": "development" if is_development else "production",
        },
        request=request,
    )

    return {
        "message": f"Anonymous credits reset to maximum ({len(keys_reset)} memory entries reset, {usage_logs_deleted} usage log entries deleted). Full credits restored.",
        "entries_reset": len(keys_reset),
        "database_entries_deleted": usage_logs_deleted,
    }


@router.post("/maintenance/cleanup-usage-logs")
async def cleanup_usage_logs(
    request: Request,
    keep_days: int = 90,
    dry_run: bool = False,
    current_user=Depends(require_admin_role("admin")),
    db: Session = Depends(get_db),
):
    """Cleanup old UsageLog entries by aggregating them into monthly summaries."""
    from ...data_retention import cleanup_old_usage_logs

    try:
        result = cleanup_old_usage_logs(db, keep_days=keep_days, dry_run=dry_run)

        log_admin_action(
            db=db,
            admin_user=current_user,
            action_type="cleanup_usage_logs",
            action_description=f"Cleanup UsageLog entries older than {keep_days} days (dry_run={dry_run})",
            target_user_id=None,
            details=result,
            request=request,
        )

        return result
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error during cleanup: {str(e)}")
