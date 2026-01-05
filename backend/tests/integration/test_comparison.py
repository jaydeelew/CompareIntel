"""
Integration tests for model comparison functionality.

Tests cover:
- Model selection
- Streaming responses
- Result formatting
"""
import pytest
from fastapi import status


class TestModelSelection:
    """Tests for model selection functionality."""
    
    def test_get_available_models(self, client):
        """Test getting list of available models."""
        response = client.get("/api/models")
        # Adjust endpoint based on your implementation
        if response.status_code == status.HTTP_200_OK:
            data = response.json()
            assert isinstance(data, (list, dict))
    
class TestStreamingResponse:
    """Tests for streaming comparison responses."""
    
    def test_streaming_endpoint(self, authenticated_client):
        """Test streaming comparison endpoint."""
        client, user, token, _ = authenticated_client
        
        response = client.post(
            "/api/compare-stream",
            json={
                "input_data": "Test prompt",
                "models": ["anthropic/claude-3.5-haiku"],  # Free tier model
            },
        )
        # TestClient handles StreamingResponse automatically
        # Verify it returns a streaming response with correct content type
        assert response.status_code in [
            status.HTTP_200_OK,
            status.HTTP_429_TOO_MANY_REQUESTS,
        ]
        if response.status_code == status.HTTP_200_OK:
            # Verify it's a streaming response (SSE)
            # FastAPI automatically adds charset=utf-8 to text media types
            content_type = response.headers.get("content-type", "")
            assert content_type.startswith("text/event-stream")


class TestStreamingComparison:
    """Tests for streaming comparison endpoint."""
    
    def test_streaming_basic(self, authenticated_client):
        """Test basic streaming comparison."""
        client, user, token, _ = authenticated_client
        
        response = client.post(
            "/api/compare-stream",
            json={
                "input_data": "Test prompt",
                "models": ["anthropic/claude-3.5-haiku"],  # Free tier model
            }
        )
        assert response.status_code in [
            status.HTTP_200_OK,
            status.HTTP_429_TOO_MANY_REQUESTS,
        ]
        
        if response.status_code == status.HTTP_200_OK:
            # Verify it's a streaming response
            content_type = response.headers.get("content-type", "")
            assert content_type.startswith("text/event-stream")
    
    def test_streaming_multiple_models(self, authenticated_client):
        """Test streaming with multiple models."""
        client, user, token, _ = authenticated_client
        
        response = client.post(
            "/api/compare-stream",
            json={
                "input_data": "Test prompt",
                "models": ["anthropic/claude-3.5-haiku", "deepseek/deepseek-chat-v3.1"],  # Free tier models
            }
        )
        assert response.status_code in [
            status.HTTP_200_OK,
            status.HTTP_429_TOO_MANY_REQUESTS,
        ]
    
    def test_streaming_empty_input(self, authenticated_client):
        """Test streaming with empty input."""
        client, user, token, _ = authenticated_client
        
        response = client.post(
            "/api/compare-stream",
            json={
                "input_data": "",
                "models": ["anthropic/claude-3.5-haiku"],  # Free tier model
            }
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
    
    def test_streaming_rate_limit(self, authenticated_client, db_session):
        """Test streaming endpoint respects rate limits."""
        from app.rate_limiting import deduct_user_credits
        from app.credit_manager import ensure_credits_allocated
        from decimal import Decimal
        from datetime import datetime, timedelta, timezone
        
        client, user, token, _ = authenticated_client
        
        # Ensure credits are allocated first
        ensure_credits_allocated(user.id, db_session)
        db_session.refresh(user)
        
        # Set credits_reset_at far in the future to prevent reset during test
        now_utc = datetime.now(timezone.utc)
        reset_at = user.credits_reset_at
        if reset_at and reset_at.tzinfo is None:
            reset_at = reset_at.replace(tzinfo=timezone.utc)
        if not user.credits_reset_at or (reset_at and reset_at <= now_utc):
            user.credits_reset_at = now_utc + timedelta(days=1)
            db_session.commit()
            db_session.refresh(user)
        
        # Exhaust user's credits by deducting all allocated credits
        allocated = user.monthly_credits_allocated or 100  # Default to 100 if not set
        # Deduct all credits to exhaust the limit
        deduct_user_credits(user, Decimal(allocated), None, db_session, "Test: Exhaust credits")
        db_session.refresh(user)
        
        # Verify credits are exhausted
        assert user.credits_used_this_period >= allocated, f"Expected credits_used >= {allocated}, got {user.credits_used_this_period}"
        
        response = client.post(
            "/api/compare-stream",
            json={
                "input_data": "Test prompt",
                "models": ["anthropic/claude-3.5-haiku"],  # Free tier model
            }
        )
        # Should return 402 Payment Required when credits are exhausted
        assert response.status_code == status.HTTP_402_PAYMENT_REQUIRED


