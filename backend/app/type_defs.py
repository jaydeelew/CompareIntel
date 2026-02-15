"""
Custom types for CompareIntel backend.

This module defines TypedDict types for structured dictionaries and
custom type aliases for database models and common data structures.
"""

from datetime import datetime
from typing import Any, Literal, TypedDict

SubscriptionTier = Literal["free", "starter", "starter_plus", "pro", "pro_plus", "unregistered"]
SubscriptionStatus = Literal["active", "cancelled", "expired"]
SubscriptionPeriod = Literal["monthly", "yearly"]
UserRole = Literal["user", "moderator", "admin", "super_admin"]


class TierConfigDict(TypedDict):
    """Configuration for a subscription tier."""

    daily_limit: int
    model_limit: int
    overage_allowed: bool
    overage_price: float | None
    extended_overage_price: float | None


class ModelInfoDict(TypedDict, total=False):
    """Information about an AI model."""

    id: str
    name: str
    description: str
    category: str
    provider: str
    available: bool  # Optional field


class AnonymousRateLimitData(TypedDict, total=False):
    """Storage structure for unregistered user rate limiting."""

    count: int
    date: str
    first_seen: datetime | None
    timezone: str  # IANA timezone string (e.g., "America/Chicago")
    last_reset_at: datetime | None  # UTC timestamp of last reset (for abuse prevention)


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


class ConversationMessageDict(TypedDict):
    """Dictionary representation of a conversation message."""

    role: str  # "user" or "assistant"
    content: str


class ModelResponseDict(TypedDict):
    """Response from a single model."""

    model_id: str
    response: str
    success: bool
    error: str | None


class BatchResultsDict(TypedDict):
    """Results from a batch of model calls."""

    results: dict[str, str]
    successful: int
    failed: int
    processing_time_ms: int | None


class ConnectionQualityDict(TypedDict, total=False):
    """Connection quality test results."""

    response_time: float
    quality: str
    time_multiplier: float
    success: bool
    error: str | None


class AdminActionDetailsDict(TypedDict, total=False):
    """Details for an admin action log entry."""

    previous_value: Any
    new_value: Any
    action_reason: str | None
    additional_info: str | None


class AdminStatsDict(TypedDict):
    """Admin dashboard statistics."""

    total_users: int
    active_users: int
    verified_users: int
    users_by_tier: dict[str, int]
    users_by_role: dict[str, int]
    recent_registrations: int
    total_usage_today: int
    admin_actions_today: int


class EmailConfigDict(TypedDict, total=False):
    """Email configuration dictionary."""

    username: str
    password: str
    from_email: str
    server: str
    port: int


class ModelStatsDict(TypedDict, total=False):
    """Statistics for a model's performance."""

    success: int
    failure: int
    last_error: str | None
    last_success: datetime | None


# Type aliases for SQLAlchemy model instances
# They're used for type hints but don't create actual new types
# Import the actual models when needed:
#   from .models import User, Conversation, UsageLog, etc.

UserId = int
ConversationId = int
UsageLogId = int
MessageId = int
