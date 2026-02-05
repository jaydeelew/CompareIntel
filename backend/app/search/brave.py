"""
Brave Search API provider implementation.

This module implements the SearchProvider interface for Brave Search API.
"""

import logging

import httpx

from .base import SearchProvider, SearchResult
from .retry import RetryConfig, execute_with_retry

logger = logging.getLogger(__name__)


class BraveSearchProvider(SearchProvider):
    """Brave Search API provider."""

    BASE_URL = "https://api.search.brave.com/res/v1/web/search"

    def __init__(self, api_key: str):
        """
        Initialize Brave Search provider.

        Args:
            api_key: Brave Search API key
        """
        self.api_key = api_key
        self._client = None

    def _get_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client."""
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=30.0)
        return self._client

    async def search(self, query: str, max_results: int = 5) -> list[SearchResult]:
        """
        Perform a web search using Brave Search API with retry logic for rate limits.

        Args:
            query: The search query string
            max_results: Maximum number of results to return (default: 5)

        Returns:
            List of SearchResult objects

        Raises:
            Exception: If the search fails after all retries
        """
        if not self.is_available():
            raise ValueError("Brave Search API key is not configured")

        # Brave-specific retry config (aggressive for rate limits)
        retry_config = RetryConfig(
            max_retries=3,
            initial_delay=2.0,
            max_delay=30.0,
            jitter_factor=0.2,
            provider_name="Brave Search",
        )

        async def _execute_search():
            # Create a fresh client for each attempt to avoid event loop issues
            # when called from asyncio.run() which creates a new event loop each time
            client = httpx.AsyncClient(timeout=30.0)
            try:
                headers = {
                    "X-Subscription-Token": self.api_key,
                    "Accept": "application/json",
                }
                params = {
                    "q": query,
                    "count": max_results,
                }

                response = await client.get(self.BASE_URL, headers=headers, params=params)
                response.raise_for_status()

                data = response.json()

                # Extract results from Brave API response
                results = []
                web_results = data.get("web", {}).get("results", [])

                for item in web_results[:max_results]:
                    result = SearchResult(
                        title=item.get("title", ""),
                        url=item.get("url", ""),
                        snippet=item.get("description", ""),
                        source="Brave Search",
                    )
                    results.append(result)

                return results
            finally:
                await client.aclose()

        return await execute_with_retry(_execute_search, retry_config, query)

    def is_available(self) -> bool:
        """Check if Brave Search API key is configured."""
        return bool(self.api_key)

    def get_provider_name(self) -> str:
        """Get the provider name."""
        return "brave"

    async def __aenter__(self):
        """Async context manager entry."""
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit - close HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None
