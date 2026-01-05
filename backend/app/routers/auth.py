"""
Authentication router for user registration, login, and verification.

This module handles all authentication-related endpoints including
user registration, login, email verification, and password resets.
"""

from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks, Request, Response
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import Dict, Optional
from collections import defaultdict
import os
import httpx
import logging
from ..database import get_db
from ..config import settings

logger = logging.getLogger(__name__)
from ..models import User, UserPreference
from ..schemas import (
    UserRegister,
    UserLogin,
    UserResponse,
    TokenResponse,
    EmailVerification,
    ResendVerificationRequest,
    PasswordResetRequest,
    PasswordReset,
    RefreshTokenRequest,
)
from ..auth import (
    verify_password,
    get_password_hash,
    create_access_token,
    create_refresh_token,
    generate_verification_token,
    verify_token,
)
from ..dependencies import get_current_user_required, get_current_verified_user, get_current_user
from ..email_service import send_verification_email, send_password_reset_email
from ..utils.cookies import set_auth_cookies, clear_auth_cookies, get_refresh_token_from_cookies

router = APIRouter(prefix="/auth", tags=["Authentication"])

# Rate limiting for login attempts
# Track failed login attempts per IP address
failed_login_attempts: Dict[str, list] = defaultdict(list)
MAX_LOGIN_ATTEMPTS = 5
LOCKOUT_DURATION_MINUTES = 15


def get_client_ip(request: Request) -> str:
    """Extract client IP address from request."""
    # Check for forwarded IP (when behind proxy/load balancer)
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        # Take the first IP in the chain
        return forwarded.split(",")[0].strip()
    # Fallback to direct client IP
    return request.client.host if request.client else "unknown"


def check_login_rate_limit(client_ip: str) -> None:
    """
    Check if IP has exceeded login attempt rate limit.

    Raises HTTPException if rate limit exceeded.
    """
    now = datetime.utcnow()

    # Clean old attempts outside lockout window
    failed_login_attempts[client_ip] = [
        attempt for attempt in failed_login_attempts[client_ip] if attempt > now - timedelta(minutes=LOCKOUT_DURATION_MINUTES)
    ]

    # Check if limit exceeded
    if len(failed_login_attempts[client_ip]) >= MAX_LOGIN_ATTEMPTS:
        oldest_attempt = min(failed_login_attempts[client_ip])
        lockout_until = oldest_attempt + timedelta(minutes=LOCKOUT_DURATION_MINUTES)
        remaining_seconds = int((lockout_until - now).total_seconds())

        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many login attempts. Please try again in {remaining_seconds} seconds.",
        )


def record_failed_login(client_ip: str) -> None:
    """Record a failed login attempt for the given IP."""
    failed_login_attempts[client_ip].append(datetime.utcnow())


def clear_login_attempts(client_ip: str) -> None:
    """Clear failed login attempts for the given IP (on successful login)."""
    if client_ip in failed_login_attempts:
        del failed_login_attempts[client_ip]


async def verify_recaptcha(token: Optional[str]) -> bool:
    """
    Verify reCAPTCHA v3 token with Google's API.

    Args:
        token: reCAPTCHA token from frontend

    Returns:
        bool: True if verification passes, False otherwise
    """
    # If reCAPTCHA is not configured, skip verification (for development)
    if not settings.recaptcha_secret_key:
        logger.debug("reCAPTCHA secret key not configured, skipping verification")
        return True

    # If token is not provided and reCAPTCHA is configured, fail
    if not token:
        logger.warning("reCAPTCHA verification failed: token not provided (reCAPTCHA is configured)")
        return False

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.post(
                "https://www.google.com/recaptcha/api/siteverify",
                data={
                    "secret": settings.recaptcha_secret_key,
                    "response": token,
                },
            )
            result = response.json()

            if not result.get("success", False):
                error_codes = result.get("error-codes", [])
                logger.warning(
                    f"reCAPTCHA verification failed: success=false, "
                    f"error_codes={error_codes}, "
                    f"token_preview={token[:20] if token else 'None'}..."
                )
                return False

            score = result.get("score", 0.0)
            # reCAPTCHA v3 returns a score (0.0 to 1.0)
            # Score >= 0.5 is typically considered human
            # You can adjust this threshold based on your needs
            if score < 0.5:
                logger.warning(f"reCAPTCHA verification failed: score too low (score={score}, threshold=0.5)")
                return False

            logger.debug(f"reCAPTCHA verification passed: score={score}")
            return True
    except httpx.TimeoutException as e:
        logger.error(f"reCAPTCHA verification timeout: {e}")
        return False
    except httpx.RequestError as e:
        logger.error(f"reCAPTCHA verification request error: {e}")
        return False
    except Exception as e:
        logger.error(f"reCAPTCHA verification unexpected error: {e}", exc_info=True)
        # Fail closed - if verification fails, reject registration
        return False


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(user_data: UserRegister, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """
    Register a new user account.

    - Validates reCAPTCHA v3 token (if configured)
    - Creates user with hashed password
    - Generates email verification token
    - Sends verification email
    - Returns access token, refresh token, and user data
    """
    # Verify reCAPTCHA if configured
    if not await verify_recaptcha(user_data.recaptcha_token):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="reCAPTCHA verification failed. Please try again.")

    try:
        # Check if user already exists
        existing_user = db.query(User).filter(User.email == user_data.email).first()
        if existing_user:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error checking existing user: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

    try:
        # Create new user
        verification_token = generate_verification_token()
        new_user = User(
            email=user_data.email,
            password_hash=get_password_hash(user_data.password),
            verification_token=verification_token,
            verification_token_expires=datetime.utcnow() + timedelta(hours=24),
            subscription_tier="free",
            subscription_status="active",
        )
        db.add(new_user)
        db.commit()
        db.refresh(new_user)

        # Create default user preferences
        preferences = UserPreference(user_id=new_user.id, theme="light", email_notifications=True, usage_alerts=True)
        db.add(preferences)
        db.commit()

        # Send verification email in background (optional - won't fail if email not configured)
        try:
            if os.environ.get("ENVIRONMENT") == "development":
                # Development: await to see console output immediately
                await send_verification_email(email=new_user.email, token=verification_token)
            else:
                # Production: background task for non-blocking
                background_tasks.add_task(send_verification_email, email=new_user.email, token=verification_token)
        except Exception as e:
            print(f"Warning: Could not send verification email: {e}")
            # Continue anyway - email is optional for development

        # Generate tokens for immediate login
        access_token = create_access_token(data={"sub": str(new_user.id)})
        refresh_token = create_refresh_token(data={"sub": str(new_user.id)})

        # Convert user to dict for response
        user_dict = {
            "id": new_user.id,
            "email": new_user.email,
            "is_verified": new_user.is_verified,
            "is_active": new_user.is_active,
            "subscription_tier": new_user.subscription_tier,
            "subscription_status": new_user.subscription_status,
            "subscription_period": new_user.subscription_period,
            # Legacy: daily_usage_count removed - use credits_used_this_period instead
            "monthly_overage_count": new_user.monthly_overage_count,
            "created_at": new_user.created_at.isoformat() if new_user.created_at else None,
        }

        # Create response with cookies
        # Return dict and let FastAPI handle status code from decorator
        response_data = {"access_token": access_token, "refresh_token": refresh_token, "token_type": "bearer", "user": user_dict}
        response = JSONResponse(
            content=response_data,
            status_code=status.HTTP_201_CREATED
        )
        set_auth_cookies(response, access_token, refresh_token)
        return response
    except HTTPException:
        raise
    except Exception as e:
        import traceback

        traceback.print_exc()
        print(f"Registration error: {e}")
        raise HTTPException(status_code=500, detail=f"Registration failed: {str(e)}")


@router.post("/login", response_model=TokenResponse)
async def login(user_data: UserLogin, request: Request, db: Session = Depends(get_db)):
    """
    Login user and return JWT tokens.

    - Validates email and password
    - Returns access token (30 min) and refresh token (7 days)
    - Requires active account (but not verified email)
    - Rate limited: 5 attempts per 15 minutes per IP
    """
    import time

    start_time = time.time()
    print(f"[LOGIN] Login request received at {time.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"[LOGIN] Email: {user_data.email}")

    try:
        client_ip = get_client_ip(request)
        print(f"[LOGIN] Client IP: {client_ip}")

        # Check rate limiting before processing login
        print(f"[LOGIN] Checking rate limit...")
        check_login_rate_limit(client_ip)
        print(f"[LOGIN] Rate limit check passed")

        print(f"[LOGIN] Querying database for user...")
        db_start = time.time()
        user = db.query(User).filter(User.email == user_data.email).first()
        db_duration = time.time() - db_start
        print(f"[LOGIN] Database query completed in {db_duration:.3f}s")

        if not user:
            print(f"[LOGIN] User not found")
            record_failed_login(client_ip)
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password")

        print(f"[LOGIN] User found: {user.email}, verifying password...")
        verify_start = time.time()
        password_valid = verify_password(user_data.password, user.password_hash)
        verify_duration = time.time() - verify_start
        print(f"[LOGIN] Password verification completed in {verify_duration:.3f}s, result: {password_valid}")

        if not password_valid:
            print(f"[LOGIN] Password verification failed")
            record_failed_login(client_ip)
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password")

        if not user.is_active:
            print(f"[LOGIN] Account is inactive")
            record_failed_login(client_ip)
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is inactive")

        # Clear failed attempts on successful login
        clear_login_attempts(client_ip)

        # Update last_access timestamp
        user.last_access = datetime.utcnow()
        db.commit()

        # Create tokens
        print(f"[LOGIN] Creating tokens...")
        token_start = time.time()
        access_token = create_access_token(data={"sub": str(user.id)})
        refresh_token = create_refresh_token(data={"sub": str(user.id)})
        token_duration = time.time() - token_start
        print(f"[LOGIN] Token creation completed in {token_duration:.3f}s")

        total_duration = time.time() - start_time
        print(f"[LOGIN] Login successful, total time: {total_duration:.3f}s")

        # Create response with cookies
        response = JSONResponse(content={"access_token": access_token, "refresh_token": refresh_token, "token_type": "bearer"})
        set_auth_cookies(response, access_token, refresh_token)
        return response
    except HTTPException:
        total_duration = time.time() - start_time
        print(f"[LOGIN] Login failed (HTTPException), total time: {total_duration:.3f}s")
        raise
    except Exception as e:
        total_duration = time.time() - start_time
        print(f"[LOGIN] Login error after {total_duration:.3f}s: {type(e).__name__}: {str(e)}")
        import traceback

        traceback.print_exc()
        raise


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(request: Request, token_data: Optional[RefreshTokenRequest] = None, db: Session = Depends(get_db)):
    """
    Refresh access token using refresh token.

    - Validates refresh token from cookies (preferred) or request body (backward compatibility)
    - Returns new access token and refresh token in cookies
    """
    try:
        # Prioritize request body token if provided (for explicit testing/API usage)
        # Otherwise fall back to cookies (for browser-based usage)
        refresh_token_value = None
        if token_data and token_data.refresh_token:
            refresh_token_value = token_data.refresh_token
        else:
            refresh_token_value = get_refresh_token_from_cookies(request)

        if not refresh_token_value:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token required")

        payload = verify_token(refresh_token_value, token_type="refresh")

        if payload is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

        user_id_str = payload.get("sub")
        if user_id_str is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

        # Convert user_id to int, handling potential errors
        try:
            user_id = int(user_id_str)
        except (ValueError, TypeError):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

        user = db.query(User).filter(User.id == user_id).first()
        if not user or not user.is_active:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")

        # Create new tokens
        access_token = create_access_token(data={"sub": str(user.id)})
        new_refresh_token = create_refresh_token(data={"sub": str(user.id)})

        # Create response with cookies
        response = JSONResponse(content={"access_token": access_token, "refresh_token": new_refresh_token, "token_type": "bearer"})
        set_auth_cookies(response, access_token, new_refresh_token)
        return response
    except HTTPException:
        # Re-raise HTTP exceptions (401, etc.) as-is
        raise
    except Exception as e:
        # Catch any other exceptions (malformed tokens, database errors, etc.)
        # and return 401 instead of 500 to avoid exposing internal errors
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")


@router.post("/verify-email", status_code=status.HTTP_200_OK)
async def verify_email(verification: EmailVerification, db: Session = Depends(get_db)):
    """
    Verify user email with token.

    - Validates verification token
    - Marks email as verified
    - Clears verification token
    """
    print(f"Received verification request for token: {verification.token}")

    user = (
        db.query(User)
        .filter(User.verification_token == verification.token, User.verification_token_expires > datetime.utcnow())
        .first()
    )

    if not user:
        print(f"No user found with token: {verification.token}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired verification token")

    print(f"Verifying email for user: {user.email}")
    user.is_verified = True
    user.verification_token = None
    user.verification_token_expires = None
    db.commit()

    return {"message": "Email verified successfully"}


@router.post("/resend-verification", status_code=status.HTTP_200_OK)
async def resend_verification(request: ResendVerificationRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """
    Resend verification email with rate limiting.

    - Rate limit: 1 request per minute per email
    - Generates new verification token
    - Sends new verification email
    - Returns success message (doesn't reveal if email exists)
    """
    user = db.query(User).filter(User.email == request.email).first()

    if not user:
        # Don't reveal if email exists - security best practice
        return {"message": "If the email exists and is not verified, a verification link has been sent"}

    if user.is_verified:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already verified")

    # Rate limiting: Check if user has requested too recently (within 60 seconds)
    if user.verification_token_expires:
        # Calculate time since last token generation
        # We use token expiry as a proxy for when the last resend was requested
        # Token expires in 24 hours, so if it's recent, check the creation time
        time_since_last_request = datetime.utcnow() - (user.verification_token_expires - timedelta(hours=24))

        if time_since_last_request.total_seconds() < 60:
            remaining_seconds = int(60 - time_since_last_request.total_seconds())
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Please wait {remaining_seconds} seconds before requesting another verification email",
            )

    # Generate new token
    verification_token = generate_verification_token()
    user.verification_token = verification_token
    user.verification_token_expires = datetime.utcnow() + timedelta(hours=24)
    db.commit()

    # In development, await the email function to see console output immediately
    # In production, use background task for non-blocking email sending
    try:
        if os.environ.get("ENVIRONMENT") == "development":
            # Development: await to see console output immediately
            await send_verification_email(email=user.email, token=verification_token)
        else:
            # Production: background task for non-blocking
            background_tasks.add_task(send_verification_email, email=user.email, token=verification_token)
    except Exception as e:
        print(f"Warning: Could not send verification email: {e}")
        # Continue anyway - in development, token is printed to console

    return {"message": "Verification email sent"}


@router.post("/forgot-password", status_code=status.HTTP_200_OK)
async def forgot_password(request: PasswordResetRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """
    Request password reset.

    - Generates password reset token
    - Sends reset email
    - Returns success message (doesn't reveal if email exists)
    """
    user = db.query(User).filter(User.email == request.email).first()

    if not user:
        # Don't reveal if email exists - security best practice
        return {"message": "If the email exists, a reset link has been sent"}

    # Generate reset token
    reset_token = generate_verification_token()
    user.reset_token = reset_token
    user.reset_token_expires = datetime.utcnow() + timedelta(hours=1)
    db.commit()

    # In development, await the email function to see console output immediately
    # In production, use background task for non-blocking email sending
    try:
        if os.environ.get("ENVIRONMENT") == "development":
            # Development: await to see console output immediately
            await send_password_reset_email(email=user.email, token=reset_token)
        else:
            # Production: background task for non-blocking
            background_tasks.add_task(send_password_reset_email, email=user.email, token=reset_token)
    except Exception as e:
        print(f"Warning: Could not send password reset email: {e}")
        # Continue anyway - in development, token is printed to console

    return {"message": "Password reset email sent"}


@router.post("/reset-password", status_code=status.HTTP_200_OK)
async def reset_password(reset: PasswordReset, db: Session = Depends(get_db)):
    """
    Reset password with token.

    - Validates reset token
    - Updates password
    - Clears reset token
    """
    user = db.query(User).filter(User.reset_token == reset.token, User.reset_token_expires > datetime.utcnow()).first()

    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired reset token")

    user.password_hash = get_password_hash(reset.new_password)
    user.reset_token = None
    user.reset_token_expires = None
    db.commit()

    return {"message": "Password reset successfully", "email": user.email}


@router.get("/test")
async def test_endpoint() -> Dict[str, str]:
    """Test endpoint to verify basic functionality."""
    return {"message": "Auth router is working"}


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: User = Depends(get_current_user_required), db: Session = Depends(get_db)):
    """
    Get current authenticated user information.

    - Returns user profile data
    - Requires valid access token
    - Refreshes user data from database to get latest usage counts
    """
    # Refresh the user object from the database to get the latest data
    # This is important after usage increments in /compare-stream endpoint
    db.refresh(current_user)
    print(f"[/auth/me] Returning user data for {current_user.email}: credits_used={current_user.credits_used_this_period}")
    return current_user


@router.delete("/delete-account", status_code=status.HTTP_200_OK)
async def delete_account(current_user: User = Depends(get_current_verified_user), db: Session = Depends(get_db)):
    """
    Delete user account permanently.

    - Requires verified email
    - Deletes all user data (cascade)
    - Cannot be undone
    """
    db.delete(current_user)
    db.commit()

    return {"message": "Account deleted successfully"}


@router.post("/logout", status_code=status.HTTP_200_OK)
async def logout(response: Response, current_user: User = Depends(get_current_user_required)):
    """
    Logout user by clearing authentication cookies.

    Note: With JWT, logout is primarily client-side cookie clearing.
    For additional security, implement token blacklisting with Redis.
    """
    clear_auth_cookies(response)
    return {"message": "Logged out successfully"}
