"""
Pydantic schemas for request/response validation.

This module defines all data models for API requests and responses.
"""

from pydantic import BaseModel, EmailStr, Field, field_validator, field_serializer, ConfigDict
from typing import Optional, List, Dict, Literal, Any
from datetime import datetime, date


# ============================================================================
# User Schemas
# ============================================================================


class UserRegister(BaseModel):
    """Schema for user registration request."""
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "email": "user@example.com",
                "password": "SecurePass123!",
                "recaptcha_token": "03AGdBq24..."
            }
        }
    )

    email: EmailStr
    password: str = Field(..., min_length=8)
    recaptcha_token: Optional[str] = None

    @field_validator("password")
    @classmethod
    def password_strength(cls, v):
        """Validate password meets strength requirements."""
        if not any(char.isdigit() for char in v):
            raise ValueError("Password must contain at least one digit")
        if not any(char.isupper() for char in v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not any(char.islower() for char in v):
            raise ValueError("Password must contain at least one lowercase letter")
        # Check for special character
        special_chars = "!@#$%^&*()_+-=[]{};':\"\\|,.<>/?"
        if not any(char in special_chars for char in v):
            raise ValueError("Password must contain at least one special character (!@#$%^&*()_+-=[]{};':\"|,.<>/?)")
        return v


class UserLogin(BaseModel):
    """Schema for user login request."""
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "email": "user@example.com",
                "password": "SecurePass123!"
            }
        }
    )

    email: EmailStr
    password: str


class UserResponse(BaseModel):
    """Schema for user data response."""

    id: int
    email: str
    is_verified: bool
    is_active: bool
    role: str
    is_admin: bool
    subscription_tier: str
    subscription_status: str
    subscription_period: str
    monthly_overage_count: int
    mock_mode_enabled: Optional[bool] = False  # Testing feature for admins
    created_at: datetime
    updated_at: Optional[datetime] = None
    # Credit-based system fields
    monthly_credits_allocated: Optional[int] = None
    credits_used_this_period: Optional[int] = None
    total_credits_used: Optional[int] = None
    billing_period_start: Optional[datetime] = None
    billing_period_end: Optional[datetime] = None
    credits_reset_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class TokenResponse(BaseModel):
    """Schema for authentication token response."""
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
                "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
                "token_type": "bearer"
            }
        }
    )

    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshTokenRequest(BaseModel):
    """Schema for token refresh request."""

    refresh_token: str


# ============================================================================
# Email Verification Schemas
# ============================================================================


class EmailVerification(BaseModel):
    """Schema for email verification request."""

    token: str


class ResendVerificationRequest(BaseModel):
    """Schema for resending verification email."""

    email: EmailStr


# ============================================================================
# Password Reset Schemas
# ============================================================================


class PasswordResetRequest(BaseModel):
    """Schema for password reset request."""

    email: EmailStr


class PasswordReset(BaseModel):
    """Schema for completing password reset."""

    token: str
    new_password: str = Field(..., min_length=8)

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v):
        """Validate password meets strength requirements."""
        if not any(char.isdigit() for char in v):
            raise ValueError("Password must contain at least one digit")
        if not any(char.isupper() for char in v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not any(char.islower() for char in v):
            raise ValueError("Password must contain at least one lowercase letter")
        # Check for special character
        special_chars = "!@#$%^&*()_+-=[]{};':\"\\|,.<>/?"
        if not any(char in special_chars for char in v):
            raise ValueError("Password must contain at least one special character (!@#$%^&*()_+-=[]{};':\"|,.<>/?)")
        return v


# ============================================================================
# Subscription Schemas
# ============================================================================


class SubscriptionUpdate(BaseModel):
    """Schema for updating subscription."""

    tier: Literal["free", "starter", "starter_plus", "pro", "pro_plus"] = Field(
        ..., description="Subscription tier"
    )
    period: Literal["monthly", "yearly"] = Field(..., description="Billing period")


class SubscriptionInfo(BaseModel):
    """Schema for subscription information response."""

    tier: str
    status: str
    period: str
    start_date: Optional[datetime]
    end_date: Optional[datetime]
    daily_limit: int
    daily_usage: int
    remaining_usage: int


# ============================================================================
# Usage Schemas
# ============================================================================


class UsageStats(BaseModel):
    """Schema for user usage statistics."""

    daily_usage: int
    daily_limit: int
    remaining_usage: int
    subscription_tier: str
    usage_reset_date: str


class UsageHistory(BaseModel):
    """Schema for usage history item."""

    id: int
    models_used: List[str] = Field(..., min_length=1, description="List of model IDs used")
    input_length: int = Field(..., ge=0, description="Input text length in characters")
    models_successful: int = Field(..., ge=0, description="Number of successful model responses")
    models_failed: int = Field(..., ge=0, description="Number of failed model responses")
    processing_time_ms: int = Field(..., ge=0, description="Total processing time in milliseconds")
    estimated_cost: float = Field(..., ge=0, description="Estimated cost in USD")
    created_at: datetime

    @field_validator("models_used")
    @classmethod
    def validate_models_used(cls, v: List[str]) -> List[str]:
        """Validate models_used is not empty."""
        if not v:
            raise ValueError("models_used cannot be empty")
        return v

    model_config = ConfigDict(from_attributes=True)


# ============================================================================
# User Preferences Schemas
# ============================================================================


class UserPreferencesUpdate(BaseModel):
    """Schema for updating user preferences."""

    preferred_models: Optional[List[str]] = Field(None, description="List of preferred model IDs")
    theme: Optional[Literal["light", "dark"]] = Field(None, description="UI theme preference")
    email_notifications: Optional[bool] = Field(None, description="Enable email notifications")
    usage_alerts: Optional[bool] = Field(None, description="Enable usage limit alerts")

    @field_validator("preferred_models")
    @classmethod
    def validate_preferred_models(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        """Validate preferred_models list."""
        if v is not None and len(v) == 0:
            raise ValueError("preferred_models cannot be an empty list")
        return v


class UserPreferencesResponse(BaseModel):
    """Schema for user preferences response."""

    preferred_models: Optional[List[str]]
    theme: str
    email_notifications: bool
    usage_alerts: bool

    model_config = ConfigDict(from_attributes=True)


# ============================================================================
# Conversation Schemas
# ============================================================================


class ConversationListItem(BaseModel):
    """Schema for conversation list item."""

    id: int
    title: Optional[str]
    input_data: str
    models_used: List[str]
    created_at: datetime
    message_count: int

    model_config = ConfigDict(from_attributes=True)


class ConversationMessage(BaseModel):
    """Schema for a single conversation message."""

    id: int
    model_id: Optional[str] = None
    role: Literal["user", "assistant"] = Field(..., description="Message role: 'user' or 'assistant'")
    content: str = Field(..., min_length=1, description="Message content")
    input_tokens: Optional[int] = Field(None, ge=0, description="Input tokens for user messages (from OpenRouter)")
    output_tokens: Optional[int] = Field(None, ge=0, description="Output tokens for assistant messages (from OpenRouter)")
    success: bool = Field(default=True, description="Whether the message was successfully processed")
    processing_time_ms: Optional[int] = Field(None, ge=0, description="Processing time in milliseconds")
    created_at: datetime

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        """Validate role is either 'user' or 'assistant'."""
        if v not in ("user", "assistant"):
            raise ValueError("Role must be either 'user' or 'assistant'")
        return v

    model_config = ConfigDict(from_attributes=True)


class ConversationSummary(BaseModel):
    """Schema for conversation list summary."""

    id: int
    input_data: str
    models_used: List[str]
    created_at: datetime
    message_count: int

    model_config = ConfigDict(from_attributes=True)


class ConversationDetail(BaseModel):
    """Schema for detailed conversation with messages."""

    id: int
    title: Optional[str]
    input_data: str
    models_used: List[str]
    created_at: datetime
    messages: List[ConversationMessage]

    model_config = ConfigDict(from_attributes=True)


# ============================================================================
# Admin Management Schemas
# ============================================================================


class AdminUserResponse(BaseModel):
    """Schema for admin user data response."""

    id: int
    email: str
    is_verified: bool
    is_active: bool
    role: str
    is_admin: bool
    subscription_tier: str
    subscription_status: str
    subscription_period: str
    monthly_overage_count: int
    mock_mode_enabled: Optional[bool] = False  # Testing feature for admins
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class AdminUserCreate(BaseModel):
    """Schema for creating a user via admin panel."""

    email: EmailStr
    password: str = Field(..., min_length=8)
    role: str = Field(default="user", pattern="^(user|moderator|admin|super_admin)$")
    subscription_tier: str = Field(default="free", pattern="^(free|starter|starter_plus|pro|pro_plus)$")
    subscription_period: str = Field(default="monthly", pattern="^(monthly|yearly)$")
    is_active: bool = Field(default=True)
    is_verified: bool = Field(default=False)

    @field_validator("password")
    @classmethod
    def password_strength(cls, v):
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters long")
        if not any(char.isdigit() for char in v):
            raise ValueError("Password must contain at least one digit")
        if not any(char.isupper() for char in v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not any(char.islower() for char in v):
            raise ValueError("Password must contain at least one lowercase letter")
        special_chars = "!@#$%^&*()_+-=[]{};':\"\\|,.<>/?"
        if not any(char in special_chars for char in v):
            raise ValueError("Password must contain at least one special character (!@#$%^&*()_+-=[]{};':\"\\|,.<>/?)")
        return v


class AdminUserUpdate(BaseModel):
    """Schema for updating a user via admin panel."""

    email: Optional[EmailStr] = None
    role: Optional[str] = Field(None, pattern="^(user|moderator|admin|super_admin)$")
    subscription_tier: Optional[str] = Field(None, pattern="^(free|starter|starter_plus|pro|pro_plus)$")
    subscription_status: Optional[str] = Field(None, pattern="^(active|cancelled|expired)$")
    subscription_period: Optional[str] = Field(None, pattern="^(monthly|yearly)$")
    is_active: Optional[bool] = None
    is_verified: Optional[bool] = None
    monthly_overage_count: Optional[int] = Field(None, ge=0)


class AdminUserListResponse(BaseModel):
    """Schema for paginated user list response."""

    users: List[AdminUserResponse]
    total: int
    page: int
    per_page: int
    total_pages: int


class AdminActionLogResponse(BaseModel):
    """Schema for admin action log response."""

    id: int
    admin_user_id: Optional[int] = None
    admin_user_email: Optional[str] = None
    target_user_id: Optional[int] = None
    target_user_email: Optional[str] = None
    action_type: str
    action_description: str
    details: Optional[str]
    ip_address: Optional[str]
    user_agent: Optional[str]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AdminStatsResponse(BaseModel):
    """Schema for admin dashboard stats."""

    total_users: int
    active_users: int
    verified_users: int
    users_by_tier: Dict[str, int]
    users_by_role: Dict[str, int]
    recent_registrations: int  # Last 7 days
    total_usage_today: int
    admin_actions_today: int


class VisitorAnalyticsResponse(BaseModel):
    """Schema for visitor analytics stats."""

    # Overall stats
    total_unique_visitors: int  # Unique IPs all time
    total_unique_devices: int  # Unique browser fingerprints all time
    total_comparisons: int  # Total usage log entries
    
    # Time-based unique visitors
    unique_visitors_today: int
    unique_visitors_this_week: int
    unique_visitors_this_month: int
    
    # Authenticated vs anonymous breakdown
    authenticated_visitors: int  # Visitors with user_id
    anonymous_visitors: int  # Visitors without user_id
    
    # Daily breakdown (last 30 days)
    daily_breakdown: List[Dict[str, Any]]  # [{date, unique_visitors, total_comparisons}]
    
    # Recent activity
    comparisons_today: int
    comparisons_this_week: int
    comparisons_this_month: int
