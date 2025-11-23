"""
Application constants and configuration values.

This module contains all application constants including:
- Subscription tier configurations
- Rate limits
- Performance settings
- Feature flags

All constants should be imported from this module to maintain a single source of truth.
"""

from typing import Dict, Any
from ..types import TierConfigDict, TierLimitsDict


# ============================================================================
# Subscription Tier Configuration
# ============================================================================
# MODEL-BASED PRICING: daily_limit = model responses per day (not comparisons)
# model_limit = max models per comparison (tiered: 3/6/6/9/12)
# overage_allowed = whether tier can purchase additional interactions beyond daily limit
# overage_price = price per additional model response (TBD - pricing not yet finalized)
# extended_overage_price = price per additional extended interaction (TBD - pricing not yet finalized)

SUBSCRIPTION_CONFIG: Dict[str, TierConfigDict] = {
    "free": {
        "daily_limit": 20,
        "model_limit": 3,
        "overage_allowed": False,
        "overage_price": None,
        "extended_overage_price": None,
    },  # Free registered users
    "starter": {
        "daily_limit": 50,
        "model_limit": 6,
        "overage_allowed": True,
        "overage_price": None,
        "extended_overage_price": None,
    },  # Pricing TBD
    "starter_plus": {
        "daily_limit": 100,
        "model_limit": 6,
        "overage_allowed": True,
        "overage_price": None,
        "extended_overage_price": None,
    },  # Pricing TBD
    "pro": {
        "daily_limit": 200,
        "model_limit": 9,
        "overage_allowed": True,
        "overage_price": None,
        "extended_overage_price": None,
    },  # Pricing TBD
    "pro_plus": {
        "daily_limit": 400,
        "model_limit": 12,
        "overage_allowed": True,
        "overage_price": None,
        "extended_overage_price": None,
    },  # Pricing TBD
}

# Backwards compatibility - extract limits
SUBSCRIPTION_LIMITS: Dict[str, int] = {
    tier: config["daily_limit"] for tier, config in SUBSCRIPTION_CONFIG.items()
}

MODEL_LIMITS: Dict[str, int] = {
    tier: config["model_limit"] for tier, config in SUBSCRIPTION_CONFIG.items()
}


# Extended tier usage tracking removed - extended mode is now unlimited (only limited by credits)


# Tier limits removed - hardcoded in code where needed
# Standard: 5000 chars input, 4000 tokens output
# Extended: 15000 chars input, 8192 tokens output


# ============================================================================
# Anonymous User Limits
# ============================================================================
# Limits for unregistered (anonymous) users

ANONYMOUS_DAILY_LIMIT: int = 10  # Model responses per day for anonymous users (legacy, use credits instead)
ANONYMOUS_MODEL_LIMIT: int = 3  # Maximum models per comparison for anonymous users


# ============================================================================
# Conversation History Limits
# ============================================================================
# Maximum number of conversations stored per subscription tier
# Each conversation (with or without follow-ups) counts as 1 conversation

CONVERSATION_LIMITS: Dict[str, int] = {
    "anonymous": 2,
    "free": 3,
    "starter": 10,
    "starter_plus": 20,
    "pro": 40,
    "pro_plus": 80,
}


# ============================================================================
# Credit-Based System Configuration
# ============================================================================
# Credit allocations for each tier
# 1 credit = 1,000 effective tokens
# Effective tokens = input_tokens + (output_tokens × 2.5)
# Average exchange: ~5 credits (mix of standard/extended/follow-ups)

# Daily credit limits for free tiers (resets daily)
DAILY_CREDIT_LIMITS: Dict[str, int] = {
    "anonymous": 50,   # 50 credits/day (~10 exchanges/day)
    "free": 100,       # 100 credits/day (~20 exchanges/day)
}

# Monthly credit allocations for paid tiers
MONTHLY_CREDIT_ALLOCATIONS: Dict[str, int] = {
    "starter": 1_200,      # $9.95/month - ~240 exchanges/month (~8/day)
    "starter_plus": 2_500,  # $19.95/month - ~500 exchanges/month (~17/day)
    "pro": 5_000,          # $39.95/month - ~1,000 exchanges/month (~33/day)
    "pro_plus": 10_000,    # $79.95/month - ~2,000 exchanges/month (~67/day)
}

# Subscription pricing (monthly)
TIER_PRICING: Dict[str, float] = {
    "anonymous": 0.0,
    "free": 0.0,
    "starter": 9.95,
    "starter_plus": 19.95,
    "pro": 39.95,
    "pro_plus": 79.95,
}

# Overage pricing (per 1,000 credits)
OVERAGE_PRICE_PER_1000_CREDITS: float = 12.0  # $12 per 1,000 credits ($0.012 per credit)

