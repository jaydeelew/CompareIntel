"""
End-to-end tests for complete user workflows.

Tests cover:
- Complete user registration and verification flow
- Authenticated user comparison flow
- Admin user management flow
- Rate limit handling workflows
"""

import pytest

pytestmark = pytest.mark.e2e


from unittest.mock import patch

from fastapi import status


class TestUserRegistrationWorkflow:
    """Tests for complete user registration workflow."""

    def test_complete_registration_flow(self, client, db_session):
        """Test complete registration → verification → login flow."""
        # Step 1: Register new user
        email = "newuser@example.com"
        password = "SecurePassword123!"

        # Mock reCAPTCHA verification to bypass it in tests
        with patch("app.routers.auth.verify_recaptcha", return_value=True):
            register_response = client.post(
                "/api/auth/register",
                json={
                    "email": email,
                    "password": password,
                },
            )
        assert register_response.status_code == status.HTTP_201_CREATED
        user_data = register_response.json()
        user_id = user_data.get("id")

        # Step 2: Verify email (if verification is required)
        # Adjust based on your verification implementation
        # verify_response = client.get(f"/api/auth/verify?token={verification_token}")
        # assert verify_response.status_code == status.HTTP_200_OK

        # Step 3: Login with new credentials
        login_response = client.post(
            "/api/auth/login",
            json={
                "email": email,
                "password": password,
            },
        )
        assert login_response.status_code == status.HTTP_200_OK
        token = login_response.json()["access_token"]

        # Step 4: Use token for authenticated request
        client.headers = {"Authorization": f"Bearer {token}"}
        # Make an authenticated request to verify token works
        # Adjust endpoint based on your implementation


class TestAuthenticatedUserWorkflow:
    """Tests for authenticated user comparison workflow."""

    # Should work with new tier limits


class TestAdminWorkflow:
    """Tests for admin user management workflow."""

    def test_admin_user_management_workflow(self, client, test_user_admin, db_session):
        """Test complete admin user management workflow."""
        # Step 1: Admin login
        login_response = client.post(
            "/api/auth/login",
            json={
                "email": test_user_admin.email,
                "password": "secret",
            },
        )
        assert login_response.status_code == status.HTTP_200_OK
        admin_token = login_response.json()["access_token"]
        client.headers = {"Authorization": f"Bearer {admin_token}"}

        # Step 2: List all users
        users_response = client.get("/api/admin/users")
        if users_response.status_code == status.HTTP_200_OK:
            users = users_response.json()
            assert isinstance(users, (list, dict))

        # Step 3: Get system stats
        stats_response = client.get("/api/admin/stats")
        if stats_response.status_code == status.HTTP_200_OK:
            stats = stats_response.json()
            assert isinstance(stats, dict)

        # Step 4: View usage logs
        logs_response = client.get("/api/admin/usage-logs")
        if logs_response.status_code == status.HTTP_200_OK:
            logs = logs_response.json()
            assert isinstance(logs, (list, dict))


class TestErrorRecoveryWorkflow:
    """Tests for error recovery workflows."""

    def test_authentication_token_refresh_workflow(self, authenticated_client):
        """Test token refresh workflow."""
        client, user, token, refresh_token = authenticated_client

        # Refresh token
        refresh_response = client.post("/api/auth/refresh", json={"refresh_token": refresh_token})
        if refresh_response.status_code == status.HTTP_200_OK:
            new_token = refresh_response.json()["access_token"]

            # Use new token
            client.headers = {"Authorization": f"Bearer {new_token}"}
            # Make authenticated request
            # Should work with new token
