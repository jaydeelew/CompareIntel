"""Credit helpers for OpenRouter STT/TTS usage."""

from __future__ import annotations

from decimal import Decimal

from .tokens import usd_to_fractional_credits


def fractional_credits_for_audio_usd(usd: Decimal) -> Decimal:
    """Convert audio USD (STT or TTS) into fractional credits."""
    if usd <= 0:
        return Decimal(0)
    return usd_to_fractional_credits(usd)
