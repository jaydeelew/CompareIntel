"""Unit tests for OpenRouter model availability checks."""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import MagicMock

from app.llm.model_availability import (
    _endpoints_all_zero_uptime,
    _model_expired,
    assess_registry_model_availability,
    check_model_availability,
    is_model_listed_in_openrouter,
)


def test_is_model_listed_matches_id_and_canonical_slug() -> None:
    live = {
        "anthropic/claude-3.5-haiku": {
            "id": "anthropic/claude-3.5-haiku",
            "canonical_slug": "anthropic/claude-3-5-haiku",
        }
    }
    assert is_model_listed_in_openrouter("anthropic/claude-3.5-haiku", live)
    assert is_model_listed_in_openrouter("anthropic/claude-3-5-haiku", live)
    assert not is_model_listed_in_openrouter("missing/model", live)


def test_model_expired_when_expiration_in_past() -> None:
    past = int(datetime(2020, 1, 1, tzinfo=UTC).timestamp())
    assert _model_expired({"expiration_date": past}, now=datetime(2026, 1, 1, tzinfo=UTC))


def test_endpoints_all_zero_uptime() -> None:
    assert _endpoints_all_zero_uptime([{"uptime_last_1d": 0}, {"uptime_last_1d": 0}])
    assert not _endpoints_all_zero_uptime([{"uptime_last_1d": 0}, {"uptime_last_1d": 99.9}])
    assert not _endpoints_all_zero_uptime([{"uptime_last_1d": None}])


def test_assess_flags_zero_uptime_endpoints() -> None:
    live = {
        "anthropic/claude-3.5-haiku": {
            "id": "anthropic/claude-3.5-haiku",
            "canonical_slug": "anthropic/claude-3-5-haiku",
            "expiration_date": None,
        }
    }
    http_client = MagicMock()
    http_client.get.return_value.status_code = 200
    http_client.get.return_value.json.return_value = {
        "data": {
            "endpoints": [
                {"uptime_last_1d": 0},
                {"uptime_last_1d": 0},
            ]
        }
    }

    result = assess_registry_model_availability(
        {
            "id": "anthropic/claude-3.5-haiku",
            "name": "Claude Haiku 3.5",
            "provider": "Anthropic",
        },
        live,
        http_client=http_client,
    )

    assert result is not None
    assert result["reason"].startswith("Listed on OpenRouter but all provider endpoints")


def test_check_model_availability_reports_catalog_only_miss() -> None:
    live = {"openai/gpt-4o": {"id": "openai/gpt-4o", "canonical_slug": "openai/gpt-4o"}}
    results = check_model_availability(
        [
            {
                "id": "anthropic/claude-3.5-haiku",
                "name": "Claude Haiku 3.5",
                "provider": "Anthropic",
            }
        ],
        live,
        check_endpoints=False,
    )

    assert len(results["unavailable_models"]) == 1
    assert results["unavailable_models"][0]["reason"] == "Not found in OpenRouter's model list"
