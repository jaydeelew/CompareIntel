"""
Application constants and configuration values.

This module contains all application constants including:
- Subscription tier configurations
- Rate limits
- Performance settings
- Feature flags

All constants should be imported from this module to maintain a single source of truth.
"""

from ..type_defs import TierConfigDict

# model_limit = max models per comparison (tiered: 3/6/6/9/12)
# overage_allowed = whether tier can purchase credit packs beyond monthly pool
# Usage is constrained by credits only (no separate daily model-response caps).

SUBSCRIPTION_CONFIG: dict[str, TierConfigDict] = {
    "free": {
        "model_limit": 3,
        "overage_allowed": False,
        "overage_price": None,
        "extended_overage_price": None,
    },
    "starter": {
        "model_limit": 6,
        "overage_allowed": True,
        "overage_price": 0.013,
        "extended_overage_price": None,
    },
    "starter_plus": {
        "model_limit": 6,
        "overage_allowed": True,
        "overage_price": 0.013,
        "extended_overage_price": None,
    },
    "pro": {
        "model_limit": 9,
        "overage_allowed": True,
        "overage_price": 0.013,
        "extended_overage_price": None,
    },
    "pro_plus": {
        "model_limit": 12,
        "overage_allowed": True,
        "overage_price": 0.013,
        "extended_overage_price": None,
    },
}

MODEL_LIMITS: dict[str, int] = {
    tier: config["model_limit"] for tier, config in SUBSCRIPTION_CONFIG.items()
}


# Extended tier usage tracking removed - extended mode is now unlimited (only limited by credits)


# Tier limits removed - hardcoded in code where needed
# Standard: 5000 chars input, 4000 tokens output
# Extended: 15000 chars input, 8192 tokens output


# Limits for unregistered users
ANONYMOUS_MODEL_LIMIT: int = 3  # Maximum models per comparison for unregistered users


# Maximum comparison history entries (stored conversations) per tier; oldest trimmed when exceeded.
HISTORY_ENTRY_LIMITS: dict[str, int] = {
    "unregistered": 2,
    "free": 3,
    "starter": 10,
    "starter_plus": 20,
    "pro": 40,
    "pro_plus": 80,
}


# Credit allocations for each tier (whole credits debited per successful compare).
# Text usage is cost-based (OpenRouter USD × CREDITS_PER_DOLLAR); legacy token
# weighting is only a fallback when list pricing is unavailable.

# Daily credit limits for free tiers (resets daily)
DAILY_CREDIT_LIMITS: dict[str, int] = {
    "unregistered": 50,  # 50 credits/day (~10 exchanges/day)
    "free": 100,  # 100 credits/day (~20 exchanges/day)
}

# Monthly credit allocations for paid tiers
MONTHLY_CREDIT_ALLOCATIONS: dict[str, int] = {
    "starter": 720,
    "starter_plus": 1_600,
    "pro": 3_300,
    "pro_plus": 6_700,
}

# Image generation credits (when token usage unavailable)
CREDITS_PER_DOLLAR: float = 100.0
IMAGE_CREDITS_PER_GENERATION: int = 5
# Image generation: unregistered users are blocked in compare-stream. Registered free tier has no
# separate daily image-run cap—only daily credits (DAILY_CREDIT_LIMITS) and model_limit apply.

# Subscription pricing (monthly USD) — must match Stripe recurring Price amounts and frontend copy.
# Tier/credit ladder 2026-04-01: pool $/credit strictly decreases at higher tiers; thin margin vs
# full-burn COGS (MONTHLY_CREDIT_ALLOCATIONS / CREDITS_PER_DOLLAR). See docs/internal/PRICING_SHEET.md.
TIER_PRICING: dict[str, float] = {
    "unregistered": 0.0,
    "free": 0.0,
    "starter": 9.0,
    "starter_plus": 19.0,
    "pro": 39.0,
    "pro_plus": 79.0,
}

# Flat list rate for credits beyond the monthly pool (USD per credit); same for all paid tiers.
OVERAGE_USD_PER_CREDIT: float = 0.013
