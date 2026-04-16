"""Report overage credit consumption to Stripe Billing Meters.

Stripe Billing Meters aggregate meter events over a billing period and produce
a metered line item on the subscription invoice.  This module fires one meter
event per overage deduction so that Stripe can invoice the customer at period
end.

Failures are logged but never block the in-app credit deduction path.
"""

from __future__ import annotations

import logging

import stripe

from .config.settings import settings

logger = logging.getLogger(__name__)

OVERAGE_METER_EVENT_NAME = "overage_credits"


def report_overage_credits(
    stripe_customer_id: str,
    credits: int,
    idempotency_key: str,
) -> None:
    """Fire a Stripe Billing Meter Event for *credits* overage credits consumed.

    Parameters
    ----------
    stripe_customer_id:
        The Stripe ``cus_...`` id for the customer.
    credits:
        Number of overage credits to report (positive integer).
    idempotency_key:
        Unique key to prevent duplicate meter events (e.g.
        ``"overage-{user_id}-{timestamp_ms}"``).
    """
    if not settings.stripe_overage_meter_id:
        return
    if not settings.stripe_secret_key:
        return
    if credits <= 0:
        return

    try:
        stripe.api_key = settings.stripe_secret_key
        stripe.billing.MeterEvent.create(
            event_name=OVERAGE_METER_EVENT_NAME,
            payload={
                "stripe_customer_id": stripe_customer_id,
                "value": str(credits),
            },
            identifier=idempotency_key,
        )
        logger.info(
            "Reported %d overage credits to Stripe meter for customer %s (key=%s)",
            credits,
            stripe_customer_id,
            idempotency_key,
        )
    except Exception:
        logger.warning(
            "Failed to report overage credits to Stripe meter (customer=%s, credits=%d, key=%s)",
            stripe_customer_id,
            credits,
            idempotency_key,
            exc_info=True,
        )
