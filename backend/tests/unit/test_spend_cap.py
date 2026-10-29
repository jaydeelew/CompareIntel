"""Unit tests for OpenRouter spend cap enforcement (issue #39)."""

from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

import pytest

pytestmark = pytest.mark.unit

from app.llm.registry import UNREGISTERED_TIER_MODELS
from app.spend_cap import (
    TRY_AGAIN_LATER_MESSAGE,
    check_openrouter_spend_allowed,
    implied_usd_from_credits,
    is_paid_or_exempt,
    record_openrouter_spend,
    reset_spend_state_for_tests,
    usd_to_microdollars,
)


@pytest.fixture(autouse=True)
def _reset_spend(monkeypatch):
    reset_spend_state_for_tests()
    monkeypatch.setattr("app.spend_cap.settings.openrouter_daily_spend_cap_usd", 10.0)
    monkeypatch.setattr("app.spend_cap.settings.openrouter_monthly_spend_cap_usd", 0.0)
    monkeypatch.setattr("app.spend_cap.settings.openrouter_paid_daily_spend_cap_usd", 0.0)
    monkeypatch.setattr("app.spend_cap.settings.openrouter_paid_monthly_spend_cap_usd", 0.0)
    monkeypatch.setattr("app.spend_cap.settings.openrouter_spend_fail_closed", True)
    monkeypatch.setattr("app.spend_cap.settings.openrouter_spend_memory_fallback", True)
    monkeypatch.setattr("app.spend_cap.settings.environment", "development")
    monkeypatch.setattr("app.spend_cap.settings.spend_alert_email", None)
    yield
    reset_spend_state_for_tests()


def _free_user() -> SimpleNamespace:
    return SimpleNamespace(
        id=1,
        subscription_tier="free",
        is_admin=False,
        role="user",
    )


def _paid_user() -> SimpleNamespace:
    return SimpleNamespace(
        id=2,
        subscription_tier="starter",
        is_admin=False,
        role="user",
    )


def _admin_user() -> SimpleNamespace:
    return SimpleNamespace(
        id=3,
        subscription_tier="free",
        is_admin=True,
        role="admin",
    )


def _unregistered_model_id() -> str:
    assert UNREGISTERED_TIER_MODELS
    return next(iter(UNREGISTERED_TIER_MODELS))


class TestSpendHelpers:
    def test_usd_to_microdollars(self):
        assert usd_to_microdollars(Decimal("1.25")) == 1_250_000
        assert usd_to_microdollars(0) == 0
        assert usd_to_microdollars(-1) == 0

    def test_implied_usd_from_credits(self):
        assert implied_usd_from_credits(Decimal("100")) == Decimal("1")

    def test_paid_or_exempt(self):
        assert is_paid_or_exempt(None) is False
        assert is_paid_or_exempt(_free_user()) is False
        assert is_paid_or_exempt(_paid_user()) is True
        assert is_paid_or_exempt(_admin_user()) is True


class TestSpendCapEnforcement:
    def test_disabled_cap_allows_everyone(self, monkeypatch):
        monkeypatch.setattr("app.spend_cap.settings.openrouter_daily_spend_cap_usd", 0.0)
        monkeypatch.setattr("app.spend_cap.settings.openrouter_monthly_spend_cap_usd", 0.0)
        result = check_openrouter_spend_allowed(None)
        assert result.allowed is True

    def test_free_user_blocked_when_daily_cap_reached(self):
        record_openrouter_spend(Decimal("10.00"))
        result = check_openrouter_spend_allowed(_free_user())
        assert result.allowed is False
        assert result.blocked_by == "daily"
        assert "try again later" in result.message.lower()

    def test_anonymous_blocked_when_daily_cap_reached(self):
        record_openrouter_spend(Decimal("10.50"))
        result = check_openrouter_spend_allowed(None)
        assert result.allowed is False
        assert result.blocked_by == "daily"

    def test_paid_user_unaffected_by_free_cap(self):
        record_openrouter_spend(Decimal("12.00"))
        result = check_openrouter_spend_allowed(_paid_user())
        assert result.allowed is True
        assert result.blocked_by is None

    def test_admin_exempt_from_free_cap(self):
        record_openrouter_spend(Decimal("12.00"))
        result = check_openrouter_spend_allowed(_admin_user())
        assert result.allowed is True

    def test_paid_user_blocked_by_separate_paid_cap(self, monkeypatch):
        monkeypatch.setattr("app.spend_cap.settings.openrouter_paid_daily_spend_cap_usd", 15.0)
        record_openrouter_spend(Decimal("15.00"))
        paid = check_openrouter_spend_allowed(_paid_user())
        assert paid.allowed is False
        assert paid.blocked_by == "daily"
        free = check_openrouter_spend_allowed(_free_user())
        assert free.allowed is False

    def test_monthly_cap_blocks_free_users(self, monkeypatch):
        monkeypatch.setattr("app.spend_cap.settings.openrouter_daily_spend_cap_usd", 0.0)
        monkeypatch.setattr("app.spend_cap.settings.openrouter_monthly_spend_cap_usd", 5.0)
        record_openrouter_spend(Decimal("5.00"))
        result = check_openrouter_spend_allowed(None)
        assert result.allowed is False
        assert result.blocked_by == "monthly"

    def test_below_cap_is_allowed(self):
        record_openrouter_spend(Decimal("1.00"))
        result = check_openrouter_spend_allowed(None)
        assert result.allowed is True
        assert result.spent_daily_usd == pytest.approx(1.0)

    def test_fail_closed_when_redis_unavailable_in_production(self, monkeypatch):
        monkeypatch.setattr("app.spend_cap.settings.environment", "production")
        monkeypatch.setattr("app.spend_cap.settings.openrouter_spend_memory_fallback", False)
        monkeypatch.setattr("app.spend_cap.settings.openrouter_spend_fail_closed", True)
        monkeypatch.setattr("app.spend_cap.get_redis_client", lambda: None)

        free = check_openrouter_spend_allowed(None)
        assert free.allowed is False
        assert free.blocked_by == "unavailable"
        assert "try again later" in free.message.lower()

        paid = check_openrouter_spend_allowed(_paid_user())
        assert paid.allowed is True


class TestSpendAlerts:
    def test_alerts_fire_once_at_50_and_80_percent(self):
        with (
            patch("app.spend_cap._send_spend_alerts") as send_alerts,
        ):
            record_openrouter_spend(Decimal("5.00"))
            record_openrouter_spend(Decimal("3.00"))
            record_openrouter_spend(Decimal("1.00"))

            thresholds = sorted(call.args[1] for call in send_alerts.call_args_list)
            assert thresholds == [50, 80]
            assert send_alerts.call_count == 2


class TestCompareStreamSpendCap:
    def test_anonymous_compare_returns_try_again_later(self, client):
        record_openrouter_spend(Decimal("10.00"))

        response = client.post(
            "/api/compare-stream",
            json={
                "input_data": "Hello",
                "models": [_unregistered_model_id()],
            },
        )
        assert response.status_code == 429
        detail = response.json()["detail"]
        assert "try again later" in detail.lower()
        assert response.headers.get("retry-after")
        assert TRY_AGAIN_LATER_MESSAGE in detail

    def test_paid_compare_not_blocked_by_free_cap(self, authenticated_client_starter):
        record_openrouter_spend(Decimal("10.00"))

        client, _user, _access, _refresh = authenticated_client_starter
        with patch(
            "app.services.comparison_stream.call_openrouter_streaming",
            return_value=iter(["mocked"]),
        ):
            response = client.post(
                "/api/compare-stream",
                json={
                    "input_data": "Hello",
                    "models": [_unregistered_model_id()],
                },
            )
        assert response.status_code != 429


class TestMaxOutputTokenCap:
    def test_cap_max_output_tokens_applies_settings(self, monkeypatch):
        from app.llm.tokens import cap_max_output_tokens

        monkeypatch.setattr("app.llm.tokens.settings.openrouter_max_output_tokens", 1024)
        assert cap_max_output_tokens(8192) == 1024
        assert cap_max_output_tokens(256) == 256

    def test_compare_rejects_max_tokens_above_cap(self, client, monkeypatch):
        monkeypatch.setattr("app.config.settings.openrouter_max_output_tokens", 1024)
        response = client.post(
            "/api/compare-stream",
            json={
                "input_data": "Hello",
                "models": [_unregistered_model_id()],
                "max_tokens": 2048,
            },
        )
        assert response.status_code == 400
        assert "1024" in response.json()["detail"]
