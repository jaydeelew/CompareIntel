# Distributed Rate Limiting Implementation

**Date:** January 2026  
**Status:** ✅ Implemented

## Overview

This document describes the production-ready distributed rate limiting solution implemented to solve the multi-worker rate limiting coordination problem. The solution uses Redis for distributed coordination across Gunicorn workers, with graceful fallback to in-memory rate limiting.

## Problem Statement

The original rate limiting implementation had a critical flaw: **each Gunicorn worker had its own independent rate limiter instance**. With 4 workers and 5 req/min per worker, the total capacity was 20 req/min, which exceeded Brave Search API limits and caused frequent 429 errors.

### Issues Identified:
1. **No cross-worker coordination**: Each worker allowed 5 req/min independently
2. **Rate limit exhaustion**: Total capacity (4 × 5 = 20 req/min) exceeded API limits
3. **Provider name detection**: Some requests used "default" instead of actual provider name
4. **No circuit breaker**: Continued making requests even when API was failing
5. **No adaptive rate limiting**: Didn't adjust based on API responses

## Solution Architecture

### 1. Distributed Rate Limiter with Redis

**File:** `backend/app/search/distributed_rate_limiter.py`

A production-ready distributed rate limiter that:
- Uses **Redis** for coordination across all workers (when available)
- Falls back to **in-memory** rate limiting if Redis unavailable
- Implements **token bucket algorithm** (better burst handling)
- Includes **circuit breaker pattern** for API failures
- Supports **adaptive rate limiting** based on API responses

### 2. Key Features

#### Token Bucket Algorithm
- Better than sliding window for handling bursts
- Allows short bursts while maintaining long-term rate limits
- Configurable bucket capacity and refill rate

#### Circuit Breaker Pattern
- **CLOSED**: Normal operation, requests allowed
- **OPEN**: API failing, reject requests immediately
- **HALF_OPEN**: Testing if service recovered
- Prevents cascading failures and reduces API load during outages

#### Adaptive Rate Limiting
- Tracks API response times
- Records rate limit events
- Can adjust limits based on API behavior (foundation for future enhancement)

#### Graceful Degradation
- Works without Redis (in-memory fallback)
- Automatic fallback if Redis connection fails
- No single point of failure

## Configuration

### Environment Variables

```bash
# Redis Configuration (Optional - enables distributed rate limiting)
REDIS_ENABLED=true
REDIS_URL=redis://localhost:6379/0

# Rate Limiting Settings
SEARCH_RATE_LIMIT_PER_MINUTE=3  # Global limit if Redis enabled, per-worker if not
SEARCH_MAX_CONCURRENT=2
SEARCH_DELAY_BETWEEN_REQUESTS=3.0

# Circuit Breaker
SEARCH_CIRCUIT_BREAKER_ENABLED=true

# Caching
SEARCH_CACHE_ENABLED=true
SEARCH_CACHE_TTL_SECONDS=300

# Provider-Specific Limits (JSON string)
SEARCH_PROVIDER_RATE_LIMITS='{
  "brave": {
    "max_requests_per_minute": 2,
    "max_concurrent": 1,
    "delay_between_requests": 5.0,
    "bucket_capacity": 1,
    "refill_rate": 0.033
  }
}'
```

### Default Configuration

**Without Redis (In-Memory):**
- 3 req/min per worker
- With 4 workers = 12 req/min total
- Conservative to avoid exceeding API limits

**With Redis (Distributed):**
- 3 req/min globally across all workers
- True coordination - no worker can exceed the limit
- More efficient use of API quota

## Usage

### Automatic Selection

The system automatically selects the appropriate rate limiter:

```python
from app.search.rate_limiter import get_rate_limiter

rate_limiter = get_rate_limiter()  # Returns distributed if Redis enabled, otherwise in-memory
```

### Manual Configuration

```python
from app.search.distributed_rate_limiter import (
    DistributedSearchRateLimiter,
    ProviderRateLimitConfig
)

# Create distributed limiter
limiter = DistributedSearchRateLimiter(
    default_config=ProviderRateLimitConfig(
        max_requests_per_minute=3,
        max_concurrent=2,
        delay_between_requests=3.0
    ),
    redis_url="redis://localhost:6379/0",
    enable_circuit_breaker=True
)
```

## Implementation Details

### Redis Backend

When Redis is enabled, the rate limiter uses Redis keys to coordinate:

```
rate_limit:{provider_name}:minute:{minute_timestamp}  # Per-minute counter
rate_limit:{provider_name}:concurrent                 # Concurrent request counter
```

**Benefits:**
- Atomic operations ensure accurate counting
- Shared state across all workers
- Automatic expiration of old counters

### In-Memory Fallback

If Redis is unavailable, falls back to:
- Token bucket per provider (per-worker)
- Sliding window for per-minute limits
- Thread-safe operations

**Limitations:**
- Each worker has independent limits
- Total capacity = limit × worker_count
- Less efficient but still functional

### Circuit Breaker

**Configuration:**
- Failure threshold: 5 failures → OPEN circuit
- Success threshold: 2 successes → CLOSED circuit
- Timeout: 60 seconds before attempting recovery

**Behavior:**
- OPEN: Rejects requests immediately (reduces API load)
- HALF_OPEN: Allows limited requests to test recovery
- CLOSED: Normal operation

### Provider Name Detection

Fixed provider name detection to ensure correct rate limiting:

```python
# Before: Could return "default"
provider_name = search_provider.get_provider_name() if hasattr(...) else "default"

# After: Better fallback logic
if search_provider and hasattr(search_provider, 'get_provider_name'):
    provider_name = search_provider.get_provider_name()
else:
    # Infer from class name
    provider_name = type(search_provider).__name__.lower()...
```

## Monitoring

### Statistics

```python
stats = rate_limiter.get_stats()

# Returns:
{
    "redis_enabled": true,
    "circuit_breaker_enabled": true,
    "rate_limit_events": {"brave": 3},
    "providers": {
        "brave": {
            "requests_in_window": 2,
            "max_requests_per_minute": 3,
            "current_concurrent": 1,
            "max_concurrent": 2,
            "tokens_available": 0.5,
            "circuit_state": "closed",
            "rate_limit_hits": 3
        }
    }
}
```

### Logging

Enhanced logging shows:
- `🚀 Initialized DISTRIBUTED search rate limiter` - Redis enabled
- `🔧 Initialized search rate limiter (per-worker)` - In-memory fallback
- `✅ Acquired rate limiter slot` - Request allowed
- `⏸️ Rate limit reached` - Request queued
- `🚫 Circuit breaker OPEN` - API unavailable

## Deployment

### Without Redis (Current)

Works out of the box with in-memory fallback:
- No additional infrastructure needed
- Conservative limits (3 req/min per worker)
- Suitable for small deployments

### With Redis (Recommended for Production)

1. **Add Redis to docker-compose.yml:**
```yaml
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    networks:
      - compareintel-network
```

2. **Set environment variables:**
```bash
REDIS_ENABLED=true
REDIS_URL=redis://redis:6379/0
```

3. **Install Redis client:**
```bash
pip install redis>=5.0.0
```

## Benefits

### Performance
- ✅ True distributed coordination across workers
- ✅ More efficient API quota usage
- ✅ Better burst handling with token bucket

### Reliability
- ✅ Circuit breaker prevents cascading failures
- ✅ Graceful degradation if Redis unavailable
- ✅ No single point of failure

### Observability
- ✅ Comprehensive statistics
- ✅ Enhanced logging
- ✅ Circuit breaker state tracking

### Maintainability
- ✅ Clean separation of concerns
- ✅ Easy to configure
- ✅ Well-documented code

## Comparison: Before vs After

### Before (In-Memory Only)
- ❌ 4 workers × 5 req/min = 20 req/min total
- ❌ No coordination between workers
- ❌ Frequent 429 errors
- ❌ No circuit breaker

### After (With Redis)
- ✅ 3 req/min globally (true coordination)
- ✅ All workers share same limit
- ✅ Fewer 429 errors
- ✅ Circuit breaker prevents failures

### After (Without Redis - Fallback)
- ✅ 3 req/min per worker = 12 req/min total
- ✅ More conservative limits
- ✅ Still functional, just less efficient

## Future Enhancements

1. **Adaptive Rate Limiting**: Automatically adjust limits based on API responses
2. **Redis Cluster Support**: For high-availability deployments
3. **Metrics Export**: Prometheus/StatsD integration
4. **Admin Dashboard**: Visual monitoring of rate limits and circuit breakers
5. **Rate Limit Prediction**: ML-based prediction of optimal limits

## Related Documentation

- [Search Rate Limiting Improvements](./SEARCH_RATE_LIMITING_IMPROVEMENTS.md) - Original improvements
- [Adding Search Provider](./ADDING_SEARCH_PROVIDER.md) - How to add providers
- [Backend Optimization](../development/BACKEND_OPTIMIZATION.md) - General optimization

## Files Changed

### New Files
- `backend/app/search/distributed_rate_limiter.py` - Distributed rate limiter implementation

### Modified Files
- `backend/app/search/rate_limiter.py` - Updated to support distributed limiter
- `backend/app/model_runner.py` - Integrated circuit breaker and adaptive rate limiting
- `backend/app/config/settings.py` - Added Redis and circuit breaker configuration
- `backend/requirements.txt` - Added Redis dependency (optional)

## Summary

This implementation provides a production-ready solution for distributed rate limiting that:
- ✅ Solves the multi-worker coordination problem
- ✅ Works with or without Redis
- ✅ Implements industry best practices (token bucket, circuit breaker)
- ✅ Provides comprehensive monitoring and logging
- ✅ Gracefully degrades if Redis unavailable

The system is now ready for production deployment with proper rate limiting coordination across all workers.
