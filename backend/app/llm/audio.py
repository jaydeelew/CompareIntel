"""OpenRouter speech-to-text and text-to-speech helpers."""

from __future__ import annotations

import base64
import logging
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

import httpx

from ..config.constants import (
    VOICE_EMPTY_TRANSCRIPT_MESSAGE,
    VOICE_STT_USD_PER_MINUTE,
    VOICE_TTS_USD_PER_MILLION_CHARS,
)
from ..config.settings import settings
from .tokens import extract_usage_cost_usd
from .voice_speech import sanitize_voice_speech

logger = logging.getLogger(__name__)

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

# Tiny silent-ish MP3 frame used for mock mode and unit tests (not a real recording).
MINIMAL_MP3 = (
    b"\xff\xf3\x48\xc4\x00\x00\x00\x03\x48\x00\x00\x00\x00\x4c\x41\x4d\x45"
    b"\x33\x2e\x39\x36\x2e\x31\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00"
    b"\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00"
)

MOCK_TRANSCRIPT = "Hello, this is a voice comparison."

# OpenRouter STT allow-list (https://openrouter.ai/docs/guides/overview/multimodal/stt).
_EXT_TO_FORMAT = {
    ".wav": "wav",
    ".mp3": "mp3",
    ".mpeg": "mp3",
    ".mpga": "mp3",
    ".flac": "flac",
    ".ogg": "ogg",
    ".oga": "ogg",
    ".opus": "ogg",
    ".webm": "webm",
    ".mp4": "m4a",
    ".m4a": "m4a",
    ".aac": "aac",
}
_MIME_TO_FORMAT = {
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/wave": "wav",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/flac": "flac",
    "audio/ogg": "ogg",
    "audio/opus": "ogg",
    "audio/webm": "webm",
    "video/webm": "webm",
    "audio/mp4": "m4a",
    "audio/m4a": "m4a",
    "audio/x-m4a": "m4a",
    "audio/aac": "aac",
    "video/mp4": "m4a",
}


class EmptyTranscriptError(ValueError):
    """STT HTTP succeeded but no speech text was returned (silence or undecodable audio)."""


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


def audio_format_for_openrouter(filename: str | None, content_type: str | None) -> str:
    """Map a browser recording to OpenRouter's ``input_audio.format`` allow-list.

    Chrome MediaRecorder uses ``audio/webm;codecs=opus``. Matching the MIME with
    ``\"mpeg\" in ctype``-style substrings, or sending ``mp4`` instead of ``m4a``,
    makes Whisper decode the bytes as the wrong container and return empty text.
    """
    name = (filename or "").lower()
    for ext, fmt in _EXT_TO_FORMAT.items():
        if name.endswith(ext):
            return fmt
    mime = (content_type or "").split(";")[0].strip().lower()
    if mime in _MIME_TO_FORMAT:
        return _MIME_TO_FORMAT[mime]
    full = (content_type or "").lower()
    if "webm" in full:
        return "webm"
    if "opus" in full:
        return "webm"
    return "webm"


def extract_transcript_text(payload: Any) -> str:
    """Read speech text from OpenRouter STT JSON (and a few provider wrappers)."""
    if isinstance(payload, str):
        return payload.strip()
    if not isinstance(payload, dict):
        return ""
    for key in ("text", "transcript"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    nested = payload.get("data")
    if isinstance(nested, dict):
        nested_text = extract_transcript_text(nested)
        if nested_text:
            return nested_text
    segments = payload.get("segments")
    if isinstance(segments, list):
        parts: list[str] = []
        for seg in segments:
            if not isinstance(seg, dict):
                continue
            part = seg.get("text") or seg.get("transcript")
            if isinstance(part, str) and part.strip():
                parts.append(part.strip())
        if parts:
            return " ".join(parts)
    choices = payload.get("choices")
    if isinstance(choices, list) and choices:
        first = choices[0]
        if isinstance(first, dict):
            choice_text = extract_transcript_text(first)
            if choice_text:
                return choice_text
            message = first.get("message")
            if isinstance(message, dict):
                nested_choice = extract_transcript_text(message)
                if nested_choice:
                    return nested_choice
                content = message.get("content")
                if isinstance(content, str) and content.strip():
                    return content.strip()
    return ""


def openrouter_stt_error_message(payload: Any) -> str | None:
    if not isinstance(payload, dict):
        return None
    err = payload.get("error")
    if isinstance(err, dict):
        msg = err.get("message") or err.get("msg")
        if isinstance(msg, str) and msg.strip():
            return msg.strip()
        return str(err)[:200] if err else None
    if isinstance(err, str) and err.strip():
        return err.strip()
    return None


def _log_empty_transcript(
    *,
    audio_bytes: int,
    content_type: str | None,
    audio_format: str,
    model: str,
    status_code: int | None,
    payload: Any,
    generation_id: str | None,
) -> None:
    keys: str
    usage_seconds: Any = None
    if isinstance(payload, dict):
        keys = ",".join(sorted(str(k) for k in payload.keys()))
        usage = payload.get("usage")
        if isinstance(usage, dict):
            usage_seconds = usage.get("seconds")
    else:
        keys = type(payload).__name__
    logger.warning(
        "OpenRouter STT empty transcript: audio_bytes=%s mime=%s format=%s model=%s "
        "http_status=%s generation_id=%s response_keys=%s usage_seconds=%s",
        audio_bytes,
        (content_type or "")[:80],
        audio_format,
        model,
        status_code,
        generation_id or "",
        keys,
        usage_seconds,
    )


def transcribe_audio(
    audio_bytes: bytes,
    *,
    filename: str | None = None,
    content_type: str | None = None,
    model: str | None = None,
    duration_seconds: float | None = None,
    use_mock: bool = False,
) -> TranscriptionResult:
    """Send a whole recording to OpenRouter /audio/transcriptions.

    OpenRouter's documented contract is JSON with base64 ``input_audio``
    (https://openrouter.ai/docs/guides/overview/multimodal/stt), not OpenAI's
    multipart ``file`` field. Multipart is a compatibility shim whose format is
    inferred from filename/Content-Type; browser recordings send
    ``audio/webm;codecs=opus``, which that inference often mis-labels, and
    Whisper then returns HTTP 200 with empty ``text``.
    """
    if use_mock:
        return TranscriptionResult(
            text=MOCK_TRANSCRIPT,
            cost_usd=Decimal("0"),
            duration_seconds=duration_seconds,
        )
    if not audio_bytes:
        raise EmptyTranscriptError(VOICE_EMPTY_TRANSCRIPT_MESSAGE)

    stt_model = model or settings.default_stt_model
    audio_format = audio_format_for_openrouter(filename, content_type)
    payload = {
        "model": stt_model,
        "input_audio": {
            "data": base64.b64encode(audio_bytes).decode("ascii"),
            "format": audio_format,
        },
    }

    response: httpx.Response | None = None
    try:
        with httpx.Client(timeout=60.0) as client:
            response = client.post(
                f"{OPENROUTER_BASE_URL}/audio/transcriptions",
                headers={**_openrouter_headers(), "Content-Type": "application/json"},
                json=payload,
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

    error_message = openrouter_stt_error_message(data)
    if error_message:
        logger.error("OpenRouter STT error body: %s", error_message[:300])
        raise RuntimeError(f"Speech-to-text failed: {error_message[:200]}")

    text = extract_transcript_text(data)
    if not text:
        generation_id = None
        status_code = None
        if response is not None:
            status_code = response.status_code
            generation_id = response.headers.get("x-generation-id") or response.headers.get(
                "X-Generation-Id"
            )
        _log_empty_transcript(
            audio_bytes=len(audio_bytes),
            content_type=content_type,
            audio_format=audio_format,
            model=stt_model,
            status_code=status_code,
            payload=data,
            generation_id=generation_id,
        )
        raise EmptyTranscriptError(VOICE_EMPTY_TRANSCRIPT_MESSAGE)

    cost = None
    if isinstance(data, dict):
        cost = _cost_from_json(data)
    if cost is None:
        cost = estimate_stt_usd(duration_seconds, len(audio_bytes))

    return TranscriptionResult(text=text, cost_usd=cost, duration_seconds=duration_seconds)


def synthesize_speech(
    text: str,
    *,
    voice: str,
    model: str | None = None,
    use_mock: bool = False,
) -> SpeechResult:
    """Synthesize one sentence via OpenRouter /audio/speech."""
    cleaned = sanitize_voice_speech(text)
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
