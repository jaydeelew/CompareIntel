"""
Search provider abstraction layer for web search integration.

This package provides a unified interface for different search providers
(Brave, Tavily, etc.) allowing the application to switch between providers
without code changes.
"""

from .base import SearchResult, SearchProvider
from .factory import SearchProviderFactory
from .brave import BraveSearchProvider
from .retry import RetryConfig, execute_with_retry

__all__ = [
    "SearchResult",
    "SearchProvider",
    "SearchProviderFactory",
    "BraveSearchProvider",
    "RetryConfig",
    "execute_with_retry",
]

