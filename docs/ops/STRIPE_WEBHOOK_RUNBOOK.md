# Stripe webhooks — operations runbook

## Environment variables

| Variable | Purpose |
|----------|---------|
| `STRIPE_SECRET_KEY` | Server-side API secret |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for `POST /api/billing/webhooks/stripe` |
| `STRIPE_PRICE_STARTER` / `STRIPE_PRICE_STARTER_PLUS` / `STRIPE_PRICE_PRO` / `STRIPE_PRICE_PRO_PLUS` | Subscription Price IDs |
| `STRIPE_PRICE_CREDIT_PACK` | One-time pack Price ID |
| `STRIPE_CREDIT_PACK_CREDITS` | Integer credits granted per pack purchase (default `1000`) |
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

## Local testing

- Use Stripe CLI: `stripe listen --forward-to localhost:8000/api/billing/webhooks/stripe`
- Use test mode keys and test prices.

## Failure handling

- Return **5xx** only on unexpected exceptions so Stripe retries.
- After fixing code or data, replay events from the Stripe Dashboard if needed.

## Monthly reset without Stripe

Users **without** `stripe_subscription_id` still use a **30-day** window from `allocate_monthly_credits`. Paid subscribers with Stripe rely on **webhooks** for period boundaries; `check_and_reset_credits_if_needed` does **not** auto-rollover monthly pools for Stripe-linked accounts (avoids fighting provider dates).
