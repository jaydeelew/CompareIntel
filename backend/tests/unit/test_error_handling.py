"""Unit tests for utils.error_handling API error classification."""

import pytest

pytestmark = pytest.mark.unit


from unittest.mock import MagicMock

from openai import APIError

from app.utils.error_handling import (
    ClassifiedError,
    classify_api_error,
    format_streaming_error_message,
)


def _make_api_error(
    *,
    status_code: int | None = None,
    body: dict | str | None = None,
    message: str = "provider error",
) -> APIError:
    request = MagicMock()
    exc = APIError(message, request=request, body=body)
    if status_code is not None:
        exc.status_code = status_code
    return exc


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

    def test_api_error_with_dict_body_and_metadata(self):
        exc = _make_api_error(
            status_code=502,
            body={
                "error": {
                    "message": "Provider returned error",
                    "metadata": {
                        "provider_name": "Sourceful",
                        "raw": "Failed query: select id from models",
                    },
                }
            },
        )
        result = classify_api_error(exc)
        assert result.status_code == 502
        assert result.provider_name == "Sourceful"
        assert result.provider_error == "Failed query: select id from models"
        assert "Failed query" in result.parsed_message

    def test_api_error_with_json_string_body(self):
        exc = _make_api_error(
            status_code=400,
            body='{"error": {"message": "Invalid request payload"}}',
        )
        result = classify_api_error(exc)
        assert result.status_code == 400
        assert result.parsed_message == "Invalid request payload"

    def test_api_error_with_raw_dict_metadata(self):
        exc = _make_api_error(
            status_code=502,
            body={
                "error": {
                    "message": "Provider returned error",
                    "metadata": {
                        "raw": {"message": "Database unavailable"},
                    },
                }
            },
        )
        result = classify_api_error(exc)
        assert result.parsed_message == "Database unavailable"
        assert result.provider_error == "Database unavailable"

    def test_api_error_sets_provider_error_for_gateway_routes(self):
        exc = Exception("Model not configured in the Gateway for tenant")
        result = classify_api_error(exc)
        assert result.provider_error == exc.args[0]

    def test_api_error_invalid_json_body_falls_back_to_message(self):
        exc = _make_api_error(status_code=400, body="{not-json")
        result = classify_api_error(exc)
        assert result.parsed_message == "provider error"


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

    def test_400_invalid_request_fallback(self):
        err = ClassifiedError(
            status_code=400,
            parsed_message="Bad input",
            is_402_max_tokens=False,
            provider_error=None,
            provider_name=None,
            original_exception=Exception("Bad input"),
        )
        msg = format_streaming_error_message(err, "openai/gpt-4o", 60)
        assert msg == "Error: Invalid request - Bad input"

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

    def test_502_provider_error_returns_friendly_message(self):
        err = ClassifiedError(
            status_code=502,
            parsed_message="Provider returned error",
            is_402_max_tokens=False,
            provider_error='{"error":{"message":"Failed query: select \\"id\\", \\"tenantid\\"..."}}',
            provider_name="Sourceful",
            original_exception=Exception("Provider returned error"),
        )
        msg = format_streaming_error_message(err, "sourceful/riverflow-v2-standard-preview", 60)
        assert "temporarily unavailable" in msg
        assert "provider issues" in msg
        assert "try again later" in msg
        assert "different model" in msg
        assert "Failed query" not in msg

    def test_404_gateway_unavailable_with_provider_name(self):
        err = ClassifiedError(
            status_code=404,
            parsed_message="Not found",
            is_402_max_tokens=False,
            provider_error="No matching route found",
            provider_name="Acme",
            original_exception=Exception("Not found"),
        )
        msg = format_streaming_error_message(err, "acme/model", 60)
        assert "not currently available" in msg
        assert "Acme" in msg

    def test_404_gateway_unavailable_without_provider_name(self):
        err = ClassifiedError(
            status_code=404,
            parsed_message="Not found",
            is_402_max_tokens=False,
            provider_error="not configured in the Gateway",
            provider_name=None,
            original_exception=Exception("Not found"),
        )
        msg = format_streaming_error_message(err, "acme/model", 60)
        assert "not currently available" in msg
        assert "gateway" in msg.lower()

    def test_404_with_provider_error_message(self):
        err = ClassifiedError(
            status_code=404,
            parsed_message="missing",
            is_402_max_tokens=False,
            provider_error="Model retired",
            provider_name=None,
            original_exception=Exception("missing"),
        )
        msg = format_streaming_error_message(err, "acme/model", 60)
        assert msg == "Error: Model not available - Model retired"

    def test_404_fallback_message(self):
        err = ClassifiedError(
            status_code=404,
            parsed_message="missing",
            is_402_max_tokens=False,
            provider_error=None,
            provider_name=None,
            original_exception=Exception("missing"),
        )
        msg = format_streaming_error_message(err, "acme/model", 60)
        assert msg == "Error: Model not available"

    def test_timeout_message(self):
        err = ClassifiedError(
            status_code=None,
            parsed_message="connection timeout while waiting for model",
            is_402_max_tokens=False,
            provider_error=None,
            provider_name=None,
            original_exception=Exception("timeout"),
        )
        msg = format_streaming_error_message(err, "openai/gpt-4o", 45)
        assert msg == "Error: Timeout (45s)"

    def test_generic_error_truncates_long_message(self):
        long_message = "x" * 250
        err = ClassifiedError(
            status_code=None,
            parsed_message=long_message,
            is_402_max_tokens=False,
            provider_error=None,
            provider_name=None,
            original_exception=Exception("boom"),
        )
        msg = format_streaming_error_message(err, "openai/gpt-4o", 60)
        assert msg == f"Error: {'x' * 200}"
