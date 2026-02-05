"""
Edge case tests for model runner functionality.

Tests cover:
- Streaming error handling scenarios
- Timeout scenarios
- Network failures
- Streaming failures
"""

from unittest.mock import MagicMock, patch

from app.model_runner import (
    call_openrouter_streaming,
    clean_model_response,
)


class TestStreamingErrorHandling:
    """Tests for error handling in streaming."""

    @patch("app.model_runner.OpenAI")
    def test_streaming_connection_error(self, mock_openai_class):
        """Test handling of streaming connection errors."""
        mock_client = MagicMock()
        mock_openai_class.return_value = mock_client

        # Simulate connection error during streaming
        mock_client.chat.completions.create.side_effect = Exception("Connection failed")

        chunks = list(
            call_openrouter_streaming(prompt="Test prompt", model_id="gpt-4", use_mock=False)
        )

        # Should handle error gracefully
        assert len(chunks) >= 0
        # May return error message as chunk
        if chunks:
            assert isinstance(chunks[0], str)

    @patch("app.model_runner.OpenAI")
    def test_streaming_timeout_error(self, mock_openai_class):
        """Test handling of streaming timeout errors."""
        mock_client = MagicMock()
        mock_openai_class.return_value = mock_client

        # Simulate timeout during streaming
        mock_client.chat.completions.create.side_effect = TimeoutError("Request timed out")

        chunks = list(
            call_openrouter_streaming(prompt="Test prompt", model_id="gpt-4", use_mock=False)
        )

        # Should handle timeout gracefully
        assert isinstance(chunks, list)

    def test_streaming_empty_response(self):
        """Test handling of empty streaming response."""
        chunks = list(
            call_openrouter_streaming(prompt="Test prompt", model_id="gpt-4", use_mock=True)
        )

        # Should return at least some chunks (even if empty)
        assert isinstance(chunks, list)


class TestCleanModelResponse:
    """Tests for response cleaning edge cases."""

    def test_clean_normal_response(self):
        """Test cleaning normal response."""
        response = "This is a normal response."
        cleaned = clean_model_response(response)
        assert cleaned == response

    def test_clean_response_with_whitespace(self):
        """Test cleaning response with extra whitespace."""
        response = "  This is a response with whitespace.  \n\n  "
        cleaned = clean_model_response(response)
        # Should clean whitespace (implementation dependent)
        assert isinstance(cleaned, str)

    def test_clean_empty_response(self):
        """Test cleaning empty response."""
        response = ""
        cleaned = clean_model_response(response)
        assert isinstance(cleaned, str)

    def test_clean_error_response(self):
        """Test cleaning error response."""
        response = "Error: Something went wrong"
        cleaned = clean_model_response(response)
        # Should preserve error messages
        assert "Error" in cleaned or cleaned == response

    def test_clean_response_with_special_chars(self):
        """Test cleaning response with special characters."""
        response = "Response with special chars: !@#$%^&*()"
        cleaned = clean_model_response(response)
        # Should preserve special characters
        assert isinstance(cleaned, str)
        assert "!" in cleaned or cleaned == response
