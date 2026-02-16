# Search Rate Limiting

## Overview

CompareIntel uses distributed rate limiting for search API calls across Gunicorn workers. Without Redis, each worker had independent limits; total capacity exceeded provider limits (e.g., Brave Search). The solution uses Redis when available and falls back to in-memory per-worker limiting.

## Architecture

**With Redis:** True global coordination across workers. Token bucket algorithm, circuit breaker.  
**Without Redis:** Per-worker limits, more conservative to avoid 429s.

### Features

- **Token bucket:** Better burst handling than sliding window
- **Circuit breaker:** OPEN (reject) after failures, HALF_OPEN (test recovery), CLOSED (normal)
- **Provider-specific limits:** Brave, Tavily, etc. can have different configs
- **Request deduplication:** Cache identical search results (TTL ~5 min)
- **Retry logic:** Parses Retry-After, exponential backoff with jitter

## Configuration

```bash
REDIS_ENABLED=true
REDIS_URL=redis://localhost:6379/0

SEARCH_RATE_LIMIT_PER_MINUTE=3
SEARCH_MAX_CONCURRENT=2
SEARCH_DELAY_BETWEEN_REQUESTS=3.0
SEARCH_CIRCUIT_BREAKER_ENABLED=true
SEARCH_CACHE_ENABLED=true
SEARCH_CACHE_TTL_SECONDS=300

# Provider-specific (JSON)
SEARCH_PROVIDER_RATE_LIMITS='{"brave":{"max_requests_per_minute":2,"max_concurrent":1}}'
```

## Key Files

- `backend/app/search/distributed_rate_limiter.py` - Redis-backed distributed limiter
- `backend/app/search/rate_limiter.py` - Provider awareness, caching, get_rate_limiter()
- `backend/app/search/retry.py` - Retry-After parsing, backoff

## Monitoring

```python
stats = rate_limiter.get_stats()
# Returns redis_enabled, circuit_breaker_enabled, rate_limit_events, per-provider stats
```
