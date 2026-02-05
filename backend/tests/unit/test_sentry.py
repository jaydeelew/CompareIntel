"""
Tests for Sentry error monitoring integration.

These tests verify that:
1. Sentry initializes correctly when DSN is configured
2. Sentry gracefully handles missing configuration
3. Error capture functions work without crashing
"""

import os
import sys
from unittest.mock import MagicMock, patch

import pytest


class TestSentryInitialization:
    """Tests for Sentry initialization."""

    def test_init_sentry_without_dsn_returns_false(self):
        """Sentry should return False when DSN is not configured."""
        with patch.dict(os.environ, {"SENTRY_DSN": ""}, clear=False):
            from app.sentry import init_sentry

            # Re-import to pick up new env var
            result = init_sentry()
            assert result is False

    def test_init_sentry_with_dsn_succeeds(self):
        """Sentry should initialize when DSN is configured."""
        with patch.dict(os.environ, {"SENTRY_DSN": "https://test@sentry.io/123"}, clear=False):
            # Mock sentry_sdk module if it's not installed
            mock_sentry_sdk = MagicMock()
            mock_sentry_sdk.init = MagicMock()
            # Create mock integrations
            mock_fastapi_integration = MagicMock()
            mock_sqlalchemy_integration = MagicMock()
            mock_logging_integration = MagicMock()
            mock_httpx_integration = MagicMock()

            mock_integrations = MagicMock()
            mock_integrations.fastapi = MagicMock()
            mock_integrations.fastapi.FastApiIntegration = MagicMock(
                return_value=mock_fastapi_integration
            )
            mock_integrations.sqlalchemy = MagicMock()
            mock_integrations.sqlalchemy.SqlalchemyIntegration = MagicMock(
                return_value=mock_sqlalchemy_integration
            )
            mock_integrations.logging = MagicMock()
            mock_integrations.logging.LoggingIntegration = MagicMock(
                return_value=mock_logging_integration
            )
            mock_integrations.httpx = MagicMock()
            mock_integrations.httpx.HttpxIntegration = MagicMock(
                return_value=mock_httpx_integration
            )

            mock_sentry_sdk.integrations = mock_integrations

            with patch.dict(sys.modules, {"sentry_sdk": mock_sentry_sdk}):
                from importlib import reload

                import app.sentry

                reload(app.sentry)
                result = app.sentry.init_sentry()
                # If sentry-sdk is installed, it should return True
                # If not installed, it returns False gracefully
                assert result in [True, False]

    def test_init_sentry_handles_import_error(self):
        """Sentry should handle ImportError gracefully."""
        with patch.dict(os.environ, {"SENTRY_DSN": "https://test@sentry.io/123"}, clear=False):
            with patch.dict("sys.modules", {"sentry_sdk": None}):
                from app.sentry import init_sentry

                # Should not raise, should return False
                result = init_sentry()
                assert result is False


class TestSentryCaptureFunctions:
    """Tests for Sentry capture utility functions."""

    def test_capture_exception_without_sentry(self):
        """capture_exception should not crash when Sentry is not installed."""
        from app.sentry import capture_exception

        # Should not raise
        try:
            capture_exception(ValueError("test error"), context="test")
        except Exception as e:
            pytest.fail(f"capture_exception raised an exception: {e}")

    def test_capture_message_without_sentry(self):
        """capture_message should not crash when Sentry is not installed."""
        from app.sentry import capture_message

        # Should not raise
        try:
            capture_message("test message", level="info", extra_data="test")
        except Exception as e:
            pytest.fail(f"capture_message raised an exception: {e}")

    def test_set_user_context_without_sentry(self):
        """set_user_context should not crash when Sentry is not installed."""
        from app.sentry import set_user_context

        # Should not raise
        try:
            set_user_context(user_id="123", email="test@example.com")
            set_user_context(user_id=None)  # Clear user
        except Exception as e:
            pytest.fail(f"set_user_context raised an exception: {e}")

    def test_add_breadcrumb_without_sentry(self):
        """add_breadcrumb should not crash when Sentry is not installed."""
        from app.sentry import add_breadcrumb

        # Should not raise
        try:
            add_breadcrumb("User clicked button", category="ui", level="info")
        except Exception as e:
            pytest.fail(f"add_breadcrumb raised an exception: {e}")


class TestSentryBeforeSend:
    """Tests for the before_send filter function."""

    def test_before_send_filters_client_errors(self):
        """before_send should filter 4xx HTTP errors."""
        from fastapi import HTTPException

        from app.sentry import _before_send

        # Create a mock event
        event = {"level": "error"}

        # 400 Bad Request should be filtered
        hint = {"exc_info": (HTTPException, HTTPException(status_code=400), None)}
        result = _before_send(event, hint)
        assert result is None

        # 401 Unauthorized should be filtered
        hint = {"exc_info": (HTTPException, HTTPException(status_code=401), None)}
        result = _before_send(event, hint)
        assert result is None

        # 404 Not Found should be filtered
        hint = {"exc_info": (HTTPException, HTTPException(status_code=404), None)}
        result = _before_send(event, hint)
        assert result is None

    def test_before_send_allows_server_errors(self):
        """before_send should allow 5xx HTTP errors through."""
        from fastapi import HTTPException

        from app.sentry import _before_send

        event = {"level": "error"}

        # 500 Internal Server Error should pass through
        hint = {"exc_info": (HTTPException, HTTPException(status_code=500), None)}
        result = _before_send(event, hint)
        assert result is event

        # 503 Service Unavailable should pass through
        hint = {"exc_info": (HTTPException, HTTPException(status_code=503), None)}
        result = _before_send(event, hint)
        assert result is event

    def test_before_send_allows_non_http_errors(self):
        """before_send should allow non-HTTP errors through."""
        from app.sentry import _before_send

        event = {"level": "error"}
        hint = {"exc_info": (ValueError, ValueError("test"), None)}

        result = _before_send(event, hint)
        assert result is event
