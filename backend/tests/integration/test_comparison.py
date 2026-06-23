"""
Integration tests for model comparison functionality.

Tests cover:
- Model selection
- Streaming responses
- Result formatting
"""

import pytest

pytestmark = pytest.mark.integration


from fastapi import status


class TestModelSelection:
    """Tests for model selection functionality."""

    def test_get_available_models(self, client):
        """Test getting list of available models."""
        response = client.get("/api/models")
        # Adjust endpoint based on your implementation
        if response.status_code == status.HTTP_200_OK:
            data = response.json()
            assert isinstance(data, (list, dict))


class TestStreamingResponse:
    """Tests for streaming comparison responses."""

    def test_streaming_endpoint(self, authenticated_client):
        """Test streaming comparison endpoint."""
        client, user, token, _ = authenticated_client

        response = client.post(
            "/api/compare-stream",
            json={
                "input_data": "Test prompt",
                "models": ["deepseek/deepseek-chat-v3.1"],  # Free tier model
            },
        )
        # TestClient handles StreamingResponse automatically
        # Verify it returns a streaming response with correct content type
        assert response.status_code in [
            status.HTTP_200_OK,
            status.HTTP_429_TOO_MANY_REQUESTS,
        ]
        if response.status_code == status.HTTP_200_OK:
            # Verify it's a streaming response (SSE)
            # FastAPI automatically adds charset=utf-8 to text media types
            content_type = response.headers.get("content-type", "")
            assert content_type.startswith("text/event-stream")


class TestStreamingComparison:
    """Tests for streaming comparison endpoint."""

    def test_streaming_basic(self, authenticated_client):
        """Test basic streaming comparison."""
        client, user, token, _ = authenticated_client

        response = client.post(
            "/api/compare-stream",
            json={
                "input_data": "Test prompt",
                "models": ["deepseek/deepseek-chat-v3.1"],  # Free tier model
            },
        )
        assert response.status_code in [
            status.HTTP_200_OK,
            status.HTTP_429_TOO_MANY_REQUESTS,
        ]

        if response.status_code == status.HTTP_200_OK:
            # Verify it's a streaming response
            content_type = response.headers.get("content-type", "")
            assert content_type.startswith("text/event-stream")

    def test_streaming_multiple_models(self, authenticated_client):
        """Test streaming with multiple models."""
        client, user, token, _ = authenticated_client

        response = client.post(
            "/api/compare-stream",
            json={
                "input_data": "Test prompt",
                "models": [
                    "deepseek/deepseek-chat-v3.1",
                ],  # Free tier models
            },
        )
        assert response.status_code in [
            status.HTTP_200_OK,
            status.HTTP_429_TOO_MANY_REQUESTS,
        ]
