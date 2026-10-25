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
| **Gunicorn workers** | 4 (configurable via `GUNICORN_WORKERS`) | `entrypoint.sh`; one process per worker |
| **SSE connections per worker** | Many | async; each comparison holds one long-lived connection |
| **Models per comparison** | 3–12 (tier-dependent) | run in parallel via `ThreadPoolExecutor` |
| **ThreadPoolExecutor** | `max(len(models), 1)` | one thread per model per comparison |
| **DB connections (PostgreSQL)** | Configurable pool | See "Database Connection Pooling" below |

### Bottlenecks

1. **OpenRouter API** — parallel model calls; rate limits and latency are external.
2. **Search API** — 3 req/min per worker (or global if Redis); Brave/Tavily limits.
3. **Database** — PostgreSQL connection pool sized by SQLAlchemy defaults.
4. **Anonymous rate limit storage** — in-memory `defaultdict`; not shared across workers (use Redis for multi-worker consistency).

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
- 4 workers × (5 + 10) = **60 connections** per replica
- Safe for free-tier Postgres (typically 20-100 connection limit)

### Scaling Examples

**Small production instance (100-200 connections):**
```bash
DB_POOL_SIZE=10
DB_MAX_OVERFLOW=15
GUNICORN_WORKERS=4
# Total: 4 × (10 + 15) = 100 connections
```

**Large production instance (200+ connections):**
```bash
DB_POOL_SIZE=15
DB_MAX_OVERFLOW=20
GUNICORN_WORKERS=6
# Total: 6 × (15 + 20) = 210 connections
```

**Multi-replica deployment (3 replicas, 200 connection limit):**
```bash
DB_POOL_SIZE=5
DB_MAX_OVERFLOW=5
GUNICORN_WORKERS=6
# Total per replica: 6 × (5 + 5) = 60 connections
# Total across replicas: 60 × 3 = 180 connections
```

### SQLite Development

SQLite uses `NullPool` (no connection pooling) to avoid locking issues. Pool settings are ignored for SQLite.

---

## Scaling Considerations

1. **Horizontal scaling** — Add Gunicorn workers (`GUNICORN_WORKERS`) or run multiple backend replicas behind a load balancer. When scaling workers or replicas, adjust pool settings to stay under the database connection limit. Use Redis for distributed rate limiting.
2. **Database** — Tune connection pool settings based on your Postgres instance's connection limit and replica count. Monitor connection usage with `SELECT count(*) FROM pg_stat_activity;`. Run data retention job monthly (see `DATA_RETENTION_IMPLEMENTATION.md`).
3. **Redis** — Enable for production; coordinates search rate limits across workers.
4. **OpenRouter** — No control; design for graceful degradation when external API is slow or rate-limited.

---

## Related Docs

- [ARCHITECTURE.md](../ARCHITECTURE.md) — Data flow, components
- [DATA_RETENTION_IMPLEMENTATION.md](../features/DATA_RETENTION_IMPLEMENTATION.md) — UsageLog cleanup
- [REDIS_DEPLOYMENT.md](../deployment/REDIS_DEPLOYMENT.md) — Distributed rate limiting
