"""
Configuration validation functions.

This module provides validation functions to ensure configuration consistency
and required settings are present on startup.
"""

import logging
from typing import Dict, Any, List
from .settings import settings
from .constants import (
    MODEL_LIMITS,
    ANONYMOUS_MODEL_LIMIT,
    SUBSCRIPTION_CONFIG,
    CONVERSATION_LIMITS,
)

# Setup logger
logger = logging.getLogger(__name__)


# ============================================================================
# Configuration Validation
# ============================================================================

def validate_config() -> None:
    """
    Validate configuration on startup.
    
    Raises ValueError if required configuration is missing or invalid.
    
    This function checks:
    - Required environment variables are set
    - Configuration consistency (tier limits, etc.)
    - Configuration values are within expected ranges
    - Database URL format is valid
    - Email configuration consistency (if provided)
    """
    errors: List[str] = []
    warnings: List[str] = []
    
    # ========================================================================
    # Required Environment Variables
    # ========================================================================
    if not settings.secret_key:
        errors.append(
            "SECRET_KEY environment variable is not set. "
            'Generate one with: python -c "import secrets; print(secrets.token_urlsafe(32))"'
        )
    elif len(settings.secret_key) < 32:
        warnings.append(
            f"SECRET_KEY is shorter than recommended (32+ characters). "
            f"Current length: {len(settings.secret_key)}"
        )
    
    if not settings.openrouter_api_key:
        errors.append(
            "OPENROUTER_API_KEY environment variable is not set. "
            "Get your key from: https://openrouter.ai/keys"
        )
    
    # ========================================================================
    # Database Configuration
    # ========================================================================
    if not settings.database_url:
        errors.append("DATABASE_URL environment variable is not set")
    elif not settings.database_url.startswith(("sqlite:///", "postgresql://", "postgresql+psycopg2://")):
        warnings.append(
            f"Database URL format may be invalid. "
            f"Expected: sqlite:/// or postgresql://. Got: {settings.database_url[:20]}..."
        )
    
    # ========================================================================
    # Email Configuration Consistency
    # ========================================================================
    email_fields = [
        settings.mail_username,
        settings.mail_password,
        settings.mail_from,
        settings.mail_server,
    ]
    email_configured = all(field is not None and field != "" for field in email_fields)
    
    if email_configured:
        # If email is configured, validate all fields
        if not settings.mail_username:
            warnings.append("MAIL_USERNAME is set but empty")
        if not settings.mail_password:
            warnings.append("MAIL_PASSWORD is set but empty")
        if not settings.mail_from or "@" not in settings.mail_from:
            warnings.append(f"MAIL_FROM appears invalid: {settings.mail_from}")
        if not settings.mail_server:
            warnings.append("MAIL_SERVER is set but empty")
        if settings.mail_port is not None and (settings.mail_port < 1 or settings.mail_port > 65535):
            errors.append(f"MAIL_PORT must be between 1 and 65535, got: {settings.mail_port}")
    else:
        # Partial email configuration - only warn if multiple fields are set
        # (indicating an attempt to configure email) but not all required fields
        # If only MAIL_FROM is set, it's likely just a default value, so don't warn
        configured_fields = [field for field in email_fields if field is not None and field != ""]
        if len(configured_fields) > 1:
            warnings.append(
                "Email configuration is partially set. "
                "All email fields (MAIL_USERNAME, MAIL_PASSWORD, MAIL_FROM, MAIL_SERVER) "
                "must be set for email functionality to work."
            )
    
    # ========================================================================
    # Tier Limits Consistency
    # ========================================================================
    if ANONYMOUS_MODEL_LIMIT not in MODEL_LIMITS.values():
        errors.append(
            f"ANONYMOUS_MODEL_LIMIT ({ANONYMOUS_MODEL_LIMIT}) must match a value in MODEL_LIMITS"
        )
    
    # Extended tier usage tracking removed - no validation needed
    
    # Validate all subscription tiers have required fields
    for tier, config in SUBSCRIPTION_CONFIG.items():
        required_fields = ["daily_limit", "model_limit", "overage_allowed"]
        for field in required_fields:
            if field not in config:
                errors.append(f"SUBSCRIPTION_CONFIG['{tier}'] missing required field: {field}")
    
    # Validate conversation limits include all tiers
    for tier in SUBSCRIPTION_CONFIG.keys():
        if tier not in CONVERSATION_LIMITS:
            warnings.append(f"CONVERSATION_LIMITS missing tier: {tier}")
    if "unregistered" not in CONVERSATION_LIMITS:
        warnings.append("CONVERSATION_LIMITS missing 'unregistered' tier")
    
    # ========================================================================
    # Performance Settings
    # ========================================================================
    if settings.individual_model_timeout < 1:
        errors.append("individual_model_timeout must be at least 1 second")
    elif settings.individual_model_timeout > 600:
        warnings.append(
            f"individual_model_timeout is very high ({settings.individual_model_timeout}s). "
            "This may cause long-running requests."
        )
    
    # Model inactivity timeout validation
    if settings.model_inactivity_timeout < 10:
        errors.append("model_inactivity_timeout must be at least 10 seconds")
    elif settings.model_inactivity_timeout >= 60:
        warnings.append(
            f"model_inactivity_timeout ({settings.model_inactivity_timeout}s) should be less than 60s "
            "to ensure backend completes before frontend timeout. Recommended: 55s for 5-second buffer."
        )
    
    # ========================================================================
    # Environment Configuration
    # ========================================================================
    valid_environments = ["development", "production", "staging", "test"]
    if settings.environment not in valid_environments:
        warnings.append(
            f"Environment '{settings.environment}' is not a standard value. "
            f"Expected one of: {', '.join(valid_environments)}"
        )
    
    # ========================================================================
    # Frontend URL Validation
    # ========================================================================
    if not settings.frontend_url:
        warnings.append("FRONTEND_URL is not set, using default")
    elif not settings.frontend_url.startswith(("http://", "https://")):
        warnings.append(
            f"FRONTEND_URL should start with http:// or https://. "
            f"Got: {settings.frontend_url}"
        )
    
    # ========================================================================
    # Report Results
    # ========================================================================
    if warnings:
        for warning in warnings:
            logger.warning(f"Configuration warning: {warning}")
    
    if errors:
        error_msg = "Configuration validation failed:\n" + "\n".join(f"  - {e}" for e in errors)
        raise ValueError(error_msg)
    
    logger.info("Configuration validation passed successfully")


def mask_secret(value: str, show_chars: int = 4) -> str:
    """
    Mask a secret value, showing only the first and last few characters.
    
    Args:
        value: The secret value to mask
        show_chars: Number of characters to show at the start and end
        
    Returns:
        Masked string (e.g., "sk-...xyz")
    """
    if not value or len(value) <= show_chars * 2:
        return "***" if value else "(not set)"
    
    return f"{value[:show_chars]}...{value[-show_chars:]}"


def log_configuration() -> None:
    """
    Log configuration on startup with sensitive values masked.
    
    This function logs all configuration settings for debugging purposes,
    but masks sensitive information like API keys and passwords.
    """
    logger.info("=" * 80)
    logger.info("Application Configuration")
    logger.info("=" * 80)
    
    # Environment
    logger.info(f"Environment: {settings.environment}")
    logger.info(f"Frontend URL: {settings.frontend_url}")
    
    # Database
    # Mask database password if present in URL
    db_url = settings.database_url
    if "://" in db_url and "@" in db_url:
        # Mask password in database URL (format: scheme://user:password@host/db)
        parts = db_url.split("://", 1)
        if len(parts) == 2:
            scheme = parts[0]
            rest = parts[1]
            if "@" in rest:
                auth_part, host_part = rest.split("@", 1)
                if ":" in auth_part:
                    user, password = auth_part.split(":", 1)
                    masked_auth = f"{user}:***"
                    db_url = f"{scheme}://{masked_auth}@{host_part}"
    
    logger.info(f"Database URL: {db_url}")
    
    # Security (masked)
    logger.info(f"Secret Key: {mask_secret(settings.secret_key)}")
    
    # API Keys (masked)
    logger.info(f"OpenRouter API Key: {mask_secret(settings.openrouter_api_key)}")
    
    # Email Configuration
    if settings.mail_username or settings.mail_password or settings.mail_from or settings.mail_server:
        logger.info("Email Configuration:")
        logger.info(f"  Mail Server: {settings.mail_server or '(not set)'}")
        logger.info(f"  Mail Port: {settings.mail_port or '(not set)'}")
        logger.info(f"  Mail Username: {settings.mail_username or '(not set)'}")
        logger.info(f"  Mail Password: {'***' if settings.mail_password else '(not set)'}")
        logger.info(f"  Mail From: {settings.mail_from or '(not set)'}")
    else:
        logger.info("Email Configuration: (not configured)")
    
    # Performance Settings
    logger.info("Performance Settings:")
    logger.info(f"  Individual Model Timeout: {settings.individual_model_timeout}s")
    logger.info(f"  Model Inactivity Timeout: {settings.model_inactivity_timeout}s")
    
    # Subscription Configuration Summary
    logger.info("Subscription Tiers:")
    for tier, config in SUBSCRIPTION_CONFIG.items():
        logger.info(
            f"  {tier}: {config['daily_limit']} daily, "
            f"{config['model_limit']} models/comparison, "
            f"overage: {config['overage_allowed']}"
        )
    
    # Response tier limits removed - now using model-specific limits
    
    logger.info("=" * 80)



