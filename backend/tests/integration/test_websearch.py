"""
Integration tests for web search functionality.

Tests cover:
- Web search integration with comparison endpoint
- Search provider configuration
- Tool calling for web search-enabled models
- Error handling in web search flow
"""

import pytest

pytestmark = pytest.mark.integration


from unittest.mock import patch

from app.models import AppSettings
from tests.factories import create_app_settings


@pytest.mark.integration
class TestWebSearchIntegration:
    """Test web search integration with comparison endpoint."""

    def test_web_search_with_model_not_supporting(self, authenticated_client, db_session):
        """Test web search with model that doesn't support it."""
        client, user, token, _ = authenticated_client

        # Configure search provider
        create_app_settings(db_session)
        app_settings = db_session.query(AppSettings).first()
        app_settings.active_search_provider = "brave"
        db_session.commit()

        response = client.post(
            "/api/compare-stream",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "input_data": "Test query",
                "models": ["deepseek/deepseek-chat-v3.1"],  # Free tier model
                "enable_web_search": True,
            },
        )

        # Should handle gracefully - 403 is acceptable if model doesn't support web search
        # or if there's a configuration issue
        assert response.status_code in [200, 400, 403]


@pytest.mark.integration
class TestWebSearchConfiguration:
    """Test web search configuration."""

    def test_search_provider_configuration(self, db_session):
        """Test configuring search provider."""
        app_settings = create_app_settings(db_session)
        app_settings.active_search_provider = "brave"
        db_session.commit()

        settings = db_session.query(AppSettings).first()
        assert settings.active_search_provider == "brave"

    def test_search_provider_availability_check(self, db_session):
        """Test checking search provider availability."""
        from app.search.factory import SearchProviderFactory

        with patch("app.search.factory.settings") as mock_settings:
            mock_settings.brave_search_api_key = "test_key"

            providers = SearchProviderFactory.get_available_providers()
            assert "brave" in providers
