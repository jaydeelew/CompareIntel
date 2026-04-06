"""Unit tests for streaming reasoning payloads (UI channel, not persisted)."""

from unittest.mock import MagicMock

from app.llm.streaming import REASONING_STREAM_TYPE, _reasoning_stream_payload


def test_reasoning_stream_payload_from_delta_reasoning() -> None:
    delta = MagicMock()
    delta.reasoning = "think step"
    choice = MagicMock()
    assert _reasoning_stream_payload(delta, choice) == {
        "type": REASONING_STREAM_TYPE,
        "content": "think step",
    }


def test_reasoning_stream_payload_reasoning_content_attr() -> None:
    delta = MagicMock(spec=[])
    choice = MagicMock()
    choice.reasoning_content = "alt field"
    assert _reasoning_stream_payload(delta, choice) == {
        "type": REASONING_STREAM_TYPE,
        "content": "alt field",
    }


def test_reasoning_stream_payload_empty() -> None:
    delta = MagicMock(spec=[])
    choice = MagicMock(spec=[])
    assert _reasoning_stream_payload(delta, choice) is None


def test_reasoning_stream_type_constant() -> None:
    assert REASONING_STREAM_TYPE == "reasoning"
