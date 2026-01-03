"""
Integration tests for web search functionality.

Tests cover:
- Web search integration with comparison endpoint
- Search provider configuration
- Tool calling for web search-enabled models
- Error handling in web search flow
"""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi.testclient import TestClient

from tests.factories import create_pro_user, create_app_settings
from app.models import AppSettings


@pytest.mark.integration
class TestWebSearchIntegration:
    """Test web search integration with comparison endpoint."""
    
    def test_comparison_with_web_search_enabled(self, authenticated_client, db_session):
        """Test comparison with web search enabled."""
        client, user, token, _ = authenticated_client
        
        # Configure search provider
        create_app_settings(db_session, anonymous_mock_mode_enabled=False)
        app_settings = db_session.query(AppSettings).first()
        app_settings.active_search_provider = "brave"
        db_session.commit()
        
        # Mock search provider
        mock_search_result = [
            MagicMock(
                title="Test Result",
                url="https://example.com",
                snippet="Test snippet",
                source="brave"
            )
        ]
        
        with patch('app.search.factory.SearchProviderFactory.get_active_provider') as mock_get_provider:
            mock_provider = MagicMock()
            mock_provider.search = AsyncMock(return_value=mock_search_result)
            mock_provider.get_provider_name.return_value = "brave"
            mock_get_provider.return_value = mock_provider
            
            # Mock model runner to simulate tool calling
            with patch('app.model_runner.call_openrouter_streaming') as mock_stream:
                # Simulate tool call for web search
                def mock_stream_generator():
                    yield '{"type": "tool_call", "function": {"name": "search_web", "arguments": "{\\"query\\": \\"test query\\"}"}}'
                    yield '{"type": "tool_result", "content": "Search results: Test Result"}'
                    yield '{"type": "text", "content": "Based on the search results"}'
                
                mock_stream.return_value = mock_stream_generator()
                
                response = client.post(
                    "/api/compare-stream",
                    headers={"Authorization": f"Bearer {token}"},
                    json={
                        "input_data": "What is the current weather?",
                        "models": ["openai/gpt-4"],  # Assuming GPT-4 supports web search
                        "enable_web_search": True
                    },
                    stream=True
                )
                
                # Should accept the request
                assert response.status_code == 200
    
    def test_comparison_with_web_search_disabled(self, authenticated_client):
        """Test comparison with web search disabled."""
        client, user, token, _ = authenticated_client
        
        response = client.post(
            "/api/compare-stream",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "input_data": "What is AI?",
                "models": ["openai/gpt-4"],
                "enable_web_search": False
            }
        )
        
        # Should work normally without web search
        assert response.status_code in [200, 400]  # 400 if models don't support it
    
    def test_web_search_without_provider_configured(self, authenticated_client, db_session):
        """Test web search when no provider is configured."""
        client, user, token, _ = authenticated_client
        
        # Ensure no search provider is configured
        app_settings = db_session.query(AppSettings).first()
        if app_settings:
            app_settings.active_search_provider = None
            db_session.commit()
        
        with patch('app.search.factory.SearchProviderFactory.get_active_provider') as mock_get_provider:
            mock_get_provider.return_value = None
            
            response = client.post(
                "/api/compare-stream",
                headers={"Authorization": f"Bearer {token}"},
                json={
                    "input_data": "What is the weather?",
                    "models": ["openai/gpt-4"],
                    "enable_web_search": True
                }
            )
            
            # Should still accept request but log warning
            assert response.status_code in [200, 400]
    
    def test_web_search_with_model_not_supporting(self, authenticated_client, db_session):
        """Test web search with model that doesn't support it."""
        client, user, token, _ = authenticated_client
        
        # Configure search provider
        create_app_settings(db_session)
        app_settings = db_session.query(AppSettings).first()
        app_settings.active_search_provider = "brave"
        db_session.commit()
        
        response = client.post(
            "/api/compare-stream",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "input_data": "Test query",
                "models": ["openai/gpt-3.5-turbo"],  # Assuming this doesn't support web search
                "enable_web_search": True
            }
        )
        
        # Should handle gracefully
        assert response.status_code in [200, 400]
    
    def test_web_search_error_handling(self, authenticated_client, db_session):
        """Test error handling when web search fails."""
        client, user, token, _ = authenticated_client
        
        # Configure search provider
        create_app_settings(db_session)
        app_settings = db_session.query(AppSettings).first()
        app_settings.active_search_provider = "brave"
        db_session.commit()
        
        # Mock search provider to raise error
        with patch('app.search.factory.SearchProviderFactory.get_active_provider') as mock_get_provider:
            mock_provider = MagicMock()
            mock_provider.search = AsyncMock(side_effect=Exception("Search failed"))
            mock_provider.get_provider_name.return_value = "brave"
            mock_get_provider.return_value = mock_provider
            
            # Mock model runner
            with patch('app.model_runner.call_openrouter_streaming') as mock_stream:
                def mock_stream_generator():
                    yield '{"type": "tool_call", "function": {"name": "search_web"}}'
                    yield '{"type": "error", "message": "Search failed"}'
                
                mock_stream.return_value = mock_stream_generator()
                
                response = client.post(
                    "/api/compare-stream",
                    headers={"Authorization": f"Bearer {token}"},
                    json={
                        "input_data": "Test query",
                        "models": ["openai/gpt-4"],
                        "enable_web_search": True
                    },
                    stream=True
                )
                
                # Should handle error gracefully
                assert response.status_code == 200  # Stream starts, errors in stream


@pytest.mark.integration
class TestWebSearchConfiguration:
    """Test web search configuration."""
    
    def test_search_provider_configuration(self, db_session):
        """Test configuring search provider."""
        app_settings = create_app_settings(db_session)
        app_settings.active_search_provider = "brave"
        db_session.commit()
        
        settings = db_session.query(AppSettings).first()
        assert settings.active_search_provider == "brave"
    
    def test_search_provider_availability_check(self, db_session):
        """Test checking search provider availability."""
        from app.search.factory import SearchProviderFactory
        
        with patch('app.search.factory.settings') as mock_settings:
            mock_settings.brave_search_api_key = "test_key"
            
            providers = SearchProviderFactory.get_available_providers()
            assert "brave" in providers
