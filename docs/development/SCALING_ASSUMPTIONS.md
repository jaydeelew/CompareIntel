# Scaling Assumptions

**Purpose:** Document load, concurrency, and retention expectations for CompareIntel. Use this when planning infrastructure, capacity, or future scaling work.

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

## Scaling Considerations

1. **Horizontal scaling** — Add Gunicorn workers or run multiple backend replicas behind a load balancer. Use Redis for distributed rate limiting.
2. **Database** — Tune connection pool; run data retention job monthly (see `DATA_RETENTION_IMPLEMENTATION.md`).
3. **Redis** — Enable for production; coordinates search rate limits across workers.
4. **OpenRouter** — No control; design for graceful degradation when external API is slow or rate-limited.

---

## Related Docs

- [ARCHITECTURE.md](../ARCHITECTURE.md) — Data flow, components
- [DATA_RETENTION_IMPLEMENTATION.md](../features/DATA_RETENTION_IMPLEMENTATION.md) — UsageLog cleanup
- [REDIS_DEPLOYMENT.md](../deployment/REDIS_DEPLOYMENT.md) — Distributed rate limiting
