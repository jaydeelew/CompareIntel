# Credit System

The credit system manages user quotas for AI model comparisons. **Credits are tied to underlying provider cost** (OpenRouter) so expensive models consume more credits than budget models for the same token volume.

## How Credits Work (current behavior)

**Text / chat models**

1. **Primary:** OpenRouter returns **`usage.cost`** (USD charged) on completion. Credits scale as  
   `fractional_credits = USD × CREDITS_PER_DOLLAR` (see `CREDITS_PER_DOLLAR` in `backend/app/config/constants.py`, default 100 credits per $1).
2. **Fallback:** If `cost` is missing, USD is estimated from OpenRouter **list prices** in `backend/openrouter_models.json` (`pricing.prompt` and `pricing.completion` per token) × reported token counts, then converted with `CREDITS_PER_DOLLAR`.
3. **Last resort:** If list pricing is also missing for a model, the legacy **effective-token** formula applies for that model only:  
   `effective_tokens = input + (output × 2.5)`, `credits = effective_tokens ÷ 1000` (logged for follow-up).

**Multi-model compare**

- Fractional credits are summed **across all successful models** in one request.
- The user is charged **whole credits** = `max(1, ceil(total_fractional))` for that request (minimum **1** credit if anything succeeded; **0** if every model failed).

**Image generation**

- Uses OpenRouter `pricing.image` when available: fractional credits = `price × CREDITS_PER_DOLLAR × num_images`.
- Fallback: `IMAGE_CREDITS_PER_GENERATION` per image.
- Same **request-level** rounding as text when combined in one comparison.

**Analytics**

- `UsageLog.actual_cost` stores summed **USD** attributed to the request (API cost, list-price estimate, or implied USD from legacy credits when needed).

On the free tier, image generation is limited by **daily credits** and by **up to 3 image models per comparison**; there is no separate daily cap on how many Compare runs you can start in image mode. See [IMAGE_GENERATION.md](./IMAGE_GENERATION.md#tier-limits).

## Credit Allocations

| Tier | Price | Credits | Period | Model Access |
|------|-------|---------|--------|--------------|
| Anonymous | Free | 50/day | Daily | Free-tier models only |
| Free | Free | 100/day | Daily | Free-tier models only |
| Starter | See `TIER_PRICING` | 720/month | Monthly | All models |
| Starter+ | See `TIER_PRICING` | 1,600/month | Monthly | All models |
| Pro | See `TIER_PRICING` | 3,300/month | Monthly | All models |
| Pro+ | See `TIER_PRICING` | 6,700/month | Monthly | All models |

**Pay-as-you-go overage (paid tiers):** Beyond the monthly pool, usage can continue at **`OVERAGE_USD_PER_CREDIT`** (currently **$0.013** per credit), flat across paid tiers — see `docs/internal/PRICING_SHEET.md`. Overages are **opt-in** each billing period (see [Overage policy](#overage-policy-pay-as-you-go-for-paid-plans) below).

Monthly pool numbers may be **recalibrated** after observing usage under cost-based credits (`UsageLog.actual_cost`).

## Credit Reset Timing

- **Free/Anonymous:** Credits reset daily (user timezone where configured).
- **Paid Tiers:** Intended to align with **Stripe billing period** once webhooks sync `billing_period_*`; until then a 30-day window may apply from allocation.

When the **monthly pool is refilled** (new billing period), **overage settings reset** as well: see [Overage policy](#overage-policy-pay-as-you-go-for-paid-plans).

## Model Access Restrictions

- **Unregistered users:** Only budget/efficient models (lowest cost models)
- **Free tier:** Budget models plus some mid-level models
- **Paid tiers:** All models available without restrictions

## Overage policy (pay-as-you-go for paid plans)

These rules are what the product enforces in code and UI. They are **not** email alerts; reminders appear **in the app** (account menu, comparison warnings, settings).

### Who can use overages

- **Paid subscription tiers only** (Starter, Starter+, Pro, Pro+). Free and anonymous users do not have overage; they hit the daily pool limit only.

### How charges are counted

- Overage is measured in the same **credits** as the monthly pool. Each overage credit is billed at **`OVERAGE_USD_PER_CREDIT`** (USD). The Settings screen shows an approximate **dollar cap ↔ credit cap** conversion as you type.

### Order credits are consumed

For each successful comparison, whole credits are taken in this order:

1. **Monthly pool** (`monthly_credits_allocated` minus `credits_used_this_period`)
2. **Purchased / legacy balance** (`purchased_credits_balance`) — admin or legacy grants, not a user-facing “credit pack” store
3. **Overage** — only if the user turned **Enable overages** on and is within any spending cap

### Spending cap vs unlimited

- **No limit:** After the monthly pool (and any purchased balance) is empty, overage credits accrue until the billing period ends. Consumed overage is reported to Stripe Billing Meters (`backend/app/stripe_metering.py`) so Stripe can add a metered line item to the subscription invoice at period end.
- **Set a spending cap:** The user sets a **maximum dollar amount** for the period; the app converts that to a maximum number of overage credits. Two things enforce the cap:
  1. **Admit check** (`check_credits_sufficient`) — returns **402** before streaming starts when the reserved-credit estimate would push the user past the remaining cap, so obviously oversized prompts never run. When the user is already at the cap they see an in-app error plus an optional quick **extend limit** button.
  2. **Post-stream deduction** (`deduct_credits`) — the cap is a **hard ceiling**. If actual usage ends up higher than the remaining cap (common when the reserved estimate underestimates real model output), only `min(actual, remaining_cap)` is added to `overage_credits_used_this_period` and reported to Stripe. The user is never billed past the dollar amount they configured; the shortfall is absorbed as platform cost.

  Absorbed events are logged at `WARNING` with a greppable `CREDIT_CAP_ABSORBED` prefix and enough fields (`user_id`, `absorbed_credits`, `absorbed_usd`, `requested_credits`, `billed_credits`, `overage_limit_credits`, `overage_spend_limit_cents`, `overage_used_before`, `usage_log_id`) to aggregate per-user abuse or pricing-model drift. The `CreditTransaction` row for a capped run also suffixes its description `[cap: absorbed N credit(s) ~$X.XXXX beyond overage limit]` for per-row audit.

### Automatic reset each billing period

When monthly credits are **allocated** for a new period (`allocate_monthly_credits`):

- **`overage_enabled`** is set back to **off** — the user must opt in again if they want overages in the new period (avoids surprise charges after a reset).
- **`overage_spend_limit_cents`** is cleared (no cap carried over).
- **`overage_credits_used_this_period`** is reset to **0**.

This is intentional product policy: **overage does not “auto-renew”** across periods without an explicit choice.

### In-app indicators (no threshold emails)

- **Settings → Billing & Overages:** Enable/disable, cap vs unlimited, live dollar-to-credits preview, usage this period.
- **Account menu (dropdown):** When you are using overage credits, an **Overage** line shows used amount, optional cap progress, and estimated USD so far. For monthly plans, a **burn-rate** note may appear if current usage suggests the monthly pool will run out before the period ends (with a pointer to enable overages if they are off).
- **Comparison page:** Warning banners for low pool, overage in use, and hitting the overage cap; capped users may see a one-click **extend limit** control that bumps the dollar cap via the same API as Settings.

Streaming **complete** events can include `overage_enabled`, `overage_credits_used_this_period`, and `overage_limit_credits` so the client stays aligned after each run.

`GET /api/credits/balance` is fetched with client-side caching **disabled** (`enableCache: false` in `frontend/src/services/creditService.ts`). The default 5-minute `apiClient` cache would otherwise return stale balances on back-to-back comparisons and freeze the overage counter in the UI while Stripe and the DB keep advancing.

## Credit Flow

1. **Pre-request:** Frontend blocks submission when the user has no credits remaining.
2. **Validation:** Backend estimates required credits (per selected model, list pricing or legacy) and returns **402** if the user cannot afford the estimate **including** allowed overage budget when overages are enabled. It also applies tier rules such as anonymous users not using image generation.
3. **Processing:** Streaming reads `usage.cost` when present; otherwise list pricing or legacy path.
4. **Deduction:** Whole credits are deducted atomically once per successful comparison: **monthly pool → purchased balance → overage** (when enabled). Overage is hard-capped in `deduct_credits`; any shortfall beyond the cap is absorbed and logged as `CREDIT_CAP_ABSORBED` — see [Spending cap vs unlimited](#spending-cap-vs-unlimited).
5. **Recording:** `CreditTransaction` + `UsageLog` with `actual_cost` and token fields.

## Database Fields

**User model:**

- `monthly_credits_allocated` - Subscription credits for current period
- `credits_used_this_period` - Consumption against the monthly allocation
- `purchased_credits_balance` - Purchased balance (legacy / admin; not sold via one-time checkout)
- `overage_enabled` - User opted into pay-as-you-go overage for the current period
- `overage_spend_limit_cents` - Optional cap in USD cents (`NULL` = unlimited overage while enabled)
- `overage_credits_used_this_period` - Overage credits consumed this billing period (resets with monthly allocation)
- `stripe_customer_id`, `stripe_subscription_id` - Billing integration
- `credits_reset_at`, `billing_period_start`, `billing_period_end`

**UsageLog model:**

- `input_tokens`, `output_tokens`, `effective_tokens` (legacy tally for analytics / rare fallback path)
- `credits_used` - Whole credits charged
- `actual_cost` - USD attributed to the request

## API Endpoints

- `GET /api/credits/balance` - Current credit balance (includes `overage_enabled`, `overage_credits_used_this_period`, `overage_limit_credits` for authenticated users when applicable)
- `GET /api/credits/usage` - Usage history
- `GET /api/billing/overage-settings` - Overage preferences and period metadata (paid tiers)
- `PUT /api/billing/overage-settings` - Update overage on/off, unlimited vs capped, and dollar cap (paid tiers)
- `POST /api/billing/create-checkout-session` - Stripe Checkout (when configured)
- `POST /api/billing/webhooks/stripe` - Stripe webhooks (raw body, signature verified)

## Error Codes

- **402 Payment Required** - Insufficient credits (or image gen for anonymous)
- **403 Forbidden** - Model not available for user's tier

## Configuration

- Backend: `backend/app/config/constants.py` (`TIER_PRICING`, `MONTHLY_CREDIT_ALLOCATIONS`, `OVERAGE_USD_PER_CREDIT`)
- Frontend: `frontend/src/config/constants.ts` (mirror the same three)
- Stripe price IDs and secrets: environment variables / `backend/app/config/settings.py`

Keep frontend allocation numbers in sync when changing pools.
