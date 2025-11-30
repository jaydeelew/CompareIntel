"""
Admin management endpoints for CompareIntel.

This module provides comprehensive user management functionality including
user CRUD operations, role management, and audit logging.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from fastapi import Request
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, and_
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta, timezone
import json
import httpx
import asyncio

from ..database import get_db
from ..models import User, AdminActionLog, AppSettings, Conversation, UsageLog
from ..schemas import (
    AdminUserResponse,
    AdminUserCreate,
    AdminUserUpdate,
    AdminUserListResponse,
    AdminActionLogResponse,
    AdminStatsResponse,
    VisitorAnalyticsResponse,
)
from ..dependencies import get_current_admin_user, require_admin_role
from ..auth import get_password_hash
from ..rate_limiting import anonymous_rate_limit_storage
from datetime import date
from ..credit_manager import allocate_monthly_credits, reset_daily_credits, ensure_credits_allocated
from ..config.constants import DAILY_CREDIT_LIMITS, MONTHLY_CREDIT_ALLOCATIONS

from ..email_service import send_verification_email

router = APIRouter(prefix="/admin", tags=["admin"])


def ensure_usage_reset(user: User, db: Session) -> None:
    """
    Ensure user's daily usage and extended usage are reset if it's a new day.
    This function should be called before displaying user data in admin panel
    to ensure accurate usage counts.

    Args:
        user: User object to check and reset
        db: Database session
    """
    today = date.today()

    # Legacy: usage_reset_date kept for compatibility but daily_usage_count removed
    # Credits system handles resets automatically via credits_reset_at
    # Extended tier usage tracking removed - no longer needed


def log_admin_action(
    db: Session,
    admin_user: User,
    action_type: str,
    action_description: str,
    target_user_id: Optional[int] = None,
    details: Optional[Dict[str, Any]] = None,
    request: Optional[Request] = None,
) -> None:
    """Log admin action for audit trail."""
    # Safely extract IP address and user agent
    ip_address = None
    user_agent = None
    if request:
        try:
            ip_address = (
                request.client.host
                if hasattr(request, "client") and request.client
                else None
            )
        except:
            ip_address = None
        try:
            user_agent = request.headers.get("user-agent")
        except:
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


@router.get("/stats", response_model=AdminStatsResponse)
async def get_admin_stats(
    current_user: User = Depends(get_current_admin_user), db: Session = Depends(get_db)
):
    """Get admin dashboard statistics."""

    # Basic user counts
    total_users = db.query(User).count()
    active_users = db.query(User).filter(User.is_active == True).count()
    verified_users = db.query(User).filter(User.is_verified == True).count()

    # Users by subscription tier
    users_by_tier = {}
    for tier in ["free", "starter", "starter_plus", "pro", "pro_plus"]:
        count = db.query(User).filter(User.subscription_tier == tier).count()
        users_by_tier[tier] = count

    # Users by role
    users_by_role = {}
    for role in ["user", "moderator", "admin", "super_admin"]:
        count = db.query(User).filter(User.role == role).count()
        users_by_role[role] = count

    # Recent registrations (last 7 days)
    week_ago = datetime.utcnow() - timedelta(days=7)
    recent_registrations = db.query(User).filter(User.created_at >= week_ago).count()

    # Usage stats for today
    today = datetime.utcnow().date()
    # Legacy: daily_usage_count removed - use credits instead
    # Calculate total credits used today (approximate usage metric)
    total_usage_today = (
        db.query(func.sum(User.credits_used_this_period)).filter(
            User.credits_reset_at.isnot(None)
        ).scalar() or 0
    )

    # Admin actions today
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

    now = datetime.utcnow()
    today_start = datetime.combine(now.date(), datetime.min.time())
    week_ago = now - timedelta(days=7)
    month_ago = now - timedelta(days=30)

    # Overall stats - all time
    total_unique_visitors = db.query(func.count(func.distinct(UsageLog.ip_address))).scalar() or 0
    total_unique_devices = (
        db.query(func.count(func.distinct(UsageLog.browser_fingerprint)))
        .filter(UsageLog.browser_fingerprint.isnot(None))
        .scalar()
        or 0
    )
    total_comparisons = db.query(func.count(UsageLog.id)).scalar() or 0

    # Time-based unique visitors
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

    # Authenticated vs anonymous breakdown
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

    # Recent activity - comparisons count
    comparisons_today = (
        db.query(func.count(UsageLog.id)).filter(UsageLog.created_at >= today_start).scalar() or 0
    )

    comparisons_this_week = (
        db.query(func.count(UsageLog.id)).filter(UsageLog.created_at >= week_ago).scalar() or 0
    )

    comparisons_this_month = (
        db.query(func.count(UsageLog.id)).filter(UsageLog.created_at >= month_ago).scalar() or 0
    )

    # Daily breakdown for last 30 days
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

    # Reverse to show oldest first, newest last
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


@router.get("/users", response_model=AdminUserListResponse)
async def list_users(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
    role: Optional[str] = Query(None),
    tier: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    """List users with filtering and pagination."""

    query = db.query(User)

    # Apply filters
    if search:
        query = query.filter(User.email.ilike(f"%{search}%"))

    if role:
        query = query.filter(User.role == role)

    if tier:
        query = query.filter(User.subscription_tier == tier)

    if is_active is not None:
        query = query.filter(User.is_active == is_active)

    # Get total count
    total = query.count()

    # Apply pagination
    offset = (page - 1) * per_page
    users = query.order_by(desc(User.created_at)).offset(offset).limit(per_page).all()

    # Ensure usage is reset for all users if it's a new day
    # Also ensure credits are allocated for all users
    for user in users:
        ensure_usage_reset(user, db)
        ensure_credits_allocated(user.id, db)
        # Refresh user from database to get updated credit values
        db.refresh(user)

    # Calculate total pages
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

    # Ensure usage is reset if it's a new day
    ensure_usage_reset(user, db)
    # Ensure credits are allocated
    ensure_credits_allocated(user.id, db)
    # Refresh user from database to get updated credit values
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

    # Check if email already exists
    existing_user = db.query(User).filter(User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    # Create user
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

    # Log admin action
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

    # Prevent self-demotion
    if user_id == current_user.id and user_data.role and user_data.role != current_user.role:
        raise HTTPException(status_code=400, detail="Cannot modify your own role")

    # Store original values for logging
    original_values = {
        "email": user.email,
        "role": user.role,
        "subscription_tier": user.subscription_tier,
        "subscription_status": user.subscription_status,
        "subscription_period": user.subscription_period,
        "is_active": user.is_active,
        "is_verified": user.is_verified,
        # Legacy: daily_usage_count removed - use credits_used_this_period instead
        "monthly_overage_count": user.monthly_overage_count,
    }

    # Update fields
    update_data = user_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if hasattr(user, field):
            setattr(user, field, value)

    # Update admin status based on role
    if user_data.role:
        user.is_admin = user_data.role in ["moderator", "admin", "super_admin"]

    db.commit()
    db.refresh(user)

    # Ensure usage is reset if it's a new day
    ensure_usage_reset(user, db)

    # Log admin action
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

    try:
        print(f"Delete user request: user_id={user_id}, current_user_id={current_user.id}")

        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            print(f"User not found: {user_id}")
            raise HTTPException(status_code=404, detail="User not found")

        # Prevent self-deletion
        if user_id == current_user.id:
            print(f"Self-deletion attempt blocked: {user_id}")
            raise HTTPException(status_code=400, detail="Cannot delete your own account")

        # Note: Since this endpoint requires super_admin role, super-admins can delete other super-admins
        # The only restriction is self-deletion, which is handled above

        print(f"Deleting user: {user.email} (ID: {user.id})")
        print(f"Current user (admin): {current_user.email} (ID: {current_user.id})")

        # Store user details for logging before deletion
        user_details = {
            "email": user.email,
            "role": user.role,
            "subscription_tier": user.subscription_tier,
            "created_at": user.created_at.isoformat(),
        }
        user_email = user.email
        user_id_to_log = user.id

        # Log admin action BEFORE deletion (so we can reference the target user)
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
                except:
                    ip_address = None
                try:
                    user_agent = request.headers.get("user-agent")
                except:
                    user_agent = None

            log_entry = AdminActionLog(
                admin_user_id=current_user.id,
                target_user_id=user.id,  # Reference the user being deleted
                action_type="user_delete",
                action_description=f"Deleted user {user_email}",
                details=json.dumps(user_details),
                ip_address=ip_address,
                user_agent=user_agent,
            )
            db.add(log_entry)
            db.commit()
            print(f"Admin action logged successfully")
        except Exception as e:
            print(f"Warning: Could not log admin action: {e}")
            # Continue anyway - logging failure shouldn't prevent user deletion

        # Delete the user after logging
        db.delete(user)
        db.commit()
        print(f"User deleted successfully: {user_email}")

    except HTTPException:
        # Re-raise HTTP exceptions as they are expected
        raise
    except Exception as e:
        print(f"Unexpected error in delete_user: {e}")
        print(f"Error type: {type(e)}")
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

    # Validate password strength
    if len(new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters long")

    # Update password
    user.password_hash = get_password_hash(new_password)
    db.commit()

    # Log admin action
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

    # Generate new verification token
    from ..auth import generate_verification_token

    user.verification_token = generate_verification_token()
    user.verification_token_expires = datetime.utcnow() + timedelta(hours=24)
    db.commit()

    # Send verification email
    try:
        await send_verification_email(user.email, user.verification_token)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send verification email: {str(e)}")

    # Log admin action
    log_admin_action(
        db=db,
        admin_user=current_user,
        action_type="send_verification",
        action_description=f"Sent verification email to user {user.email}",
        target_user_id=user.id,
        request=request,
    )

    return {"message": "Verification email sent successfully"}


@router.get("/action-logs", response_model=List[AdminActionLogResponse])
async def get_action_logs(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    action_type: Optional[str] = Query(None),
    admin_user_id: Optional[int] = Query(None),
    target_user_id: Optional[int] = Query(None),
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    """Get admin action logs."""
    from sqlalchemy.orm import joinedload

    query = db.query(AdminActionLog).options(
        joinedload(AdminActionLog.admin_user), joinedload(AdminActionLog.target_user)
    )

    # Apply filters
    if action_type:
        query = query.filter(AdminActionLog.action_type == action_type)

    if admin_user_id:
        query = query.filter(AdminActionLog.admin_user_id == admin_user_id)

    if target_user_id:
        query = query.filter(AdminActionLog.target_user_id == target_user_id)

    # Apply pagination
    offset = (page - 1) * per_page
    logs = query.order_by(desc(AdminActionLog.created_at)).offset(offset).limit(per_page).all()

    # Build response with user emails
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

    # Prevent self-deactivation
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot modify your own active status")

    # Toggle active status
    user.is_active = not user.is_active
    db.commit()
    db.refresh(user)

    # Ensure usage is reset if it's a new day
    ensure_usage_reset(user, db)

    # Log admin action
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
    """Reset user's daily usage count, extended usage, and credits to zero and remove all model comparison history.
    
    This restores full credits based on the user's subscription tier:
    - Paid tiers: Restores monthly credit allocation
    - Free tier: Restores daily credit allocation
    """

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Store previous usage counts for logging
    previous_credits_used = user.credits_used_this_period or 0
    previous_credits_allocated = user.monthly_credits_allocated or 0

    # Get count of conversations to be deleted for logging
    conversations_count = db.query(Conversation).filter(Conversation.user_id == user_id).count()

    # Delete all conversations (comparison history) for this user
    # This will cascade delete all related ConversationMessage records due to the cascade setting
    db.query(Conversation).filter(Conversation.user_id == user_id).delete()

    # Extended tier usage tracking removed - no longer needed

    # Restore full credits based on subscription tier
    tier = user.subscription_tier or "free"
    if tier in MONTHLY_CREDIT_ALLOCATIONS:
        # Paid tier: allocate monthly credits
        # Note: allocate_monthly_credits commits the db, so we commit daily usage changes first
        db.commit()
        db.refresh(user)
        allocate_monthly_credits(user_id, tier, db)
        db.refresh(user)
    elif tier in DAILY_CREDIT_LIMITS:
        # Free tier: reset daily credits
        # Note: reset_daily_credits commits the db, so we commit daily usage changes first
        db.commit()
        db.refresh(user)
        reset_daily_credits(user_id, tier, db)
        db.refresh(user)
    else:
        # Unknown tier: just reset credits used to 0
        user.credits_used_this_period = 0
        db.commit()
        db.refresh(user)

    # Log admin action
    log_admin_action(
        db=db,
        admin_user=current_user,
        action_type="reset_usage",
        action_description=f"Reset credits and removed all model comparison history for user {user.email}",
        target_user_id=user.id,
        details={
            "previous_credits_used": previous_credits_used,
            "previous_credits_allocated": previous_credits_allocated,
            "new_credits_allocated": user.monthly_credits_allocated or 0,
            "new_credits_used": 0,
            "conversations_deleted": conversations_count,
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
    """
    Toggle mock mode for a user.

    In development mode: Admins can enable mock mode for any user (including regular users).
    In production mode: Admins can only enable mock mode for admin and super-admin users.

    Mock mode allows testing the application without making real API calls to OpenRouter.
    """
    import os

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # In development mode, admins can enable mock mode for any user
    # In production mode, admins can only enable mock mode for admin and super-admin users
    is_development = os.environ.get("ENVIRONMENT") == "development"

    if not is_development and user.role not in ["admin", "super_admin"]:
        raise HTTPException(
            status_code=400,
            detail="Mock mode can only be enabled for admin and super-admin users in production",
        )

    # Toggle mock mode
    previous_state = user.mock_mode_enabled
    user.mock_mode_enabled = not user.mock_mode_enabled
    db.commit()
    db.refresh(user)

    # Ensure usage is reset if it's a new day
    ensure_usage_reset(user, db)

    # Log admin action
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

    # Validate tier
    new_tier = tier_data.get("subscription_tier")
    valid_tiers = ["free", "starter", "starter_plus", "pro", "pro_plus"]
    if new_tier not in valid_tiers:
        raise HTTPException(
            status_code=400, detail=f"Invalid tier. Must be one of: {', '.join(valid_tiers)}"
        )

    # Store previous tier for logging
    previous_tier = user.subscription_tier

    # Update tier
    user.subscription_tier = new_tier

    # Update subscription status based on tier
    if new_tier == "free":
        user.subscription_status = "active"
    else:
        # Keep existing status for paid tiers, or set to active if it was free
        if user.subscription_status not in ["active", "cancelled", "expired"]:
            user.subscription_status = "active"

    db.commit()
    db.refresh(user)

    # Ensure usage is reset if it's a new day
    ensure_usage_reset(user, db)

    # Log admin action
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


@router.get("/settings")
async def get_app_settings(
    current_user: User = Depends(get_current_admin_user), db: Session = Depends(get_db)
):
    """
    Get global application settings.

    Returns current settings like anonymous mock mode status.
    In development mode only.
    """
    import os

    is_development = os.environ.get("ENVIRONMENT") == "development"

    # Use cache to avoid repeated database queries
    from ..cache import get_cached_app_settings, invalidate_app_settings_cache

    def get_settings():
        return db.query(AppSettings).first()

    settings = get_cached_app_settings(get_settings)

    # If no settings exist yet, create default ones
    if not settings:
        settings = AppSettings(anonymous_mock_mode_enabled=False)
        db.add(settings)
        db.commit()
        db.refresh(settings)
        invalidate_app_settings_cache()

    # Format datetime fields for JSON serialization
    created_at_str = settings.created_at.isoformat() if settings.created_at else None
    updated_at_str = settings.updated_at.isoformat() if settings.updated_at else None
    
    return {
        "anonymous_mock_mode_enabled": (
            settings.anonymous_mock_mode_enabled if is_development else False
        ),
        "is_development": is_development,
        "created_at": created_at_str,
        "updated_at": updated_at_str,
    }


@router.post("/settings/toggle-anonymous-mock-mode")
async def toggle_anonymous_mock_mode(
    request: Request,
    current_user: User = Depends(require_admin_role("admin")),
    db: Session = Depends(get_db),
):
    """
    Toggle mock mode for anonymous users.

    This is a global setting that affects all anonymous (unregistered) users.
    When enabled, all anonymous requests will return mock responses instead of
    calling the OpenRouter API.

    Only available in development environment.
    """
    import os

    # Check if in development mode
    is_development = os.environ.get("ENVIRONMENT") == "development"

    # Prevent toggling in production
    if not is_development:
        raise HTTPException(
            status_code=403,
            detail="Anonymous mock mode is only available in development environment",
        )

    from ..cache import invalidate_app_settings_cache

    # Query settings directly from database (not from cache) to ensure it's attached to the session
    settings = db.query(AppSettings).first()

    # If no settings exist yet, create default ones
    if not settings:
        settings = AppSettings(anonymous_mock_mode_enabled=False)
        db.add(settings)
        db.commit()
        db.refresh(settings)

    # Toggle the setting
    previous_state = settings.anonymous_mock_mode_enabled
    settings.anonymous_mock_mode_enabled = not settings.anonymous_mock_mode_enabled
    db.commit()
    db.refresh(settings)

    # Invalidate cache after updating settings
    invalidate_app_settings_cache()

    # Log admin action
    try:
        log_admin_action(
            db=db,
            admin_user=current_user,
            action_type="toggle_anonymous_mock_mode",
            action_description=f"{'Enabled' if settings.anonymous_mock_mode_enabled else 'Disabled'} anonymous mock mode (dev_mode: {is_development})",
            target_user_id=None,
            details={
                "previous_state": previous_state,
                "new_state": settings.anonymous_mock_mode_enabled,
                "development_mode": is_development,
            },
            request=request,
        )
    except Exception as e:
        # Logging failure shouldn't prevent the toggle from succeeding
        print(f"Warning: Could not log admin action: {e}")

    return {
        "anonymous_mock_mode_enabled": settings.anonymous_mock_mode_enabled,
        "message": f"Anonymous mock mode is now {'enabled' if settings.anonymous_mock_mode_enabled else 'disabled'}",
    }


@router.post("/settings/zero-anonymous-usage")
async def zero_anonymous_usage(
    request: Request,
    current_user: User = Depends(require_admin_role("admin")),
    db: Session = Depends(get_db),
):
    """
    Zero out all anonymous user usage data and clear comparison history.

    This clears:
    - Daily interaction usage for all anonymous users (in-memory storage)
    - Extended interaction usage for all anonymous users (in-memory storage)
    - UsageLog database entries for anonymous users created today
    - Comparison history stored locally (client-side, handled by frontend)

    In development mode only, this restores full credits for all anonymous users
    by clearing both memory and database tracking.

    Only available in development environment.
    """
    import os

    # Check if in development mode
    is_development = os.environ.get("ENVIRONMENT") == "development"

    # Prevent usage in production
    if not is_development:
        raise HTTPException(
            status_code=403,
            detail="Zero anonymous usage is only available in development environment",
        )

    # Count entries before clearing for logging
    keys_to_remove = []
    for key in list(anonymous_rate_limit_storage.keys()):
        # Remove all anonymous user entries
        # Keys are formatted as "ip:xxx", "fp:xxx"
        if key.startswith("ip:") or key.startswith("fp:"):
            # Skip extended keys (no longer used)
            if not key.endswith("_extended"):
                keys_to_remove.append(key)

    # Clear all anonymous usage entries from memory
    for key in keys_to_remove:
        del anonymous_rate_limit_storage[key]

    # Delete all UsageLog entries for anonymous users created today
    # This ensures that when memory storage syncs with database, it finds 0 credits used
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = datetime.now(timezone.utc).replace(hour=23, minute=59, second=59, microsecond=999999)
    
    usage_logs_deleted = (
        db.query(UsageLog)
        .filter(
            UsageLog.user_id.is_(None),  # Anonymous users only
            UsageLog.created_at >= today_start,
            UsageLog.created_at <= today_end
        )
        .delete()
    )
    db.commit()

    # Log admin action
    log_admin_action(
        db=db,
        admin_user=current_user,
        action_type="zero_anonymous_usage",
        action_description=f"Zeroed out anonymous user usage data (cleared {len(keys_to_remove)} memory entries, deleted {usage_logs_deleted} database entries)",
        target_user_id=None,
        details={
            "memory_entries_cleared": len(keys_to_remove),
            "database_entries_deleted": usage_logs_deleted,
            "keys_removed": keys_to_remove,
            "development_mode": is_development,
        },
        request=request,
    )

    return {
        "message": f"Anonymous usage data cleared ({len(keys_to_remove)} memory entries removed, {usage_logs_deleted} database entries deleted). Full credits restored. Client-side history should be cleared separately.",
        "entries_cleared": len(keys_to_remove),
        "database_entries_deleted": usage_logs_deleted,
    }


@router.post("/maintenance/cleanup-usage-logs")
async def cleanup_usage_logs(
    request: Request,
    keep_days: int = 90,
    dry_run: bool = False,
    current_user: User = Depends(require_admin_role("admin")),
    db: Session = Depends(get_db),
):
    """
    Cleanup old UsageLog entries by aggregating them into monthly summaries.
    
    This endpoint aggregates UsageLog entries older than keep_days into monthly
    summary records and then deletes the detailed entries. This helps manage
    database growth while preserving aggregated data for long-term analysis.
    
    The aggregated data includes:
    - Total comparisons, models requested/successful/failed
    - Token aggregates (total and average input/output tokens)
    - Credit aggregates (total and average credits per comparison)
    - Cost aggregates (total actual and estimated costs)
    - Model breakdown (per-model statistics)
    
    Detailed UsageLog entries are needed for:
    - Token estimation (requires ~30 days of detailed data)
    - Recent usage analysis
    
    Aggregated monthly summaries are kept indefinitely for:
    - Long-term trend analysis
    - Cost analysis over time
    - Historical reporting
    
    Args:
        keep_days: Number of days of detailed data to keep (default: 90)
        dry_run: If True, only report what would be deleted, don't actually delete
    
    Returns:
        Dictionary with cleanup statistics
    """
    from ..data_retention import cleanup_old_usage_logs
    
    try:
        result = cleanup_old_usage_logs(db, keep_days=keep_days, dry_run=dry_run)
        
        # Log admin action
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
        raise HTTPException(
            status_code=500,
            detail=f"Error during cleanup: {str(e)}"
        )


# Model Management Endpoints

from pydantic import BaseModel
from ..model_runner import (
    MODELS_BY_PROVIDER,
    OPENROUTER_MODELS,
    client,
    ANONYMOUS_TIER_MODELS,
    FREE_TIER_MODELS,
    refresh_model_token_limits,
)
from .. import model_runner
from ..config import settings
import subprocess
from pathlib import Path
import ast
import re
import sys
import importlib
from openai import APIError, NotFoundError, APIConnectionError, RateLimitError, APITimeoutError


class AddModelRequest(BaseModel):
    model_id: str


class DeleteModelRequest(BaseModel):
    model_id: str


async def fetch_model_data_from_openrouter(model_id: str) -> Optional[Dict[str, Any]]:
    """
    Fetch model data from OpenRouter's Models API.
    Returns full model data including pricing information.
    
    Args:
        model_id: The model ID (e.g., "openai/gpt-4")
        
    Returns:
        Model data dictionary if found, None otherwise
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as http_client:
            response = await http_client.get(
                "https://openrouter.ai/api/v1/models",
                headers={
                    "Authorization": f"Bearer {settings.openrouter_api_key}",
                    "HTTP-Referer": "https://compareintel.com",
                }
            )
            
            if response.status_code == 200:
                data = response.json()
                models = data.get("data", [])
                
                # Find the model by ID
                for model in models:
                    if model.get("id") == model_id:
                        return model
    except Exception as e:
        # Log error but don't fail
        print(f"Error fetching model data from OpenRouter: {e}")
    
    return None


async def fetch_model_description_from_openrouter(model_id: str) -> Optional[str]:
    """
    Fetch model description from OpenRouter's Models API.
    Returns only the first sentence of the description.
    
    Args:
        model_id: The model ID (e.g., "openai/gpt-4")
        
    Returns:
        The first sentence of the model description if found, None otherwise
    """
    model_data = await fetch_model_data_from_openrouter(model_id)
    if not model_data:
        return None
    
    description = model_data.get("description")
    if description:
        # Extract only the first sentence
        description = description.strip()
        
        # Find the first sentence-ending punctuation
        match = re.search(r'([.!?])(?:\s+|$)', description)
        if match:
            end_pos = match.end()
            first_sentence = description[:end_pos].strip()
            return first_sentence
        else:
            return description
    
    return None


def calculate_average_cost_per_million_tokens(model_data: Dict[str, Any]) -> Optional[float]:
    """
    Calculate average cost per million tokens from OpenRouter pricing data.
    
    Args:
        model_data: Model data dictionary from OpenRouter API
        
    Returns:
        Average cost per million tokens, or None if pricing data unavailable
    """
    pricing = model_data.get("pricing", {})
    if not pricing:
        return None
    
    # Get input and output pricing (per million tokens)
    # Convert to float in case they come as strings from the API
    try:
        input_price = float(pricing.get("prompt", 0) or 0)  # Price per million input tokens
        output_price = float(pricing.get("completion", 0) or 0)  # Price per million output tokens
    except (ValueError, TypeError):
        # If conversion fails, return None
        return None
    
    # If both are zero or missing, return None
    if input_price == 0 and output_price == 0:
        return None
    
    # Calculate average: (input + output) / 2
    # This gives us a rough average cost per million tokens
    if input_price > 0 and output_price > 0:
        avg_cost = (input_price + output_price) / 2
    elif input_price > 0:
        avg_cost = input_price
    elif output_price > 0:
        avg_cost = output_price
    else:
        return None
    
    return avg_cost


async def classify_model_by_pricing(model_id: str, model_data: Optional[Dict[str, Any]] = None) -> str:
    """
    Classify a model into anonymous, free, or paid tier based on OpenRouter pricing.
    
    Classification criteria:
    - Anonymous tier: Models costing <$0.50 per million tokens (input+output average)
    - Free tier: Models costing <$1 per million tokens (includes anonymous + mid-level)
    - Paid tier: Models costing >=$1 per million tokens
    
    Args:
        model_id: The model ID (e.g., "openai/gpt-4")
        model_data: Optional model data from OpenRouter (will fetch if not provided)
        
    Returns:
        Tier classification: "anonymous", "free", or "paid"
    """
    # If model_data not provided, fetch it
    if model_data is None:
        model_data = await fetch_model_data_from_openrouter(model_id)
    
    # If we can't get pricing data, default to paid tier (safest option)
    if not model_data:
        print(f"Warning: Could not fetch pricing data for {model_id}, defaulting to paid tier")
        return "paid"
    
    avg_cost = calculate_average_cost_per_million_tokens(model_data)
    
    # If pricing unavailable, check model name patterns as fallback
    if avg_cost is None:
        # Fallback: use naming patterns to classify
        model_name_lower = model_id.lower()
        if any(pattern in model_name_lower for pattern in [":free", "-mini", "-nano", "-small", "-flash", "-fast"]):
            return "anonymous"
        elif any(pattern in model_name_lower for pattern in ["-medium", "-plus", "-chat"]):
            return "free"
        else:
            return "paid"
    
    # Classify based on pricing thresholds
    if avg_cost < 0.5:
        return "anonymous"
    elif avg_cost < 1.0:
        return "free"
    else:
        return "paid"


@router.get("/models")
async def get_admin_models(
    current_user: User = Depends(require_admin_role("admin")),
) -> Dict[str, Any]:
    """
    Get all models organized by provider for admin panel.
    """
    return {
        "models": OPENROUTER_MODELS,
        "models_by_provider": MODELS_BY_PROVIDER,
    }


@router.post("/models/validate")
async def validate_model(
    request: Request,
    req: AddModelRequest,
    current_user: User = Depends(require_admin_role("admin")),
    db: Session = Depends(get_db),
):
    """
    Validate that a model exists in OpenRouter and is callable.
    """
    model_id = req.model_id.strip()
    
    if not model_id:
        raise HTTPException(status_code=400, detail="Model ID cannot be empty")
    
    # Check if model already exists in our system
    for provider, models in MODELS_BY_PROVIDER.items():
        for model in models:
            if model["id"] == model_id:
                raise HTTPException(
                    status_code=400,
                    detail=f"Model {model_id} already exists in model_runner.py"
                )
    
    # First, check if model exists in OpenRouter's model list
    model_data = await fetch_model_data_from_openrouter(model_id)
    if not model_data:
        raise HTTPException(
            status_code=404,
            detail=f"Model {model_id} not found in OpenRouter's model list"
        )
    
    # Model exists in the list, now verify it's actually callable
    try:
        # Make a minimal test call to OpenRouter to validate the model is callable
        # Run the synchronous call in a thread executor to avoid blocking the event loop
        loop = asyncio.get_event_loop()
        test_response = await loop.run_in_executor(
            None,
            lambda: client.chat.completions.create(
                model=model_id,
                messages=[{"role": "user", "content": "Hi"}],
                max_tokens=5,
                timeout=10,
            )
        )
        
        # If we get here, the model exists and is accessible
        # Log admin action
        log_admin_action(
            db=db,
            admin_user=current_user,
            action_type="validate_model",
            action_description=f"Validated model {model_id} exists in OpenRouter",
            target_user_id=None,
            details={"model_id": model_id, "exists": True},
            request=request,
        )
        
        return {
            "valid": True,
            "model_id": model_id,
            "message": f"Model {model_id} exists in OpenRouter and is callable"
        }
        
    except HTTPException:
        raise
    except NotFoundError as e:
        # This shouldn't happen if model is in the list, but handle it anyway
        raise HTTPException(
            status_code=404,
            detail=f"Model {model_id} found in OpenRouter's list but API call failed: {str(e)}"
        )
    except (RateLimitError, APITimeoutError, APIConnectionError) as e:
        # Temporary errors - network issues, rate limits, timeouts
        return {
            "valid": False,
            "model_id": model_id,
            "message": f"Model {model_id} exists in OpenRouter but validation failed due to temporary error: {str(e)}. Please try again later."
        }
    except APIError as e:
        # Return the actual error message so user knows what went wrong
        error_str = str(e)
        return {
            "valid": False,
            "model_id": model_id,
            "message": f"Model {model_id} exists in OpenRouter's list but API call failed: {error_str}. The model may require special access, be in beta, or have other restrictions."
        }
    except Exception as e:
        # Unexpected errors - return the actual error
        error_str = str(e)
        return {
            "valid": False,
            "model_id": model_id,
            "message": f"Model {model_id} exists in OpenRouter's list but validation failed: {error_str}"
        }


@router.post("/models/add")
async def add_model(
    request: Request,
    req: AddModelRequest,
    current_user: User = Depends(require_admin_role("admin")),
    db: Session = Depends(get_db),
):
    """
    Add a new model to model_runner.py and set up its renderer config.
    """
    model_id = req.model_id.strip()
    
    if not model_id:
        raise HTTPException(status_code=400, detail="Model ID cannot be empty")
    
    # Check if model already exists (validation will happen via test API call)
    # The validate endpoint checks OpenRouter, but we also need to check our local list
    
    # Check if model already exists
    for provider, models in MODELS_BY_PROVIDER.items():
        for model in models:
            if model["id"] == model_id:
                raise HTTPException(
                    status_code=400,
                    detail=f"Model {model_id} already exists in model_runner.py"
                )
    
    # Extract provider from model_id (format: provider/model-name)
    if '/' not in model_id:
        raise HTTPException(status_code=400, detail="Invalid model ID format. Expected: provider/model-name")
    
    provider_name = model_id.split('/')[0]
    # Capitalize provider name (e.g., "x-ai" -> "xAI", "openai" -> "OpenAI")
    provider_name = provider_name.replace('-', ' ').title().replace(' ', '')
    if provider_name.lower() == "xai":
        provider_name = "xAI"
    elif provider_name.lower() == "openai":
        provider_name = "OpenAI"
    elif provider_name.lower() == "meta-llama":
        provider_name = "Meta"
    
    # Get model name - use a formatted version of the model ID
    model_name = model_id.split('/')[-1]
    # Format the name nicely (e.g., "grok-4.1-fast" -> "Grok 4.1 Fast")
    model_name = model_name.replace('-', ' ').replace('_', ' ').title()
    
    # Try to fetch description from OpenRouter's Models API
    model_description = await fetch_model_description_from_openrouter(model_id)
    
    # Fall back to template-based description if OpenRouter doesn't have it
    if not model_description:
        model_description = f"{provider_name}'s {model_name} model"
    
    # Add model to model_runner.py
    model_runner_path = Path(__file__).parent.parent / "model_runner.py"
    
    try:
        with open(model_runner_path, "r", encoding="utf-8") as f:
            content = f.read()
        
        # Find the provider section in MODELS_BY_PROVIDER
        # We need to add the model to the appropriate provider list
        provider_found = False
        
        # Try to find existing provider
        for existing_provider in MODELS_BY_PROVIDER.keys():
            if existing_provider.lower() == provider_name.lower():
                provider_name = existing_provider  # Use exact case from file
                provider_found = True
                break
        
        if not provider_found:
            # Create new provider section
            # Find the closing brace of MODELS_BY_PROVIDER
            pattern = r'(MODELS_BY_PROVIDER\s*=\s*\{[^}]*)\}'
            match = re.search(pattern, content, re.DOTALL)
            if match:
                # Add new provider before closing brace
                # Escape description for Python string (handle quotes and special chars)
                escaped_description = repr(model_description)
                new_provider_section = f',\n    "{provider_name}": [\n        {{\n            "id": "{model_id}",\n            "name": "{model_name}",\n            "description": {escaped_description},\n            "category": "Language",\n            "provider": "{provider_name}",\n        }},\n    ]'
                content = content[:match.end()-1] + new_provider_section + content[match.end()-1:]
            else:
                raise HTTPException(status_code=500, detail="Could not find MODELS_BY_PROVIDER structure")
        else:
            # Add to existing provider
            # Use the already-loaded MODELS_BY_PROVIDER to get existing models
            existing_models = MODELS_BY_PROVIDER.get(provider_name, []).copy()
            
            # Add the new model
            new_model_dict = {
                "id": model_id,
                "name": model_name,
                "description": model_description,  # Store as string, will format with repr when writing
                "category": "Language",
                "provider": provider_name,
            }
            if hasattr(req, 'available') and not req.available:
                new_model_dict["available"] = False
            
            existing_models.append(new_model_dict)
            
            # Sort models by name in decreasing alphanumeric order (Z->A, 9->0)
            existing_models.sort(key=lambda x: x["name"], reverse=True)
            
            # Find the provider's list in the file
            provider_pattern = rf'("{re.escape(provider_name)}"\s*:\s*\[)(.*?)(\s*\])'
            match = re.search(provider_pattern, content, re.DOTALL)
            if match:
                # Reconstruct the provider's list with sorted models
                models_lines = []
                for model in existing_models:
                    model_lines = [
                        "        {",
                        f'            "id": "{model["id"]}",',
                        f'            "name": "{model["name"]}",',
                        f'            "description": {repr(model["description"])},',
                        f'            "category": "{model["category"]}",',
                        f'            "provider": "{model["provider"]}",'
                    ]
                    if "available" in model:
                        model_lines.append(f'            "available": {model["available"]},')
                    model_lines.append("        },")
                    models_lines.extend(model_lines)
                
                # Join models with newlines
                models_str = "\n".join(models_lines)
                
                # Replace the provider's list with the sorted one
                new_provider_section = f'"{provider_name}": [\n{models_str}\n    ]'
                content = content[:match.start(1)] + new_provider_section + content[match.end(3):]
            else:
                raise HTTPException(status_code=500, detail=f"Could not find provider {provider_name} in MODELS_BY_PROVIDER")
        
        # Write back to file
        with open(model_runner_path, "w", encoding="utf-8") as f:
            f.write(content)
        
        # Classify model based on OpenRouter pricing and add to appropriate tier set
        model_data = await fetch_model_data_from_openrouter(model_id)
        tier_classification = await classify_model_by_pricing(model_id, model_data)
        
        # Read file again to add model to tier sets
        with open(model_runner_path, "r", encoding="utf-8") as f:
            content = f.read()
        
        # Add model to appropriate tier set(s)
        if tier_classification == "anonymous":
            # Add to ANONYMOUS_TIER_MODELS
            anonymous_pattern = r'(ANONYMOUS_TIER_MODELS\s*=\s*\{)(.*?)(\s*\})'
            match = re.search(anonymous_pattern, content, re.DOTALL)
            if match:
                # Check if model already in set
                if f'"{model_id}"' not in match.group(2):
                    # Find a good insertion point (after last model in the set)
                    # Add before closing brace
                    insertion_point = match.end() - 1  # Before closing brace
                    # Format: add with proper indentation and comment if needed
                    model_entry = f',\n    "{model_id}",  # Auto-classified based on pricing'
                    content = content[:insertion_point] + model_entry + content[insertion_point:]
        elif tier_classification == "free":
            # Add to FREE_TIER_MODELS (which includes anonymous models)
            # Pattern matches: FREE_TIER_MODELS = ANONYMOUS_TIER_MODELS.union({ ... })
            free_pattern = r'(FREE_TIER_MODELS\s*=\s*ANONYMOUS_TIER_MODELS\.union\()(\{)(.*?)(\})(\))'
            match = re.search(free_pattern, content, re.DOTALL)
            if match:
                # Check if model already in set
                if f'"{model_id}"' not in match.group(3):
                    # Find insertion point - add after the comment about additional mid-level models
                    # Look for the comment about additional mid-level models
                    mid_level_comment = "# Additional mid-level models"
                    if mid_level_comment in match.group(3):
                        insertion_point = match.start(3) + match.group(3).find(mid_level_comment)
                        model_entry = f'\n    "{model_id}",  # Auto-classified based on pricing\n    '
                        content = content[:insertion_point] + model_entry + content[insertion_point:]
                    else:
                        # Add before closing brace of the set literal
                        insertion_point = match.start(4)  # Position of the closing brace
                        model_entry = f',\n    "{model_id}",  # Auto-classified based on pricing'
                        content = content[:insertion_point] + model_entry + content[insertion_point:]
        # If tier_classification == "paid", don't add to any tier set (defaults to paid)
        
        # Write updated content back
        with open(model_runner_path, "w", encoding="utf-8") as f:
            f.write(content)
        
        # Reload the model_runner module to get updated MODELS_BY_PROVIDER
        importlib.reload(model_runner)
        # Update the imported references in this module's namespace
        sys.modules[__name__].MODELS_BY_PROVIDER = model_runner.MODELS_BY_PROVIDER
        sys.modules[__name__].OPENROUTER_MODELS = model_runner.OPENROUTER_MODELS
        
        # Refresh token limits for the newly added model
        refresh_model_token_limits(model_id)
        
        # Run setup script to generate renderer config
        # Path from backend/app/routers/admin.py to backend/scripts/setup_model_renderer.py
        script_path = Path(__file__).parent.parent.parent / "scripts" / "setup_model_renderer.py"
        try:
            # Run from backend directory
            backend_dir = Path(__file__).parent.parent.parent
            result = subprocess.run(
                [sys.executable, str(script_path), model_id],
                capture_output=True,
                text=True,
                timeout=600,  # 10 minute timeout
                cwd=str(backend_dir)
            )
            
            if result.returncode != 0:
                # Model was added but config generation failed
                error_msg = result.stderr[:500] if result.stderr else "Unknown error"
                raise HTTPException(
                    status_code=500,
                    detail=f"Model added but renderer config generation failed: {error_msg}"
                )
        except subprocess.TimeoutExpired:
            raise HTTPException(
                status_code=500,
                detail="Renderer config generation timed out"
            )
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Error generating renderer config: {str(e)}"
            )
        
        # Invalidate models cache so fresh data is returned
        from ..cache import invalidate_models_cache
        invalidate_models_cache()
        
        # Log admin action
        log_admin_action(
            db=db,
            admin_user=current_user,
            action_type="add_model",
            action_description=f"Added model {model_id} to system",
            target_user_id=None,
            details={"model_id": model_id, "provider": provider_name},
            request=request,
        )
        
        return {
            "success": True,
            "model_id": model_id,
            "provider": provider_name,
            "message": f"Model {model_id} added successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error adding model: {str(e)}"
        )


@router.post("/models/add-stream")
async def add_model_stream(
    request: Request,
    req: AddModelRequest,
    current_user: User = Depends(require_admin_role("admin")),
    db: Session = Depends(get_db),
):
    """
    Add a new model to model_runner.py and set up its renderer config with progress streaming.
    Uses Server-Sent Events (SSE) to stream progress updates to the frontend.
    """
    
    async def generate_progress_stream():
        model_id = req.model_id.strip()
        
        if not model_id:
            yield f"data: {json.dumps({'type': 'error', 'message': 'Model ID cannot be empty'})}\n\n"
            return
        
        # Backup paths for rollback
        model_runner_path = Path(__file__).parent.parent / "model_runner.py"
        config_path = Path(__file__).parent.parent.parent / "frontend" / "src" / "config" / "model_renderer_configs.json"
        backup_model_runner_path = model_runner_path.with_suffix('.py.backup')
        backup_config_path = config_path.with_suffix('.json.backup')
        
        # Save backups before making any changes
        model_runner_backup = None
        config_backup = None
        process = None
        
        try:
            # Read and backup model_runner.py
            with open(model_runner_path, "r", encoding="utf-8") as f:
                model_runner_backup = f.read()
            with open(backup_model_runner_path, "w", encoding="utf-8") as f:
                f.write(model_runner_backup)
            
            # Backup renderer config if it exists
            if config_path.exists():
                with open(config_path, "r", encoding="utf-8") as f:
                    config_backup = f.read()
                with open(backup_config_path, "w", encoding="utf-8") as f:
                    f.write(config_backup)
            else:
                config_backup = None
            
            # Send initial progress
            try:
                yield f"data: {json.dumps({'type': 'progress', 'stage': 'validating', 'message': f'Validating model {model_id}...', 'progress': 0})}\n\n"
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError,
                    TimeoutError, asyncio.TimeoutError, httpx.ConnectError, httpx.TimeoutException,
                    httpx.NetworkError, httpx.ConnectTimeout, httpx.ReadTimeout):
                # Client disconnected or network error, restore backups
                raise
            
            # Check if model already exists
            for provider, models in MODELS_BY_PROVIDER.items():
                for model in models:
                    if model["id"] == model_id:
                        try:
                            yield f"data: {json.dumps({'type': 'error', 'message': f'Model {model_id} already exists in model_runner.py'})}\n\n"
                        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError,
                                TimeoutError, asyncio.TimeoutError, httpx.ConnectError, httpx.TimeoutException,
                                httpx.NetworkError, httpx.ConnectTimeout, httpx.ReadTimeout):
                            raise
                        return
            
            # Extract provider from model_id
            if '/' not in model_id:
                try:
                    yield f"data: {json.dumps({'type': 'error', 'message': 'Invalid model ID format. Expected: provider/model-name'})}\n\n"
                except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError,
                        TimeoutError, asyncio.TimeoutError, httpx.ConnectError, httpx.TimeoutException,
                        httpx.NetworkError, httpx.ConnectTimeout, httpx.ReadTimeout):
                    raise
                return
            
            provider_name = model_id.split('/')[0]
            provider_name = provider_name.replace('-', ' ').title().replace(' ', '')
            if provider_name.lower() == "xai":
                provider_name = "xAI"
            elif provider_name.lower() == "openai":
                provider_name = "OpenAI"
            elif provider_name.lower() == "meta-llama":
                provider_name = "Meta"
            
            model_name = model_id.split('/')[-1]
            model_name = model_name.replace('-', ' ').replace('_', ' ').title()
            
            # Fetch description
            try:
                yield f"data: {json.dumps({'type': 'progress', 'stage': 'fetching', 'message': f'Fetching model description from OpenRouter...', 'progress': 10})}\n\n"
            except (BrokenPipeError, ConnectionResetError, OSError):
                raise
            model_description = await fetch_model_description_from_openrouter(model_id)
            
            if not model_description:
                model_description = f"{provider_name}'s {model_name} model"
            
            # Add model to model_runner.py
            try:
                yield f"data: {json.dumps({'type': 'progress', 'stage': 'adding', 'message': f'Adding model to model_runner.py...', 'progress': 20})}\n\n"
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError,
                    TimeoutError, asyncio.TimeoutError, httpx.ConnectError, httpx.TimeoutException,
                    httpx.NetworkError, httpx.ConnectTimeout, httpx.ReadTimeout):
                raise
            
            with open(model_runner_path, "r", encoding="utf-8") as f:
                content = f.read()
            
            provider_found = False
            for existing_provider in MODELS_BY_PROVIDER.keys():
                if existing_provider.lower() == provider_name.lower():
                    provider_name = existing_provider
                    provider_found = True
                    break
            
            if not provider_found:
                pattern = r'(MODELS_BY_PROVIDER\s*=\s*\{[^}]*)\}'
                match = re.search(pattern, content, re.DOTALL)
                if match:
                    escaped_description = repr(model_description)
                    new_provider_section = f',\n    "{provider_name}": [\n        {{\n            "id": "{model_id}",\n            "name": "{model_name}",\n            "description": {escaped_description},\n            "category": "Language",\n            "provider": "{provider_name}",\n        }},\n    ]'
                    content = content[:match.end()-1] + new_provider_section + content[match.end()-1:]
                else:
                    try:
                        yield f"data: {json.dumps({'type': 'error', 'message': 'Could not find MODELS_BY_PROVIDER structure'})}\n\n"
                    except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError,
                            TimeoutError, asyncio.TimeoutError, httpx.ConnectError, httpx.TimeoutException,
                            httpx.NetworkError, httpx.ConnectTimeout, httpx.ReadTimeout):
                        raise
                    return
            else:
                existing_models = MODELS_BY_PROVIDER.get(provider_name, []).copy()
                new_model_dict = {
                    "id": model_id,
                    "name": model_name,
                    "description": model_description,
                    "category": "Language",
                    "provider": provider_name,
                }
                existing_models.append(new_model_dict)
                existing_models.sort(key=lambda x: x["name"], reverse=True)
                
                provider_pattern = rf'("{re.escape(provider_name)}"\s*:\s*\[)(.*?)(\s*\])'
                match = re.search(provider_pattern, content, re.DOTALL)
                if match:
                    models_lines = []
                    for model in existing_models:
                        model_lines = [
                            "        {",
                            f'            "id": "{model["id"]}",',
                            f'            "name": "{model["name"]}",',
                            f'            "description": {repr(model["description"])},',
                            f'            "category": "{model["category"]}",',
                            f'            "provider": "{model["provider"]}",'
                        ]
                        if "available" in model:
                            model_lines.append(f'            "available": {model["available"]},')
                        model_lines.append("        },")
                        models_lines.extend(model_lines)
                    
                    models_str = "\n".join(models_lines)
                    new_provider_section = f'"{provider_name}": [\n{models_str}\n    ]'
                    content = content[:match.start(1)] + new_provider_section + content[match.end(3):]
                else:
                    try:
                        yield f"data: {json.dumps({'type': 'error', 'message': f'Could not find provider {provider_name} in MODELS_BY_PROVIDER'})}\n\n"
                    except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError,
                            TimeoutError, asyncio.TimeoutError, httpx.ConnectError, httpx.TimeoutException,
                            httpx.NetworkError, httpx.ConnectTimeout, httpx.ReadTimeout):
                        raise
                    return
            
            # Write back to file
            with open(model_runner_path, "w", encoding="utf-8") as f:
                f.write(content)
            
            # Classify model based on OpenRouter pricing and add to appropriate tier set
            try:
                yield f"data: {json.dumps({'type': 'progress', 'stage': 'classifying', 'message': f'Classifying model tier based on pricing...', 'progress': 25})}\n\n"
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError,
                    TimeoutError, asyncio.TimeoutError, httpx.ConnectError, httpx.TimeoutException,
                    httpx.NetworkError, httpx.ConnectTimeout, httpx.ReadTimeout):
                raise
            try:
                model_data = await fetch_model_data_from_openrouter(model_id)
                tier_classification = await classify_model_by_pricing(model_id, model_data)
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError,
                    TimeoutError, asyncio.TimeoutError, httpx.ConnectError, httpx.TimeoutException,
                    httpx.NetworkError, httpx.ConnectTimeout, httpx.ReadTimeout) as e:
                # Network error during API call - trigger rollback
                raise
            
            # Read file again to add model to tier sets
            with open(model_runner_path, "r", encoding="utf-8") as f:
                content = f.read()
            
            # Add model to appropriate tier set(s)
            if tier_classification == "anonymous":
                # Add to ANONYMOUS_TIER_MODELS
                anonymous_pattern = r'(ANONYMOUS_TIER_MODELS\s*=\s*\{)(.*?)(\s*\})'
                match = re.search(anonymous_pattern, content, re.DOTALL)
                if match:
                    # Check if model already in set
                    if f'"{model_id}"' not in match.group(2):
                        # Find a good insertion point (after last model in the set)
                        # Add before closing brace
                        insertion_point = match.end() - 1  # Before closing brace
                        # Format: add with proper indentation and comment if needed
                        model_entry = f',\n    "{model_id}",  # Auto-classified based on pricing'
                        content = content[:insertion_point] + model_entry + content[insertion_point:]
            elif tier_classification == "free":
                # Add to FREE_TIER_MODELS (which includes anonymous models)
                # Pattern matches: FREE_TIER_MODELS = ANONYMOUS_TIER_MODELS.union({ ... })
                free_pattern = r'(FREE_TIER_MODELS\s*=\s*ANONYMOUS_TIER_MODELS\.union\()(\{)(.*?)(\})(\))'
                match = re.search(free_pattern, content, re.DOTALL)
                if match:
                    # Check if model already in set
                    if f'"{model_id}"' not in match.group(3):
                        # Find insertion point - add after the comment about additional mid-level models
                        # Look for the comment about additional mid-level models
                        mid_level_comment = "# Additional mid-level models"
                        if mid_level_comment in match.group(3):
                            insertion_point = match.start(3) + match.group(3).find(mid_level_comment)
                            model_entry = f'\n    "{model_id}",  # Auto-classified based on pricing\n    '
                            content = content[:insertion_point] + model_entry + content[insertion_point:]
                        else:
                            # Add before closing brace of the set literal
                            insertion_point = match.start(4)  # Position of the closing brace
                            model_entry = f',\n    "{model_id}",  # Auto-classified based on pricing'
                            content = content[:insertion_point] + model_entry + content[insertion_point:]
            # If tier_classification == "paid", don't add to any tier set (defaults to paid)
            
            # Write updated content back
            with open(model_runner_path, "w", encoding="utf-8") as f:
                f.write(content)
            
            try:
                yield f"data: {json.dumps({'type': 'progress', 'stage': 'classifying', 'message': f'Model classified as {tier_classification} tier', 'progress': 27})}\n\n"
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError,
                    TimeoutError, asyncio.TimeoutError, httpx.ConnectError, httpx.TimeoutException,
                    httpx.NetworkError, httpx.ConnectTimeout, httpx.ReadTimeout):
                raise
            
            # Reload module
            try:
                importlib.reload(model_runner)
                sys.modules[__name__].MODELS_BY_PROVIDER = model_runner.MODELS_BY_PROVIDER
                sys.modules[__name__].OPENROUTER_MODELS = model_runner.OPENROUTER_MODELS
            except SyntaxError as e:
                # If there's a syntax error in model_runner.py, rollback FIRST before any yield
                # This ensures the file is restored even if the stream has ended
                rollback_success = False
                if model_runner_backup and backup_model_runner_path.exists():
                    try:
                        with open(model_runner_path, "w", encoding="utf-8") as f:
                            f.write(model_runner_backup)
                        # Verify restoration by attempting reload
                        try:
                            importlib.reload(model_runner)
                            sys.modules[__name__].MODELS_BY_PROVIDER = model_runner.MODELS_BY_PROVIDER
                            sys.modules[__name__].OPENROUTER_MODELS = model_runner.OPENROUTER_MODELS
                            rollback_success = True
                            backup_model_runner_path.unlink()
                        except Exception as reload_err:
                            print(f"Warning: Failed to verify rollback after SyntaxError: {reload_err}", file=sys.stderr)
                            # File was restored but reload failed - might be a different issue
                            rollback_success = True  # File was written, consider it successful
                    except Exception as restore_err:
                        print(f"Error restoring backup after SyntaxError: {restore_err}", file=sys.stderr)
                
                # Now try to yield error message (but rollback already happened)
                try:
                    if rollback_success:
                        yield f"data: {json.dumps({'type': 'error', 'message': f'Syntax error in model_runner.py after modification: {str(e)}. Changes have been rolled back.'})}\n\n"
                    else:
                        yield f"data: {json.dumps({'type': 'error', 'message': f'Syntax error in model_runner.py after modification: {str(e)}. Attempted rollback - please check backup file at {backup_model_runner_path}'})}\n\n"
                except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError,
                        TimeoutError, asyncio.TimeoutError, httpx.ConnectError, httpx.TimeoutException,
                        httpx.NetworkError, httpx.ConnectTimeout, httpx.ReadTimeout):
                    # Stream ended, but rollback already happened, so we're good
                    pass
                return
            
            # Run setup script with streaming output
            try:
                yield f"data: {json.dumps({'type': 'progress', 'stage': 'setup', 'message': f'Starting renderer configuration setup...', 'progress': 30})}\n\n"
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError,
                    TimeoutError, asyncio.TimeoutError, httpx.ConnectError, httpx.TimeoutException,
                    httpx.NetworkError, httpx.ConnectTimeout, httpx.ReadTimeout):
                raise
            
            script_path = Path(__file__).parent.parent.parent / "scripts" / "setup_model_renderer.py"
            backend_dir = Path(__file__).parent.parent.parent
            
            # Use asyncio subprocess for async output reading
            import asyncio
            
            process = await asyncio.create_subprocess_exec(
                sys.executable, str(script_path), model_id,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=str(backend_dir)
            )
            
            stderr_lines = []
            
            # Read stdout line by line asynchronously
            while True:
                try:
                    line_bytes = await process.stdout.readline()
                except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError,
                        TimeoutError, asyncio.TimeoutError, httpx.ConnectError, httpx.TimeoutException,
                        httpx.NetworkError, httpx.ConnectTimeout, httpx.ReadTimeout) as e:
                    # Network error while reading subprocess output - trigger rollback
                    if process:
                        try:
                            process.kill()
                        except:
                            pass
                    raise
                if not line_bytes:
                    break
                
                line_str = line_bytes.decode('utf-8').strip()
                if line_str.startswith('PROGRESS:'):
                    try:
                        progress_json = json.loads(line_str[9:])  # Remove 'PROGRESS:' prefix
                        # Map script stages to our progress percentages
                        stage = progress_json.get('stage', 'processing')
                        message = progress_json.get('message', 'Processing...')
                        script_progress = progress_json.get('progress', 0)
                        
                        # Map stages to progress ranges
                        if stage == 'starting':
                            mapped_progress = 30
                        elif stage == 'collecting':
                            # Collecting is 30-60% of total
                            mapped_progress = 30 + (script_progress * 0.3)
                        elif stage == 'analyzing':
                            # Analyzing is 60-80% of total
                            mapped_progress = 60 + (script_progress * 0.2)
                        elif stage == 'generating':
                            # Generating is 80-90% of total
                            mapped_progress = 80 + (script_progress * 0.1)
                        elif stage == 'saving':
                            # Saving is 90-95% of total
                            mapped_progress = 90 + (script_progress * 0.05)
                        else:
                            mapped_progress = 30 + (script_progress * 0.65)
                        
                        try:
                            yield f"data: {json.dumps({'type': 'progress', 'stage': stage, 'message': message, 'progress': mapped_progress})}\n\n"
                        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError,
                                TimeoutError, asyncio.TimeoutError, httpx.ConnectError, httpx.TimeoutException,
                                httpx.NetworkError, httpx.ConnectTimeout, httpx.ReadTimeout):
                            # Kill the subprocess if client disconnected or network error
                            if process:
                                try:
                                    process.kill()
                                except:
                                    pass
                            raise
                    except json.JSONDecodeError:
                        pass  # Skip invalid JSON lines
            
            # Read remaining stderr
            stderr_data = await process.stderr.read()
            if stderr_data:
                stderr_lines = stderr_data.decode('utf-8').split('\n')
            
            # Wait for process to complete
            return_code = await process.wait()
            
            if return_code != 0:
                # Get error from stderr
                error_msg = '\n'.join(stderr_lines[-10:])[:500] if stderr_lines else "Unknown error"
                try:
                    yield f"data: {json.dumps({'type': 'error', 'message': f'Renderer config generation failed: {error_msg}'})}\n\n"
                except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError,
                        TimeoutError, asyncio.TimeoutError, httpx.ConnectError, httpx.TimeoutException,
                        httpx.NetworkError, httpx.ConnectTimeout, httpx.ReadTimeout):
                    raise
                return
            
            # Invalidate cache
            try:
                yield f"data: {json.dumps({'type': 'progress', 'stage': 'finalizing', 'message': 'Finalizing model addition...', 'progress': 95})}\n\n"
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError,
                    TimeoutError, asyncio.TimeoutError, httpx.ConnectError, httpx.TimeoutException,
                    httpx.NetworkError, httpx.ConnectTimeout, httpx.ReadTimeout):
                raise
            from ..cache import invalidate_models_cache
            invalidate_models_cache()
            
            # Log admin action
            log_admin_action(
                db=db,
                admin_user=current_user,
                action_type="add_model",
                action_description=f"Added model {model_id} to system",
                target_user_id=None,
                details={"model_id": model_id, "provider": provider_name},
                request=request,
            )
            
            # Send success
            try:
                yield f"data: {json.dumps({'type': 'success', 'message': f'Model {model_id} added successfully', 'model_id': model_id, 'provider': provider_name, 'progress': 100})}\n\n"
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError,
                    TimeoutError, asyncio.TimeoutError, httpx.ConnectError, httpx.TimeoutException,
                    httpx.NetworkError, httpx.ConnectTimeout, httpx.ReadTimeout):
                # Even on success, if client disconnected or network error, we should rollback
                raise
            
            # Clean up backups on success
            try:
                if backup_model_runner_path.exists():
                    backup_model_runner_path.unlink()
                if backup_config_path.exists() and config_backup:
                    backup_config_path.unlink()
            except:
                pass  # Ignore cleanup errors
            
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError, 
                TimeoutError, asyncio.TimeoutError, httpx.ConnectError, httpx.TimeoutException,
                httpx.NetworkError, httpx.ConnectTimeout, httpx.ReadTimeout) as e:
            # Client disconnected or network error - rollback all changes
            # This covers: manual cancellation, network disruptions, timeouts, connection failures
            try:
                # Kill subprocess if still running
                if process and process.returncode is None:
                    try:
                        process.kill()
                        await process.wait()
                    except:
                        pass
                
                # Restore model_runner.py backup
                if model_runner_backup and backup_model_runner_path.exists():
                    try:
                        with open(model_runner_path, "w", encoding="utf-8") as f:
                            f.write(model_runner_backup)
                        # Verify the file was written correctly before deleting backup
                        # Try to reload to verify syntax is valid
                        try:
                            importlib.reload(model_runner)
                            sys.modules[__name__].MODELS_BY_PROVIDER = model_runner.MODELS_BY_PROVIDER
                            sys.modules[__name__].OPENROUTER_MODELS = model_runner.OPENROUTER_MODELS
                            # Only delete backup if reload succeeded
                            backup_model_runner_path.unlink()
                        except (SyntaxError, ImportError, AttributeError) as reload_error:
                            # If reload fails, the backup might be corrupted or there's a deeper issue
                            # Keep the backup file for manual inspection
                            print(f"Warning: Failed to reload model_runner after rollback: {reload_error}", file=sys.stderr)
                            print(f"Backup file kept at: {backup_model_runner_path}", file=sys.stderr)
                            # Try to restore from backup again in case write failed
                            if backup_model_runner_path.exists():
                                with open(model_runner_path, "w", encoding="utf-8") as f:
                                    f.write(model_runner_backup)
                    except Exception as restore_error:
                        print(f"Error restoring model_runner.py backup: {restore_error}", file=sys.stderr)
                        print(f"Backup file location: {backup_model_runner_path}", file=sys.stderr)
                
                # Restore renderer config backup
                if config_backup and backup_config_path.exists():
                    with open(config_path, "w", encoding="utf-8") as f:
                        f.write(config_backup)
                    backup_config_path.unlink()
                else:
                    # Remove model from renderer config if it was partially added (no backup existed)
                    if config_path.exists():
                        try:
                            with open(config_path, "r", encoding="utf-8") as f:
                                configs = json.load(f)
                            if isinstance(configs, dict) and model_id in configs:
                                del configs[model_id]
                                with open(config_path, "w", encoding="utf-8") as f:
                                    json.dump(configs, f, indent=2)
                        except:
                            pass  # Ignore errors during cleanup
            except Exception as cleanup_error:
                # Log cleanup error but don't raise - we've done our best
                print(f"Error during rollback cleanup: {cleanup_error}", file=sys.stderr)
            # Don't yield error message - client is already disconnected
            return
        except HTTPException as e:
            try:
                yield f"data: {json.dumps({'type': 'error', 'message': e.detail})}\n\n"
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError,
                    TimeoutError, asyncio.TimeoutError, httpx.ConnectError, httpx.TimeoutException,
                    httpx.NetworkError, httpx.ConnectTimeout, httpx.ReadTimeout):
                # Rollback on disconnection or network error even for HTTP exceptions
                raise
        except Exception as e:
            try:
                yield f"data: {json.dumps({'type': 'error', 'message': f'Error adding model: {str(e)}'})}\n\n"
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError,
                    TimeoutError, asyncio.TimeoutError, httpx.ConnectError, httpx.TimeoutException,
                    httpx.NetworkError, httpx.ConnectTimeout, httpx.ReadTimeout):
                # Rollback on disconnection or network error
                raise
            finally:
                # On any error, attempt rollback
                try:
                    # Kill subprocess if still running
                    if process and process.returncode is None:
                        try:
                            process.kill()
                            await process.wait()
                        except:
                            pass
                    
                    # Restore backups if we had errors
                    if backup_model_runner_path.exists():
                        if model_runner_backup:
                            try:
                                with open(model_runner_path, "w", encoding="utf-8") as f:
                                    f.write(model_runner_backup)
                                # Verify restoration by attempting reload
                                try:
                                    importlib.reload(model_runner)
                                    sys.modules[__name__].MODELS_BY_PROVIDER = model_runner.MODELS_BY_PROVIDER
                                    sys.modules[__name__].OPENROUTER_MODELS = model_runner.OPENROUTER_MODELS
                                    # Only delete backup if reload succeeded
                                    backup_model_runner_path.unlink()
                                except (SyntaxError, ImportError, AttributeError) as reload_error:
                                    # Keep backup if reload fails
                                    print(f"Warning: Failed to verify rollback: {reload_error}", file=sys.stderr)
                                    print(f"Backup file kept at: {backup_model_runner_path}", file=sys.stderr)
                            except Exception as restore_error:
                                print(f"Error restoring backup in finally block: {restore_error}", file=sys.stderr)
                                print(f"Backup file location: {backup_model_runner_path}", file=sys.stderr)
                    
                    if backup_config_path.exists() and config_backup:
                        with open(config_path, "w", encoding="utf-8") as f:
                            f.write(config_backup)
                        backup_config_path.unlink()
                except:
                    pass  # Ignore cleanup errors
    
    return StreamingResponse(generate_progress_stream(), media_type="text/event-stream")


@router.post("/models/delete")
async def delete_model(
    request: Request,
    req: DeleteModelRequest,
    current_user: User = Depends(require_admin_role("admin")),
    db: Session = Depends(get_db),
):
    """
    Delete a model from model_runner.py and remove its renderer config.
    """
    model_id = req.model_id.strip()
    
    if not model_id:
        raise HTTPException(status_code=400, detail="Model ID cannot be empty")
    
    # Check if model exists
    model_found = False
    provider_name = None
    for provider, models in MODELS_BY_PROVIDER.items():
        for model in models:
            if model["id"] == model_id:
                model_found = True
                provider_name = provider
                break
        if model_found:
            break
    
    if not model_found:
        raise HTTPException(
            status_code=404,
            detail=f"Model {model_id} not found in model_runner.py"
        )
    
    # Remove from model_runner.py
    model_runner_path = Path(__file__).parent.parent / "model_runner.py"
    
    try:
        with open(model_runner_path, "r", encoding="utf-8") as f:
            content = f.read()
        
        # Find and remove the model entry
        # Model entries are multi-line dictionaries, so we need to match from opening brace to closing brace
        # Pattern: match from "id": "model_id" to the closing brace and comma (or just closing brace if last item)
        
        # First, try to match with trailing comma (not last item)
        # Match: whitespace, opening brace, "id": "model_id", then everything until closing brace and comma
        # Use a more robust pattern that matches the entire dict structure
        model_pattern_with_comma = rf'(\s*{{\s*"id":\s*"{re.escape(model_id)}".*?}},\s*\n)'
        original_content = content
        content = re.sub(model_pattern_with_comma, '', content, flags=re.DOTALL)
        
        # If no match, try without comma (last item in list)
        if content == original_content:
            model_pattern_no_comma = rf'(\s*{{\s*"id":\s*"{re.escape(model_id)}".*?}}\s*\n)'
            content = re.sub(model_pattern_no_comma, '', content, flags=re.DOTALL)
        
        # More robust: match entire dict by finding matching braces
        # This handles cases where the simple pattern doesn't work
        model_removed = False
        if content == original_content:
            # Find the start of the model dict (need to find the opening brace before "id")
            # Look for the pattern: whitespace, opening brace, then "id": "model_id"
            start_pattern = rf'(\s*{{\s*"id":\s*"{re.escape(model_id)}")'
            start_match = re.search(start_pattern, content)
            if start_match:
                # Find the actual start of the dict (the opening brace)
                # The regex matches: whitespace + { + whitespace + "id": "model_id"
                # So we need to find the { within the match
                match_start = start_match.start()
                match_text = start_match.group(1)
                # Find the opening brace in the matched text
                brace_offset = match_text.find('{')
                if brace_offset >= 0:
                    start_pos = match_start + brace_offset
                else:
                    # Fallback: search backwards from match start
                    start_pos = match_start
                    for i in range(match_start - 1, max(0, match_start - 20), -1):
                        if content[i] == '{':
                            start_pos = i
                            break
                        elif not content[i].isspace():
                            break
                # Find the matching closing brace
                brace_count = 0
                in_string = False
                escape_next = False
                for i in range(start_pos, len(content)):
                    char = content[i]
                    if escape_next:
                        escape_next = False
                        continue
                    if char == '\\':
                        escape_next = True
                        continue
                    if char == '"' and not escape_next:
                        in_string = not in_string
                        continue
                    if not in_string:
                        if char == '{':
                            brace_count += 1
                        elif char == '}':
                            brace_count -= 1
                            if brace_count == 0:
                                # Found the matching closing brace
                                end_pos = i + 1
                                # Check if there's a comma after
                                if end_pos < len(content) and content[end_pos] == ',':
                                    end_pos += 1
                                # Check if there's a newline after the comma/brace
                                if end_pos < len(content) and content[end_pos] == '\n':
                                    end_pos += 1
                                # Remove the model dict (including comma and newline if present)
                                content = content[:start_pos] + content[end_pos:]
                                model_removed = True
                                break
        
        # Verify that the model was actually removed
        if content == original_content:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to remove model {model_id} from model_runner.py. The model entry could not be found or matched."
            )
        
        # Verify the model is no longer in the content (double-check)
        if f'"id": "{model_id}"' in content:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to remove model {model_id} from model_runner.py. Model entry still present after deletion attempt."
            )
        
        # Remove model from tier classification sets (ANONYMOUS_TIER_MODELS and FREE_TIER_MODELS)
        # Remove from ANONYMOUS_TIER_MODELS
        anonymous_pattern = r'(ANONYMOUS_TIER_MODELS\s*=\s*\{)(.*?)(\s*\})'
        match = re.search(anonymous_pattern, content, re.DOTALL)
        if match:
            anonymous_content = match.group(2)
            # Remove the model entry (with or without trailing comma)
            anonymous_content = re.sub(rf'\s*"{re.escape(model_id)}",?\s*(?:#.*)?\n?', '', anonymous_content)
            content = content[:match.start(2)] + anonymous_content + content[match.end(2):]
        
        # Remove from FREE_TIER_MODELS
        # Pattern matches: FREE_TIER_MODELS = ANONYMOUS_TIER_MODELS.union({ ... })
        free_pattern = r'(FREE_TIER_MODELS\s*=\s*ANONYMOUS_TIER_MODELS\.union\()(\{)(.*?)(\})(\))'
        match = re.search(free_pattern, content, re.DOTALL)
        if match:
            free_content = match.group(3)  # The content inside the set literal
            # Remove the model entry (with or without trailing comma)
            free_content = re.sub(rf'\s*"{re.escape(model_id)}",?\s*(?:#.*)?\n?', '', free_content)
            content = content[:match.start(3)] + free_content + content[match.end(3):]
        
        # If provider list becomes empty, remove the provider section
        # This is more complex, so we'll leave empty provider lists for now
        
        # Write back to file
        with open(model_runner_path, "w", encoding="utf-8") as f:
            f.write(content)
        
        # Reload the model_runner module to get updated MODELS_BY_PROVIDER
        importlib.reload(model_runner)
        # Update the imported references in this module's namespace
        sys.modules[__name__].MODELS_BY_PROVIDER = model_runner.MODELS_BY_PROVIDER
        sys.modules[__name__].OPENROUTER_MODELS = model_runner.OPENROUTER_MODELS
        
        # Refresh token limits for the newly added model
        refresh_model_token_limits(model_id)
        
        # Remove renderer config from frontend config file
        project_root = Path(__file__).parent.parent.parent.parent
        frontend_config_path = project_root / "frontend" / "src" / "config" / "model_renderer_configs.json"
        
        if frontend_config_path.exists():
            try:
                with open(frontend_config_path, "r", encoding="utf-8") as f:
                    configs = json.load(f)
                
                # Filter out the deleted model's config
                if isinstance(configs, list):
                    configs = [c for c in configs if c.get("modelId") != model_id]
                elif isinstance(configs, dict):
                    configs.pop(model_id, None)
                    configs = list(configs.values())
                
                with open(frontend_config_path, "w", encoding="utf-8") as f:
                    json.dump(configs, f, indent=2, ensure_ascii=False)
            except Exception as e:
                # Log but don't fail if config removal fails
                print(f"Warning: Could not remove renderer config from {frontend_config_path}: {e}")
        
        # Invalidate models cache so fresh data is returned
        from ..cache import invalidate_models_cache
        invalidate_models_cache()
        
        # Log admin action
        log_admin_action(
            db=db,
            admin_user=current_user,
            action_type="delete_model",
            action_description=f"Deleted model {model_id} from system",
            target_user_id=None,
            details={"model_id": model_id, "provider": provider_name},
            request=request,
        )
        
        return {
            "success": True,
            "model_id": model_id,
            "message": f"Model {model_id} deleted successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error deleting model: {str(e)}"
        )
