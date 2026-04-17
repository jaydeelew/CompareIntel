"""Unit tests for Stripe metered overage billing.

Covers:
- report_overage_credits fires the correct Stripe MeterEvent
- report_overage_credits is a no-op when settings are missing
- deduct_credits calls report_overage_credits when overage is consumed
- deduct_credits does NOT call report when no overage is consumed
- _ensure_overage_subscription_item attaches the metered price
- _ensure_overage_subscription_item skips when already attached
- allocate_monthly_credits preserves overage preference across renewals
"""

from decimal import Decimal
from unittest.mock import MagicMock, patch

from app.config.constants import MONTHLY_CREDIT_ALLOCATIONS
from app.credit_manager import allocate_monthly_credits, deduct_credits


class TestReportOverageCredits:
    """Tests for stripe_metering.report_overage_credits."""

    @patch("app.stripe_metering.settings")
    @patch("app.stripe_metering.stripe")
    def test_fires_meter_event(self, mock_stripe, mock_settings):
        mock_settings.stripe_overage_meter_id = "mtr_test_123"
        mock_settings.stripe_secret_key = "sk_test_abc"
        from app.stripe_metering import report_overage_credits

        report_overage_credits(
            stripe_customer_id="cus_abc",
            credits=10,
            idempotency_key="overage-1-123456",
        )

        mock_stripe.billing.MeterEvent.create.assert_called_once_with(
            event_name="compareintel_overage_credits",
            payload={
                "stripe_customer_id": "cus_abc",
                "value": "10",
            },
            identifier="overage-1-123456",
        )

    @patch("app.stripe_metering.settings")
    def test_noop_when_meter_id_missing(self, mock_settings):
        mock_settings.stripe_overage_meter_id = None
        mock_settings.stripe_secret_key = "sk_test_abc"
        from app.stripe_metering import report_overage_credits

        report_overage_credits(
            stripe_customer_id="cus_abc",
            credits=10,
            idempotency_key="key",
        )

    @patch("app.stripe_metering.settings")
    def test_noop_when_secret_key_missing(self, mock_settings):
        mock_settings.stripe_overage_meter_id = "mtr_test_123"
        mock_settings.stripe_secret_key = None
        from app.stripe_metering import report_overage_credits

        report_overage_credits(
            stripe_customer_id="cus_abc",
            credits=10,
            idempotency_key="key",
        )

    @patch("app.stripe_metering.settings")
    def test_noop_when_credits_zero(self, mock_settings):
        mock_settings.stripe_overage_meter_id = "mtr_test_123"
        mock_settings.stripe_secret_key = "sk_test_abc"
        from app.stripe_metering import report_overage_credits

        report_overage_credits(
            stripe_customer_id="cus_abc",
            credits=0,
            idempotency_key="key",
        )

    @patch("app.stripe_metering.settings")
    @patch("app.stripe_metering.stripe")
    def test_does_not_raise_on_stripe_error(self, mock_stripe, mock_settings):
        mock_settings.stripe_overage_meter_id = "mtr_test_123"
        mock_settings.stripe_secret_key = "sk_test_abc"
        mock_stripe.billing.MeterEvent.create.side_effect = Exception("API down")
        from app.stripe_metering import report_overage_credits

        report_overage_credits(
            stripe_customer_id="cus_abc",
            credits=5,
            idempotency_key="key",
        )


class TestDeductCreditsOverageReporting:
    """Tests that deduct_credits reports overage to Stripe when appropriate."""

    @patch("app.stripe_metering.report_overage_credits")
    def test_reports_overage_to_stripe(self, mock_report, db_session, test_user_starter):
        user = test_user_starter
        user.stripe_customer_id = "cus_overage_test"
        user.overage_enabled = True
        user.overage_spend_limit_cents = None
        user.monthly_credits_allocated = 10
        user.credits_used_this_period = 10
        db_session.commit()

        deduct_credits(user.id, Decimal("5"), None, db_session, "test overage")

        mock_report.assert_called_once()
        args = mock_report.call_args
        assert args.kwargs["stripe_customer_id"] == "cus_overage_test"
        assert args.kwargs["credits"] == 5
        assert "overage-" in args.kwargs["idempotency_key"]

    @patch("app.stripe_metering.report_overage_credits")
    def test_no_report_when_pool_covers(self, mock_report, db_session, test_user_starter):
        user = test_user_starter
        user.stripe_customer_id = "cus_normal"
        user.overage_enabled = True
        user.monthly_credits_allocated = 100
        user.credits_used_this_period = 0
        db_session.commit()

        deduct_credits(user.id, Decimal("5"), None, db_session, "within pool")

        mock_report.assert_not_called()

    @patch("app.stripe_metering.report_overage_credits")
    def test_no_report_without_stripe_customer(self, mock_report, db_session, test_user_starter):
        user = test_user_starter
        user.stripe_customer_id = None
        user.overage_enabled = True
        user.monthly_credits_allocated = 10
        user.credits_used_this_period = 10
        db_session.commit()

        deduct_credits(user.id, Decimal("5"), None, db_session, "no stripe id")

        mock_report.assert_not_called()


class TestEnsureOverageSubscriptionItem:
    """Tests for _ensure_overage_subscription_item in billing.py."""

    @patch("app.routers.billing.settings")
    def test_attaches_when_missing(self, mock_settings):
        mock_settings.stripe_price_overage = "price_overage_test"
        mock_stripe = MagicMock()

        existing_item = MagicMock()
        existing_item.price = MagicMock(id="price_base_tier")
        mock_stripe.SubscriptionItem.list.return_value.auto_paging_iter.return_value = [
            existing_item
        ]

        from app.routers.billing import _ensure_overage_subscription_item

        _ensure_overage_subscription_item(mock_stripe, "sub_test_123")

        mock_stripe.SubscriptionItem.create.assert_called_once_with(
            subscription="sub_test_123",
            price="price_overage_test",
        )

    @patch("app.routers.billing.settings")
    def test_skips_when_already_attached(self, mock_settings):
        mock_settings.stripe_price_overage = "price_overage_test"
        mock_stripe = MagicMock()

        existing_item = MagicMock()
        existing_item.price = MagicMock(id="price_overage_test")
        mock_stripe.SubscriptionItem.list.return_value.auto_paging_iter.return_value = [
            existing_item
        ]

        from app.routers.billing import _ensure_overage_subscription_item

        _ensure_overage_subscription_item(mock_stripe, "sub_test_123")

        mock_stripe.SubscriptionItem.create.assert_not_called()

    @patch("app.routers.billing.settings")
    def test_noop_when_price_not_configured(self, mock_settings):
        mock_settings.stripe_price_overage = None
        mock_stripe = MagicMock()

        from app.routers.billing import _ensure_overage_subscription_item

        _ensure_overage_subscription_item(mock_stripe, "sub_test_123")

        mock_stripe.SubscriptionItem.list.assert_not_called()
        mock_stripe.SubscriptionItem.create.assert_not_called()


class TestAllocateMonthlyCreditsOverageReset:
    """Verify that allocate_monthly_credits resets overage preference each cycle."""

    def test_overage_resets_on_renewal(self, db_session, test_user_starter):
        user = test_user_starter
        user.overage_enabled = True
        user.overage_spend_limit_cents = 5000
        user.overage_credits_used_this_period = 42
        user.monthly_credits_allocated = MONTHLY_CREDIT_ALLOCATIONS["starter"]
        user.credits_used_this_period = 100
        db_session.commit()

        allocate_monthly_credits(user.id, "starter", db_session)
        db_session.refresh(user)

        assert user.overage_enabled is False
        assert user.overage_spend_limit_cents is None
        assert user.overage_credits_used_this_period == 0
        assert user.credits_used_this_period == 0
        assert user.monthly_credits_allocated == MONTHLY_CREDIT_ALLOCATIONS["starter"]

    def test_overage_disabled_stays_disabled(self, db_session, test_user_starter):
        user = test_user_starter
        user.overage_enabled = False
        user.overage_spend_limit_cents = None
        user.overage_credits_used_this_period = 0
        db_session.commit()

        allocate_monthly_credits(user.id, "starter", db_session)
        db_session.refresh(user)

        assert user.overage_enabled is False
        assert user.overage_spend_limit_cents is None
        assert user.overage_credits_used_this_period == 0
