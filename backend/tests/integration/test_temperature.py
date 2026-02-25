"""
Integration tests for temperature parameter in comparison endpoint.

Tests cover:
- Temperature accepted in compare-stream request
- Temperature validation (range enforcement)
- Temperature optional (request works without it)
"""

from fastapi import status


class TestTemperatureValidation:
    """Tests for temperature parameter validation in API."""

    def test_streaming_with_valid_temperature(self, authenticated_client):
        """Test streaming endpoint accepts valid temperature."""
        client, user, token, _ = authenticated_client

        response = client.post(
            "/api/compare-stream",
            json={
                "input_data": "Test prompt",
                "models": ["anthropic/claude-3.5-haiku"],
                "temperature": 0.7,
            },
        )
        assert response.status_code in [
            status.HTTP_200_OK,
            status.HTTP_429_TOO_MANY_REQUESTS,
        ]

    def test_streaming_with_temperature_zero(self, authenticated_client):
        """Test streaming endpoint accepts temperature=0.0."""
        client, user, token, _ = authenticated_client

        response = client.post(
            "/api/compare-stream",
            json={
                "input_data": "Test prompt",
                "models": ["anthropic/claude-3.5-haiku"],
                "temperature": 0.0,
            },
        )
        assert response.status_code in [
            status.HTTP_200_OK,
            status.HTTP_429_TOO_MANY_REQUESTS,
        ]

    def test_streaming_with_temperature_max(self, authenticated_client):
        """Test streaming endpoint accepts temperature=2.0."""
        client, user, token, _ = authenticated_client

        response = client.post(
            "/api/compare-stream",
            json={
                "input_data": "Test prompt",
                "models": ["anthropic/claude-3.5-haiku"],
                "temperature": 2.0,
            },
        )
        assert response.status_code in [
            status.HTTP_200_OK,
            status.HTTP_429_TOO_MANY_REQUESTS,
        ]

    def test_streaming_rejects_temperature_too_high(self, authenticated_client):
        """Test streaming endpoint rejects temperature > 2.0."""
        client, user, token, _ = authenticated_client

        response = client.post(
            "/api/compare-stream",
            json={
                "input_data": "Test prompt",
                "models": ["anthropic/claude-3.5-haiku"],
                "temperature": 2.5,
            },
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "Temperature" in response.json()["detail"]

    def test_streaming_rejects_temperature_negative(self, authenticated_client):
        """Test streaming endpoint rejects temperature < 0.0."""
        client, user, token, _ = authenticated_client

        response = client.post(
            "/api/compare-stream",
            json={
                "input_data": "Test prompt",
                "models": ["anthropic/claude-3.5-haiku"],
                "temperature": -0.5,
            },
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "Temperature" in response.json()["detail"]

    def test_streaming_without_temperature(self, authenticated_client):
        """Test streaming endpoint works without temperature (optional)."""
        client, user, token, _ = authenticated_client

        response = client.post(
            "/api/compare-stream",
            json={
                "input_data": "Test prompt",
                "models": ["anthropic/claude-3.5-haiku"],
            },
        )
        assert response.status_code in [
            status.HTTP_200_OK,
            status.HTTP_429_TOO_MANY_REQUESTS,
        ]


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
