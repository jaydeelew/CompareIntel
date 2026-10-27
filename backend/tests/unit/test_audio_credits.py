"""Unit tests for STT/TTS credit helpers and pending-credit accumulation."""

from decimal import Decimal
from unittest.mock import patch

import pytest

pytestmark = pytest.mark.unit

from app.llm.audio import estimate_stt_usd, estimate_tts_usd
from app.llm.audio_credits import fractional_credits_for_audio_usd
from app.llm.tokens import usd_to_fractional_credits
from app.services.voice_billing import (
    add_pending_audio_credits,
    audio_billing_key,
    finalize_pending_audio_credits,
    peek_pending_audio_credits,
    reset_pending_audio_credits,
    take_whole_pending_credits,
)


@pytest.fixture(autouse=True)
def _clear_pending() -> None:
    reset_pending_audio_credits()
    yield
    reset_pending_audio_credits()


class TestEstimateAudioUsd:
    def test_stt_uses_duration(self) -> None:
        usd = estimate_stt_usd(60.0, 1)
        assert usd == Decimal("0.006")

    def test_stt_falls_back_to_byte_size(self) -> None:
        usd = estimate_stt_usd(None, 120000)
        assert usd > 0

    def test_tts_scales_with_characters(self) -> None:
        short = estimate_tts_usd("Hi")
        long = estimate_tts_usd("H" * 1000)
        assert long > short


class TestFractionalAudioCredits:
    def test_zero(self) -> None:
        assert fractional_credits_for_audio_usd(Decimal(0)) == Decimal(0)

    def test_matches_text_usd_helper(self) -> None:
        usd = Decimal("0.02")
        assert fractional_credits_for_audio_usd(usd) == usd_to_fractional_credits(usd)


class TestVoiceBillingAccumulator:
    def test_key_prefers_user(self) -> None:
        assert audio_billing_key(9, "1.1.1.1", "fp") == "user:9"
        assert audio_billing_key(None, "1.1.1.1", "abc") == "fp:abc"
        assert audio_billing_key(None, "1.1.1.1", None) == "ip:1.1.1.1"

    def test_take_whole_leaves_fraction(self) -> None:
        key = "user:1"
        add_pending_audio_credits(key, Decimal("1.4"))
        assert take_whole_pending_credits(key) == Decimal(1)
        assert peek_pending_audio_credits(key) == Decimal("0.4")

    def test_finalize_ceils_remainder(self) -> None:
        key = "user:2"
        add_pending_audio_credits(key, Decimal("0.2"))
        billed = finalize_pending_audio_credits(key)
        assert billed == Decimal(1)
        assert peek_pending_audio_credits(key) == Decimal(0)

    def test_sentence_tts_does_not_bill_per_sentence(self) -> None:
        key = "user:3"
        with patch("app.llm.registry.get_model_text_prices_per_token", return_value=None):
            for _ in range(5):
                add_pending_audio_credits(key, Decimal("0.05"))
        assert take_whole_pending_credits(key) == Decimal(0)
        assert peek_pending_audio_credits(key) == Decimal("0.25")
