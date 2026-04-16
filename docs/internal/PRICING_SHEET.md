# Internal pricing sheet

## Snapshot: 2026-04-01

**Source of list prices:** [OpenRouter `/api/v1/models`](https://openrouter.ai/api/v1/models) (full JSON dump, same fields as `pricing.prompt`, `pricing.completion`, `pricing.image` in the bundled `openrouter_models.json` format).

**CompareIntel catalog:** `backend/data/models_registry.json` (all models shown to paid tiers).

**Match rate:** 91 of 102 registry model IDs found in the OpenRouter API response. **11 IDs missing** (not in API response at snapshot time — confirm before relying on billing for these):

- `black-forest-labs/flux.2-max`
- `black-forest-labs/flux.2-pro`
- `black-forest-labs/flux.2-flex`
- `black-forest-labs/flux.2-klein-4b`
- `bytedance-seed/seedream-4.5`
- `sourceful/riverflow-v2-max-preview`
- `sourceful/riverflow-v2-standard-preview`
- `sourceful/riverflow-v2-fast-preview`
- `sourceful/riverflow-v2-fast`
- `sourceful/riverflow-v2-pro`
- `x-ai/grok-5`

To refresh this sheet, pull a fresh OpenRouter `/api/v1/models` JSON snapshot and re-check the registry IDs and pricing totals against `backend/data/models_registry.json`.

---

## How credits map to COGS

- `CREDITS_PER_DOLLAR = 100` → one whole credit ≈ **$0.01** of OpenRouter-reported usage when pricing comes from list/API USD (see `comparison_stream` / `tokens.py`).
- If a subscriber **fully exhausts** their monthly pool, **maximum** provider cost ≈ **`MONTHLY_CREDIT_ALLOCATIONS[tier] / 100` USD**.

| Tier         | Monthly credits | Max wholesale USD (pool burn) |
| ------------ | --------------- | ----------------------------- |
| starter      | 720             | $7.20                         |
| starter_plus | 1,600           | $16.00                        |
| pro          | 3,300           | $33.00                        |
| pro_plus     | 6,700           | $67.00                        |

This is the **binding worst case** for subscription economics (ignoring rounding). Typical users will spend less; refine with `UsageLog.actual_cost` percentiles after launch.

---

## Stress spot-check (text-only, list prices)

Assumption: one comparison with **4k input / 8k output tokens per model**, using the **most expensive** text models (by that slice), in parallel:

| Parallel models | Approx. OpenRouter USD | Approx. credits |
| --------------- | ---------------------- | --------------- |
| 6               | ~$4.75                 | ~475            |
| 9               | ~$5.14                 | ~514            |
| 12              | ~$5.54                 | ~554            |

**Highest single-model** (same token slice) examples from the snapshot: `openai/gpt-5.4-pro` ~$1.56/compare; frontier Anthropic/OpenAI mixes ~$0.12–$0.66/compare.

**Image generation**

- Many catalog image models use **token** fields only; OpenRouter’s `pricing.image` is often **near zero** in the API for some Google Gemini entries — real bill may still appear in stream usage; trust **`UsageLog.actual_cost`** for calibration.
- When no positive `pricing.image` is present, the app falls back to **`IMAGE_CREDITS_PER_GENERATION`** (5 credits/image) for charging, which may **over- or under-** reflect true USD until stream costs are verified.

---

## Subscription list prices (thin margin vs. full pool burn)

**Goal:** Subscription **net** after payment processing exceeds **max pool COGS** with a small buffer (“thin margin”).

Approximate **US card** Stripe formula used for planning:  
`net ≈ price × (1 − 0.029) − 0.30` per successful monthly charge.

**Implemented `TIER_PRICING` and `MONTHLY_CREDIT_ALLOCATIONS`:** pools and prices are chosen so **pool $/credit strictly decreases** at higher tiers and each tier clears roughly **net ≥ COGS × 1.10** at full burn (verify after Stripe fee changes).

| Tier         | Monthly price | Credits | Implied $/credit (pool) | COGS (pool burn) |
| ------------ | ------------- | ------- | ----------------------- | ---------------- |
| starter      | **$9**        | 720     | **$0.01250**            | $7.20            |
| starter_plus | **$19**       | 1,600   | **$0.01188**            | $16.00           |
| pro          | **$39**       | 3,300   | **$0.01182**            | $33.00           |
| pro_plus     | **$79**       | 6,700   | **$0.01179**            | $67.00           |

**Code:** `backend/app/config/constants.py` and `frontend/src/config/constants.ts`.

**Caveats**

- International cards, disputes, and tax are not modeled.
- If average utilization ≪ 100% of pool, you may later **adjust** prices or pools using `UsageLog.actual_cost` data.
- **Stripe Product prices** must be created to match these amounts (or constants updated to match what you ship).

---

## Overage (flat USD per credit)

**Implemented:** `OVERAGE_USD_PER_CREDIT = 0.013` (**$0.013** per credit beyond the monthly pool), same for all paid tiers. Rationale:

- **Above** every tier’s implied pool $/credit (highest pool rate is Starter **$0.01250**/credit).
- **Above** wholesale **~$0.01**/credit at `CREDITS_PER_DOLLAR = 100` with a modest premium for marginal usage and processing.

**Stripe metered billing is active.** `deduct_credits` reports consumed overage credits to Stripe via `backend/app/stripe_metering.py` (Billing Meter Events). The metered overage Price (`STRIPE_PRICE_OVERAGE`) is auto-attached to subscriptions during checkout (`_ensure_overage_subscription_item`). Stripe invoices the customer at period end. See `docs/ops/STRIPE_WEBHOOK_RUNBOOK.md` for env setup and operational details.

`SUBSCRIPTION_CONFIG[*].overage_price` is set to **0.013** for paid tiers for API consistency (`extended_overage_price` remains unused / `None`).

---

## Constants (code)

| Constant                     | Location                          |
| ---------------------------- | --------------------------------- |
| `CREDITS_PER_DOLLAR`         | `backend/app/config/constants.py` |
| `MONTHLY_CREDIT_ALLOCATIONS` | same                              |
| `TIER_PRICING`               | same + frontend mirror            |
| `OVERAGE_USD_PER_CREDIT`     | same + frontend mirror            |

---

## Post-launch

1. Query **`UsageLog.actual_cost`** (and aggregates per tier / model_id): p50 / p90 **USD per comparison** and **$/credit**.
2. Adjust **`TIER_PRICING`**, **`MONTHLY_CREDIT_ALLOCATIONS`**, **`OVERAGE_USD_PER_CREDIT`**, or **`CREDITS_PER_DOLLAR`** if reality diverges from list-price worst case.
3. When shipping metered overage, map **`OVERAGE_USD_PER_CREDIT`** to Stripe metered Prices and reporting.
4. Refresh OpenRouter pricing JSON periodically; new registry models must exist in OpenRouter (or have manual COGS estimates).

**Counsel / tax / refunds:** Final consumer-facing amounts and policies need legal/comms sign-off, not only this engineering note.
