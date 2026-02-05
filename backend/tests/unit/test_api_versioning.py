"""
Tests for API versioning.

These tests verify that:
1. Both /api/ and /api/v1/ endpoints work correctly
2. The versioned endpoints return the same responses
3. Backward compatibility is maintained
"""


class TestAPIVersioning:
    """Tests for API versioning with /api/ and /api/v1/ prefixes."""

    def test_health_endpoint_accessible(self, client):
        """Health endpoint should be accessible."""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert "status" in data

    def test_root_endpoint_accessible(self, client):
        """Root API endpoint should return message."""
        response = client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data

    def test_legacy_api_models_endpoint(self, client):
        """Legacy /api/models endpoint should work."""
        response = client.get("/api/models")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, (list, dict))

    def test_versioned_api_models_endpoint(self, client):
        """Versioned /api/v1/models endpoint should work."""
        response = client.get("/api/v1/models")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, (list, dict))

    def test_legacy_and_versioned_return_same_data(self, client):
        """Both endpoints should return the same data."""
        legacy_response = client.get("/api/models")
        versioned_response = client.get("/api/v1/models")

        assert legacy_response.status_code == versioned_response.status_code
        assert legacy_response.json() == versioned_response.json()

    def test_legacy_auth_test_endpoint(self, client):
        """Legacy /api/auth/test endpoint should work."""
        response = client.get("/api/auth/test")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data

    def test_versioned_auth_test_endpoint(self, client):
        """Versioned /api/v1/auth/test endpoint should work."""
        response = client.get("/api/v1/auth/test")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data

    def test_legacy_rate_limit_status(self, client):
        """Legacy /api/rate-limit-status endpoint should work."""
        response = client.get("/api/rate-limit-status")
        assert response.status_code == 200

    def test_versioned_rate_limit_status(self, client):
        """Versioned /api/v1/rate-limit-status endpoint should work."""
        response = client.get("/api/v1/rate-limit-status")
        assert response.status_code == 200

    def test_invalid_api_version_returns_404(self, client):
        """Invalid API version should return 404."""
        response = client.get("/api/v2/models")
        assert response.status_code == 404

        response = client.get("/api/v999/models")
        assert response.status_code == 404


class TestAPIVersioningAuthentication:
    """Tests for authenticated endpoints with versioning."""

    def test_legacy_login_endpoint(self, client, test_user):
        """Legacy /api/auth/login should work."""
        response = client.post(
            "/api/auth/login", json={"email": test_user.email, "password": "secret"}
        )
        assert response.status_code == 200
        assert "access_token" in response.json()

    def test_versioned_login_endpoint(self, client, test_user):
        """Versioned /api/v1/auth/login should work."""
        response = client.post(
            "/api/v1/auth/login", json={"email": test_user.email, "password": "secret"}
        )
        assert response.status_code == 200
        assert "access_token" in response.json()

    def test_legacy_me_endpoint_requires_auth(self, client):
        """Legacy /api/auth/me should require authentication."""
        response = client.get("/api/auth/me")
        assert response.status_code == 401

    def test_versioned_me_endpoint_requires_auth(self, client):
        """Versioned /api/v1/auth/me should require authentication."""
        response = client.get("/api/v1/auth/me")
        assert response.status_code == 401

    def test_legacy_me_with_auth(self, authenticated_client):
        """Legacy /api/auth/me should work with authentication."""
        client, user, _, _ = authenticated_client
        response = client.get("/api/auth/me")
        assert response.status_code == 200
        assert response.json()["email"] == user.email

    def test_versioned_me_with_auth(self, authenticated_client):
        """Versioned /api/v1/auth/me should work with authentication."""
        client, user, _, _ = authenticated_client
        response = client.get("/api/v1/auth/me")
        assert response.status_code == 200
        assert response.json()["email"] == user.email
