# Billing, refunds, and subscriptions (draft for counsel)

**Status:** Draft for legal review — not user-facing Terms of Service.

## Topics to cover in production policy

1. **Subscription billing** — recurring monthly charges, renewal, failed payment behavior (grace vs immediate downgrade), and how **Stripe** processes card data (link Stripe Customer Portal).
2. **Taxes** — whether prices are exclusive or inclusive of applicable taxes; Stripe Tax or manual handling.
3. **Credits** — prepaid packs and monthly pools **do not necessarily roll over** unless explicitly stated; clarify expiry if any.
4. **Refunds** — time windows, partial periods, chargebacks, and how to request support (`support@compareintel.com` or in-app).
5. **Subprocessors** — Stripe (payments), OpenRouter or equivalent inference providers; link from Privacy Policy.
6. **Plan changes** — upgrades/downgrades, proration if offered later, and effective dates.

## Engineering touchpoints

- Checkout: `POST /api/billing/create-checkout-session` (subscription), `POST /api/billing/create-credit-pack-checkout-session` (pack).
- Customer portal: `POST /api/billing/create-portal-session`.
- Webhooks: `POST /api/billing/webhooks/stripe` (see `docs/ops/STRIPE_WEBHOOK_RUNBOOK.md`).

Replace this draft with counsel-approved copy in the public **Terms of Service**, **Privacy Policy**, and a short **Billing & refunds** help article linked from checkout and account settings.
