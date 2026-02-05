"""
Sentry Error Monitoring Configuration

Initializes Sentry for error tracking and performance monitoring in production.
Errors are captured automatically and sent to Sentry dashboard.

Environment Variables Required:
- SENTRY_DSN: Your Sentry DSN (Data Source Name)
- SENTRY_ENVIRONMENT: Environment name (production, staging, development)
"""

import logging
import os

logger = logging.getLogger(__name__)


def init_sentry(app_version: str | None = None) -> bool:
    """
    Initialize Sentry error monitoring for the backend.

    Should be called once at application startup.
    Only initializes when SENTRY_DSN environment variable is set.

    Args:
        app_version: Optional version string for release tracking

    Returns:
        True if Sentry was initialized, False otherwise
    """
    dsn = os.getenv("SENTRY_DSN")
    environment = os.getenv("SENTRY_ENVIRONMENT", os.getenv("ENVIRONMENT", "production"))

    # Skip initialization if no DSN is configured
    if not dsn:
        logger.debug("Sentry DSN not configured, skipping initialization")
        return False

    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.httpx import HttpxIntegration
        from sentry_sdk.integrations.logging import LoggingIntegration
        from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration

        sentry_sdk.init(
            dsn=dsn,
            environment=environment,
            release=app_version,
            # Performance monitoring
            # Sample 10% of transactions in production, 100% in staging/dev
            traces_sample_rate=0.1 if environment == "production" else 1.0,
            # Profiling - sample 10% of profiled transactions
            profiles_sample_rate=0.1 if environment == "production" else 0.0,
            # Send default PII (e.g., user's email if set)
            send_default_pii=False,
            # Attach stacktrace to log messages with level ERROR or higher
            attach_stacktrace=True,
            # Integrations
            integrations=[
                # FastAPI integration - automatic error capture
                FastApiIntegration(
                    transaction_style="endpoint",
                ),
                # SQLAlchemy integration - capture database errors
                SqlalchemyIntegration(),
                # Logging integration - capture log messages as breadcrumbs
                LoggingIntegration(
                    level=logging.INFO,  # Capture INFO and above as breadcrumbs
                    event_level=logging.ERROR,  # Send ERROR and above to Sentry
                ),
                # HTTPX integration - for outgoing HTTP calls
                HttpxIntegration(),
            ],
            # Filter out noisy errors
            ignore_errors=[
                # Expected HTTP errors
                "HTTPException",
                # Connection errors that users can't control
                "ConnectionRefusedError",
                "ConnectionResetError",
            ],
            # Custom error filtering
            before_send=_before_send,
        )

        logger.info(f"Sentry initialized (environment: {environment})")
        return True

    except ImportError:
        logger.warning("sentry-sdk not installed, skipping Sentry initialization")
        return False
    except Exception as e:
        logger.error(f"Failed to initialize Sentry: {e}")
        return False


def _before_send(event, hint):
    """
    Filter and modify events before sending to Sentry.

    Args:
        event: The Sentry event
        hint: Additional context about the error

    Returns:
        The modified event, or None to discard
    """
    # Get the original exception if available
    if "exc_info" in hint:
        exc_type, exc_value, _ = hint["exc_info"]

        # Don't send expected HTTP errors (4xx)
        from fastapi import HTTPException

        if isinstance(exc_value, HTTPException):
            if 400 <= exc_value.status_code < 500:
                return None

    return event


def capture_exception(error: Exception, **context) -> None:
    """
    Capture an exception and send to Sentry.

    Args:
        error: The exception to capture
        **context: Additional context to attach
    """
    try:
        import sentry_sdk

        with sentry_sdk.push_scope() as scope:
            for key, value in context.items():
                scope.set_extra(key, value)
            sentry_sdk.capture_exception(error)
    except ImportError:
        # Sentry not installed, just log
        logger.exception("Error captured (Sentry not installed): %s", error)


def capture_message(message: str, level: str = "info", **context) -> None:
    """
    Capture a message and send to Sentry.

    Args:
        message: The message to capture
        level: Severity level (debug, info, warning, error, fatal)
        **context: Additional context to attach
    """
    try:
        import sentry_sdk

        with sentry_sdk.push_scope() as scope:
            for key, value in context.items():
                scope.set_extra(key, value)
            sentry_sdk.capture_message(message, level=level)
    except ImportError:
        # Sentry not installed, just log
        logger.log(
            getattr(logging, level.upper(), logging.INFO),
            "Message captured (Sentry not installed): %s",
            message,
        )


def set_user_context(user_id: str | None = None, email: str | None = None) -> None:
    """
    Set user context for error tracking.

    Args:
        user_id: User's ID
        email: User's email (optional)
    """
    try:
        import sentry_sdk

        if user_id:
            sentry_sdk.set_user({"id": user_id, "email": email})
        else:
            sentry_sdk.set_user(None)
    except ImportError:
        pass


def add_breadcrumb(message: str, category: str = "user", level: str = "info") -> None:
    """
    Add a breadcrumb for debugging.

    Args:
        message: Breadcrumb message
        category: Category (e.g., 'user', 'api', 'navigation')
        level: Severity level
    """
    try:
        import sentry_sdk

        sentry_sdk.add_breadcrumb(
            message=message,
            category=category,
            level=level,
        )
    except ImportError:
        pass
