# Stripe webhooks — operations runbook

## Environment variables

| Variable | Purpose |
|----------|---------|
| `STRIPE_SECRET_KEY` | Server-side API secret |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for `POST /api/billing/webhooks/stripe` |
| `STRIPE_PRICE_STARTER` / `STRIPE_PRICE_STARTER_PLUS` / `STRIPE_PRICE_PRO` / `STRIPE_PRICE_PRO_PLUS` | Subscription Price IDs (amounts must match `TIER_PRICING` in `backend/app/config/constants.py`) |
| `STRIPE_PRICE_CREDIT_PACK` | One-time pack Price ID |
| `STRIPE_CREDIT_PACK_CREDITS` | Integer credits granted per pack purchase (default `100`) |
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
| `checkout.session.completed` | Sets `stripe_customer_id`; pack purchases call `add_purchased_credits`; subscriptions load Subscription and `_apply_subscription_fields`. |
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

### 2. Log in (links your CLI to your Stripe account)

```bash
stripe login
```

This opens a browser to confirm; the CLI stores credentials for that machine.

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
| Wrong Stripe account | `stripe login` must match the Dashboard where your test prices live. |

## Failure handling

- Return **5xx** only on unexpected exceptions so Stripe retries.
- After fixing code or data, replay events from the Stripe Dashboard if needed.

## Monthly reset without Stripe

Users **without** `stripe_subscription_id` still use a **30-day** window from `allocate_monthly_credits`. Paid subscribers with Stripe rely on **webhooks** for period boundaries; `check_and_reset_credits_if_needed` does **not** auto-rollover monthly pools for Stripe-linked accounts (avoids fighting provider dates).
