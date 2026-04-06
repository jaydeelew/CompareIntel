"""Thinking-model (T) flag: separable streamed reasoning, not raw OpenRouter reasoning params."""

from app.llm.registry import (
    get_openrouter_thinking_model_flag,
    is_thinking_model_from_openrouter_entry,
    is_thinking_model_registry_file_value,
    openrouter_reasoning_request_body,
    resolve_is_thinking_model_for_ui,
    should_request_openrouter_reasoning_traces,
    streams_separable_reasoning_from_openrouter_entry,
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


def test_grok_4_not_flagged_despite_reasoning_params() -> None:
    assert get_openrouter_thinking_model_flag("x-ai/grok-4") is False


def test_registry_file_value_includes_snapshot_overrides() -> None:
    assert is_thinking_model_registry_file_value("anthropic/claude-opus-4.5") is True
    assert is_thinking_model_registry_file_value("x-ai/grok-4") is False


def test_kimi_k25_flagged_when_missing_from_bundled_snapshot() -> None:
    """Align T badge + extra_body reasoning with streamed separable reasoning (see STREAMING_REASONING_MODEL_IDS_NOT_IN_SNAPSHOT)."""
    assert get_openrouter_thinking_model_flag("moonshotai/kimi-k2.5") is None
    assert resolve_is_thinking_model_for_ui("moonshotai/kimi-k2.5", {}) is True
    assert is_thinking_model_registry_file_value("moonshotai/kimi-k2.5") is True
    assert should_request_openrouter_reasoning_traces("moonshotai/kimi-k2.5") is True


def test_openrouter_reasoning_body_moonshot_uses_enabled() -> None:
    assert openrouter_reasoning_request_body("moonshotai/kimi-k2.5") == {"enabled": True}


def test_should_request_reasoning_for_claude_37() -> None:
    assert should_request_openrouter_reasoning_traces("anthropic/claude-3.7-sonnet") is True


def test_should_not_request_reasoning_for_grok_4() -> None:
    assert should_request_openrouter_reasoning_traces("x-ai/grok-4") is False


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


def test_streams_separable_false_when_description_denies_exposure() -> None:
    entry = {
        "id": "vendor/model-x",
        "supported_parameters": ["reasoning", "max_tokens"],
        "description": "Great model. Note that reasoning is not exposed to the client.",
    }
    assert streams_separable_reasoning_from_openrouter_entry(entry) is False


def test_streams_separable_respects_id_blocklist() -> None:
    entry = {
        "id": "x-ai/grok-4",
        "supported_parameters": ["reasoning", "include_reasoning"],
        "description": "Marketing text without denial markers.",
    }
    assert streams_separable_reasoning_from_openrouter_entry(entry) is False
