"""Accumulate STT/TTS fractional credits and deduct whole credits.

Sentence-by-sentence TTS would otherwise ceil to 1 credit per sentence. Pending
fractional credits are stored per user (or anonymous identifier) and flushed as
whole credits whenever the pot reaches 1, or when the client finalizes a turn.
"""

from __future__ import annotations

from decimal import Decimal

from ..llm.tokens import finalize_billed_credits

_pending_audio_credits: dict[str, Decimal] = {}


def audio_billing_key(user_id: int | None, client_ip: str, browser_fingerprint: str | None) -> str:
    if user_id is not None:
        return f"user:{user_id}"
    if browser_fingerprint:
        return f"fp:{browser_fingerprint}"
    return f"ip:{client_ip}"


def add_pending_audio_credits(key: str, fractional: Decimal) -> Decimal:
    if fractional <= 0:
        return _pending_audio_credits.get(key, Decimal(0))
    current = _pending_audio_credits.get(key, Decimal(0)) + fractional
    _pending_audio_credits[key] = current
    return current


def take_whole_pending_credits(key: str) -> Decimal:
    pending = _pending_audio_credits.get(key, Decimal(0))
    whole = Decimal(int(pending))
    if whole <= 0:
        return Decimal(0)
    _pending_audio_credits[key] = pending - whole
    return whole


def finalize_pending_audio_credits(key: str) -> Decimal:
    pending = _pending_audio_credits.pop(key, Decimal(0))
    return finalize_billed_credits(pending)


def peek_pending_audio_credits(key: str) -> Decimal:
    return _pending_audio_credits.get(key, Decimal(0))


def reset_pending_audio_credits() -> None:
    """Test helper."""
    _pending_audio_credits.clear()
