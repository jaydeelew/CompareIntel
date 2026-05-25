"""
Integration tests for compare-stream payloads involving attached_images.
"""

from __future__ import annotations

import pytest
from fastapi import status

pytestmark = pytest.mark.integration

FREE_TIER_MODEL = "anthropic/claude-3.5-haiku"


class TestCompareStreamAttachedImagesValidation:
    def test_attached_image_missing_required_mime_returns_422(self, client):
        response = client.post(
            "/api/compare-stream",
            json={
                "input_data": "Describe this",
                "models": [FREE_TIER_MODEL],
                "attached_images": [
                    {
                        "base64_data": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
                        "filename": "tiny.png",
                    }
                ],
            },
        )
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_empty_attached_images_accepted_like_plain_compare(self, authenticated_client):
        client, *_user = authenticated_client
        response = client.post(
            "/api/compare-stream",
            json={
                "input_data": "Test prompt",
                "models": [FREE_TIER_MODEL],
                "attached_images": [],
            },
        )
        assert response.status_code in (
            status.HTTP_200_OK,
            status.HTTP_429_TOO_MANY_REQUESTS,
        )
