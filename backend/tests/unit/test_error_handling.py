"""Unit tests for utils.error_handling API error classification."""

from app.utils.error_handling import (
    ClassifiedError,
    classify_api_error,
    format_streaming_error_message,
)


class TestClassifyApiError:
    def test_plain_exception_returns_classified(self):
        exc = ValueError("some error")
        result = classify_api_error(exc)
        assert isinstance(result, ClassifiedError)
        assert result.status_code is None
        assert result.parsed_message == "some error"
        assert result.is_402_max_tokens is False
        assert result.original_exception is exc

    def test_402_max_tokens_detection_from_message(self):
        exc = Exception("payment required for max_tokens")
        result = classify_api_error(exc)
        assert "payment" in result.parsed_message.lower()
        assert result.is_402_max_tokens is True

    def test_402_detection_from_message(self):
        exc = Exception("Error 402: requires more credits for max_tokens")
        result = classify_api_error(exc)
        assert result.is_402_max_tokens is True

    def test_401_unauthorized_parsed(self):
        exc = Exception("401 Unauthorized")
        result = classify_api_error(exc)
        assert "401" in result.parsed_message or "unauthorized" in result.parsed_message.lower()


class TestFormatStreamingErrorMessage:
    def test_400_returns_error_prefix(self):
        err = ClassifiedError(
            status_code=400,
            parsed_message="Invalid request",
            is_402_max_tokens=False,
            provider_error=None,
            provider_name=None,
            original_exception=Exception("Invalid request"),
        )
        msg = format_streaming_error_message(err, "openai/gpt-4o", 60)
        assert msg.startswith("Error:")
        assert "Invalid" in msg

    def test_401_returns_auth_message(self):
        err = ClassifiedError(
            status_code=401,
            parsed_message="Unauthorized",
            is_402_max_tokens=False,
            provider_error=None,
            provider_name=None,
            original_exception=Exception("Unauthorized"),
        )
        msg = format_streaming_error_message(err, "openai/gpt-4o", 60)
        assert "Authentication failed" in msg

    def test_429_returns_rate_limited(self):
        err = ClassifiedError(
            status_code=429,
            parsed_message="Rate limited",
            is_402_max_tokens=False,
            provider_error=None,
            provider_name=None,
            original_exception=Exception("Rate limited"),
        )
        msg = format_streaming_error_message(err, "openai/gpt-4o", 60)
        assert "Rate limited" in msg

    def test_402_max_tokens_returns_credits_message(self):
        err = ClassifiedError(
            status_code=402,
            parsed_message="Payment required",
            is_402_max_tokens=True,
            provider_error=None,
            provider_name=None,
            original_exception=Exception("Payment required"),
        )
        msg = format_streaming_error_message(err, "openai/gpt-4o", 60)
        assert "credits" in msg.lower() or "max_tokens" in msg
        assert "Error:" in msg
