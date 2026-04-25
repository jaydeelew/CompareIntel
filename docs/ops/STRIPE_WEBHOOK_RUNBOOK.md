# Stripe webhooks — operations runbook

## Environment variables

| Variable | Purpose |
|----------|---------|
| `STRIPE_SECRET_KEY` | Server-side API secret |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for `POST /api/billing/webhooks/stripe` |
| `STRIPE_PRICE_STARTER` / `STRIPE_PRICE_STARTER_PLUS` / `STRIPE_PRICE_PRO` / `STRIPE_PRICE_PRO_PLUS` | Subscription Price IDs (amounts must match `TIER_PRICING` in `backend/app/config/constants.py`) |
| `STRIPE_OVERAGE_METER_ID` / `STRIPE_OVERAGE_PRODUCT_ID` / `STRIPE_PRICE_OVERAGE` | Optional metered overage (per credit) — configure in Stripe when using usage-based billing beyond the monthly pool |
| `FRONTEND_URL` | Success/cancel/portal return URLs |

Pydantic loads these from the environment (see `backend/app/config/settings.py`).

## Endpoint

- **URL:** `{API_ORIGIN}/api/billing/webhooks/stripe` (also mirrored under `/api/v1/...` if routed the same).
- **Events to send (minimum):** `checkout.session.completed`, `invoice.paid`, `customer.subscription.updated`, `customer.subscription.deleted`.

## Idempotency

Processed event IDs are stored in **`processed_stripe_webhooks`** (`ProcessedStripeWebhook` model). Duplicate deliveries with the same `event.id` return `200` without re-running handlers.

## Business logic (summary)

| Event | Effect |
|-------|--------|
| `checkout.session.completed` | Sets `stripe_customer_id`; subscriptions load Subscription and `_apply_subscription_fields`; then cancels any other active/trialing subscriptions on that customer so tier switches do not leave duplicates. |
| `invoice.paid` | Syncs subscription period; `allocate_monthly_credits` refills the monthly pool (does **not** overwrite Stripe period dates when `stripe_subscription_id` is set). |
| `customer.subscription.updated` | Tier + period sync. |
| `customer.subscription.deleted` | Marks cancelled; clears `stripe_subscription_id`. |

## Local testing (Stripe CLI)

Use **test mode** keys (`sk_test_...`) and test Price IDs in `backend/.env`.

### 1. Install the Stripe CLI

- **macOS (Homebrew):** `brew install stripe/stripe-cli/stripe`
- **Linux:** see [Stripe CLI install](https://stripe.com/docs/stripe-cli#install) (apt, yum, or download tarball)
- **Windows:** `scoop install stripe` or use the installer from Stripe’s docs

Verify: `stripe --version`

### 2. Authenticate the CLI

Pick **one** of the following (both must use the **same** Stripe account as your test Price IDs in `backend/.env`).

**A. `stripe login` (browser)**

```bash
stripe login
```

Opens a browser to confirm; the CLI stores credentials on that machine.

**B. Test secret key (no browser)**

Use your Dashboard **test** secret key (`sk_test_...`) — the same value as **`STRIPE_SECRET_KEY`** in `backend/.env` is fine for local dev.

In the terminal where you run the CLI:

```bash
export STRIPE_API_KEY='sk_test_...'
```

That lasts for the current shell session only. Alternatively, pass the key per command: `stripe listen --api-key sk_test_... --forward-to ...` (and the same for `stripe trigger`).

Treat `STRIPE_API_KEY` like a password: do not commit it or paste it into tickets.

### 3. Forward webhooks to your local API

Start your backend **first** (so something is listening on port 8000), then in another terminal:

```bash
stripe listen --forward-to http://127.0.0.1:8000/api/billing/webhooks/stripe
```

The first time you run `listen`, the CLI prints a **webhook signing secret** that starts with `whsec_...`. Copy that into **`STRIPE_WEBHOOK_SECRET`** in `backend/.env` and restart the backend.

**Important:** If you stop `stripe listen` and start it again, Stripe may show a **new** `whsec_...`. Update `.env` to match the secret the CLI prints for that session, or signature verification will fail.

### 4. Trigger a test event (optional)

With `listen` still running:

```bash
stripe trigger checkout.session.completed
```

You should see the event in the CLI output and your server logs. For full flows, use Checkout from the app with test `sk_test_...` keys.

### 5. Troubleshooting

| Issue | What to check |
|-------|----------------|
| `Invalid webhook signature` | `STRIPE_WEBHOOK_SECRET` must match the `whsec_...` from the **same** `stripe listen` session. |
| Connection refused | Backend is not running on `127.0.0.1:8000`, or URL path is wrong. |
| Wrong Stripe account | `stripe login` or `STRIPE_API_KEY` / `--api-key` must be for the same Dashboard (test mode) where your test prices live. |

## Failure handling

- Return **5xx** only on unexpected exceptions so Stripe retries.
- After fixing code or data, replay events from the Stripe Dashboard if needed.

## Stripe test / sandbox checklist (manual)

Use **Developers → Test mode** in the Dashboard. Price amounts must match **`TIER_PRICING`** in `backend/app/config/constants.py` (**$9 / $19 / $39 / $79** per month).

1. **Products & Prices:** Four active recurring monthly Prices; copy each `price_...` into `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_STARTER_PLUS`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_PRO_PLUS` in `backend/.env`.
2. **Customer portal:** **Settings → Billing → Customer portal** (or **Product catalog → Customer portal**): enable the portal so `POST /api/billing/create-portal-session` returns a URL for users who have `stripe_customer_id`.
3. **Env:** Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, the four `STRIPE_PRICE_*` values, and **`FRONTEND_URL`** to the exact browser origin (e.g. `http://localhost:5173`).
4. **Webhooks (local):** Run `stripe listen --forward-to http://127.0.0.1:8000/api/billing/webhooks/stripe`, paste the printed `whsec_...` into `STRIPE_WEBHOOK_SECRET`, restart the backend.
5. **Health:** Backend starts; without a JWT, `POST /api/billing/create-checkout-session` returns **401**. With a valid JWT and configured Price IDs, checkout returns a Stripe-hosted `url`. If a tier’s `STRIPE_PRICE_*` is missing, expect **422**.
6. **Checkout E2E:** Log in → upgrade flow → pay with a [test card](https://docs.stripe.com/testing) (e.g. `4242 4242 4242 4242`). Return URL should be `/?checkout=success&session_id=...`; webhooks should update `stripe_customer_id`, `stripe_subscription_id`, and tier in the DB.
7. **Portal:** **Manage billing** (paid user) opens the portal; return URL should land on `FRONTEND_URL`.
8. **Tier change:** Subscribe to another paid tier from the app; webhook logic cancels other active subscriptions for that customer — confirm **one** active subscription in the Dashboard.
9. **Synthetic triggers:** `stripe trigger checkout.session.completed` exercises signature verification but often has **no** `client_reference_id` / metadata, so handlers may log “could not resolve user” while still returning **200**. Prefer real Checkout for user-linked tests.

## In-app overage and Stripe metered billing

- **Overage metering is implemented.** When `deduct_credits` consumes overage credits for a user with `stripe_customer_id`, `backend/app/stripe_metering.py` (`report_overage_credits`) fires a Stripe Billing Meter Event (`compareintel_overage_credits`) with a per-call idempotency key. Failures are logged but never block the in-app deduction path.
- **Auto-attach:** On `checkout.session.completed`, `_ensure_overage_subscription_item` in `billing.py` attaches the metered overage Price (`STRIPE_PRICE_OVERAGE`) to the new subscription if not already present.
- **Env:** `STRIPE_OVERAGE_METER_ID`, `STRIPE_OVERAGE_PRODUCT_ID`, `STRIPE_PRICE_OVERAGE` must be set for overage metering to activate. If `STRIPE_OVERAGE_METER_ID` is unset, `report_overage_credits` is a no-op.
- **Rate:** `OVERAGE_USD_PER_CREDIT = 0.013` (see `backend/app/config/constants.py`). The metered Price in Stripe must match this per-unit amount.
- **Hard cap ceiling.** `deduct_credits` reports **at most** the user's remaining `overage_spend_limit_cents` budget to Stripe. Actual usage above the cap is absorbed by the platform (not metered, not billed) and emitted as a `CREDIT_CAP_ABSORBED` warning log line with `user_id`, `absorbed_credits`, `absorbed_usd`, and the `usage_log_id`. Audit per-user shortfall with `grep CREDIT_CAP_ABSORBED` on backend logs; recurring large values on the same `user_id` typically mean oversized prompts are being fired right at the cap and are worth investigating for abuse or for raising the reserved-estimate ceiling.
- **Billing flow:** Stripe aggregates meter events over the billing period and adds a metered line item to the subscription invoice at period end. See [Billing Meters](https://docs.stripe.com/billing/subscriptions/usage-based).

## Monthly reset without Stripe

Users **without** `stripe_subscription_id` still use a **30-day** window from `allocate_monthly_credits`. Paid subscribers with Stripe rely on **webhooks** for period boundaries; `check_and_reset_credits_if_needed` does **not** auto-rollover monthly pools for Stripe-linked accounts (avoids fighting provider dates).
