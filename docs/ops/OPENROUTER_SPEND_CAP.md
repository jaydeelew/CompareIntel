# OpenRouter Spend Cap Runbook

**Owner:** Atlas (app-level) / Jack (OpenRouter dashboard backstop)  
**Issue:** #39  
**Status:** App-level enforcement is in the backend. The OpenRouter key-level credit limit is Jack-only.

This runbook covers launch cost protection for OpenRouter. Hosting is not the main cost risk; free-tier compares running many models at once are.

---

## What the app enforces

When `OPENROUTER_DAILY_SPEND_CAP_USD` (and/or the monthly equivalent) is greater than `0`:

1. Every successful compare records OpenRouter USD (`usage.cost`, else list-price estimate, else implied USD from credits) in Redis.
2. **Free and anonymous** compares are rejected with HTTP **429** and the message **"The service is busy right now. Please try again later."** once the cap is reached. `Retry-After` is seconds until the next UTC midnight (daily) or the next month (monthly).
3. **Paid** subscribers (Starter and above) and staff (`admin` / `super_admin`) are **not** blocked by the free cap. Set `OPENROUTER_PAID_DAILY_SPEND_CAP_USD` if they should have their own ceiling.
4. Sentry (and email, if configured) alert once at **50%** and once at **80%** of the free/global cap per day/month.
5. If Redis is down in **production**, enforcement **fails closed** for free compares (paid users still pass unless a paid cap is set).

Caps of `0` disable that budget. Local development uses in-memory counters when Redis is not enabled.

---

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `OPENROUTER_DAILY_SPEND_CAP_USD` | `0` | Free/anonymous daily USD cap |
| `OPENROUTER_MONTHLY_SPEND_CAP_USD` | `0` | Free/anonymous monthly USD cap |
| `OPENROUTER_PAID_DAILY_SPEND_CAP_USD` | `0` | Optional paid-user daily cap (`0` = unlimited) |
| `OPENROUTER_PAID_MONTHLY_SPEND_CAP_USD` | `0` | Optional paid-user monthly cap |
| `OPENROUTER_MAX_OUTPUT_TOKENS` | `8192` | Per-request completion-token ceiling |
| `OPENROUTER_SPEND_FAIL_CLOSED` | `true` | Block free compares when spend cannot be read |
| `OPENROUTER_SPEND_MEMORY_FALLBACK` | `false` | Allow per-worker memory counters in production |
| `SPEND_ALERT_EMAIL` | unset | Alert recipient; falls back to `NEW_USER_NOTIFICATION_EMAIL` |
| `REDIS_ENABLED` / `REDIS_URL` | unset | Required in production for a real global cap |

Suggested launch starting point (tune after watching traffic):

```bash
REDIS_ENABLED=true
REDIS_URL=redis://redis:6379/0
OPENROUTER_DAILY_SPEND_CAP_USD=25
OPENROUTER_MONTHLY_SPEND_CAP_USD=200
OPENROUTER_MAX_OUTPUT_TOKENS=8192
SPEND_ALERT_EMAIL=your-email@example.com
```

Restart the backend after changing these values.

---

## Jack: OpenRouter dashboard backstop

Do **not** spend extra to do this. In the OpenRouter dashboard, set a **key-level credit limit** on the production API key so provider-side 402s stop traffic if the app cap is bypassed (Redis outage with memory fallback, bug, or unpaid overshoot from in-flight requests).

Keep that dashboard limit at or slightly above the app daily/monthly budget. Do not raise it during a launch spike without reviewing Redis spend keys and Sentry alerts.

---

## Redis keys

| Key | TTL | Meaning |
|-----|-----|---------|
| `openrouter:spend:daily:YYYY-MM-DD` | 3 days | Microdollars spent today (UTC) |
| `openrouter:spend:monthly:YYYY-MM` | 40 days | Microdollars spent this month (UTC) |
| `openrouter:spend:alert:{period}:{stamp}:{50\|80}` | same as period | SETNX flag so each threshold emails once |

Inspect:

```bash
docker exec compareintel-redis redis-cli GET openrouter:spend:daily:$(date -u +%F)
# value is microdollars; divide by 1_000_000 for USD
```

---

## Per-user and per-IP limits (existing, from #21)

These sit **in front of** the global spend cap. Credits and models-per-compare are the request/token caps for anonymous and free tiers.

| Audience | Credits | Models per compare | Identity |
|----------|---------|--------------------|----------|
| Anonymous / unregistered | 50 credits/day | 3 | Client IP **and** browser fingerprint (stricter of the two) |
| Registered free | 100 credits/day | 3 | Authenticated user (timezone-local day) |
| Starter / Starter+ | 720 / 1,600 credits/month | 6 | User |
| Pro / Pro+ | 3,300 / 6,700 credits/month | 9 / 12 | User |

Enforcement lives in `backend/app/rate_limiting.py` (Redis when `REDIS_ENABLED=true`, otherwise in-memory per worker). See [RATE_LIMITING.md](../features/RATE_LIMITING.md) and [CREDIT_SYSTEM.md](../features/CREDIT_SYSTEM.md).

---

## OpenRouter 402 / 429

| Provider response | App behavior |
|-------------------|--------------|
| 402 mentioning `max_tokens` | Retry once with a lower completion cap; otherwise tell the user to shorten the prompt |
| 402 payment / insufficient credits | Do not retry. Stream: "This model is temporarily unavailable. Please try again later." (dashboard key limit or empty credits) |
| 429 | Do not retry. Stream: "The model is busy right now. Please try again in a moment." Honor `Retry-After` when present |

---

## Alerts

- **Sentry:** warning at 50%, error at 80% (`capture_message`).
- **Email:** same thresholds, once per period, if `SPEND_ALERT_EMAIL` or `NEW_USER_NOTIFICATION_EMAIL` is set and SMTP is configured.

If alerts fire, check Redis spend keys, recent compare volume in admin analytics, and the OpenRouter dashboard usage. Do not disable `OPENROUTER_SPEND_FAIL_CLOSED` to "keep the site up" during a free-tier spike.

---

## Rollback

Set the cap env vars back to `0` and restart the backend to disable app-level blocking. The OpenRouter dashboard credit limit remains the last line of defense — leave it in place.
