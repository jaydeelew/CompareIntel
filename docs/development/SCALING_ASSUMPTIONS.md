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
| **Gunicorn workers** | 2 (configurable via `WEB_CONCURRENCY` or `GUNICORN_WORKERS`) | `entrypoint.sh`; production compose default is 2 on the 2 GB host |
| **SSE connections per worker** | Many | async; each comparison holds one long-lived connection |
| **Models per comparison** | 3–12 (tier-dependent) | run in parallel via `ThreadPoolExecutor` |
| **ThreadPoolExecutor** | `max(len(models), 1)` | one thread per model per comparison |
| **DB connections (PostgreSQL)** | Configurable pool | See "Database Connection Pooling" below |

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
| **Redis** | Ephemeral | rate limit + cache; 64MB max, `volatile-lru` |

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

## Database Connection Pooling

### PostgreSQL Production Configuration

SQLAlchemy connection pooling is configured via environment variables to prevent connection exhaustion on free/small-tier Postgres instances.

**Connection Limit Formula:**

```
workers × (pool_size + max_overflow) × replicas ≤ database connection limit
```

### Default Settings (Free-Tier Safe)

| Setting | Default | Environment Variable | Description |
|---------|---------|----------------------|-------------|
| **Pool size** | 5 | `DB_POOL_SIZE` | Persistent connections per worker |
| **Max overflow** | 10 | `DB_MAX_OVERFLOW` | Additional connections allowed beyond pool_size |
| **Pool timeout** | 30s | `DB_POOL_TIMEOUT` | Wait time for available connection |
| **Pool recycle** | 3600s | `DB_POOL_RECYCLE` | Recycle connections after 1 hour |
| **Pool pre-ping** | true | `DB_POOL_PRE_PING` | Verify connections before use |

**Total connections with defaults:**
- 2 workers × (5 + 10) = **30 connections** per replica
- Safe for free-tier Postgres (typically 20-100 connection limit)

### Scaling Examples

**Small production instance (100-200 connections):**
```bash
DB_POOL_SIZE=10
DB_MAX_OVERFLOW=15
WEB_CONCURRENCY=4
# Total: 4 × (10 + 15) = 100 connections
```

**Large production instance (200+ connections):**
```bash
DB_POOL_SIZE=15
DB_MAX_OVERFLOW=20
WEB_CONCURRENCY=6
# Total: 6 × (15 + 20) = 210 connections
```

**Multi-replica deployment (3 replicas, 200 connection limit):**
```bash
DB_POOL_SIZE=5
DB_MAX_OVERFLOW=5
WEB_CONCURRENCY=6
# Total per replica: 6 × (5 + 5) = 60 connections
# Total across replicas: 60 × 3 = 180 connections
```

### SQLite Development

SQLite uses `NullPool` (no connection pooling) to avoid locking issues. Pool settings are ignored for SQLite.

---

## When a 4 GB instance is worth it

Stay on the current 2 GB box while worker, memory-limit, and log-cap fixes hold. Propose upgrading to 4 GB (Jack's call) when any of these happen after those fixes land:

- Available memory sits below 15%, or swap stays above 50%, for most of a typical day across a week.
- Stalls or OOM kills come back with 2 workers, so traffic would need more workers than memory allows.
- Sustained concurrency goes past what 2 workers handle, meaning requests queue or latency at the 95th percentile climbs at peak.

Trimming memory (worker count, cache sizes, image pruning) is the first step; the upgrade is the fallback once real usage outgrows those. Compare the monthly cost delta against current usage in the monthly capacity report before proposing it.

### Host metrics Pulse can poll

`GET /internal/metrics/host` (Bearer `METRICS_TOKEN`; returns 404 when the token is unset, 401 when it is wrong). Not in public API docs. Cheap `/proc` + `statvfs` snapshot, safe to poll about once a minute.

Production nginx (`nginx/nginx.ssl.conf` via `docker-compose.ssl.yml`, and `nginx/nginx.prod.conf`) exact-match proxies **only** this path to the backend. Other `/internal/*` paths are not proxied. Nginx does not authenticate; the backend token check is the only auth. Header: `Authorization: Bearer <token>` (same as the FastAPI `Header()` on that route).

```bash
# Valid token → JSON snapshot (memory/swap/disk/load/oom).
curl -H "Authorization: Bearer $METRICS_TOKEN" https://compareintel.com/internal/metrics/host

# Missing or wrong token → 401, never metrics data.
curl -i https://compareintel.com/internal/metrics/host
```

Thresholds encoded on the response as `ok` / `warn` / `critical` per metric:

| Signal | Warn | Critical |
|--------|------|----------|
| Memory | available < 15%, or swap used > 50% | available < 5%, swap used > 80%, or `oom_kill` from `/proc/vmstat` has increased from 0 |
| Disk (`/` and the Docker data dir if it is a distinct volume) | used > 80% | used > 90% |

---

## Scaling Considerations

1. **Horizontal scaling** — Add Gunicorn workers (`WEB_CONCURRENCY`) or run multiple backend replicas behind a load balancer. When scaling workers or replicas, adjust database pool settings to stay under the connection limit. Redis is used for distributed anonymous rate limiting and shared caching to maintain consistency across workers/replicas.
2. **Database** — Tune connection pool settings based on your Postgres instance's connection limit and replica count. Monitor connection usage with `SELECT count(*) FROM pg_stat_activity;`. Run data retention job monthly (see `DATA_RETENTION_IMPLEMENTATION.md`).
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
- **Redis configured:** 64 MB max with `volatile-lru` eviction (see `docker-compose.prod.yml` / `docker-compose.ssl.yml`). Cache and rate-limit keys have TTLs so they can be evicted; concurrent-slot counters have no TTL and are preserved.

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
- [backup-rollback.md](../runbooks/backup-rollback.md) — Database backups and rollback procedures
