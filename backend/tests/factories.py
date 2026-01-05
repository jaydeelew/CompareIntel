"""
Test data factories for generating mock data.

This module provides factory functions for creating test data including:
- Users with different subscription tiers and roles
- Conversations and messages
- Usage logs
- API request/response mock data
- Model responses

These factories use Faker for realistic test data generation.
"""

from datetime import datetime, date, timedelta
from typing import Optional, Dict, List, Any
from passlib.context import CryptContext
from sqlalchemy.orm import Session
from faker import Faker

from app.models import (
    User,
    UserPreference,
    Conversation,
    ConversationMessage,
    UsageLog,
    SubscriptionHistory,
    PaymentTransaction,
    AdminActionLog,
    AppSettings,
)
from app.types import SubscriptionTier, SubscriptionStatus, SubscriptionPeriod, UserRole

fake = Faker()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Default test password
DEFAULT_TEST_PASSWORD = "test_password_123"


# ============================================================================
# User Factories
# ============================================================================


def create_user(
    db: Session,
    email: Optional[str] = None,
    password: str = DEFAULT_TEST_PASSWORD,
    subscription_tier: SubscriptionTier = "free",
    subscription_status: SubscriptionStatus = "active",
    subscription_period: SubscriptionPeriod = "monthly",
    is_verified: bool = True,
    is_active: bool = True,
    role: UserRole = "user",
    is_admin: bool = False,
    monthly_overage_count: int = 0,
    mock_mode_enabled: bool = False,
    monthly_credits_allocated: Optional[int] = None,
    credits_used_this_period: int = 0,
    total_credits_used: int = 0,
    billing_period_start: Optional[datetime] = None,
    billing_period_end: Optional[datetime] = None,
    credits_reset_at: Optional[datetime] = None,
    **kwargs,
) -> User:
    """
    Create a test user with specified attributes.
    
    Args:
        db: Database session
        email: User email (generated if not provided)
        password: User password (default: "test_password_123")
        subscription_tier: Subscription tier (default: "free")
        subscription_status: Subscription status (default: "active")
        subscription_period: Subscription period (default: "monthly")
        is_verified: Whether email is verified (default: True)
        is_active: Whether account is active (default: True)
        role: User role (default: "user")
        is_admin: Whether user is admin (default: False)
        monthly_overage_count: Monthly overage count (default: 0)
        mock_mode_enabled: Whether mock mode is enabled (default: False)
        monthly_credits_allocated: Monthly credits allocated (default: None, will be set based on tier)
        credits_used_this_period: Credits used in current period (default: 0)
        total_credits_used: Lifetime total credits used (default: 0)
        billing_period_start: Start of billing period (default: None)
        billing_period_end: End of billing period (default: None)
        credits_reset_at: When credits reset (default: None)
        **kwargs: Additional User model attributes
        
    Returns:
        Created User instance
    """
    if email is None:
        email = fake.email()
    
    # Hash password
    password_hash = pwd_context.hash(password)
    
    # Set subscription dates
    subscription_start_date = datetime.now() - timedelta(days=30)
    subscription_end_date = subscription_start_date + timedelta(days=365 if subscription_period == "yearly" else 30)
    
    user = User(
        email=email,
        password_hash=password_hash,
        subscription_tier=subscription_tier,
        subscription_status=subscription_status,
        subscription_period=subscription_period,
        subscription_start_date=subscription_start_date,
        subscription_end_date=subscription_end_date,
        is_verified=is_verified,
        is_active=is_active,
        role=role,
        is_admin=is_admin,
        monthly_overage_count=monthly_overage_count,
        mock_mode_enabled=mock_mode_enabled,
        overage_reset_date=date.today(),
        monthly_credits_allocated=monthly_credits_allocated,
        credits_used_this_period=credits_used_this_period,
        total_credits_used=total_credits_used,
        billing_period_start=billing_period_start,
        billing_period_end=billing_period_end,
        credits_reset_at=credits_reset_at,
        **kwargs,
    )
    
    db.add(user)
    db.commit()
    db.refresh(user)
    
    return user


def create_free_user(db: Session, **kwargs) -> User:
    """Create a free tier user."""
    return create_user(db, subscription_tier="free", **kwargs)


def create_starter_user(db: Session, **kwargs) -> User:
    """Create a starter tier user."""
    return create_user(db, subscription_tier="starter", **kwargs)


def create_starter_plus_user(db: Session, **kwargs) -> User:
    """Create a starter_plus tier user."""
    return create_user(db, subscription_tier="starter_plus", **kwargs)


def create_pro_user(db: Session, **kwargs) -> User:
    """Create a pro tier user."""
    return create_user(db, subscription_tier="pro", **kwargs)


def create_pro_plus_user(db: Session, **kwargs) -> User:
    """Create a pro_plus tier user."""
    return create_user(db, subscription_tier="pro_plus", **kwargs)


def create_admin_user(
    db: Session,
    role: UserRole = "admin",
    is_admin: bool = True,
    **kwargs,
) -> User:
    """Create an admin user."""
    return create_user(
        db,
        role=role,
        is_admin=is_admin,
        subscription_tier="pro",  # Admins typically have pro tier
        **kwargs,
    )


def create_super_admin_user(db: Session, **kwargs) -> User:
    """Create a super_admin user."""
    return create_admin_user(db, role="super_admin", **kwargs)


def create_moderator_user(db: Session, **kwargs) -> User:
    """Create a moderator user."""
    return create_user(db, role="moderator", **kwargs)


def create_unverified_user(db: Session, **kwargs) -> User:
    """Create an unverified user."""
    return create_user(db, is_verified=False, **kwargs)


def create_inactive_user(db: Session, **kwargs) -> User:
    """Create an inactive user."""
    return create_user(db, is_active=False, **kwargs)


# ============================================================================
# User Preference Factories
# ============================================================================


def create_user_preference(
    db: Session,
    user: User,
    preferred_models: Optional[List[str]] = None,
    theme: str = "light",
    email_notifications: bool = True,
    usage_alerts: bool = True,
) -> UserPreference:
    """
    Create user preferences for a user.
    
    Args:
        db: Database session
        user: User instance
        preferred_models: List of preferred model IDs (default: None)
        theme: UI theme (default: "light")
        email_notifications: Email notifications enabled (default: True)
        usage_alerts: Usage alerts enabled (default: True)
        
    Returns:
        Created UserPreference instance
    """
    import json
    
    preference = UserPreference(
        user_id=user.id,
        preferred_models=json.dumps(preferred_models) if preferred_models else None,
        theme=theme,
        email_notifications=email_notifications,
        usage_alerts=usage_alerts,
    )
    
    db.add(preference)
    db.commit()
    db.refresh(preference)
    
    return preference


# ============================================================================
# Conversation Factories
# ============================================================================


def create_conversation(
    db: Session,
    user: User,
    title: Optional[str] = None,
    input_data: Optional[str] = None,
    models_used: Optional[List[str]] = None,
    **kwargs,
) -> Conversation:
    """
    Create a conversation for a user.
    
    Args:
        db: Database session
        user: User instance
        title: Conversation title (generated if not provided)
        input_data: Input prompt (generated if not provided)
        models_used: List of model IDs used (default: ["openai/gpt-4"])
        **kwargs: Additional Conversation model attributes
        
    Returns:
        Created Conversation instance
    """
    import json
    
    if title is None:
        title = fake.sentence(nb_words=4)
    
    if input_data is None:
        input_data = fake.text(max_nb_chars=500)
    
    if models_used is None:
        models_used = ["openai/gpt-4"]
    
    conversation = Conversation(
        user_id=user.id,
        title=title,
        input_data=input_data,
        models_used=json.dumps(models_used),
        **kwargs,
    )
    
    db.add(conversation)
    db.commit()
    db.refresh(conversation)
    
    return conversation


def create_conversation_message(
    db: Session,
    conversation: Conversation,
    role: str = "assistant",
    content: Optional[str] = None,
    model_id: Optional[str] = None,
    success: bool = True,
    processing_time_ms: Optional[int] = None,
) -> ConversationMessage:
    """
    Create a conversation message.
    
    Args:
        db: Database session
        conversation: Conversation instance
        role: Message role ("user" or "assistant")
        content: Message content (generated if not provided)
        model_id: Model ID that generated the response (for assistant messages)
        success: Whether the message was successful (default: True)
        processing_time_ms: Processing time in milliseconds (default: random)
        
    Returns:
        Created ConversationMessage instance
    """
    if content is None:
        if role == "user":
            content = fake.text(max_nb_chars=200)
        else:
            content = fake.text(max_nb_chars=1000)
    
    if processing_time_ms is None:
        processing_time_ms = fake.random_int(min=100, max=5000)
    
    message = ConversationMessage(
        conversation_id=conversation.id,
        role=role,
        content=content,
        model_id=model_id,
        success=success,
        processing_time_ms=processing_time_ms,
    )
    
    db.add(message)
    db.commit()
    db.refresh(message)
    
    return message


# ============================================================================
# Usage Log Factories
# ============================================================================


def create_usage_log(
    db: Session,
    user: Optional[User] = None,
    ip_address: Optional[str] = None,
    browser_fingerprint: Optional[str] = None,
    models_used: Optional[List[str]] = None,
    input_length: Optional[int] = None,
    models_requested: Optional[int] = None,
    models_successful: Optional[int] = None,
    models_failed: Optional[int] = None,
    processing_time_ms: Optional[int] = None,
    estimated_cost: Optional[float] = None,
    is_overage: bool = False,
    overage_charge: Optional[float] = None,
) -> UsageLog:
    """
    Create a usage log entry.
    
    Args:
        db: Database session
        user: User instance (None for anonymous users)
        ip_address: IP address (generated if not provided)
        browser_fingerprint: Browser fingerprint hash (generated if not provided)
        models_used: List of model IDs used (default: ["openai/gpt-4"])
        input_length: Input length in characters (default: random)
        models_requested: Number of models requested (default: len(models_used))
        models_successful: Number of successful models (default: models_requested)
        models_failed: Number of failed models (default: 0)
        processing_time_ms: Processing time in milliseconds (default: random)
        estimated_cost: Estimated cost in USD (default: random)
        is_overage: Whether this is an overage usage (default: False)
        overage_charge: Overage charge in USD (default: 0)
        
    Returns:
        Created UsageLog instance
    """
    import json
    import hashlib
    
    if ip_address is None:
        ip_address = fake.ipv4()
    
    if browser_fingerprint is None:
        fingerprint_data = fake.uuid4()
        browser_fingerprint = hashlib.sha256(fingerprint_data.encode()).hexdigest()
    
    if models_used is None:
        models_used = ["openai/gpt-4"]
    
    if input_length is None:
        input_length = fake.random_int(min=100, max=5000)
    
    if models_requested is None:
        models_requested = len(models_used)
    
    if models_successful is None:
        models_successful = models_requested
    
    if models_failed is None:
        models_failed = 0
    
    if processing_time_ms is None:
        processing_time_ms = fake.random_int(min=500, max=10000)
    
    if estimated_cost is None:
        estimated_cost = round(fake.random.uniform(0.01, 1.0), 4)
    
    if overage_charge is None:
        overage_charge = round(estimated_cost * 0.1, 4) if is_overage else 0
    
    usage_log = UsageLog(
        user_id=user.id if user else None,
        ip_address=ip_address,
        browser_fingerprint=browser_fingerprint,
        models_used=json.dumps(models_used),
        input_length=input_length,
        models_requested=models_requested,
        models_successful=models_successful,
        models_failed=models_failed,
        processing_time_ms=processing_time_ms,
        estimated_cost=estimated_cost,
        is_overage=is_overage,
        overage_charge=overage_charge,
    )
    
    db.add(usage_log)
    db.commit()
    db.refresh(usage_log)
    
    return usage_log


# ============================================================================
# Subscription History Factories
# ============================================================================


def create_subscription_history(
    db: Session,
    user: User,
    previous_tier: Optional[str] = None,
    new_tier: Optional[str] = None,
    period: Optional[str] = None,
    amount_paid: Optional[float] = None,
    stripe_payment_id: Optional[str] = None,
    reason: str = "upgrade",
) -> SubscriptionHistory:
    """
    Create a subscription history entry.
    
    Args:
        db: Database session
        user: User instance
        previous_tier: Previous subscription tier (default: None)
        new_tier: New subscription tier (default: user's current tier)
        period: Subscription period (default: user's current period)
        amount_paid: Amount paid (default: random)
        stripe_payment_id: Stripe payment ID (default: generated)
        reason: Reason for change (default: "upgrade")
        
    Returns:
        Created SubscriptionHistory instance
    """
    if new_tier is None:
        new_tier = user.subscription_tier
    
    if period is None:
        period = user.subscription_period
    
    if amount_paid is None:
        amount_paid = round(fake.random.uniform(10.0, 100.0), 2)
    
    if stripe_payment_id is None:
        stripe_payment_id = f"pi_{fake.uuid4().replace('-', '')}"
    
    history = SubscriptionHistory(
        user_id=user.id,
        previous_tier=previous_tier,
        new_tier=new_tier,
        period=period,
        amount_paid=amount_paid,
        stripe_payment_id=stripe_payment_id,
        reason=reason,
    )
    
    db.add(history)
    db.commit()
    db.refresh(history)
    
    return history


# ============================================================================
# Payment Transaction Factories
# ============================================================================


def create_payment_transaction(
    db: Session,
    user: User,
    stripe_payment_intent_id: Optional[str] = None,
    amount: Optional[float] = None,
    currency: str = "USD",
    status: str = "succeeded",
    description: Optional[str] = None,
) -> PaymentTransaction:
    """
    Create a payment transaction.
    
    Args:
        db: Database session
        user: User instance
        stripe_payment_intent_id: Stripe payment intent ID (default: generated)
        amount: Transaction amount (default: random)
        currency: Currency code (default: "USD")
        status: Transaction status (default: "succeeded")
        description: Transaction description (default: generated)
        
    Returns:
        Created PaymentTransaction instance
    """
    if stripe_payment_intent_id is None:
        stripe_payment_intent_id = f"pi_{fake.uuid4().replace('-', '')}"
    
    if amount is None:
        amount = round(fake.random.uniform(10.0, 100.0), 2)
    
    if description is None:
        description = f"Subscription payment for {user.subscription_tier} tier"
    
    transaction = PaymentTransaction(
        user_id=user.id,
        stripe_payment_intent_id=stripe_payment_intent_id,
        amount=amount,
        currency=currency,
        status=status,
        description=description,
    )
    
    db.add(transaction)
    db.commit()
    db.refresh(transaction)
    
    return transaction


# ============================================================================
# Admin Action Log Factories
# ============================================================================


def create_admin_action_log(
    db: Session,
    admin_user: User,
    target_user: Optional[User] = None,
    action_type: str = "user_update",
    action_description: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> AdminActionLog:
    """
    Create an admin action log entry.
    
    Args:
        db: Database session
        admin_user: Admin user who performed the action
        target_user: Target user (if applicable)
        action_type: Type of action (default: "user_update")
        action_description: Action description (default: generated)
        details: Action details as dict (will be JSON encoded)
        ip_address: IP address (default: generated)
        user_agent: User agent string (default: generated)
        
    Returns:
        Created AdminActionLog instance
    """
    import json
    
    if action_description is None:
        action_description = f"Admin {action_type} action performed"
    
    if ip_address is None:
        ip_address = fake.ipv4()
    
    if user_agent is None:
        user_agent = fake.user_agent()
    
    log = AdminActionLog(
        admin_user_id=admin_user.id,
        target_user_id=target_user.id if target_user else None,
        action_type=action_type,
        action_description=action_description,
        details=json.dumps(details) if details else None,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    
    db.add(log)
    db.commit()
    db.refresh(log)
    
    return log


# ============================================================================
# App Settings Factories
# ============================================================================


def create_app_settings(
    db: Session,
    anonymous_mock_mode_enabled: bool = False,
    active_search_provider: Optional[str] = None,
) -> AppSettings:
    """
    Create or update app settings.
    
    Note: Only one AppSettings row should exist (id=1).
    This function will update existing settings if they exist.
    
    Args:
        db: Database session
        anonymous_mock_mode_enabled: Enable mock mode for anonymous users (default: False)
        active_search_provider: Active search provider name (default: None)
        
    Returns:
        AppSettings instance
    """
    settings = db.query(AppSettings).filter(AppSettings.id == 1).first()
    
    if settings:
        settings.anonymous_mock_mode_enabled = anonymous_mock_mode_enabled
        if active_search_provider is not None:
            settings.active_search_provider = active_search_provider
        db.commit()
        db.refresh(settings)
    else:
        settings = AppSettings(
            id=1,
            anonymous_mock_mode_enabled=anonymous_mock_mode_enabled,
            active_search_provider=active_search_provider,
        )
        db.add(settings)
        db.commit()
        db.refresh(settings)
    
    return settings


# ============================================================================
# Mock API Data Generators
# ============================================================================


def generate_compare_request(
    input_data: Optional[str] = None,
    models: Optional[List[str]] = None,
    conversation_history: Optional[List[Dict[str, str]]] = None,
    browser_fingerprint: Optional[str] = None,
    tier: str = "standard",
    conversation_id: Optional[int] = None,
    enable_web_search: bool = False,
) -> Dict[str, Any]:
    """
    Generate a mock compare request payload.
    
    Args:
        input_data: Input prompt (default: generated)
        models: List of model IDs (default: ["openai/gpt-4"])
        conversation_history: Conversation history (default: None)
        browser_fingerprint: Browser fingerprint (default: generated)
        tier: Response tier (default: "standard")
        conversation_id: Conversation ID (default: None)
        enable_web_search: Enable web search for models (default: False)
        
    Returns:
        Compare request dictionary
    """
    import hashlib
    
    if input_data is None:
        input_data = fake.text(max_nb_chars=500)
    
    if models is None:
        models = ["openai/gpt-4"]
    
    if browser_fingerprint is None:
        fingerprint_data = fake.uuid4()
        browser_fingerprint = hashlib.sha256(fingerprint_data.encode()).hexdigest()
    
    request_data = {
        "input_data": input_data,
        "models": models,
        "tier": tier,
    }
    
    if conversation_history:
        request_data["conversation_history"] = conversation_history
    
    if browser_fingerprint:
        request_data["browser_fingerprint"] = browser_fingerprint
    
    if conversation_id:
        request_data["conversation_id"] = conversation_id
    
    return request_data


def generate_model_response(
    model_id: str = "openai/gpt-4",
    response: Optional[str] = None,
    success: bool = True,
    error: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Generate a mock model response.
    
    Args:
        model_id: Model ID (default: "openai/gpt-4")
        response: Response text (default: generated)
        success: Whether request was successful (default: True)
        error: Error message if unsuccessful (default: None)
        
    Returns:
        Model response dictionary
    """
    if response is None:
        response = fake.text(max_nb_chars=1000)
    
    return {
        "model_id": model_id,
        "response": response,
        "success": success,
        "error": error,
    }


def generate_compare_response(
    models: Optional[List[str]] = None,
    results: Optional[Dict[str, str]] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Generate a mock compare response payload.
    
    Args:
        models: List of model IDs (default: ["openai/gpt-4"])
        results: Dictionary of model_id -> response (default: generated)
        metadata: Response metadata (default: generated)
        
    Returns:
        Compare response dictionary
    """
    if models is None:
        models = ["openai/gpt-4"]
    
    if results is None:
        results = {model_id: fake.text(max_nb_chars=1000) for model_id in models}
    
    if metadata is None:
        metadata = {
            "processing_time_ms": fake.random_int(min=500, max=10000),
            "successful": len(models),
            "failed": 0,
            "estimated_cost": round(fake.random.uniform(0.01, 1.0), 4),
        }
    
    return {
        "results": results,
        "metadata": metadata,
    }


def generate_auth_tokens() -> Dict[str, str]:
    """
    Generate mock auth tokens.
    
    Returns:
        Dictionary with access_token and refresh_token
    """
    return {
        "access_token": f"mock_access_token_{fake.uuid4()}",
        "refresh_token": f"mock_refresh_token_{fake.uuid4()}",
        "token_type": "bearer",
    }


def generate_user_response(user: User) -> Dict[str, Any]:
    """
    Generate a mock user response payload.
    
    Args:
        user: User instance
        
    Returns:
        User response dictionary
    """
    return {
        "id": user.id,
        "email": user.email,
        "is_verified": user.is_verified,
        "is_active": user.is_active,
        "role": user.role,
        "is_admin": user.is_admin,
        "subscription_tier": user.subscription_tier,
        "subscription_status": user.subscription_status,
        "subscription_period": user.subscription_period,
        "monthly_overage_count": user.monthly_overage_count,
        "mock_mode_enabled": user.mock_mode_enabled,
        "monthly_credits_allocated": user.monthly_credits_allocated,
        "credits_used_this_period": user.credits_used_this_period,
        "total_credits_used": user.total_credits_used,
        "billing_period_start": user.billing_period_start.isoformat() if user.billing_period_start else None,
        "billing_period_end": user.billing_period_end.isoformat() if user.billing_period_end else None,
        "credits_reset_at": user.credits_reset_at.isoformat() if user.credits_reset_at else None,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


def generate_search_result(
    title: Optional[str] = None,
    url: Optional[str] = None,
    snippet: Optional[str] = None,
    source: str = "brave",
) -> Dict[str, Any]:
    """
    Generate a mock search result.
    
    Args:
        title: Result title (default: generated)
        url: Result URL (default: generated)
        snippet: Result snippet (default: generated)
        source: Result source/provider (default: "brave")
        
    Returns:
        Search result dictionary
    """
    if title is None:
        title = fake.sentence(nb_words=5)
    
    if url is None:
        url = fake.url()
    
    if snippet is None:
        snippet = fake.text(max_nb_chars=200)
    
    return {
        "title": title,
        "url": url,
        "snippet": snippet,
        "source": source,
    }


def generate_search_results(count: int = 5, source: str = "brave") -> List[Dict[str, Any]]:
    """
    Generate multiple mock search results.
    
    Args:
        count: Number of results to generate (default: 5)
        source: Result source/provider (default: "brave")
        
    Returns:
        List of search result dictionaries
    """
    return [generate_search_result(source=source) for _ in range(count)]

