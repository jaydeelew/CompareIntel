"""
Admin user management endpoints.
"""

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import desc
from sqlalchemy.orm import Session, joinedload

from ...auth import generate_verification_code, get_password_hash
from ...config.constants import DAILY_CREDIT_LIMITS, MONTHLY_CREDIT_ALLOCATIONS
from ...credit_manager import allocate_monthly_credits, ensure_credits_allocated, reset_daily_credits
from ...database import get_db
from ...dependencies import get_current_admin_user, require_admin_role
from ...email_service import send_verification_email
from ...models import AdminActionLog, User
from ...schemas import (
    AdminActionLogResponse,
    AdminUserCreate,
    AdminUserListResponse,
    AdminUserResponse,
    AdminUserUpdate,
)

from .helpers import ensure_usage_reset, log_admin_action

router = APIRouter()


@router.get("/users", response_model=AdminUserListResponse)
async def list_users(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    search: str | None = Query(None),
    role: str | None = Query(None),
    tier: str | None = Query(None),
    is_active: bool | None = Query(None),
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    """List users with filtering and pagination."""
    query = db.query(User)

    if search:
        query = query.filter(User.email.ilike(f"%{search}%"))

    if role:
        query = query.filter(User.role == role)

    if tier:
        query = query.filter(User.subscription_tier == tier)

    if is_active is not None:
        query = query.filter(User.is_active == is_active)

    total = query.count()

    offset = (page - 1) * per_page
    users = query.order_by(desc(User.created_at)).offset(offset).limit(per_page).all()

    for user in users:
        ensure_usage_reset(user, db)
        ensure_credits_allocated(user.id, db)
        db.refresh(user)

    total_pages = (total + per_page - 1) // per_page

    return AdminUserListResponse(
        users=[AdminUserResponse.model_validate(user) for user in users],
        total=total,
        page=page,
        per_page=per_page,
        total_pages=total_pages,
    )


@router.get("/users/{user_id}", response_model=AdminUserResponse)
async def get_user(
    user_id: int,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    """Get specific user details."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    ensure_usage_reset(user, db)
    ensure_credits_allocated(user.id, db)
    db.refresh(user)

    return AdminUserResponse.model_validate(user)


@router.post("/users", response_model=AdminUserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    user_data: AdminUserCreate,
    request: Request,
    current_user: User = Depends(require_admin_role("admin")),
    db: Session = Depends(get_db),
):
    """Create a new user."""
    existing_user = db.query(User).filter(User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email=user_data.email,
        password_hash=get_password_hash(user_data.password),
        role=user_data.role,
        is_admin=user_data.role in ["moderator", "admin", "super_admin"],
        subscription_tier=user_data.subscription_tier,
        subscription_period=user_data.subscription_period,
        is_active=user_data.is_active,
        is_verified=user_data.is_verified,
        subscription_status="active" if user_data.subscription_tier != "free" else "active",
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    log_admin_action(
        db=db,
        admin_user=current_user,
        action_type="user_create",
        action_description=f"Created user {user.email}",
        target_user_id=user.id,
        details={
            "email": user.email,
            "role": user.role,
            "subscription_tier": user.subscription_tier,
            "is_active": user.is_active,
            "is_verified": user.is_verified,
        },
        request=request,
    )

    return AdminUserResponse.model_validate(user)


@router.put("/users/{user_id}", response_model=AdminUserResponse)
@router.patch("/users/{user_id}", response_model=AdminUserResponse)
async def update_user(
    user_id: int,
    user_data: AdminUserUpdate,
    request: Request,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    """Update user details. Supports both PUT and PATCH methods."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user_id == current_user.id and user_data.role and user_data.role != current_user.role:
        raise HTTPException(status_code=400, detail="Cannot modify your own role")

    original_values = {
        "email": user.email,
        "role": user.role,
        "subscription_tier": user.subscription_tier,
        "subscription_status": user.subscription_status,
        "subscription_period": user.subscription_period,
        "is_active": user.is_active,
        "is_verified": user.is_verified,
        "monthly_overage_count": user.monthly_overage_count,
    }

    update_data = user_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if hasattr(user, field):
            setattr(user, field, value)

    if user_data.role:
        user.is_admin = user_data.role in ["moderator", "admin", "super_admin"]

    tier_changed = "subscription_tier" in update_data and original_values.get(
        "subscription_tier"
    ) != update_data.get("subscription_tier")

    db.commit()
    db.refresh(user)

    if tier_changed:
        tier = user.subscription_tier or "free"
        if tier in MONTHLY_CREDIT_ALLOCATIONS:
            allocate_monthly_credits(user_id, tier, db)
            db.refresh(user)
        elif tier in DAILY_CREDIT_LIMITS:
            reset_daily_credits(user_id, tier, db, force=True)
            db.refresh(user)

    ensure_usage_reset(user, db)

    changes = {k: v for k, v in update_data.items() if original_values.get(k) != v}
    log_admin_action(
        db=db,
        admin_user=current_user,
        action_type="user_update",
        action_description=f"Updated user {user.email}",
        target_user_id=user.id,
        details={"original_values": original_values, "changes": changes},
        request=request,
    )

    return AdminUserResponse.model_validate(user)


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: int,
    request: Request,
    current_user: User = Depends(require_admin_role("super_admin")),
    db: Session = Depends(get_db),
):
    """Delete a user (super admin only)."""
    import json

    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        if user_id == current_user.id:
            raise HTTPException(status_code=400, detail="Cannot delete your own account")

        user_details = {
            "email": user.email,
            "role": user.role,
            "subscription_tier": user.subscription_tier,
            "created_at": user.created_at.isoformat(),
        }
        user_email = user.email

        try:
            ip_address = None
            user_agent = None
            if request:
                try:
                    ip_address = (
                        request.client.host
                        if hasattr(request, "client") and request.client
                        else None
                    )
                except Exception:
                    ip_address = None
                try:
                    user_agent = request.headers.get("user-agent")
                except Exception:
                    user_agent = None

            log_entry = AdminActionLog(
                admin_user_id=current_user.id,
                target_user_id=user.id,
                action_type="user_delete",
                action_description=f"Deleted user {user_email}",
                details=json.dumps(user_details),
                ip_address=ip_address,
                user_agent=user_agent,
            )
            db.add(log_entry)
            db.commit()
        except Exception as e:
            pass

        db.delete(user)
        db.commit()

    except HTTPException:
        raise
    except Exception as e:
        import traceback

        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/users/{user_id}/reset-password", status_code=status.HTTP_200_OK)
async def reset_user_password(
    user_id: int,
    new_password: str,
    request: Request,
    current_user: User = Depends(require_admin_role("admin")),
    db: Session = Depends(get_db),
):
    """Reset user password."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if len(new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters long")

    user.password_hash = get_password_hash(new_password)
    db.commit()

    log_admin_action(
        db=db,
        admin_user=current_user,
        action_type="password_reset",
        action_description=f"Reset password for user {user.email}",
        target_user_id=user.id,
        request=request,
    )

    return {"message": "Password reset successfully"}


@router.post("/users/{user_id}/send-verification", status_code=status.HTTP_200_OK)
async def send_user_verification(
    user_id: int,
    request: Request,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    """Send verification email to user."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.is_verified:
        raise HTTPException(status_code=400, detail="User is already verified")

    verification_code = generate_verification_code()
    user.verification_token = verification_code
    user.verification_token_expires = datetime.now(UTC) + timedelta(minutes=15)
    db.commit()

    try:
        await send_verification_email(user.email, verification_code)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send verification email: {str(e)}")

    log_admin_action(
        db=db,
        admin_user=current_user,
        action_type="send_verification",
        action_description=f"Sent verification email to user {user.email}",
        target_user_id=user.id,
        request=request,
    )

    return {"message": "Verification email sent successfully"}


@router.get("/action-logs", response_model=list[AdminActionLogResponse])
async def get_action_logs(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    action_type: str | None = Query(None),
    admin_user_id: int | None = Query(None),
    target_user_id: int | None = Query(None),
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    """Get admin action logs."""
    query = db.query(AdminActionLog).options(
        joinedload(AdminActionLog.admin_user), joinedload(AdminActionLog.target_user)
    )

    if action_type:
        query = query.filter(AdminActionLog.action_type == action_type)

    if admin_user_id:
        query = query.filter(AdminActionLog.admin_user_id == admin_user_id)

    if target_user_id:
        query = query.filter(AdminActionLog.target_user_id == target_user_id)

    offset = (page - 1) * per_page
    logs = query.order_by(desc(AdminActionLog.created_at)).offset(offset).limit(per_page).all()

    result = []
    for log in logs:
        log_dict = {
            "id": log.id,
            "admin_user_id": log.admin_user_id,
            "admin_user_email": log.admin_user.email if log.admin_user else None,
            "target_user_id": log.target_user_id,
            "target_user_email": log.target_user.email if log.target_user else None,
            "action_type": log.action_type,
            "action_description": log.action_description,
            "details": log.details,
            "ip_address": log.ip_address,
            "user_agent": log.user_agent,
            "created_at": log.created_at,
        }
        result.append(AdminActionLogResponse(**log_dict))

    return result


@router.post("/users/{user_id}/toggle-active", response_model=AdminUserResponse)
async def toggle_user_active(
    user_id: int,
    request: Request,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    """Toggle user active status."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot modify your own active status")

    user.is_active = not user.is_active
    db.commit()
    db.refresh(user)

    ensure_usage_reset(user, db)

    log_admin_action(
        db=db,
        admin_user=current_user,
        action_type="toggle_active",
        action_description=f"{'Activated' if user.is_active else 'Deactivated'} user {user.email}",
        target_user_id=user.id,
        details={"is_active": user.is_active},
        request=request,
    )

    return AdminUserResponse.model_validate(user)


@router.post("/users/{user_id}/reset-usage", response_model=AdminUserResponse)
async def reset_user_usage(
    user_id: int,
    request: Request,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    """Reset user's credit usage to zero and restore full credits based on subscription tier."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    previous_credits_used = user.credits_used_this_period or 0
    previous_credits_allocated = user.monthly_credits_allocated or 0

    tier = user.subscription_tier or "free"
    if tier in MONTHLY_CREDIT_ALLOCATIONS:
        db.commit()
        db.refresh(user)
        allocate_monthly_credits(user_id, tier, db)
        db.refresh(user)
    elif tier in DAILY_CREDIT_LIMITS:
        db.commit()
        db.refresh(user)
        reset_daily_credits(user_id, tier, db, force=True)
        db.refresh(user)
    else:
        user.credits_used_this_period = 0
        db.commit()
        db.refresh(user)

    log_admin_action(
        db=db,
        admin_user=current_user,
        action_type="reset_usage",
        action_description=f"Reset credits to maximum for user {user.email} ({tier} tier)",
        target_user_id=user.id,
        details={
            "previous_credits_used": previous_credits_used,
            "previous_credits_allocated": previous_credits_allocated,
            "new_credits_allocated": user.monthly_credits_allocated or 0,
            "new_credits_used": 0,
            "subscription_tier": tier,
        },
        request=request,
    )

    return AdminUserResponse.model_validate(user)


@router.post("/users/{user_id}/toggle-mock-mode", response_model=AdminUserResponse)
async def toggle_mock_mode(
    user_id: int,
    request: Request,
    current_user: User = Depends(require_admin_role("admin")),
    db: Session = Depends(get_db),
):
    """Toggle mock mode for a user."""
    import os

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    is_development = os.environ.get("ENVIRONMENT") == "development"

    if not is_development and user.role not in ["admin", "super_admin"]:
        raise HTTPException(
            status_code=400,
            detail="Mock mode can only be enabled for admin and super-admin users in production",
        )

    previous_state = user.mock_mode_enabled
    user.mock_mode_enabled = not user.mock_mode_enabled
    db.commit()
    db.refresh(user)

    ensure_usage_reset(user, db)

    log_admin_action(
        db=db,
        admin_user=current_user,
        action_type="toggle_mock_mode",
        action_description=f"{'Enabled' if user.mock_mode_enabled else 'Disabled'} mock mode for user {user.email} (dev_mode: {is_development})",
        target_user_id=user.id,
        details={
            "previous_state": previous_state,
            "new_state": user.mock_mode_enabled,
            "development_mode": is_development,
        },
        request=request,
    )

    return AdminUserResponse.model_validate(user)


@router.post("/users/{user_id}/change-tier", response_model=AdminUserResponse)
async def change_user_tier(
    user_id: int,
    tier_data: dict,
    request: Request,
    current_user: User = Depends(require_admin_role("super_admin")),
    db: Session = Depends(get_db),
):
    """Change user's subscription tier. Super admin only."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    new_tier = tier_data.get("subscription_tier")
    valid_tiers = ["free", "starter", "starter_plus", "pro", "pro_plus"]
    if new_tier not in valid_tiers:
        raise HTTPException(
            status_code=400, detail=f"Invalid tier. Must be one of: {', '.join(valid_tiers)}"
        )

    previous_tier = user.subscription_tier

    user.subscription_tier = new_tier

    if new_tier == "free":
        user.subscription_status = "active"
    else:
        if user.subscription_status not in ["active", "cancelled", "expired"]:
            user.subscription_status = "active"

    db.commit()
    db.refresh(user)

    tier = user.subscription_tier or "free"
    if tier in MONTHLY_CREDIT_ALLOCATIONS:
        allocate_monthly_credits(user_id, tier, db)
        db.refresh(user)
    elif tier in DAILY_CREDIT_LIMITS:
        reset_daily_credits(user_id, tier, db, force=True)
        db.refresh(user)

    ensure_usage_reset(user, db)

    log_admin_action(
        db=db,
        admin_user=current_user,
        action_type="change_tier",
        action_description=f"Changed subscription tier for user {user.email} from {previous_tier} to {new_tier}",
        target_user_id=user.id,
        details={"previous_tier": previous_tier, "new_tier": new_tier},
        request=request,
    )

    return AdminUserResponse.model_validate(user)
