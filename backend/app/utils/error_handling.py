"""
Centralized API error classification for OpenRouter/OpenAI-style errors.
"""

import json
from dataclasses import dataclass

# OpenAI client raises openai.APIError; avoid hard import for lighter use
try:
    from openai import APIError
except ImportError:
    APIError = type("APIError", (Exception,), {})


@dataclass
class ClassifiedError:
    """Parsed error information from an API exception."""

    status_code: int | None
    parsed_message: str
    is_402_max_tokens: bool
    provider_error: str | None
    provider_name: str | None
    original_exception: Exception


def classify_api_error(exception: Exception) -> ClassifiedError:
    """
    Extract structured error information from an API exception.
    Handles OpenAI APIError (OpenRouter) with nested body/metadata parsing.
    """
    status_code: int | None = None
    parsed_message = str(exception)
    provider_error: str | None = None
    provider_name: str | None = None

    if isinstance(exception, APIError):
        if hasattr(exception, "status_code"):
            status_code = exception.status_code
        elif hasattr(exception, "response") and hasattr(exception.response, "status_code"):
            status_code = exception.response.status_code

        if hasattr(exception, "body") and exception.body:
            try:
                if isinstance(exception.body, dict):
                    error_body = exception.body
                elif isinstance(exception.body, str):
                    error_body = json.loads(exception.body)
                else:
                    error_body = {}

                if "error" in error_body:
                    error_obj = error_body["error"]
                    if isinstance(error_obj, dict):
                        parsed_message = error_obj.get("message", str(exception))
                        meta = error_obj.get("metadata")
                        if isinstance(meta, dict):
                            raw_err = meta.get("raw", "")
                            provider_name = meta.get("provider_name", "") or None
                            if raw_err:
                                if isinstance(raw_err, str):
                                    parsed_message = raw_err
                                    provider_error = raw_err
                                elif isinstance(raw_err, dict):
                                    raw_msg = (
                                        raw_err.get("message")
                                        or raw_err.get("error")
                                        or str(raw_err)
                                    )
                                    if raw_msg and isinstance(raw_msg, str):
                                        parsed_message = raw_msg
                                    provider_error = (
                                        raw_msg if isinstance(raw_msg, str) else str(raw_err)
                                    )
                                else:
                                    provider_error = str(raw_err)
                        if not parsed_message or parsed_message == str(exception):
                            parsed_message = error_obj.get("message", str(exception))
                    else:
                        parsed_message = str(error_obj)
                else:
                    parsed_message = str(exception)
            except (json.JSONDecodeError, AttributeError, KeyError):
                parsed_message = str(exception)

    error_str = parsed_message.lower()
    is_402_max_tokens = (
        status_code == 402
        or "402" in parsed_message
        or "payment required" in error_str
        or ("requires more credits" in error_str and "max_tokens" in error_str)
    )

    if provider_error is None and (
        "not configured in the Gateway" in parsed_message or "No matching route" in parsed_message
    ):
        provider_error = parsed_message

    return ClassifiedError(
        status_code=status_code,
        parsed_message=parsed_message,
        is_402_max_tokens=is_402_max_tokens,
        provider_error=provider_error,
        provider_name=provider_name or None,
        original_exception=exception,
    )


def format_streaming_error_message(
    classified: ClassifiedError, model_id: str, model_timeout_seconds: int
) -> str:
    """
    Produce the user-facing error string for streaming failures.
    """
    err = classified
    msg = err.parsed_message
    err_lower = msg.lower()
    sc = err.status_code

    if sc == 400:
        if msg and msg != str(err.original_exception):
            clean = msg[:200] if len(msg) > 200 else msg
            return f"Error: {clean}"
        if "provider returned error" in err_lower:
            clean = msg[:200] if len(msg) > 200 else msg
            return f"Error: {clean}"
        clean = msg[:200] if len(msg) > 200 else msg
        return f"Error: Invalid request - {clean}"

    if sc == 401 or "unauthorized" in err_lower or "401" in err_lower:
        return "Error: Authentication failed"

    if sc == 404 or "not found" in err_lower or "404" in err_lower:
        if err.provider_error:
            if (
                "not configured in the Gateway" in err.provider_error
                or "No matching route" in err.provider_error
            ):
                if err.provider_name:
                    return (
                        f"Error: Model '{model_id}' is not currently available. "
                        f"The provider ({err.provider_name}) may not have this model "
                        f"configured in their gateway. Please try again later or use a different model."
                    )
                return (
                    f"Error: Model '{model_id}' is not currently available. "
                    f"The provider may not have this model configured in their gateway. "
                    f"This appears in OpenRouter's model list but is not currently routable. "
                    f"Please try again later or use a different model."
                )
            clean = (
                err.provider_error[:200] if len(err.provider_error) > 200 else err.provider_error
            )
            return f"Error: Model not available - {clean}"
        if msg and msg != str(err.original_exception):
            clean = msg[:200] if len(msg) > 200 else msg
            return f"Error: Model not available - {clean}"
        return "Error: Model not available"

    if sc == 429 or "rate limit" in err_lower or "429" in err_lower:
        return "Error: Rate limited"

    if "timeout" in err_lower:
        return f"Error: Timeout ({model_timeout_seconds}s)"

    if err.is_402_max_tokens:
        return (
            "Error: This request requires more credits or fewer max_tokens. "
            "Please try with a shorter prompt or reduce the number of models."
        )

    clean = msg[:200] if len(msg) > 200 else msg
    return f"Error: {clean}"
