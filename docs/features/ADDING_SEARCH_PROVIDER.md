# Adding a New Search Provider

This guide explains how to add a new search provider to CompareIntel using the shared retry utility system.

## Overview

The search provider system uses:
- **Base Interface**: `SearchProvider` abstract class (defines required methods)
- **Shared Retry Logic**: `execute_with_retry()` utility (handles rate limits and errors)
- **Factory Pattern**: `SearchProviderFactory` (manages provider instances)
- **Provider-Specific Config**: Each provider can customize retry behavior

## Architecture

```
backend/app/search/
├── base.py          # SearchProvider abstract class, SearchResult dataclass
├── retry.py         # Shared retry logic (RetryConfig, execute_with_retry)
├── factory.py       # SearchProviderFactory (creates provider instances)
├── brave.py         # Brave Search implementation (example)
└── __init__.py      # Package exports
```

## Step-by-Step Guide

### Step 1: Create Provider Implementation File

Create a new file: `backend/app/search/your_provider.py`

```python
"""
Your Provider Search API implementation.

This module implements the SearchProvider interface for Your Provider API.
"""

import httpx
import logging
from typing import List
from .base import SearchProvider, SearchResult
from .retry import execute_with_retry, RetryConfig

logger = logging.getLogger(__name__)


class YourProviderSearchProvider(SearchProvider):
    """Your Provider Search API provider."""
    
    BASE_URL = "https://api.yourprovider.com/search"  # Update with actual API URL
    
    def __init__(self, api_key: str):
        """
        Initialize Your Provider Search provider.
        
        Args:
            api_key: Your Provider API key
        """
        self.api_key = api_key
        self._client = None
    
    async def search(self, query: str, max_results: int = 5) -> List[SearchResult]:
        """
        Perform a web search using Your Provider API with retry logic.
        
        Args:
            query: The search query string
            max_results: Maximum number of results to return (default: 5)
            
        Returns:
            List of SearchResult objects
            
        Raises:
            Exception: If the search fails after all retries
        """
        if not self.is_available():
            raise ValueError("Your Provider API key is not configured")
        
        # Configure retry behavior for your provider
        # Adjust these values based on your provider's rate limits and behavior
        retry_config = RetryConfig(
            max_retries=3,              # Number of retry attempts
            initial_delay=2.0,          # Initial delay in seconds
            max_delay=30.0,             # Maximum delay cap
            jitter_factor=0.2,          # Random jitter (0-20% of wait time)
            retry_on_429=True,          # Retry on rate limit errors
            retry_on_5xx=True,          # Retry on server errors
            retry_on_network_error=True, # Retry on network errors
            provider_name="Your Provider Search"
        )
        
        async def _execute_search():
            # Create a fresh client for each attempt to avoid event loop issues
            # when called from asyncio.run() which creates a new event loop each time
            client = httpx.AsyncClient(timeout=30.0)
            try:
                # Prepare API request
                headers = {
                    "Authorization": f"Bearer {self.api_key}",  # Adjust auth header format
                    "Accept": "application/json",
                }
                params = {
                    "q": query,
                    "limit": max_results,  # Adjust parameter name if needed
                }
                
                # Make API call
                response = await client.get(self.BASE_URL, headers=headers, params=params)
                response.raise_for_status()  # Raises HTTPStatusError for 4xx/5xx
                
                # Parse response
                data = response.json()
                
                # Extract results - ADJUST THIS BASED ON YOUR PROVIDER'S RESPONSE FORMAT
                results = []
                # Example: if your provider returns results in data["results"]
                for item in data.get("results", [])[:max_results]:
                    result = SearchResult(
                        title=item.get("title", ""),
                        url=item.get("url", ""),
                        snippet=item.get("description", ""),  # or "snippet", "summary", etc.
                        source="Your Provider Search",
                    )
                    results.append(result)
                
                return results
            finally:
                await client.aclose()
        
        # Execute with automatic retry logic
        return await execute_with_retry(_execute_search, retry_config, query)
    
    def is_available(self) -> bool:
        """Check if Your Provider API key is configured."""
        return bool(self.api_key)
    
    def get_provider_name(self) -> str:
        """Get the provider name."""
        return "your_provider"  # Lowercase, no spaces (used in database)
```

### Step 2: Add Provider to Factory

Update `backend/app/search/factory.py`:

```python
# Add import at top
from .your_provider import YourProviderSearchProvider

# Update get_provider() method
@staticmethod
def get_provider(provider_name: str, db: Session) -> Optional[SearchProvider]:
    # ... existing code ...
    
    # Get provider-specific API key from settings
    api_key = None
    if provider_name == "brave":
        api_key = settings.brave_search_api_key
    elif provider_name == "tavily":
        api_key = settings.tavily_api_key
    elif provider_name == "your_provider":  # Add this
        api_key = settings.your_provider_api_key  # Add to settings.py
    else:
        logger.warning(f"Unknown search provider: {provider_name}")
        return None
    
    # ... existing code ...
    
    # Create provider instance
    if provider_name == "brave":
        return BraveSearchProvider(api_key)
    elif provider_name == "tavily":
        # Future implementation
        logger.warning("Tavily provider not yet implemented")
        return None
    elif provider_name == "your_provider":  # Add this
        return YourProviderSearchProvider(api_key)
    
    return None

# Update get_available_providers() method
@staticmethod
def get_available_providers() -> list[str]:
    providers = []
    
    if settings.brave_search_api_key:
        providers.append("brave")
    
    if settings.tavily_api_key:
        providers.append("tavily")
    
    if settings.your_provider_api_key:  # Add this
        providers.append("your_provider")
    
    return providers
```

### Step 3: Add API Key to Settings

Update `backend/app/config/settings.py`:

```python
# Add to Settings class
your_provider_api_key: Optional[str] = None

# Add to .env.example (if you maintain one)
# YOUR_PROVIDER_API_KEY=your_api_key_here
```

### Step 4: Update Package Exports

Update `backend/app/search/__init__.py`:

```python
from .your_provider import YourProviderSearchProvider

__all__ = [
    "SearchResult",
    "SearchProvider",
    "SearchProviderFactory",
    "BraveSearchProvider",
    "YourProviderSearchProvider",  # Add this
    "RetryConfig",
    "execute_with_retry",
]
```

### Step 5: Update Database Model (if needed)

The `AppSettings` model already supports multiple providers via `active_search_provider` field. No changes needed unless you want to add provider-specific settings.

### Step 6: Update Admin Panel (optional)

If you want to add provider selection in the admin panel, update `backend/app/routers/admin.py`:

```python
# In the provider validation, add your provider to the list
if provider not in ["brave", "tavily", "your_provider"]:
    raise HTTPException(
        status_code=400,
        detail=f"Invalid provider: {provider}. Supported providers: brave, tavily, your_provider"
    )
```

## Retry Configuration Guidelines

### Aggressive Retry (for strict rate limits like Brave)
```python
RetryConfig(
    max_retries=3,
    initial_delay=2.0,
    max_delay=30.0,
    jitter_factor=0.2,
    provider_name="Your Provider"
)
```

### Moderate Retry (for moderate rate limits)
```python
RetryConfig(
    max_retries=2,
    initial_delay=1.5,
    max_delay=15.0,
    jitter_factor=0.15,
    provider_name="Your Provider"
)
```

### Simple Retry (for lenient providers)
```python
RetryConfig(
    max_retries=2,
    initial_delay=1.0,
    max_delay=10.0,
    jitter_factor=0.1,
    provider_name="Your Provider"
)
```

## Key Implementation Details

### 1. Response Format Mapping

You need to map your provider's response format to `SearchResult`:

```python
SearchResult(
    title=item.get("title", ""),      # Required: result title
    url=item.get("url", ""),          # Required: result URL
    snippet=item.get("description", ""), # Required: result snippet/description
    source="Your Provider Search",     # Required: provider name for display
)
```

### 2. Authentication

Different providers use different auth methods:
- **Bearer Token**: `"Authorization": f"Bearer {api_key}"`
- **API Key Header**: `"X-API-Key": api_key`
- **Query Parameter**: `params = {"api_key": api_key, ...}`
- **Custom Header**: Check provider documentation

### 3. Error Handling

The retry utility automatically handles:
- **429 Rate Limits**: Retries with exponential backoff and jitter
- **5xx Server Errors**: Retries on transient server errors
- **Network Errors**: Retries on connection failures
- **4xx Client Errors**: Logs and raises (no retry)

### 4. Testing

Test your provider with:

```python
# Test basic search
provider = YourProviderSearchProvider("test_api_key")
results = await provider.search("test query", max_results=5)

# Test error handling
# The retry logic will handle rate limits automatically
```

## Checklist

- [ ] Create provider implementation file (`your_provider.py`)
- [ ] Implement `search()` method with retry logic
- [ ] Implement `is_available()` method
- [ ] Implement `get_provider_name()` method
- [ ] Add provider to factory (`factory.py`)
- [ ] Add API key to settings (`settings.py`)
- [ ] Update package exports (`__init__.py`)
- [ ] Test with valid API key
- [ ] Test error handling (rate limits, network errors)
- [ ] Update admin panel validation (if needed)
- [ ] Update documentation

## Example: Complete Tavily Implementation

Here's a complete example for reference (when implementing Tavily):

```python
"""
Tavily Search API provider implementation.
"""

import httpx
import logging
from typing import List
from .base import SearchProvider, SearchResult
from .retry import execute_with_retry, RetryConfig

logger = logging.getLogger(__name__)


class TavilySearchProvider(SearchProvider):
    """Tavily Search API provider."""
    
    BASE_URL = "https://api.tavily.com/search"
    
    def __init__(self, api_key: str):
        self.api_key = api_key
    
    async def search(self, query: str, max_results: int = 5) -> List[SearchResult]:
        if not self.is_available():
            raise ValueError("Tavily API key is not configured")
        
        # Tavily-specific retry config (adjust based on actual rate limits)
        retry_config = RetryConfig(
            max_retries=2,
            initial_delay=1.0,
            max_delay=10.0,
            jitter_factor=0.1,
            provider_name="Tavily Search"
        )
        
        async def _execute_search():
            client = httpx.AsyncClient(timeout=30.0)
            try:
                headers = {
                    "Content-Type": "application/json",
                }
                json_data = {
                    "api_key": self.api_key,
                    "query": query,
                    "max_results": max_results,
                }
                
                response = await client.post(self.BASE_URL, headers=headers, json=json_data)
                response.raise_for_status()
                
                data = response.json()
                
                results = []
                for item in data.get("results", [])[:max_results]:
                    result = SearchResult(
                        title=item.get("title", ""),
                        url=item.get("url", ""),
                        snippet=item.get("content", ""),  # Tavily uses "content"
                        source="Tavily Search",
                    )
                    results.append(result)
                
                return results
            finally:
                await client.aclose()
        
        return await execute_with_retry(_execute_search, retry_config, query)
    
    def is_available(self) -> bool:
        return bool(self.api_key)
    
    def get_provider_name(self) -> str:
        return "tavily"
```

## Troubleshooting

### Issue: Rate limits still occurring
- **Solution**: Increase `max_retries` or `initial_delay` in `RetryConfig`

### Issue: Too many retries causing delays
- **Solution**: Decrease `max_retries` or adjust delays

### Issue: API response format doesn't match
- **Solution**: Adjust the response parsing in `_execute_search()` to match your provider's format

### Issue: Authentication errors
- **Solution**: Check the auth header format and ensure API key is correctly passed

## Additional Resources

- See `backend/app/search/brave.py` for a complete working example
- See `backend/app/search/retry.py` for retry logic documentation
- See `backend/app/search/factory.py` for factory pattern implementation

