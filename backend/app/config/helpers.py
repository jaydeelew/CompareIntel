"""
Configuration helper functions.

This module provides utility functions for accessing and working with
configuration values.
"""

from typing import Dict
from .constants import (
    MODEL_LIMITS,
    SUBSCRIPTION_LIMITS,
    CONVERSATION_LIMITS,
    ANONYMOUS_DAILY_LIMIT,
)


def get_model_limit(tier: str) -> int:
    """
    Get maximum models per comparison for a given subscription tier.
    
    Args:
        tier: Subscription tier name
        
    Returns:
        Maximum number of models allowed per comparison
    """
    return MODEL_LIMITS.get(tier, 3)  # Default to free tier limit


def get_daily_limit(tier: str) -> int:
    """
    Get daily model response limit for a given subscription tier.
    
    Args:
        tier: Subscription tier name
        
    Returns:
        Daily limit for model responses
    """
    # Normalize tier name (strip whitespace, lowercase)
    normalized_tier = (tier or "").strip().lower() if tier else ""
    
    # Map common variations to standard tier names
    tier_mapping = {
        "pro+": "pro_plus",
        "pro +": "pro_plus",
        "pro-plus": "pro_plus",
        "starter+": "starter_plus",
        "starter +": "starter_plus",
        "starter-plus": "starter_plus",
    }
    normalized_tier = tier_mapping.get(normalized_tier, normalized_tier)
    
    limit = SUBSCRIPTION_LIMITS.get(normalized_tier, ANONYMOUS_DAILY_LIMIT)
    
    return limit


def get_extended_limit(tier: str) -> int:
    """
    LEGACY FUNCTION - DEPRECATED: Extended tier usage tracking removed.
    Extended mode is now unlimited (only limited by credits).
    
    Returns 0 to indicate no limit (unlimited).
    """
    return 0  # Unlimited - extended mode is only limited by credits


def get_conversation_limit(tier: str) -> int:
    """
    Get conversation history limit for a given subscription tier.
    
    Args:
        tier: Subscription tier name
        
    Returns:
        Maximum number of conversations stored (each conversation counts as 1)
    """
    return CONVERSATION_LIMITS.get(tier, 2)  # Default to anonymous limit


def get_tier_max_tokens(tier: str) -> int:
    """
    Get maximum output tokens for a given response tier.
    
    Args:
        tier: Response tier (standard, extended)
        
    Returns:
        Maximum output tokens for the tier
    """
    if tier == "extended":
        return 8192  # Extended mode: 8K tokens
    return 4000  # Standard mode: 4K tokens

