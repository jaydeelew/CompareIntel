# Admin operations vs Stripe billing

## When Stripe owns the subscription

If the user has completed Checkout:

- **`stripe_customer_id`** and usually **`stripe_subscription_id`** are set by webhooks.
- **Tier and billing period** should follow Stripe (`invoice.paid`, `customer.subscription.updated`). Avoid manually editing `billing_period_*` unless correcting a bad state.
- **Monthly credit pool** is refilled on successful `invoice.paid` via `allocate_monthly_credits` (pool reset only; period dates come from the subscription object).

## Manual tier overrides (admin UI / API)

- Admin changes to `subscription_tier` affect **catalog access** and **allocation tier** on next `allocate_monthly_credits` / `ensure_credits_allocated`.
- If you set a paid tier **without** Stripe, the user has **no** `stripe_subscription_id`: the app uses the **30-day** billing window from `allocate_monthly_credits` and local `credits_reset_at`.
- For comped or internal accounts, prefer a clear process: either leave Stripe fields empty (manual cycle) or create a complimentary Stripe subscription so periods stay consistent.

## Conflicts

- **Stripe active** + **admin tier** mismatch: next webhook may overwrite tier from subscription metadata. Align Stripe Product/Price metadata `tier` with the intended CompareIntel tier.
- For detailed webhook behavior see `docs/ops/STRIPE_WEBHOOK_RUNBOOK.md`.
- For **test/sandbox setup** (prices, portal, `stripe listen`, manual E2E checklist), see **“Stripe test / sandbox checklist”** in that runbook.
