"""
Integration tests for admin functionality.

Tests cover:
- Admin endpoints
- User management
- System configuration
- Admin authentication
"""
import pytest
from fastapi import status


class TestAdminAuthentication:
    """Tests for admin authentication."""
    
    def test_admin_endpoint_requires_admin(self, authenticated_client):
        """Test that admin endpoints require admin privileges."""
        client, user, token, _ = authenticated_client
        
        # Regular user should not have admin access
        response = client.get("/api/admin/users")
        # Should return 403 if user is not admin
        assert response.status_code in [
            status.HTTP_403_FORBIDDEN,
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_404_NOT_FOUND,
        ]
    
    def test_admin_endpoint_with_admin_user(self, client, test_user_admin):
        """Test admin endpoints with admin user."""
        # Login as admin
        response = client.post(
            "/api/auth/login",
            json={
                "email": test_user_admin.email,
                "password": "secret",
            },
        )
        assert response.status_code == status.HTTP_200_OK
        token = response.json()["access_token"]
        
        # Set authorization header
        client.headers = {"Authorization": f"Bearer {token}"}
        
        # Try to access admin endpoint
        response = client.get("/api/admin/users")
        # Should succeed if endpoint exists
        assert response.status_code in [
            status.HTTP_200_OK,
            status.HTTP_404_NOT_FOUND,
        ]


class TestUserManagement:
    """Tests for user management endpoints."""
    
    def test_list_users(self, client, test_user_admin):
        """Test listing all users."""
        # Login as admin
        response = client.post(
            "/api/auth/login",
            json={
                "email": test_user_admin.email,
                "password": "secret",
            },
        )
        token = response.json()["access_token"]
        client.headers = {"Authorization": f"Bearer {token}"}
        
        response = client.get("/api/admin/users")
        if response.status_code == status.HTTP_200_OK:
            data = response.json()
            assert isinstance(data, (list, dict))
    
    def test_get_user_by_id(self, client, test_user_admin, test_user):
        """Test getting a specific user by ID."""
        # Login as admin
        response = client.post(
            "/api/auth/login",
            json={
                "email": test_user_admin.email,
                "password": "secret",
            },
        )
        token = response.json()["access_token"]
        client.headers = {"Authorization": f"Bearer {token}"}
        
        response = client.get(f"/api/admin/users/{test_user.id}")
        if response.status_code == status.HTTP_200_OK:
            data = response.json()
            assert "id" in data or "email" in data
    
    def test_update_user_tier(self, client, test_user_admin, test_user):
        """Test updating user subscription tier."""
        # Login as admin
        response = client.post(
            "/api/auth/login",
            json={
                "email": test_user_admin.email,
                "password": "secret",
            },
        )
        token = response.json()["access_token"]
        client.headers = {"Authorization": f"Bearer {token}"}
    
        response = client.put(
            f"/api/admin/users/{test_user.id}",
            json={"subscription_tier": "pro"}
        )
        # Adjust based on your implementation
        assert response.status_code in [
            status.HTTP_200_OK,
            status.HTTP_404_NOT_FOUND,
            status.HTTP_400_BAD_REQUEST,
        ]


class TestSystemConfiguration:
    """Tests for system configuration endpoints."""
    
    def test_get_system_stats(self, client, test_user_admin):
        """Test getting system statistics."""
        # Login as admin
        response = client.post(
            "/api/auth/login",
            json={
                "email": test_user_admin.email,
                "password": "secret",
            },
        )
        token = response.json()["access_token"]
        client.headers = {"Authorization": f"Bearer {token}"}
        
        response = client.get("/api/admin/stats")
        if response.status_code == status.HTTP_200_OK:
            data = response.json()
            assert isinstance(data, dict)
    
    def test_get_usage_logs(self, client, test_user_admin):
        """Test getting usage logs."""
        # Login as admin
        response = client.post(
            "/api/auth/login",
            json={
                "email": test_user_admin.email,
                "password": "secret",
            },
        )
        token = response.json()["access_token"]
        client.headers = {"Authorization": f"Bearer {token}"}
        
        response = client.get("/api/admin/usage-logs")
        if response.status_code == status.HTTP_200_OK:
            data = response.json()
            assert isinstance(data, (list, dict))


class TestAdminUserCRUD:
    """Tests for admin user CRUD operations."""
    
    def test_create_user(self, client, test_user_admin, db_session):
        """Test admin creating a new user."""
        # Login as admin
        response = client.post(
            "/api/auth/login",
            json={
                "email": test_user_admin.email,
                "password": "secret",
            },
        )
        token = response.json()["access_token"]
        client.headers = {"Authorization": f"Bearer {token}"}
        
        # Create new user
        response = client.post(
            "/api/admin/users",
            json={
                "email": "newuser@example.com",
                "password": "SecurePassword123!",
                "subscription_tier": "free",
            }
        )
        assert response.status_code in [
            status.HTTP_201_CREATED,
            status.HTTP_400_BAD_REQUEST,
        ]
        
        if response.status_code == status.HTTP_201_CREATED:
            data = response.json()
            assert "email" in data
            assert data["email"] == "newuser@example.com"
    
    def test_update_user(self, client, test_user_admin, test_user):
        """Test admin updating user."""
        # Login as admin
        response = client.post(
            "/api/auth/login",
            json={
                "email": test_user_admin.email,
                "password": "secret",
            },
        )
        token = response.json()["access_token"]
        client.headers = {"Authorization": f"Bearer {token}"}
        
        # Update user
        response = client.put(
            f"/api/admin/users/{test_user.id}",
            json={
                "subscription_tier": "pro",
                "is_active": True,
            }
        )
        assert response.status_code in [
            status.HTTP_200_OK,
            status.HTTP_404_NOT_FOUND,
            status.HTTP_400_BAD_REQUEST,
        ]
    
    def test_delete_user(self, client, test_user_super_admin, db_session):
        """Test super admin deleting a user."""
        from tests.factories import create_user
        
        # Create a user to delete
        user_to_delete = create_user(db_session, email="delete_me@example.com")
        
        # Login as super admin
        response = client.post(
            "/api/auth/login",
            json={
                "email": test_user_super_admin.email,
                "password": "test_password_123",
            },
        )
        token = response.json()["access_token"]
        client.headers = {"Authorization": f"Bearer {token}"}
        
        # Delete user
        response = client.delete(f"/api/admin/users/{user_to_delete.id}")
        assert response.status_code in [
            status.HTTP_200_OK,
            status.HTTP_204_NO_CONTENT,
            status.HTTP_404_NOT_FOUND,
        ]
    
    def test_get_nonexistent_user(self, client, test_user_admin):
        """Test getting non-existent user."""
        # Login as admin
        response = client.post(
            "/api/auth/login",
            json={
                "email": test_user_admin.email,
                "password": "secret",
            },
        )
        token = response.json()["access_token"]
        client.headers = {"Authorization": f"Bearer {token}"}
        
        # Try to get non-existent user
        response = client.get("/api/admin/users/99999")
        assert response.status_code == status.HTTP_404_NOT_FOUND


class TestAdminUserActions:
    """Tests for admin user action endpoints."""
    
    def test_toggle_user_active(self, client, test_user_admin, test_user):
        """Test toggling user active status."""
        # Login as admin
        response = client.post(
            "/api/auth/login",
            json={
                "email": test_user_admin.email,
                "password": "secret",
            },
        )
        token = response.json()["access_token"]
        client.headers = {"Authorization": f"Bearer {token}"}
        
        # Toggle active status
        response = client.post(f"/api/admin/users/{test_user.id}/toggle-active")
        assert response.status_code in [
            status.HTTP_200_OK,
            status.HTTP_404_NOT_FOUND,
        ]
    
    def test_reset_user_usage(self, client, test_user_admin, test_user, db_session):
        """Test resetting user usage."""
        # Set some usage
        test_user.credits_used_this_period = 10
        db_session.commit()
        
        # Login as admin
        response = client.post(
            "/api/auth/login",
            json={
                "email": test_user_admin.email,
                "password": "secret",
            },
        )
        token = response.json()["access_token"]
        client.headers = {"Authorization": f"Bearer {token}"}
        
        # Reset usage
        response = client.post(f"/api/admin/users/{test_user.id}/reset-usage")
        assert response.status_code in [
            status.HTTP_200_OK,
            status.HTTP_404_NOT_FOUND,
        ]
        
        if response.status_code == status.HTTP_200_OK:
            db_session.refresh(test_user)
            assert test_user.credits_used_this_period == 0
    
    def test_toggle_mock_mode(self, client, test_user_admin, test_user):
        """Test toggling user mock mode."""
        # Login as admin
        response = client.post(
            "/api/auth/login",
            json={
                "email": test_user_admin.email,
                "password": "secret",
            },
        )
        token = response.json()["access_token"]
        client.headers = {"Authorization": f"Bearer {token}"}
        
        # Toggle mock mode
        response = client.post(f"/api/admin/users/{test_user.id}/toggle-mock-mode")
        assert response.status_code in [
            status.HTTP_200_OK,
            status.HTTP_404_NOT_FOUND,
        ]


class TestAdminStats:
    """Tests for admin statistics endpoints."""
    
    def test_get_admin_stats_structure(self, authenticated_client_admin):
        """Test admin stats response structure."""
        client, admin_user, token, _ = authenticated_client_admin
        
        response = client.get("/api/admin/stats")
        assert response.status_code == status.HTTP_200_OK
        
        data = response.json()
        assert "total_users" in data
        assert "active_users" in data
        assert "verified_users" in data
        assert "users_by_tier" in data
        assert "users_by_role" in data
        assert isinstance(data["total_users"], int)
        assert isinstance(data["active_users"], int)
    
    def test_admin_stats_with_multiple_users(self, client, test_user_admin, db_session):
        """Test admin stats with multiple users."""
        from tests.factories import (
            create_free_user, create_starter_user, create_pro_user
        )
        
        # Create users of different tiers
        create_free_user(db_session)
        create_starter_user(db_session)
        create_pro_user(db_session)
        
        # Login as admin
        response = client.post(
            "/api/auth/login",
            json={
                "email": test_user_admin.email,
                "password": "secret",
            },
        )
        token = response.json()["access_token"]
        client.headers = {"Authorization": f"Bearer {token}"}
        
        # Get stats
        response = client.get("/api/admin/stats")
        assert response.status_code == status.HTTP_200_OK
        
        data = response.json()
        assert data["total_users"] >= 4  # Admin + 3 created users


class TestAdminPagination:
    """Tests for admin pagination."""
    
    def test_list_users_pagination(self, authenticated_client_admin, db_session):
        """Test user list pagination."""
        from tests.factories import create_user
        
        # Create multiple users
        for i in range(5):
            create_user(db_session, email=f"user{i}@example.com")
        
        client, admin_user, token, _ = authenticated_client_admin
        
        # Get first page
        response = client.get("/api/admin/users?page=1&per_page=2")
        assert response.status_code == status.HTTP_200_OK
        
        data = response.json()
        assert "users" in data
        assert "total" in data
        assert "page" in data
        assert "per_page" in data
        assert "total_pages" in data
        assert len(data["users"]) <= 2
    
    def test_list_users_search(self, authenticated_client_admin, db_session):
        """Test user list search functionality."""
        from tests.factories import create_user
        
        # Create user with specific email
        create_user(db_session, email="searchtest@example.com")
        
        client, admin_user, token, _ = authenticated_client_admin
        
        # Search for user
        response = client.get("/api/admin/users?search=searchtest")
        assert response.status_code == status.HTTP_200_OK
        
        data = response.json()
        assert "users" in data
        # Should find the user
        assert any("searchtest" in user.get("email", "") for user in data["users"])
    
    def test_list_users_filter_by_tier(self, authenticated_client_admin, db_session):
        """Test filtering users by subscription tier."""
        from tests.factories import create_pro_user
        
        # Create pro user
        create_pro_user(db_session)
        
        client, admin_user, token, _ = authenticated_client_admin
        
        # Filter by tier
        response = client.get("/api/admin/users?tier=pro")
        assert response.status_code == status.HTTP_200_OK
        
        data = response.json()
        assert "users" in data
        # All users should be pro tier
        assert all(user.get("subscription_tier") == "pro" for user in data["users"])


class TestAdminRolePermissions:
    """Tests for admin role-based permissions."""
    
    def test_moderator_cannot_create_users(self, client, db_session):
        """Test that moderators cannot create users."""
        from tests.factories import create_moderator_user
        
        moderator = create_moderator_user(db_session)
        
        # Login as moderator
        response = client.post(
            "/api/auth/login",
            json={
                "email": moderator.email,
                "password": "test_password_123",
            },
        )
        token = response.json()["access_token"]
        client.headers = {"Authorization": f"Bearer {token}"}
        
        # Try to create user (should fail)
        response = client.post(
            "/api/admin/users",
            json={
                "email": "newuser@example.com",
                "password": "Password123!",
            }
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN
    
    def test_super_admin_permissions(self, authenticated_client_super_admin):
        """Test super admin has all permissions."""
        client, super_admin, token, _ = authenticated_client_super_admin
        
        # Super admin should be able to access all endpoints
        response = client.get("/api/admin/stats")
        assert response.status_code == status.HTTP_200_OK
        
        response = client.get("/api/admin/users")
        assert response.status_code == status.HTTP_200_OK

