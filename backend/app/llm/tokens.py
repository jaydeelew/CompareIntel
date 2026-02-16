"""
Token counting, tokenizer management, credit calculation.
"""

import logging
import threading
from decimal import Decimal
from typing import Any, NamedTuple

import httpx  # type: ignore[import-untyped]
import tiktoken  # type: ignore[import-untyped]

from ..config import settings
from .registry import OPENROUTER_MODELS

logger = logging.getLogger(__name__)

_model_token_limits_cache: dict[str, dict[str, int]] = {}


def preload_model_token_limits() -> None:
    logger.info("Preloading model token limits from OpenRouter...")
    try:
        all_models = fetch_all_models_from_openrouter()
        if all_models:
            configured_model_ids = {model["id"] for model in OPENROUTER_MODELS}
            limits_dict = {}
            missing_models = []
            for mid in configured_model_ids:
                if mid in all_models:
                    limits = _extract_token_limits(all_models[mid])
                    limits_dict[mid] = limits
                else:
                    missing_models.append(mid)
            _model_token_limits_cache.update(limits_dict)
            logger.info(f"Preloaded token limits for {len(limits_dict)} configured models")
            if missing_models:
                logger.info(
                    f"Skipped {len(missing_models)} model(s) not available from OpenRouter: {', '.join(missing_models)}"
                )
        else:
            logger.warning("Failed to preload model token limits from OpenRouter")
    except Exception as e:
        logger.warning(f"Error preloading model token limits: {e}")


def _extract_token_limits(model_data: dict[str, Any]) -> dict[str, int]:
    limits = {}
    context_length = model_data.get("context_length")
    top_provider = model_data.get("top_provider", {})
    max_completion_tokens = top_provider.get("max_completion_tokens")
    if context_length:
        limits["max_input"] = context_length
        if max_completion_tokens:
            limits["max_output"] = max_completion_tokens
        else:
            limits["max_output"] = int(context_length * 0.2)
    elif max_completion_tokens:
        limits["max_output"] = max_completion_tokens
        limits["max_input"] = max_completion_tokens * 4
    else:
        limits["max_input"] = 8192
        limits["max_output"] = 8192
    return limits


def refresh_model_token_limits(model_id: str | None = None) -> bool:
    try:
        all_models = fetch_all_models_from_openrouter()
        if not all_models:
            return False
        if model_id:
            if model_id in all_models:
                limits = _extract_token_limits(all_models[model_id])
                _model_token_limits_cache[model_id] = limits
                logger.info(f"Refreshed token limits for model: {model_id}")
                return True
            if ":" in model_id:
                base_id = model_id.split(":")[0]
                if base_id in all_models:
                    limits = _extract_token_limits(all_models[base_id])
                    _model_token_limits_cache[base_id] = limits
                    _model_token_limits_cache[model_id] = limits
                    logger.info(
                        f"Refreshed token limits for model: {model_id} (using base: {base_id})"
                    )
                    return True
            logger.warning(f"Model {model_id} not found in OpenRouter data")
            return False
        limits_dict = {}
        for mid, model_data in all_models.items():
            limits = _extract_token_limits(model_data)
            limits_dict[mid] = limits
        _model_token_limits_cache.update(limits_dict)
        logger.info(f"Refreshed token limits for {len(limits_dict)} models")
        return True
    except Exception as e:
        logger.error(f"Error refreshing model token limits: {e}")
        return False


def fetch_all_models_from_openrouter() -> dict[str, dict[str, Any]] | None:
    try:
        with httpx.Client(timeout=30.0) as http_client:
            response = http_client.get(
                "https://openrouter.ai/api/v1/models",
                headers={
                    "Authorization": f"Bearer {settings.openrouter_api_key}",
                    "HTTP-Referer": "https://compareintel.com",
                },
            )
            if response.status_code == 200:
                data = response.json()
                models = data.get("data", [])
                result = {}
                for model in models:
                    model_id = model.get("id")
                    if model_id:
                        result[model_id] = model
                return result
        return None
    except Exception as e:
        logger.warning(f"Failed to fetch models from OpenRouter: {e}")
        return None


def get_model_token_limits_from_openrouter(model_id: str) -> dict[str, int] | None:
    if model_id in _model_token_limits_cache:
        return _model_token_limits_cache[model_id]
    if ":" in model_id:
        base_id = model_id.split(":")[0]
        if base_id in _model_token_limits_cache:
            return _model_token_limits_cache[base_id]
    if not _model_token_limits_cache:
        logger.warning("Model token limits cache is empty, attempting to preload...")
        preload_model_token_limits()
        if model_id in _model_token_limits_cache:
            return _model_token_limits_cache[model_id]
        if ":" in model_id:
            base_id = model_id.split(":")[0]
            if base_id in _model_token_limits_cache:
                return _model_token_limits_cache[base_id]
    return None


def get_model_max_input_tokens(model_id: str) -> int:
    limits = get_model_token_limits_from_openrouter(model_id)
    if limits:
        return limits.get("max_input", 8192)
    return 8192


def get_model_max_output_tokens(model_id: str) -> int:
    return get_model_max_tokens(model_id)


def get_min_max_input_tokens(model_ids: list[str]) -> int:
    if not model_ids:
        return 8192
    max_inputs = [get_model_max_input_tokens(model_id) for model_id in model_ids]
    return min(max_inputs) if max_inputs else 8192


def get_min_max_output_tokens(model_ids: list[str]) -> int:
    if not model_ids:
        return 8192
    max_outputs = [get_model_max_tokens(model_id) for model_id in model_ids]
    return min(max_outputs) if max_outputs else 8192


_tokenizer_cache: dict[str, Any] = {}
_cache_lock = threading.Lock()


def _get_huggingface_model_name(model_id: str) -> str | None:
    base_id = model_id.split(":")[0]
    hf_model_map = {
        "meta-llama/llama-3.3-70b-instruct": "meta-llama/Llama-3.3-70B-Instruct",
        "meta-llama/llama-4-scout": "meta-llama/Llama-4-Scout-17B-Instruct",
        "meta-llama/llama-4-maverick": "meta-llama/Llama-4-Maverick-17B-Instruct",
        "mistralai/mistral-small-3.2-24b-instruct": "mistralai/Mistral-Small-3.2-24B-Instruct",
        "mistralai/mistral-medium-3.1": "mistralai/Mistral-Medium-3.1",
        "mistralai/mistral-large": "mistralai/Mistral-Large-2407",
        "mistralai/devstral-small": "mistralai/Devstral-Small-1.1",
        "mistralai/devstral-medium": "mistralai/Devstral-Medium",
        "mistralai/codestral-2508": "mistralai/Codestral-2508",
        "deepseek/deepseek-r1": "deepseek-ai/DeepSeek-R1",
        "deepseek/deepseek-v3.2-exp": "deepseek-ai/DeepSeek-V3.2-Exp",
        "deepseek/deepseek-chat-v3.1": "deepseek-ai/DeepSeek-V3.1",
        "qwen/qwen3-30b-a3b-instruct-2507": "Qwen/Qwen3-30B-A3B-Instruct-2507",
        "qwen/qwen3-next-80b-a3b-instruct": "Qwen/Qwen3-Next-80B-A3B-Instruct",
        "qwen/qwen3-max": "Qwen/Qwen3-Max",
        "qwen/qwen3-coder-flash": "Qwen/Qwen3-Coder-Flash",
        "qwen/qwen3-coder-plus": "Qwen/Qwen3-Coder-Plus",
        "qwen/qwen3-coder": "Qwen/Qwen3-Coder-480B-A35B",
        "microsoft/phi-4": "microsoft/Phi-4",
        "microsoft/phi-4-reasoning-plus": "microsoft/Phi-4-Reasoning-Plus",
        "microsoft/wizardlm-2-8x22b": "microsoft/WizardLM-2-8x22B",
    }
    return hf_model_map.get(base_id) or hf_model_map.get(model_id)


def _get_anthropic_tokenizer():
    cache_key = "anthropic"
    with _cache_lock:
        if cache_key not in _tokenizer_cache:
            try:
                from anthropic import Anthropic  # type: ignore[import-untyped]

                client = Anthropic(api_key="dummy")
                _tokenizer_cache[cache_key] = client
            except ImportError:
                logger.debug("anthropic package not installed, skipping Anthropic tokenizer")
                _tokenizer_cache[cache_key] = None
            except Exception as e:
                logger.warning(f"Failed to initialize Anthropic tokenizer: {e}")
                _tokenizer_cache[cache_key] = None
        return _tokenizer_cache[cache_key]


def _get_huggingface_tokenizer(model_id: str) -> Any | None:
    hf_model_name = _get_huggingface_model_name(model_id)
    if not hf_model_name:
        return None
    with _cache_lock:
        if hf_model_name not in _tokenizer_cache:
            try:
                from transformers import AutoTokenizer  # type: ignore[import-untyped]

                tokenizer = AutoTokenizer.from_pretrained(
                    hf_model_name,
                    trust_remote_code=True,
                    use_fast=True,
                )
                _tokenizer_cache[hf_model_name] = tokenizer
                logger.debug(f"Loaded tokenizer for {hf_model_name}")
            except ImportError:
                logger.debug("transformers package not installed, skipping HuggingFace tokenizer")
                _tokenizer_cache[hf_model_name] = None
            except Exception as e:
                logger.warning(f"Failed to load tokenizer for {hf_model_name}: {e}")
                _tokenizer_cache[hf_model_name] = None
        return _tokenizer_cache.get(hf_model_name)


def get_model_max_tokens(model_id: str) -> int:
    limits = get_model_token_limits_from_openrouter(model_id)
    if limits:
        max_output = limits.get("max_output", 8192)
    else:
        max_output = 8192
    model_limits = {
        "anthropic/claude-opus-4.1": 4096,
        "anthropic/claude-opus-4": 4096,
    }
    if model_id in model_limits:
        return min(model_limits[model_id], max_output)
    return max_output


def estimate_token_count(text: str, model_id: str | None = None) -> int:
    if not text:
        return 0
    if model_id:
        provider = model_id.split("/")[0] if "/" in model_id else ""
        if provider == "anthropic":
            try:
                client = _get_anthropic_tokenizer()
                if client:
                    return client.count_tokens(text)
            except Exception as e:
                logger.debug(f"Anthropic tokenizer failed: {e}, falling back to tiktoken")
        elif provider in ["meta-llama", "mistralai", "deepseek", "qwen", "microsoft"]:
            try:
                tokenizer = _get_huggingface_tokenizer(model_id)
                if tokenizer:
                    return len(tokenizer.encode(text, add_special_tokens=False))
            except Exception as e:
                logger.debug(
                    f"HuggingFace tokenizer failed for {model_id}: {e}, falling back to tiktoken"
                )
        elif provider == "openai":
            try:
                if "gpt-4o" in model_id.lower():
                    encoding = tiktoken.get_encoding("o200k_base")
                else:
                    encoding = tiktoken.get_encoding("cl100k_base")
                return len(encoding.encode(text))
            except Exception as e:
                logger.debug(f"OpenAI tokenizer failed: {e}, falling back to default")
    try:
        encoding = tiktoken.get_encoding("cl100k_base")
        return len(encoding.encode(text))
    except Exception:
        return len(text) // 4


class TokenUsage(NamedTuple):
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    effective_tokens: int
    credits: Decimal


def calculate_credits(prompt_tokens: int, completion_tokens: int) -> Decimal:
    effective_tokens = prompt_tokens + int(completion_tokens * 2.5)
    credits = Decimal(effective_tokens) / Decimal(1000)
    return credits


def calculate_token_usage(prompt_tokens: int, completion_tokens: int) -> TokenUsage:
    total_tokens = prompt_tokens + completion_tokens
    effective_tokens = prompt_tokens + int(completion_tokens * 2.5)
    credits = calculate_credits(prompt_tokens, completion_tokens)
    return TokenUsage(
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        total_tokens=total_tokens,
        effective_tokens=effective_tokens,
        credits=credits,
    )


def estimate_credits_before_request(
    prompt: str,
    num_models: int = 1,
    conversation_history: list[Any] | None = None,
    model_id: str | None = None,
) -> Decimal:
    input_tokens = estimate_token_count(prompt, model_id=model_id)
    if conversation_history:
        input_tokens += count_conversation_tokens(conversation_history, model_id=model_id)
    estimated_output_tokens = max(500, min(4000, int(input_tokens * 1.5)))
    credits_per_model = calculate_credits(input_tokens, estimated_output_tokens)
    return credits_per_model * num_models


def count_conversation_tokens(messages: list[Any], model_id: str | None = None) -> int:
    total_tokens = 0
    for msg in messages:
        if isinstance(msg, dict):
            content = msg.get("content", "")
        else:
            content = msg.content if hasattr(msg, "content") else ""
        total_tokens += estimate_token_count(str(content), model_id=model_id)
        total_tokens += 4
    return total_tokens
