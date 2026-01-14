"""
Custom types for CompareIntel backend.

This module defines TypedDict types for structured dictionaries and
custom type aliases for database models and common data structures.
"""

from typing import TypedDict, Dict, List, Optional, Any, Literal
from datetime import datetime, date


# ============================================================================
# Subscription Tier Types
# ============================================================================

SubscriptionTier = Literal["free", "starter", "starter_plus", "pro", "pro_plus", "unregistered"]
SubscriptionStatus = Literal["active", "cancelled", "expired"]
SubscriptionPeriod = Literal["monthly", "yearly"]
UserRole = Literal["user", "moderator", "admin", "super_admin"]


# ============================================================================
# TypedDict for Configuration Structures
# ============================================================================


class TierConfigDict(TypedDict):
    """Configuration for a subscription tier."""
    daily_limit: int
    model_limit: int
    overage_allowed: bool
    overage_price: Optional[float]
    extended_overage_price: Optional[float]


class ModelInfoDict(TypedDict, total=False):
    """Information about an AI model."""
    id: str
    name: str
    description: str
    category: str
    provider: str
    available: bool  # Optional field


# ============================================================================
# TypedDict for Rate Limiting Structures
# ============================================================================


class AnonymousRateLimitData(TypedDict, total=False):
    """Storage structure for unregistered user rate limiting."""
    count: int
    date: str
    first_seen: Optional[datetime]
    timezone: str  # IANA timezone string (e.g., "America/Chicago")
    last_reset_at: Optional[datetime]  # UTC timestamp of last reset (for abuse prevention)


class UsageStatsDict(TypedDict):
    """Usage statistics for a user."""
    daily_usage: int
    daily_limit: int
    remaining_usage: int
    subscription_tier: str
    usage_reset_date: str


class ExtendedUsageStatsDict(TypedDict):
    """Extended tier usage statistics."""
    daily_extended_usage: int
    daily_extended_limit: int
    remaining_extended_usage: int
    subscription_tier: str
    usage_reset_date: str


class FullUsageStatsDict(TypedDict):
    """Complete usage statistics including extended tier."""
    daily_usage: int
    daily_limit: int
    remaining_usage: int
    daily_extended_usage: int
    daily_extended_limit: int
    remaining_extended_usage: int
    subscription_tier: str
    usage_reset_date: str


# ============================================================================
# TypedDict for Model Runner Structures
# ============================================================================


class ConversationMessageDict(TypedDict):
    """Dictionary representation of a conversation message."""
    role: str  # "user" or "assistant"
    content: str


class ModelResponseDict(TypedDict):
    """Response from a single model."""
    model_id: str
    response: str
    success: bool
    error: Optional[str]


class BatchResultsDict(TypedDict):
    """Results from a batch of model calls."""
    results: Dict[str, str]
    successful: int
    failed: int
    processing_time_ms: Optional[int]


class ConnectionQualityDict(TypedDict, total=False):
    """Connection quality test results."""
    response_time: float
    quality: str
    time_multiplier: float
    success: bool
    error: Optional[str]


# ============================================================================
# TypedDict for Admin Structures
# ============================================================================


class AdminActionDetailsDict(TypedDict, total=False):
    """Details for an admin action log entry."""
    previous_value: Any
    new_value: Any
    action_reason: Optional[str]
    additional_info: Optional[str]


class AdminStatsDict(TypedDict):
    """Admin dashboard statistics."""
    total_users: int
    active_users: int
    verified_users: int
    users_by_tier: Dict[str, int]
    users_by_role: Dict[str, int]
    recent_registrations: int
    total_usage_today: int
    admin_actions_today: int


# ============================================================================
# TypedDict for Email Structures
# ============================================================================


class EmailConfigDict(TypedDict, total=False):
    """Email configuration dictionary."""
    username: str
    password: str
    from_email: str
    server: str
    port: int


# ============================================================================
# TypedDict for Model Stats
# ============================================================================


class ModelStatsDict(TypedDict, total=False):
    """Statistics for a model's performance."""
    success: int
    failure: int
    last_error: Optional[str]
    last_success: Optional[datetime]


# ============================================================================
# Type Aliases for Database Models
# ============================================================================

# These are type aliases that represent SQLAlchemy model instances
# They're used for type hints but don't create actual new types
# Import the actual models when needed:
#   from .models import User, Conversation, UsageLog, etc.

UserId = int
ConversationId = int
UsageLogId = int
MessageId = int

