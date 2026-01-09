"""
Shared test fixtures and configuration for pytest.

This module provides common fixtures used across all test modules,
including database setup, API client, and test data factories.

Phase 4, Week 9, Task 2: Enhanced test fixtures with:
- Database fixtures (in-memory SQLite for tests)
- User fixtures (different subscription tiers)
- API client fixtures
- Integration with factories module for mock data generation
"""
import sys
import os
import pytest
from unittest.mock import MagicMock, AsyncMock, patch
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from typing import Tuple, Optional

# Set environment variables to avoid email configuration issues
os.environ.setdefault('MAIL_USERNAME', '')
os.environ.setdefault('MAIL_PASSWORD', '')
os.environ.setdefault('MAIL_FROM', '')

# Set required environment variables for tests (works in both dev and production)
# These are dummy values for testing - actual API calls would fail, but tests don't make real API calls
os.environ.setdefault('SECRET_KEY', 'test-secret-key-for-testing-only-not-for-production-use-32chars')
os.environ.setdefault('OPENROUTER_API_KEY', 'test-api-key-for-testing-only')
os.environ.setdefault('ENVIRONMENT', 'development')  # Use development mode for tests

# Mock email service functions before importing app to avoid fastapi_mail import issues
# This is a known bug in fastapi-mail 1.5.2 where SecretStr is not imported
email_service_mock = MagicMock()
email_service_mock.send_verification_email = AsyncMock(return_value=None)
email_service_mock.send_password_reset_email = AsyncMock(return_value=None)
email_service_mock.send_subscription_confirmation_email = AsyncMock(return_value=None)
email_service_mock.send_usage_limit_warning_email = AsyncMock(return_value=None)
email_service_mock.EMAIL_CONFIGURED = False

# Patch the email_service module before it's imported
sys.modules['app.email_service'] = email_service_mock

# Now import app - email_service will use the mock
from app.main import app as fastapi_app  # Rename to avoid conflict with app module
from app.database import Base, get_db
from app.models import User, UsageLog

# Import factories for creating test data
from .factories import (
    create_user,
    create_free_user,
    create_starter_user,
    create_starter_plus_user,
    create_pro_user,
    create_pro_plus_user,
    create_admin_user,
    create_super_admin_user,
    create_moderator_user,
    create_unverified_user,
    create_inactive_user,
    DEFAULT_TEST_PASSWORD,
)


# In-memory SQLite database for testing
SQLALCHEMY_TEST_DATABASE_URL = "sqlite:///:memory:"

# Create test engine with in-memory database
test_engine = create_engine(
    SQLALCHEMY_TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)

# Create test session factory
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

# Patch SessionLocal in app.database to use test engine for any direct SessionLocal() calls in app code
# This ensures that when app code creates fresh sessions (like in api.py), they use the test database
import app.database
app.database.SessionLocal = TestingSessionLocal


@pytest.fixture(scope="function")
def db_session():
    """
    Create a fresh database session for each test.
    
    This fixture provides an in-memory SQLite database that is:
    - Created fresh for each test (function scope)
    - Automatically cleaned up after each test
    - Isolated from other tests
    
    Usage:
        def test_example(db_session):
            user = User(...)
            db_session.add(user)
            db_session.commit()
    """
    # Import all models to ensure they're registered with Base.metadata
    from app import models  # noqa: F401
    
    # Drop all tables first to ensure clean state
    Base.metadata.drop_all(bind=test_engine)
    
    # Create all tables with all columns
    Base.metadata.create_all(bind=test_engine)
    
    # Create a new session
    session = TestingSessionLocal()
    
    try:
        yield session
    finally:
        session.close()
        # Drop all tables after test to ensure clean state
        Base.metadata.drop_all(bind=test_engine)


@pytest.fixture(scope="function")
def client(db_session):
    """
    Create a test client with database dependency override.
    
    This fixture:
    - Overrides the get_db dependency to use test database
    - Returns a TestClient instance for making API requests
    - Clears login rate limiting between tests
    """
    def override_get_db():
        try:
            yield db_session
        finally:
            pass
    
    fastapi_app.dependency_overrides[get_db] = override_get_db
    
    # Clear login rate limiting before each test
    from app.routers.auth import failed_login_attempts
    failed_login_attempts.clear()
    
    with TestClient(fastapi_app) as test_client:
        yield test_client
    
    # Clean up dependency override and rate limiting
    fastapi_app.dependency_overrides.clear()
    failed_login_attempts.clear()


# ============================================================================
# User Fixtures - All Subscription Tiers
# ============================================================================

@pytest.fixture
def test_user(db_session):
    """
    Create a free tier test user.
    
    Returns a User instance with default test credentials.
    Password: "test_password_123" (or use DEFAULT_TEST_PASSWORD from factories)
    
    Backward compatibility: Also accepts "secret" as password for existing tests.
    """
    return create_free_user(
        db_session,
        email="test@example.com",
        password="secret",  # Keep backward compatibility
    )


@pytest.fixture
def test_user_free(db_session):
    """Create a free tier user using factories."""
    return create_free_user(db_session)


@pytest.fixture
def test_user_starter(db_session):
    """Create a starter tier user."""
    return create_starter_user(db_session)


@pytest.fixture
def test_user_starter_plus(db_session):
    """Create a starter_plus tier user."""
    return create_starter_plus_user(db_session)


@pytest.fixture
def test_user_pro(db_session):
    """Create a pro tier user."""
    return create_pro_user(db_session)


@pytest.fixture
def test_user_pro_plus(db_session):
    """Create a pro_plus tier user."""
    return create_pro_plus_user(db_session)


@pytest.fixture
def test_user_premium(db_session):
    """
    Create a premium tier test user (pro tier).
    
    Backward compatibility fixture - uses pro tier.
    Password: "secret"
    """
    return create_pro_user(
        db_session,
        email="premium@example.com",
        password="secret",  # Keep backward compatibility
    )


@pytest.fixture
def test_user_admin(db_session):
    """
    Create an admin test user.
    
    Uses "secret" as password for backward compatibility with existing tests.
    """
    return create_admin_user(
        db_session,
        email="admin@example.com",
        password="secret",  # Use "secret" for backward compatibility with tests
        role="admin",
    )


@pytest.fixture
def test_user_super_admin(db_session):
    """Create a super_admin user."""
    return create_super_admin_user(db_session)


@pytest.fixture
def test_user_moderator(db_session):
    """Create a moderator user."""
    return create_moderator_user(db_session)


@pytest.fixture
def test_user_unverified(db_session):
    """Create an unverified user."""
    return create_unverified_user(db_session)


@pytest.fixture
def test_user_inactive(db_session):
    """Create an inactive user."""
    return create_inactive_user(db_session)


# ============================================================================
# API Client Fixtures
# ============================================================================

@pytest.fixture
def authenticated_client(client, test_user):
    """
    Create a test client with authenticated free tier user.
    
    Returns a tuple of (client, user, access_token, refresh_token) for making authenticated requests.
    
    Usage:
        def test_example(authenticated_client):
            client, user, access_token, refresh_token = authenticated_client
            response = client.get("/api/endpoint")
    """
    # Login to get token
    response = client.post(
        "/api/auth/login",
        json={
            "email": test_user.email,
            "password": "secret",  # Default test password for backward compatibility
        },
    )
    assert response.status_code == 200
    data = response.json()
    access_token = data["access_token"]
    refresh_token = data["refresh_token"]
    
    # Set authorization header
    client.headers = {"Authorization": f"Bearer {access_token}"}
    
    return client, test_user, access_token, refresh_token


@pytest.fixture
def authenticated_client_starter(client, test_user_starter):
    """Create an authenticated client with starter tier user."""
    response = client.post(
        "/api/auth/login",
        json={
            "email": test_user_starter.email,
            "password": DEFAULT_TEST_PASSWORD,
        },
    )
    assert response.status_code == 200
    data = response.json()
    access_token = data["access_token"]
    refresh_token = data["refresh_token"]
    
    client.headers = {"Authorization": f"Bearer {access_token}"}
    return client, test_user_starter, access_token, refresh_token


@pytest.fixture
def authenticated_client_pro(client, test_user_pro):
    """Create an authenticated client with pro tier user."""
    response = client.post(
        "/api/auth/login",
        json={
            "email": test_user_pro.email,
            "password": DEFAULT_TEST_PASSWORD,
        },
    )
    assert response.status_code == 200
    data = response.json()
    access_token = data["access_token"]
    refresh_token = data["refresh_token"]
    
    client.headers = {"Authorization": f"Bearer {access_token}"}
    return client, test_user_pro, access_token, refresh_token


@pytest.fixture
def authenticated_client_admin(client, test_user_admin):
    """Create an authenticated client with admin user."""
    response = client.post(
        "/api/auth/login",
        json={
            "email": test_user_admin.email,
            "password": "secret",  # Backward compatibility
        },
    )
    assert response.status_code == 200
    data = response.json()
    access_token = data["access_token"]
    refresh_token = data["refresh_token"]
    
    client.headers = {"Authorization": f"Bearer {access_token}"}
    return client, test_user_admin, access_token, refresh_token


@pytest.fixture
def authenticated_client_super_admin(client, test_user_super_admin):
    """Create an authenticated client with super_admin user."""
    response = client.post(
        "/api/auth/login",
        json={
            "email": test_user_super_admin.email,
            "password": DEFAULT_TEST_PASSWORD,
        },
    )
    assert response.status_code == 200
    data = response.json()
    access_token = data["access_token"]
    refresh_token = data["refresh_token"]
    
    client.headers = {"Authorization": f"Bearer {access_token}"}
    return client, test_user_super_admin, access_token, refresh_token


def create_authenticated_client(client, user: User, password: str = DEFAULT_TEST_PASSWORD) -> Tuple[TestClient, User, str, str]:
    """
    Helper function to create an authenticated client for any user.
    
    Args:
        client: TestClient instance
        user: User instance to authenticate
        password: User password (default: DEFAULT_TEST_PASSWORD)
        
    Returns:
        Tuple of (client, user, access_token, refresh_token)
    """
    response = client.post(
        "/api/auth/login",
        json={
            "email": user.email,
            "password": password,
        },
    )
    assert response.status_code == 200
    data = response.json()
    access_token = data["access_token"]
    refresh_token = data["refresh_token"]
    
    client.headers = {"Authorization": f"Bearer {access_token}"}
    return client, user, access_token, refresh_token

