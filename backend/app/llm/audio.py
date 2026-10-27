"""OpenRouter speech-to-text and text-to-speech helpers."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

import httpx

from ..config.constants import VOICE_STT_USD_PER_MINUTE, VOICE_TTS_USD_PER_MILLION_CHARS
from ..config.settings import settings
from .tokens import extract_usage_cost_usd

logger = logging.getLogger(__name__)

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

# Tiny silent-ish MP3 frame used for mock mode and unit tests (not a real recording).
MINIMAL_MP3 = (
    b"\xff\xf3\x48\xc4\x00\x00\x00\x03\x48\x00\x00\x00\x00\x4c\x41\x4d\x45"
    b"\x33\x2e\x39\x36\x2e\x31\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00"
    b"\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00"
)

MOCK_TRANSCRIPT = "Hello, this is a voice comparison."


@dataclass
class TranscriptionResult:
    text: str
    cost_usd: Decimal
    duration_seconds: float | None = None


@dataclass
class SpeechResult:
    audio: bytes
    content_type: str
    cost_usd: Decimal


def _openrouter_headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {settings.openrouter_api_key}",
        "HTTP-Referer": "https://compareintel.com",
        "X-Title": "CompareIntel",
    }


def _cost_from_headers(headers: Any) -> Decimal | None:
    if headers is None:
        return None
    for key in (
        "x-openrouter-cost",
        "x-openrouter-usage-cost",
        "x-generation-cost",
    ):
        raw = None
        try:
            raw = headers.get(key)
        except Exception:
            raw = None
        if raw is None:
            continue
        try:
            val = Decimal(str(raw))
            if val >= 0:
                return val
        except Exception:
            logger.debug("Ignoring unparsable OpenRouter cost header %s", key)
            continue
    return None


def _cost_from_json(payload: dict[str, Any]) -> Decimal | None:
    usage = payload.get("usage")
    cost = extract_usage_cost_usd(usage)
    if cost is not None:
        return cost
    raw = payload.get("cost")
    if raw is None:
        return None
    try:
        val = Decimal(str(raw))
        return val if val >= 0 else None
    except Exception:
        return None


def estimate_stt_usd(duration_seconds: float | None, audio_bytes: int) -> Decimal:
    """Fallback STT USD when OpenRouter omits usage.cost."""
    if duration_seconds is not None and duration_seconds > 0:
        minutes = Decimal(str(duration_seconds)) / Decimal(60)
    else:
        # ~16 kbps webm/opus → bytes / 2000 ≈ seconds
        seconds = max(Decimal("1"), Decimal(audio_bytes) / Decimal(2000))
        minutes = seconds / Decimal(60)
    return Decimal(str(VOICE_STT_USD_PER_MINUTE)) * minutes


def estimate_tts_usd(text: str) -> Decimal:
    """Fallback TTS USD from character count when OpenRouter omits cost."""
    chars = Decimal(max(len(text), 1))
    return Decimal(str(VOICE_TTS_USD_PER_MILLION_CHARS)) * chars / Decimal("1000000")


def _audio_format_from_filename(filename: str | None, content_type: str | None) -> str:
    name = (filename or "").lower()
    ctype = (content_type or "").lower()
    if name.endswith(".wav") or "wav" in ctype:
        return "wav"
    if name.endswith(".mp3") or "mpeg" in ctype or "mp3" in ctype:
        return "mp3"
    if name.endswith(".flac") or "flac" in ctype:
        return "flac"
    if name.endswith(".ogg") or "ogg" in ctype:
        return "ogg"
    if name.endswith(".mp4") or name.endswith(".m4a") or "mp4" in ctype:
        return "mp4"
    return "webm"


def transcribe_audio(
    audio_bytes: bytes,
    *,
    filename: str | None = None,
    content_type: str | None = None,
    model: str | None = None,
    duration_seconds: float | None = None,
    use_mock: bool = False,
) -> TranscriptionResult:
    """Send a whole recording to OpenRouter /audio/transcriptions."""
    if use_mock:
        return TranscriptionResult(
            text=MOCK_TRANSCRIPT,
            cost_usd=Decimal("0"),
            duration_seconds=duration_seconds,
        )
    if not audio_bytes:
        raise ValueError("Audio recording is empty")

    stt_model = model or settings.default_stt_model
    audio_format = _audio_format_from_filename(filename, content_type)
    upload_name = filename or f"recording.{audio_format}"
    upload_type = content_type or f"audio/{audio_format}"

    try:
        with httpx.Client(timeout=60.0) as client:
            response = client.post(
                f"{OPENROUTER_BASE_URL}/audio/transcriptions",
                headers=_openrouter_headers(),
                data={"model": stt_model},
                files={"file": (upload_name, audio_bytes, upload_type)},
            )
            response.raise_for_status()
            data = response.json()
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text[:300] if exc.response is not None else str(exc)
        logger.error("OpenRouter STT failed: %s %s", exc.response.status_code, detail)
        raise RuntimeError(f"Speech-to-text failed ({exc.response.status_code})") from exc
    except Exception as exc:
        logger.error("OpenRouter STT error: %s", exc)
        raise RuntimeError("Speech-to-text failed") from exc

    text = ""
    if isinstance(data, dict):
        text = str(data.get("text") or data.get("transcript") or "")
    if not text.strip():
        raise RuntimeError("Speech-to-text returned an empty transcript")

    cost = None
    if isinstance(data, dict):
        cost = _cost_from_json(data)
    if cost is None:
        cost = estimate_stt_usd(duration_seconds, len(audio_bytes))

    return TranscriptionResult(text=text.strip(), cost_usd=cost, duration_seconds=duration_seconds)


def synthesize_speech(
    text: str,
    *,
    voice: str,
    model: str | None = None,
    use_mock: bool = False,
) -> SpeechResult:
    """Synthesize one sentence via OpenRouter /audio/speech."""
    cleaned = text.strip()
    if not cleaned:
        raise ValueError("Speech text is empty")

    if use_mock:
        return SpeechResult(
            audio=MINIMAL_MP3,
            content_type="audio/mpeg",
            cost_usd=Decimal("0"),
        )

    tts_model = model or settings.default_tts_model
    payload = {
        "model": tts_model,
        "input": cleaned,
        "voice": voice,
        "response_format": "mp3",
    }

    try:
        with httpx.Client(timeout=60.0) as client:
            response = client.post(
                f"{OPENROUTER_BASE_URL}/audio/speech",
                headers={**_openrouter_headers(), "Content-Type": "application/json"},
                json=payload,
            )
            response.raise_for_status()
            audio = response.content
            header_cost = _cost_from_headers(response.headers)
            content_type = response.headers.get("content-type") or "audio/mpeg"
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text[:300] if exc.response is not None else str(exc)
        logger.error("OpenRouter TTS failed: %s %s", exc.response.status_code, detail)
        raise RuntimeError(f"Text-to-speech failed ({exc.response.status_code})") from exc
    except Exception as exc:
        logger.error("OpenRouter TTS error: %s", exc)
        raise RuntimeError("Text-to-speech failed") from exc

    if not audio:
        raise RuntimeError("Text-to-speech returned empty audio")

    cost = header_cost if header_cost is not None else estimate_tts_usd(cleaned)
    return SpeechResult(audio=audio, content_type=content_type, cost_usd=cost)
