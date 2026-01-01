# Search Rate Limiting Improvements

**Date:** January 2026  
**Status:** ✅ Implemented

## Overview

This document summarizes comprehensive improvements made to the search API rate limiting system to address rate limit exhaustion issues when multiple models make concurrent search requests. These improvements apply to all current and future search providers (Brave, Tavily, etc.).

## Problem Statement

The original implementation experienced frequent rate limit errors (429) when multiple models made concurrent search requests, particularly with Brave Search API. Issues included:

- **Rate limit exhaustion**: Multiple models hitting the API simultaneously
- **Thundering herd**: Synchronized retries causing repeated rate limit hits
- **No request deduplication**: Identical queries executed multiple times
- **Single rate limit configuration**: All providers shared the same limits
- **Limited monitoring**: Difficult to diagnose rate limit issues
- **No graceful degradation**: Complete failure when rate limits were hit

## Implemented Solutions

### 1. Provider-Aware Rate Limiting

**Problem:** All search providers shared the same rate limit configuration, even though different providers have different limits.

**Solution:** Implemented provider-specific rate limit configurations while maintaining global coordination.

**Features:**
- Each provider (Brave, Tavily, etc.) can have its own rate limits
- Falls back to sensible defaults if provider-specific configs aren't set
- Thread-safe per-provider state tracking
- Sliding window algorithm per provider

**Configuration:**
```python
# Default limits (applied to all providers)
search_rate_limit_per_minute: int = 20
search_max_concurrent: int = 3
search_delay_between_requests: float = 1.0

# Provider-specific limits (optional JSON string)
search_provider_rate_limits: Optional[str] = None
# Example: '{"brave": {"max_requests_per_minute": 15, "max_concurrent": 2}}'
```

**Files Modified:**
- `backend/app/search/rate_limiter.py` - Complete rewrite with provider awareness
- `backend/app/config/settings.py` - Added configuration options

### 2. Request Deduplication and Caching

**Problem:** Identical search queries were executed multiple times, wasting API quota and increasing rate limit risk.

**Solution:** Implemented thread-safe caching system for search results.

**Features:**
- Automatic caching of successful search results
- Configurable TTL (default: 5 minutes)
- Query normalization (case-insensitive, trimmed)
- Thread-safe cache operations
- Automatic cache cleanup of expired entries

**Benefits:**
- Reduces redundant API calls
- Faster response times for repeated queries
- Reduces rate limit pressure
- Works across all concurrent model requests

**Configuration:**
```python
search_cache_enabled: bool = True
search_cache_ttl_seconds: int = 300  # 5 minutes
```

**Files Modified:**
- `backend/app/search/rate_limiter.py` - Added `SearchResultCache` class
- `backend/app/model_runner.py` - Integrated cache checks and storage

### 3. Environment Variable Configuration

**Problem:** Rate limiter settings were hardcoded, requiring code changes to adjust.

**Solution:** Made all rate limiter settings configurable via environment variables.

**Available Settings:**
- `SEARCH_RATE_LIMIT_PER_MINUTE` - Default requests per minute (default: 20)
- `SEARCH_MAX_CONCURRENT` - Default max concurrent requests (default: 3)
- `SEARCH_DELAY_BETWEEN_REQUESTS` - Delay between requests in seconds (default: 1.0)
- `SEARCH_PROVIDER_RATE_LIMITS` - JSON string for provider-specific limits
- `SEARCH_CACHE_ENABLED` - Enable/disable caching (default: true)
- `SEARCH_CACHE_TTL_SECONDS` - Cache TTL in seconds (default: 300)

**Files Modified:**
- `backend/app/config/settings.py` - Added all configuration options

### 4. Improved Retry Logic

**Problem:** Retry logic didn't properly respect `Retry-After` headers, and retries were synchronized causing thundering herd problems.

**Solution:** Enhanced retry logic with better header parsing and jitter.

**Improvements:**
- Better `Retry-After` header parsing (handles both seconds and HTTP dates)
- Exponential backoff with configurable jitter
- Random jitter prevents synchronized retries
- Improved error messages and logging

**Files Modified:**
- `backend/app/search/retry.py` - Enhanced `_calculate_wait_time()` function

### 5. Search Request Queuing

**Problem:** Requests could overwhelm the API when multiple models searched simultaneously.

**Solution:** Built-in queuing system via the `acquire()` method.

**Features:**
- Automatic queuing when rate limits are reached
- Sliding window algorithm for accurate rate limiting
- Per-provider request tracking
- Thread-safe queue operations
- Configurable wait times

**How It Works:**
- Requests wait automatically when limits are reached
- Calculates wait time until oldest request expires
- Respects both per-minute and concurrent limits
- Provides detailed logging of wait times

**Files Modified:**
- `backend/app/search/rate_limiter.py` - Enhanced `acquire()` method

### 6. Enhanced Monitoring and Logging

**Problem:** Difficult to diagnose rate limit issues and track system health.

**Solution:** Comprehensive monitoring and logging system.

**Features:**
- Rate limit event tracking per provider
- Detailed logging of rate limit hits and wait times
- Cache hit/miss statistics
- `get_stats()` method for programmatic monitoring
- Debug-level logging for troubleshooting

**Monitoring Data:**
```python
{
    "rate_limit_events": {"brave": 5, "tavily": 2},
    "cache_enabled": true,
    "cache_size": 42,
    "providers": {
        "brave": {
            "requests_in_window": 15,
            "max_requests_per_minute": 20,
            "current_concurrent": 2,
            "max_concurrent": 3,
            "rate_limit_hits": 5
        }
    }
}
```

**Files Modified:**
- `backend/app/search/rate_limiter.py` - Added monitoring and stats tracking

### 7. Graceful Degradation

**Problem:** Complete failure when rate limits were hit, even if cached results were available.

**Solution:** Fallback to cached results when rate limits are encountered.

**Features:**
- Automatic fallback to cached results on rate limit errors
- Better error messages for users
- Continues operation even during rate limit periods
- Logs when cached results are used as fallback

**Files Modified:**
- `backend/app/model_runner.py` - Enhanced error handling with cache fallback

### 8. Updated Model Runner Integration

**Problem:** Model runner didn't use provider names or check cache before making requests.

**Solution:** Complete integration with improved rate limiter.

**Changes:**
- Uses provider name for provider-specific rate limiting
- Checks cache before making API calls
- Caches successful results automatically
- Improved error handling with graceful degradation
- Better logging of cache hits/misses

**Files Modified:**
- `backend/app/model_runner.py` - Updated `execute_search_with_rate_limit()` function

## Architecture

### Component Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Search Rate Limiter                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────┐    ┌──────────────────┐            │
│  │ Provider Configs │    │  Result Cache    │            │
│  │  - Brave: 15/min │    │  - TTL: 5 min    │            │
│  │  - Tavily: 50/min│    │  - Thread-safe   │            │
│  └──────────────────┘    └──────────────────┘            │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐  │
│  │         Per-Provider State Tracking                 │  │
│  │  - Request timestamps (sliding window)              │  │
│  │  - Concurrent request counter                      │  │
│  │  - Rate limit event counter                         │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    Model Runner                             │
│  - Checks cache before search                              │
│  - Acquires rate limiter slot                              │
│  - Executes search                                          │
│  - Caches results                                          │
│  - Falls back to cache on errors                            │
└─────────────────────────────────────────────────────────────┘
```

### Thread Safety

All components are thread-safe and designed to work with:
- Multiple Gunicorn workers
- Thread pools (asyncio.run() in threads)
- Concurrent model requests
- Async/await patterns

## Configuration Examples

### Basic Configuration (Environment Variables)

```bash
# Default rate limits
SEARCH_RATE_LIMIT_PER_MINUTE=20
SEARCH_MAX_CONCURRENT=3
SEARCH_DELAY_BETWEEN_REQUESTS=1.0

# Caching
SEARCH_CACHE_ENABLED=true
SEARCH_CACHE_TTL_SECONDS=300
```

### Provider-Specific Configuration

```bash
# JSON string for provider-specific limits
SEARCH_PROVIDER_RATE_LIMITS='{
  "brave": {
    "max_requests_per_minute": 15,
    "max_concurrent": 2,
    "delay_between_requests": 1.5
  },
  "tavily": {
    "max_requests_per_minute": 50,
    "max_concurrent": 5,
    "delay_between_requests": 0.5
  }
}'
```

### Disabling Cache

```bash
SEARCH_CACHE_ENABLED=false
```

## Usage Examples

### Programmatic Access to Statistics

```python
from app.search.rate_limiter import get_rate_limiter

rate_limiter = get_rate_limiter()
stats = rate_limiter.get_stats()

print(f"Rate limit hits for Brave: {stats['rate_limit_events'].get('brave', 0)}")
print(f"Cache size: {stats['cache_size']}")
```

### Clearing Cache

```python
from app.search.rate_limiter import get_rate_limiter

rate_limiter = get_rate_limiter()
rate_limiter.cache.clear()
```

## Benefits

### Performance
- ✅ Reduced API calls through caching
- ✅ Faster response times for cached queries
- ✅ Better resource utilization

### Reliability
- ✅ Prevents rate limit exhaustion
- ✅ Graceful degradation with cache fallback
- ✅ Better error handling and recovery

### Scalability
- ✅ Supports multiple concurrent models
- ✅ Provider-specific optimization
- ✅ Thread-safe for multi-worker deployments

### Observability
- ✅ Comprehensive logging
- ✅ Monitoring statistics
- ✅ Rate limit event tracking

### Maintainability
- ✅ Environment variable configuration
- ✅ Provider-agnostic design
- ✅ Well-documented code

## Migration Notes

### Backward Compatibility

All changes are **100% backward compatible**:
- Existing code continues to work without changes
- Default configurations are conservative and safe
- Cache is opt-in (enabled by default but can be disabled)

### Required Actions

**None** - The improvements are automatically applied. Optional configuration can be added via environment variables.

### Recommended Configuration

For production deployments with multiple models:

```bash
# Conservative limits to avoid rate limits
SEARCH_RATE_LIMIT_PER_MINUTE=15
SEARCH_MAX_CONCURRENT=2
SEARCH_DELAY_BETWEEN_REQUESTS=1.0

# Enable caching
SEARCH_CACHE_ENABLED=true
SEARCH_CACHE_TTL_SECONDS=300
```

## Testing

### Manual Testing

1. **Cache Test**: Make the same search query twice - second should use cache
2. **Rate Limit Test**: Make many concurrent searches - should queue automatically
3. **Provider Test**: Configure different limits per provider - should respect limits
4. **Fallback Test**: Hit rate limit - should fall back to cache if available

### Monitoring

Check logs for:
- `"Cache hit for query"` - Cache is working
- `"Search rate limit reached"` - Rate limiting is active
- `"Using cached results as fallback"` - Graceful degradation working

## Future Enhancements

Potential future improvements:

1. **Redis-backed cache**: For multi-worker deployments
2. **Distributed rate limiting**: Using Redis for coordination across workers
3. **Adaptive rate limiting**: Automatically adjust limits based on API responses
4. **Metrics export**: Prometheus/StatsD integration
5. **Admin dashboard**: Visual monitoring of rate limits and cache stats

## Related Documentation

- [Adding Search Provider](./ADDING_SEARCH_PROVIDER.md) - How to add new search providers
- [Rate Limiting Implementation](./RATE_LIMITING_IMPLEMENTATION.md) - User-facing rate limiting
- [Backend Optimization](../development/BACKEND_OPTIMIZATION.md) - General optimization strategies

## Files Changed

### Core Implementation
- `backend/app/search/rate_limiter.py` - Complete rewrite with provider awareness and caching
- `backend/app/search/retry.py` - Enhanced retry logic
- `backend/app/config/settings.py` - Added configuration options
- `backend/app/model_runner.py` - Integrated improved rate limiter

### Documentation
- `docs/features/SEARCH_RATE_LIMITING_IMPROVEMENTS.md` - This document

## Summary

These improvements transform the search rate limiting system from a basic per-request limiter into a comprehensive, provider-aware, caching-enabled system that gracefully handles high concurrency scenarios. The system is now production-ready for deployments with multiple concurrent models and provides excellent observability and configurability.
