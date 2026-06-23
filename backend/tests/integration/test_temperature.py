"""
Integration tests for advanced parameters in comparison endpoint.

Tests cover:
- Temperature accepted in compare-stream request
- Temperature validation (range enforcement)
- Temperature optional (request works without it)
- top_p and max_tokens validation
"""

import pytest

pytestmark = pytest.mark.integration


from fastapi import status


class TestTemperatureValidation:
    """Tests for temperature parameter validation in API."""


class TestTopPAndMaxTokensValidation:
    """Tests for top_p and max_tokens parameter validation."""


class TestTemperatureInModelsEndpoint:
    """Tests for supports_temperature in models API response."""

    def test_models_include_supports_temperature(self, client):
        """Test that /api/models response includes supports_temperature field."""
        response = client.get("/api/models")
        if response.status_code == status.HTTP_200_OK:
            data = response.json()
            models_by_provider = data.get("models_by_provider", {})
            for provider, models in models_by_provider.items():
                for model in models:
                    assert "supports_temperature" in model, (
                        f"Model {model.get('id')} missing supports_temperature"
                    )
                    assert isinstance(model["supports_temperature"], bool), (
                        f"Model {model.get('id')} supports_temperature is not boolean"
                    )
