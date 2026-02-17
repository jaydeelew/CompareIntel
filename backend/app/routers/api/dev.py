"""Development-only routes."""

import logging
import os
from collections import defaultdict
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ...config.settings import settings
from ...database import get_db
from ...dependencies import get_current_user
from ...models import Conversation, User
from ...rate_limiting import anonymous_rate_limit_storage
from ...utils.request import get_client_ip

router = APIRouter(tags=["API - Dev"])


def _default_model_stat() -> dict[str, Any]:
    return {"success": 0, "failure": 0, "last_error": None, "last_success": None}


model_stats: defaultdict[str, dict[str, Any]] = defaultdict(_default_model_stat)


class ResetRateLimitRequest(BaseModel):
    fingerprint: str | None = None


class CreateTestUserRequest(BaseModel):
    email: str
    password: str
    role: str | None = "user"
    is_admin: bool | None = False
    subscription_tier: str | None = None  # None = preserve on update, "free" on create
    is_verified: bool | None = True
    is_active: bool | None = True


@router.get("/model-stats")
async def get_model_stats():
    """Get success/failure statistics for all models."""
    stats = {}
    for model_id, data in model_stats.items():
        total_attempts = data["success"] + data["failure"]
        success_rate = (data["success"] / total_attempts * 100) if total_attempts > 0 else 0
        stats[model_id] = {
            "success_count": data["success"],
            "failure_count": data["failure"],
            "total_attempts": total_attempts,
            "success_rate": round(success_rate, 1),
            "last_error": data["last_error"],
            "last_success": data["last_success"],
        }
    return {"model_statistics": stats}


@router.post("/dev/reset-rate-limit")
async def reset_rate_limit_dev(
    request: Request,
    req_body: ResetRateLimitRequest,
    current_user: User | None = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    DEV ONLY: Reset rate limits, usage counts, and conversation history.
    For authenticated users: resets database usage and deletes their conversations.
    For unregistered users: resets IP/fingerprint-based rate limits.
    """
    if os.environ.get("ENVIRONMENT") != "development":
        raise HTTPException(
            status_code=403, detail="This endpoint is only available in development mode"
        )

    client_ip = get_client_ip(request)
    deleted_count = 0

    if current_user:
        current_user.monthly_overage_count = 0
        current_user.daily_extended_usage = 0
        deleted_count = (
            db.query(Conversation).filter(Conversation.user_id == current_user.id).delete()
        )
        db.commit()

    ip_key = f"ip:{client_ip}"
    if ip_key in anonymous_rate_limit_storage:
        del anonymous_rate_limit_storage[ip_key]

    fingerprint = req_body.fingerprint
    if fingerprint:
        fp_key = f"fp:{fingerprint}"
        if fp_key in anonymous_rate_limit_storage:
            del anonymous_rate_limit_storage[fp_key]

    from ...routers.auth import failed_login_attempts

    failed_login_attempts.clear()

    return {
        "message": "Rate limits, usage, and conversation history reset successfully",
        "ip_address": client_ip,
        "fingerprint_reset": fingerprint is not None,
        "conversations_deleted": deleted_count,
        "user_type": "authenticated" if current_user else "anonymous",
    }


@router.post("/dev/create-test-user")
async def create_test_user_dev(
    user_data: CreateTestUserRequest,
    db: Session = Depends(get_db),
):
    """
    DEV ONLY: Create or update a test user directly in the database.
    Used for E2E test setup.
    """
    if os.environ.get("ENVIRONMENT") != "development":
        raise HTTPException(
            status_code=403, detail="This endpoint is only available in development mode"
        )

    database_url = os.getenv("DATABASE_URL", "") or getattr(settings, "database_url", "")
    environment = os.environ.get("ENVIRONMENT", "").lower()
    is_test_db = database_url and "test" in database_url.lower()
    is_dev_mode = environment == "development"

    if database_url and not is_test_db and not is_dev_mode:
        raise HTTPException(
            status_code=403,
            detail="This endpoint is only available with test databases or in development mode",
        )

    from ...auth import get_password_hash
    from ...models import UserPreference

    existing_user = db.query(User).filter(User.email == user_data.email).first()

    if existing_user:
        existing_user.password_hash = get_password_hash(user_data.password)
        existing_user.role = user_data.role
        existing_user.is_admin = user_data.is_admin
        if user_data.subscription_tier is not None:
            existing_user.subscription_tier = user_data.subscription_tier
        existing_user.is_verified = user_data.is_verified
        existing_user.is_active = user_data.is_active
        existing_user.subscription_status = "active"
        db.commit()
        db.refresh(existing_user)

        return {
            "message": "Test user updated successfully",
            "email": existing_user.email,
            "role": existing_user.role,
            "is_admin": existing_user.is_admin,
            "is_verified": existing_user.is_verified,
            "subscription_tier": existing_user.subscription_tier,
        }

    new_user = User(
        email=user_data.email,
        password_hash=get_password_hash(user_data.password),
        role=user_data.role,
        is_admin=user_data.is_admin,
        subscription_tier=user_data.subscription_tier or "free",
        subscription_status="active",
        subscription_period="monthly",
        is_verified=user_data.is_verified,
        is_active=user_data.is_active,
        subscription_start_date=datetime.now(UTC),
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    try:
        preferences = UserPreference(
            user_id=new_user.id,
            theme="light",
            email_notifications=True,
            usage_alerts=True,
        )
        db.add(preferences)
        db.commit()
    except Exception as e:
        logging.warning(f"Could not create user preferences: {e}")

    return {
        "message": "Test user created successfully",
        "email": new_user.email,
        "role": new_user.role,
        "is_admin": new_user.is_admin,
        "is_verified": new_user.is_verified,
        "subscription_tier": new_user.subscription_tier,
    }
