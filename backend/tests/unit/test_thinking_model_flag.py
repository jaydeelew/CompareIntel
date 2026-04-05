"""OpenRouter-derived thinking-model detection (reasoning / include_reasoning parameters)."""

from app.llm.registry import (
    get_openrouter_thinking_model_flag,
    is_thinking_model_from_openrouter_entry,
    openrouter_reasoning_request_body,
    should_request_openrouter_reasoning_traces,
)


def test_anthropic_opus_and_sonnet_4_flagged_when_in_snapshot() -> None:
    assert get_openrouter_thinking_model_flag("anthropic/claude-opus-4") is True
    assert get_openrouter_thinking_model_flag("anthropic/claude-sonnet-4") is True
    assert get_openrouter_thinking_model_flag("anthropic/claude-opus-4.1") is True


def test_anthropic_haiku_not_thinking_in_snapshot() -> None:
    assert get_openrouter_thinking_model_flag("anthropic/claude-3.5-haiku") is False


def test_unknown_model_id_returns_none() -> None:
    assert get_openrouter_thinking_model_flag("definitely/not-in-openrouter-snapshot-xyz") is None


def test_qwen_thinking_variant_in_snapshot() -> None:
    assert get_openrouter_thinking_model_flag("qwen/qwen3-next-80b-a3b-thinking") is True


def test_qwen_instruct_not_thinking_in_snapshot() -> None:
    assert get_openrouter_thinking_model_flag("qwen/qwen3-next-80b-a3b-instruct") is False


def test_should_request_reasoning_for_claude_37() -> None:
    assert should_request_openrouter_reasoning_traces("anthropic/claude-3.7-sonnet") is True


def test_openrouter_reasoning_body_anthropic_uses_max_tokens() -> None:
    assert openrouter_reasoning_request_body("anthropic/claude-3.7-sonnet") == {"max_tokens": 31999}


def test_openrouter_reasoning_body_openai_o_series_uses_effort() -> None:
    body = openrouter_reasoning_request_body("openai/o3-mini")
    assert body == {"effort": "medium"}


def test_is_thinking_model_from_openrouter_entry_live_shape() -> None:
    assert (
        is_thinking_model_from_openrouter_entry(
            {"supported_parameters": ["max_tokens", "reasoning", "include_reasoning"]}
        )
        is True
    )
    assert (
        is_thinking_model_from_openrouter_entry({"supported_parameters": ["max_tokens"]}) is False
    )
    assert is_thinking_model_from_openrouter_entry({}) is None
    assert is_thinking_model_from_openrouter_entry(None) is None
