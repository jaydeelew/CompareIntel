"""
Unit tests for model runner functionality.

Tests cover:
- Streaming model calling (mock mode)
- Conversation history truncation
- Error handling
"""
import pytest
from unittest.mock import patch, MagicMock
from app.model_runner import (
    call_openrouter_streaming,
    truncate_conversation_history,
)


class TestModelRunnerMockMode:
    """Tests for model runner in mock mode."""
    
    def test_call_openrouter_streaming_mock_mode(self):
        """Test streaming OpenRouter in mock mode."""
        chunks = list(call_openrouter_streaming(
            prompt="Test prompt",
            model_id="gpt-4",
            use_mock=True
        ))
        assert len(chunks) > 0
        # All chunks should be strings
        assert all(isinstance(chunk, str) for chunk in chunks)


class TestConversationHistoryTruncation:
    """Tests for conversation history truncation."""
    
    def test_truncate_conversation_history_short(self):
        """Test truncation with short history."""
        history = [
            {"role": "user", "content": "Question 1"},
            {"role": "assistant", "content": "Answer 1"},
        ]
        
        truncated, was_truncated, original_count = truncate_conversation_history(
            history, max_messages=20
        )
        
        assert was_truncated is False
        assert original_count == 2
        assert len(truncated) == 2
    
    def test_truncate_conversation_history_long(self):
        """Test truncation with long history."""
        # Create history with more than 20 messages
        history = []
        for i in range(30):
            history.append({"role": "user", "content": f"Question {i}"})
            history.append({"role": "assistant", "content": f"Answer {i}"})
        
        truncated, was_truncated, original_count = truncate_conversation_history(
            history, max_messages=20
        )
        
        assert was_truncated is True
        assert original_count == 60  # 30 user + 30 assistant
        assert len(truncated) <= 20
    
    def test_truncate_conversation_history_empty(self):
        """Test truncation with empty history."""
        truncated, was_truncated, original_count = truncate_conversation_history(
            [], max_messages=20
        )
        
        assert was_truncated is False
        assert original_count == 0
        assert len(truncated) == 0
    
    def test_truncate_conversation_history_exact_limit(self):
        """Test truncation with exactly max messages."""
        history = []
        for i in range(20):
            history.append({"role": "user", "content": f"Question {i}"})
        
        truncated, was_truncated, original_count = truncate_conversation_history(
            history, max_messages=20
        )
        
        assert was_truncated is False
        assert original_count == 20
        assert len(truncated) == 20


