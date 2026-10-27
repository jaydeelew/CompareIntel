"""Voice tab API: config, STT, TTS, and audio-credit finalization."""

from __future__ import annotations

import json
import logging
import os
from decimal import Decimal
from typing import TYPE_CHECKING

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field

from ...config.constants import (
    DAILY_CREDIT_LIMITS,
    VOICE_MAX_MODELS,
    VOICE_NATIVE_MODEL_IDS,
    VOICE_TTS_VOICES,
)
from ...config.settings import settings
from ...credit_manager import check_and_reset_credits_if_needed, ensure_credits_allocated
from ...database import get_db
from ...dependencies import get_current_user
from ...llm.audio import synthesize_speech, transcribe_audio
from ...llm.audio_credits import fractional_credits_for_audio_usd
from ...models import AppSettings, UsageLog, User
from ...rate_limiting import (
    check_anonymous_credits,
    check_user_credits,
    deduct_anonymous_credits,
    deduct_user_credits,
)
from ...services.voice_billing import (
    add_pending_audio_credits,
    audio_billing_key,
    finalize_pending_audio_credits,
    take_whole_pending_credits,
)
from ...utils.geo import get_timezone_from_request
from ...utils.request import get_client_ip

if TYPE_CHECKING:
    from sqlalchemy.orm import Session


def require_voice_enabled() -> None:
    """404 Voice API routes when ENABLE_VOICE is off."""
    if not settings.enable_voice:
        raise HTTPException(status_code=404, detail="Not found")


router = APIRouter(tags=["API - Voice"], dependencies=[Depends(require_voice_enabled)])
logger = logging.getLogger(__name__)

_MAX_AUDIO_BYTES = 25 * 1024 * 1024


class VoiceConfigResponse(BaseModel):
    stt_model: str
    tts_model: str
    max_models: int
    voices: list[str]
    native_voice_model_ids: list[str]

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "stt_model": "openai/whisper-large-v3",
                "tts_model": "openai/gpt-4o-mini-tts-2025-12-15",
                "max_models": 2,
                "voices": ["alloy", "nova"],
                "native_voice_model_ids": ["openai/gpt-audio", "openai/gpt-audio-mini"],
            }
        }
    )


class TranscribeResponse(BaseModel):
    text: str
    credits_used: float
    credits_remaining: int
    cost_usd: float


class SpeechRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=4000)
    voice: str | None = None
    model: str | None = None
    model_id: str | None = None  # conversation model this voice belongs to
    browser_fingerprint: str | None = None
    timezone: str | None = None
    finalize_turn: bool = False

    model_config = ConfigDict(
        json_schema_extra={"example": {"text": "Hello from CompareIntel.", "voice": "alloy"}}
    )


class FinalizeAudioRequest(BaseModel):
    browser_fingerprint: str | None = None
    timezone: str | None = None


def should_use_mock_audio(user: User | None, db: Session) -> bool:
    allow_mock = os.environ.get("ENVIRONMENT") in ("development", "test")
    if user is not None and user.mock_mode_enabled:
        return allow_mock or user.role in ("admin", "super_admin")
    if user is None and allow_mock:
        app_settings = db.query(AppSettings).first()
        return bool(app_settings and app_settings.anonymous_mock_mode_enabled)
    return False


def _insufficient_credits_detail(user: User | None, need: int) -> str:
    if user is None:
        return (
            "Not enough credits for this voice request. Credits reset to "
            f"{DAILY_CREDIT_LIMITS.get('unregistered', 50)} tomorrow, "
            "or sign up for a free account to get more credits!"
        )
    tier = user.subscription_tier or "free"
    if tier in ("unregistered", "free"):
        return (
            f"Not enough credits for this voice request (need at least {need} credits). "
            f"Daily credits reset to {DAILY_CREDIT_LIMITS.get(tier, 50)} tomorrow."
        )
    return f"Not enough credits for this voice request (need at least {need} credits)."


def _admit_audio_request(
    *,
    user: User | None,
    db: Session,
    client_ip: str,
    browser_fingerprint: str | None,
    timezone: str | None,
) -> tuple[int, str]:
    """Require at least 1 spendable credit before calling OpenRouter audio APIs."""
    required = Decimal(1)
    user_timezone = get_timezone_from_request(timezone, user, db)
    if user is not None:
        check_and_reset_credits_if_needed(user.id, db)
        ensure_credits_allocated(user.id, db)
        db.refresh(user)
        is_allowed, remaining, _allocated = check_user_credits(user, required, db)
        if not is_allowed:
            raise HTTPException(status_code=402, detail=_insufficient_credits_detail(user, 1))
        return remaining, user_timezone

    ip_identifier = f"ip:{client_ip}"
    is_allowed_ip, ip_remaining, _ = check_anonymous_credits(
        ip_identifier, required, user_timezone, db
    )
    fp_remaining = ip_remaining
    is_allowed_fp = True
    if browser_fingerprint:
        is_allowed_fp, fp_remaining, _ = check_anonymous_credits(
            f"fp:{browser_fingerprint}", required, user_timezone, db
        )
    if not (is_allowed_ip and is_allowed_fp):
        raise HTTPException(status_code=402, detail=_insufficient_credits_detail(None, 1))
    return min(ip_remaining, fp_remaining), user_timezone


def _charge_audio_credits(
    *,
    user: User | None,
    db: Session,
    client_ip: str,
    browser_fingerprint: str | None,
    timezone: str,
    fractional: Decimal,
    cost_usd: Decimal,
    description: str,
    finalize: bool,
) -> tuple[Decimal, int]:
    key = audio_billing_key(user.id if user else None, client_ip, browser_fingerprint)
    add_pending_audio_credits(key, fractional)
    to_deduct = finalize_pending_audio_credits(key) if finalize else take_whole_pending_credits(key)

    usage_log = UsageLog(
        user_id=user.id if user else None,
        ip_address=client_ip,
        browser_fingerprint=browser_fingerprint,
        models_used=json.dumps([]),
        input_length=0,
        models_requested=0,
        models_successful=1,
        models_failed=0,
        processing_time_ms=0,
        estimated_cost=float(cost_usd) if cost_usd else 0,
        credits_used=to_deduct if to_deduct > 0 else Decimal(0),
        actual_cost=cost_usd if cost_usd > 0 else None,
    )
    db.add(usage_log)
    db.commit()
    db.refresh(usage_log)

    remaining = 0
    if to_deduct > 0:
        if user is not None:
            deduct_user_credits(user, to_deduct, usage_log.id, db, description=description)
            check_and_reset_credits_if_needed(user.id, db)
            db.refresh(user)
            remaining = max(
                0, (user.monthly_credits_allocated or 0) - (user.credits_used_this_period or 0)
            )
        else:
            deduct_anonymous_credits(f"ip:{client_ip}", to_deduct, timezone)
            if browser_fingerprint:
                deduct_anonymous_credits(f"fp:{browser_fingerprint}", to_deduct, timezone)
            _, ip_remaining, _ = check_anonymous_credits(f"ip:{client_ip}", Decimal(0), timezone)
            remaining = ip_remaining
            if browser_fingerprint:
                _, fp_remaining, _ = check_anonymous_credits(
                    f"fp:{browser_fingerprint}", Decimal(0), timezone
                )
                remaining = min(remaining, fp_remaining)
    else:
        if user is not None:
            remaining = max(
                0, (user.monthly_credits_allocated or 0) - (user.credits_used_this_period or 0)
            )
        else:
            _, remaining, _ = check_anonymous_credits(f"ip:{client_ip}", Decimal(0), timezone)

    return to_deduct, remaining


@router.get("/voice/config", response_model=VoiceConfigResponse)
async def get_voice_config() -> VoiceConfigResponse:
    """Configurable default STT/TTS models and the distinct-voice lineup."""
    return VoiceConfigResponse(
        stt_model=settings.default_stt_model,
        tts_model=settings.default_tts_model,
        max_models=VOICE_MAX_MODELS,
        voices=list(VOICE_TTS_VOICES),
        native_voice_model_ids=list(VOICE_NATIVE_MODEL_IDS),
    )


@router.post("/voice/transcribe", response_model=TranscribeResponse)
async def transcribe_voice(
    request: Request,
    file: UploadFile = File(...),
    duration_seconds: float | None = Form(default=None),
    browser_fingerprint: str | None = Form(default=None),
    timezone: str | None = Form(default=None),
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user),
) -> TranscribeResponse:
    """Transcribe a whole user-turn recording via OpenRouter /audio/transcriptions."""
    _remaining, user_timezone = _admit_audio_request(
        user=current_user,
        db=db,
        client_ip=get_client_ip(request),
        browser_fingerprint=browser_fingerprint,
        timezone=timezone,
    )

    audio_bytes = await file.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Audio recording is empty.")
    if len(audio_bytes) > _MAX_AUDIO_BYTES:
        raise HTTPException(status_code=400, detail="Audio recording is too large.")

    use_mock = should_use_mock_audio(current_user, db)
    try:
        result = transcribe_audio(
            audio_bytes,
            filename=file.filename,
            content_type=file.content_type,
            duration_seconds=duration_seconds,
            use_mock=use_mock,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    fractional = fractional_credits_for_audio_usd(result.cost_usd)
    credits_used, remaining = _charge_audio_credits(
        user=current_user,
        db=db,
        client_ip=get_client_ip(request),
        browser_fingerprint=browser_fingerprint,
        timezone=user_timezone,
        fractional=fractional,
        cost_usd=result.cost_usd,
        description="Voice speech-to-text",
        finalize=False,
    )

    return TranscribeResponse(
        text=result.text,
        credits_used=float(credits_used),
        credits_remaining=remaining,
        cost_usd=float(result.cost_usd),
    )


@router.post("/voice/speech")
async def speak_text(
    req: SpeechRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user),
) -> Response:
    """Read one sentence aloud via OpenRouter /audio/speech."""
    _remaining, user_timezone = _admit_audio_request(
        user=current_user,
        db=db,
        client_ip=get_client_ip(request),
        browser_fingerprint=req.browser_fingerprint,
        timezone=req.timezone,
    )

    voice = (req.voice or VOICE_TTS_VOICES[0]).strip()
    if voice not in VOICE_TTS_VOICES:
        # Allow any non-empty provider voice so Curator can expand the lineup.
        if not voice:
            voice = VOICE_TTS_VOICES[0]

    use_mock = should_use_mock_audio(current_user, db)
    try:
        result = synthesize_speech(
            req.text,
            voice=voice,
            model=req.model,
            use_mock=use_mock,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    fractional = fractional_credits_for_audio_usd(result.cost_usd)
    credits_used, remaining = _charge_audio_credits(
        user=current_user,
        db=db,
        client_ip=get_client_ip(request),
        browser_fingerprint=req.browser_fingerprint,
        timezone=user_timezone,
        fractional=fractional,
        cost_usd=result.cost_usd,
        description="Voice text-to-speech",
        finalize=req.finalize_turn,
    )

    headers = {
        "X-Credits-Used": str(float(credits_used)),
        "X-Credits-Remaining": str(remaining),
        "X-Audio-Cost-Usd": str(float(result.cost_usd)),
        "Cache-Control": "no-store",
    }
    return Response(content=result.audio, media_type=result.content_type, headers=headers)


@router.post("/voice/finalize-audio")
async def finalize_audio_credits(
    req: FinalizeAudioRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user),
) -> dict[str, float | int]:
    """Ceil leftover STT/TTS fractional credits after a spoken turn."""
    user_timezone = get_timezone_from_request(req.timezone, current_user, db)
    client_ip = get_client_ip(request)
    credits_used, remaining = _charge_audio_credits(
        user=current_user,
        db=db,
        client_ip=client_ip,
        browser_fingerprint=req.browser_fingerprint,
        timezone=user_timezone,
        fractional=Decimal(0),
        cost_usd=Decimal(0),
        description="Voice audio credit finalization",
        finalize=True,
    )
    return {
        "credits_used": float(credits_used),
        "credits_remaining": remaining,
    }
