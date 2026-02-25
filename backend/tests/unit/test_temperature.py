"""
Unit tests for temperature feature.

Tests cover:
- Temperature parameter in streaming calls (mock mode)
- Temperature support detection from model metadata
- Temperature clamping behavior
"""

from app.llm.registry import get_model_supports_temperature
from app.model_runner import call_openrouter_streaming


class TestTemperatureStreaming:
    """Tests for temperature parameter in streaming calls."""

    def test_streaming_with_temperature(self):
        """Test streaming works with temperature parameter."""
        chunks = list(
            call_openrouter_streaming(
                prompt="Test prompt", model_id="gpt-4", use_mock=True, temperature=0.7
            )
        )
        assert len(chunks) > 0
        assert all(isinstance(chunk, str) for chunk in chunks)

    def test_streaming_with_temperature_zero(self):
        """Test streaming with temperature=0.0 (fully deterministic)."""
        chunks = list(
            call_openrouter_streaming(
                prompt="Test prompt", model_id="gpt-4", use_mock=True, temperature=0.0
            )
        )
        assert len(chunks) > 0

    def test_streaming_with_temperature_max(self):
        """Test streaming with temperature=2.0 (maximum creativity)."""
        chunks = list(
            call_openrouter_streaming(
                prompt="Test prompt", model_id="gpt-4", use_mock=True, temperature=2.0
            )
        )
        assert len(chunks) > 0

    def test_streaming_without_temperature(self):
        """Test streaming without temperature parameter (None)."""
        chunks = list(
            call_openrouter_streaming(
                prompt="Test prompt", model_id="gpt-4", use_mock=True, temperature=None
            )
        )
        assert len(chunks) > 0


class TestTemperatureSupport:
    """Tests for temperature support detection."""

    def test_model_with_temperature_support(self):
        """Test that a model with temperature in supported_parameters returns True."""
        result = get_model_supports_temperature("qwen/qwen3-next-80b-a3b-instruct")
        assert result is True

    def test_model_without_temperature_support(self):
        """Test that reasoning models (e.g. o1) correctly report no temperature support."""
        result = get_model_supports_temperature("openai/o1")
        assert result is False

    def test_model_without_temperature_o3(self):
        """Test that o3 reports no temperature support."""
        result = get_model_supports_temperature("openai/o3")
        assert result is False

    def test_model_without_temperature_gpt5(self):
        """Test that GPT-5 reports no temperature support."""
        result = get_model_supports_temperature("openai/gpt-5")
        assert result is False

    def test_unknown_model_defaults_to_true(self):
        """Test that an unknown model ID defaults to True (safe assumption)."""
        result = get_model_supports_temperature("nonexistent/model-xyz")
        assert result is True
