"""Unit tests for OpenRouter cost-based credit helpers."""

from decimal import Decimal
from unittest.mock import patch

from app.llm.tokens import (
    calculate_token_usage,
    extract_usage_cost_usd,
    finalize_billed_credits,
    fractional_credits_for_estimated_text,
    fractional_credits_for_text_usage,
    token_usage_from_openrouter_usage,
    usd_logged_for_text_usage,
    usd_to_fractional_credits,
)


class TestExtractUsageCostUsd:
    def test_from_object_attr(self):
        class U:
            cost = 0.0123

        assert extract_usage_cost_usd(U()) == Decimal("0.0123")

    def test_from_dict(self):
        assert extract_usage_cost_usd({"cost": "0.5"}) == Decimal("0.5")

    def test_none(self):
        assert extract_usage_cost_usd(None) is None
        assert extract_usage_cost_usd(object()) is None


class TestTokenUsageFromOpenrouter:
    def test_tokens_only(self):
        class U:
            prompt_tokens = 100
            completion_tokens = 50

        tu = token_usage_from_openrouter_usage(U())
        assert tu is not None
        assert tu.prompt_tokens == 100
        assert tu.completion_tokens == 50
        assert tu.cost_usd is None

    def test_with_cost(self):
        class U:
            prompt_tokens = 10
            completion_tokens = 5
            cost = 0.001

        tu = token_usage_from_openrouter_usage(U())
        assert tu is not None
        assert tu.cost_usd == Decimal("0.001")

    def test_empty_returns_none(self):
        class U:
            prompt_tokens = 0
            completion_tokens = 0

        assert token_usage_from_openrouter_usage(U()) is None


class TestUsdToFractionalCredits:
    def test_basic(self):
        assert usd_to_fractional_credits(Decimal("0.01")) == Decimal("1")


class TestFractionalCreditsForTextUsage:
    def test_prefers_api_cost(self):
        u = calculate_token_usage(100, 100, cost_usd=Decimal("0.02"))
        fc = fractional_credits_for_text_usage(u, "any/model")
        assert fc == usd_to_fractional_credits(Decimal("0.02"))

    def test_legacy_when_no_cost_no_registry(self):
        u = calculate_token_usage(1000, 0)
        with patch("app.llm.registry.get_model_text_prices_per_token", return_value=None):
            fc = fractional_credits_for_text_usage(u, "unknown/fake-model-xyz")
        assert fc == u.credits


class TestUsdLoggedForTextUsage:
    def test_api_cost(self):
        u = calculate_token_usage(1, 1, cost_usd=Decimal("0.03"))
        assert usd_logged_for_text_usage(u, "m") == Decimal("0.03")


class TestFinalizeBilledCredits:
    def test_zero(self):
        assert finalize_billed_credits(Decimal(0)) == Decimal(0)

    def test_below_one(self):
        assert finalize_billed_credits(Decimal("0.2")) == Decimal(1)

    def test_ceil(self):
        assert finalize_billed_credits(Decimal("2.1")) == Decimal(3)


class TestFractionalCreditsForEstimatedText:
    def test_without_registry_falls_back(self):
        with patch("app.llm.registry.get_model_text_prices_per_token", return_value=None):
            fc = fractional_credits_for_estimated_text("x/y", 100, 100)
        assert fc == Decimal("0.35")  # (100 + 100*2.5) / 1000
