"""
Model runner for OpenRouter API integration.

This module handles communication with OpenRouter API to access 50+ AI models
from various providers. It provides both synchronous and streaming interfaces
for model comparisons, with support for conversation history, tier-based limits,
and error handling.

Key Features:
- Concurrent model execution for fast comparisons
- Server-Sent Events (SSE) streaming support
- Token counting and tier limit enforcement
- Mock mode for testing (admin feature)
- Connection quality tracking
"""

from openai import OpenAI  # type: ignore[import-untyped]
import concurrent.futures
from typing import Dict, List, Any, Optional, Generator, NamedTuple
import time
import re
import tiktoken  # type: ignore[import-untyped]
from decimal import Decimal
import httpx  # type: ignore[import-untyped]
import logging
import threading
from .mock_responses import stream_mock_response, get_mock_response
from .types import ConnectionQualityDict
from .cache import cache

# Import configuration
from .config import settings

logger = logging.getLogger(__name__)

OPENROUTER_API_KEY = settings.openrouter_api_key

# ============================================================================
# Model Tier Classification System
# ============================================================================
# Models are classified into three tiers based on OpenRouter pricing:
# - "anonymous": Budget models < $0.50/M tokens (available to unregistered users)
# - "free": Mid-level models $0.50-$3.00/M tokens (available to registered free users)
# - "paid": Premium models >= $3.00/M tokens (requires paid subscription)
# All paid tiers (Starter, Starter+, Pro, Pro+) have access to ALL models

# List of model IDs available to anonymous (unregistered) users
# Classification criteria: Models costing < $0.50 per million tokens (input+output average)
# Generally includes: models with ":free" suffix, nano/mini versions, budget options
ANONYMOUS_TIER_MODELS = {
    # Anthropic - OVERRIDING PRICE CLASSIFICATION
    "anthropic/claude-3.5-haiku",
    # Cohere - OVERRIDING PRICE CLASSIFICATION
    "cohere/command-r7b-12-2024",
    # DeepSeek - Very affordable models (~$0.14-$0.55/M avg)
    "deepseek/deepseek-chat-v3.1",  # ~$0.27 input, $1.10 output = ~$0.69/M avg - borderline, keep in anon
    "deepseek/deepseek-v3.2-exp",  # Similar pricing
    # Meta - Free/open models (~$0.12-$0.30/M)    # Microsoft - Efficient models (~$0.07-$0.14/M)
    "microsoft/phi-4",  # ~$0.07 input, $0.14 output = ~$0.11/M avg
    # Google - Flash models (~$0.15-$0.60/M)
    "google/gemini-2.0-flash-001",
    "google/gemini-2.5-flash",  # ~$0.15 input, $0.60 output = ~$0.38/M avg
    "openai/gpt-oss-120b",  # Auto-classified based on pricing,
    "x-ai/grok-code-fast-1",
    "x-ai/grok-4-fast",
    "meta-llama/llama-3.1-405b-instruct:free",  # Auto-classified based on pricing,    "meta-llama/llama-3.3-70b-instruct",  # Auto-classified based on pricing
}

# List of model IDs available to free (registered) users
# Includes all anonymous tier models PLUS mid-level models as an incentive to register
# Classification criteria: Models costing $0.50 - $3.00 per million tokens (input+output average)
# Generally includes: small/medium models, "plus" variants, efficient versions
FREE_TIER_MODELS = ANONYMOUS_TIER_MODELS.union(
    {
        # DeepSeek - Reasoning model (~$0.55 input, $2.19 output = ~$1.37/M avg)
        "deepseek/deepseek-r1",
        # Anthropic - Haiku (efficient) (~$0.80 input, $4.00 output = ~$2.40/M avg)
        "anthropic/claude-haiku-4.5",
        # OpenAI - Mini/Nano models (~$0.15-$0.60/M avg)
        "openai/gpt-5-mini",
        "openai/gpt-5-nano",
        "openai/gpt-5.1-codex-mini",
        "openai/o3-mini",
        # Meta - Llama 4 models (~$0.50-$1.50/M avg)
        "meta-llama/llama-4-scout",
        "meta-llama/llama-4-maverick",
        # Microsoft - Plus variants (~$0.50-$1.50/M avg)
        "microsoft/phi-4-reasoning-plus",
        "microsoft/wizardlm-2-8x22b",
        # Mistral - Small/Medium models (~$0.20-$2.00/M avg)
        "mistralai/mistral-small-3.2-24b-instruct",
        "mistralai/mistral-medium-3.1",
        "mistralai/devstral-small",
        "mistralai/devstral-medium",
        # Cohere - Budget models (~$0.15-$2.50/M avg)
        "cohere/command-r-plus-08-2024",
        # Qwen - Efficient models (~$0.30-$2.00/M avg)
        "qwen/qwen3-coder-flash",
        "qwen/qwen3-30b-a3b-instruct-2507",
        "qwen/qwen3-next-80b-a3b-instruct",
        # xAI
        "x-ai/grok-3-mini",  # Auto-classified based on pricing
        # When adding new models, classify based on OpenRouter pricing:
        # - Anonymous tier: Models costing < $0.50 per million tokens
        # - Free tier: Models costing $0.50 - $3.00 per million tokens
        # - Paid tier: Models costing >= $3.00 per million tokens
    }
)


def is_model_available_for_tier(model_id: str, tier: str) -> bool:
    """
    Check if a model is available for a given subscription tier.

    Args:
        model_id: Model identifier (e.g., "openai/gpt-5.1")
        tier: Subscription tier ("anonymous", "free", "starter", "starter_plus", "pro", "pro_plus")

    Returns:
        True if model is available for the tier, False otherwise
    """
    # All paid tiers have access to all models
    if tier in ["starter", "starter_plus", "pro", "pro_plus"]:
        return True

    # Anonymous tier only has access to anonymous-tier models (most basic/budget)
    if tier == "anonymous":
        return model_id in ANONYMOUS_TIER_MODELS

    # Free tier (registered users) has access to free-tier models (anonymous + mid-level)
    if tier == "free":
        return model_id in FREE_TIER_MODELS

    # Default to False for unknown tiers
    return False


def filter_models_by_tier(models: List[Dict[str, Any]], tier: str) -> List[Dict[str, Any]]:
    """
    Return all models with tier_access field indicating availability for the tier.

    This function now returns ALL models from model_runner.py, marking them with
    tier_access to indicate which tier they're available for. The frontend will
    display locked models as disabled/restricted for anonymous and free tiers.

    Args:
        models: List of model dictionaries
        tier: Subscription tier

    Returns:
        List of all models with tier_access field set appropriately
    """
    result = []
    for model in models:
        model_id = model.get("id")
        if not model_id:
            continue

        # Create a copy of the model with tier_access field
        model_with_access = model.copy()

        # Set tier_access based on model classification
        if model_id in ANONYMOUS_TIER_MODELS:
            model_with_access["tier_access"] = "anonymous"
        elif model_id in FREE_TIER_MODELS:
            model_with_access["tier_access"] = "free"
        else:
            model_with_access["tier_access"] = "paid"

        result.append(model_with_access)

    return result


# List of available models organized by providers
MODELS_BY_PROVIDER = {
    "Anthropic": [
        {
            "id": "anthropic/claude-3.5-haiku",
            "name": "Claude Haiku 3.5",
            "description": "A fast, efficient model optimized for speed, coding accuracy, and tool use at low cost.",
            "category": "Language",
            "provider": "Anthropic",
        },
        {
            "id": "anthropic/claude-haiku-4.5",
            "name": "Claude Haiku 4.5",
            "description": "Anthropic's fastest model delivering near-frontier intelligence with minimal latency and cost.",
            "category": "Language",
            "provider": "Anthropic",
        },
        {
            "id": "anthropic/claude-3.7-sonnet",
            "name": "Claude Sonnet 3.7",
            "description": "An advanced model with hybrid extended thinking capabilities for complex reasoning and coding tasks.",
            "category": "Language/Reasoning",
            "provider": "Anthropic",
        },
        {
            "id": "anthropic/claude-sonnet-4",
            "name": "Claude Sonnet 4",
            "description": "A high-performance model excelling in coding, reasoning, and instruction-following with improved precision.",
            "category": "Language",
            "provider": "Anthropic",
        },
        {
            "id": "anthropic/claude-sonnet-4.5",
            "name": "Claude Sonnet 4.5",
            "description": "Anthropic's most advanced Sonnet optimized for real-world agentic workflows and coding tasks.",
            "category": "Language",
            "provider": "Anthropic",
        },
        {
            "id": "anthropic/claude-opus-4",
            "name": "Claude Opus 4",
            "description": "A frontier coding model with sustained performance on complex, long-running agentic tasks.",
            "category": "Language",
            "provider": "Anthropic",
        },
        {
            "id": "anthropic/claude-opus-4.1",
            "name": "Claude Opus 4.1",
            "description": "An updated flagship model with enhanced coding, reasoning, and multi-step agentic capabilities.",
            "category": "Language/Code",
            "provider": "Anthropic",
        },
        {
            "id": "anthropic/claude-opus-4.5",
            "name": "Claude Opus 4.5",
            "description": "Anthropic's most capable model for complex software engineering and long-horizon computer use tasks.",
            "category": "Language",
            "provider": "Anthropic",
        },
    ],
    "Cohere": [
        {
            "id": "cohere/command-r7b-12-2024",
            "name": "Command R7B",
            "description": "A compact 7B model optimized for fast, efficient responses in conversational and RAG applications.",
            "category": "Language",
            "provider": "Cohere",
        },
        {
            "id": "cohere/command-r-plus-08-2024",
            "name": "Command R+",
            "description": "An enterprise-grade model with 50% higher throughput for complex reasoning and generation tasks.",
            "category": "Language/Reasoning",
            "provider": "Cohere",
        },
        {
            "id": "cohere/command-a",
            "name": "Command A",
            "description": "An open-weights 111B model with 256k context excelling in agentic, multilingual, and coding tasks.",
            "category": "Language",
            "provider": "Cohere",
        },
    ],
    "DeepSeek": [
        {
            "id": "deepseek/deepseek-v3.2-exp",
            "name": "DeepSeek V3.2 Exp",
            "description": "An experimental model with enhanced reasoning and coding capabilities bridging V3.1 and future architectures.",
            "category": "Language/Reasoning",
            "provider": "DeepSeek",
        },
        {
            "id": "deepseek/deepseek-chat-v3.1",
            "name": "DeepSeek Chat V3.1",
            "description": "A 671B hybrid MoE model (37B active) supporting both thinking and non-thinking modes for versatile reasoning.",
            "category": "Language/Reasoning",
            "provider": "DeepSeek",
        },
        {
            "id": "deepseek/deepseek-r1",
            "name": "DeepSeek R1",
            "description": "An open-source reasoning model matching OpenAI o1 performance with fully transparent chain-of-thought.",
            "category": "Reasoning",
            "provider": "DeepSeek",
        },
    ],
    "Google": [
        {
            "id": "google/gemini-2.0-flash-001",
            "name": "Gemini 2.0 Flash",
            "description": 'A high-speed model with significantly faster time-to-first-token while maintaining Pro-level quality.',
            "category": "Language",
            "provider": "Google",
        },
        {
            "id": "google/gemini-2.5-flash",
            "name": "Gemini 2.5 Flash",
            "description": "Google's fast, cost-efficient model with built-in thinking capabilities for reasoning, coding, and math tasks.",
            "category": "Language",
            "provider": "Google",
        },
        {
            "id": "google/gemini-2.5-pro",
            "name": "Gemini 2.5 Pro",
            "description": "Google's most capable model excelling in complex reasoning, coding, mathematics, and scientific analysis.",
            "category": "Language",
            "provider": "Google",
        },
        {
            "id": "google/gemini-3-flash-preview",
            "name": "Gemini 3 Flash Preview",
            "description": 'Gemini 3 Flash Preview is a high speed, high value thinking model designed for agentic workflows, multi turn chat, and coding assistance.',
            "category": "Language",
            "provider": "Google",
        },
        {
            "id": "google/gemini-3-pro-preview",
            "name": "Gemini 3 Pro Preview",
            "description": "Google's flagship multimodal model with 1M-token context for text, image, video, audio, and code tasks.",
            "category": "Language",
            "provider": "Google",
        },
    ],
    "Meta": [        {
            "id": "meta-llama/llama-3.1-405b-instruct:free",
            "name": "Llama 3.1 405B Instruct:Free",
            "description": "Meta's largest open-source model (405B) with strong multilingual, coding, and reasoning capabilities.",
            "category": "Language",
            "provider": "Meta",
        },
        {
            "id": "meta-llama/llama-3.3-70b-instruct",
            "name": "Llama 3.3 70B Instruct",
            "description": 'The Meta Llama 3.3 multilingual large language model (LLM) is a pretrained and instruction tuned generative model in 70B.',
            "category": "Language",
            "provider": "Meta",
        },
        {
            "id": "meta-llama/llama-4-scout",
            "name": "Llama 4 Scout",
            "description": 'A 109B MoE model (17B active) optimized for efficient multimodal understanding and generation tasks.',
            "category": "Multimodal",
            "provider": "Meta",
        },
        {
            "id": "meta-llama/llama-4-maverick",
            "name": "Llama 4 Maverick",
            "description": 'A high-capacity 400B MoE model (17B active, 128 experts) for complex multimodal reasoning and generation.',
            "category": "Multimodal",
            "provider": "Meta",
        },
        {
            "id": "meta-llama/llama-3.1-405b-instruct",
            "name": "Llama 3.1 405B Instruct",
            "description": "Meta's flagship 405B open-source model excelling in multilingual understanding, coding, and instruction-following.",
            "category": "Language",
            "provider": "Meta",
        },
    ],
    "Microsoft": [
        {
            "id": "microsoft/phi-4",
            "name": "Phi 4",
            "description": "A compact 14B model excelling in complex reasoning while operating efficiently with limited resources.",
            "category": "Language/Reasoning",
            "provider": "Microsoft",
        },
        {
            "id": "microsoft/wizardlm-2-8x22b",
            "name": "WizardLM-2 8x22B",
            "description": "Microsoft's advanced MoE model with strong performance across reasoning, coding, and creative tasks.",
            "category": "Language/Reasoning",
            "provider": "Microsoft",
        },
        {
            "id": "microsoft/phi-4-reasoning-plus",
            "name": "Phi 4 Reasoning Plus",
            "description": "An enhanced 14B model with reinforcement learning fine-tuning for improved math, science, and code reasoning.",
            "category": "Reasoning",
            "provider": "Microsoft",
        },
    ],
    "Minimax": [
        {
            "id": "minimax/minimax-m2",
            "name": "Minimax M2",
            "description": "A compact, high-efficiency model optimized for end-to-end coding and agentic workflow automation.",
            "category": "Language",
            "provider": "Minimax",
        },
    ],
    "Mistral": [
        {
            "id": "mistralai/mistral-small-3.2-24b-instruct",
            "name": "Mistral Small 3.2 24B",
            "description": "A 24B multimodal model optimized for instruction-following, function calling, and vision tasks.",
            "category": "Multimodal",
            "provider": "Mistral",
        },
        {
            "id": "mistralai/mistral-medium-3.1",
            "name": "Mistral Medium 3.1",
            "description": "An enterprise-grade model delivering frontier-level capabilities at significantly reduced operational cost.",
            "category": "Language",
            "provider": "Mistral",
        },
        {
            "id": "mistralai/devstral-small",
            "name": "Devstral Small",
            "description": "A 24B open-weight model specialized for software engineering agents and autonomous coding tasks.",
            "category": "Code",
            "provider": "Mistral",
        },
        {
            "id": "mistralai/devstral-medium",
            "name": "Devstral Medium",
            "description": "A high-performance model for code generation and agentic reasoning in complex development workflows.",
            "category": "Code",
            "provider": "Mistral",
        },
        {
            "id": "mistralai/mistral-large",
            "name": "Mistral Large",
            "description": "Mistral's flagship model with strong multilingual, coding, reasoning, and function-calling capabilities.",
            "category": "Language/Reasoning",
            "provider": "Mistral",
        },
        {
            "id": "mistralai/codestral-2508",
            "name": "Codestral 2508",
            "description": "Mistral's specialized coding model with state-of-the-art performance on code generation and completion.",
            "category": "Code",
            "provider": "Mistral",
        },
    ],
    "OpenAI": [
        {
            "id": "openai/o3-mini",
            "name": "o3 Mini",
            "description": 'A cost-efficient reasoning model optimized for STEM tasks, excelling in science, mathematics, and coding.',
            "category": "Reasoning",
            "provider": "OpenAI",
        },
        {
            "id": "openai/o3",
            "name": "o3",
            "description": "OpenAI's advanced reasoning model with state-of-the-art performance across math, science, and coding benchmarks.",
            "category": "Reasoning",
            "provider": "OpenAI",
        },
        {
            "id": "openai/gpt-oss-120b",
            "name": "Gpt Oss 120B",
            "description": 'An open-weight 117B MoE model designed for high-reasoning, agentic, and general-purpose production tasks.',
            "category": "Language",
            "provider": "OpenAI",
        },
        {
            "id": "openai/gpt-5.2",
            "name": "Gpt 5.2",
            "description": 'GPT-5.2 is the latest frontier-grade model in the GPT-5 series, offering stronger agentic and long context perfomance compared to GPT-5.1.',
            "category": "Language",
            "provider": "OpenAI",
        },
        {
            "id": "openai/gpt-5.1-codex-mini",
            "name": "GPT-5.1-Codex-Mini",
            "description": 'A compact, fast coding model for efficient code generation and software development tasks.',
            "category": "Code",
            "provider": "OpenAI",
        },
        {
            "id": "openai/gpt-5.1-codex",
            "name": "GPT-5.1-Codex",
            "description": 'The most capable GPT-5.1 variant specialized for advanced software engineering and coding workflows.',
            "category": "Code",
            "provider": "OpenAI",
        },
        {
            "id": "openai/gpt-5.1-chat",
            "name": "GPT-5.1 Chat",
            "description": 'A fast, lightweight model optimized for low-latency chat while retaining strong general intelligence.',
            "category": "Language",
            "provider": "OpenAI",
        },
        {
            "id": "openai/gpt-5.1",
            "name": "GPT-5.1",
            "description": 'The latest frontier model with stronger reasoning, improved instruction adherence, and natural conversation.',
            "category": "Language",
            "provider": "OpenAI",
        },
        {
            "id": "openai/gpt-5-nano",
            "name": "GPT-5 Nano",
            "description": 'The smallest GPT-5 variant optimized for ultra-low latency developer tools and rapid interactions.',
            "category": "Language",
            "provider": "OpenAI",
        },
        {
            "id": "openai/gpt-5-mini",
            "name": "GPT-5 Mini",
            "description": 'A compact GPT-5 variant designed for efficient, lighter-weight reasoning and general tasks.',
            "category": "Language",
            "provider": "OpenAI",
        },
        {
            "id": "openai/gpt-5-codex",
            "name": "GPT-5 Codex",
            "description": 'A specialized GPT-5 variant optimized for software engineering, code generation, and development workflows.',
            "category": "Code",
            "provider": "OpenAI",
        },
        {
            "id": "openai/gpt-5-chat",
            "name": "GPT-5 Chat",
            "description": 'A GPT-5 variant optimized for natural, multimodal, and context-aware enterprise conversations.',
            "category": "Language",
            "provider": "OpenAI",
        },
        {
            "id": "openai/gpt-5",
            "name": "GPT-5",
            "description": "OpenAI's most advanced model with major improvements in reasoning, code quality, and user experience.",
            "category": "Language",
            "provider": "OpenAI",
        },
        {
            "id": "openai/gpt-4o",
            "name": "GPT-4o",
            "description": 'An omnimodal model supporting text and image inputs with fast, intelligent multimodal responses.',
            "category": "Language",
            "provider": "OpenAI",
        },
    ],
    "Qwen": [
        {
            "id": "qwen/qwen3-next-80b-a3b-instruct",
            "name": "Qwen3 Next 80B A3B Instruct",
            "description": "An 80B MoE instruction-tuned model optimized for fast, stable responses without thinking traces.",
            "category": "Language",
            "provider": "Qwen",
        },
        {
            "id": "qwen/qwen3-30b-a3b-instruct-2507",
            "name": "Qwen3 30B A3B Instruct 2507",
            "description": "A 30.5B MoE model with 3.3B active parameters for efficient instruction-following and chat.",
            "category": "Language",
            "provider": "Qwen",
        },
        {
            "id": "qwen/qwen3-coder-flash",
            "name": "Qwen3 Coder Flash",
            "description": "A fast, cost-efficient coding model optimized for rapid code generation and completion tasks.",
            "category": "Code",
            "provider": "Qwen",
        },
        {
            "id": "qwen/qwen3-coder-plus",
            "name": "Qwen3 Coder Plus",
            "description": "Alibaba's proprietary coding model with enhanced performance for complex development tasks.",
            "category": "Code",
            "provider": "Qwen",
        },
        {
            "id": "qwen/qwen3-coder",
            "name": "Qwen3 Coder 480B A35B",
            "description": "A 480B MoE model (35B active) achieving state-of-the-art code generation and agentic coding performance.",
            "category": "Code",
            "provider": "Qwen",
        },
        {
            "id": "qwen/qwen3-235b-a22b",
            "name": "Qwen3 235B A22B",
            "description": "A 235B MoE model (22B active) with strong reasoning, coding, and multilingual capabilities.",
            "category": "Language",
            "provider": "Qwen",
        },
        {
            "id": "qwen/qwen3-vl-235b-a22b-thinking",
            "name": "Qwen3 VL 235B A22B Thinking",
            "description": "A multimodal reasoning model unifying text generation with visual understanding across images and video.",
            "category": "Multimodal/Reasoning",
            "provider": "Qwen",
        },
        {
            "id": "qwen/qwen3-next-80b-a3b-thinking",
            "name": "Qwen3 Next 80B A3B Thinking",
            "description": "A reasoning-first model with structured chain-of-thought traces for complex problem-solving.",
            "category": "Language/Reasoning",
            "provider": "Qwen",
        },
        {
            "id": "qwen/qwen3-max",
            "name": "Qwen3 Max",
            "description": "Qwen's most capable model with strong reasoning, instruction-following, and multilingual abilities.",
            "category": "Language",
            "provider": "Qwen",
        },
    ],
    "xAI": [
        {
            "id": "x-ai/grok-4-fast",
            "name": "Grok 4 Fast",
            "description": "A cost-efficient multimodal model with 2M token context for fast, large-scale processing.",
            "category": "Language",
            "provider": "xAI",
        },
        {
            "id": "x-ai/grok-code-fast-1",
            "name": "Grok Code Fast 1",
            "description": "A speedy, economical reasoning model optimized for agentic coding and development tasks.",
            "category": "Language",
            "provider": "xAI",
        },
        {
            "id": "x-ai/grok-3-mini",
            "name": "Grok 3 Mini",
            "description": "A lightweight reasoning model with chain-of-thought capabilities for efficient problem-solving.",
            "category": "Language",
            "provider": "xAI",
        },
        {
            "id": "x-ai/grok-4",
            "name": "Grok 4",
            "description": "xAI's flagship reasoning model with 256k context for complex analysis and generation tasks.",
            "category": "Language",
            "provider": "xAI",
        },
        {
            "id": "x-ai/grok-5",
            "name": "Grok 5 (Coming Soon)",
            "description": "xAI's upcoming next-generation model expected by end of 2025 (not yet available).",
            "category": "Language",
            "provider": "xAI",
            "available": False,
        },
    ],
}

# Flatten the models for backward compatibility
OPENROUTER_MODELS = []
for provider, models in MODELS_BY_PROVIDER.items():
    OPENROUTER_MODELS.extend(models)

client = OpenAI(api_key=OPENROUTER_API_KEY, base_url="https://openrouter.ai/api/v1")

# In-memory cache for model token limits
# These limits are relatively static and only change when models are added/updated
# Cache is populated on application startup and when models are added via admin panel
_model_token_limits_cache: Dict[str, Dict[str, int]] = {}


def preload_model_token_limits() -> None:
    """
    Preload model token limits from OpenRouter on application startup.
    This ensures limits are available immediately without waiting for first request.
    Only preloads limits for models configured in OPENROUTER_MODELS.
    """
    logger.info("Preloading model token limits from OpenRouter...")
    try:
        all_models = fetch_all_models_from_openrouter()
        if all_models:
            # Extract and cache token limits only for configured models
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


def _extract_token_limits(model_data: Dict[str, Any]) -> Dict[str, int]:
    """
    Extract token limits from OpenRouter model data.

    Args:
        model_data: Model data dictionary from OpenRouter API

    Returns:
        Dictionary with 'max_input' and 'max_output' keys
    """
    limits = {}

    # Get context_length (total context window)
    context_length = model_data.get("context_length")

    # Get max_completion_tokens from top_provider
    top_provider = model_data.get("top_provider", {})
    max_completion_tokens = top_provider.get("max_completion_tokens")

    # If we have context_length but no max_completion_tokens, estimate
    # Most models use ~80% of context for input, 20% for output
    if context_length:
        limits["max_input"] = context_length
        if max_completion_tokens:
            limits["max_output"] = max_completion_tokens
        else:
            # Estimate: assume output can be up to 20% of context window
            limits["max_output"] = int(context_length * 0.2)
    elif max_completion_tokens:
        # If we only have max_completion_tokens, estimate input as 4x output
        limits["max_output"] = max_completion_tokens
        limits["max_input"] = max_completion_tokens * 4
    else:
        # No data available, use defaults
        limits["max_input"] = 8192  # Default context window
        limits["max_output"] = 8192  # Default output

    return limits


def refresh_model_token_limits(model_id: Optional[str] = None) -> bool:
    """
    Refresh token limits for a specific model or all models.
    Called when a model is added via admin panel.

    Args:
        model_id: Optional specific model ID to refresh, or None to refresh all

    Returns:
        True if successful, False otherwise
    """
    try:
        all_models = fetch_all_models_from_openrouter()
        if not all_models:
            return False

        if model_id:
            # Refresh specific model
            if model_id in all_models:
                limits = _extract_token_limits(all_models[model_id])
                _model_token_limits_cache[model_id] = limits
                logger.info(f"Refreshed token limits for model: {model_id}")
                return True
            else:
                logger.warning(f"Model {model_id} not found in OpenRouter data")
                return False
        else:
            # Refresh all models
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


def fetch_all_models_from_openrouter() -> Optional[Dict[str, Dict[str, Any]]]:
    """
    Fetch all models from OpenRouter API and extract token limits.

    Returns:
        Dictionary mapping model_id to model data, or None if fetch fails
    """
    try:
        # Use synchronous httpx client to avoid async complexity
        with httpx.Client(timeout=30.0) as http_client:
            response = http_client.get(
                "https://openrouter.ai/api/v1/models",
                headers={
                    "Authorization": f"Bearer {OPENROUTER_API_KEY}",
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


def get_model_token_limits_from_openrouter(model_id: str) -> Optional[Dict[str, int]]:
    """
    Get token limits for a specific model from cached OpenRouter data.

    Args:
        model_id: Model identifier (e.g., "openai/gpt-4")

    Returns:
        Dictionary with 'max_input' and 'max_output' keys, or None if not found
    """
    # Check in-memory cache first
    if model_id in _model_token_limits_cache:
        return _model_token_limits_cache[model_id]

    # If cache is empty, try to preload (shouldn't happen after startup, but handle gracefully)
    if not _model_token_limits_cache:
        logger.warning("Model token limits cache is empty, attempting to preload...")
        preload_model_token_limits()
        if model_id in _model_token_limits_cache:
            return _model_token_limits_cache[model_id]

    # Not found in cache
    return None


def get_model_max_input_tokens(model_id: str) -> int:
    """
    Get maximum input tokens (context window) for a model.

    Args:
        model_id: Model identifier

    Returns:
        Maximum input tokens, defaults to 8192 if not available
    """
    limits = get_model_token_limits_from_openrouter(model_id)
    if limits:
        return limits.get("max_input", 8192)
    return 8192  # Default fallback


def get_model_max_output_tokens(model_id: str) -> int:
    """
    Get maximum output tokens for a model.

    This is an alias for get_model_max_tokens() for consistency.
    """
    return get_model_max_tokens(model_id)


def get_min_max_input_tokens(model_ids: List[str]) -> int:
    """
    Get the minimum maximum input tokens across all selected models.
    This is used to validate that user input doesn't exceed any model's limit.

    Args:
        model_ids: List of model identifiers

    Returns:
        Minimum max input tokens across all models
    """
    if not model_ids:
        return 8192  # Default

    max_inputs = [get_model_max_input_tokens(model_id) for model_id in model_ids]
    return min(max_inputs) if max_inputs else 8192


def get_min_max_output_tokens(model_ids: List[str]) -> int:
    """
    Get the minimum maximum output tokens across all selected models.
    This is used to cap response length to avoid truncation.

    Args:
        model_ids: List of model identifiers

    Returns:
        Minimum max output tokens across all models
    """
    if not model_ids:
        return 8192  # Default

    max_outputs = [get_model_max_tokens(model_id) for model_id in model_ids]
    return min(max_outputs) if max_outputs else 8192


# ============================================================================
# Tokenizer Cache for Provider-Specific Token Counting
# ============================================================================
# Thread-safe cache for tokenizer instances to avoid repeated loading
_tokenizer_cache: Dict[str, Any] = {}
_cache_lock = threading.Lock()


def _get_huggingface_model_name(model_id: str) -> Optional[str]:
    """
    Map OpenRouter model IDs to Hugging Face model names.
    Returns None if mapping not available.

    Args:
        model_id: OpenRouter model identifier (e.g., "meta-llama/llama-3.3-70b-instruct")

    Returns:
        Hugging Face model name or None
    """
    # Handle :free suffix by removing it
    base_id = model_id.split(":")[0]

    # Map OpenRouter IDs to HuggingFace model names
    hf_model_map = {
        # Meta Llama models
        "meta-llama/llama-3.3-70b-instruct": "meta-llama/Llama-3.3-70B-Instruct",
        "meta-llama/llama-4-scout": "meta-llama/Llama-4-Scout-17B-Instruct",
        "meta-llama/llama-4-maverick": "meta-llama/Llama-4-Maverick-17B-Instruct",
        # Mistral models
        "mistralai/mistral-small-3.2-24b-instruct": "mistralai/Mistral-Small-3.2-24B-Instruct",
        "mistralai/mistral-medium-3.1": "mistralai/Mistral-Medium-3.1",
        "mistralai/mistral-large": "mistralai/Mistral-Large-2407",
        "mistralai/devstral-small": "mistralai/Devstral-Small-1.1",
        "mistralai/devstral-medium": "mistralai/Devstral-Medium",
        "mistralai/codestral-2508": "mistralai/Codestral-2508",
        # DeepSeek models
        "deepseek/deepseek-r1": "deepseek-ai/DeepSeek-R1",
        "deepseek/deepseek-v3.2-exp": "deepseek-ai/DeepSeek-V3.2-Exp",
        "deepseek/deepseek-chat-v3.1": "deepseek-ai/DeepSeek-V3.1",
        # Qwen models
        "qwen/qwen3-30b-a3b-instruct-2507": "Qwen/Qwen3-30B-A3B-Instruct-2507",
        "qwen/qwen3-next-80b-a3b-instruct": "Qwen/Qwen3-Next-80B-A3B-Instruct",
        "qwen/qwen3-max": "Qwen/Qwen3-Max",
        "qwen/qwen3-coder-flash": "Qwen/Qwen3-Coder-Flash",
        "qwen/qwen3-coder-plus": "Qwen/Qwen3-Coder-Plus",
        "qwen/qwen3-coder": "Qwen/Qwen3-Coder-480B-A35B",
        # Microsoft models
        "microsoft/phi-4": "microsoft/Phi-4",
        "microsoft/phi-4-reasoning-plus": "microsoft/Phi-4-Reasoning-Plus",
        "microsoft/wizardlm-2-8x22b": "microsoft/WizardLM-2-8x22B",
    }

    return hf_model_map.get(base_id) or hf_model_map.get(model_id)


def _get_anthropic_tokenizer():
    """
    Get or create Anthropic tokenizer (cached).
    Anthropic tokenizer doesn't require API key for counting tokens.

    Returns:
        Anthropic client instance or None if import fails
    """
    cache_key = "anthropic"
    with _cache_lock:
        if cache_key not in _tokenizer_cache:
            try:
                from anthropic import Anthropic  # type: ignore[import-untyped]

                # Anthropic tokenizer doesn't need API key for counting tokens
                # Use dummy key - it won't be used for tokenizer operations
                client = Anthropic(api_key="dummy")
                _tokenizer_cache[cache_key] = client
            except ImportError:
                logger.debug("anthropic package not installed, skipping Anthropic tokenizer")
                _tokenizer_cache[cache_key] = None
            except Exception as e:
                logger.warning(f"Failed to initialize Anthropic tokenizer: {e}")
                _tokenizer_cache[cache_key] = None
        return _tokenizer_cache[cache_key]


def _get_huggingface_tokenizer(model_id: str) -> Optional[Any]:
    """
    Get or create Hugging Face tokenizer (cached).
    Only loads tokenizer, not the full model (much faster and lighter).

    Args:
        model_id: OpenRouter model identifier

    Returns:
        Tokenizer instance or None if unavailable
    """
    hf_model_name = _get_huggingface_model_name(model_id)
    if not hf_model_name:
        return None

    with _cache_lock:
        if hf_model_name not in _tokenizer_cache:
            try:
                from transformers import AutoTokenizer  # type: ignore[import-untyped]

                # Load tokenizer only (not the full model - much faster and lighter)
                tokenizer = AutoTokenizer.from_pretrained(
                    hf_model_name,
                    trust_remote_code=True,
                    use_fast=True,  # Use fast tokenizer when available
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


def clean_model_response(text: str) -> str:
    """
    Lightweight cleanup for model responses.
    Heavy cleanup moved to frontend LatexRenderer for better performance.

    NOTE: This function strips leading/trailing whitespace, which is fine for
    complete responses but should NOT be used on streaming chunks (it would
    remove spaces between words at chunk boundaries).
    """
    if not text:
        return text

    # Only do essential cleanup - frontend handles the rest
    # This dramatically improves response speed (200-500ms saved per response)

    # Only remove obviously broken content that ALL models should avoid
    # Remove complete MathML blocks (rarely needed, but fast)
    text = re.sub(r"<math[^>]*>[\s\S]*?</math>", "", text, flags=re.IGNORECASE)

    # Remove w3.org MathML URLs (most common issue from Google Gemini)
    text = re.sub(r"https?://www\.w3\.org/\d+/Math/MathML[^>\s]*>", "", text, flags=re.IGNORECASE)
    text = re.sub(r"www\.w3\.org/\d+/Math/MathML", "", text, flags=re.IGNORECASE)

    # Clean up excessive whitespace
    text = re.sub(r"\n{3,}", "\n\n", text)

    return text.strip()


def get_model_max_tokens(model_id: str) -> int:
    """
    Get the appropriate max_tokens limit for each model based on their capabilities.
    This prevents setting max_tokens higher than the model's maximum output capacity.

    Now uses OpenRouter API data to get actual model limits, with fallback to defaults.
    """
    # Try to get from OpenRouter data
    limits = get_model_token_limits_from_openrouter(model_id)
    if limits:
        max_output = limits.get("max_output", 8192)
    else:
        max_output = 8192

    # Fallback: Model-specific token limits for exceptions (manual overrides)
    # Some models have OpenRouter credit restrictions that require lower max_tokens
    model_limits = {
        # Claude Opus 4.1 and 4 have OpenRouter credit restrictions that require lower max_tokens
        # Cap at 4096 to avoid 402 errors (OpenRouter may reject higher values based on credits)
        "anthropic/claude-opus-4.1": 4096,
        "anthropic/claude-opus-4": 4096,
        # Add any other models with non-standard limits here if OpenRouter data is unavailable
        # Example: "some-provider/model-id": 4096,
    }

    # Apply model-specific override if exists, otherwise use OpenRouter value
    if model_id in model_limits:
        return min(model_limits[model_id], max_output)  # Use the smaller of override or OpenRouter limit
    
    # Return OpenRouter limit or default to 8192
    return max_output


def estimate_token_count(text: str, model_id: Optional[str] = None) -> int:
    """
    Estimate token count using provider-specific tokenizers when available.
    Falls back to tiktoken approximation for unsupported models.

    This function uses official tokenizers for better accuracy:
    - Anthropic: Uses official anthropic SDK tokenizer (95-99% accurate)
    - OpenAI: Uses tiktoken with correct encoding (already accurate)
    - Hugging Face models (Meta, Mistral, DeepSeek, Qwen, Microsoft): Uses transformers library (90-95% accurate)
    - Others: Falls back to tiktoken cl100k_base approximation (~70-80% accurate)

    Args:
        text: Text to tokenize
        model_id: Optional model identifier (e.g., "anthropic/claude-haiku-4.5")
                  If provided, uses provider-specific tokenizer for better accuracy

    Returns:
        Estimated token count
    """
    if not text:
        return 0

    # If model_id provided, try provider-specific tokenizer
    if model_id:
        provider = model_id.split("/")[0] if "/" in model_id else ""

        # Anthropic models - use official tokenizer
        if provider == "anthropic":
            try:
                client = _get_anthropic_tokenizer()
                if client:
                    return client.count_tokens(text)
            except Exception as e:
                logger.debug(f"Anthropic tokenizer failed: {e}, falling back to tiktoken")

        # Hugging Face models (Meta, Mistral, DeepSeek, Qwen, Microsoft)
        elif provider in ["meta-llama", "mistralai", "deepseek", "qwen", "microsoft"]:
            try:
                tokenizer = _get_huggingface_tokenizer(model_id)
                if tokenizer:
                    return len(tokenizer.encode(text, add_special_tokens=False))
            except Exception as e:
                logger.debug(
                    f"HuggingFace tokenizer failed for {model_id}: {e}, falling back to tiktoken"
                )

        # OpenAI models - use correct tiktoken encoding
        elif provider == "openai":
            try:
                # GPT-4o uses o200k_base, others use cl100k_base
                if "gpt-4o" in model_id.lower():
                    encoding = tiktoken.get_encoding("o200k_base")
                else:
                    encoding = tiktoken.get_encoding("cl100k_base")
                return len(encoding.encode(text))
            except Exception as e:
                logger.debug(f"OpenAI tokenizer failed: {e}, falling back to default")

    # Fallback: use tiktoken with cl100k_base (OpenAI GPT-4 standard)
    # This is a reasonable approximation for most models
    try:
        encoding = tiktoken.get_encoding("cl100k_base")
        return len(encoding.encode(text))
    except Exception:
        # Final fallback: rough estimate of 1 token ≈ 4 characters
        return len(text) // 4


class TokenUsage(NamedTuple):
    """Token usage data from OpenRouter API response."""

    prompt_tokens: int  # Input tokens
    completion_tokens: int  # Output tokens
    total_tokens: int  # Total tokens
    effective_tokens: int  # Effective tokens = prompt + (completion × 2.5)
    credits: Decimal  # Credits used = effective_tokens / 1000


def calculate_credits(prompt_tokens: int, completion_tokens: int) -> Decimal:
    """
    Calculate credits from token usage.

    Formula:
    - Effective tokens = prompt_tokens + (completion_tokens × 2.5)
    - Credits = effective_tokens / 1000

    Args:
        prompt_tokens: Number of input tokens
        completion_tokens: Number of output tokens

    Returns:
        Credits used (as Decimal for precision)
    """
    effective_tokens = prompt_tokens + int(completion_tokens * 2.5)
    credits = Decimal(effective_tokens) / Decimal(1000)
    return credits


def calculate_token_usage(prompt_tokens: int, completion_tokens: int) -> TokenUsage:
    """
    Calculate token usage and credits from raw token counts.

    Args:
        prompt_tokens: Number of input tokens
        completion_tokens: Number of output tokens

    Returns:
        TokenUsage named tuple with all calculated values
    """
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
    conversation_history: Optional[List[Any]] = None,
    model_id: Optional[str] = None,
) -> Decimal:
    """
    Estimate credits needed for a request before making the API call.
    Used for pre-validation to check if user has sufficient credits.

    Args:
        prompt: User prompt text
        num_models: Number of models that will be called
        conversation_history: Optional conversation history
        model_id: Optional model identifier for accurate token counting

    Returns:
        Estimated credits needed (as Decimal)
    """
    # Estimate input tokens
    input_tokens = estimate_token_count(prompt, model_id=model_id)

    # Add conversation history tokens if present
    if conversation_history:
        input_tokens += count_conversation_tokens(conversation_history, model_id=model_id)

    # Dynamic estimate: output tokens typically 0.5x to 2x input tokens
    # Use 1.5x as a balanced estimate (more accurate than fixed 2000)
    # Apply bounds: minimum 500, maximum 4000 tokens for safety
    estimated_output_tokens = max(500, min(4000, int(input_tokens * 1.5)))

    # Calculate credits for one model call
    credits_per_model = calculate_credits(input_tokens, estimated_output_tokens)

    # Multiply by number of models
    total_credits = credits_per_model * num_models

    return total_credits


def count_conversation_tokens(messages: List[Any], model_id: Optional[str] = None) -> int:
    """
    Count total tokens in a conversation history.
    Includes tokens for message formatting overhead.

    Args:
        messages: List of conversation messages
        model_id: Optional model identifier for accurate token counting
    """
    total_tokens = 0

    for msg in messages:
        # Count content tokens
        if isinstance(msg, dict):
            content = msg.get("content", "")
        else:
            content = msg.content if hasattr(msg, "content") else ""

        total_tokens += estimate_token_count(str(content), model_id=model_id)

        # Add overhead for message formatting (~4 tokens per message)
        total_tokens += 4

    return total_tokens


def call_openrouter_streaming(
    prompt: str,
    model_id: str,
    conversation_history: Optional[List[Any]] = None,
    use_mock: bool = False,
    max_tokens_override: Optional[int] = None,
    credits_limited: bool = False,
) -> Generator[Any, None, Optional[TokenUsage]]:
    """
    Stream OpenRouter responses token-by-token for faster perceived response time.
    Yields chunks of text as they arrive from the model.
    Returns usage data after streaming completes.

    Supports all OpenRouter providers that have streaming enabled:
    - OpenAI, Azure, Anthropic, Fireworks, Mancer, Recursal
    - AnyScale, Lepton, OctoAI, Novita, DeepInfra, Together
    - Cohere, Hyperbolic, Infermatic, Avian, XAI, Cloudflare
    - SFCompute, Nineteen, Liquid, Friendli, Chutes, DeepSeek

    Args:
        prompt: User prompt text
        model_id: Model identifier
        conversation_history: Optional conversation history
        use_mock: If True, return mock responses instead of calling API (admin testing feature)
        max_tokens_override: Optional override for max output tokens (uses model limit if not provided)
        credits_limited: If True, indicates max_tokens_override was reduced due to low credits

    Yields:
        str: Content chunks as they arrive

    Returns:
        Optional[TokenUsage]: Token usage data, or None if unavailable or in mock mode
    """
    # Mock mode: return pre-defined responses for testing
    if use_mock:
        print(f"🎭 Mock mode enabled - returning mock response for {model_id}")
        for chunk in stream_mock_response(chunk_size=50):
            yield chunk
        return None

    # Build messages array - use standard format like official AI providers
    messages = []

    # Add a minimal system message only to encourage complete thoughts
    if not conversation_history:
        messages.append(
            {
                "role": "system",
                "content": "Provide complete responses. Finish your thoughts and explanations fully.",
            }
        )

    # Add conversation history if provided
    if conversation_history:
        for msg in conversation_history:
            messages.append({"role": msg.role, "content": msg.content})

    # Add the current prompt as user message
    messages.append({"role": "user", "content": prompt})

    # Use override if provided (for multi-model comparisons to avoid truncation)
    # Otherwise, use model's maximum capability
    if max_tokens_override is not None:
        max_tokens = max_tokens_override
    else:
        # Use model's maximum capability
        max_tokens = get_model_max_tokens(model_id)

    # Track retry count for max_tokens reduction on 402 errors
    retry_count = 0
    max_retries = 1  # Only retry once with reduced max_tokens

    while retry_count <= max_retries:
            try:
                # Enable streaming
                response = client.chat.completions.create(
                    model=model_id,
                    messages=messages,
                    timeout=settings.individual_model_timeout,
                    max_tokens=max_tokens,
                    stream=True,  # Enable streaming!
                )

                full_content = ""
                finish_reason = None
                usage_data = None

                # Iterate through chunks as they arrive
                for chunk in response:
                    if chunk.choices and len(chunk.choices) > 0:
                        delta = chunk.choices[0].delta

                        # Yield content chunks as they arrive
                        if hasattr(delta, "content") and delta.content:
                            content_chunk = delta.content
                            full_content += content_chunk
                            yield content_chunk

                        # Capture finish reason from last chunk
                        if chunk.choices[0].finish_reason:
                            finish_reason = chunk.choices[0].finish_reason

                    # Extract usage data from chunk if available
                    # OpenRouter/OpenAI streaming responses include usage in the final chunk
                    if hasattr(chunk, "usage") and chunk.usage:
                        usage = chunk.usage
                        prompt_tokens = getattr(usage, "prompt_tokens", 0)
                        completion_tokens = getattr(usage, "completion_tokens", 0)
                        if prompt_tokens > 0 or completion_tokens > 0:
                            usage_data = calculate_token_usage(prompt_tokens, completion_tokens)

                # After streaming completes, handle finish_reason warnings
                if finish_reason == "length":
                    if credits_limited:
                        yield "\n\n⚠️ Response stopped - credits exhausted."
                    else:
                        yield "\n\n⚠️ Response truncated - model reached maximum output length."
                elif finish_reason == "content_filter":
                    yield "\n\n⚠️ **Note:** Response stopped by content filter."

                # Return usage data (generator return value)
                return usage_data

            except Exception as e:
                error_str = str(e).lower()
                error_message = str(e)
                
                # Check for 402 error related to max_tokens (OpenRouter credit/token limit issue)
                is_402_max_tokens_error = (
                    "402" in error_message or 
                    "payment required" in error_str or
                    ("requires more credits" in error_str and "max_tokens" in error_str)
                )
                
                # If it's a 402 max_tokens error and we haven't retried yet, reduce max_tokens and retry
                if is_402_max_tokens_error and retry_count < max_retries:
                    # Reduce max_tokens by 50% or cap at 2048, whichever is higher
                    reduced_max_tokens = max(2048, int(max_tokens * 0.5))
                    if reduced_max_tokens < max_tokens:
                        print(
                            f"[API] 402 max_tokens error for {model_id} - retrying with reduced max_tokens: "
                            f"{max_tokens} -> {reduced_max_tokens}"
                        )
                        max_tokens = reduced_max_tokens
                        retry_count += 1
                        continue  # Retry with reduced max_tokens
                
                # If not a retryable 402 error, or retries exhausted, yield error
                if "timeout" in error_str:
                    yield f"Error: Timeout ({settings.individual_model_timeout}s)"
                elif "rate limit" in error_str or "429" in error_str:
                    yield f"Error: Rate limited"
                elif "not found" in error_str or "404" in error_str:
                    yield f"Error: Model not available"
                elif "unauthorized" in error_str or "401" in error_str:
                    yield f"Error: Authentication failed"
                elif is_402_max_tokens_error:
                    yield f"Error: This request requires more credits or fewer max_tokens. Please try with a shorter prompt or reduce the number of models."
                else:
                    yield f"Error: {str(e)[:100]}"
                # Return None for usage data on error
                return None


def call_openrouter(
    prompt: str,
    model_id: str,
    mode: str = "standard",
    conversation_history: Optional[List[Any]] = None,
    use_mock: bool = False,
) -> str:
    """
    Non-streaming wrapper for call_openrouter_streaming.
    Collects all chunks and returns the complete response as a string.

    This function is used by scripts that need synchronous, non-streaming responses.
    For production use, prefer call_openrouter_streaming for better performance.

    Args:
        prompt: User prompt text
        model_id: Model identifier
        mode: Mode string (unused, kept for backward compatibility)
        conversation_history: Optional conversation history
        use_mock: If True, return mock responses instead of calling API

    Returns:
        str: Complete response text

    Raises:
        Exception: If the API call fails or returns an error
    """
    try:
        # Collect all chunks from the streaming function
        chunks = []
        generator = call_openrouter_streaming(
            prompt=prompt,
            model_id=model_id,
            conversation_history=conversation_history,
            use_mock=use_mock,
        )

        # Collect all chunks
        for chunk in generator:
            chunks.append(chunk)

        # Join all chunks into a single response
        response = "".join(chunks)

        # Check if response contains an error message
        if response.startswith("Error:"):
            raise Exception(response)

        # Clean the response
        response = clean_model_response(response)

        return response
    except Exception as e:
        # Re-raise exceptions from the streaming function
        error_str = str(e).lower()
        if "timeout" in error_str:
            raise Exception(f"Timeout calling model {model_id}")
        elif "rate limit" in error_str or "429" in error_str:
            raise Exception(f"Rate limited when calling model {model_id}")
        elif "not found" in error_str or "404" in error_str:
            raise Exception(f"Model {model_id} not available")
        elif "unauthorized" in error_str or "401" in error_str:
            raise Exception(f"Authentication failed for model {model_id}")
        else:
            raise


def test_connection_quality() -> ConnectionQualityDict:
    """Test connection quality by making a quick API call"""
    test_model = "anthropic/claude-3-haiku"  # Fast, reliable model for testing
    test_prompt = "Hello"
    start_time = time.time()

    try:
        response = client.chat.completions.create(
            model=test_model,
            messages=[{"role": "user", "content": test_prompt}],
            timeout=10,  # Short timeout for connection test
            max_tokens=100,  # Small limit for connection test
        )

        response_time = time.time() - start_time

        # Categorize connection quality
        if response_time < 2:
            quality = "excellent"
            multiplier = 1.0
        elif response_time < 4:
            quality = "good"
            multiplier = 1.2
        elif response_time < 7:
            quality = "average"
            multiplier = 1.5
        else:
            quality = "slow"
            multiplier = 2.0

        return {
            "response_time": response_time,
            "quality": quality,
            "time_multiplier": multiplier,
            "success": True,
        }

    except Exception as e:
        return {
            "response_time": 0,
            "quality": "poor",
            "time_multiplier": 3.0,
            "success": False,
            "error": str(e),
        }
