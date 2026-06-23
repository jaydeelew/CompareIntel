"""
Edge case and error scenario tests for streaming comparison endpoint.

Tests cover:
- Invalid model IDs
- API failures and timeouts
- Rate limiting edge cases
- Input validation edge cases
- Error handling scenarios
"""

import pytest

pytestmark = pytest.mark.integration


from fastapi import status


class TestComparisonStreamingEdgeCases:
    """Tests for streaming comparison edge cases."""

    def test_streaming_no_models(self, authenticated_client):
        """Test streaming with no models."""
        client, user, token, _ = authenticated_client

        response = client.post(
            "/api/compare-stream",
            json={
                "input_data": "Test prompt",
                "models": [],
            },
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
