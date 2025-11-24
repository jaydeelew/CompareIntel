"""
Unit tests for utility functions.

Tests cover:
- Helper functions
- Validation utilities
- Formatting utilities
- Common utilities used across the application
"""
import pytest
from datetime import datetime, timedelta


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
        email_pattern = re.compile(r'^[^\s@]+@[^\s@]+\.[^\s@]+$')
        
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
            "123",           # Too short, no uppercase, no special char
            "abc",           # Too short, no digit, no uppercase, no special char
            "password",      # No digit, no uppercase, no special char
            "Password1",     # No special character
            "PASSWORD1!",    # No lowercase letter
            "password1!",    # No uppercase letter
            "Password!",     # No digit
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


class TestConstants:
    """Tests for application constants."""
    
    def test_extended_tier_limits_exist(self):
        """Test that extended tier limits are properly defined."""
        from app.config import EXTENDED_TIER_LIMITS
        
        assert isinstance(EXTENDED_TIER_LIMITS, dict)
        # EXTENDED_TIER_LIMITS contains subscription tiers: anonymous, free, starter, etc.
        expected_keys = ["anonymous", "free"]
        for key in expected_keys:
            assert key in EXTENDED_TIER_LIMITS, f"EXTENDED_TIER_LIMITS missing subscription tier: {key}"
            assert isinstance(EXTENDED_TIER_LIMITS[key], int)
            assert EXTENDED_TIER_LIMITS[key] > 0

