"""
LLM model runner package: registry, tokens, streaming, connection.
Backward-compatible re-exports for app.model_runner consumers.
"""

from .connection import test_connection_quality
from .registry import (
    FREE_TIER_MODELS,
    MODELS_BY_PROVIDER,
    OPENROUTER_MODELS,
    UNREGISTERED_TIER_MODELS,
    client,
    client_with_tool_headers,
    filter_models_by_tier,
    is_model_available_for_tier,
    reload_registry,
)
from .streaming import (
    FETCH_URL_TOOL,
    WEB_SEARCH_TOOL,
    call_openrouter,
    call_openrouter_streaming,
    fetch_url_content,
    is_time_sensitive_query,
)
from .text_processing import clean_model_response, detect_repetition
from .tokens import (
    TokenUsage,
    calculate_credits,
    calculate_token_usage,
    count_conversation_tokens,
    estimate_credits_before_request,
    estimate_token_count,
    fetch_all_models_from_openrouter,
    get_min_max_input_tokens,
    get_min_max_output_tokens,
    get_model_max_input_tokens,
    get_model_max_output_tokens,
    get_model_max_tokens,
    get_model_token_limits_from_openrouter,
    preload_model_token_limits,
    refresh_model_token_limits,
)

__all__ = [
    "FREE_TIER_MODELS",
    "FETCH_URL_TOOL",
    "MODELS_BY_PROVIDER",
    "OPENROUTER_MODELS",
    "TokenUsage",
    "WEB_SEARCH_TOOL",
    "UNREGISTERED_TIER_MODELS",
    "call_openrouter",
    "call_openrouter_streaming",
    "calculate_credits",
    "calculate_token_usage",
    "clean_model_response",
    "client",
    "client_with_tool_headers",
    "count_conversation_tokens",
    "detect_repetition",
    "estimate_credits_before_request",
    "estimate_token_count",
    "fetch_all_models_from_openrouter",
    "fetch_url_content",
    "filter_models_by_tier",
    "get_min_max_input_tokens",
    "get_min_max_output_tokens",
    "get_model_max_input_tokens",
    "get_model_max_output_tokens",
    "get_model_max_tokens",
    "get_model_token_limits_from_openrouter",
    "is_model_available_for_tier",
    "is_time_sensitive_query",
    "preload_model_token_limits",
    "reload_registry",
    "refresh_model_token_limits",
    "test_connection_quality",
]
