"""
Unit tests for utility functions.

Tests cover:
- Helper functions
- Validation utilities
- Formatting utilities
- Common utilities used across the application
"""

from datetime import datetime, timedelta
from unittest.mock import MagicMock


class TestDateUtilities:
    """Tests for date/time utility functions."""

    def test_date_formatting(self):
        """Test date formatting utilities."""
        now = datetime.now()
        # Add your date formatting tests here
        assert isinstance(now, datetime)

    def test_time_delta_calculations(self):
        """Test time delta calculations."""
        start = datetime.now()
        end = start + timedelta(hours=1)
        delta = end - start
        assert delta.total_seconds() == 3600


class TestValidationUtilities:
    """Tests for validation utility functions."""

    def test_email_validation(self):
        """Test email validation."""
        import re

        # Simple email validation regex pattern
        email_pattern = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")

        valid_emails = [
            "user@example.com",
            "test.user@example.co.uk",
            "user+tag@example.com",
        ]
        invalid_emails = [
            "not-an-email",
            "@example.com",
            "user@",
            "user @example.com",
        ]

        # Test valid emails
        for email in valid_emails:
            assert email_pattern.match(email) is not None, f"{email} should be valid"

        # Test invalid emails
        for email in invalid_emails:
            assert email_pattern.match(email) is None, f"{email} should be invalid"

    def test_password_validation(self):
        """Test password validation."""
        from app.auth import validate_password_strength

        # Weak passwords that should fail validation
        weak_passwords = [
            "123",  # Too short, no uppercase, no special char
            "abc",  # Too short, no digit, no uppercase, no special char
            "password",  # No digit, no uppercase, no special char
            "Password1",  # No special character
            "PASSWORD1!",  # No lowercase letter
            "password1!",  # No uppercase letter
            "Password!",  # No digit
        ]

        # Strong passwords that should pass validation
        strong_passwords = [
            "SecurePass123!",
            "MyP@ssw0rd",
            "Str0ng!P@ss",
        ]

        # Test weak passwords - should all fail validation
        for password in weak_passwords:
            is_valid, error_message = validate_password_strength(password)
            assert not is_valid, f"Password '{password}' should be invalid: {error_message}"

        # Test strong passwords - should all pass validation
        for password in strong_passwords:
            is_valid, error_message = validate_password_strength(password)
            assert is_valid, f"Password '{password}' should be valid: {error_message}"


class TestFormattingUtilities:
    """Tests for formatting utility functions."""

    def test_number_formatting(self):
        """Test number formatting."""
        # Add number formatting tests
        assert isinstance(1000, int)
        assert isinstance(1000.5, float)

    def test_string_formatting(self):
        """Test string formatting utilities."""
        test_string = "hello world"
        assert test_string.upper() == "HELLO WORLD"
        assert test_string.title() == "Hello World"


class TestHashUtilities:
    """Tests for hashing utility functions."""

    def test_password_hashing(self):
        """Test password hashing."""
        from passlib.context import CryptContext

        pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
        password = "test_password_123"
        hashed = pwd_context.hash(password)

        assert hashed != password
        assert pwd_context.verify(password, hashed)
        assert not pwd_context.verify("wrong_password", hashed)

    def test_fingerprint_hashing(self):
        """Test browser fingerprint hashing."""
        # Add fingerprint hashing tests if applicable
        fingerprint = "test-fingerprint-data"
        assert isinstance(fingerprint, str)
        assert len(fingerprint) > 0


class TestErrorHandling:
    """Tests for error handling utilities."""

    def test_error_formatting(self):
        """Test error message formatting."""
        error_message = "Test error message"
        assert isinstance(error_message, str)
        assert len(error_message) > 0

    def test_exception_handling(self):
        """Test exception handling utilities."""
        try:
            raise ValueError("Test exception")
        except ValueError as e:
            assert str(e) == "Test exception"


class TestConfigHelpers:
    """Tests for config helper functions."""

    def test_get_model_limit_known_tier(self):
        """Test get_model_limit with known tier."""
        from app.config.helpers import get_model_limit

        assert get_model_limit("pro") > 0
        assert get_model_limit("free") > 0

    def test_get_model_limit_unknown_tier_defaults_to_3(self):
        """Test get_model_limit with unknown tier defaults to 3."""
        from app.config.helpers import get_model_limit

        assert get_model_limit("unknown_tier") == 3

    def test_get_daily_limit_with_tier_variations(self):
        """Test get_daily_limit with pro+ and starter+ variations."""
        from app.config.helpers import get_daily_limit

        # Standard tier names
        pro_plus_limit = get_daily_limit("pro_plus")
        assert pro_plus_limit > 0

        # Tier name variations (pro+, pro +, pro-plus)
        assert get_daily_limit("pro+") == pro_plus_limit
        assert get_daily_limit("pro +") == pro_plus_limit
        assert get_daily_limit("pro-plus") == pro_plus_limit
        assert get_daily_limit("starter+") == get_daily_limit("starter_plus")
        assert get_daily_limit("starter +") == get_daily_limit("starter_plus")

    def test_get_daily_limit_none_or_empty(self):
        """Test get_daily_limit with None or empty string."""
        from app.config.helpers import get_daily_limit

        # Should return anonymous limit for None/empty
        limit = get_daily_limit(None)
        assert limit > 0
        assert get_daily_limit("") == limit

    def test_get_conversation_limit_known_tier(self):
        """Test get_conversation_limit with known tier."""
        from app.config.helpers import get_conversation_limit

        assert get_conversation_limit("pro") >= 0

    def test_get_conversation_limit_unknown_defaults_to_2(self):
        """Test get_conversation_limit with unknown tier defaults to 2."""
        from app.config.helpers import get_conversation_limit

        assert get_conversation_limit("unknown") == 2


class TestGetClientIp:
    """Tests for get_client_ip request utility."""

    def test_get_client_ip_from_forwarded_for(self):
        """Test IP extraction from X-Forwarded-For header (uses first IP)."""
        from app.utils.request import get_client_ip

        request = MagicMock()
        request.headers = {"X-Forwarded-For": " 192.168.1.1, 10.0.0.1 "}
        request.client = None
        assert get_client_ip(request) == "192.168.1.1"

    def test_get_client_ip_from_real_ip(self):
        """Test IP extraction from X-Real-IP header when X-Forwarded-For absent."""
        from app.utils.request import get_client_ip

        request = MagicMock()
        request.headers = {"X-Real-IP": " 203.0.113.50 "}
        request.client = None
        assert get_client_ip(request) == "203.0.113.50"

    def test_get_client_ip_from_client_host(self):
        """Test IP from request.client when no proxy headers present."""
        from app.utils.request import get_client_ip

        request = MagicMock()
        request.headers = {}
        request.client = MagicMock()
        request.client.host = "127.0.0.1"
        assert get_client_ip(request) == "127.0.0.1"

    def test_get_client_ip_fallback_to_unknown(self):
        """Test fallback to 'unknown' when no headers and no client."""
        from app.utils.request import get_client_ip

        request = MagicMock()
        request.headers = {}
        request.client = None
        assert get_client_ip(request) == "unknown"


class TestConstants:
    """Tests for application constants."""

    def test_credit_limits_exist(self):
        """Test that credit limits are properly defined."""
        from app.config.constants import DAILY_CREDIT_LIMITS, MONTHLY_CREDIT_ALLOCATIONS

        assert isinstance(DAILY_CREDIT_LIMITS, dict)
        assert isinstance(MONTHLY_CREDIT_ALLOCATIONS, dict)
        # DAILY_CREDIT_LIMITS contains free tiers: unregistered, free
        expected_daily_keys = ["unregistered", "free"]
        for key in expected_daily_keys:
            assert key in DAILY_CREDIT_LIMITS, (
                f"DAILY_CREDIT_LIMITS missing subscription tier: {key}"
            )
            assert isinstance(DAILY_CREDIT_LIMITS[key], int)
            assert DAILY_CREDIT_LIMITS[key] > 0

        # MONTHLY_CREDIT_ALLOCATIONS contains paid tiers: starter, starter_plus, pro, pro_plus
        expected_monthly_keys = ["starter", "starter_plus", "pro", "pro_plus"]
        for key in expected_monthly_keys:
            assert key in MONTHLY_CREDIT_ALLOCATIONS, (
                f"MONTHLY_CREDIT_ALLOCATIONS missing subscription tier: {key}"
            )
            assert isinstance(MONTHLY_CREDIT_ALLOCATIONS[key], int)
            assert MONTHLY_CREDIT_ALLOCATIONS[key] > 0
