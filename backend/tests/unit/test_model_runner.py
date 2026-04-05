"""
Unit tests for model runner functionality.

Tests cover:
- Streaming model calling (mock mode)
- Error handling
"""

from app.llm.streaming import REASONING_STREAM_TYPE
from app.model_runner import (
    call_openrouter_streaming,
)


class TestModelRunnerMockMode:
    """Tests for model runner in mock mode."""

    def test_call_openrouter_streaming_mock_mode(self):
        """Test streaming OpenRouter in mock mode."""
        chunks = list(
            call_openrouter_streaming(prompt="Test prompt", model_id="gpt-4", use_mock=True)
        )
        assert len(chunks) > 0
        # Mock mode yields one reasoning dict then string answer chunks
        assert chunks[0] == {
            "type": REASONING_STREAM_TYPE,
            "content": "[Mock] Simulated planning step before answering.\n\n",
        }
        assert all(isinstance(chunk, str) for chunk in chunks[1:])
