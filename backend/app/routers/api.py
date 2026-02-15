"""Core API routes: /models, /compare-stream, conversations, etc."""

import asyncio
import json
import logging
import os
import time
from collections import defaultdict
from datetime import UTC, datetime, timedelta
from decimal import ROUND_CEILING, Decimal
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Body, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..config import get_model_limit
from ..config.settings import settings
from ..credit_manager import (
    check_and_reset_credits_if_needed,
    ensure_credits_allocated,
    get_credit_usage_stats,
    get_user_credits,
)
from ..database import get_db
from ..dependencies import get_current_user
from ..model_runner import (
    MODELS_BY_PROVIDER,
    OPENROUTER_MODELS,
    call_openrouter_streaming,
    clean_model_response,
    estimate_token_count,
)
from ..models import (
    AppSettings,
    Conversation,
    UsageLog,
    User,
)
from ..models import (
    ConversationMessage as ConversationMessageModel,
)
from ..rate_limiting import (
    anonymous_rate_limit_storage,
    check_anonymous_credits,
    # Credit-based functions
    deduct_anonymous_credits,
    deduct_user_credits,
    get_anonymous_usage_stats,
    get_user_usage_stats,
)
from ..schemas import BreakoutConversationCreate, ConversationDetail, ConversationSummary
from ..search.factory import SearchProviderFactory

router = APIRouter(tags=["API"])
logger = logging.getLogger(__name__)

model_stats: dict[str, dict[str, Any]] = defaultdict(
    lambda: {"success": 0, "failure": 0, "last_error": None, "last_success": None}
)

from ..config import (
    ANONYMOUS_MODEL_LIMIT,
    get_conversation_limit,
)
from ..config.constants import DAILY_CREDIT_LIMITS


class ConversationMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str
    model_id: str | None = (
        None  # Optional model ID for assistant messages (used to filter per-model history)
    )

    model_config = ConfigDict(
        json_schema_extra={
            "example": {"role": "user", "content": "What is artificial intelligence?"}
        }
    )


class CompareRequest(BaseModel):
    input_data: str
    models: list[str]
    conversation_history: list[ConversationMessage] = []  # Optional conversation context
    browser_fingerprint: str | None = None  # Optional browser fingerprint for rate limiting
    conversation_id: int | None = (
        None  # Optional conversation ID for follow-ups (most reliable matching)
    )
    estimated_input_tokens: int | None = (
        None  # Optional: Accurate token count from frontend (from /estimate-tokens endpoint)
    )
    timezone: str | None = (
        None  # Optional: IANA timezone string (e.g., "America/Chicago") for credit reset timing
    )
    location: str | None = (
        None  # Optional: User-provided location (e.g., "Granbury, TX, USA") - most accurate, takes priority over IP-based detection
    )
    enable_web_search: bool = False  # Optional: Enable web search tool for models that support it

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "input_data": "Explain quantum computing in simple terms",
                "models": ["openai/gpt-4", "anthropic/claude-3-opus", "google/gemini-pro"],
                "conversation_history": [
                    {"role": "user", "content": "What is AI?"},
                    {"role": "assistant", "content": "AI stands for Artificial Intelligence..."},
                ],
                "conversation_id": 123,
            }
        }
    )


class CompareResponse(BaseModel):
    results: dict[str, str]
    metadata: dict[str, Any]


class EstimateTokensRequest(BaseModel):
    """Request model for token estimation endpoint."""

    input_data: str
    model_id: str | None = None  # Optional model ID for accurate token counting
    conversation_history: list[
        ConversationMessage
    ] = []  # Optional conversation context (with optional model_id for filtering)

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "input_data": "Explain quantum computing",
                "model_id": "openai/gpt-4",
                "conversation_history": [
                    {"role": "user", "content": "What is AI?"},
                    {"role": "assistant", "content": "AI stands for..."},
                ],
            }
        }
    )


class EstimateTokensResponse(BaseModel):
    """Response model for token estimation endpoint."""

    input_tokens: int
    conversation_history_tokens: int
    total_input_tokens: int
    model_id: str | None = None


class ResetRateLimitRequest(BaseModel):
    fingerprint: str | None = None




def get_client_ip(request: Request) -> str:
    """Extract client IP address from request, handling proxies"""
    # Check for X-Forwarded-For header (common with proxies/load balancers)
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        # Take the first IP if there are multiple
        return forwarded_for.split(",")[0].strip()

    # Check for X-Real-IP header
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip.strip()

    # Fall back to direct client connection
    if request.client:
        return request.client.host

    return "unknown"


async def get_location_from_ip(ip_address: str) -> str | None:
    """
    Get approximate location from IP address using a geolocation service.
    Returns location string like "New York, NY, USA" or None if unavailable.

    Uses ip-api.com free tier (45 requests/minute, no API key required).
    Falls back gracefully if service is unavailable.
    """
    if not ip_address or ip_address == "unknown":
        return None

    # Skip localhost/private IPs (won't have valid geolocation)
    if (
        ip_address.startswith("127.")
        or ip_address.startswith("192.168.")
        or ip_address.startswith("10.")
        or ip_address == "::1"
    ):
        return None

    try:
        import httpx

        async with httpx.AsyncClient(timeout=2.0) as client:
            # Use ip-api.com free tier (no API key required, 45 req/min)
            response = await client.get(
                f"http://ip-api.com/json/{ip_address}", params={"fields": "city,regionName,country"}
            )
            if response.status_code == 200:
                data = response.json()
                if data.get("status") == "success":
                    city = data.get("city", "")
                    region = data.get("regionName", "")
                    country = data.get("country", "")
                    parts = [p for p in [city, region, country] if p]
                    location_str = ", ".join(parts) if parts else None
                    if location_str:
                        return location_str
    except Exception as e:
        # Log error in development for debugging, but don't break the request
        if settings.environment == "development":
            logging.getLogger(__name__).debug(f"Geolocation lookup failed for IP {ip_address}: {e}")

    return None


def get_timezone_from_request(
    req: CompareRequest, current_user: User | None = None, db: Session | None = None
) -> str:
    """
    Get timezone from request, user preferences, or default to UTC.

    Priority:
    1. Timezone from request body (req.timezone)
    2. User's stored timezone preference (for authenticated users)
    3. Default to UTC

    Args:
        req: CompareRequest object
        current_user: Optional authenticated user
        db: Optional database session (needed to access user preferences)

    Returns:
        IANA timezone string (e.g., "America/Chicago")
    """
    import pytz

    # First priority: timezone from request
    if req.timezone:
        try:
            pytz.timezone(req.timezone)
            # For authenticated users, save timezone to preferences if different
            if current_user and db:
                if not current_user.preferences:
                    from ..models import UserPreference

                    current_user.preferences = UserPreference(
                        user_id=current_user.id, timezone=req.timezone
                    )
                    db.commit()
                elif current_user.preferences.timezone != req.timezone:
                    current_user.preferences.timezone = req.timezone
                    db.commit()
            return req.timezone
        except (pytz.exceptions.UnknownTimeZoneError, AttributeError):
            pass  # Fall through to next priority

    # Second priority: user's stored timezone preference
    if current_user and db:
        db.refresh(current_user)
        if current_user.preferences and current_user.preferences.timezone:
            try:
                pytz.timezone(current_user.preferences.timezone)
                return current_user.preferences.timezone
            except (pytz.exceptions.UnknownTimeZoneError, AttributeError):
                pass

    # Default to UTC
    return "UTC"


def log_usage_to_db(usage_log: UsageLog, db: Session) -> None:
    """Background task to log usage to database without blocking the response."""
    try:
        db.add(usage_log)
        db.commit()
    except Exception as e:
        print(f"Failed to log usage to database: {e}")
        db.rollback()
    finally:
        db.close()


@router.get("/models")
async def get_available_models(
    current_user: User | None = Depends(get_current_user),
) -> dict[str, Any]:
    """
    Get list of all AI models with tier_access field indicating availability.

    - Returns ALL models from model_runner.py
    - Models are marked with tier_access field ('unregistered', 'free', or 'paid')
    - Frontend displays locked models as disabled/restricted for unregistered and free tiers
    - Backend still validates model access when making API calls
    - During 7-day trial, paid models get trial_unlocked=True flag

    Note: This endpoint doesn't use caching when user is authenticated with trial
    because the response depends on user-specific trial status.
    """
    from ..model_runner import filter_models_by_tier, get_model_token_limits_from_openrouter

    # Determine user tier and trial status
    if current_user:
        tier = current_user.subscription_tier or "free"
        is_trial_active = current_user.is_trial_active
    else:
        tier = "unregistered"
        is_trial_active = False

    def get_models():
        # Get all models with tier_access field (no filtering - show all models)
        # Pass trial status to mark premium models as unlocked during trial
        all_models = filter_models_by_tier(OPENROUTER_MODELS, tier, is_trial_active)

        # Add token limits to each model
        for model in all_models:
            limits = get_model_token_limits_from_openrouter(model["id"])
            if limits:
                # Include token limits directly (accurate)
                model["max_input_tokens"] = limits["max_input"]
                model["max_output_tokens"] = limits["max_output"]
            else:
                # Default fallback values
                model["max_input_tokens"] = 8192
                model["max_output_tokens"] = 8192

        # Get all models_by_provider with tier_access field
        models_by_provider = {}
        for provider, models in MODELS_BY_PROVIDER.items():
            provider_models = filter_models_by_tier(models, tier, is_trial_active)
            if provider_models:  # Add provider if it has any models
                # Add token limits to provider models too
                for model in provider_models:
                    limits = get_model_token_limits_from_openrouter(model["id"])
                    if limits:
                        # Include token limits directly (accurate)
                        model["max_input_tokens"] = limits["max_input"]
                        model["max_output_tokens"] = limits["max_output"]
                    else:
                        model["max_input_tokens"] = 8192
                        model["max_output_tokens"] = 8192
                models_by_provider[provider] = provider_models

        return {
            "models": all_models,
            "models_by_provider": models_by_provider,
            "user_tier": tier,
            "is_trial_active": is_trial_active,
        }

    # If user has active trial, don't use cache (response is user-specific)
    if is_trial_active:
        return get_models()

    # For non-trial users, use caching
    from ..cache import get_cached_models

    return get_cached_models(get_models)


@router.get("/anonymous-mock-mode-status")
async def get_anonymous_mock_mode_status(db: Session = Depends(get_db)):
    """
    Public endpoint to check if anonymous mock mode is enabled.
    Only returns status in development environment.

    OPTIMIZATION: Uses caching to avoid repeated database queries.
    """
    is_development = os.environ.get("ENVIRONMENT") == "development"

    if not is_development:
        return {"anonymous_mock_mode_enabled": False, "is_development": False}

    # Use cache to avoid repeated database queries
    from ..cache import get_cached_app_settings

    def get_settings():
        return db.query(AppSettings).first()

    settings = get_cached_app_settings(get_settings)

    # If no settings exist yet, create default ones
    if not settings:
        settings = AppSettings(anonymous_mock_mode_enabled=False)
        db.add(settings)
        db.commit()
        db.refresh(settings)
        # Invalidate cache after creating new settings
        from ..cache import invalidate_app_settings_cache

        invalidate_app_settings_cache()

    return {
        "anonymous_mock_mode_enabled": settings.anonymous_mock_mode_enabled,
        "is_development": True,
    }


@router.get("/rate-limit-status")
async def get_rate_limit_status(
    request: Request,
    fingerprint: str | None = None,
    current_user: User | None = Depends(get_current_user),
    db: Session = Depends(get_db),
    timezone: str | None = None,
):
    """
    Get current rate limit status for the client.

    Returns different information for authenticated vs unregistered users.
    """
    if current_user:
        # Authenticated user - return subscription-based usage
        # Refresh user data from database to get latest usage counts
        db.refresh(current_user)
        usage_stats = get_user_usage_stats(current_user)
        return {
            **usage_stats,
            "authenticated": True,
            "email": current_user.email,
            "subscription_status": current_user.subscription_status,
        }
    # Unregistered user - return IP/fingerprint-based usage
    client_ip = get_client_ip(request)
    # Get timezone from query parameter or header, default to UTC
    import pytz

    user_timezone = "UTC"
    if timezone:
        try:
            pytz.timezone(timezone)
            user_timezone = timezone
        except (pytz.exceptions.UnknownTimeZoneError, AttributeError):
            pass
    else:
        header_tz = request.headers.get("X-Timezone")
        if header_tz:
            try:
                pytz.timezone(header_tz)
                user_timezone = header_tz
            except (pytz.exceptions.UnknownTimeZoneError, AttributeError):
                pass

    usage_stats = get_anonymous_usage_stats(f"ip:{client_ip}", user_timezone)

    result = {**usage_stats, "authenticated": False, "ip_address": client_ip}

    # Include fingerprint stats if provided
    if fingerprint:
        fp_stats = get_anonymous_usage_stats(f"fp:{fingerprint}", user_timezone)
        result["fingerprint_usage"] = fp_stats["daily_usage"]
        result["fingerprint_remaining"] = fp_stats["remaining_usage"]

    return result


@router.get("/model-stats")
async def get_model_stats():
    """Get success/failure statistics for all models"""
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
    DEV ONLY: Reset rate limits, usage counts, and conversation history for the current user.
    For authenticated users: resets database usage and deletes their conversations.
    For unregistered users: resets IP/fingerprint-based rate limits (client clears localStorage).
    This endpoint should be disabled in production!
    """
    # Only allow in development mode
    if os.environ.get("ENVIRONMENT") != "development":
        raise HTTPException(
            status_code=403, detail="This endpoint is only available in development mode"
        )

    client_ip = get_client_ip(request)
    deleted_count = 0

    # For authenticated users: reset usage and delete their conversations
    if current_user:
        # Reset usage counts (credits are reset via credit_manager, not here)
        current_user.monthly_overage_count = 0
        current_user.daily_extended_usage = 0

        # Delete only this user's conversations (messages deleted via cascade)
        deleted_count = (
            db.query(Conversation).filter(Conversation.user_id == current_user.id).delete()
        )
        db.commit()

    # For unregistered users: reset IP-based rate limits
    # (frontend will handle localStorage clearing)
    ip_key = f"ip:{client_ip}"
    if ip_key in anonymous_rate_limit_storage:
        del anonymous_rate_limit_storage[ip_key]

    # Reset fingerprint-based rate limit if provided
    fingerprint = req_body.fingerprint
    if fingerprint:
        fp_key = f"fp:{fingerprint}"
        if fp_key in anonymous_rate_limit_storage:
            del anonymous_rate_limit_storage[fp_key]

    # Clear login rate limiting for this IP and all IPs (for E2E tests)
    # E2E tests may use different IPs, so clear everything
    from ..routers.auth import failed_login_attempts

    failed_login_attempts.clear()  # Clear all login attempts for E2E tests

    return {
        "message": "Rate limits, usage, and conversation history reset successfully",
        "ip_address": client_ip,
        "fingerprint_reset": fingerprint is not None,
        "conversations_deleted": deleted_count,
        "user_type": "authenticated" if current_user else "anonymous",
    }


class CreateTestUserRequest(BaseModel):
    """Request model for creating test users."""

    email: str
    password: str
    role: str | None = "user"
    is_admin: bool | None = False
    subscription_tier: str | None = "free"
    is_verified: bool | None = True
    is_active: bool | None = True


@router.post("/dev/create-test-user")
async def create_test_user_dev(
    user_data: CreateTestUserRequest,
    db: Session = Depends(get_db),
):
    """
    DEV ONLY: Create or update a test user directly in the database.
    This bypasses registration and is used for E2E test setup.
    This endpoint should be disabled in production!
    """
    # Only allow in development mode
    if os.environ.get("ENVIRONMENT") != "development":
        raise HTTPException(
            status_code=403, detail="This endpoint is only available in development mode"
        )

    # Check for test database or development environment
    # Allow in development mode OR if database URL contains "test"
    database_url = os.getenv("DATABASE_URL", "") or getattr(settings, "database_url", "")
    environment = os.environ.get("ENVIRONMENT", "").lower()
    is_test_db = database_url and "test" in database_url.lower()
    is_dev_mode = environment == "development"
    
    if database_url and not is_test_db and not is_dev_mode:
        raise HTTPException(
            status_code=403, detail="This endpoint is only available with test databases or in development mode"
        )

    from datetime import UTC

    from ..auth import get_password_hash

    # Check if user already exists
    existing_user = db.query(User).filter(User.email == user_data.email).first()

    if existing_user:
        # Update existing user
        existing_user.password_hash = get_password_hash(user_data.password)
        existing_user.role = user_data.role
        existing_user.is_admin = user_data.is_admin
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
    # Create new user
    new_user = User(
        email=user_data.email,
        password_hash=get_password_hash(user_data.password),
        role=user_data.role,
        is_admin=user_data.is_admin,
        subscription_tier=user_data.subscription_tier,
        subscription_status="active",
        subscription_period="monthly",
        is_verified=user_data.is_verified,
        is_active=user_data.is_active,
        subscription_start_date=datetime.now(UTC),
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # Create default user preferences
    try:
        from ..models import UserPreference

        preferences = UserPreference(
            user_id=new_user.id, theme="light", email_notifications=True, usage_alerts=True
        )
        db.add(preferences)
        db.commit()
    except Exception as e:
        # Preferences might already exist or creation might fail - not critical
        logging.warning(f"Could not create user preferences: {e}")

    return {
        "message": "Test user created successfully",
        "email": new_user.email,
        "role": new_user.role,
        "is_admin": new_user.is_admin,
        "is_verified": new_user.is_verified,
        "subscription_tier": new_user.subscription_tier,
    }


@router.post("/estimate-tokens", response_model=EstimateTokensResponse)
async def estimate_tokens(
    req: EstimateTokensRequest,
    current_user: User | None = Depends(get_current_user),
) -> EstimateTokensResponse:
    """
    Estimate token count for input text and optional conversation history.

    Uses provider-specific tokenizers when available for accurate counting:
    - Anthropic: Official SDK tokenizer (95-99% accurate)
    - OpenAI: tiktoken with correct encoding
    - Hugging Face models: transformers library (90-95% accurate)
    - Others: tiktoken cl100k_base approximation

    This endpoint is designed for real-time token counting in the frontend
    with debounced API calls to provide accurate token estimates.
    """
    from ..model_runner import count_conversation_tokens

    # Estimate tokens for current input
    input_tokens = estimate_token_count(req.input_data, model_id=req.model_id)

    # Estimate tokens for conversation history if provided
    conversation_history_tokens = 0
    if req.conversation_history:
        conversation_history_tokens = count_conversation_tokens(
            req.conversation_history, model_id=req.model_id
        )

    total_input_tokens = input_tokens + conversation_history_tokens

    return EstimateTokensResponse(
        input_tokens=input_tokens,
        conversation_history_tokens=conversation_history_tokens,
        total_input_tokens=total_input_tokens,
        model_id=req.model_id,
    )


@router.post("/compare-stream")
async def compare_stream(
    req: CompareRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user),
):
    """
    Compare AI models using Server-Sent Events (SSE) streaming.

    Returns responses token-by-token as they arrive from OpenRouter for dramatically
    faster perceived response time (first tokens appear in ~500ms vs 6+ seconds).

    Supports all models from streaming-enabled providers:
    - OpenAI, Azure, Anthropic, Fireworks, Cohere, DeepSeek, XAI
    - Together, DeepInfra, Novita, OctoAI, Lepton, AnyScale
    - Mancer, Recursal, Hyperbolic, Infermatic, and more

    SSE Event Format:
    - data: {"model": "model-id", "type": "start"} - Model starting
    - data: {"model": "model-id", "type": "chunk", "content": "text"} - Token chunk
    - data: {"model": "model-id", "type": "done"} - Model complete
    - data: {"type": "complete", "metadata": {...}} - All models done
    - data: {"type": "error", "message": "..."} - Error occurred
    """
    # Validate request
    if not req.input_data.strip():
        raise HTTPException(status_code=400, detail="Input data cannot be empty")

    if not req.models:
        raise HTTPException(status_code=400, detail="At least one model must be selected")

    # Validate input against model token limits
    from ..model_runner import (
        get_min_max_input_tokens,
        get_model_max_input_tokens,
    )

    min_max_input_tokens = get_min_max_input_tokens(req.models)

    # Use frontend-provided token count if available (from /estimate-tokens endpoint)
    # Otherwise calculate it ourselves. This avoids duplicate work since frontend
    # already has accurate token counts from the hybrid approach.
    if req.estimated_input_tokens is not None and req.estimated_input_tokens >= 0:
        # Use frontend-provided count (already validated by /estimate-tokens endpoint)
        input_tokens = req.estimated_input_tokens
    else:
        # Fallback: calculate ourselves (for backwards compatibility or if frontend didn't provide it)
        model_id = req.models[0] if req.models else None
        input_tokens = estimate_token_count(req.input_data, model_id=model_id)

    if input_tokens > min_max_input_tokens:
        # Find problem models (those with max_input_tokens < input_tokens)
        problem_models = []
        for model_id in req.models:
            model_max_input = get_model_max_input_tokens(model_id)
            if model_max_input < input_tokens:
                # Find model name from MODELS_BY_PROVIDER
                model_name = None
                for provider_models in MODELS_BY_PROVIDER.values():
                    for model in provider_models:
                        if model.get("id") == model_id:
                            model_name = model.get("name", model_id)
                            break
                    if model_name:
                        break
                if not model_name:
                    # Fallback: format model_id nicely
                    model_name = model_id.split("/")[-1].replace("-", " ").replace("_", " ").title()
                problem_models.append(model_name)

        # Convert tokens to approximate characters for user-friendly message (1 token ≈ 4 chars)
        approx_chars = input_tokens * 4
        max_chars = min_max_input_tokens * 4

        problem_models_text = ""
        if problem_models:
            problem_models_text = f" Problem model(s): {', '.join(problem_models)}."

        raise HTTPException(
            status_code=400,
            detail=f"Your input is too long for one or more of the selected models. The maximum input length is approximately {max_chars:,} characters, but your input is approximately {approx_chars:,} characters.{problem_models_text} Please shorten your input or select different models that support longer inputs.",
        )

    # Import utilities needed for tier checking
    import logging

    from ..model_runner import is_model_available_for_tier
    from ..utils.cookies import get_token_from_cookies

    # Determine model limit based on user tier
    if current_user:
        # Ensure subscription_tier is set and valid
        subscription_tier = current_user.subscription_tier
        if not subscription_tier or subscription_tier not in [
            "free",
            "starter",
            "starter_plus",
            "pro",
            "pro_plus",
        ]:
            # Log unexpected tier value for debugging
            if settings.environment == "development":
                logging.getLogger(__name__).warning(
                    f"User {current_user.id} ({current_user.email}) has unexpected subscription_tier: {subscription_tier}. "
                    f"Defaulting to 'free' tier."
                )
            subscription_tier = "free"  # Default to free tier if invalid

        tier_model_limit = get_model_limit(subscription_tier)
        tier_name = subscription_tier
    else:
        # Check if there's a token present but authentication failed (helps diagnose auth issues)
        token_present = get_token_from_cookies(request) is not None
        tier_recovered_from_token = False

        # If token is present but authentication failed, try to get user info from token for better error message
        # This helps diagnose cases where user thinks they're logged in but session expired
        # This can happen after code changes/restarts when the frontend still has a valid token
        # but the backend dependency system hasn't properly authenticated
        if token_present:
            from ..auth import verify_token

            try:
                import jwt
            except ImportError:
                jwt = None

            token = get_token_from_cookies(request)
            if token:
                try:
                    # Try to verify token - this will fail if expired or invalid
                    payload = verify_token(token, token_type="access")

                    if payload:
                        user_id_from_token = payload.get("sub")
                        if user_id_from_token:
                            try:
                                user_id_int = int(user_id_from_token)
                                # Refresh user from database to ensure we have latest tier info
                                # Use a fresh query to avoid stale session issues
                                user_from_token = (
                                    db.query(User).filter(User.id == user_id_int).first()
                                )

                                if user_from_token:
                                    # Refresh the user object to get latest data
                                    db.refresh(user_from_token)

                                    if user_from_token.is_active:
                                        # User exists and is active, but get_current_user failed
                                        # This can happen after code changes when dependency system has issues
                                        # Use their actual tier for validation
                                        subscription_tier = user_from_token.subscription_tier

                                        # Handle all valid tiers including pro_plus
                                        valid_tiers = [
                                            "free",
                                            "starter",
                                            "starter_plus",
                                            "pro",
                                            "pro_plus",
                                        ]
                                        if subscription_tier and subscription_tier in valid_tiers:
                                            tier_model_limit = get_model_limit(subscription_tier)
                                            tier_name = subscription_tier
                                            tier_recovered_from_token = True

                                            # Log this recovery for debugging
                                            logger.warning(
                                                f"[AUTH RECOVERY] Authentication dependency failed but recovered tier from token. "
                                                f"User: {user_from_token.id} ({user_from_token.email}), "
                                                f"Tier: {subscription_tier}. This may indicate a session/dependency issue."
                                            )
                                        else:
                                            logger.warning(
                                                f"[AUTH] User {user_from_token.id} has invalid tier: {subscription_tier}"
                                            )
                                            tier_model_limit = ANONYMOUS_MODEL_LIMIT
                                            tier_name = "unregistered"
                                    else:
                                        logger.warning(
                                            f"[AUTH] User {user_from_token.id} found but account is inactive"
                                        )
                                        tier_model_limit = ANONYMOUS_MODEL_LIMIT
                                        tier_name = "unregistered"
                                else:
                                    logger.warning(
                                        f"[AUTH] Token contains user_id {user_id_int} but user not found in database"
                                    )
                                    tier_model_limit = ANONYMOUS_MODEL_LIMIT
                                    tier_name = "unregistered"
                            except (ValueError, TypeError) as e:
                                logger.warning(f"[AUTH] Invalid user_id format in token: {e}")
                                tier_model_limit = ANONYMOUS_MODEL_LIMIT
                                tier_name = "unregistered"
                        else:
                            logger.warning("[AUTH] Token payload missing 'sub' field")
                            tier_model_limit = ANONYMOUS_MODEL_LIMIT
                            tier_name = "unregistered"
                    else:
                        # Token verification failed - likely expired or invalid
                        # Try to decode without verification to get user info for better error message
                        if jwt:
                            try:
                                unverified_payload = jwt.decode(
                                    token, options={"verify_signature": False}
                                )
                                user_id_from_token = unverified_payload.get("sub")
                                if user_id_from_token:
                                    logger.warning(
                                        f"[AUTH] Token verification failed (likely expired) for user_id: {user_id_from_token}. "
                                        f"User should refresh their session."
                                    )
                            except Exception:
                                pass
                        tier_model_limit = ANONYMOUS_MODEL_LIMIT
                        tier_name = "unregistered"
                except Exception as e:
                    logger.error(f"[AUTH] Unexpected error during token recovery: {e}")
                    tier_model_limit = ANONYMOUS_MODEL_LIMIT
                    tier_name = "unregistered"
            else:
                tier_model_limit = ANONYMOUS_MODEL_LIMIT
                tier_name = "unregistered"
        else:
            tier_model_limit = ANONYMOUS_MODEL_LIMIT
            tier_name = "unregistered"

        # Log authentication failure for debugging
        if not tier_recovered_from_token:
            logger.warning(
                f"[AUTH] Authentication failed for /compare-stream request. "
                f"Token present: {token_present}, "
                f"Tier recovered: {tier_recovered_from_token}, "
                f"Final tier: {tier_name}"
            )

    # Validate model access based on tier (check if restricted models are selected)
    # Normalize tier name: "anonymous" should be treated as "unregistered"
    normalized_tier_name = "unregistered" if tier_name == "anonymous" else tier_name

    # Check if user has active 7-day trial (grants access to all premium models)
    is_trial_active = current_user.is_trial_active if current_user else False

    restricted_models = [
        model_id
        for model_id in req.models
        if not is_model_available_for_tier(model_id, normalized_tier_name, is_trial_active)
    ]
    if restricted_models:
        upgrade_message = ""
        if normalized_tier_name == "unregistered":
            # Check if there's a token present - if so, authentication may have failed
            token_present = get_token_from_cookies(request) is not None
            if token_present:
                upgrade_message = " It appears you are signed in, but authentication failed. Please try refreshing the page or logging in again. If the issue persists, your session may have expired."
            else:
                upgrade_message = " Sign up for a free account to access more models, plus get a 7-day trial to all premium models!"
        elif normalized_tier_name == "free":
            upgrade_message = (
                " Paid subscriptions are coming soon — stay tuned to access all premium models!"
            )
        else:
            upgrade_message = " Paid subscriptions are coming soon!"

        raise HTTPException(
            status_code=403,
            detail=f"The following models are not available for {normalized_tier_name} tier: {', '.join(restricted_models)}.{upgrade_message}",
        )

    # Enforce tier-specific model limit
    if len(req.models) > tier_model_limit:
        upgrade_message = ""
        if normalized_tier_name == "unregistered":
            free_model_limit = get_model_limit("free")
            upgrade_message = (
                f" Sign up for a free account to compare up to {free_model_limit} models."
            )
        elif normalized_tier_name == "free":
            upgrade_message = " Paid plans with higher model limits are coming soon!"
        elif normalized_tier_name in ["starter", "starter_plus"]:
            upgrade_message = " Higher tier plans with more models are coming soon!"

        raise HTTPException(
            status_code=400,
            detail=f"Your {normalized_tier_name} tier allows maximum {tier_model_limit} models per comparison. You selected {len(req.models)} models.{upgrade_message}",
        )

    # Get number of models for usage tracking
    num_models = len(req.models)

    # --- CREDIT-BASED RATE LIMITING ---
    client_ip = get_client_ip(request)

    # Get timezone for credit reset timing
    user_timezone = get_timezone_from_request(req, current_user, db)

    # For authenticated users, save timezone to preferences if provided
    if current_user and req.timezone:
        if not current_user.preferences:
            from ..models import UserPreference

            current_user.preferences = UserPreference(
                user_id=current_user.id, timezone=user_timezone
            )
            db.commit()
        elif current_user.preferences.timezone != user_timezone:
            current_user.preferences.timezone = user_timezone
            db.commit()

    # Get location - prioritize user-provided location over IP-based detection
    user_location = None
    location_source = None  # Track where location came from: "user_provided", "ip_based", or None

    if req.location and req.location.strip():
        # User provided location explicitly (most accurate - browser geolocation or manual entry)
        user_location = req.location.strip()
        location_source = "user_provided"
        print(f"[API] ✓ Using user-provided location: {user_location}")
        logger.info(
            f"[API] Received location from frontend: '{req.location}', processed as: '{user_location}', source: {location_source}"
        )
    else:
        logger.debug(f"[API] No location in request body. req.location = {req.location}")
        print(f"[API] No location provided in request (req.location = {req.location})")
        # Fallback to IP-based geolocation (less accurate, approximate)
        ip_location = await get_location_from_ip(client_ip)
        if ip_location:
            user_location = ip_location
            location_source = "ip_based"
            print(
                f"[API] Detected approximate location from IP {client_ip}: {user_location} (IP-based location may be inaccurate)"
            )
        else:
            print(
                f"[API] Could not detect location from IP {client_ip} (may be localhost, VPN, or service unavailable)"
            )

    is_overage = False
    overage_charge = 0.0
    credits_remaining = 0
    credits_allocated = 0

    if current_user:
        check_and_reset_credits_if_needed(current_user.id, db)
        ensure_credits_allocated(current_user.id, db)
        db.refresh(current_user)

        # Debug logging for authentication and tier
        print(
            f"[API] Authenticated user: {current_user.email}, subscription_tier: '{current_user.subscription_tier}', is_active: {current_user.is_active}, timezone: {user_timezone}"
        )

        # Get current credit balance (no estimate needed - we don't block based on estimates)
        credits_remaining = get_user_credits(current_user.id, db)
        credits_allocated = current_user.monthly_credits_allocated or 0

        # Block submission ONLY if credits are already at 0 (after a previous comparison zeroed them out)
        # This allows one final comparison that zeros out credits, then blocks subsequent requests
        if credits_remaining == 0:
            tier_name = current_user.subscription_tier or "free"
            if tier_name in ["unregistered", "free"]:
                error_msg = (
                    f"You've run out of credits. Credits will reset to {DAILY_CREDIT_LIMITS.get(tier_name, 50)} tomorrow, "
                    f"or sign-up for a free account to get more credits, more models, and more history!"
                )
            elif tier_name == "pro_plus":
                reset_date = (
                    current_user.credits_reset_at.date().isoformat()
                    if current_user.credits_reset_at
                    else "N/A"
                )
                error_msg = (
                    f"You've run out of credits which will reset on {reset_date}. "
                    f"Wait until your reset, or sign-up for model comparison overages."
                )
            else:
                reset_date = (
                    current_user.credits_reset_at.date().isoformat()
                    if current_user.credits_reset_at
                    else "N/A"
                )
                error_msg = (
                    f"You've run out of credits which will reset on {reset_date}. "
                    f"Consider upgrading your plan for more credits, more models per comparison, and more history!"
                )
            raise HTTPException(
                status_code=402,  # Payment Required
                detail=error_msg,
            )

        print(
            f"Authenticated user {current_user.email} - Credits: {credits_remaining}/{credits_allocated}"
        )
    else:
        # Unregistered user - check credit-based limits
        print(
            f"[API] Unregistered user - IP: {client_ip}, fingerprint: {req.browser_fingerprint[:20] if req.browser_fingerprint else 'None'}..., timezone: {user_timezone}"
        )

        # Check IP-based credits (pass Decimal(0) since we don't need estimate for blocking)
        ip_identifier = f"ip:{client_ip}"
        _, ip_credits_remaining, ip_credits_allocated = check_anonymous_credits(
            ip_identifier, Decimal(0), user_timezone, db
        )

        fingerprint_credits_remaining = ip_credits_remaining
        fingerprint_credits_allocated = ip_credits_allocated
        if req.browser_fingerprint:
            fp_identifier = f"fp:{req.browser_fingerprint}"
            _, fingerprint_credits_remaining, fingerprint_credits_allocated = (
                check_anonymous_credits(fp_identifier, Decimal(0), user_timezone, db)
            )

        # Use the most restrictive limit (lowest remaining credits)
        credits_remaining = min(
            ip_credits_remaining,
            fingerprint_credits_remaining if req.browser_fingerprint else ip_credits_remaining,
        )
        credits_allocated = ip_credits_allocated

        # Block submission ONLY if credits are already at 0 (after a previous comparison zeroed them out)
        # This allows one final comparison that zeros out credits, then blocks subsequent requests
        if credits_remaining == 0:
            raise HTTPException(
                status_code=402,  # Payment Required
                detail=(
                    "You've run out of credits. Credits will reset to 50 tomorrow, "
                    "or sign-up for a free account to get more credits, more models, and more history!"
                ),
            )

        print(
            f"Unregistered user - IP: {client_ip} - Credits: {credits_remaining}/{credits_allocated}"
        )
    # --- END CREDIT-BASED RATE LIMITING ---

    # Track start time for processing metrics
    start_time = datetime.now()

    user_id = current_user.id if current_user else None
    has_authenticated_user = current_user is not None

    # Capture logger in local variable for use in nested function
    _logger = logger

    async def generate_stream():
        """
        Generate streaming response for all models.
        Generator function that yields SSE-formatted events.
        Streams responses from all requested models concurrently for maximum performance.

        Modern async/await pattern (2025 best practices):
        - Concurrent execution via asyncio.create_task
        - Queue-based chunk collection with asyncio.Queue
        - Graceful error handling per model
        - Non-blocking I/O throughout
        """
        nonlocal credits_remaining  # Allow updating outer scope variable

        # Log web search request status
        if req.enable_web_search:
            _logger.info(
                f"Web search requested for comparison with models: {req.models}. "
                f"Will check each model's capability and search provider availability."
            )

        # Capture settings values in local variables to avoid closure issues with nested functions
        model_inactivity_timeout = settings.model_inactivity_timeout

        successful_models = 0
        failed_models = 0
        results_dict = {}
        # Track token usage for all models
        total_input_tokens = 0
        total_output_tokens = 0
        total_effective_tokens = 0
        usage_data_dict = {}  # Store usage data per model

        # Query user fresh from database to avoid stale mock_mode_enabled value
        # The current_user object captured in closure may have stale data
        is_development = os.environ.get("ENVIRONMENT") == "development"
        use_mock = False

        # Only check mock mode if we have an authenticated user
        # If has_authenticated_user is True, we should NEVER check anonymous mock mode
        if has_authenticated_user and user_id:
            # Query user fresh from database to get latest mock_mode_enabled value
            from ..database import SessionLocal

            fresh_db = SessionLocal()
            try:
                fresh_user = fresh_db.query(User).filter(User.id == user_id).first()
                if fresh_user:
                    # Check if mock mode is enabled for this authenticated user
                    # Allow mock mode for admins/super_admins even in production (for testing)
                    if fresh_user.mock_mode_enabled:
                        if is_development or fresh_user.role in ["admin", "super_admin"]:
                            use_mock = True
            finally:
                fresh_db.close()
        elif not has_authenticated_user:
            # Only check anonymous mock mode if there is NO authenticated user
            # Check if global anonymous mock mode is enabled (development only)
            if is_development:
                from ..cache import get_cached_app_settings

                def get_settings():
                    return db.query(AppSettings).first()

                app_settings = get_cached_app_settings(get_settings)
                if app_settings and app_settings.anonymous_mock_mode_enabled:
                    use_mock = True

        try:
            # Calculate minimum max output tokens across all models to avoid truncation
            from decimal import Decimal

            from ..model_runner import (
                count_conversation_tokens,
                estimate_token_count,
                get_min_max_output_tokens,
            )

            # Calculate input tokens for this request
            # Use first model for accurate token counting (if available)
            model_id = req.models[0] if req.models else None
            input_tokens = estimate_token_count(req.input_data, model_id=model_id)
            if req.conversation_history:
                input_tokens += count_conversation_tokens(
                    req.conversation_history, model_id=model_id
                )

            # If credits are low, calculate reduced max_tokens based on available credits per model
            # This helps ensure users can still get responses even with low credits
            effective_max_tokens = get_min_max_output_tokens(req.models)
            credits_limited = False  # Track if max_tokens was reduced due to credits

            # Calculate credits available per model
            credits_per_model = (
                Decimal(credits_remaining) / Decimal(num_models) if num_models > 0 else Decimal(0)
            )

            # Minimum usable response threshold: 300 output tokens
            # This ensures responses are meaningful even with low credits
            # 300 tokens ≈ 225 words, enough for a brief but complete answer
            MIN_USABLE_OUTPUT_TOKENS = 300

            # Check if credits per model are low enough to require max_tokens reduction
            # Threshold: < 2 credits per model (roughly < 300 tokens after accounting for input)
            if credits_remaining > 0 and credits_per_model < 2:
                # Calculate effective tokens available per model
                effective_tokens_per_model = credits_per_model * Decimal(1000)
                # Calculate max output tokens: (effective_tokens - input_tokens) / 2.5
                # Ensure we don't go negative
                max_output_tokens_calc = (
                    effective_tokens_per_model - Decimal(input_tokens)
                ) / Decimal(2.5)
                max_output_tokens_int = max(
                    MIN_USABLE_OUTPUT_TOKENS, int(max_output_tokens_calc)
                )  # Enforce minimum usable threshold

                # If we had to enforce the minimum threshold, the comparison will exceed available credits
                # Credits will be capped to 0 after deduction (handled by credit_manager)
                if (
                    max_output_tokens_int == MIN_USABLE_OUTPUT_TOKENS
                    and max_output_tokens_calc < MIN_USABLE_OUTPUT_TOKENS
                ):
                    print(
                        f"[API] Low credits per model ({credits_per_model:.2f}) - enforcing minimum usable response ({MIN_USABLE_OUTPUT_TOKENS} tokens). Credits will be capped to 0."
                    )

                # Use the smaller of calculated max_tokens or model's max capability
                original_max_tokens = effective_max_tokens
                effective_max_tokens = min(effective_max_tokens, max_output_tokens_int)
                # Mark as credits-limited if we actually reduced max_tokens
                if effective_max_tokens < original_max_tokens:
                    credits_limited = True
                print(
                    f"[API] Low credits - reducing max_tokens from {get_min_max_output_tokens(req.models)} to {effective_max_tokens} (credits_remaining: {credits_remaining}, credits_per_model: {credits_per_model:.2f})"
                )

            # Send all start events at once (concurrent processing begins simultaneously)
            for model_id in req.models:
                yield f"data: {json.dumps({'model': model_id, 'type': 'start'})}\n\n"

            # Create queue for chunk collection from all models
            chunk_queue = asyncio.Queue()

            async def stream_single_model(model_id: str):
                """
                Stream a single model's response asynchronously.
                Runs in parallel with other models for optimal performance.
                Uses asyncio-friendly approach with thread-safe queue communication.
                """
                model_content = ""
                chunk_count = 0

                try:
                    # Check if web search should be enabled for this model
                    # Do this BEFORE entering thread pool to avoid database session thread-safety issues
                    enable_web_search_for_model = False
                    search_provider_instance = None

                    if req.enable_web_search:
                        # Check if this model supports web search
                        model_supports_web_search = False
                        for provider_models in MODELS_BY_PROVIDER.values():
                            for model in provider_models:
                                if model["id"] == model_id and model.get("supports_web_search"):
                                    model_supports_web_search = True
                                    break
                            if model_supports_web_search:
                                break

                        if model_supports_web_search:
                            # Get search provider from database (must be done in async context, not thread pool)
                            search_provider_instance = SearchProviderFactory.get_active_provider(db)
                            if search_provider_instance:
                                enable_web_search_for_model = True
                                _logger.info(
                                    f"Web search enabled for model {model_id}: "
                                    f"provider={search_provider_instance.get_provider_name()}"
                                )
                            else:
                                _logger.warning(
                                    f"Web search requested for model {model_id} but no active search provider configured. "
                                    f"Check AppSettings.active_search_provider and ensure API keys are set."
                                )

                    # Run synchronous streaming in a thread, push chunks to queue as they arrive
                    loop = asyncio.get_event_loop()

                    def process_stream_to_queue():
                        """
                        Process streaming response in thread pool.
                        Push chunks to async queue in real-time for true streaming.
                        Returns: (content, is_error, usage_data)
                        """
                        content = ""
                        count = 0
                        usage_data = None
                        # Track state to detect keepalive chunks
                        # Keepalive chunks come as isolated single spaces during tool call handling
                        # They appear when content accumulation is paused (between content phases)
                        last_chunk_was_keepalive = False
                        consecutive_keepalive_count = 0  # Track consecutive keepalive chunks
                        try:
                            # Filter conversation history for this specific model:
                            # - Include all user messages (shared context)
                            # - Include only assistant messages from this model (filtered by model_id)
                            filtered_history = []
                            if req.conversation_history:
                                for msg in req.conversation_history:
                                    # Always include user messages
                                    if msg.role == "user":
                                        filtered_history.append(msg)
                                    # Only include assistant messages from this model
                                    elif msg.role == "assistant":
                                        # Include if model_id matches, or if model_id is None (legacy support)
                                        if msg.model_id is None or msg.model_id == model_id:
                                            filtered_history.append(msg)

                            # Manually iterate generator to capture return value (TokenUsage)
                            gen = call_openrouter_streaming(
                                req.input_data,
                                model_id,
                                filtered_history,
                                use_mock,
                                max_tokens_override=effective_max_tokens,
                                credits_limited=credits_limited,
                                enable_web_search=enable_web_search_for_model,
                                search_provider=search_provider_instance,
                                user_timezone=user_timezone,
                                user_location=user_location,
                                location_source=location_source,
                            )

                            try:
                                while True:
                                    chunk = next(gen)

                                    # Detect keepalive chunks (single space) used during web search operations
                                    # Keepalive chunks are sent during tool call handling (before/during/after web search)
                                    # They come as isolated single spaces when content accumulation is paused.
                                    #
                                    # Detection strategy:
                                    # 1. Keepalive chunks are always isolated single spaces (" ")
                                    # 2. They come when content accumulation is paused (during tool call handling)
                                    # 3. They may come before content starts OR between content phases
                                    # 4. Multiple keepalive chunks can come in sequence (every 5 seconds during web search)
                                    #
                                    # We detect them by checking:
                                    # - Single space chunk
                                    # - Content is empty OR content ends with whitespace/newline (between phases)
                                    # - If content exists, it should end with whitespace (not mid-word)
                                    # - Consecutive keepalive chunks are more likely to be keepalive
                                    is_keepalive = False
                                    if chunk == " ":
                                        # Check if this looks like a keepalive chunk
                                        if len(content) == 0:
                                            # No content yet - definitely a keepalive
                                            is_keepalive = True
                                        elif content.rstrip() != content:
                                            # Content ends with whitespace - likely between content phases
                                            # This is a keepalive chunk during tool call handling
                                            is_keepalive = True
                                        elif last_chunk_was_keepalive:
                                            # Previous chunk was keepalive - this is likely also keepalive
                                            # (keepalive chunks come in sequence during web search)
                                            is_keepalive = True

                                    if is_keepalive:
                                        # Push keepalive event instead of content chunk
                                        # DO NOT add to content - this prevents character counter inflation
                                        last_chunk_was_keepalive = True
                                        consecutive_keepalive_count += 1
                                        asyncio.run_coroutine_threadsafe(
                                            chunk_queue.put(
                                                {
                                                    "type": "keepalive",
                                                    "model": model_id,
                                                }
                                            ),
                                            loop,
                                        )
                                    else:
                                        # Normal content chunk - add to content and queue
                                        last_chunk_was_keepalive = False
                                        consecutive_keepalive_count = 0
                                        content += chunk
                                        count += 1

                                        # Push chunk to async queue (thread-safe)
                                        asyncio.run_coroutine_threadsafe(
                                            chunk_queue.put(
                                                {
                                                    "type": "chunk",
                                                    "model": model_id,
                                                    "content": chunk,
                                                    "chunk_count": count,
                                                }
                                            ),
                                            loop,
                                        )
                            except StopIteration as e:
                                # Generator return value is in e.value
                                usage_data = e.value

                            return content, False, usage_data  # content, is_error, usage_data

                        except Exception as e:
                            error_msg = f"Error: {str(e)[:100]}"
                            _logger.error(
                                f"Error streaming model {model_id}: {str(e)}", exc_info=True
                            )
                            # Push error as chunk
                            asyncio.run_coroutine_threadsafe(
                                chunk_queue.put(
                                    {"type": "chunk", "model": model_id, "content": error_msg}
                                ),
                                loop,
                            )
                            return error_msg, True, None  # error_msg, is_error, usage_data

                    # Run streaming in executor without timeout
                    # Timeout is handled in the chunk processing loop based on inactivity
                    full_content, is_error, usage_data = await loop.run_in_executor(
                        None, process_stream_to_queue
                    )

                    # Clean the final accumulated content (unless it's an error)
                    if not is_error:
                        model_content = clean_model_response(full_content)
                    else:
                        model_content = full_content

                    # Final check if response is an error
                    # Only check for backend error patterns, not any content starting with "Error:"
                    # This prevents false positives when models legitimately discuss error handling
                    if not is_error and model_content:
                        import re

                        trimmed_content = model_content.strip()

                        # Check for backend error patterns (from call_openrouter_streaming)
                        # These are specific error messages, not general discussions about errors
                        backend_error_patterns = [
                            r"^Error:\s*Timeout\s*\(",  # Error: Timeout (Xs)
                            r"^Error:\s*Rate\s*limit",  # Error: Rate limited
                            r"^Error:\s*Model\s*not\s*available",  # Error: Model not available
                            r"^Error:\s*Authentication\s*failed",  # Error: Authentication failed
                            r"^Error:\s*\d+",  # Error: 404, Error: 500, etc.
                        ]

                        # Only mark as error if content matches backend error patterns
                        # This prevents false positives when models discuss error handling
                        if trimmed_content.startswith("Error:"):
                            # Check if it matches known backend error patterns
                            matches_pattern = any(
                                re.match(pattern, trimmed_content, re.IGNORECASE)
                                for pattern in backend_error_patterns
                            )
                            if matches_pattern:
                                is_error = True
                            # If content is very short (< 100 chars) and starts with "Error:",
                            # it's likely a backend error (not a model explanation)
                            # This catches cases like "Error: Timeout" without the full pattern match
                            elif len(trimmed_content) < 100 and not any(
                                c in trimmed_content for c in ".!?"
                            ):
                                # Very short, no sentence-ending punctuation = likely backend error
                                is_error = True
                            # Content starting with "Error:" that doesn't match patterns and is longer
                            # or has sentence structure is likely legitimate (e.g., "Error handling in Python...")
                            # Don't mark as error

                        # Check if error was appended at the end (during streaming failure)
                        elif len(trimmed_content) > 200:
                            error_index = trimmed_content.lower().rfind("error:")
                            if error_index >= len(trimmed_content) - 200:
                                # Check if the appended error matches backend patterns
                                error_text = trimmed_content[error_index:]
                                matches_pattern = any(
                                    re.match(pattern, error_text, re.IGNORECASE)
                                    for pattern in backend_error_patterns
                                )
                                if matches_pattern:
                                    is_error = True

                    return {
                        "model": model_id,
                        "content": model_content,
                        "error": is_error,
                        "usage": usage_data,  # TokenUsage or None
                    }

                except Exception as e:
                    # Handle model-specific errors gracefully
                    error_msg = f"Error: {str(e)[:100]}"

                    # Put error in queue as chunk
                    await chunk_queue.put(
                        {"type": "chunk", "model": model_id, "content": error_msg}
                    )

                    return {"model": model_id, "content": error_msg, "error": True, "usage": None}

            # Create tasks for all models to run concurrently
            tasks = [asyncio.create_task(stream_single_model(model_id)) for model_id in req.models]

            # Map tasks to model IDs for inactivity timeout tracking
            task_to_model = {task: model_id for task, model_id in zip(tasks, req.models)}

            # Process chunks and completed tasks concurrently
            pending_tasks = set(tasks)

            # Track last activity time per model for inactivity timeout
            # Activity is defined as receiving chunks or keepalives
            model_last_activity = {model_id: time.time() for model_id in req.models}

            while pending_tasks or not chunk_queue.empty():
                # Process chunks FIRST to ensure immediate streaming, especially for web search continuations
                # This prioritizes streaming responsiveness over task completion processing
                chunks_processed = False
                current_time = time.time()

                # Check for inactivity timeout before processing chunks
                # Timeout if no chunks/keepalives received for inactivity period
                timed_out_tasks = set()
                for task in list(pending_tasks):
                    if task.done():
                        continue
                    model_id = task_to_model.get(task)
                    if model_id and model_id in model_last_activity:
                        time_since_activity = current_time - model_last_activity[model_id]
                        if time_since_activity > model_inactivity_timeout:
                            # Model has been inactive for too long - cancel task and mark as timeout
                            _logger.warning(
                                f"Model {model_id} timed out after {model_inactivity_timeout}s of inactivity "
                                f"(last activity: {time_since_activity:.1f}s ago)"
                            )
                            # Cancel the task
                            task.cancel()
                            timed_out_tasks.add(task)
                            # Push timeout error as chunk
                            await chunk_queue.put(
                                {
                                    "type": "chunk",
                                    "model": model_id,
                                    "content": "Error: Model timed out after 1 minute of inactivity",
                                }
                            )
                            # Mark task as done with error result
                            results_dict[model_id] = (
                                "Error: Model timed out after 1 minute of inactivity"
                            )
                            model_stats[model_id]["failure"] += 1
                            failed_models += 1
                            yield f"data: {json.dumps({'model': model_id, 'type': 'done', 'error': True})}\n\n"
                            # Remove from activity tracking
                            if model_id in model_last_activity:
                                del model_last_activity[model_id]

                # Remove timed out tasks from pending
                pending_tasks -= timed_out_tasks

                while not chunk_queue.empty():
                    try:
                        chunk_data = await asyncio.wait_for(chunk_queue.get(), timeout=0.001)

                        # Update last activity time for this model when we receive chunks or keepalives
                        chunk_model_id = chunk_data.get("model")
                        if chunk_model_id:
                            model_last_activity[chunk_model_id] = time.time()

                        if chunk_data["type"] == "chunk":
                            # Don't clean chunks during streaming - preserves whitespace
                            yield f"data: {json.dumps({'model': chunk_data['model'], 'type': 'chunk', 'content': chunk_data['content']})}\n\n"
                            chunks_processed = True
                        elif chunk_data["type"] == "keepalive":
                            # Send keepalive event to reset frontend timeout without adding to content
                            # This prevents timeout during long operations (like web search) without
                            # incrementing the character counter
                            yield f"data: {json.dumps({'model': chunk_data['model'], 'type': 'keepalive'})}\n\n"
                            chunks_processed = True
                    except TimeoutError:
                        break

                # Check for completed tasks without blocking
                done_tasks = set()
                for task in list(pending_tasks):
                    if task.done():
                        done_tasks.add(task)
                        pending_tasks.remove(task)

                # Process completed tasks
                for task in done_tasks:
                    model_id = task_to_model.get(task)
                    if not model_id:
                        continue

                    # Handle cancelled tasks (timeout)
                    if task.cancelled():
                        # Task was cancelled due to timeout - already handled above
                        continue

                    try:
                        result = await task
                    except asyncio.CancelledError:
                        # Task was cancelled - already handled above
                        continue

                    result_model_id = result.get("model")
                    if result_model_id:
                        model_id = result_model_id

                    # Update statistics
                    if result["error"]:
                        failed_models += 1
                        model_stats[model_id]["failure"] += 1
                        model_stats[model_id]["last_error"] = datetime.now().isoformat()
                    else:
                        successful_models += 1
                        model_stats[model_id]["success"] += 1
                        model_stats[model_id]["last_success"] = datetime.now().isoformat()

                        # Accumulate token usage from successful models
                        usage = result.get("usage")  # TokenUsage or None
                        if usage:
                            usage_data_dict[model_id] = usage
                            total_input_tokens += usage.prompt_tokens
                            total_output_tokens += usage.completion_tokens
                            total_effective_tokens += usage.effective_tokens

                    results_dict[model_id] = result["content"]

                    # Send done event for this model
                    yield f"data: {json.dumps({'model': model_id, 'type': 'done', 'error': result['error']})}\n\n"

                # Only sleep if we didn't process any chunks and there are pending tasks
                # This ensures chunks are sent immediately without delay
                if pending_tasks and not chunks_processed:
                    await asyncio.sleep(0.01)  # 10ms yield
                elif chunks_processed:
                    # If we processed chunks, yield control briefly to allow other tasks to run
                    # but don't sleep - this keeps streaming responsive
                    await asyncio.sleep(0)  # Yield control without sleeping

            # Calculate credits used - only for successful models
            # Use actual token usage data from successful model responses
            total_credits_used = Decimal(0)
            if successful_models > 0:
                if total_effective_tokens > 0:
                    # Use actual token usage data from successful models
                    total_credits_used = Decimal(total_effective_tokens) / Decimal(1000)
                else:
                    # Fallback: charge minimum 1 credit per successful model if no usage data available
                    # This should rarely happen, but ensures we only charge for successful models
                    total_credits_used = Decimal(successful_models)
                    print(
                        f"[WARNING] No token usage data available for {successful_models} successful model(s), charging minimum {total_credits_used} credits"
                    )

                # Ensure minimum 1 credit deduction per comparison (round UP)
                # This ensures users are charged at least 1 credit per comparison
                # Always round up and ensure at least 1 credit when models succeed
                total_credits_used = max(
                    Decimal(1), total_credits_used.quantize(Decimal("1"), rounding=ROUND_CEILING)
                )

            # Store the actual fractional credits for UsageLog (for analytics)
            actual_credits_used = total_credits_used

            # Deduct credits - only for successful models
            # Note: total_credits_used is guaranteed to be >= 1 if successful_models > 0 (due to logic above)
            if successful_models > 0:
                # Safety check: ensure credits are always deducted when models succeed
                # This should never trigger due to line 1042, but serves as a safeguard
                if total_credits_used <= 0:
                    print(
                        f"[ERROR] successful_models={successful_models} but total_credits_used={total_credits_used}. "
                        f"This should not happen! Forcing minimum 1 credit deduction."
                    )
                    total_credits_used = Decimal(1)
                    actual_credits_used = total_credits_used

                # At this point, total_credits_used is guaranteed to be > 0
                # Create a fresh database session to avoid detachment issues
                from ..database import SessionLocal

                credit_db = SessionLocal()
                try:
                    if user_id:
                        # Deduct credits for authenticated user
                        credit_user = credit_db.query(User).filter(User.id == user_id).first()
                        if credit_user:
                            deduct_user_credits(
                                credit_user,
                                total_credits_used,
                                None,  # usage_log_id will be set after commit
                                credit_db,
                                description=f"Credits used for {successful_models} model comparison(s) (streaming)",
                            )
                            credit_db.refresh(credit_user)
                            credits_remaining = get_user_credits(user_id, credit_db)
                    else:
                        # Deduct credits for unregistered user
                        ip_identifier = f"ip:{client_ip}"
                        deduct_anonymous_credits(ip_identifier, total_credits_used, user_timezone)
                        # Get updated IP credit balance (no db arg - read from memory only)
                        _, ip_credits_remaining, _ = check_anonymous_credits(
                            ip_identifier, Decimal(0), user_timezone
                        )

                        fingerprint_credits_remaining = ip_credits_remaining
                        if req.browser_fingerprint:
                            fp_identifier = f"fp:{req.browser_fingerprint}"
                            deduct_anonymous_credits(
                                fp_identifier, total_credits_used, user_timezone
                            )
                            # Get updated fingerprint credit balance (no db arg - read from memory only)
                            _, fingerprint_credits_remaining, _ = check_anonymous_credits(
                                fp_identifier, Decimal(0), user_timezone
                            )

                        # Use the most restrictive limit (lowest remaining credits) - same logic as at start
                        credits_remaining = min(
                            ip_credits_remaining,
                            (
                                fingerprint_credits_remaining
                                if req.browser_fingerprint
                                else ip_credits_remaining
                            ),
                        )
                except Exception as e:
                    # Handle any exception during credit deduction
                    print(f"[ERROR] Credit deduction failed: {e}")
                    import traceback

                    traceback.print_exc()
                    # Refresh credits_remaining even if deduction failed (may have partially succeeded)
                    if not user_id:
                        ip_identifier = f"ip:{client_ip}"
                        _, ip_credits_remaining, _ = check_anonymous_credits(
                            ip_identifier, Decimal(0), user_timezone
                        )
                        fingerprint_credits_remaining = ip_credits_remaining
                        if req.browser_fingerprint:
                            fp_identifier = f"fp:{req.browser_fingerprint}"
                            _, fingerprint_credits_remaining, _ = check_anonymous_credits(
                                fp_identifier, Decimal(0), user_timezone
                            )
                        credits_remaining = min(
                            ip_credits_remaining,
                            (
                                fingerprint_credits_remaining
                                if req.browser_fingerprint
                                else ip_credits_remaining
                            ),
                        )
                finally:
                    credit_db.close()
            else:
                # No successful models - no credits deducted
                # Even if no credits were deducted, refresh credits_remaining for unregistered users
                # (in case of any other state changes, though this shouldn't normally happen)
                if not user_id:
                    ip_identifier = f"ip:{client_ip}"
                    _, ip_credits_remaining, _ = check_anonymous_credits(
                        ip_identifier, Decimal(0), user_timezone
                    )
                    fingerprint_credits_remaining = ip_credits_remaining
                    if req.browser_fingerprint:
                        fp_identifier = f"fp:{req.browser_fingerprint}"
                        _, fingerprint_credits_remaining, _ = check_anonymous_credits(
                            fp_identifier, Decimal(0), user_timezone
                        )
                    credits_remaining = min(
                        ip_credits_remaining,
                        (
                            fingerprint_credits_remaining
                            if req.browser_fingerprint
                            else ip_credits_remaining
                        ),
                    )

                # Extended tier usage tracking removed - no longer needed

            # Final refresh of credits_remaining right before building metadata to ensure accuracy
            # This is especially important for unregistered users where credits are stored in memory
            if not user_id and successful_models > 0:
                ip_identifier = f"ip:{client_ip}"
                _, ip_credits_remaining, _ = check_anonymous_credits(
                    ip_identifier, Decimal(0), user_timezone
                )
                fingerprint_credits_remaining = ip_credits_remaining
                if req.browser_fingerprint:
                    fp_identifier = f"fp:{req.browser_fingerprint}"
                    _, fingerprint_credits_remaining, _ = check_anonymous_credits(
                        fp_identifier, Decimal(0), user_timezone
                    )
                    credits_remaining = min(
                        ip_credits_remaining,
                        (
                            fingerprint_credits_remaining
                            if req.browser_fingerprint
                            else ip_credits_remaining
                        ),
                    )

            # Calculate processing time
            processing_time_ms = int((datetime.now() - start_time).total_seconds() * 1000)

            # Build metadata including credit information
            metadata = {
                "input_length": len(req.input_data),
                "models_requested": len(req.models),
                "models_successful": successful_models,
                "models_failed": failed_models,
                "timestamp": datetime.now().isoformat(),
                "processing_time_ms": processing_time_ms,
                # Credit-based fields
                "credits_used": float(total_credits_used),
                "credits_remaining": int(
                    credits_remaining
                ),  # Convert to int for JSON serialization
            }

            # Log usage synchronously so frontend sees updated credits before next query.
            # UsageLog stores charged credits (minimum 1 per comparison); token fields preserve actual usage.
            usage_log = UsageLog(
                user_id=user_id,
                ip_address=client_ip,
                browser_fingerprint=req.browser_fingerprint,
                models_used=json.dumps(req.models),
                input_length=len(req.input_data),
                models_requested=len(req.models),
                models_successful=successful_models,
                models_failed=failed_models,
                processing_time_ms=processing_time_ms,
                estimated_cost=len(req.models)
                * 0.0166,  # Legacy field - keep for backward compatibility
                is_overage=is_overage,
                overage_charge=overage_charge,
                # Credit-based fields
                input_tokens=total_input_tokens if total_input_tokens > 0 else None,
                output_tokens=total_output_tokens if total_output_tokens > 0 else None,
                total_tokens=(
                    total_input_tokens + total_output_tokens
                    if (total_input_tokens > 0 or total_output_tokens > 0)
                    else None
                ),
                effective_tokens=total_effective_tokens if total_effective_tokens > 0 else None,
                credits_used=total_credits_used,  # Store charged credits (minimum 1 per comparison)
            )
            # Create new session and commit synchronously to ensure database is updated before returning
            log_db = SessionLocal()
            try:
                log_db.add(usage_log)
                log_db.commit()
            except Exception as e:
                print(f"[ERROR] Failed to commit UsageLog: {e}")
                log_db.rollback()
            finally:
                log_db.close()

            # Save conversation to database for authenticated users
            if user_id and successful_models > 0:

                def save_conversation_to_db():
                    """Save conversation and messages to database."""
                    conv_db = SessionLocal()
                    try:
                        # Determine if this is a follow-up or new conversation
                        is_follow_up = bool(
                            req.conversation_history and len(req.conversation_history) > 0
                        )

                        # Try to find existing conversation if this is a follow-up
                        existing_conversation = None
                        if is_follow_up:
                            # Method 1: If conversation_id is provided, use it directly (most reliable)
                            if req.conversation_id:
                                conversation_by_id = (
                                    conv_db.query(Conversation)
                                    .filter(
                                        Conversation.id == req.conversation_id,
                                        Conversation.user_id == user_id,
                                    )
                                    .first()
                                )
                                if conversation_by_id:
                                    existing_conversation = conversation_by_id

                            # Method 2: If no conversation_id provided, match by models + input_data + timestamp
                            if not existing_conversation:
                                # Extract the original input_data (first user message) from conversation history
                                # This is the initial prompt that started the conversation
                                original_input_data = None
                                first_message_timestamp = None
                                for msg in req.conversation_history:
                                    if msg.role == "user":
                                        original_input_data = msg.content
                                        # Try to get timestamp if available (from message metadata)
                                        # Note: conversation_history doesn't include timestamps by default,
                                        # but we can use this for future enhancement
                                        break

                                # Find conversation with matching models AND original input_data
                                # This ensures follow-ups are added to the correct conversation,
                                # even if multiple conversations use the same models
                                req_models_sorted = sorted(req.models)
                                all_user_conversations = (
                                    conv_db.query(Conversation)
                                    .filter(Conversation.user_id == user_id)
                                    .order_by(Conversation.updated_at.desc())
                                    .all()
                                )

                                for conv in all_user_conversations:
                                    try:
                                        conv_models = (
                                            json.loads(conv.models_used) if conv.models_used else []
                                        )
                                        # Match by models AND original input_data to ensure correct conversation
                                        models_match = sorted(conv_models) == req_models_sorted
                                        input_matches = (
                                            original_input_data
                                            and conv.input_data == original_input_data
                                        )

                                        # Additional safeguard: if timestamps are available in future,
                                        # we could also match by comparing conversation.created_at with
                                        # the timestamp of the first user message

                                        if models_match and input_matches:
                                            existing_conversation = conv
                                            break
                                    except (json.JSONDecodeError, TypeError):
                                        continue

                        # Create or update conversation
                        if existing_conversation:
                            conversation = existing_conversation
                            conversation.updated_at = datetime.now()
                        else:
                            # Create new conversation
                            conversation = Conversation(
                                user_id=user_id,
                                input_data=req.input_data,
                                models_used=json.dumps(req.models),
                            )
                            conv_db.add(conversation)
                            conv_db.flush()  # Get the ID

                        # Calculate input tokens for user message
                        # For follow-ups: use actual tokens from OpenRouter by subtracting previous tokens
                        # For new conversations: use estimate (since we'd need system message tokens)
                        user_input_tokens = None

                        # Check if we have actual usage data from OpenRouter
                        # All models receive the same messages array, so prompt_tokens should be the same
                        # Use the first successful model's usage data
                        actual_prompt_tokens = None
                        if usage_data_dict:
                            # Get prompt_tokens from any model (they should all be the same)
                            first_model_usage = next(iter(usage_data_dict.values()))
                            if first_model_usage:
                                actual_prompt_tokens = first_model_usage.prompt_tokens

                        if actual_prompt_tokens is not None and existing_conversation:
                            # This is a follow-up: calculate tokens for just the current prompt
                            # by subtracting all previous message tokens from total prompt_tokens
                            # OpenRouter's prompt_tokens includes ALL messages sent (user + assistant)
                            previous_user_messages = (
                                conv_db.query(ConversationMessageModel)
                                .filter(
                                    ConversationMessageModel.conversation_id == conversation.id,
                                    ConversationMessageModel.role == "user",
                                )
                                .all()
                            )

                            previous_assistant_messages = (
                                conv_db.query(ConversationMessageModel)
                                .filter(
                                    ConversationMessageModel.conversation_id == conversation.id,
                                    ConversationMessageModel.role == "assistant",
                                )
                                .all()
                            )

                            # Sum up input_tokens from all previous user messages
                            sum_previous_user_tokens = sum(
                                msg.input_tokens
                                for msg in previous_user_messages
                                if msg.input_tokens is not None
                            )

                            # Sum up output_tokens from all previous assistant messages
                            # When assistant messages are sent back to OpenRouter as conversation history,
                            # they count as input tokens, so we use their output_tokens value
                            sum_previous_assistant_tokens = sum(
                                msg.output_tokens
                                for msg in previous_assistant_messages
                                if msg.output_tokens is not None
                            )

                            # Total previous tokens = user messages + assistant messages
                            sum_previous_tokens = (
                                sum_previous_user_tokens + sum_previous_assistant_tokens
                            )

                            # Check if we have valid previous token data
                            # If no previous messages or previous messages don't have token data saved,
                            # we can't accurately calculate, so fall back to estimate
                            has_previous_messages = (
                                previous_user_messages or previous_assistant_messages
                            )
                            if not has_previous_messages or sum_previous_tokens == 0:
                                # No previous messages or previous messages don't have token data
                                # (likely from before this feature was implemented)
                                # Fall back to estimate
                                if req.models:
                                    try:
                                        user_input_tokens = estimate_token_count(
                                            req.input_data, model_id=req.models[0]
                                        )
                                    except Exception:
                                        user_input_tokens = estimate_token_count(
                                            req.input_data, model_id=None
                                        )
                            else:
                                # Calculate current prompt tokens
                                # prompt_tokens from OpenRouter = previous user tokens + previous assistant tokens + current prompt tokens
                                user_input_tokens = actual_prompt_tokens - sum_previous_tokens

                                # Sanity check: ensure we don't get negative or unreasonably small values
                                # If calculation seems wrong, fall back to estimate
                                if (
                                    user_input_tokens < 0
                                    or user_input_tokens < len(req.input_data) // 10
                                ):
                                    # Fallback to estimate if calculation seems incorrect
                                    if req.models:
                                        try:
                                            user_input_tokens = estimate_token_count(
                                                req.input_data, model_id=req.models[0]
                                            )
                                        except Exception:
                                            user_input_tokens = estimate_token_count(
                                                req.input_data, model_id=None
                                            )
                        else:
                            # New conversation or no usage data: use estimate
                            # For new conversations, prompt_tokens includes system message tokens
                            # which we don't track separately, so estimate is more practical
                            if req.models:
                                try:
                                    user_input_tokens = estimate_token_count(
                                        req.input_data, model_id=req.models[0]
                                    )
                                except Exception:
                                    # Fallback: estimate without model-specific tokenizer
                                    user_input_tokens = estimate_token_count(
                                        req.input_data, model_id=None
                                    )

                        # Save user message (current prompt)
                        # For new conversations, this is the first message
                        # For follow-ups, this is the new user prompt
                        user_msg = ConversationMessageModel(
                            conversation_id=conversation.id,
                            role="user",
                            content=req.input_data,
                            model_id=None,
                            input_tokens=user_input_tokens,
                        )
                        conv_db.add(user_msg)

                        # Save assistant messages for each successful model
                        messages_saved = 0
                        for model_id, content in results_dict.items():
                            # Skip error messages and empty content (which can happen on timeout)
                            # Empty content violates schema validation (min_length=1)
                            if not content.startswith("Error:") and content and content.strip():
                                # Get output tokens from usage_data_dict if available
                                output_tokens = None
                                if model_id in usage_data_dict:
                                    usage = usage_data_dict[model_id]
                                    output_tokens = usage.completion_tokens

                                assistant_msg = ConversationMessageModel(
                                    conversation_id=conversation.id,
                                    role="assistant",
                                    content=content,
                                    model_id=model_id,
                                    success=True,
                                    processing_time_ms=processing_time_ms,
                                    output_tokens=output_tokens,
                                )
                                conv_db.add(assistant_msg)
                                messages_saved += 1
                            elif not content or not content.strip():
                                # Skip empty content (timeouts, etc.)
                                pass

                        conv_db.commit()

                        # Enforce tier-based conversation limits
                        # Store exactly display_limit conversations (no longer need +1 since we don't filter in frontend)
                        user_obj = conv_db.query(User).filter(User.id == user_id).first()
                        tier = user_obj.subscription_tier if user_obj else "free"
                        display_limit = get_conversation_limit(tier)
                        storage_limit = display_limit  # Store exactly the display limit

                        # Get all conversations for user
                        all_conversations = (
                            conv_db.query(Conversation)
                            .filter(Conversation.user_id == user_id)
                            .order_by(Conversation.created_at.desc())
                            .all()
                        )

                        # Delete oldest conversations if over storage limit
                        if len(all_conversations) > storage_limit:
                            conversations_to_delete = all_conversations[storage_limit:]
                            deleted_count = len(conversations_to_delete)
                            for conv_to_delete in conversations_to_delete:
                                conv_db.delete(conv_to_delete)
                            conv_db.commit()

                    except Exception as e:
                        import traceback

                        # Log the error for debugging
                        print(f"[ERROR] Failed to save conversation to database: {e}")
                        print(f"[ERROR] Traceback: {traceback.format_exc()}")
                        conv_db.rollback()
                    finally:
                        conv_db.close()

                # Save conversation - execute in thread executor to avoid blocking stream
                # Background tasks don't execute reliably with StreamingResponse, so we run it here
                try:
                    loop = asyncio.get_running_loop()
                    future = loop.run_in_executor(None, save_conversation_to_db)

                    # Add callback to log any errors from the executor
                    def log_executor_error(fut):
                        try:
                            fut.result()
                        except Exception as e:
                            print(f"[ERROR] Exception in save_conversation_to_db executor: {e}")

                    future.add_done_callback(log_executor_error)
                except Exception as e:
                    print(f"[ERROR] Failed to start save_conversation_to_db executor: {e}")
                    # Fall back to synchronous save if executor fails
                    try:
                        save_conversation_to_db()
                    except Exception as e2:
                        print(f"[ERROR] Fallback synchronous save also failed: {e2}")

            # Send completion event with metadata
            yield f"data: {json.dumps({'type': 'complete', 'metadata': metadata})}\n\n"
        except Exception as e:
            # If we have partial results, send complete event with them so frontend can save history
            # Only send error event if no models completed at all
            error_msg = f"Error: {str(e)[:200]}"
            print(f"Error in generate_stream: {error_msg}")

            # Check if we have any successful models or results
            has_partial_results = successful_models > 0 or len(results_dict) > 0

            if has_partial_results:
                # Send complete event with partial results so frontend can save them
                # Calculate processing time even on error
                processing_time_ms = int((datetime.now() - start_time).total_seconds() * 1000)

                # Build metadata with partial results
                partial_metadata = {
                    "input_length": len(req.input_data),
                    "models_requested": len(req.models),
                    "models_successful": successful_models,
                    "models_failed": failed_models
                    + (len(req.models) - successful_models - failed_models),
                    "timestamp": datetime.now().isoformat(),
                    "processing_time_ms": processing_time_ms,
                    "credits_used": float(total_credits_used) if successful_models > 0 else 0.0,
                    "credits_remaining": int(credits_remaining),
                    "error": error_msg,  # Include error message in metadata
                }
                yield f"data: {json.dumps({'type': 'complete', 'metadata': partial_metadata})}\n\n"
            else:
                # No partial results - send error event
                yield f"data: {json.dumps({'type': 'error', 'message': error_msg})}\n\n"

    return StreamingResponse(generate_stream(), media_type="text/event-stream")


@router.get("/conversations", response_model=list[ConversationSummary])
async def get_conversations(
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user),
):
    """Get list of user's conversations, limited by subscription tier."""
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required")

    tier = current_user.subscription_tier or "free"
    display_limit = get_conversation_limit(tier)
    # Return exactly display_limit conversations (no longer need +1 since we don't filter in frontend)
    return_limit = display_limit

    # Get user's conversations ordered by created_at DESC, limited to display_limit + 1
    # We fetch one extra to check if cleanup is needed, avoiding a separate full query
    conversations = (
        db.query(Conversation)
        .filter(Conversation.user_id == current_user.id)
        .order_by(Conversation.created_at.desc())
        .limit(return_limit + 1)
        .all()
    )

    # Clean up any conversations beyond the limit (in case deletion left extra conversations)
    if len(conversations) > display_limit:
        conversations_to_delete = conversations[display_limit:]
        for conv_to_delete in conversations_to_delete:
            db.delete(conv_to_delete)
        db.commit()
        # Keep only the limited conversations
        conversations = conversations[:display_limit]

    # OPTIMIZATION: Get message counts in a single query instead of N+1 queries
    # This dramatically improves performance when there are many conversations
    conversation_ids = [conv.id for conv in conversations]
    message_counts = {}
    if conversation_ids:
        # Single query to get all message counts
        from sqlalchemy import func

        count_results = (
            db.query(
                ConversationMessageModel.conversation_id,
                func.count(ConversationMessageModel.id).label("count"),
            )
            .filter(ConversationMessageModel.conversation_id.in_(conversation_ids))
            .group_by(ConversationMessageModel.conversation_id)
            .all()
        )
        message_counts = {conv_id: count for conv_id, count in count_results}

    # Convert to summaries with message counts
    summaries = []
    for conv in conversations:
        # Parse models_used JSON
        try:
            models_used = json.loads(conv.models_used) if conv.models_used else []
        except (json.JSONDecodeError, TypeError):
            models_used = []

        # Get message count from pre-fetched data (default to 0 if not found)
        message_count = message_counts.get(conv.id, 0)

        summaries.append(
            ConversationSummary(
                id=conv.id,
                input_data=conv.input_data,
                models_used=models_used,
                conversation_type=conv.conversation_type or "comparison",
                parent_conversation_id=conv.parent_conversation_id,
                breakout_model_id=conv.breakout_model_id,
                created_at=conv.created_at,
                message_count=message_count,
            )
        )

    return summaries


@router.get("/conversations/{conversation_id}", response_model=ConversationDetail)
async def get_conversation(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user),
):
    """Get full conversation with all messages."""
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required")

    # Get conversation and verify it belongs to the user
    conversation = (
        db.query(Conversation)
        .filter(
            Conversation.id == conversation_id,
            Conversation.user_id == current_user.id,
        )
        .first()
    )

    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Parse models_used JSON
    try:
        models_used = json.loads(conversation.models_used) if conversation.models_used else []
    except (json.JSONDecodeError, TypeError):
        models_used = []

    # Get all messages ordered by created_at ASC
    messages = (
        db.query(ConversationMessageModel)
        .filter(ConversationMessageModel.conversation_id == conversation.id)
        .order_by(ConversationMessageModel.created_at.asc())
        .all()
    )

    # Get list of models that have already been broken out from this conversation
    # Only check if this is a comparison (not a breakout itself)
    already_broken_out_models: list[str] = []
    if conversation.conversation_type != "breakout":
        existing_breakouts = (
            db.query(Conversation)
            .filter(
                Conversation.parent_conversation_id == conversation.id,
                Conversation.conversation_type == "breakout",
                Conversation.user_id == current_user.id,
            )
            .all()
        )
        already_broken_out_models = [
            breakout.breakout_model_id
            for breakout in existing_breakouts
            if breakout.breakout_model_id is not None
        ]

    # Convert messages to schema format
    from ..schemas import ConversationMessage as ConversationMessageSchema

    message_schemas = [
        ConversationMessageSchema(
            id=msg.id,
            model_id=msg.model_id,
            role=msg.role,
            content=msg.content,
            input_tokens=msg.input_tokens,
            output_tokens=msg.output_tokens,
            success=msg.success,
            processing_time_ms=msg.processing_time_ms,
            created_at=msg.created_at,
        )
        for msg in messages
    ]

    return ConversationDetail(
        id=conversation.id,
        title=conversation.title,
        input_data=conversation.input_data,
        models_used=models_used,
        conversation_type=conversation.conversation_type or "comparison",
        parent_conversation_id=conversation.parent_conversation_id,
        breakout_model_id=conversation.breakout_model_id,
        already_broken_out_models=already_broken_out_models,
        created_at=conversation.created_at,
        messages=message_schemas,
    )


@router.get("/credits/balance")
async def get_credit_balance(
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user),
    request: Request = None,
    fingerprint: str | None = None,
    timezone: str | None = None,
):
    """
    Get current credit balance and usage statistics.

    Returns credit balance, usage, and reset information for the current user.
    For unregistered users, returns daily credit balance.

    Args:
        fingerprint: Optional browser fingerprint for unregistered users (to check both IP and fingerprint)
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
    # Unregistered user - calculate credits from database (persists across server restarts)
    client_ip = get_client_ip(request) if request else "unknown"
    credits_allocated = DAILY_CREDIT_LIMITS.get("unregistered", 50)

    # Get timezone from query parameter or header, default to UTC

    import pytz

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

    # Calculate credits used today from UsageLog (database) - this persists across restarts
    # Use timezone-aware date range for accurate daily reset
    from ..rate_limiting import _get_local_date, _validate_timezone

    user_timezone = _validate_timezone(user_timezone)
    tz = pytz.timezone(user_timezone)
    now_local = datetime.now(tz)
    today_start_utc = now_local.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(UTC)
    today_end_utc = (
        (now_local + timedelta(days=1))
        .replace(hour=0, minute=0, second=0, microsecond=0)
        .astimezone(UTC)
    )

    # Query UsageLog for credits used today by IP (using timezone-aware date range)
    ip_credits_query = db.query(func.sum(UsageLog.credits_used)).filter(
        UsageLog.user_id.is_(None),  # Anonymous users only
        UsageLog.ip_address == client_ip,
        UsageLog.created_at >= today_start_utc,
        UsageLog.created_at < today_end_utc,
        UsageLog.credits_used.isnot(None),
    )
    ip_credits_used = ip_credits_query.scalar() or Decimal(0)
    # Round UP to be conservative - never give free credits
    ip_credits_used_rounded = (
        int(ip_credits_used.quantize(Decimal("1"), rounding=ROUND_CEILING))
        if ip_credits_used > 0
        else 0
    )
    ip_credits_remaining = max(0, credits_allocated - ip_credits_used_rounded)

    # Query UsageLog for credits used today by fingerprint (if provided, using timezone-aware date range)
    fingerprint_credits_remaining = ip_credits_remaining
    fp_credits_used = Decimal(0)
    if fingerprint:
        fp_credits_query = db.query(func.sum(UsageLog.credits_used)).filter(
            UsageLog.user_id.is_(None),  # Anonymous users only
            UsageLog.browser_fingerprint == fingerprint,
            UsageLog.created_at >= today_start_utc,
            UsageLog.created_at < today_end_utc,
            UsageLog.credits_used.isnot(None),
        )
        fp_credits_used = fp_credits_query.scalar() or Decimal(0)
        # Round UP to be conservative - never give free credits
        fp_credits_used_rounded = (
            int(fp_credits_used.quantize(Decimal("1"), rounding=ROUND_CEILING))
            if fp_credits_used > 0
            else 0
        )
        fingerprint_credits_remaining = max(0, credits_allocated - fp_credits_used_rounded)

    # Sync in-memory storage with database (for fast access in other endpoints)
    # Round UP to be conservative - never give free credits
    # BUT: Skip sync if admin reset flag is set (prevents overwriting admin reset)
    from ..rate_limiting import anonymous_rate_limit_storage

    ip_identifier = f"ip:{client_ip}"
    today_str = _get_local_date(user_timezone)

    # Check if admin reset flag is set - if so, use the reset count instead of DB value
    ip_has_admin_reset = anonymous_rate_limit_storage[ip_identifier].get("_admin_reset", False)
    if ip_has_admin_reset:
        print(
            f"[BALANCE] {ip_identifier}: admin reset flag detected, preserving reset count={anonymous_rate_limit_storage[ip_identifier].get('count', 0)}"
        )
        # Use the reset count from storage instead of database value
        ip_credits_used_from_storage = anonymous_rate_limit_storage[ip_identifier].get("count", 0)
        ip_credits_remaining = max(0, credits_allocated - ip_credits_used_from_storage)
    else:
        # Normal sync - update storage from database
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
            print(
                f"[BALANCE] {fp_identifier}: admin reset flag detected, preserving reset count={anonymous_rate_limit_storage[fp_identifier].get('count', 0)}"
            )
            # Use the reset count from storage instead of database value
            fp_credits_used_from_storage = anonymous_rate_limit_storage[fp_identifier].get(
                "count", 0
            )
            fingerprint_credits_remaining = max(0, credits_allocated - fp_credits_used_from_storage)
        else:
            # Normal sync - update storage from database
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

    # Use the most restrictive limit (lowest remaining credits) - same logic as compare endpoints
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
    """
    Get detailed credit usage history.

    Returns paginated list of usage logs with credit and token information.
    """
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required")

    # Calculate offset
    offset = (page - 1) * per_page

    # Query usage logs for this user
    query = db.query(UsageLog).filter(UsageLog.user_id == current_user.id)

    # Get total count
    total_count = query.count()

    # Get paginated results
    usage_logs = query.order_by(UsageLog.created_at.desc()).offset(offset).limit(per_page).all()

    # Format results
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


@router.delete("/conversations/all", status_code=status.HTTP_200_OK)
async def delete_all_conversations(
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user),
):
    """Delete all conversations for the current user."""
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required")

    # Count and delete all user's conversations (messages deleted via cascade)
    deleted_count = db.query(Conversation).filter(Conversation.user_id == current_user.id).delete()
    db.commit()

    return {
        "message": f"Successfully deleted {deleted_count} conversation(s)",
        "deleted_count": deleted_count,
    }


@router.delete("/conversations/{conversation_id}", status_code=status.HTTP_200_OK)
async def delete_conversation(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user),
):
    """Delete a conversation and all its messages."""
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required")

    # Get conversation and verify it belongs to the user
    conversation = (
        db.query(Conversation)
        .filter(
            Conversation.id == conversation_id,
            Conversation.user_id == current_user.id,
        )
        .first()
    )

    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Delete conversation (messages will be deleted via cascade)
    db.delete(conversation)
    db.commit()

    return {"message": "Conversation deleted successfully"}


@router.post("/conversations/breakout", response_model=ConversationDetail)
async def create_breakout_conversation(
    breakout_data: BreakoutConversationCreate,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user),
):
    """
    Create a breakout conversation from a multi-model comparison.

    This creates a new conversation with:
    - Only the specified model's messages from the parent conversation
    - A reference to the parent conversation
    - conversation_type set to 'breakout'
    """
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required")

    # Get parent conversation and verify it belongs to the user
    parent_conversation = (
        db.query(Conversation)
        .filter(
            Conversation.id == breakout_data.parent_conversation_id,
            Conversation.user_id == current_user.id,
        )
        .first()
    )

    if not parent_conversation:
        raise HTTPException(status_code=404, detail="Parent conversation not found")

    # Verify the model_id was used in the parent conversation
    try:
        parent_models_used = (
            json.loads(parent_conversation.models_used) if parent_conversation.models_used else []
        )
    except (json.JSONDecodeError, TypeError):
        parent_models_used = []

    if breakout_data.model_id not in parent_models_used:
        raise HTTPException(
            status_code=400,
            detail=f"Model {breakout_data.model_id} was not part of the parent conversation",
        )

    # Get messages from parent conversation for this model
    parent_messages = (
        db.query(ConversationMessageModel)
        .filter(ConversationMessageModel.conversation_id == parent_conversation.id)
        .order_by(ConversationMessageModel.created_at.asc())
        .all()
    )

    # Create new breakout conversation
    breakout_conversation = Conversation(
        user_id=current_user.id,
        title=parent_conversation.title,
        input_data=parent_conversation.input_data,
        models_used=json.dumps([breakout_data.model_id]),  # Only the breakout model
        conversation_type="breakout",
        parent_conversation_id=parent_conversation.id,
        breakout_model_id=breakout_data.model_id,
    )
    db.add(breakout_conversation)
    db.flush()  # Get the ID without committing

    # Copy relevant messages (user messages and assistant messages from the breakout model only)
    for msg in parent_messages:
        if msg.role == "user" or (
            msg.role == "assistant" and msg.model_id == breakout_data.model_id
        ):
            new_message = ConversationMessageModel(
                conversation_id=breakout_conversation.id,
                model_id=msg.model_id,
                role=msg.role,
                content=msg.content,
                input_tokens=msg.input_tokens,
                output_tokens=msg.output_tokens,
                success=msg.success,
                processing_time_ms=msg.processing_time_ms,
                created_at=msg.created_at,  # Preserve original timestamps
            )
            db.add(new_message)

    db.commit()
    db.refresh(breakout_conversation)

    # Get all messages for the new conversation
    new_messages = (
        db.query(ConversationMessageModel)
        .filter(ConversationMessageModel.conversation_id == breakout_conversation.id)
        .order_by(ConversationMessageModel.created_at.asc())
        .all()
    )

    # Convert messages to schema format
    from ..schemas import ConversationMessage as ConversationMessageSchema

    message_schemas = [
        ConversationMessageSchema(
            id=msg.id,
            model_id=msg.model_id,
            role=msg.role,
            content=msg.content,
            input_tokens=msg.input_tokens,
            output_tokens=msg.output_tokens,
            success=msg.success,
            processing_time_ms=msg.processing_time_ms,
            created_at=msg.created_at,
        )
        for msg in new_messages
    ]

    return ConversationDetail(
        id=breakout_conversation.id,
        title=breakout_conversation.title,
        input_data=breakout_conversation.input_data,
        models_used=[breakout_data.model_id],
        conversation_type="breakout",
        parent_conversation_id=breakout_conversation.parent_conversation_id,
        breakout_model_id=breakout_conversation.breakout_model_id,
        created_at=breakout_conversation.created_at,
        messages=message_schemas,
    )


@router.get("/user/preferences")
async def get_user_preferences(
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user),
):
    """Get user preferences/settings."""
    from ..models import UserPreference
    from ..schemas import UserPreferencesResponse

    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required")

    # Get or create preferences
    preferences = current_user.preferences
    if not preferences:
        preferences = UserPreference(
            user_id=current_user.id,
            theme="light",
            email_notifications=True,
            usage_alerts=True,
        )
        db.add(preferences)
        db.commit()
        db.refresh(preferences)

    # Parse preferred_models from JSON if present
    preferred_models = None
    if preferences.preferred_models:
        try:
            preferred_models = json.loads(preferences.preferred_models)
        except (json.JSONDecodeError, TypeError):
            preferred_models = None

    return UserPreferencesResponse(
        preferred_models=preferred_models,
        theme=preferences.theme or "light",
        email_notifications=preferences.email_notifications
        if preferences.email_notifications is not None
        else True,
        usage_alerts=preferences.usage_alerts if preferences.usage_alerts is not None else True,
        zipcode=preferences.zipcode,
        remember_state_on_logout=preferences.remember_state_on_logout
        if preferences.remember_state_on_logout is not None
        else False,
    )


@router.put("/user/preferences")
async def update_user_preferences(
    preferences_data: dict = Body(...),
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user),
):
    """Update user preferences/settings."""
    from ..models import UserPreference
    from ..schemas import UserPreferencesResponse, UserPreferencesUpdate

    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required")

    # Validate the input data
    try:
        validated_data = UserPreferencesUpdate(**preferences_data)
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))

    # Get or create preferences
    preferences = current_user.preferences
    if not preferences:
        preferences = UserPreference(
            user_id=current_user.id,
            theme="light",
            email_notifications=True,
            usage_alerts=True,
        )
        db.add(preferences)
        db.flush()

    # Update only the fields that were provided
    if validated_data.theme is not None:
        preferences.theme = validated_data.theme
    if validated_data.email_notifications is not None:
        preferences.email_notifications = validated_data.email_notifications
    if validated_data.usage_alerts is not None:
        preferences.usage_alerts = validated_data.usage_alerts
    if validated_data.preferred_models is not None:
        preferences.preferred_models = json.dumps(validated_data.preferred_models)
    if "zipcode" in preferences_data:  # Allow explicit None to clear
        preferences.zipcode = validated_data.zipcode
    if validated_data.remember_state_on_logout is not None:
        preferences.remember_state_on_logout = validated_data.remember_state_on_logout

    db.commit()
    db.refresh(preferences)

    # Parse preferred_models from JSON if present
    preferred_models = None
    if preferences.preferred_models:
        try:
            preferred_models = json.loads(preferences.preferred_models)
        except (json.JSONDecodeError, TypeError):
            preferred_models = None

    return UserPreferencesResponse(
        preferred_models=preferred_models,
        theme=preferences.theme or "light",
        email_notifications=preferences.email_notifications
        if preferences.email_notifications is not None
        else True,
        usage_alerts=preferences.usage_alerts if preferences.usage_alerts is not None else True,
        zipcode=preferences.zipcode,
        remember_state_on_logout=preferences.remember_state_on_logout
        if preferences.remember_state_on_logout is not None
        else False,
    )
