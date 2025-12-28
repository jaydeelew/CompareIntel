"""
Base classes and interfaces for search providers.

This module defines the abstract base class and data structures
that all search providers must implement.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import List


@dataclass
class SearchResult:
    """Represents a single search result."""
    
    title: str
    url: str
    snippet: str
    source: str  # Provider name or source identifier


class SearchProvider(ABC):
    """Abstract base class for search providers."""
    
    @abstractmethod
    async def search(self, query: str, max_results: int = 5) -> List[SearchResult]:
        """
        Perform a web search query.
        
        Args:
            query: The search query string
            max_results: Maximum number of results to return (default: 5)
            
        Returns:
            List of SearchResult objects
            
        Raises:
            Exception: If the search fails
        """
        pass
    
    @abstractmethod
    def is_available(self) -> bool:
        """
        Check if the provider is available (API key configured, etc.).
        
        Returns:
            True if the provider can be used, False otherwise
        """
        pass
    
    @abstractmethod
    def get_provider_name(self) -> str:
        """
        Get the name of this provider.
        
        Returns:
            Provider name (e.g., "brave", "tavily")
        """
        pass

