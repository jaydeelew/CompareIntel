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

# MODEL-BASED PRICING: daily_limit = model responses per day (not comparisons)
# model_limit = max models per comparison (tiered: 3/6/6/9/12)
# overage_allowed = whether tier can purchase additional interactions beyond daily limit
# overage_price = price per additional model response (TBD - pricing not yet finalized)
# extended_overage_price = price per additional extended interaction (TBD - pricing not yet finalized)

SUBSCRIPTION_CONFIG: dict[str, TierConfigDict] = {
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
SUBSCRIPTION_LIMITS: dict[str, int] = {
    tier: config["daily_limit"] for tier, config in SUBSCRIPTION_CONFIG.items()
}

MODEL_LIMITS: dict[str, int] = {
    tier: config["model_limit"] for tier, config in SUBSCRIPTION_CONFIG.items()
}


# Extended tier usage tracking removed - extended mode is now unlimited (only limited by credits)


# Tier limits removed - hardcoded in code where needed
# Standard: 5000 chars input, 4000 tokens output
# Extended: 15000 chars input, 8192 tokens output


# Limits for unregistered users
ANONYMOUS_DAILY_LIMIT: int = (
    10  # Model responses per day for unregistered users (legacy, use credits instead)
)
ANONYMOUS_MODEL_LIMIT: int = 3  # Maximum models per comparison for unregistered users


# Maximum number of conversations stored per subscription tier
# Each conversation (with or without follow-ups) counts as 1 conversation

CONVERSATION_LIMITS: dict[str, int] = {
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
    "starter": 1_250,
    "starter_plus": 2_500,
    "pro": 5_000,
    "pro_plus": 10_000,
}

# Image generation credits (when token usage unavailable)
CREDITS_PER_DOLLAR: float = 100.0
IMAGE_CREDITS_PER_GENERATION: int = 5
# Image generation: unregistered users are blocked in compare-stream. Registered free tier has no
# separate daily image-run cap—only daily credits (DAILY_CREDIT_LIMITS) and model_limit apply.

# Subscription pricing (monthly USD) — illustrative placeholders for Stripe products;
# replace with values from internal OpenRouter COGS / margin analysis before launch.
TIER_PRICING: dict[str, float] = {
    "unregistered": 0.0,
    "free": 0.0,
    "starter": 9.0,
    "starter_plus": 19.0,
    "pro": 39.0,
    "pro_plus": 79.0,
}

# Overage / pack list price anchor (per 1,000 credits, USD)—keep ≥ effective $/credit at list rates
OVERAGE_PRICE_PER_1000_CREDITS: float = 12.0
