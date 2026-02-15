"""
Shared helpers for admin routes.
"""

import json
from typing import Any

from fastapi import Request
from sqlalchemy.orm import Session

from ...models import AdminActionLog, User


def ensure_usage_reset(user: User, db: Session) -> None:
    """
    Ensure user's daily usage and extended usage are reset if it's a new day.
    Credits system handles resets automatically via credits_reset_at.
    """
    pass


def log_admin_action(
    db: Session,
    admin_user: User,
    action_type: str,
    action_description: str,
    target_user_id: int | None = None,
    details: dict[str, Any] | None = None,
    request: Request | None = None,
) -> None:
    """Log admin action for audit trail."""
    ip_address = None
    user_agent = None
    if request:
        try:
            ip_address = (
                request.client.host if hasattr(request, "client") and request.client else None
            )
        except Exception:
            ip_address = None
        try:
            user_agent = request.headers.get("user-agent")
        except Exception:
            user_agent = None

    log_entry = AdminActionLog(
        admin_user_id=admin_user.id,
        target_user_id=target_user_id,
        action_type=action_type,
        action_description=action_description,
        details=json.dumps(details) if details else None,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    db.add(log_entry)
    db.commit()
