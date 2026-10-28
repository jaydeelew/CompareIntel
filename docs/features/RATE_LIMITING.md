# Rate Limiting and Launch Caps

CompareIntel limits two different kinds of traffic:

1. **User compares** (OpenRouter spend) — credits, models-per-compare, IP/fingerprint identity, and the global spend cap.
2. **Search API calls** (Brave/Tavily) — Redis token-bucket limiter so Gunicorn workers do not stampede the search provider.

This page is the reviewed source of truth for anonymous/free-tier compare limits (issue #39, building on #21). Spend-cap operations live in [OPENROUTER_SPEND_CAP.md](../ops/OPENROUTER_SPEND_CAP.md).

---

## Compare limits (per user / per IP)

Usage is **credit-based**. There is no separate daily “number of Compare clicks” counter: a compare that uses more models or more expensive models burns more credits. Output length is also capped per request (`OPENROUTER_MAX_OUTPUT_TOKENS`, default 8192).

### Anonymous / unregistered

| Limit | Value | How it is keyed |
|-------|--------|-----------------|
| Daily credits | 50 | Resets on the client timezone day |
| Models per compare | 3 (`ANONYMOUS_MODEL_LIMIT`) | Request body |
| Identity | Client IP **and** browser fingerprint | `ip:{addr}` and `fp:{fingerprint}` in Redis (`rate_limit:anon:…`); the stricter of the two wins |
| Global OpenRouter USD | `OPENROUTER_DAILY_SPEND_CAP_USD` | Shared across all free/anonymous traffic |

Anonymous image generation that needs registered-only models is rejected with HTTP 402 (sign-up wall). Registered free users may use image models within daily credits and the 3-model cap.

### Registered free

| Limit | Value | How it is keyed |
|-------|--------|-----------------|
| Daily credits | 100 | User row; timezone-local day |
| Models per compare | 3 | Same as anonymous |
| Identity | Authenticated user id | Database, not IP |
| Global OpenRouter USD | same free/global cap | Redis spend keys |

Free users cannot enable metered overage.

### Paid tiers

Paid users keep their monthly credit pools and models-per-compare (6 / 6 / 9 / 12). They are **not** blocked by the free OpenRouter spend cap unless `OPENROUTER_PAID_*_SPEND_CAP_USD` is set.

Credit tables: [CREDIT_SYSTEM.md](./CREDIT_SYSTEM.md). Constants: `backend/app/config/constants.py`.

### Redis vs in-memory (#21)

Anonymous credit counters use Redis when `REDIS_ENABLED=true` so all Gunicorn workers share one budget. If Redis is down, the app falls back to per-worker memory for **credits**. The **spend cap** does the opposite in production: it fails closed for free compares so a Redis outage cannot unbounded-spend.

---

## Search Rate Limiting

CompareIntel uses distributed rate limiting for search API calls across Gunicorn workers. Without Redis, each worker had independent limits; total capacity exceeded provider limits (e.g., Brave Search). The solution uses Redis when available and falls back to in-memory per-worker limiting.

### Architecture

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

- `backend/app/rate_limiting.py` — anonymous IP/fingerprint credits, paid/free user credits
- `backend/app/spend_cap.py` — global OpenRouter USD cap
- `backend/app/search/distributed_rate_limiter.py` — Redis-backed distributed limiter
- `backend/app/search/rate_limiter.py` — Provider awareness, caching, get_rate_limiter()
- `backend/app/search/retry.py` — Retry-After parsing, backoff

## Monitoring

```python
stats = rate_limiter.get_stats()
# Returns redis_enabled, circuit_breaker_enabled, rate_limit_events, per-provider stats
```
