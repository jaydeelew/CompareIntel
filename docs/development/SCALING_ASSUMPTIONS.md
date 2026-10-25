# Scaling Assumptions

Load, concurrency, and retention expectations for CompareIntel infrastructure and capacity planning.

---

## Load Expectations

| Dimension | Assumption | Notes |
|-----------|------------|-------|
| **Concurrent users** | ~50–100 active | low-to-mid traffic; single-region deployment |
| **Comparisons per minute** | ~10–30 | credit limits and model latency constrain volume |
| **Non-streaming API calls** | ~50–200 req/min | auth, credit status, model list, history |
| **Peak factor** | ~2–3× average | plan for short spikes |

### Constraints

- **Credit limits** throttle usage per user (e.g. 50/day anonymous, 100/day free).
- **OpenRouter** is the primary external bottleneck; model latency dominates comparison duration.
- **Nginx proxy** timeouts: 660s read/send for SSE (extended mode up to 10 min).

---

## Concurrency Expectations

| Component | Current Setting | Notes |
|-----------|-----------------|-------|
| **Gunicorn workers** | 4 | `entrypoint.sh`; one process per worker |
| **SSE connections per worker** | Many | async; each comparison holds one long-lived connection |
| **Models per comparison** | 3–12 (tier-dependent) | run in parallel via `ThreadPoolExecutor` |
| **ThreadPoolExecutor** | `max(len(models), 1)` | one thread per model per comparison |
| **DB connections** | Per-request session | SQLAlchemy `SessionLocal`; no explicit pool sizing in app |

### Bottlenecks

1. **OpenRouter API** — parallel model calls; rate limits and latency are external.
2. **Search API** — 3 req/min per worker (or global if Redis); Brave/Tavily limits.
3. **Database** — PostgreSQL connection pool sized by SQLAlchemy defaults.
4. **Anonymous rate limit storage** — Redis-backed when enabled; falls back to in-memory per-worker when Redis unavailable.

---

## Retention Expectations

| Data | Retention | Notes |
|------|-----------|-------|
| **UsageLog (detail)** | 90 days | see `DATA_RETENTION_IMPLEMENTATION.md` |
| **UsageLog (aggregates)** | Indefinite | monthly summaries in `usage_log_monthly_aggregates` |
| **Conversations** | Never deleted | user-owned; tier-based limits on count displayed/stored |
| **Conversation messages** | Never deleted | cascade with conversation |
| **Redis** | Ephemeral | rate limit state; 256MB max, `allkeys-lru` |

### Per-Tier Conversation Limits

| Tier | Conversations |
|------|---------------|
| Unregistered | 2 |
| Free | 3 |
| Starter | 10 |
| Starter+ | 20 |
| Pro | 40 |
| Pro+ | 80 |

---

## Storage Growth

- **UsageLog:** ~1 KB/entry; ~90 MB for 90 days at ~1K entries/day.
- **Monthly aggregates:** ~0.5 KB/month; negligible long-term.
- **Conversations:** Variable; text-heavy; grows with users and retention.

---

## Scaling Considerations

1. **Horizontal scaling** — Add Gunicorn workers or run multiple backend replicas behind a load balancer. Redis is now used for distributed anonymous rate limiting and shared caching to maintain consistency across workers/replicas.
2. **Database** — Tune connection pool; run data retention job monthly (see `DATA_RETENTION_IMPLEMENTATION.md`).
3. **Redis** — Enable for production; coordinates search rate limits AND anonymous user rate limits across workers. Also provides shared cache for AppSettings, models, and user data. See Redis section below.
4. **OpenRouter** — No control; design for graceful degradation when external API is slow or rate-limited.

---

## Redis for Stateless Scaling

**Added:** Redis support for distributed state management enables true horizontal scaling.

### What Uses Redis

1. **Anonymous rate limiting** (`app/rate_limiting.py`)
   - Daily credit limits for unregistered users
   - Atomic operations via Lua scripts prevent race conditions
   - Keys: `rate_limit:anon:{identifier}` with 48-hour TTL
   - Fallback: In-memory `defaultdict` when Redis unavailable

2. **Shared cache** (`app/cache.py`)
   - AppSettings (5-minute TTL)
   - Model lists (1-hour TTL, mtime-aware)
   - User data (1-minute TTL)
   - Keys: `cache:{key}` with configurable TTLs
   - Fallback: In-memory dict when Redis unavailable

3. **Search rate limiting** (`app/search/distributed_rate_limiter.py`)
   - Already implemented; now joined by anonymous rate limiting

### Configuration

Set in `.env`:
```bash
REDIS_URL=redis://localhost:6379/0
REDIS_ENABLED=true
```

When unset or Redis unreachable, backend gracefully falls back to in-memory storage.
Dev/test environments work without Redis; production should enable it for consistency.

### Memory Footprint

- **Anonymous rate limits:** ~200 bytes/user × active users (48h retention)
- **Cache entries:** ~1–10 KB each (AppSettings, models, user records)
- **Expected total:** <10 MB for typical load (hundreds of active users/day)
- **Redis configured:** 256 MB max with `allkeys-lru` eviction (see `docker-compose.prod.yml`)

### Rollout Notes

- **Backward compatible:** Enabling Redis requires no code changes; backend detects and uses it
- **No breaking changes:** Fallback ensures dev/test work without Redis
- **Atomic operations:** Lua scripts prevent credit race conditions across workers
- **Observability:** Logs indicate Redis vs. in-memory mode at startup

---

## Related Docs

- [ARCHITECTURE.md](../ARCHITECTURE.md) — Data flow, components
- [DATA_RETENTION_IMPLEMENTATION.md](../features/DATA_RETENTION_IMPLEMENTATION.md) — UsageLog cleanup
- [REDIS_DEPLOYMENT.md](../deployment/REDIS_DEPLOYMENT.md) — Distributed rate limiting
