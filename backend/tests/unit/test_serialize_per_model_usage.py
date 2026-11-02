"""Unit tests for serialize_per_model_usage (Verdict panel cost fields)."""

from decimal import Decimal

import pytest

pytestmark = pytest.mark.unit

from app.llm.tokens import TokenUsage, serialize_per_model_usage


def test_serialize_includes_reported_cost() -> None:
    usage = TokenUsage(10, 20, 30, 60, Decimal("0.1"), Decimal("0.0025"))
    out = serialize_per_model_usage({"openai/gpt-4o": usage})
    assert out == {
        "openai/gpt-4o": {
            "prompt_tokens": 10,
            "completion_tokens": 20,
            "cost_usd": 0.0025,
        }
    }


def test_serialize_null_cost_when_provider_omits_it() -> None:
    usage = TokenUsage(5, 8, 13, 25, Decimal("0.01"), None)
    out = serialize_per_model_usage({"mistralai/mistral-small": usage})
    assert out["mistralai/mistral-small"]["cost_usd"] is None
    assert out["mistralai/mistral-small"]["prompt_tokens"] == 5


def test_serialize_skips_image_usage_dicts() -> None:
    out = serialize_per_model_usage({"openai/gpt-5-image": {"image_count": 1, "model_id": "x"}})
    assert out == {}


def test_serialize_skips_missing_usage() -> None:
    assert serialize_per_model_usage({"openai/gpt-4o": None}) == {}
