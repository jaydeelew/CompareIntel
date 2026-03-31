# Internal pricing sheet (draft)

This note supports Phase 2 of the billing roadmap: align **list-price COGS**, **payment processing**, and a **thin margin** before locking Stripe Price IDs and public marketing copy.

## Sources

- **OpenRouter list prices:** `backend/openrouter_models.json` fields `pricing.prompt`, `pricing.completion`, `pricing.image` (USD per token or per image as documented by OpenRouter).
- **Refresh cadence:** Re-run model list export or OpenRouter models API before changing `TIER_PRICING` or pools.
- **Actual spend:** After production fills `UsageLog.actual_cost`, recompute p50/p90 **USD per comparison** and **USD per credit** by tier and model mix.

## Constants (code)

| Constant | Location | Role |
|----------|----------|------|
| `CREDITS_PER_DOLLAR` | `backend/app/config/constants.py` | USD → fractional credits |
| `MONTHLY_CREDIT_ALLOCATIONS` | same | Tier monthly pools |
| `TIER_PRICING` | same | Illustrative monthly USD (must match Stripe) |
| `OVERAGE_PRICE_PER_1000_CREDITS` | same | Anchor for packs / overage; avoid arbitrage vs subscription |

Frontend **`TIER_PRICING`** and **`OVERAGE_PRICE_PER_1000_CREDITS`** in `frontend/src/config/constants.ts` should match backend for UI/FAQ consistency.

## Synthetic scenarios (fill in before launch)

For each paid tier, estimate monthly OpenRouter COGS under:

1. **Budget mix** — mostly low list-price models.
2. **Typical mix** — aligned with expected product usage.
3. **Stress mix** — heavy frontier models and high multi-model compares (see `MODEL_LIMITS`).

**Margin rule (illustrative):**  
`monthly_price ≥ COGS_conservative + Stripe_fees + small_buffer`  
Document which scenario sets the floor (e.g. p75–p90 of plausible mixes).

## Post-launch refinement

Once `UsageLog.actual_cost` is reliable:

- Recompute **$/credit** and **$/comparison** by tier.
- Adjust `TIER_PRICING`, pools, or `CREDITS_PER_DOLLAR` if reality diverges from synthetic scenarios.

**Counsel review:** Final consumer-facing prices, tax, and refund policy belong in legal/comms sign-off, not only in this engineering note.
