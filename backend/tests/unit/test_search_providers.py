"""
Unit tests for search provider functionality.

Tests cover:
- Search provider base class interface
- Brave search provider implementation
- Search provider factory
- Search result formatting
- Error handling
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models import AppSettings
from app.search.base import SearchResult
from app.search.brave import BraveSearchProvider
from app.search.factory import SearchProviderFactory


@pytest.mark.unit
class TestSearchResult:
    """Test SearchResult dataclass."""

    def test_search_result_creation(self):
        """Test creating a SearchResult instance."""
        result = SearchResult(
            title="Test Title", url="https://example.com", snippet="Test snippet", source="brave"
        )

        assert result.title == "Test Title"
        assert result.url == "https://example.com"
        assert result.snippet == "Test snippet"
        assert result.source == "brave"


@pytest.mark.unit
class TestBraveSearchProvider:
    """Test BraveSearchProvider implementation."""

    def test_provider_initialization(self):
        """Test provider initialization."""
        provider = BraveSearchProvider("test_api_key")
        assert provider.api_key == "test_api_key"
        assert provider.BASE_URL == "https://api.search.brave.com/res/v1/web/search"

    def test_get_provider_name(self):
        """Test getting provider name."""
        provider = BraveSearchProvider("test_api_key")
        assert provider.get_provider_name() == "brave"

    def test_is_available_with_api_key(self):
        """Test availability check with API key."""
        provider = BraveSearchProvider("test_api_key")
        assert provider.is_available() is True

    def test_is_available_without_api_key(self):
        """Test availability check without API key."""
        provider = BraveSearchProvider("")
        assert provider.is_available() is False

    @pytest.mark.asyncio
    async def test_search_success(self):
        """Test successful search execution."""
        provider = BraveSearchProvider("test_api_key")

        mock_response = {
            "web": {
                "results": [
                    {
                        "title": "Test Result 1",
                        "url": "https://example.com/1",
                        "description": "Test description 1",
                    },
                    {
                        "title": "Test Result 2",
                        "url": "https://example.com/2",
                        "description": "Test description 2",
                    },
                ]
            }
        }

        with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
            mock_response_obj = MagicMock()
            mock_response_obj.status_code = 200
            mock_response_obj.json.return_value = mock_response
            mock_get.return_value = mock_response_obj

            results = await provider.search("test query", max_results=5)

            assert len(results) == 2
            assert results[0].title == "Test Result 1"
            assert results[0].url == "https://example.com/1"
            assert results[0].snippet == "Test description 1"
            assert results[0].source == "Brave Search"

    @pytest.mark.asyncio
    async def test_search_with_custom_max_results(self):
        """Test search with custom max_results parameter."""
        provider = BraveSearchProvider("test_api_key")

        mock_response = {
            "web": {
                "results": [
                    {
                        "title": f"Result {i}",
                        "url": f"https://example.com/{i}",
                        "description": f"Desc {i}",
                    }
                    for i in range(10)
                ]
            }
        }

        with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
            mock_response_obj = MagicMock()
            mock_response_obj.status_code = 200
            mock_response_obj.json.return_value = mock_response
            mock_get.return_value = mock_response_obj

            results = await provider.search("test query", max_results=3)

            assert len(results) == 3

    @pytest.mark.asyncio
    async def test_search_api_error(self):
        """Test search with API error."""
        provider = BraveSearchProvider("test_api_key")

        with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
            mock_response_obj = MagicMock()
            mock_response_obj.status_code = 500
            mock_response_obj.json.return_value = {"error": "Internal server error"}
            mock_response_obj.raise_for_status.side_effect = Exception("API error")
            mock_get.return_value = mock_response_obj

            with pytest.raises(Exception):
                await provider.search("test query")

    @pytest.mark.asyncio
    async def test_search_network_error(self):
        """Test search with network error."""
        provider = BraveSearchProvider("test_api_key")

        with patch("httpx.AsyncClient.get") as mock_get:
            mock_get.side_effect = Exception("Network error")

            with pytest.raises(Exception):
                await provider.search("test query")

    @pytest.mark.asyncio
    async def test_search_empty_results(self):
        """Test search with empty results."""
        provider = BraveSearchProvider("test_api_key")

        mock_response = {"web": {"results": []}}

        with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
            mock_response_obj = MagicMock()
            mock_response_obj.status_code = 200
            mock_response_obj.json.return_value = mock_response
            mock_get.return_value = mock_response_obj

            results = await provider.search("test query")

            assert len(results) == 0

    @pytest.mark.asyncio
    async def test_search_missing_fields(self):
        """Test search with missing fields in response."""
        provider = BraveSearchProvider("test_api_key")

        mock_response = {
            "web": {
                "results": [
                    {
                        "title": "Test Result",
                        # Missing url and description
                    }
                ]
            }
        }

        with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
            mock_response_obj = MagicMock()
            mock_response_obj.status_code = 200
            mock_response_obj.json.return_value = mock_response
            mock_get.return_value = mock_response_obj

            results = await provider.search("test query")

            assert len(results) == 1
            assert results[0].title == "Test Result"
            assert results[0].url == ""  # Default empty string
            assert results[0].snippet == ""  # Default empty string


@pytest.mark.unit
class TestSearchProviderFactory:
    """Test SearchProviderFactory."""

    def test_get_available_providers(self):
        """Test getting available providers."""
        with patch("app.search.factory.settings") as mock_settings:
            mock_settings.brave_search_api_key = "test_key"
            mock_settings.tavily_api_key = None

            providers = SearchProviderFactory.get_available_providers()

            assert "brave" in providers
            assert len(providers) == 1

    def test_get_available_providers_none(self):
        """Test getting available providers when none configured."""
        with patch("app.search.factory.settings") as mock_settings:
            mock_settings.brave_search_api_key = None
            mock_settings.tavily_api_key = None

            providers = SearchProviderFactory.get_available_providers()

            assert len(providers) == 0

    def test_get_provider_brave(self, db_session):
        """Test getting Brave provider."""
        # Create app settings
        app_settings = AppSettings(id=1, active_search_provider="brave")
        db_session.add(app_settings)
        db_session.commit()

        with patch("app.search.factory.settings") as mock_settings:
            mock_settings.brave_search_api_key = "test_key"

            provider = SearchProviderFactory.get_provider("brave", db_session)

            assert provider is not None
            assert isinstance(provider, BraveSearchProvider)
            assert provider.get_provider_name() == "brave"

    def test_get_provider_no_api_key(self, db_session):
        """Test getting provider without API key."""
        app_settings = AppSettings(id=1, active_search_provider="brave")
        db_session.add(app_settings)
        db_session.commit()

        with patch("app.search.factory.settings") as mock_settings:
            mock_settings.brave_search_api_key = None

            provider = SearchProviderFactory.get_provider("brave", db_session)

            assert provider is None

    def test_get_provider_unknown(self, db_session):
        """Test getting unknown provider."""
        provider = SearchProviderFactory.get_provider("unknown", db_session)

        assert provider is None

    def test_get_active_provider(self, db_session):
        """Test getting active provider from database."""
        app_settings = AppSettings(id=1, active_search_provider="brave")
        db_session.add(app_settings)
        db_session.commit()

        with patch("app.search.factory.settings") as mock_settings:
            mock_settings.brave_search_api_key = "test_key"

            provider = SearchProviderFactory.get_active_provider(db_session)

            assert provider is not None
            assert isinstance(provider, BraveSearchProvider)

    def test_get_active_provider_none_configured(self, db_session):
        """Test getting active provider when none configured."""
        app_settings = AppSettings(id=1, active_search_provider=None)
        db_session.add(app_settings)
        db_session.commit()

        provider = SearchProviderFactory.get_active_provider(db_session)

        assert provider is None

    def test_get_active_provider_no_settings(self, db_session):
        """Test getting active provider when no settings exist."""
        provider = SearchProviderFactory.get_active_provider(db_session)

        assert provider is None
