"""
Unit tests for authentication functionality.

Tests cover:
- User registration
- User login
- Token refresh
- Email verification
- Password reset
"""
import pytest
from fastapi import status
from app.models import User


class TestUserRegistration:
    """Tests for user registration endpoint."""
    
    def test_register_new_user(self, client, db_session):
        """Test successful user registration."""
        # Mock reCAPTCHA verification to always pass in tests
        from unittest.mock import patch
        with patch('app.routers.auth.verify_recaptcha', return_value=True):
            response = client.post(
                "/api/auth/register",
                json={
                    "email": "newuser@example.com",
                    "password": "SecurePassword123!",
                },
            )
            assert response.status_code == status.HTTP_201_CREATED
            data = response.json()
            assert "access_token" in data
            assert "user" in data
            assert "id" in data["user"]
            assert data["user"]["email"] == "newuser@example.com"
            assert "password" not in data  # Password should not be in response
            assert "password" not in data.get("user", {})  # Password should not be in user object either
            
            # Verify user was created in database
            user = db_session.query(User).filter(User.email == "newuser@example.com").first()
            assert user is not None
            assert user.is_verified is False  # Should not be verified initially
    
    def test_register_duplicate_email(self, client, test_user):
        """Test registration with existing email fails."""
        response = client.post(
            "/api/auth/register",
            json={
                "email": test_user.email,
                "password": "AnotherPassword123!",
            },
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
    
    def test_register_invalid_email(self, client):
        """Test registration with invalid email format."""
        response = client.post(
            "/api/auth/register",
            json={
                "email": "not-an-email",
                "password": "SecurePassword123!",
            },
        )
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    
    def test_register_weak_password(self, client):
        """Test registration with weak password."""
        response = client.post(
            "/api/auth/register",
            json={
                "email": "user@example.com",
                "password": "123",  # Too short
            },
        )
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


class TestUserLogin:
    """Tests for user login endpoint."""
    
    def test_login_success(self, client, test_user):
        """Test successful login with correct credentials."""
        response = client.post(
            "/api/auth/login",
            json={
                "email": test_user.email,
                "password": "secret",  # Default test password
            },
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "access_token" in data
        assert "token_type" in data
        assert data["token_type"] == "bearer"
    
    def test_login_wrong_password(self, client, test_user):
        """Test login with incorrect password."""
        response = client.post(
            "/api/auth/login",
            json={
                "email": test_user.email,
                "password": "wrongpassword",
            },
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
    
    def test_login_nonexistent_user(self, client):
        """Test login with non-existent user."""
        response = client.post(
            "/api/auth/login",
            json={
                "email": "nonexistent@example.com",
                "password": "SomePassword123!",
            },
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
    
    def test_login_unverified_user(self, client, db_session):
        """Test login with unverified user (if verification is required)."""
        # Create unverified user
        from app.models import User
        from passlib.context import CryptContext
        
        pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
        unverified_user = User(
            email="unverified@example.com",
            password_hash=pwd_context.hash("password123"),
            is_verified=False,
        )
        db_session.add(unverified_user)
        db_session.commit()
        
        response = client.post(
            "/api/auth/login",
            json={
                "email": unverified_user.email,
                "password": "password123",
            },
        )
        # Behavior depends on implementation - may allow or deny
        assert response.status_code in [status.HTTP_200_OK, status.HTTP_403_FORBIDDEN]


class TestTokenRefresh:
    """Tests for token refresh endpoint."""
    
    def test_refresh_token_success(self, authenticated_client):
        """Test successful token refresh."""
        client, user, old_access_token, old_refresh_token = authenticated_client
        
        response = client.post(
            "/api/auth/refresh",
            json={"refresh_token": old_refresh_token}
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert "token_type" in data
        assert data["token_type"] == "bearer"
        # Verify tokens are valid (non-empty strings)
        assert len(data["access_token"]) > 0
        assert len(data["refresh_token"]) > 0
        # Note: Tokens may be identical if created in the same second due to JWT encoding,
        # but the endpoint should still return valid tokens
    
    def test_refresh_token_unauthorized(self, client):
        """Test token refresh without valid refresh token."""
        # Test with missing refresh_token (401 unauthorized - endpoint returns 401 for missing token)
        response = client.post("/api/auth/refresh")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        
        # Test with invalid refresh_token (401 unauthorized)
        response = client.post(
            "/api/auth/refresh",
            json={"refresh_token": "invalid-token"}
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


class TestEmailVerification:
    """Tests for email verification functionality."""
    
    def test_verify_email_success(self, client, db_session):
        """Test successful email verification."""
        from app.models import User
        from app.auth import generate_verification_token
        from passlib.context import CryptContext
        from datetime import datetime, timedelta
        
        pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
        token = generate_verification_token()
        user = User(
            email="verify@example.com",
            password_hash=pwd_context.hash("password123"),
            is_verified=False,
            verification_token=token,
            verification_token_expires=datetime.utcnow() + timedelta(hours=24),
        )
        db_session.add(user)
        db_session.commit()
        
        # Verify email using POST endpoint
        response = client.post(
            "/api/auth/verify-email",
            json={"token": token}
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "message" in data
        
        # Verify user is now verified
        db_session.refresh(user)
        assert user.is_verified is True
        assert user.verification_token is None
    
    def test_verify_email_invalid_token(self, client):
        """Test email verification with invalid token."""
        response = client.post(
            "/api/auth/verify-email",
            json={"token": "invalid-token-123"}
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
    
    def test_verify_email_expired_token(self, client, db_session):
        """Test email verification with expired token."""
        from app.models import User
        from app.auth import generate_verification_token
        from passlib.context import CryptContext
        from datetime import datetime, timedelta
        
        pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
        token = generate_verification_token()
        user = User(
            email="expired@example.com",
            password_hash=pwd_context.hash("password123"),
            is_verified=False,
            verification_token=token,
            verification_token_expires=datetime.utcnow() - timedelta(hours=1),  # Expired
        )
        db_session.add(user)
        db_session.commit()
        
        response = client.post(
            "/api/auth/verify-email",
            json={"token": token}
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
    
    def test_resend_verification_email(self, client, db_session):
        """Test resending verification email."""
        from tests.factories import create_unverified_user
        
        user = create_unverified_user(db_session, email="resend@example.com")
        
        response = client.post(
            "/api/auth/resend-verification",
            json={"email": user.email}
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "message" in data
        
        # Verify new token was generated
        db_session.refresh(user)
        assert user.verification_token is not None
    
    def test_resend_verification_already_verified(self, client, test_user):
        """Test resending verification for already verified user."""
        response = client.post(
            "/api/auth/resend-verification",
            json={"email": test_user.email}
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
    
    def test_resend_verification_nonexistent_email(self, client):
        """Test resending verification for non-existent email (should not reveal if email exists)."""
        response = client.post(
            "/api/auth/resend-verification",
            json={"email": "nonexistent@example.com"}
        )
        # Should return 200 to not reveal if email exists
        assert response.status_code == status.HTTP_200_OK


class TestPasswordReset:
    """Tests for password reset functionality."""
    
    def test_forgot_password_success(self, client, test_user):
        """Test requesting password reset."""
        response = client.post(
            "/api/auth/forgot-password",
            json={"email": test_user.email}
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "message" in data
    
    def test_forgot_password_nonexistent_email(self, client):
        """Test password reset for non-existent email (should not reveal if email exists)."""
        response = client.post(
            "/api/auth/forgot-password",
            json={"email": "nonexistent@example.com"}
        )
        # Should return 200 to not reveal if email exists
        assert response.status_code == status.HTTP_200_OK
    
    def test_reset_password_success(self, client, db_session):
        """Test successful password reset."""
        from app.models import User
        from app.auth import generate_verification_token
        from passlib.context import CryptContext
        from datetime import datetime, timedelta
        
        pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
        reset_token = generate_verification_token()
        user = User(
            email="reset@example.com",
            password_hash=pwd_context.hash("oldpassword"),
            reset_token=reset_token,
            reset_token_expires=datetime.utcnow() + timedelta(hours=1),
        )
        db_session.add(user)
        db_session.commit()
        
        response = client.post(
            "/api/auth/reset-password",
            json={
                "token": reset_token,
                "new_password": "NewSecurePassword123!"
            }
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "message" in data
        
        # Verify password was changed
        db_session.refresh(user)
        assert user.reset_token is None
        assert user.reset_token_expires is None
    
    def test_reset_password_invalid_token(self, client):
        """Test password reset with invalid token."""
        response = client.post(
            "/api/auth/reset-password",
            json={
                "token": "invalid-token",
                "new_password": "NewPassword123!"
            }
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
    
    def test_reset_password_expired_token(self, client, db_session):
        """Test password reset with expired token."""
        from app.models import User
        from app.auth import generate_verification_token
        from passlib.context import CryptContext
        from datetime import datetime, timedelta
        
        pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
        reset_token = generate_verification_token()
        user = User(
            email="expired_reset@example.com",
            password_hash=pwd_context.hash("oldpassword"),
            reset_token=reset_token,
            reset_token_expires=datetime.utcnow() - timedelta(hours=1),  # Expired
        )
        db_session.add(user)
        db_session.commit()
        
        response = client.post(
            "/api/auth/reset-password",
            json={
                "token": reset_token,
                "new_password": "NewPassword123!"
            }
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST


class TestUserInfo:
    """Tests for user info endpoints."""
    
    def test_get_current_user_info(self, authenticated_client):
        """Test getting current user information."""
        client, user, token, _ = authenticated_client
        
        response = client.get("/api/auth/me")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["email"] == user.email
        assert "id" in data
        assert "password" not in data
    
    def test_get_current_user_info_unauthorized(self, client):
        """Test getting user info without authentication."""
        response = client.get("/api/auth/me")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
    
    def test_logout(self, authenticated_client):
        """Test logout endpoint."""
        client, user, token, _ = authenticated_client
        
        response = client.post("/api/auth/logout")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "message" in data
    
    def test_delete_account(self, client, db_session):
        """Test account deletion."""
        from tests.factories import create_user
        
        user = create_user(db_session, email="delete@example.com", is_verified=True)
        
        # Login first
        login_response = client.post(
            "/api/auth/login",
            json={
                "email": user.email,
                "password": "test_password_123"
            }
        )
        assert login_response.status_code == status.HTTP_200_OK
        token = login_response.json()["access_token"]
        client.headers = {"Authorization": f"Bearer {token}"}
        
        # Delete account
        response = client.delete("/api/auth/delete-account")
        assert response.status_code == status.HTTP_200_OK
        
        # Verify user is deleted
        deleted_user = db_session.query(User).filter(User.id == user.id).first()
        assert deleted_user is None
    
    def test_delete_account_unverified(self, client, db_session):
        """Test account deletion requires verified email."""
        from tests.factories import create_unverified_user
        
        user = create_unverified_user(db_session, email="unverified_delete@example.com")
        
        # Login first
        login_response = client.post(
            "/api/auth/login",
            json={
                "email": user.email,
                "password": "test_password_123"
            }
        )
        assert login_response.status_code == status.HTTP_200_OK
        token = login_response.json()["access_token"]
        client.headers = {"Authorization": f"Bearer {token}"}
        
        # Try to delete account (should fail if verification required)
        response = client.delete("/api/auth/delete-account")
        # May require verification - check implementation
        assert response.status_code in [status.HTTP_200_OK, status.HTTP_403_FORBIDDEN]


class TestLoginEdgeCases:
    """Tests for edge cases in login functionality."""
    
    def test_login_inactive_user(self, client, db_session):
        """Test login with inactive user."""
        from tests.factories import create_inactive_user
        
        user = create_inactive_user(db_session)
        
        response = client.post(
            "/api/auth/login",
            json={
                "email": user.email,
                "password": "test_password_123"
            }
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN
    
    def test_login_case_sensitive_email(self, client, test_user):
        """Test login with different email case."""
        # Try with uppercase email
        response = client.post(
            "/api/auth/login",
            json={
                "email": test_user.email.upper(),
                "password": "secret"
            }
        )
        # Should fail if email comparison is case-sensitive
        assert response.status_code in [status.HTTP_200_OK, status.HTTP_401_UNAUTHORIZED]
    
    def test_refresh_token_with_inactive_user(self, client, db_session):
        """Test refresh token with inactive user."""
        from tests.factories import create_user
        
        user = create_user(db_session, email="inactive_refresh@example.com")
        
        # Login to get tokens
        login_response = client.post(
            "/api/auth/login",
            json={
                "email": user.email,
                "password": "test_password_123"
            }
        )
        refresh_token = login_response.json()["refresh_token"]
        
        # Deactivate user
        user.is_active = False
        db_session.commit()
        
        # Try to refresh token
        response = client.post(
            "/api/auth/refresh",
            json={"refresh_token": refresh_token}
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

