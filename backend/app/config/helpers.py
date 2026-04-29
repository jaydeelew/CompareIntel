"""
Configuration helper functions.

This module provides utility functions for accessing and working with
configuration values.
"""

from .constants import (
    HISTORY_ENTRY_LIMITS,
    MODEL_LIMITS,
)


def _normalize_tier_name(tier: str | None) -> str:
    if tier is None or str(tier).strip() == "":
        return ""
    normalized = str(tier).strip().lower()
    tier_mapping = {
        "pro+": "pro_plus",
        "pro +": "pro_plus",
        "pro-plus": "pro_plus",
        "starter+": "starter_plus",
        "starter +": "starter_plus",
        "starter-plus": "starter_plus",
    }
    return tier_mapping.get(normalized, normalized)


def get_model_limit(tier: str) -> int:
    """
    Get maximum models per comparison for a given subscription tier.

    Args:
        tier: Subscription tier name

    Returns:
        Maximum number of models allowed per comparison
    """
    return MODEL_LIMITS.get(tier, 3)  # Default to free tier limit


def get_history_entry_limit(tier: str | None) -> int:
    """
    Get maximum comparison history entries stored for a subscription tier.

    Args:
        tier: Subscription tier name (including unregistered)

    Returns:
        Maximum number of history entries (conversations) kept; oldest trimmed when exceeded.
    """
    normalized = _normalize_tier_name(tier)
    return HISTORY_ENTRY_LIMITS.get(normalized, HISTORY_ENTRY_LIMITS["unregistered"])
