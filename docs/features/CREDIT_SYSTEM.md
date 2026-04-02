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

**Overage (planned / list rate):** `OVERAGE_USD_PER_CREDIT` (**$0.013** per credit beyond the monthly pool), flat across paid tiers — see `docs/internal/PRICING_SHEET.md`.

Monthly pool numbers may be **recalibrated** after observing usage under cost-based credits (`UsageLog.actual_cost`).

## Credit Reset Timing

- **Free/Anonymous:** Credits reset daily (user timezone where configured).
- **Paid Tiers:** Intended to align with **Stripe billing period** once webhooks sync `billing_period_*`; until then a 30-day window may apply from allocation.

## Model Access Restrictions

- **Unregistered users:** Only budget/efficient models (lowest cost models)
- **Free tier:** Budget models plus some mid-level models
- **Paid tiers:** All models available without restrictions

## Credit Flow

1. **Pre-request:** Frontend blocks submission when the user has no credits remaining.
2. **Validation:** Backend estimates required credits (per selected model, list pricing or legacy) and returns **402** if the user cannot afford the estimate. It also applies tier rules such as anonymous users not using image generation.
3. **Processing:** Streaming reads `usage.cost` when present; otherwise list pricing or legacy path.
4. **Deduction:** Whole credits are deducted atomically once per successful comparison; any **purchased** balance on the user is used after the monthly pool is exhausted, then metered overage when integrated.
5. **Recording:** `CreditTransaction` + `UsageLog` with `actual_cost` and token fields.

## Database Fields

**User model:**

- `monthly_credits_allocated` - Subscription credits for current period
- `credits_used_this_period` - Consumption against the monthly allocation
- `purchased_credits_balance` - Purchased balance (legacy / admin; not sold via one-time checkout)
- `stripe_customer_id`, `stripe_subscription_id` - Billing integration
- `credits_reset_at`, `billing_period_start`, `billing_period_end`

**UsageLog model:**

- `input_tokens`, `output_tokens`, `effective_tokens` (legacy tally for analytics / rare fallback path)
- `credits_used` - Whole credits charged
- `actual_cost` - USD attributed to the request

## API Endpoints

- `GET /api/credits/balance` - Current credit balance
- `GET /api/credits/usage` - Usage history
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
