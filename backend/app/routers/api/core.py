"""Core API routes: models, compare-stream, estimate-tokens, rate-limit."""

import logging
import os
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from ...config import ANONYMOUS_MODEL_LIMIT, get_model_limit
from ...config.settings import settings
from ...credit_manager import (
    check_and_reset_credits_if_needed,
    ensure_credits_allocated,
    get_user_credits,
)
from ...database import get_db
from ...dependencies import get_current_user
from ...model_runner import (
    MODELS_BY_PROVIDER,
    OPENROUTER_MODELS,
    estimate_token_count,
    get_min_max_input_tokens,
    get_model_max_input_tokens,
    is_model_available_for_tier,
)
from ...models import AppSettings, User
from ...rate_limiting import check_anonymous_credits
from ...utils.cookies import get_token_from_cookies
from ...utils.geo import get_location_from_ip, get_timezone_from_request
from ...utils.request import get_client_ip
from .dev import model_stats

router = APIRouter(tags=["API"])
logger = logging.getLogger(__name__)


class ConversationMessage(BaseModel):
    role: str
    content: str
    model_id: str | None = None

    model_config = ConfigDict(
        json_schema_extra={"example": {"role": "user", "content": "What is AI?"}}
    )


class CompareRequest(BaseModel):
    input_data: str
    models: list[str]
    conversation_history: list[ConversationMessage] = []
    browser_fingerprint: str | None = None
    conversation_id: int | None = None
    estimated_input_tokens: int | None = None
    timezone: str | None = None
    location: str | None = None
    enable_web_search: bool = False
    temperature: float | None = None  # 0.0-2.0, controls response randomness

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "input_data": "Explain quantum computing",
                "models": ["openai/gpt-4", "anthropic/claude-3-opus"],
                "conversation_history": [],
                "conversation_id": 123,
            }
        }
    )


class EstimateTokensRequest(BaseModel):
    input_data: str
    model_id: str | None = None
    conversation_history: list[ConversationMessage] = []

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "input_data": "Explain quantum computing",
                "model_id": "openai/gpt-4",
                "conversation_history": [],
            }
        }
    )


class EstimateTokensResponse(BaseModel):
    input_tokens: int
    conversation_history_tokens: int
    total_input_tokens: int
    model_id: str | None = None


@router.get("/models")
async def get_available_models(
    current_user: User | None = Depends(get_current_user),
) -> dict:
    """Get list of all AI models with tier_access field."""
    from ...model_runner import (
        filter_models_by_tier,
        get_model_token_limits_from_openrouter,
    )

    if current_user:
        tier = current_user.subscription_tier or "free"
        is_trial_active = current_user.is_trial_active
    else:
        tier = "unregistered"
        is_trial_active = False

    def get_models():
        all_models = filter_models_by_tier(OPENROUTER_MODELS, tier, is_trial_active)
        for model in all_models:
            limits = get_model_token_limits_from_openrouter(model["id"])
            if limits:
                model["max_input_tokens"] = limits["max_input"]
                model["max_output_tokens"] = limits["max_output"]
            else:
                model["max_input_tokens"] = 8192
                model["max_output_tokens"] = 8192

        from ...model_runner import sort_models_by_tier_and_version

        models_by_provider = {}
        for provider, models in MODELS_BY_PROVIDER.items():
            sorted_models = sort_models_by_tier_and_version(models)
            provider_models = filter_models_by_tier(sorted_models, tier, is_trial_active)
            if provider_models:
                seen_ids: set[str] = set()
                deduped_models = []
                for model in provider_models:
                    mid = model.get("id")
                    if mid and mid in seen_ids:
                        continue
                    if mid:
                        seen_ids.add(mid)
                    limits = get_model_token_limits_from_openrouter(model["id"])
                    if limits:
                        model["max_input_tokens"] = limits["max_input"]
                        model["max_output_tokens"] = limits["max_output"]
                    else:
                        model["max_input_tokens"] = 8192
                        model["max_output_tokens"] = 8192
                    deduped_models.append(model)
                if deduped_models:
                    models_by_provider[provider] = deduped_models

        return {
            "models": all_models,
            "models_by_provider": models_by_provider,
            "user_tier": tier,
            "is_trial_active": is_trial_active,
        }

    if is_trial_active:
        return get_models()

    from ...cache import get_cached_models

    return get_cached_models(get_models)


@router.get("/anonymous-mock-mode-status")
async def get_anonymous_mock_mode_status(db: Session = Depends(get_db)):
    """Public endpoint to check if anonymous mock mode is enabled."""
    is_development = os.environ.get("ENVIRONMENT") == "development"

    if not is_development:
        return {"anonymous_mock_mode_enabled": False, "is_development": False}

    from ...cache import get_cached_app_settings, invalidate_app_settings_cache

    def get_settings():
        return db.query(AppSettings).first()

    app_settings = get_cached_app_settings(get_settings)

    if not app_settings:
        app_settings = AppSettings(anonymous_mock_mode_enabled=False)
        db.add(app_settings)
        db.commit()
        db.refresh(app_settings)
        invalidate_app_settings_cache()

    return {
        "anonymous_mock_mode_enabled": app_settings.anonymous_mock_mode_enabled,
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
    """Get current rate limit status for the client."""
    from ...rate_limiting import get_anonymous_usage_stats, get_user_usage_stats

    if current_user:
        db.refresh(current_user)
        usage_stats = get_user_usage_stats(current_user)
        return {
            **usage_stats,
            "authenticated": True,
            "email": current_user.email,
            "subscription_status": current_user.subscription_status,
        }

    client_ip = get_client_ip(request)
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

    if fingerprint:
        fp_stats = get_anonymous_usage_stats(f"fp:{fingerprint}", user_timezone)
        result["fingerprint_usage"] = fp_stats["daily_usage"]
        result["fingerprint_remaining"] = fp_stats["remaining_usage"]

    return result


@router.post("/estimate-tokens", response_model=EstimateTokensResponse)
async def estimate_tokens(
    req: EstimateTokensRequest,
    current_user: User | None = Depends(get_current_user),
) -> EstimateTokensResponse:
    """Estimate token count for input text and optional conversation history."""
    from ...model_runner import count_conversation_tokens

    input_tokens = estimate_token_count(req.input_data, model_id=req.model_id)
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
    """Compare AI models using Server-Sent Events (SSE) streaming."""
    from decimal import Decimal

    from ...config.constants import DAILY_CREDIT_LIMITS

    if not req.input_data.strip():
        raise HTTPException(status_code=400, detail="Input data cannot be empty")

    if not req.models:
        raise HTTPException(status_code=400, detail="At least one model must be selected")

    min_max_input_tokens = get_min_max_input_tokens(req.models)

    if req.estimated_input_tokens is not None and req.estimated_input_tokens >= 0:
        input_tokens = req.estimated_input_tokens
    else:
        model_id = req.models[0] if req.models else None
        input_tokens = estimate_token_count(req.input_data, model_id=model_id)

    if input_tokens > min_max_input_tokens:
        problem_models = []
        for model_id in req.models:
            model_max_input = get_model_max_input_tokens(model_id)
            if model_max_input < input_tokens:
                model_name = None
                for provider_models in MODELS_BY_PROVIDER.values():
                    for model in provider_models:
                        if model.get("id") == model_id:
                            model_name = model.get("name", model_id)
                            break
                    if model_name:
                        break
                if not model_name:
                    model_name = model_id.split("/")[-1].replace("-", " ").replace("_", " ").title()
                problem_models.append(model_name)

        approx_chars = input_tokens * 4
        max_chars = min_max_input_tokens * 4
        problem_models_text = ""
        if problem_models:
            problem_models_text = f" Problem model(s): {', '.join(problem_models)}."

        raise HTTPException(
            status_code=400,
            detail=f"Your input is too long for one or more of the selected models. "
            f"The maximum input length is approximately {max_chars:,} characters, "
            f"but your input is approximately {approx_chars:,} characters."
            f"{problem_models_text} Please shorten your input or select different models.",
        )

    token_present = False
    tier_model_limit = ANONYMOUS_MODEL_LIMIT
    tier_name = "unregistered"

    if current_user:
        subscription_tier = current_user.subscription_tier
        if not subscription_tier or subscription_tier not in [
            "free",
            "starter",
            "starter_plus",
            "pro",
            "pro_plus",
        ]:
            if settings.environment == "development":
                logger.warning(
                    f"User {current_user.id} has unexpected subscription_tier: "
                    f"{subscription_tier}. Defaulting to 'free'."
                )
            subscription_tier = "free"
        tier_model_limit = get_model_limit(subscription_tier)
        tier_name = subscription_tier
    else:
        token_present = get_token_from_cookies(request) is not None

        if token_present:
            from ...auth import verify_token

            try:
                token = get_token_from_cookies(request)
                if token:
                    try:
                        payload = verify_token(token, token_type="access")
                        if payload:
                            user_id_from_token = payload.get("sub")
                            if user_id_from_token:
                                try:
                                    user_id_int = int(user_id_from_token)
                                    user_from_token = (
                                        db.query(User).filter(User.id == user_id_int).first()
                                    )
                                    if user_from_token:
                                        db.refresh(user_from_token)
                                        if user_from_token.is_active:
                                            subscription_tier = user_from_token.subscription_tier
                                            valid_tiers = [
                                                "free",
                                                "starter",
                                                "starter_plus",
                                                "pro",
                                                "pro_plus",
                                            ]
                                            if (
                                                subscription_tier
                                                and subscription_tier in valid_tiers
                                            ):
                                                tier_model_limit = get_model_limit(
                                                    subscription_tier
                                                )
                                                tier_name = subscription_tier
                                                tier_recovered_from_token = True
                                    else:
                                        tier_model_limit = ANONYMOUS_MODEL_LIMIT
                                        tier_name = "unregistered"
                                except (ValueError, TypeError):
                                    pass
                        else:
                            tier_model_limit = ANONYMOUS_MODEL_LIMIT
                            tier_name = "unregistered"
                    except Exception as e:
                        logger.error(f"Auth recovery error: {e}")
                        tier_model_limit = ANONYMOUS_MODEL_LIMIT
                        tier_name = "unregistered"
                else:
                    tier_model_limit = ANONYMOUS_MODEL_LIMIT
                    tier_name = "unregistered"
            except Exception as e:
                logger.error(f"Token recovery error: {e}")
                tier_model_limit = ANONYMOUS_MODEL_LIMIT
                tier_name = "unregistered"
        else:
            tier_model_limit = ANONYMOUS_MODEL_LIMIT
            tier_name = "unregistered"

    normalized_tier_name = "unregistered" if tier_name == "anonymous" else tier_name
    is_trial_active = current_user.is_trial_active if current_user else False

    restricted_models = [
        model_id
        for model_id in req.models
        if not is_model_available_for_tier(model_id, normalized_tier_name, is_trial_active)
    ]
    if restricted_models:
        upgrade_message = ""
        if normalized_tier_name == "unregistered":
            if token_present:
                upgrade_message = " It appears you are signed in, but authentication failed. Please try refreshing the page."
            else:
                upgrade_message = " Sign up for a free account to access more models!"
        elif normalized_tier_name == "free":
            upgrade_message = " Paid subscriptions are coming soon!"
        else:
            upgrade_message = " Paid subscriptions are coming soon!"

        raise HTTPException(
            status_code=403,
            detail=f"The following models are not available for {normalized_tier_name} tier: "
            f"{', '.join(restricted_models)}.{upgrade_message}",
        )

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
            detail=f"Your {normalized_tier_name} tier allows maximum {tier_model_limit} models per comparison. "
            f"You selected {len(req.models)} models.{upgrade_message}",
        )

    num_models = len(req.models)
    client_ip = get_client_ip(request)
    user_timezone = get_timezone_from_request(req.timezone, current_user, db)

    if current_user and req.timezone:
        if not current_user.preferences:
            from ...models import UserPreference

            current_user.preferences = UserPreference(
                user_id=current_user.id, timezone=user_timezone
            )
            db.commit()
        elif current_user.preferences.timezone != user_timezone:
            current_user.preferences.timezone = user_timezone
            db.commit()

    user_location = None
    location_source = None

    if req.location and req.location.strip():
        user_location = req.location.strip()
        location_source = "user_provided"
    else:
        ip_location = await get_location_from_ip(client_ip)
        if ip_location:
            user_location = ip_location
            location_source = "ip_based"

    credits_remaining = 0
    credits_allocated = 0

    if current_user:
        check_and_reset_credits_if_needed(current_user.id, db)
        ensure_credits_allocated(current_user.id, db)
        db.refresh(current_user)
        credits_remaining = get_user_credits(current_user.id, db)
        credits_allocated = current_user.monthly_credits_allocated or 0

        if credits_remaining == 0:
            tier_name = current_user.subscription_tier or "free"
            if tier_name in ["unregistered", "free"]:
                error_msg = (
                    f"You've run out of credits. Credits will reset to "
                    f"{DAILY_CREDIT_LIMITS.get(tier_name, 50)} tomorrow, "
                    f"or sign-up for a free account to get more credits!"
                )
            elif tier_name == "pro_plus":
                reset_date = (
                    current_user.credits_reset_at.date().isoformat()
                    if current_user.credits_reset_at
                    else "N/A"
                )
                error_msg = f"You've run out of credits which will reset on {reset_date}."
            else:
                reset_date = (
                    current_user.credits_reset_at.date().isoformat()
                    if current_user.credits_reset_at
                    else "N/A"
                )
                error_msg = f"You've run out of credits which will reset on {reset_date}."
            raise HTTPException(status_code=402, detail=error_msg)
    else:
        ip_identifier = f"ip:{client_ip}"
        _, ip_credits_remaining, ip_credits_allocated = check_anonymous_credits(
            ip_identifier, Decimal(0), user_timezone, db
        )
        fingerprint_credits_remaining = ip_credits_remaining
        if req.browser_fingerprint:
            fp_identifier = f"fp:{req.browser_fingerprint}"
            _, fingerprint_credits_remaining, fingerprint_credits_allocated = (
                check_anonymous_credits(fp_identifier, Decimal(0), user_timezone, db)
            )
        credits_remaining = min(
            ip_credits_remaining,
            fingerprint_credits_remaining if req.browser_fingerprint else ip_credits_remaining,
        )
        credits_allocated = ip_credits_allocated

        if credits_remaining == 0:
            raise HTTPException(
                status_code=402,
                detail="You've run out of credits. Credits will reset to 50 tomorrow, "
                "or sign-up for a free account to get more credits!",
            )

    credits_remaining_ref = [credits_remaining]
    start_time = datetime.now()
    user_id = current_user.id if current_user else None
    has_authenticated_user = current_user is not None

    from ...services.comparison_stream import StreamContext, generate_stream

    ctx = StreamContext(
        req=req,
        db=db,
        client_ip=client_ip,
        user_timezone=user_timezone,
        user_location=user_location,
        location_source=location_source,
        num_models=num_models,
        start_time=start_time,
        user_id=user_id,
        has_authenticated_user=has_authenticated_user,
        credits_remaining_ref=credits_remaining_ref,
        model_stats=model_stats,
    )

    return StreamingResponse(
        generate_stream(ctx),
        media_type="text/event-stream",
    )
