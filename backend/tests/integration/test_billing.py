"""
Integration tests for billing overage endpoints, Stripe configuration guards,
and anonymous/authenticated credit balance routes.
"""

from __future__ import annotations

import pytest
from fastapi import status

pytestmark = pytest.mark.integration


class TestBillingOverage:
    def test_get_overage_settings_requires_auth(self, client):
        response = client.get("/api/billing/overage-settings")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_get_overage_settings_authenticated(self, authenticated_client_starter):
        client, *_rest = authenticated_client_starter
        response = client.get("/api/billing/overage-settings")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "overage_enabled" in data
        assert "overage_usd_per_credit" in data

    def test_update_overage_forbidden_for_free_tier(self, authenticated_client):
        client, *_rest = authenticated_client
        response = client.put(
            "/api/billing/overage-settings",
            json={"overage_enabled": True},
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_update_overage_toggle_for_paid_user(self, authenticated_client_starter):
        client, *_rest = authenticated_client_starter
        clear = client.put(
            "/api/billing/overage-settings",
            json={"overage_enabled": False},
        )
        assert clear.status_code == status.HTTP_200_OK
        enabled = client.put(
            "/api/billing/overage-settings",
            json={
                "overage_enabled": True,
                "overage_limit_mode": "capped",
                "overage_spend_limit_dollars": 25.5,
            },
        )
        assert enabled.status_code == status.HTTP_200_OK
        data = enabled.json()
        assert data["overage_enabled"] is True


class TestStripeSessionGuards:
    @pytest.fixture(autouse=True)
    def _stripe_not_configured(self, monkeypatch):
        from app.config.settings import settings

        monkeypatch.setattr(settings, "stripe_secret_key", None, raising=False)

    def test_create_checkout_requires_stripe_config(self, authenticated_client_starter):
        client, *_rest = authenticated_client_starter
        response = client.post(
            "/api/billing/create-checkout-session",
            json={"tier": "starter"},
        )
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
        detail = response.json().get("detail", "")
        assert isinstance(detail, str)
        assert "Stripe" in detail or "stripe" in detail.lower()

    def test_create_portal_requires_stripe_config(self, authenticated_client_starter):
        client, *_rest = authenticated_client_starter
        response = client.post("/api/billing/create-portal-session", json={})
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


class TestCreditRoutes:
    def test_credit_balance_anonymous(self, client):
        response = client.get("/api/credits/balance?timezone=UTC")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data.get("subscription_tier") == "unregistered"
        assert "credits_remaining" in data

    def test_credit_balance_authenticated(self, authenticated_client):
        client_instance, *_rest = authenticated_client
        response = client_instance.get("/api/credits/balance")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data.get("period_type") in ("daily", "monthly")

    def test_credit_usage_requires_auth(self, client):
        response = client.get("/api/credits/usage")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
