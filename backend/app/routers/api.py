"""
Main API router for core application endpoints.

This module contains the main application endpoints like /models, /compare-stream, etc.
that are used by the frontend for the core AI comparison functionality.
"""

from fastapi import APIRouter, Request, Depends, HTTPException, status, BackgroundTasks, Body
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel, ConfigDict
from typing import Optional, Dict, Any, Union
from sqlalchemy.orm import Session
from sqlalchemy import func
from collections import defaultdict
from datetime import datetime, timezone
import asyncio
import json
import os

from ..model_runner import (
    OPENROUTER_MODELS,
    MODELS_BY_PROVIDER,
    call_openrouter_streaming,
    clean_model_response,
    TokenUsage,
)
from ..models import (
    User,
    UsageLog,
    AppSettings,
    Conversation,
    ConversationMessage as ConversationMessageModel,
)
from ..credit_manager import ensure_credits_allocated, get_user_credits, get_credit_usage_stats, check_and_reset_credits_if_needed
from decimal import Decimal, ROUND_CEILING
from ..database import get_db
from ..dependencies import get_current_user
from ..schemas import ConversationSummary, ConversationDetail
from ..rate_limiting import (
    get_user_usage_stats,
    get_anonymous_usage_stats,
    anonymous_rate_limit_storage,
    check_user_rate_limit,
    increment_user_usage,
    check_anonymous_rate_limit,
    increment_anonymous_usage,
    get_model_limit,
    is_overage_allowed,
    # Credit-based functions
    check_user_credits,
    deduct_user_credits,
    check_anonymous_credits,
    deduct_anonymous_credits,
)

router = APIRouter(tags=["API"])

# In-memory storage for model performance tracking
# This is shared with main.py via import
model_stats: Dict[str, Dict[str, Any]] = defaultdict(lambda: {"success": 0, "failure": 0, "last_error": None, "last_success": None})

# Import configuration constants
from ..config import (
    ANONYMOUS_DAILY_LIMIT,
    ANONYMOUS_MODEL_LIMIT,
    MODEL_LIMITS,
    SUBSCRIPTION_CONFIG,
    get_conversation_limit,
    get_daily_limit,
    get_model_limit,
)
from ..config.constants import DAILY_CREDIT_LIMITS


# Pydantic models for request/response
class ConversationMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str

    model_config = ConfigDict(json_schema_extra={"example": {"role": "user", "content": "What is artificial intelligence?"}})


class CompareRequest(BaseModel):
    input_data: str
    models: list[str]
    conversation_history: list[ConversationMessage] = []  # Optional conversation context
    browser_fingerprint: Optional[str] = None  # Optional browser fingerprint for rate limiting
    conversation_id: Optional[int] = None  # Optional conversation ID for follow-ups (most reliable matching)

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


class ResetRateLimitRequest(BaseModel):
    fingerprint: Optional[str] = None


# Helper functions
# get_conversation_limit_for_tier is now get_conversation_limit from config module


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
    current_user: Optional[User] = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Get list of all AI models with tier_access field indicating availability.

    - Returns ALL models from model_runner.py
    - Models are marked with tier_access field ('anonymous', 'free', or 'paid')
    - Frontend displays locked models as disabled/restricted for anonymous and free tiers
    - Backend still validates model access when making API calls

    OPTIMIZATION: Uses caching since model list is static data.
    """
    from ..cache import get_cached_models, CACHE_KEY_MODELS
    from ..model_runner import filter_models_by_tier

    # Determine user tier
    if current_user:
        tier = current_user.subscription_tier or "free"
    else:
        tier = "anonymous"

    def get_models():
        from ..model_runner import get_model_token_limits_from_openrouter

        # Get all models with tier_access field (no filtering - show all models)
        all_models = filter_models_by_tier(OPENROUTER_MODELS, tier)

        # Add token limits to each model
        for model in all_models:
            limits = get_model_token_limits_from_openrouter(model["id"])
            if limits:
                # Convert tokens to approximate characters (1 token ≈ 4 chars) for user-friendly display
                model["max_input_chars"] = limits["max_input"] * 4
                model["max_output_chars"] = limits["max_output"] * 4
            else:
                # Default fallback values
                model["max_input_chars"] = 32768  # 8192 tokens * 4
                model["max_output_chars"] = 32768  # 8192 tokens * 4

        # Get all models_by_provider with tier_access field
        models_by_provider = {}
        for provider, models in MODELS_BY_PROVIDER.items():
            provider_models = filter_models_by_tier(models, tier)
            if provider_models:  # Add provider if it has any models
                # Add token limits to provider models too
                for model in provider_models:
                    limits = get_model_token_limits_from_openrouter(model["id"])
                    if limits:
                        model["max_input_chars"] = limits["max_input"] * 4
                        model["max_output_chars"] = limits["max_output"] * 4
                    else:
                        model["max_input_chars"] = 32768
                        model["max_output_chars"] = 32768
                models_by_provider[provider] = provider_models

        return {
            "models": all_models,
            "models_by_provider": models_by_provider,
            "user_tier": tier,
        }

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
    from ..cache import get_cached_app_settings, CACHE_KEY_APP_SETTINGS

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
    fingerprint: Optional[str] = None,
    current_user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get current rate limit status for the client.

    Returns different information for authenticated vs anonymous users.
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
    else:
        # Anonymous user - return IP/fingerprint-based usage
        client_ip = get_client_ip(request)
        usage_stats = get_anonymous_usage_stats(f"ip:{client_ip}")

        result = {**usage_stats, "authenticated": False, "ip_address": client_ip}

        # Include fingerprint stats if provided
        if fingerprint:
            fp_stats = get_anonymous_usage_stats(f"fp:{fingerprint}")
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
    current_user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    DEV ONLY: Reset rate limits, usage counts, and conversation history for the current user.
    For authenticated users: resets database usage and deletes their conversations.
    For anonymous users: resets IP/fingerprint-based rate limits (client clears localStorage).
    This endpoint should be disabled in production!
    """
    # Only allow in development mode
    if os.environ.get("ENVIRONMENT") != "development":
        raise HTTPException(status_code=403, detail="This endpoint is only available in development mode")

    client_ip = get_client_ip(request)
    deleted_count = 0

    # For authenticated users: reset usage and delete their conversations
    if current_user:
        # Reset usage counts
        current_user.daily_usage_count = 0
        current_user.monthly_overage_count = 0
        current_user.daily_extended_usage = 0

        # Delete only this user's conversations (messages deleted via cascade)
        deleted_count = db.query(Conversation).filter(Conversation.user_id == current_user.id).delete()
        db.commit()

    # For anonymous users: reset IP-based rate limits
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

    return {
        "message": "Rate limits, usage, and conversation history reset successfully",
        "ip_address": client_ip,
        "fingerprint_reset": fingerprint is not None,
        "conversations_deleted": deleted_count,
        "user_type": "authenticated" if current_user else "anonymous",
    }


@router.post("/compare-stream")
async def compare_stream(
    req: CompareRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
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
    from ..model_runner import get_min_max_input_tokens, estimate_token_count

    min_max_input_tokens = get_min_max_input_tokens(req.models)
    input_tokens = estimate_token_count(req.input_data)

    if input_tokens > min_max_input_tokens:
        # Convert tokens to approximate characters for user-friendly message (1 token ≈ 4 chars)
        approx_chars = input_tokens * 4
        max_chars = min_max_input_tokens * 4
        raise HTTPException(
            status_code=400,
            detail=f"Your input is too long for one or more of the selected models. The maximum input length is approximately {max_chars:,} characters, but your input is approximately {approx_chars:,} characters. Please shorten your input or select different models that support longer inputs.",
        )

    # Determine model limit based on user tier
    if current_user:
        tier_model_limit = get_model_limit(current_user.subscription_tier)
        tier_name = current_user.subscription_tier
    else:
        tier_model_limit = ANONYMOUS_MODEL_LIMIT  # Anonymous users model limit from configuration
        tier_name = "anonymous"

    # Validate model access based on tier (check if restricted models are selected)
    from ..model_runner import is_model_available_for_tier

    restricted_models = [model_id for model_id in req.models if not is_model_available_for_tier(model_id, tier_name)]
    if restricted_models:
        upgrade_message = ""
        if tier_name == "anonymous":
            upgrade_message = " Sign up for a free account or upgrade to a paid tier to access premium models."
        elif tier_name == "free":
            upgrade_message = " Upgrade to Starter ($9.95/month) or higher to access all premium models."
        else:
            upgrade_message = " This model requires a paid subscription."

        raise HTTPException(
            status_code=403,
            detail=f"The following models are not available for {tier_name} tier: {', '.join(restricted_models)}.{upgrade_message}",
        )

    # Enforce tier-specific model limit
    if len(req.models) > tier_model_limit:
        upgrade_message = ""
        if tier_name == "anonymous":
            free_model_limit = get_model_limit("free")
            upgrade_message = f" Sign up for a free account to compare up to {free_model_limit} models."
        elif tier_name == "free":
            starter_model_limit = get_model_limit("starter")
            pro_model_limit = get_model_limit("pro")
            upgrade_message = f" Upgrade to Starter for {starter_model_limit} models or Pro for {pro_model_limit} models."
        elif tier_name in ["starter", "starter_plus"]:
            pro_model_limit = get_model_limit("pro")
            pro_plus_model_limit = get_model_limit("pro_plus")
            upgrade_message = f" Upgrade to Pro for {pro_model_limit} models or Pro+ for {pro_plus_model_limit} models."

        raise HTTPException(
            status_code=400,
            detail=f"Your {tier_name} tier allows maximum {tier_model_limit} models per comparison. You selected {len(req.models)} models.{upgrade_message}",
        )

    # Get number of models for usage tracking
    num_models = len(req.models)

    # --- CREDIT-BASED RATE LIMITING ---
    client_ip = get_client_ip(request)

    is_overage = False
    overage_charge = 0.0
    credits_remaining = 0
    credits_allocated = 0

    if current_user:
        # Ensure credits are allocated for authenticated user
        # IMPORTANT: Check and reset credits FIRST if reset time has passed,
        # then ensure credits are allocated (in case they weren't allocated yet)
        check_and_reset_credits_if_needed(current_user.id, db)
        ensure_credits_allocated(current_user.id, db)
        db.refresh(current_user)

        # Debug logging for authentication and tier
        print(
            f"[API] Authenticated user: {current_user.email}, subscription_tier: '{current_user.subscription_tier}', is_active: {current_user.is_active}"
        )

        # Get current credit balance (no estimate needed - we don't block based on estimates)
        credits_remaining = get_user_credits(current_user.id, db)
        credits_allocated = current_user.monthly_credits_allocated or 0

        # Block submission ONLY if credits are already at 0 (after a previous comparison zeroed them out)
        # This allows one final comparison that zeros out credits, then blocks subsequent requests
        if credits_remaining == 0:
            tier_name = current_user.subscription_tier or "free"
            if tier_name in ["anonymous", "free"]:
                error_msg = (
                    f"You've run out of credits. Credits will reset to {DAILY_CREDIT_LIMITS.get(tier_name, 50)} tomorrow, "
                    f"or sign-up for a free account to get more credits, more models, and more history!"
                )
            elif tier_name == "pro_plus":
                reset_date = current_user.credits_reset_at.date().isoformat() if current_user.credits_reset_at else "N/A"
                error_msg = (
                    f"You've run out of credits which will reset on {reset_date}. "
                    f"Wait until your reset, or sign-up for model comparison overages."
                )
            else:
                reset_date = current_user.credits_reset_at.date().isoformat() if current_user.credits_reset_at else "N/A"
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
        # Anonymous user - check credit-based limits
        print(
            f"[API] Anonymous user - IP: {client_ip}, fingerprint: {req.browser_fingerprint[:20] if req.browser_fingerprint else 'None'}..."
        )

        # Check IP-based credits (pass Decimal(0) since we don't need estimate for blocking)
        ip_identifier = f"ip:{client_ip}"
        _, ip_credits_remaining, ip_credits_allocated = check_anonymous_credits(ip_identifier, Decimal(0), db)

        fingerprint_credits_remaining = ip_credits_remaining
        fingerprint_credits_allocated = ip_credits_allocated
        if req.browser_fingerprint:
            fp_identifier = f"fp:{req.browser_fingerprint}"
            _, fingerprint_credits_remaining, fingerprint_credits_allocated = check_anonymous_credits(
                fp_identifier, Decimal(0), db
            )

        # Use the most restrictive limit (lowest remaining credits)
        credits_remaining = min(
            ip_credits_remaining, fingerprint_credits_remaining if req.browser_fingerprint else ip_credits_remaining
        )
        credits_allocated = ip_credits_allocated

        # Block submission ONLY if credits are already at 0 (after a previous comparison zeroed them out)
        # This allows one final comparison that zeros out credits, then blocks subsequent requests
        if credits_remaining == 0:
            raise HTTPException(
                status_code=402,  # Payment Required
                detail=(
                    f"You've run out of credits. Credits will reset to 50 tomorrow, "
                    f"or sign-up for a free account to get more credits, more models, and more history!"
                ),
            )

        print(
            f"Anonymous user - IP: {client_ip} - Credits: {credits_remaining}/{credits_allocated}"
        )
    # --- END CREDIT-BASED RATE LIMITING ---

    # Track start time for processing metrics
    start_time = datetime.now()

    # Store user ID for use inside generator (avoid session detachment issues)
    # IMPORTANT: Also store whether user exists to prevent anonymous mock mode for authenticated users
    user_id = current_user.id if current_user else None
    has_authenticated_user = current_user is not None

    async def generate_stream():
        """
        Generator function that yields SSE-formatted events.
        Streams responses from all requested models concurrently for maximum performance.

        Modern async/await pattern (2025 best practices):
        - Concurrent execution via asyncio.create_task
        - Queue-based chunk collection with asyncio.Queue
        - Graceful error handling per model
        - Non-blocking I/O throughout
        """
        nonlocal credits_remaining  # Allow updating outer scope variable
        successful_models = 0
        failed_models = 0
        results_dict = {}
        # Track token usage for all models
        total_input_tokens = 0
        total_output_tokens = 0
        total_effective_tokens = 0
        usage_data_dict = {}  # Store usage data per model

        # Check if mock mode is enabled for this user
        # IMPORTANT: Authenticated users should NEVER use anonymous mock mode
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

                settings = get_cached_app_settings(get_settings)
                if settings and settings.anonymous_mock_mode_enabled:
                    use_mock = True

        try:
            # Calculate minimum max output tokens across all models to avoid truncation
            from ..model_runner import get_min_max_output_tokens, estimate_token_count, count_conversation_tokens
            from decimal import Decimal

            # Calculate input tokens for this request
            input_tokens = estimate_token_count(req.input_data)
            if req.conversation_history:
                input_tokens += count_conversation_tokens(req.conversation_history)

            # If credits are low, calculate reduced max_tokens based on available credits per model
            # This helps ensure users can still get responses even with low credits
            effective_max_tokens = get_min_max_output_tokens(req.models)
            
            # Calculate credits available per model
            credits_per_model = Decimal(credits_remaining) / Decimal(num_models) if num_models > 0 else Decimal(0)
            
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
                max_output_tokens_calc = (effective_tokens_per_model - Decimal(input_tokens)) / Decimal(2.5)
                max_output_tokens_int = max(MIN_USABLE_OUTPUT_TOKENS, int(max_output_tokens_calc))  # Enforce minimum usable threshold
                
                # If we had to enforce the minimum threshold, the comparison will exceed available credits
                # Credits will be capped to 0 after deduction (handled by credit_manager)
                if max_output_tokens_int == MIN_USABLE_OUTPUT_TOKENS and max_output_tokens_calc < MIN_USABLE_OUTPUT_TOKENS:
                    print(
                        f"[API] Low credits per model ({credits_per_model:.2f}) - enforcing minimum usable response ({MIN_USABLE_OUTPUT_TOKENS} tokens). Credits will be capped to 0."
                    )
                
                # Use the smaller of calculated max_tokens or model's max capability
                effective_max_tokens = min(effective_max_tokens, max_output_tokens_int)
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
                        try:
                            # Manually iterate generator to capture return value (TokenUsage)
                            gen = call_openrouter_streaming(
                                req.input_data,
                                model_id,
                                req.conversation_history,
                                use_mock,
                                max_tokens_override=effective_max_tokens,
                            )

                            try:
                                while True:
                                    chunk = next(gen)
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
                            # Push error as chunk
                            asyncio.run_coroutine_threadsafe(
                                chunk_queue.put({"type": "chunk", "model": model_id, "content": error_msg}),
                                loop,
                            )
                            return error_msg, True, None  # error_msg, is_error, usage_data

                    # Run streaming in executor (allows true concurrent execution)
                    full_content, is_error, usage_data = await loop.run_in_executor(None, process_stream_to_queue)

                    # Clean the final accumulated content (unless it's an error)
                    if not is_error:
                        model_content = clean_model_response(full_content)
                    else:
                        model_content = full_content

                    # Final check if response is an error
                    is_error = is_error or model_content.startswith("Error:")

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
                    await chunk_queue.put({"type": "chunk", "model": model_id, "content": error_msg})

                    return {"model": model_id, "content": error_msg, "error": True, "usage": None}

            # Create tasks for all models to run concurrently
            tasks = [asyncio.create_task(stream_single_model(model_id)) for model_id in req.models]

            # Process chunks and completed tasks concurrently
            pending_tasks = set(tasks)

            while pending_tasks or not chunk_queue.empty():
                # Wait for either a chunk or a task completion
                done_tasks = set()

                # Check for completed tasks without blocking
                for task in list(pending_tasks):
                    if task.done():
                        done_tasks.add(task)
                        pending_tasks.remove(task)

                # Process completed tasks
                for task in done_tasks:
                    result = await task
                    model_id = result["model"]

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

                # Process available chunks from queue
                while not chunk_queue.empty():
                    try:
                        chunk_data = await asyncio.wait_for(chunk_queue.get(), timeout=0.001)

                        if chunk_data["type"] == "chunk":
                            # Don't clean chunks during streaming - preserves whitespace
                            yield f"data: {json.dumps({'model': chunk_data['model'], 'type': 'chunk', 'content': chunk_data['content']})}\n\n"
                    except asyncio.TimeoutError:
                        break

                # Small yield to prevent tight loop and allow other operations
                if pending_tasks:
                    await asyncio.sleep(0.01)  # 10ms yield

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

            # Store the actual fractional credits for UsageLog (for analytics)
            actual_credits_used = total_credits_used

            # Ensure minimum 1 credit deduction per comparison (round UP)
            # This ensures users are charged at least 1 credit per comparison
            if successful_models > 0 and total_credits_used > 0:
                total_credits_used = max(Decimal(1), total_credits_used.quantize(Decimal("1"), rounding=ROUND_CEILING))

            # Deduct credits - only for successful models
            if successful_models > 0 and total_credits_used > 0:
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
                        # Deduct credits for anonymous user
                        ip_identifier = f"ip:{client_ip}"
                        deduct_anonymous_credits(ip_identifier, total_credits_used)
                        # Get updated IP credit balance (no db arg - read from memory only)
                        _, ip_credits_remaining, _ = check_anonymous_credits(ip_identifier, Decimal(0))

                        fingerprint_credits_remaining = ip_credits_remaining
                        if req.browser_fingerprint:
                            fp_identifier = f"fp:{req.browser_fingerprint}"
                            deduct_anonymous_credits(fp_identifier, total_credits_used)
                            # Get updated fingerprint credit balance (no db arg - read from memory only)
                            _, fingerprint_credits_remaining, _ = check_anonymous_credits(fp_identifier, Decimal(0))

                        # Use the most restrictive limit (lowest remaining credits) - same logic as at start
                        credits_remaining = min(
                            ip_credits_remaining, fingerprint_credits_remaining if req.browser_fingerprint else ip_credits_remaining
                        )
                        print(
                            f"[DEBUG] Anonymous credits after deduction - IP: {ip_credits_remaining}, FP: {fingerprint_credits_remaining if req.browser_fingerprint else 'N/A'}, Final: {credits_remaining}, Actual: {actual_credits_used}, Charged: {total_credits_used}"
                        )
                except ValueError as e:
                    # Should not happen since we checked before, but handle gracefully
                    print(f"Warning: Credit deduction failed: {e}")
                finally:
                    credit_db.close()
            else:
                # Even if no credits were deducted, refresh credits_remaining for anonymous users
                # (in case of any other state changes, though this shouldn't normally happen)
                if not user_id:
                    ip_identifier = f"ip:{client_ip}"
                    _, ip_credits_remaining, _ = check_anonymous_credits(ip_identifier, Decimal(0), db)
                    fingerprint_credits_remaining = ip_credits_remaining
                    if req.browser_fingerprint:
                        fp_identifier = f"fp:{req.browser_fingerprint}"
                        _, fingerprint_credits_remaining, _ = check_anonymous_credits(fp_identifier, Decimal(0), db)
                    credits_remaining = min(
                        ip_credits_remaining, fingerprint_credits_remaining if req.browser_fingerprint else ip_credits_remaining
                    )

                # Extended tier usage tracking removed - no longer needed

            # Calculate processing time
            processing_time_ms = int((datetime.now() - start_time).total_seconds() * 1000)

            # Build metadata including credit information
            # Debug: Log credits_remaining before including in metadata
            if not user_id:
                print(
                    f"[DEBUG] Building metadata for anonymous user - credits_remaining: {credits_remaining}, actual_credits: {actual_credits_used}, charged_credits: {total_credits_used}"
                )
            metadata = {
                "input_length": len(req.input_data),
                "models_requested": len(req.models),
                "models_successful": successful_models,
                "models_failed": failed_models,
                "timestamp": datetime.now().isoformat(),
                "processing_time_ms": processing_time_ms,
                # Credit-based fields
                "credits_used": float(total_credits_used),
                "credits_remaining": credits_remaining,
            }

            # Log usage to database SYNCHRONOUSLY (not in background) to ensure database is updated
            # before frontend queries for updated credits. This prevents race condition where
            # frontend queries /credits/balance before UsageLog is committed.
            #
            # IMPORTANT: UsageLog stores the CHARGED credits (minimum 1 per comparison)
            # Token data (input_tokens, output_tokens, effective_tokens) preserves actual usage for analytics
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
                estimated_cost=len(req.models) * 0.0166,  # Legacy field - keep for backward compatibility
                is_overage=is_overage,
                overage_charge=overage_charge,
                # Credit-based fields
                input_tokens=total_input_tokens if total_input_tokens > 0 else None,
                output_tokens=total_output_tokens if total_output_tokens > 0 else None,
                total_tokens=(
                    total_input_tokens + total_output_tokens if (total_input_tokens > 0 or total_output_tokens > 0) else None
                ),
                effective_tokens=total_effective_tokens if total_effective_tokens > 0 else None,
                credits_used=total_credits_used,  # Store charged credits (minimum 1 per comparison)
            )
            # Create new session and commit synchronously to ensure database is updated before returning
            log_db = SessionLocal()
            try:
                log_db.add(usage_log)
                log_db.commit()
                print(
                    f"[DEBUG] UsageLog committed to database - actual_credits: {actual_credits_used}, charged_credits: {total_credits_used}, user_id: {user_id}, ip: {client_ip}, fp: {req.browser_fingerprint[:20] if req.browser_fingerprint else 'None'}"
                )
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
                        is_follow_up = bool(req.conversation_history and len(req.conversation_history) > 0)

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
                                        conv_models = json.loads(conv.models_used) if conv.models_used else []
                                        # Match by models AND original input_data to ensure correct conversation
                                        models_match = sorted(conv_models) == req_models_sorted
                                        input_matches = original_input_data and conv.input_data == original_input_data

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

                        # Save user message (current prompt)
                        # For new conversations, this is the first message
                        # For follow-ups, this is the new user prompt
                        user_msg = ConversationMessageModel(
                            conversation_id=conversation.id,
                            role="user",
                            content=req.input_data,
                            model_id=None,
                        )
                        conv_db.add(user_msg)

                        # Save assistant messages for each successful model
                        messages_saved = 0
                        for model_id, content in results_dict.items():
                            if not content.startswith("Error:"):
                                assistant_msg = ConversationMessageModel(
                                    conversation_id=conversation.id,
                                    role="assistant",
                                    content=content,
                                    model_id=model_id,
                                    success=True,
                                    processing_time_ms=processing_time_ms,
                                )
                                conv_db.add(assistant_msg)
                                messages_saved += 1

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

                        # Log error silently (errors should be handled by proper logging infrastructure)
                        conv_db.rollback()
                    finally:
                        conv_db.close()

                # Save conversation - execute in thread executor to avoid blocking stream
                # Background tasks don't execute reliably with StreamingResponse, so we run it here
                loop = asyncio.get_event_loop()
                loop.run_in_executor(None, save_conversation_to_db)

            # Send completion event with metadata
            yield f"data: {json.dumps({'type': 'complete', 'metadata': metadata})}\n\n"
        except Exception as e:
            # Send error event
            error_msg = f"Error: {str(e)[:200]}"
            print(f"Error in generate_stream: {error_msg}")
            yield f"data: {json.dumps({'type': 'error', 'message': error_msg})}\n\n"

    return StreamingResponse(generate_stream(), media_type="text/event-stream")


@router.get("/conversations", response_model=list[ConversationSummary])
async def get_conversations(
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    """Get list of user's conversations, limited by subscription tier."""
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required")

    tier = current_user.subscription_tier or "free"
    display_limit = get_conversation_limit(tier)
    # Return exactly display_limit conversations (no longer need +1 since we don't filter in frontend)
    return_limit = display_limit

    # Get all conversations to check if cleanup is needed
    all_conversations = (
        db.query(Conversation).filter(Conversation.user_id == current_user.id).order_by(Conversation.created_at.desc()).all()
    )

    # Clean up any conversations beyond the limit (in case deletion left extra conversations)
    if len(all_conversations) > display_limit:
        conversations_to_delete = all_conversations[display_limit:]
        deleted_count = len(conversations_to_delete)
        for conv_to_delete in conversations_to_delete:
            db.delete(conv_to_delete)
        db.commit()

    # Get user's conversations ordered by created_at DESC, limited to display_limit
    conversations = (
        db.query(Conversation)
        .filter(Conversation.user_id == current_user.id)
        .order_by(Conversation.created_at.desc())
        .limit(return_limit)
        .all()
    )

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
                created_at=conv.created_at,
                message_count=message_count,
            )
        )

    return summaries


@router.get("/conversations/{conversation_id}", response_model=ConversationDetail)
async def get_conversation(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
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

    # Convert messages to schema format
    from ..schemas import ConversationMessage as ConversationMessageSchema

    message_schemas = [
        ConversationMessageSchema(
            id=msg.id,
            model_id=msg.model_id,
            role=msg.role,
            content=msg.content,
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
        created_at=conversation.created_at,
        messages=message_schemas,
    )


# ============================================================================
# Credit Management Endpoints
# ============================================================================


@router.get("/credits/balance")
async def get_credit_balance(
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
    request: Request = None,
    fingerprint: Optional[str] = None,
):
    """
    Get current credit balance and usage statistics.

    Returns credit balance, usage, and reset information for the current user.
    For anonymous users, returns daily credit balance.

    Args:
        fingerprint: Optional browser fingerprint for anonymous users (to check both IP and fingerprint)
    """
    if current_user:
        # Authenticated user
        # IMPORTANT: Check and reset credits FIRST if reset time has passed,
        # then ensure credits are allocated (in case they weren't allocated yet)
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
    else:
        # Anonymous user - calculate credits from database (persists across server restarts)
        client_ip = get_client_ip(request) if request else "unknown"
        credits_allocated = DAILY_CREDIT_LIMITS.get("anonymous", 50)

        # Calculate credits used today from UsageLog (database) - this persists across restarts
        # Use func.date() for SQLite compatibility (CAST AS DATE doesn't work properly in SQLite)
        today_date = datetime.now(timezone.utc).date().isoformat()  # Format as 'YYYY-MM-DD'

        # Query UsageLog for credits used today by IP
        ip_credits_query = db.query(func.sum(UsageLog.credits_used)).filter(
            UsageLog.user_id.is_(None),  # Anonymous users only
            UsageLog.ip_address == client_ip,
            func.date(UsageLog.created_at) == today_date,
            UsageLog.credits_used.isnot(None),
        )
        ip_credits_used = ip_credits_query.scalar() or Decimal(0)
        # Round UP to be conservative - never give free credits
        ip_credits_used_rounded = int(ip_credits_used.quantize(Decimal("1"), rounding=ROUND_CEILING)) if ip_credits_used > 0 else 0
        ip_credits_remaining = max(0, credits_allocated - ip_credits_used_rounded)

        # Query UsageLog for credits used today by fingerprint (if provided)
        fingerprint_credits_remaining = ip_credits_remaining
        fp_credits_used = Decimal(0)
        if fingerprint:
            fp_credits_query = db.query(func.sum(UsageLog.credits_used)).filter(
                UsageLog.user_id.is_(None),  # Anonymous users only
                UsageLog.browser_fingerprint == fingerprint,
                func.date(UsageLog.created_at) == today_date,
                UsageLog.credits_used.isnot(None),
            )
            fp_credits_used = fp_credits_query.scalar() or Decimal(0)
            # Round UP to be conservative - never give free credits
            fp_credits_used_rounded = (
                int(fp_credits_used.quantize(Decimal("1"), rounding=ROUND_CEILING)) if fp_credits_used > 0 else 0
            )
            fingerprint_credits_remaining = max(0, credits_allocated - fp_credits_used_rounded)

        # Use the most restrictive limit (lowest remaining credits) - same logic as compare endpoints
        credits_remaining = min(ip_credits_remaining, fingerprint_credits_remaining if fingerprint else ip_credits_remaining)

        # Sync in-memory storage with database (for fast access in other endpoints)
        # Round UP to be conservative - never give free credits
        from ..rate_limiting import anonymous_rate_limit_storage

        ip_identifier = f"ip:{client_ip}"
        today_str = datetime.now(timezone.utc).date().isoformat()
        anonymous_rate_limit_storage[ip_identifier] = {
            "count": int(ip_credits_used.quantize(Decimal("1"), rounding=ROUND_CEILING)) if ip_credits_used > 0 else 0,
            "date": today_str,
            "first_seen": anonymous_rate_limit_storage[ip_identifier].get("first_seen") or datetime.now(timezone.utc),
        }
        if fingerprint:
            fp_identifier = f"fp:{fingerprint}"
            anonymous_rate_limit_storage[fp_identifier] = {
                "count": int(fp_credits_used.quantize(Decimal("1"), rounding=ROUND_CEILING)) if fp_credits_used > 0 else 0,
                "date": today_str,
                "first_seen": anonymous_rate_limit_storage[fp_identifier].get("first_seen") or datetime.now(timezone.utc),
            }

        print(
            f"[DEBUG] get_credit_balance (from DB) - IP: {client_ip}, Fingerprint: {fingerprint[:20] if fingerprint else 'None'}..."
        )
        print(f"[DEBUG] DB Credits used - IP: {ip_credits_used}, FP: {fp_credits_used if fingerprint else 'N/A'}")
        print(
            f"[DEBUG] Credits remaining - IP: {ip_credits_remaining}, FP: {fingerprint_credits_remaining if fingerprint else 'N/A'}, Final: {credits_remaining}"
        )

        return {
            "credits_allocated": credits_allocated,
            "credits_used_today": credits_allocated - credits_remaining,
            "credits_remaining": credits_remaining,
            "period_type": "daily",
            "subscription_tier": "anonymous",
        }


@router.get("/credits/usage")
async def get_credit_usage(
    page: int = 1,
    per_page: int = 50,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
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


@router.delete("/conversations/{conversation_id}", status_code=status.HTTP_200_OK)
async def delete_conversation(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
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
