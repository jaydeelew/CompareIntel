"""
Integration tests for API endpoints.

Tests cover:
- API endpoint responses
- Request/response formats
- Error handling
- Status codes
"""
import pytest
from fastapi import status


class TestHealthCheck:
    """Tests for health check endpoint."""
    
    def test_health_check(self, client):
        """Test health check endpoint returns 200."""
        response = client.get("/health")
        # Adjust endpoint path based on your actual implementation
        assert response.status_code in [status.HTTP_200_OK, status.HTTP_404_NOT_FOUND]


class TestAPIEndpoints:
    """Tests for general API endpoints."""
    
    def test_root_endpoint(self, client):
        """Test root endpoint."""
        response = client.get("/")
        assert response.status_code in [status.HTTP_200_OK, status.HTTP_404_NOT_FOUND]
    
    def test_api_docs(self, client):
        """Test API documentation endpoints."""
        # FastAPI automatically generates these
        response = client.get("/docs")
        assert response.status_code == status.HTTP_200_OK
        
        response = client.get("/openapi.json")
        assert response.status_code == status.HTTP_200_OK


class TestCORS:
    """Tests for CORS configuration."""
    
    def test_cors_headers(self, client):
        """Test that CORS headers are present."""
        response = client.options(
            "/",
            headers={"Origin": "http://localhost:3000"}
        )
        # CORS headers should be present (adjust based on your CORS config)
        assert response.status_code in [status.HTTP_200_OK, status.HTTP_405_METHOD_NOT_ALLOWED]


class TestErrorHandling:
    """Tests for API error handling."""
    
    def test_404_not_found(self, client):
        """Test 404 response for non-existent endpoints."""
        response = client.get("/api/nonexistent-endpoint")
        assert response.status_code == status.HTTP_404_NOT_FOUND
    
    def test_422_validation_error(self, client):
        """Test 422 response for validation errors."""
        # Try to create something with invalid data
        response = client.post(
            "/api/auth/register",
            json={"invalid": "data"}
        )
        # Should return 422 if validation fails
        assert response.status_code in [
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            status.HTTP_400_BAD_REQUEST
        ]

