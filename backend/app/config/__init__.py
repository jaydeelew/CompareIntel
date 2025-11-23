"""
Backend configuration module.

This module provides a centralized configuration system with:
- Settings: Environment-based configuration using Pydantic Settings v2
- Constants: Application constants (tiers, limits, etc.)
- Validation: Configuration validation functions
- Helper functions: Utility functions for accessing configuration

All configuration should be imported from this module to maintain backwards
compatibility and a single source of truth.

Example:
    from app.config import settings, SUBSCRIPTION_CONFIG, get_model_limit
"""

# Import settings
from .settings import settings, Settings

# Import constants
from .constants import (
    SUBSCRIPTION_CONFIG,
    SUBSCRIPTION_LIMITS,
    MODEL_LIMITS,
    ANONYMOUS_DAILY_LIMIT,
    ANONYMOUS_MODEL_LIMIT,
    CONVERSATION_LIMITS,
)

# Import validation
from .validation import (
    validate_config,
    validate_tier_limits,
    log_configuration,
    mask_secret,
)

# Import helper functions (re-exported for backwards compatibility)
from .helpers import (
    get_model_limit,
    get_daily_limit,
    get_extended_limit,
    get_conversation_limit,
    get_tier_max_tokens,
)

__all__ = [
    # Settings
    "settings",
    "Settings",
    # Constants
    "SUBSCRIPTION_CONFIG",
    "SUBSCRIPTION_LIMITS",
    "MODEL_LIMITS",
    "ANONYMOUS_DAILY_LIMIT",
    "ANONYMOUS_MODEL_LIMIT",
    "CONVERSATION_LIMITS",
    # Validation
    "validate_config",
    "validate_tier_limits",
    "log_configuration",
    "mask_secret",
    # Helper functions
    "get_model_limit",
    "get_daily_limit",
    "get_extended_limit",
    "get_conversation_limit",
    "get_tier_max_tokens",
]

# Run validation on import (optional - can be disabled for testing)
import os

if os.getenv("SKIP_CONFIG_VALIDATION", "false").lower() != "true":
    try:
        validate_config()
    except ValueError as e:
        # Only raise in production or if explicitly configured
        if settings.environment == "production":
            raise
        # In development, just warn
        import warnings

        warnings.warn(f"Configuration validation warning: {e}", UserWarning)
