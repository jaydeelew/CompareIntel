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

from openai import OpenAI, APIError  # type: ignore[import-untyped]
import concurrent.futures
from typing import Dict, List, Any, Optional, Generator, NamedTuple
import time
import re
import tiktoken  # type: ignore[import-untyped]
from decimal import Decimal
import httpx  # type: ignore[import-untyped]
import logging
import threading
from datetime import datetime
from bs4 import BeautifulSoup  # type: ignore[import-untyped]
from .mock_responses import stream_mock_response, get_mock_response
from .types import ConnectionQualityDict
from .cache import cache
from .search.rate_limiter import get_rate_limiter

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
    "meta-llama/llama-3.1-405b-instruct:free",  # Auto-classified based on pricing,    "meta-llama/llama-3.3-70b-instruct",  # Auto-classified based on pricing,
    "xiaomi/mimo-v2-flash:free",  # Auto-classified based on pricing,
    "mistralai/devstral-2512:free",  # Auto-classified based on pricing,
    "kwaipilot/kat-coder-pro:free",  # Auto-classified based on pricing,
    "openai/gpt-4o-mini",  # Auto-classified based on pricing
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
            "description": 'A fast, efficient model optimized for speed, coding accuracy, and tool use at low cost.',
            "category": "Language",
            "provider": "Anthropic",
            "supports_web_search": True,  # Supports tool use
        },
        {
            "id": "anthropic/claude-haiku-4.5",
            "name": "Claude Haiku 4.5",
            "description": "Anthropic's fastest model delivering near-frontier intelligence with minimal latency and cost.",
            "category": "Language",
            "provider": "Anthropic",
            "supports_web_search": True,  # All Claude models support function calling
        },
        {
            "id": "anthropic/claude-3.7-sonnet",
            "name": "Claude Sonnet 3.7",
            "description": 'An advanced model with hybrid extended thinking capabilities for complex reasoning and coding tasks.',
            "category": "Language/Reasoning",
            "provider": "Anthropic",
            "supports_web_search": True,
        },
        {
            "id": "anthropic/claude-opus-4",
            "name": "Claude Opus 4",
            "description": 'A frontier coding model with sustained performance on complex, long-running agentic tasks.',
            "category": "Language",
            "provider": "Anthropic",
            "supports_web_search": True,
        },
        {
            "id": "anthropic/claude-sonnet-4",
            "name": "Claude Sonnet 4",
            "description": 'A high-performance model excelling in coding, reasoning, and instruction-following with improved precision.',
            "category": "Language",
            "provider": "Anthropic",
            "supports_web_search": True,  # All Claude models support function calling
        },
        {
            "id": "anthropic/claude-opus-4.1",
            "name": "Claude Opus 4.1",
            "description": 'An updated flagship model with enhanced coding, reasoning, and multi-step agentic capabilities.',
            "category": "Language/Code",
            "provider": "Anthropic",
            "supports_web_search": True,  # All Claude models support function calling
        },
        {
            "id": "anthropic/claude-opus-4.5",
            "name": "Claude Opus 4.5",
            "description": "Anthropic's most capable model for complex software engineering and long-horizon computer use tasks.",
            "category": "Language",
            "provider": "Anthropic",
            "supports_web_search": True,  # All Claude models support function calling
        },
        {
            "id": "anthropic/claude-sonnet-4.5",
            "name": "Claude Sonnet 4.5",
            "description": "Anthropic's most advanced Sonnet optimized for real-world agentic workflows and coding tasks.",
            "category": "Language",
            "provider": "Anthropic",
            "supports_web_search": True,  # All Claude models support function calling
        },
    ],
    "Cohere": [
        {
            "id": "cohere/command-r7b-12-2024",
            "name": "Command R7B",
            "description": 'A compact 7B model optimized for fast, efficient responses in conversational and RAG applications.',
            "category": "Language",
            "provider": "Cohere",
            "supports_web_search": False,
        },
        {
            "id": "cohere/command-r-plus-08-2024",
            "name": "Command R+",
            "description": 'An enterprise-grade model with 50% higher throughput for complex reasoning and generation tasks.',
            "category": "Language/Reasoning",
            "provider": "Cohere",
            "supports_web_search": True,  # Supports function calling
        },
        {
            "id": "cohere/command-a",
            "name": "Command A",
            "description": 'An open-weights 111B model with 256k context excelling in agentic, multilingual, and coding tasks.',
            "category": "Language",
            "provider": "Cohere",
            "supports_web_search": False,  # Does not support function calling
        },
    ],
    "DeepSeek": [
        {
            "id": "deepseek/deepseek-chat-v3.1",
            "name": "DeepSeek Chat V3.1",
            "description": 'A 671B hybrid MoE model (37B active) supporting both thinking and non-thinking modes for versatile reasoning.',
            "category": "Language/Reasoning",
            "provider": "DeepSeek",
            "supports_web_search": True,  # Supports function calling
        },
        {
            "id": "deepseek/deepseek-v3.2-exp",
            "name": "DeepSeek V3.2 Exp",
            "description": 'An experimental model with enhanced reasoning and coding capabilities bridging V3.1 and future architectures.',
            "category": "Language/Reasoning",
            "provider": "DeepSeek",
            "supports_web_search": True,  # Supports function calling
        },
        {
            "id": "deepseek/deepseek-r1",
            "name": "DeepSeek R1",
            "description": 'An open-source reasoning model matching OpenAI o1 performance with fully transparent chain-of-thought.',
            "category": "Reasoning",
            "provider": "DeepSeek",
            "supports_web_search": True,  # Supports function calling
        },
    ],
    "Google": [
        {
            "id": "google/gemini-2.0-flash-001",
            "name": "Gemini 2.0 Flash",
            "description": 'A high-speed model with significantly faster time-to-first-token while maintaining Pro-level quality.',
            "category": "Language",
            "provider": "Google",
            "supports_web_search": True,  # All Gemini models support function calling
        },
        {
            "id": "google/gemini-2.5-flash",
            "name": "Gemini 2.5 Flash",
            "description": "Google's fast, cost-efficient model with built-in thinking capabilities for reasoning, coding, and math tasks.",
            "category": "Language",
            "provider": "Google",
            "supports_web_search": True,  # All Gemini models support function calling
        },
        {
            "id": "google/gemini-2.5-pro",
            "name": "Gemini 2.5 Pro",
            "description": "Google's most capable model excelling in complex reasoning, coding, mathematics, and scientific analysis.",
            "category": "Language",
            "provider": "Google",
            "supports_web_search": True,
        },
        {
            "id": "google/gemini-3-flash-preview",
            "name": "Gemini 3 Flash Preview",
            "description": 'Gemini 3 Flash Preview is a high speed, high value thinking model designed for agentic workflows, multi turn chat, and coding assistance.',
            "category": "Language",
            "provider": "Google",
            "supports_web_search": True,  # All Gemini models support function calling
        },
        {
            "id": "google/gemini-3-pro-preview",
            "name": "Gemini 3 Pro Preview",
            "description": "Google's flagship multimodal model with 1M-token context for text, image, video, audio, and code tasks.",
            "category": "Language",
            "provider": "Google",
            "supports_web_search": True,  # All Gemini models support function calling
        },
    ],
    "Kwaipilot": [
        {
            "id": "kwaipilot/kat-coder-pro:free",
            "name": "Kat Coder Pro:Free",
            "description": "KAT-Coder-Pro V1 is KwaiKAT's most advanced agentic coding model in the KAT-Coder series.",
            "category": "Language",
            "provider": "Kwaipilot",
            "supports_web_search": True,  # Agentic coding model - supports function calling
        },
    ],
    "Meta": [
        {
            "id": "meta-llama/llama-3.1-405b-instruct:free",
            "name": "Llama 3.1 405B Instruct:Free",
            "description": "Meta's largest open-source model (405B) with strong multilingual, coding, and reasoning capabilities.",
            "category": "Language",
            "provider": "Meta",
            "supports_web_search": False,
        },
        {
            "id": "meta-llama/llama-4-maverick",
            "name": "Llama 4 Maverick",
            "description": 'A high-capacity 400B MoE model (17B active, 128 experts) for complex multimodal reasoning and generation.',
            "category": "Multimodal",
            "provider": "Meta",
            "supports_web_search": True,  # Supports function calling
        },
        {
            "id": "meta-llama/llama-4-scout",
            "name": "Llama 4 Scout",
            "description": 'A 109B MoE model (17B active) optimized for efficient multimodal understanding and generation tasks.',
            "category": "Multimodal",
            "provider": "Meta",
            "supports_web_search": True,  # Supports function calling
        },
        {
            "id": "meta-llama/llama-3.1-405b-instruct",
            "name": "Llama 3.1 405B Instruct",
            "description": "Meta's flagship 405B open-source model excelling in multilingual understanding, coding, and instruction-following.",
            "category": "Language",
            "provider": "Meta",
            "supports_web_search": True,  # Supports function calling
        },
        {
            "id": "meta-llama/llama-3.3-70b-instruct",
            "name": "Llama 3.3 70B Instruct",
            "description": 'The Meta Llama 3.3 multilingual large language model (LLM) is a pretrained and instruction tuned generative model in 70B.',
            "category": "Language",
            "provider": "Meta",
            "supports_web_search": True,  # Supports function calling
        },
    ],
    "Microsoft": [
        {
            "id": "microsoft/phi-4",
            "name": "Phi 4",
            "description": 'A compact 14B model excelling in complex reasoning while operating efficiently with limited resources.',
            "category": "Language/Reasoning",
            "provider": "Microsoft",
            "supports_web_search": False,
        },
        {
            "id": "microsoft/wizardlm-2-8x22b",
            "name": "WizardLM-2 8x22B",
            "description": "Microsoft's advanced MoE model with strong performance across reasoning, coding, and creative tasks.",
            "category": "Language/Reasoning",
            "provider": "Microsoft",
            "supports_web_search": False,
        },
        {
            "id": "microsoft/phi-4-reasoning-plus",
            "name": "Phi 4 Reasoning Plus",
            "description": 'An enhanced 14B model with reinforcement learning fine-tuning for improved math, science, and code reasoning.',
            "category": "Reasoning",
            "provider": "Microsoft",
            "supports_web_search": False,
        },
    ],
    "Minimax": [
        {
            "id": "minimax/minimax-m2",
            "name": "Minimax M2",
            "description": 'A compact, high-efficiency model optimized for end-to-end coding and agentic workflow automation.',
            "category": "Language",
            "provider": "Minimax",
            "supports_web_search": True,  # Supports function calling
        },
    ],
    "Mistral": [
        {
            "id": "mistralai/devstral-medium",
            "name": "Devstral Medium",
            "description": 'A high-performance model for code generation and agentic reasoning in complex development workflows.',
            "category": "Code",
            "provider": "Mistral",
            "supports_web_search": True,  # Agentic model - supports function calling
        },
        {
            "id": "mistralai/devstral-small",
            "name": "Devstral Small",
            "description": 'A 24B open-weight model specialized for software engineering agents and autonomous coding tasks.',
            "category": "Code",
            "provider": "Mistral",
            "supports_web_search": True,  # Agentic model - supports function calling
        },
        {
            "id": "mistralai/mistral-medium-3.1",
            "name": "Mistral Medium 3.1",
            "description": 'An enterprise-grade model delivering frontier-level capabilities at significantly reduced operational cost.',
            "category": "Language",
            "provider": "Mistral",
            "supports_web_search": True,  # Mistral Medium supports function calling
        },
        {
            "id": "mistralai/mistral-small-3.2-24b-instruct",
            "name": "Mistral Small 3.2 24B",
            "description": 'A 24B multimodal model optimized for instruction-following, function calling, and vision tasks.',
            "category": "Multimodal",
            "provider": "Mistral",
            "supports_web_search": True,
        },
        {
            "id": "mistralai/mistral-large",
            "name": "Mistral Large",
            "description": "Mistral's flagship model with strong multilingual, coding, reasoning, and function-calling capabilities.",
            "category": "Language/Reasoning",
            "provider": "Mistral",
            "supports_web_search": True,
        },
        {
            "id": "mistralai/codestral-2508",
            "name": "Codestral 2508",
            "description": "Mistral's specialized coding model with state-of-the-art performance on code generation and completion.",
            "category": "Code",
            "provider": "Mistral",
            "supports_web_search": True,  # Supports function calling
        },
    ],
    "Mistralai": [
        {
            "id": "mistralai/devstral-2512:free",
            "name": "Devstral 2512:Free",
            "description": 'Devstral 2 is a state-of-the-art open-source model by Mistral AI specializing in agentic coding.',
            "category": "Language",
            "provider": "Mistralai",
            "supports_web_search": True,  # Agentic coding model - supports function calling
        },
    ],
    "OpenAI": [
        {
            "id": "openai/gpt-oss-120b",
            "name": "Gpt Oss 120B",
            "description": 'An open-weight 117B MoE model designed for high-reasoning, agentic, and general-purpose production tasks.',
            "category": "Language",
            "provider": "OpenAI",
            "supports_web_search": True,  # Supports function calling
        },
        {
            "id": "openai/o3-mini",
            "name": "o3 Mini",
            "description": 'A cost-efficient reasoning model optimized for STEM tasks, excelling in science, mathematics, and coding.',
            "category": "Reasoning",
            "provider": "OpenAI",
            "supports_web_search": True,  # Supports function calling
        },
        {
            "id": "openai/gpt-4o-mini",
            "name": "Gpt 4o Mini",
            "description": "GPT-4o mini is OpenAI's newest model after [GPT-4 Omni](/models/openai/gpt-4o), supporting both text and image inputs with text outputs.",
            "category": "Language",
            "provider": "OpenAI",
            "supports_web_search": True,  # All GPT-4o+ models support function calling
        },
        {
            "id": "openai/gpt-5-mini",
            "name": "GPT-5 Mini",
            "description": 'A compact GPT-5 variant designed for efficient, lighter-weight reasoning and general tasks.',
            "category": "Language",
            "provider": "OpenAI",
            "supports_web_search": True,  # All GPT-5 models support function calling
        },
        {
            "id": "openai/gpt-5-nano",
            "name": "GPT-5 Nano",
            "description": 'The smallest GPT-5 variant optimized for ultra-low latency developer tools and rapid interactions.',
            "category": "Language",
            "provider": "OpenAI",
            "supports_web_search": True,  # All GPT-5 models support function calling
        },
        {
            "id": "openai/gpt-5.1-codex-mini",
            "name": "GPT-5.1-Codex-Mini",
            "description": 'A compact, fast coding model for efficient code generation and software development tasks.',
            "category": "Code",
            "provider": "OpenAI",
            "supports_web_search": True,  # All GPT-5 models support function calling
        },
        {
            "id": "openai/o3",
            "name": "o3",
            "description": "OpenAI's advanced reasoning model with state-of-the-art performance across math, science, and coding benchmarks.",
            "category": "Reasoning",
            "provider": "OpenAI",
            "supports_web_search": True,  # Supports function calling
        },
        {
            "id": "openai/gpt-4o",
            "name": "GPT-4o",
            "description": 'An omnimodal model supporting text and image inputs with fast, intelligent multimodal responses.',
            "category": "Language",
            "provider": "OpenAI",
            "supports_web_search": True,
        },
        {
            "id": "openai/gpt-5",
            "name": "GPT-5",
            "description": "OpenAI's most advanced model with major improvements in reasoning, code quality, and user experience.",
            "category": "Language",
            "provider": "OpenAI",
            "supports_web_search": True,
        },
        {
            "id": "openai/gpt-5-chat",
            "name": "GPT-5 Chat",
            "description": 'A GPT-5 variant optimized for natural, multimodal, and context-aware enterprise conversations.',
            "category": "Language",
            "provider": "OpenAI",
            "supports_web_search": False,  # OpenRouter API confirms this model does NOT support function/tool calling
        },
        {
            "id": "openai/gpt-5-codex",
            "name": "GPT-5 Codex",
            "description": 'A specialized GPT-5 variant optimized for software engineering, code generation, and development workflows.',
            "category": "Code",
            "provider": "OpenAI",
            "supports_web_search": True,  # All GPT-5 models support function calling
        },
        {
            "id": "openai/gpt-5.1",
            "name": "GPT-5.1",
            "description": 'The latest frontier model with stronger reasoning, improved instruction adherence, and natural conversation.',
            "category": "Language",
            "provider": "OpenAI",
            "supports_web_search": True,  # All GPT-5 models support function calling
        },
        {
            "id": "openai/gpt-5.1-chat",
            "name": "GPT-5.1 Chat",
            "description": 'A fast, lightweight model optimized for low-latency chat while retaining strong general intelligence.',
            "category": "Language",
            "provider": "OpenAI",
            "supports_web_search": True,  # All GPT-5 models support function calling
        },
        {
            "id": "openai/gpt-5.1-codex",
            "name": "GPT-5.1-Codex",
            "description": 'The most capable GPT-5.1 variant specialized for advanced software engineering and coding workflows.',
            "category": "Code",
            "provider": "OpenAI",
            "supports_web_search": True,  # All GPT-5 models support function calling
        },
        {
            "id": "openai/gpt-5.1-codex-max",
            "name": "Gpt 5.1 Codex Max",
            "description": "GPT-5.1-Codex-Max is OpenAI's latest agentic coding model, designed for long-running, high-context software development tasks.",
            "category": "Language",
            "provider": "OpenAI",
            "supports_web_search": True,  # All GPT-5 models support function calling
        },
        {
            "id": "openai/gpt-5.2",
            "name": "Gpt 5.2",
            "description": 'GPT-5.2 is the latest frontier-grade model in the GPT-5 series, offering stronger agentic and long context perfomance compared to GPT-5.1.',
            "category": "Language",
            "provider": "OpenAI",
            "supports_web_search": True,  # All GPT-5 models support function calling
        },
        {
            "id": "openai/gpt-5.2-chat",
            "name": "Gpt 5.2 Chat",
            "description": 'GPT-5.2 Chat (AKA Instant) is the fast, lightweight member of the 5.2 family, optimized for low-latency chat while retaining strong general intelligence.',
            "category": "Language",
            "provider": "OpenAI",
            "supports_web_search": True,  # All GPT-5 models support function calling
        },
        {
            "id": "openai/gpt-5.2-pro",
            "name": "Gpt 5.2 Pro",
            "description": "GPT-5.2 Pro is OpenAI's most advanced model, offering major improvements in agentic coding and long context performance over GPT-5 Pro.",
            "category": "Language",
            "provider": "OpenAI",
            "supports_web_search": True,  # All GPT-5 models support function calling
        },
    ],
    "Qwen": [
        {
            "id": "qwen/qwen3-30b-a3b-instruct-2507",
            "name": "Qwen3 30B A3B Instruct 2507",
            "description": 'A 30.5B MoE model with 3.3B active parameters for efficient instruction-following and chat.',
            "category": "Language",
            "provider": "Qwen",
            "supports_web_search": True,  # Supports function calling
        },
        {
            "id": "qwen/qwen3-coder-flash",
            "name": "Qwen3 Coder Flash",
            "description": 'A fast, cost-efficient coding model optimized for rapid code generation and completion tasks.',
            "category": "Code",
            "provider": "Qwen",
            "supports_web_search": True,  # Supports function calling
        },
        {
            "id": "qwen/qwen3-next-80b-a3b-instruct",
            "name": "Qwen3 Next 80B A3B Instruct",
            "description": 'An 80B MoE instruction-tuned model optimized for fast, stable responses without thinking traces.',
            "category": "Language",
            "provider": "Qwen",
            "supports_web_search": True,  # Supports function calling
        },
        {
            "id": "qwen/qwen3-235b-a22b",
            "name": "Qwen3 235B A22B",
            "description": 'A 235B MoE model (22B active) with strong reasoning, coding, and multilingual capabilities.',
            "category": "Language",
            "provider": "Qwen",
            "supports_web_search": True,  # Supports function calling
        },
        {
            "id": "qwen/qwen3-coder",
            "name": "Qwen3 Coder 480B A35B",
            "description": 'A 480B MoE model (35B active) achieving state-of-the-art code generation and agentic coding performance.',
            "category": "Code",
            "provider": "Qwen",
            "supports_web_search": True,  # Agentic coding model - supports function calling
        },
        {
            "id": "qwen/qwen3-coder-plus",
            "name": "Qwen3 Coder Plus",
            "description": "Alibaba's proprietary coding model with enhanced performance for complex development tasks.",
            "category": "Code",
            "provider": "Qwen",
            "supports_web_search": True,  # Supports function calling
        },
        {
            "id": "qwen/qwen3-max",
            "name": "Qwen3 Max",
            "description": "Qwen's most capable model with strong reasoning, instruction-following, and multilingual abilities.",
            "category": "Language",
            "provider": "Qwen",
            "supports_web_search": True,  # Supports function calling
        },
        {
            "id": "qwen/qwen3-next-80b-a3b-thinking",
            "name": "Qwen3 Next 80B A3B Thinking",
            "description": 'A reasoning-first model with structured chain-of-thought traces for complex problem-solving.',
            "category": "Language/Reasoning",
            "provider": "Qwen",
            "supports_web_search": True,  # Supports function calling
        },
        {
            "id": "qwen/qwen3-vl-235b-a22b-thinking",
            "name": "Qwen3 VL 235B A22B Thinking",
            "description": 'A multimodal reasoning model unifying text generation with visual understanding across images and video.',
            "category": "Multimodal/Reasoning",
            "provider": "Qwen",
            "supports_web_search": True,  # Supports function calling
        },
    ],
    "xAI": [
        {
            "id": "x-ai/grok-code-fast-1",
            "name": "Grok Code Fast 1",
            "description": 'A speedy, economical reasoning model optimized for agentic coding and development tasks.',
            "category": "Language",
            "provider": "xAI",
            "supports_web_search": True,  # Agentic coding model - supports function calling
        },
        {
            "id": "x-ai/grok-4-fast",
            "name": "Grok 4 Fast",
            "description": 'A cost-efficient multimodal model with 2M token context for fast, large-scale processing.',
            "category": "Language",
            "provider": "xAI",
            "supports_web_search": True,  # Supports function calling
        },
        {
            "id": "x-ai/grok-3-mini",
            "name": "Grok 3 Mini",
            "description": 'A lightweight reasoning model with chain-of-thought capabilities for efficient problem-solving.',
            "category": "Language",
            "provider": "xAI",
            "supports_web_search": True,  # Supports function calling
        },
        {
            "id": "x-ai/grok-4",
            "name": "Grok 4",
            "description": "xAI's flagship reasoning model with 256k context for complex analysis and generation tasks.",
            "category": "Language",
            "provider": "xAI",
            "supports_web_search": True,  # Supports function calling
        },
        {
            "id": "x-ai/grok-5",
            "name": "Grok 5 (Coming Soon)",
            "description": "xAI's upcoming next-generation model expected by end of 2025 (not yet available).",
            "category": "Language",
            "provider": "xAI",
            "available": False,
            "supports_web_search": False,
        },
    ],
    "Xiaomi": [
        {
            "id": "xiaomi/mimo-v2-flash:free",
            "name": "Mimo V2 Flash:Free",
            "description": 'MiMo-V2-Flash is an open-source foundation language model developed by Xiaomi.',
            "category": "Language",
            "provider": "Xiaomi",
            "supports_web_search": True,  # Supports function calling
        },
    ]
}


# Flatten the models for backward compatibility
OPENROUTER_MODELS = []
for provider, models in MODELS_BY_PROVIDER.items():
    OPENROUTER_MODELS.extend(models)

client = OpenAI(api_key=OPENROUTER_API_KEY, base_url="https://openrouter.ai/api/v1")

# Client with headers for tool calling (required by OpenRouter for provider routing)
# OpenRouter requires HTTP-Referer and X-Title headers when using tools
client_with_tool_headers = OpenAI(
    api_key=OPENROUTER_API_KEY,
    base_url="https://openrouter.ai/api/v1",
    default_headers={
        "HTTP-Referer": "https://compareintel.com",
        "X-Title": "CompareIntel",
    }
)

# Web search tool definition (for future tool calling integration)
WEB_SEARCH_TOOL = {
    "type": "function",
    "function": {
        "name": "search_web",
        "description": "Search the internet for current, real-time information. You MUST use this tool for any question requiring up-to-date information such as current weather, recent news, current events, live data, stock prices, sports scores, or any information that changes over time. Do not provide current information without using this tool first. Do not fabricate or guess current information. IMPORTANT: The search results will include snippets (short summaries) from search engines. These snippets are often outdated, incomplete, or inaccurate, especially for time-sensitive information like weather, stock prices, or current events. You should treat snippets as preliminary summaries only. When accuracy is critical, prioritize results from authoritative sources and be cautious about relying solely on snippet text. If a snippet seems inconsistent or outdated, indicate uncertainty in your response.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query to find current information on the internet"
                }
            },
            "required": ["query"]
        }
    }
}

# URL fetching tool definition - allows models to fetch actual webpage content
FETCH_URL_TOOL = {
    "type": "function",
    "function": {
        "name": "fetch_url",
        "description": "Fetch and extract the actual content from a webpage URL. Use this tool when you need accurate, up-to-date information from a specific webpage, especially after receiving search results. This tool retrieves the full text content from the webpage, which is more reliable than search result snippets. You should use this tool when: (1) Search snippets seem outdated or incomplete, (2) You need detailed information from a specific source, (3) The information is time-sensitive (weather, news, stocks, etc.), (4) Multiple search results conflict and you need to verify the actual content. The tool will extract the main text content from the webpage, excluding navigation, ads, and other non-content elements.",
        "parameters": {
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "The full URL of the webpage to fetch content from (must start with http:// or https://)"
                }
            },
            "required": ["url"]
        }
    }
}

async def fetch_url_content(url: str, max_length: int = 10000) -> str:
    """
    Fetch and extract text content from a webpage URL.
    
    Args:
        url: The URL to fetch content from
        max_length: Maximum length of extracted content (characters)
        
    Returns:
        Extracted text content from the webpage
        
    Raises:
        Exception: If fetching or parsing fails
    """
    try:
        # Validate URL format
        if not url.startswith(("http://", "https://")):
            raise ValueError(f"Invalid URL format: {url}. URL must start with http:// or https://")
        
        # Fetch webpage with timeout and user agent
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
            }
            response = await client.get(url, headers=headers)
            response.raise_for_status()
            
            # Parse HTML content
            soup = BeautifulSoup(response.text, "html.parser")
            
            # Remove script and style elements
            for script in soup(["script", "style", "nav", "header", "footer", "aside"]):
                script.decompose()
            
            # Extract text content
            text = soup.get_text(separator=" ", strip=True)
            
            # Clean up whitespace
            text = re.sub(r"\s+", " ", text)
            
            # Truncate if too long
            if len(text) > max_length:
                text = text[:max_length] + "... [content truncated]"
            
            return text.strip()
            
    except httpx.HTTPStatusError as e:
        raise Exception(f"HTTP error {e.response.status_code} when fetching URL: {str(e)}")
    except httpx.RequestError as e:
        raise Exception(f"Network error when fetching URL: {str(e)}")
    except Exception as e:
        raise Exception(f"Error fetching URL content: {str(e)}")


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
    enable_web_search: bool = False,
    search_provider: Optional[Any] = None,  # SearchProvider instance
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
        enable_web_search: If True, enable web search tool calling for models that support it
        search_provider: Optional SearchProvider instance for executing web searches

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
        system_content = "Provide complete responses. Finish your thoughts and explanations fully."
        system_content += "\n\nAnswer questions directly without asking clarifying questions. If you need to make reasonable assumptions about context or details not specified, make those assumptions based on common practices and state them clearly in your response. Only ask follow-up questions if the request is fundamentally unclear or missing critical information that prevents any meaningful response."
        
        # If web search is enabled, include current date/time context so models know what "today" means
        if enable_web_search:
            current_datetime = datetime.now()
            current_date_str = current_datetime.strftime("%A, %B %d, %Y")
            current_time_str = current_datetime.strftime("%I:%M %p %Z")
            system_content += f"\n\nCurrent date and time: {current_date_str} at {current_time_str}. When referring to 'today' or 'now', use this date and time."
            system_content += "\n\nYou have access to two web tools:\n1. search_web - Search the internet for current information\n2. fetch_url - Fetch actual content from a specific webpage URL\n\nCRITICAL: For any question requiring real-time, current, or up-to-date information (such as current weather, recent news, current events, live data, stock prices, sports scores, or any information that changes over time), you MUST use the search_web tool first. You are NOT allowed to provide information about current events, weather, news, or any time-sensitive data without first using the search_web tool. Do not fabricate, guess, or cite sources you have not actually checked through the search tool. If you have not used the search_web tool, you cannot provide current information - you must use the tool first.\n\nIMPORTANT WARNING ABOUT SEARCH RESULT SNIPPETS: The search results you receive will include snippets (short text summaries) from search engines. These snippets are often OUTDATED, INCOMPLETE, or INACCURATE, especially for time-sensitive information like weather forecasts, stock prices, sports scores, or breaking news. Snippets are generated by search engines and may not reflect the current state of the actual webpage.\n\nWHEN TO USE fetch_url: After receiving search results, use the fetch_url tool to get accurate, up-to-date content from specific webpages when:\n- Search snippets seem outdated, incomplete, or inaccurate\n- You need detailed information from a specific authoritative source\n- The information is time-sensitive (weather, news, stocks, etc.)\n- Multiple search results conflict and you need to verify actual content\n- You need more detailed information than what the snippet provides\n\nThe fetch_url tool retrieves the actual webpage content, which is much more reliable than snippets. Always prefer using fetch_url for critical or time-sensitive information rather than relying solely on snippets."
        
        messages.append(
            {
                "role": "system",
                "content": system_content,
            }
        )

    # Add conversation history if provided
    if conversation_history:
        for msg in conversation_history:
            messages.append({"role": msg.role, "content": msg.content})

    # Add the current prompt as user message
    messages.append({"role": "user", "content": prompt})

    # Prepare tools if web search is enabled
    tools = None
    if enable_web_search and search_provider:
        tools = [WEB_SEARCH_TOOL, FETCH_URL_TOOL]

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
                # Prepare API call parameters
                api_params = {
                    "model": model_id,
                    "messages": messages,
                    "timeout": settings.individual_model_timeout,
                    "max_tokens": max_tokens,
                    "stream": True,  # Enable streaming!
                }
                
                # Add tools if web search is enabled
                if tools:
                    api_params["tools"] = tools
                    # Some models (like GPT-5 Chat) may not support tool_choice parameter
                    # Try without tool_choice first - models will use tools automatically if supported
                    # Only add tool_choice if explicitly needed (some models require it)
                    # For now, omit tool_choice to avoid 404 errors with certain models
                    # api_params["tool_choice"] = "auto"  # Commented out - causes 404 for GPT-5 Chat
                
                # Enable streaming
                # Use client with tool headers when tools are enabled (required by OpenRouter for provider routing)
                # OpenRouter needs HTTP-Referer and X-Title headers to route to providers that support tool calling
                try:
                    if tools:
                        # Try using extra_headers parameter first (if supported by SDK)
                        # Fall back to client_with_tool_headers if extra_headers doesn't work
                        try:
                            response = client.chat.completions.create(
                                **api_params,
                                extra_headers={
                                    "HTTP-Referer": "https://compareintel.com",
                                    "X-Title": "CompareIntel",
                                }
                            )
                        except TypeError:
                            # extra_headers not supported, use client with default headers
                            response = client_with_tool_headers.chat.completions.create(**api_params)
                    else:
                        response = client.chat.completions.create(**api_params)
                except Exception as api_error:
                    # Log warning if we get a 404 with tools (model may not support tool calling)
                    error_str = str(api_error).lower()
                    if ("404" in error_str or "not found" in error_str) and tools:
                        logger.warning(
                            f"Model {model_id} returned 404 when tools were included. "
                            f"This may indicate the model doesn't support tool calling through OpenRouter. "
                            f"Error: {api_error}"
                        )
                    raise

                full_content = ""
                finish_reason = None
                usage_data = None
                tool_calls_accumulated = {}  # Dict to accumulate tool calls by index
                tool_call_ids_seen = set()  # Track tool call IDs to prevent duplicates across indices
                all_tool_call_ids_ever_seen = set()  # Track ALL tool call IDs across entire conversation (never reset)
                reasoning_details = None  # Capture reasoning details for Gemini models

                # Iterate through chunks as they arrive
                for chunk in response:
                    if chunk.choices and len(chunk.choices) > 0:
                        delta = chunk.choices[0].delta

                        # Capture reasoning_details if present (required for Gemini models)
                        # Reasoning details may be in delta or in the chunk itself
                        if hasattr(delta, "reasoning_details") and delta.reasoning_details:
                            reasoning_details = delta.reasoning_details
                        elif hasattr(chunk.choices[0], "reasoning_details") and chunk.choices[0].reasoning_details:
                            reasoning_details = chunk.choices[0].reasoning_details

                        # Handle tool calls (for web search) - accumulate across chunks
                        if hasattr(delta, "tool_calls") and delta.tool_calls:
                            for tool_call_delta in delta.tool_calls:
                                idx = tool_call_delta.index
                                
                                # Get tool call ID if present
                                tool_call_id_from_delta = ""
                                if hasattr(tool_call_delta, "id") and tool_call_delta.id:
                                    tool_call_id_from_delta = tool_call_delta.id
                                
                                # Skip if this tool call ID was already seen anywhere (prevent duplicates)
                                if tool_call_id_from_delta:
                                    if tool_call_id_from_delta in all_tool_call_ids_ever_seen:
                                        logger.warning(
                                            f"Model {model_id} returned duplicate tool call ID '{tool_call_id_from_delta}' at index {idx} in streaming delta, skipping duplicate."
                                        )
                                        continue
                                    all_tool_call_ids_ever_seen.add(tool_call_id_from_delta)
                                
                                # Also check local set for this batch
                                if tool_call_id_from_delta and tool_call_id_from_delta in tool_call_ids_seen:
                                    logger.warning(
                                        f"Model {model_id} returned duplicate tool call ID '{tool_call_id_from_delta}' at index {idx} in streaming delta (local duplicate), skipping."
                                    )
                                    continue
                                
                                # Initialize tool call structure if needed
                                if idx not in tool_calls_accumulated:
                                    tool_calls_accumulated[idx] = {
                                        "id": "",
                                        "type": "function",
                                        "function": {"name": "", "arguments": ""}
                                    }
                                
                                tc = tool_calls_accumulated[idx]
                                
                                # Update tool call ID
                                if tool_call_id_from_delta:
                                    tc["id"] = tool_call_id_from_delta
                                    tool_call_ids_seen.add(tool_call_id_from_delta)
                                
                                # Update function name and arguments
                                if hasattr(tool_call_delta, "function"):
                                    if hasattr(tool_call_delta.function, "name") and tool_call_delta.function.name:
                                        tc["function"]["name"] = tool_call_delta.function.name
                                    if hasattr(tool_call_delta.function, "arguments") and tool_call_delta.function.arguments:
                                        tc["function"]["arguments"] += tool_call_delta.function.arguments

                        # Yield content chunks as they arrive
                        # Check delta.content first (standard streaming)
                        if hasattr(delta, "content") and delta.content:
                            content_chunk = delta.content
                            full_content += content_chunk
                            yield content_chunk
                        
                        # Also check message.content in final chunk (some models like GPT-5 return content here)
                        # This handles cases where content is only in the final chunk's message object
                        if hasattr(chunk.choices[0], "message") and chunk.choices[0].message:
                            message = chunk.choices[0].message
                            if hasattr(message, "content") and message.content:
                                message_content = message.content
                                if message_content and len(message_content) > len(full_content):
                                    # Extract only the new part that hasn't been yielded yet
                                    new_content = message_content[len(full_content):]
                                    if new_content:
                                        content_chunk = new_content
                                        full_content += content_chunk
                                        yield content_chunk
                                elif message_content and not full_content:
                                    # If we haven't yielded any content yet, yield the entire message content
                                    # This handles cases where GPT-5 models return all content in the final chunk
                                    content_chunk = message_content
                                    full_content += content_chunk
                                    yield content_chunk
                            
                            # Also check message.tool_calls in final chunk (some models like GPT-5 Chat return tool_calls here)
                            # This handles cases where tool_calls are only in the final chunk's message object
                            if hasattr(message, "tool_calls") and message.tool_calls:
                                for tool_call in message.tool_calls:
                                    idx = tool_call.index if hasattr(tool_call, "index") else len(tool_calls_accumulated)
                                    
                                    # Get tool call ID if present
                                    tool_call_id_from_message = ""
                                    if hasattr(tool_call, "id") and tool_call.id:
                                        tool_call_id_from_message = tool_call.id
                                    
                                    # Skip if this tool call ID was already seen anywhere (prevent duplicates)
                                    if tool_call_id_from_message:
                                        if tool_call_id_from_message in all_tool_call_ids_ever_seen:
                                            logger.warning(
                                                f"Model {model_id} returned duplicate tool call ID '{tool_call_id_from_message}' at index {idx} in message.tool_calls, skipping duplicate."
                                            )
                                            continue
                                        all_tool_call_ids_ever_seen.add(tool_call_id_from_message)
                                    
                                    # Also check local set for this batch
                                    if tool_call_id_from_message and tool_call_id_from_message in tool_call_ids_seen:
                                        logger.warning(
                                            f"Model {model_id} returned duplicate tool call ID '{tool_call_id_from_message}' at index {idx} in message.tool_calls (local duplicate), skipping."
                                        )
                                        continue
                                    
                                    # Initialize tool call structure if needed
                                    if idx not in tool_calls_accumulated:
                                        tool_calls_accumulated[idx] = {
                                            "id": "",
                                            "type": "function",
                                            "function": {"name": "", "arguments": ""}
                                        }
                                    
                                    tc = tool_calls_accumulated[idx]
                                    
                                    # Update tool call ID (prefer message tool_call ID as it's complete)
                                    if tool_call_id_from_message:
                                        tc["id"] = tool_call_id_from_message
                                        tool_call_ids_seen.add(tool_call_id_from_message)
                                    
                                    # Update function name and arguments (prefer message tool_call as it's complete)
                                    if hasattr(tool_call, "function"):
                                        if hasattr(tool_call.function, "name") and tool_call.function.name:
                                            tc["function"]["name"] = tool_call.function.name
                                        if hasattr(tool_call.function, "arguments") and tool_call.function.arguments:
                                            # For message tool_calls, arguments are complete, not incremental
                                            tc["function"]["arguments"] = tool_call.function.arguments

                        # Capture finish reason from last chunk
                        if chunk.choices[0].finish_reason:
                            finish_reason = chunk.choices[0].finish_reason
                            
                            # Also check the choice object itself for reasoning_details (may be in final chunk)
                            if hasattr(chunk.choices[0], "reasoning_details") and chunk.choices[0].reasoning_details:
                                reasoning_details = chunk.choices[0].reasoning_details

                    # Extract usage data from chunk if available
                    if hasattr(chunk, "usage") and chunk.usage:
                        usage = chunk.usage
                        prompt_tokens = getattr(usage, "prompt_tokens", 0)
                        completion_tokens = getattr(usage, "completion_tokens", 0)
                        if prompt_tokens > 0 or completion_tokens > 0:
                            usage_data = calculate_token_usage(prompt_tokens, completion_tokens)
                    
                    # Check response object itself for reasoning_details (may be set after streaming)
                    if hasattr(response, "reasoning_details") and response.reasoning_details:
                        reasoning_details = response.reasoning_details

                # Handle tool calls after streaming completes
                # Support recursive tool calls (model may make multiple tool calls in sequence)
                # NOTE: Some models (like Gemini 2.0 Flash) may make more aggressive tool calls,
                # which can exhaust search API rate limits when multiple models run in parallel.
                # The rate limiter below coordinates search requests across all concurrent models.
                max_tool_call_iterations = 3  # Prevent infinite loops - reduced to encourage faster answers
                tool_call_iteration = 0
                total_tool_calls_made = 0  # Track total tool calls across all iterations
                max_total_tool_calls = 10  # Hard limit on total tool calls to prevent excessive looping
                last_chunk = None
                
                # Get rate limiter for coordinating search requests across models
                # This prevents API rate limit exhaustion when multiple models make concurrent searches
                rate_limiter = get_rate_limiter()
                
                while finish_reason == "tool_calls" and tool_calls_accumulated and search_provider and tool_call_iteration < max_tool_call_iterations:
                    tool_call_iteration += 1
                    
                    # Log iteration for debugging
                    logger.info(
                        f"Processing tool calls iteration {tool_call_iteration} for model {model_id}. "
                        f"Tool calls accumulated: {len(tool_calls_accumulated)}"
                    )
                    
                    # If we're on the last iteration, add a forceful instruction to stop
                    if tool_call_iteration >= max_tool_call_iterations:
                        logger.warning(
                            f"Model {model_id} reached max tool call iterations ({max_tool_call_iterations}). "
                            f"This is the final iteration - model must provide answer now."
                        )
                    
                    # Yield keepalive at start of each iteration to prevent timeout
                    # This is especially important for slower models that take longer to process tool calls
                    yield " "
                    
                    # Execute all tool calls
                    # First, deduplicate tool_calls_accumulated by ID (simplest approach)
                    # This ensures we only process each unique tool call ID once, regardless of index
                    # NOTE: We don't check all_tool_call_ids_ever_seen here because IDs are added to it during accumulation
                    # We only check if we've already added this ID to deduplicated_tool_calls in this pass
                    deduplicated_tool_calls = {}
                    seen_ids_in_dedup = set()  # Track IDs we've added to deduplicated_tool_calls in this pass
                    for idx, tool_call in tool_calls_accumulated.items():
                        tool_call_id = tool_call.get("id", "").strip() if tool_call.get("id") else ""
                        
                        if not tool_call_id:
                            # Keep entries without IDs (they'll be validated later)
                            deduplicated_tool_calls[idx] = tool_call
                            continue
                        
                        # Check if we already have this ID in deduplicated_tool_calls (within this deduplication pass)
                        if tool_call_id in seen_ids_in_dedup:
                            logger.warning(
                                f"Model {model_id} returned duplicate tool call ID '{tool_call_id}' at index {idx} in tool_calls_accumulated, skipping duplicate."
                            )
                            continue
                        
                        # Add to deduplicated_tool_calls and track it
                        deduplicated_tool_calls[idx] = tool_call
                        seen_ids_in_dedup.add(tool_call_id)
                        # DON'T add to all_tool_call_ids_ever_seen here - wait until we actually process it
                    
                    # Now process the deduplicated tool calls
                    tool_call_messages = []
                    tool_results = []
                    processed_ids_this_iteration = set()  # Track IDs we've processed in this iteration
                    
                    for idx, tool_call in sorted(deduplicated_tool_calls.items()):
                        # Validate tool call has required fields before processing
                        if not tool_call.get("id") or not tool_call["id"].strip():
                            logger.warning(
                                f"Model {model_id} returned tool call with empty ID at index {idx}, skipping. "
                                f"Tool call: {tool_call}"
                            )
                            continue
                        
                        tool_call_id = tool_call["id"].strip()
                        
                        # Skip if we've already processed this ID in this iteration
                        if tool_call_id in processed_ids_this_iteration:
                            logger.warning(
                                f"Model {model_id} duplicate tool call ID '{tool_call_id}' already processed in this iteration, skipping."
                            )
                            continue
                        
                        # Mark as processed and add to global tracker
                        # This is where we actually add IDs to all_tool_call_ids_ever_seen (not during accumulation)
                        processed_ids_this_iteration.add(tool_call_id)
                        all_tool_call_ids_ever_seen.add(tool_call_id)
                        
                        # Double-check it's not already in tool_call_messages (safety)
                        already_in_messages = any(tc.get("id", "").strip() == tool_call_id for tc in tool_call_messages if tc.get("id"))
                        if already_in_messages:
                            logger.warning(
                                f"Model {model_id} duplicate tool call ID '{tool_call_id}' already in tool_call_messages, skipping."
                            )
                            continue
                        
                        if not tool_call.get("function", {}).get("name"):
                            logger.warning(
                                f"Model {model_id} returned tool call with empty function name at index {idx}, skipping. "
                                f"Tool call: {tool_call}"
                            )
                            continue
                        
                        if tool_call["function"]["name"] == "search_web":
                            try:
                                import json
                                # Parse arguments
                                args = json.loads(tool_call["function"]["arguments"])
                                search_query = args.get("query", "")
                                
                                # Check if this is a redundant search (same query as before)
                                # This helps prevent infinite loops where model keeps searching for the same thing
                                previous_searches = []
                                for msg in messages:
                                    if msg.get("role") == "assistant" and msg.get("tool_calls"):
                                        for tc in msg["tool_calls"]:
                                            if tc.get("function", {}).get("name") == "search_web":
                                                try:
                                                    prev_args = json.loads(tc.get("function", {}).get("arguments", "{}"))
                                                    prev_query = prev_args.get("query", "")
                                                    if prev_query:
                                                        previous_searches.append(prev_query.lower().strip())
                                                except:
                                                    pass
                                
                                if search_query and search_query.lower().strip() in previous_searches:
                                    logger.warning(
                                        f"Model {model_id} attempted redundant search with query '{search_query}' "
                                        f"(already searched in previous iteration). Providing message instead of re-executing."
                                    )
                                    # Provide a message indicating the search was already done
                                    tool_call_messages.append({
                                        "id": tool_call_id,
                                        "type": "function",
                                        "function": {
                                            "name": "search_web",
                                            "arguments": tool_call["function"]["arguments"]
                                        }
                                    })
                                    tool_results.append({
                                        "tool_call_id": tool_call_id,
                                        "content": f"⚠️ This search query ('{search_query}') was already executed in a previous step. Please review the search results you already received and provide your answer based on that information. Making the same search again will not provide new information."
                                    })
                                    continue
                                
                                if search_query:
                                    # Yield keepalive chunk before websearch to reset frontend timeout
                                    # This prevents timeout during websearch execution which can take several seconds
                                    yield " "
                                    
                                    # Execute search with rate limiting and periodic keepalives
                                    # Since we're in a thread pool (no event loop), use asyncio.run()
                                    # to properly create and manage an event loop for the async search
                                    import asyncio
                                    import queue
                                    logger.info(f"Executing web search for query: {search_query} (model: {model_id}, iteration: {tool_call_iteration})")
                                    
                                    async def execute_search_with_rate_limit():
                                        """Execute search with rate limiting."""
                                        try:
                                            # Acquire rate limiter permission (waits if necessary)
                                            # This coordinates search requests across all concurrent models
                                            await rate_limiter.acquire()
                                            try:
                                                # Execute the actual search
                                                search_results = await search_provider.search(search_query, max_results=5)
                                                return search_results
                                            finally:
                                                # Release concurrent slot after search completes
                                                rate_limiter.release()
                                        except Exception as e:
                                            # Release concurrent slot on error
                                            rate_limiter.release()
                                            raise
                                    
                                    # Use threading to run search in background and yield keepalives periodically
                                    # This prevents frontend timeout during long search operations
                                    import queue
                                    search_queue = queue.Queue()
                                    search_exception = None
                                    search_results = None
                                    
                                    def run_search():
                                        """Run search in thread and put result in queue."""
                                        nonlocal search_exception
                                        try:
                                            result = asyncio.run(execute_search_with_rate_limit())
                                            search_queue.put(("success", result))
                                        except Exception as e:
                                            search_exception = e
                                            search_queue.put(("error", None))
                                    
                                    # Start search in background thread
                                    search_thread = threading.Thread(target=run_search, daemon=True)
                                    search_thread.start()
                                    
                                    # Yield keepalives every 5 seconds while waiting for search to complete
                                    # This ensures frontend timeout is reset during long search operations
                                    # Use 5 seconds to match ACTIVE_STREAMING_WINDOW in frontend
                                    KEEPALIVE_INTERVAL = 5.0  # Send keepalive every 5 seconds
                                    search_start_time = time.time()
                                    
                                    try:
                                        while True:
                                            try:
                                                # Check if search completed (non-blocking)
                                                result_type, result_data = search_queue.get(timeout=KEEPALIVE_INTERVAL)
                                                
                                                if result_type == "success":
                                                    search_results = result_data
                                                    logger.info(f"Web search completed successfully, found {len(search_results)} results")
                                                    # Yield keepalive chunk after websearch to reset frontend timeout
                                                    yield " "
                                                    break
                                                else:
                                                    # Error occurred in search thread
                                                    raise search_exception
                                            except queue.Empty:
                                                # Search still running - yield keepalive to reset frontend timeout
                                                elapsed = time.time() - search_start_time
                                                yield " "
                                        
                                        # Search completed successfully, search_results is set
                                        # Ensure thread is properly joined to clean up resources
                                        search_thread.join(timeout=5.0)
                                    except Exception as search_exec_error:
                                        # Wait for thread to finish before handling error
                                        search_thread.join(timeout=5.0)
                                        if search_exception:
                                            search_exec_error = search_exception
                                        error_msg = str(search_exec_error)
                                        # Check if this is a rate limit error
                                        if "rate limit" in error_msg.lower() or "429" in error_msg:
                                            logger.warning(
                                                f"Search API rate limit hit for model {model_id}. "
                                                f"This may occur when multiple models make concurrent search requests."
                                            )
                                            # Provide a helpful error message to the model
                                            raise Exception(
                                                f"Search API rate limit exceeded. Please try again in a moment. "
                                                f"Error: {error_msg}"
                                            )
                                        logger.error(f"Error during web search execution: {search_exec_error}", exc_info=True)
                                        raise
                                    
                                    # Format search results for the model
                                    # Include current date/time context so models know what "today" means
                                    current_datetime = datetime.now()
                                    current_date_str = current_datetime.strftime("%A, %B %d, %Y")
                                    current_time_str = current_datetime.strftime("%I:%M %p %Z")
                                    
                                    results_text = f"Web search results (current date: {current_date_str} at {current_time_str}):\n\n"
                                    results_text += "⚠️ IMPORTANT: The snippets below are summaries provided by search engines and may be OUTDATED, INCOMPLETE, or INACCURATE, especially for time-sensitive information (weather, stocks, sports, news). Treat snippets as preliminary summaries only. For accurate current information, prioritize authoritative sources.\n\n"
                                    for i, result in enumerate(search_results, 1):
                                        results_text += f"{i}. {result.title}\n"
                                        results_text += f"   URL: {result.url}\n"
                                        results_text += f"   Snippet (may be outdated): {result.snippet}\n\n"
                                    
                                    # Add instruction to help model know when to stop and provide answer
                                    results_text += "\n\n💡 CRITICAL INSTRUCTION: You now have search results. **STOP making tool calls and provide your answer immediately** if the search results contain enough information to answer the user's question. Only use fetch_url if the search results are completely insufficient AND you absolutely need specific details from a webpage. Most questions can be answered from search results alone - do not over-fetch URLs."
                                    
                                    # Store tool call and result (tool call ID already validated above)
                                    # Final check: ensure this ID isn't already in tool_call_messages
                                    if not any(tc.get("id", "").strip() == tool_call_id for tc in tool_call_messages if tc.get("id")):
                                        tool_call_messages.append({
                                            "id": tool_call_id,
                                            "type": "function",
                                            "function": {
                                                "name": "search_web",
                                                "arguments": tool_call["function"]["arguments"]
                                            }
                                        })
                                        tool_results.append({
                                            "tool_call_id": tool_call_id,
                                            "content": results_text
                                        })
                                    else:
                                        logger.warning(
                                            f"Model {model_id} attempted to add duplicate tool call ID '{tool_call_id}' (search_web success) to tool_call_messages, skipping."
                                        )
                            except Exception as e:
                                logger.error(f"Error executing web search tool: {e}")
                                # Add error result (tool call ID already validated above)
                                # Final check: ensure this ID isn't already in tool_call_messages
                                if not any(tc.get("id", "").strip() == tool_call_id for tc in tool_call_messages if tc.get("id")):
                                    tool_call_messages.append({
                                        "id": tool_call_id,
                                        "type": "function",
                                        "function": {
                                            "name": "search_web",
                                            "arguments": tool_call["function"]["arguments"]
                                        }
                                    })
                                    tool_results.append({
                                        "tool_call_id": tool_call_id,
                                        "content": f"Error performing web search: {str(e)}"
                                    })
                                else:
                                    logger.warning(
                                        f"Model {model_id} attempted to add duplicate tool call ID '{tool_call_id}' (error case) to tool_call_messages, skipping."
                                    )
                        elif tool_call["function"]["name"] == "fetch_url":
                            try:
                                import json
                                import asyncio
                                # Parse arguments
                                args = json.loads(tool_call["function"]["arguments"])
                                url = args.get("url", "")
                                
                                # Check if this URL was already fetched (prevent redundant fetches)
                                previous_urls = []
                                for msg in messages:
                                    if msg.get("role") == "assistant" and msg.get("tool_calls"):
                                        for tc in msg["tool_calls"]:
                                            if tc.get("function", {}).get("name") == "fetch_url":
                                                try:
                                                    prev_args = json.loads(tc.get("function", {}).get("arguments", "{}"))
                                                    prev_url = prev_args.get("url", "")
                                                    if prev_url:
                                                        # Normalize URL (remove query params for comparison)
                                                        prev_url_normalized = prev_url.split("?")[0].lower().strip()
                                                        previous_urls.append(prev_url_normalized)
                                                except:
                                                    pass
                                
                                if url:
                                    url_normalized = url.split("?")[0].lower().strip()
                                    if url_normalized in previous_urls:
                                        logger.warning(
                                            f"Model {model_id} attempted redundant URL fetch: '{url}' "
                                            f"(already fetched in previous iteration). Providing message instead."
                                        )
                                        # Provide a message indicating the URL was already fetched
                                        tool_call_messages.append({
                                            "id": tool_call_id,
                                            "type": "function",
                                            "function": {
                                                "name": "fetch_url",
                                                "arguments": tool_call["function"]["arguments"]
                                            }
                                        })
                                        tool_results.append({
                                            "tool_call_id": tool_call_id,
                                            "content": f"⚠️ This URL ('{url}') was already fetched in a previous step. The content from that fetch is already available in the conversation. Please review the previously fetched content and provide your answer based on that information. Fetching the same URL again will not provide new information."
                                        })
                                        continue
                                
                                if url:
                                    # Yield keepalive chunk before URL fetch to reset frontend timeout
                                    yield " "
                                    
                                    logger.info(f"Fetching URL content: {url} (model: {model_id}, iteration: {tool_call_iteration})")
                                    
                                    # Execute URL fetch with rate limiting
                                    async def execute_url_fetch():
                                        """Execute URL fetch with rate limiting."""
                                        try:
                                            # Acquire rate limiter permission (waits if necessary)
                                            await rate_limiter.acquire()
                                            try:
                                                # Execute the actual URL fetch
                                                content = await fetch_url_content(url)
                                                return content
                                            finally:
                                                # Release concurrent slot after fetch completes
                                                rate_limiter.release()
                                        except Exception as e:
                                            # Release concurrent slot on error
                                            rate_limiter.release()
                                            raise
                                    
                                    # Use threading to run fetch in background and yield keepalives periodically
                                    import queue
                                    fetch_queue = queue.Queue()
                                    fetch_exception = None
                                    url_content = None
                                    
                                    def run_fetch():
                                        """Run URL fetch in thread and put result in queue."""
                                        nonlocal fetch_exception
                                        try:
                                            result = asyncio.run(execute_url_fetch())
                                            fetch_queue.put(("success", result))
                                        except Exception as e:
                                            fetch_exception = e
                                            fetch_queue.put(("error", None))
                                    
                                    # Start fetch in background thread
                                    fetch_thread = threading.Thread(target=run_fetch, daemon=True)
                                    fetch_thread.start()
                                    
                                    # Yield keepalives every 5 seconds while waiting for fetch to complete
                                    KEEPALIVE_INTERVAL = 5.0
                                    fetch_start_time = time.time()
                                    
                                    try:
                                        while True:
                                            try:
                                                # Check if fetch completed (non-blocking)
                                                result_type, result_data = fetch_queue.get(timeout=KEEPALIVE_INTERVAL)
                                                
                                                if result_type == "success":
                                                    url_content = result_data
                                                    logger.info(f"URL fetch completed successfully for {url}")
                                                    # Yield keepalive chunk after fetch to reset frontend timeout
                                                    yield " "
                                                    break
                                                else:
                                                    # Error occurred in fetch thread
                                                    raise fetch_exception
                                            except queue.Empty:
                                                # Fetch still running - yield keepalive to reset frontend timeout
                                                yield " "
                                        
                                        # Fetch completed successfully, url_content is set
                                        # Ensure thread is properly joined to clean up resources
                                        fetch_thread.join(timeout=5.0)
                                    except Exception as fetch_exec_error:
                                        # Wait for thread to finish before handling error
                                        fetch_thread.join(timeout=5.0)
                                        if fetch_exception:
                                            fetch_exec_error = fetch_exception
                                        error_msg = str(fetch_exec_error)
                                        logger.error(f"Error during URL fetch execution: {fetch_exec_error}", exc_info=True)
                                        raise
                                    
                                    # Format URL content for the model
                                    content_text = f"Content fetched from {url}:\n\n{url_content}\n\n[End of content from {url}]\n\n💡 CRITICAL INSTRUCTION: You now have webpage content above. **STOP making tool calls immediately and provide your answer now.** You have sufficient information - do not fetch more URLs or make more searches. Answer the user's question based on the content you have."
                                    
                                    # Store tool call and result (tool call ID already validated above)
                                    # Final check: ensure this ID isn't already in tool_call_messages
                                    if not any(tc.get("id", "").strip() == tool_call_id for tc in tool_call_messages if tc.get("id")):
                                        tool_call_messages.append({
                                            "id": tool_call_id,
                                            "type": "function",
                                            "function": {
                                                "name": "fetch_url",
                                                "arguments": tool_call["function"]["arguments"]
                                            }
                                        })
                                        tool_results.append({
                                            "tool_call_id": tool_call_id,
                                            "content": content_text
                                        })
                                    else:
                                        logger.warning(
                                            f"Model {model_id} attempted to add duplicate tool call ID '{tool_call_id}' (fetch_url) to tool_call_messages, skipping."
                                        )
                            except Exception as e:
                                logger.error(f"Error executing fetch_url tool: {e}")
                                # Add error result (tool call ID already validated above)
                                # Final check: ensure this ID isn't already in tool_call_messages
                                if not any(tc.get("id", "").strip() == tool_call_id for tc in tool_call_messages if tc.get("id")):
                                    tool_call_messages.append({
                                        "id": tool_call_id,
                                        "type": "function",
                                        "function": {
                                            "name": "fetch_url",
                                            "arguments": tool_call["function"]["arguments"]
                                        }
                                    })
                                    tool_results.append({
                                        "tool_call_id": tool_call_id,
                                        "content": f"Error fetching URL content: {str(e)}"
                                    })
                                else:
                                    logger.warning(
                                        f"Model {model_id} attempted to add duplicate tool call ID '{tool_call_id}' (fetch_url error) to tool_call_messages, skipping."
                                    )
                    
                    # Add tool calls and results to messages
                    if tool_call_messages:
                        # Collect all existing tool call IDs from previous messages to prevent duplicates
                        # This prevents "Duplicate item found with id" errors when the same tool call ID
                        # appears across multiple iterations of the tool call loop
                        existing_tool_call_ids = set()
                        for msg in messages:
                            if msg.get("role") == "assistant" and msg.get("tool_calls"):
                                for tc in msg["tool_calls"]:
                                    if tc.get("id"):
                                        existing_tool_call_ids.add(tc["id"])
                        
                        # Validate that all tool calls have IDs before proceeding
                        # Filter out any tool calls with empty IDs (should not happen, but safety check)
                        # Also filter out duplicates that already exist in the messages array
                        valid_tool_call_messages = []
                        seen_in_batch = set()  # Track IDs within this batch to prevent duplicates
                        for tc_msg in tool_call_messages:
                            tc_id = tc_msg.get("id", "").strip() if tc_msg.get("id") else ""
                            
                            if not tc_id:
                                logger.warning(
                                    f"Model {model_id} returned tool call with empty ID, skipping. "
                                    f"Tool call: {tc_msg}"
                                )
                                continue
                            
                            # Skip if this tool call ID already exists in messages from previous iterations
                            if tc_id in existing_tool_call_ids:
                                logger.warning(
                                    f"Model {model_id} returned tool call with ID '{tc_id}' that already exists in messages, skipping duplicate. "
                                    f"This can occur when the same tool call appears across multiple iterations."
                                )
                                continue
                            
                            # Skip if this tool call ID already seen in this batch
                            if tc_id in seen_in_batch:
                                logger.warning(
                                    f"Model {model_id} returned duplicate tool call ID '{tc_id}' within the same batch, skipping duplicate."
                                )
                                continue
                            
                            seen_in_batch.add(tc_id)
                            valid_tool_call_messages.append(tc_msg)
                        
                        if not valid_tool_call_messages:
                            logger.error(
                                f"Model {model_id} returned tool calls but none had valid IDs after deduplication. "
                                f"Original tool calls: {tool_call_messages}"
                            )
                            # Skip tool call handling if no valid tool calls
                            break
                        
                        # Final deduplication check: ensure no duplicate IDs in valid_tool_call_messages
                        # This is a safety net in case duplicates somehow got through
                        final_tool_call_ids = set()
                        final_valid_tool_call_messages = []
                        for tc_msg in valid_tool_call_messages:
                            tc_id = tc_msg.get("id", "").strip() if tc_msg.get("id") else ""
                            if not tc_id:
                                # Keep entries without IDs (they'll be validated by API)
                                final_valid_tool_call_messages.append(tc_msg)
                                continue
                            
                            if tc_id not in final_tool_call_ids:
                                final_tool_call_ids.add(tc_id)
                                final_valid_tool_call_messages.append(tc_msg)
                            else:
                                logger.error(
                                    f"CRITICAL: Model {model_id} duplicate tool call ID '{tc_id}' detected in final validation, removing duplicate. "
                                    f"This should not happen - there may be a bug in the deduplication logic. "
                                    f"valid_tool_call_messages had {len(valid_tool_call_messages)} items, final_valid has {len(final_valid_tool_call_messages)}."
                                )
                        
                        if not final_valid_tool_call_messages:
                            logger.error(
                                f"Model {model_id} returned tool calls but all were filtered out during final deduplication. "
                                f"Original tool calls: {tool_call_messages}"
                            )
                            # Skip tool call handling if no valid tool calls
                            break
                        
                        # Create assistant message with tool calls
                        # For OpenAI API, when tool_calls are present, content should be omitted or empty string
                        # Using empty string instead of None to avoid potential API validation issues
                        assistant_message = {
                            "role": "assistant",
                            "content": "",  # Empty string instead of None for better API compatibility
                            "tool_calls": final_valid_tool_call_messages
                        }
                        
                        # IMPORTANT: Only Gemini models require reasoning_details to be echoed back.
                        # For OpenAI models, reasoning_details may contain items with "rs_..." IDs; re-sending the same
                        # reasoning_details across multiple tool-call iterations can trigger:
                        #   "Duplicate item found with id rs_..."
                        if reasoning_details is not None and str(model_id).startswith("google/gemini"):
                            assistant_message["reasoning_details"] = reasoning_details
                        
                        # ULTIMATE FIX: Before adding assistant message, do one final check to ensure
                        # none of the tool call IDs in this message already exist in messages array
                        # This is the last line of defense against duplicate tool call IDs
                        all_existing_ids = set()
                        for msg in messages:
                            if msg.get("role") == "assistant" and msg.get("tool_calls"):
                                for tc in msg["tool_calls"]:
                                    tc_id = tc.get("id", "").strip() if tc.get("id") else ""
                                    if tc_id:
                                        all_existing_ids.add(tc_id)
                        
                        # Also check for duplicates WITHIN this message itself
                        seen_in_this_message = set()
                        truly_unique_tool_calls = []
                        for tc in assistant_message["tool_calls"]:
                            tc_id = tc.get("id", "").strip() if tc.get("id") else ""
                            if not tc_id:
                                # Keep entries without IDs (they'll be validated by API)
                                truly_unique_tool_calls.append(tc)
                                continue
                            
                            # Check if this ID already exists in previous messages
                            if tc_id in all_existing_ids:
                                logger.error(
                                    f"CRITICAL: Prevented adding duplicate tool call ID '{tc_id}' to messages array. "
                                    f"This ID already exists in a previous assistant message."
                                )
                                continue
                            
                            # Check if this ID already exists in this same message
                            if tc_id in seen_in_this_message:
                                logger.error(
                                    f"CRITICAL: Prevented adding duplicate tool call ID '{tc_id}' within the same assistant message. "
                                    f"This should have been caught earlier."
                                )
                                continue
                            
                            seen_in_this_message.add(tc_id)
                            all_existing_ids.add(tc_id)  # Track it so we don't add it twice
                            truly_unique_tool_calls.append(tc)
                        
                        # Only add the assistant message if it has unique tool calls
                        if truly_unique_tool_calls:
                            # Count total tool calls and check if we've exceeded the limit
                            total_tool_calls_made += len(truly_unique_tool_calls)
                            if total_tool_calls_made > max_total_tool_calls:
                                logger.warning(
                                    f"Model {model_id} exceeded max total tool calls ({max_total_tool_calls}). "
                                    f"Total tool calls made: {total_tool_calls_made}. "
                                    f"Breaking out of tool call loop to prevent excessive looping."
                                )
                                # Add a message telling the model to stop and provide an answer
                                messages.append({
                                    "role": "user",
                                    "content": "🚨 STOP: You have made too many tool calls. Please provide your answer now based on the information you have already gathered. Do not make any more tool calls."
                                })
                                break
                            
                            assistant_message["tool_calls"] = truly_unique_tool_calls
                            messages.append(assistant_message)
                            logger.info(
                                f"Added assistant message with {len(truly_unique_tool_calls)} unique tool calls to messages array. "
                                f"Total tool calls made so far: {total_tool_calls_made}/{max_total_tool_calls}. "
                                f"Tool call IDs: {[tc.get('id') for tc in truly_unique_tool_calls if tc.get('id')]}"
                            )
                        else:
                            logger.error(
                                f"CRITICAL: Skipping assistant message because all tool calls were duplicates. "
                                f"Original had {len(assistant_message['tool_calls'])} tool calls. "
                                f"This should not happen - breaking out of tool call loop."
                            )
                            # Break out of the tool call loop since we have nothing new to add
                            break
                        
                        # Deduplicate tool results by tool_call_id to prevent duplicates
                        # Collect existing tool_call_ids from tool messages
                        existing_tool_result_ids = set()
                        for msg in messages:
                            if msg.get("role") == "tool" and msg.get("tool_call_id"):
                                existing_tool_result_ids.add(msg["tool_call_id"])
                        
                        # Only add tool results that don't already exist in messages
                        for result in tool_results:
                            result_id = result.get("tool_call_id", "").strip() if result.get("tool_call_id") else ""
                            if result_id and result_id not in existing_tool_result_ids:
                                # If this is the last iteration, add a forceful stop instruction
                                if tool_call_iteration >= max_tool_call_iterations:
                                    original_content = result.get("content", "")
                                    result["content"] = original_content + "\n\n🚨 FINAL ITERATION: This is your last chance to make tool calls. You MUST provide your answer in the next response. Do not make any more tool calls - answer the user's question now based on all the information you have received."
                                
                                messages.append({
                                    "role": "tool",
                                    "tool_call_id": result_id,
                                    "content": result["content"]
                                })
                                existing_tool_result_ids.add(result_id)
                            elif result_id in existing_tool_result_ids:
                                logger.warning(
                                    f"Model {model_id} returned tool result with duplicate tool_call_id '{result_id}', skipping duplicate."
                                )
                        
                        # Continue conversation with search results
                        # Yield keepalive before making continuation API call to reset frontend timeout
                        # Gemini 3 Pro Preview can take time to start streaming after receiving tool results
                        yield " "
                        
                        # Final validation: check entire messages array for duplicate tool call IDs
                        # This is a last safety check before sending to API
                        all_tool_call_ids_in_messages = []
                        for msg in messages:
                            if msg.get("role") == "assistant" and msg.get("tool_calls"):
                                for tc in msg["tool_calls"]:
                                    if tc.get("id"):
                                        all_tool_call_ids_in_messages.append(tc["id"])
                        
                        # Check for duplicates
                        seen_ids = set()
                        duplicate_ids = []
                        for tc_id in all_tool_call_ids_in_messages:
                            if tc_id in seen_ids:
                                duplicate_ids.append(tc_id)
                            else:
                                seen_ids.add(tc_id)
                        
                        if duplicate_ids:
                            logger.error(
                                f"CRITICAL: Model {model_id} messages array contains duplicate tool call IDs before API call: {duplicate_ids}. "
                                f"This should have been caught earlier. Attempting to fix by removing duplicates from messages."
                            )
                            # Remove duplicates by keeping only the first occurrence of each tool call ID
                            fixed_messages = []
                            tool_call_ids_added = set()
                            for msg in messages:
                                if msg.get("role") == "assistant" and msg.get("tool_calls"):
                                    # Filter out duplicate tool calls
                                    unique_tool_calls = []
                                    for tc in msg["tool_calls"]:
                                        tc_id = tc.get("id", "").strip() if tc.get("id") else ""
                                        if tc_id and tc_id not in tool_call_ids_added:
                                            tool_call_ids_added.add(tc_id)
                                            unique_tool_calls.append(tc)
                                        elif tc_id in tool_call_ids_added:
                                            logger.warning(
                                                f"Removing duplicate tool call ID '{tc_id}' from assistant message before API call."
                                            )
                                    
                                    if unique_tool_calls:
                                        # Create new message with deduplicated tool calls
                                        fixed_msg = msg.copy()
                                        fixed_msg["tool_calls"] = unique_tool_calls
                                        fixed_messages.append(fixed_msg)
                                    else:
                                        # Skip assistant message if all tool calls were duplicates
                                        logger.warning(f"Skipping assistant message with all duplicate tool calls.")
                                else:
                                    # Keep non-assistant messages as-is
                                    fixed_messages.append(msg)
                            
                            messages = fixed_messages
                            logger.info(f"Fixed messages array by removing {len(duplicate_ids)} duplicate tool call IDs.")
                        
                        # ONE MORE FINAL CHECK: Verify no duplicates exist before API call
                        # This is the absolute last check before sending to API
                        final_check_ids = []
                        for msg in messages:
                            if msg.get("role") == "assistant" and msg.get("tool_calls"):
                                for tc in msg["tool_calls"]:
                                    if tc.get("id"):
                                        final_check_ids.append(tc["id"])
                        
                        final_check_duplicates = [id for id in final_check_ids if final_check_ids.count(id) > 1]
                        if final_check_duplicates:
                            logger.error(
                                f"CRITICAL: Found {len(set(final_check_duplicates))} duplicate tool call IDs after all fixes: {set(final_check_duplicates)}. "
                                f"This is a serious bug - attempting emergency fix."
                            )
                            # Emergency fix: rebuild messages array with only unique tool calls
                            emergency_fixed_messages = []
                            emergency_seen_ids = set()
                            for msg in messages:
                                if msg.get("role") == "assistant" and msg.get("tool_calls"):
                                    emergency_unique_tcs = []
                                    for tc in msg["tool_calls"]:
                                        tc_id = tc.get("id", "").strip() if tc.get("id") else ""
                                        if tc_id and tc_id not in emergency_seen_ids:
                                            emergency_seen_ids.add(tc_id)
                                            emergency_unique_tcs.append(tc)
                                    if emergency_unique_tcs:
                                        emergency_msg = msg.copy()
                                        emergency_msg["tool_calls"] = emergency_unique_tcs
                                        emergency_fixed_messages.append(emergency_msg)
                                else:
                                    emergency_fixed_messages.append(msg)
                            messages = emergency_fixed_messages
                            logger.info(f"Emergency fix applied - messages array rebuilt with unique tool calls only.")
                        
                        # Make another API call with updated messages
                        # Log all tool call IDs in messages for debugging
                        all_tc_ids_in_final_messages = []
                        for msg in messages:
                            if msg.get("role") == "assistant" and msg.get("tool_calls"):
                                for tc in msg["tool_calls"]:
                                    if tc.get("id"):
                                        all_tc_ids_in_final_messages.append(tc["id"])
                        
                        # Also log tool result IDs for debugging
                        all_tool_result_ids_in_messages = []
                        for msg in messages:
                            if msg.get("role") == "tool" and msg.get("tool_call_id"):
                                all_tool_result_ids_in_messages.append(msg["tool_call_id"])
                        
                        # Log detailed message structure for debugging
                        message_structure = []
                        for i, msg in enumerate(messages):
                            msg_info = {"index": i, "role": msg.get("role")}
                            if msg.get("role") == "assistant" and msg.get("tool_calls"):
                                msg_info["tool_calls_count"] = len(msg["tool_calls"])
                                msg_info["tool_call_ids"] = [tc.get("id") for tc in msg["tool_calls"] if tc.get("id")]
                                msg_info["tool_call_functions"] = [tc.get("function", {}).get("name") for tc in msg["tool_calls"]]
                            elif msg.get("role") == "tool":
                                msg_info["tool_call_id"] = msg.get("tool_call_id")
                                msg_info["content_length"] = len(msg.get("content", ""))
                            message_structure.append(msg_info)
                        
                        logger.info(
                            f"Making continuation API call for model {model_id} (iteration {tool_call_iteration}). "
                            f"Total messages: {len(messages)}, Tool call IDs: {all_tc_ids_in_final_messages}, "
                            f"Tool result IDs: {all_tool_result_ids_in_messages}"
                        )
                        logger.debug(f"Message structure: {message_structure}")
                        
                        # Final validation: Check for duplicate tool result IDs
                        tool_result_id_counts = {}
                        for result_id in all_tool_result_ids_in_messages:
                            tool_result_id_counts[result_id] = tool_result_id_counts.get(result_id, 0) + 1
                        
                        duplicate_tool_result_ids = [rid for rid, count in tool_result_id_counts.items() if count > 1]
                        if duplicate_tool_result_ids:
                            logger.error(
                                f"CRITICAL: Found duplicate tool result IDs before API call: {duplicate_tool_result_ids}. "
                                f"This will cause 'rs_' resource ID conflicts. Attempting to fix."
                            )
                            # Remove duplicate tool results, keeping only the first occurrence
                            fixed_messages_tool_results = []
                            seen_tool_result_ids = set()
                            for msg in messages:
                                if msg.get("role") == "tool" and msg.get("tool_call_id"):
                                    result_id = msg["tool_call_id"]
                                    if result_id not in seen_tool_result_ids:
                                        seen_tool_result_ids.add(result_id)
                                        fixed_messages_tool_results.append(msg)
                                    else:
                                        logger.warning(f"Removing duplicate tool result with tool_call_id '{result_id}'")
                                else:
                                    fixed_messages_tool_results.append(msg)
                            messages = fixed_messages_tool_results
                            logger.info(f"Fixed messages array by removing {len(duplicate_tool_result_ids)} duplicate tool result IDs.")
                        
                        # ONE MORE CHECK: Verify the entire messages array structure is valid
                        # Check for any duplicate message content that might cause resource ID conflicts
                        assistant_messages_with_tools = []
                        for msg in messages:
                            if msg.get("role") == "assistant" and msg.get("tool_calls"):
                                assistant_messages_with_tools.append(msg)
                        
                        # Check if we have multiple assistant messages with identical tool_calls (would cause rs_ conflicts)
                        tool_calls_signatures = []
                        for msg in assistant_messages_with_tools:
                            # Create a signature based on tool call IDs and function names
                            signature = tuple(sorted([
                                (tc.get("id"), tc.get("function", {}).get("name"))
                                for tc in msg.get("tool_calls", [])
                                if tc.get("id")
                            ]))
                            tool_calls_signatures.append(signature)
                        
                        duplicate_signatures = [sig for sig in tool_calls_signatures if tool_calls_signatures.count(sig) > 1]
                        if duplicate_signatures:
                            logger.error(
                                f"CRITICAL: Found {len(set(duplicate_signatures))} assistant messages with identical tool_calls signatures. "
                                f"This will cause 'rs_' resource ID conflicts. Signatures: {set(duplicate_signatures)}"
                            )
                        
                        # Check for duplicate tool result content (API provider might generate rs_ IDs based on content hash)
                        tool_result_contents = {}
                        for msg in messages:
                            if msg.get("role") == "tool" and msg.get("tool_call_id") and msg.get("content"):
                                result_id = msg["tool_call_id"]
                                content = msg["content"]
                                # Create a hash of the content to detect duplicates
                                content_hash = hash(content[:1000])  # Hash first 1000 chars to detect similar content
                                if content_hash in tool_result_contents:
                                    existing_id = tool_result_contents[content_hash]
                                    logger.warning(
                                        f"Found tool result with similar content hash. "
                                        f"Current tool_call_id: {result_id}, Previous tool_call_id: {existing_id}. "
                                        f"This might cause rs_ resource ID conflicts."
                                    )
                                else:
                                    tool_result_contents[content_hash] = result_id
                        
                        api_params_continue = {
                            "model": model_id,
                            "messages": messages,
                            "timeout": settings.individual_model_timeout,
                            "max_tokens": max_tokens,
                            "stream": True,
                        }
                        
                        # IMPORTANT: Only include tools parameter if this is the first iteration
                        # In continuation requests, the tools are already defined in the conversation context
                        # Including tools again might cause the API provider to generate duplicate resource IDs (rs_)
                        if tools and tool_call_iteration == 1:
                            api_params_continue["tools"] = tools
                            logger.debug(f"Including tools parameter in continuation request (iteration {tool_call_iteration})")
                        elif tools and tool_call_iteration > 1:
                            logger.debug(
                                f"Omitting tools parameter in continuation request (iteration {tool_call_iteration}) "
                                f"to avoid potential rs_ resource ID conflicts. Tools are already in conversation context."
                            )
                            # Omit tool_choice for continuation requests too (same reason as above)
                            # api_params_continue["tool_choice"] = "auto"
                        
                        try:
                            # Use client with tool headers when tools are enabled (required by OpenRouter for provider routing)
                            if tools:
                                # Try using extra_headers parameter first (if supported by SDK)
                                # Fall back to client_with_tool_headers if extra_headers doesn't work
                                try:
                                    response_continue = client.chat.completions.create(
                                        **api_params_continue,
                                        extra_headers={
                                            "HTTP-Referer": "https://compareintel.com",
                                            "X-Title": "CompareIntel",
                                        }
                                    )
                                except TypeError:
                                    # extra_headers not supported, use client with default headers
                                    response_continue = client_with_tool_headers.chat.completions.create(**api_params_continue)
                            else:
                                response_continue = client.chat.completions.create(**api_params_continue)
                        except Exception as api_error:
                            # Log detailed error information for debugging
                            error_str = str(api_error)
                            error_str_lower = error_str.lower()
                            
                            # Log the full error and messages structure for debugging
                            logger.error(
                                f"API error for model {model_id} continuation (iteration {tool_call_iteration}): {error_str}"
                            )
                            
                            # Log tool call IDs that were sent
                            logger.error(
                                f"Tool call IDs that were sent in continuation request: {all_tc_ids_in_final_messages}"
                            )
                            
                            # Check if this is a duplicate ID error
                            if "duplicate" in error_str_lower or "rs_" in error_str:
                                logger.error(
                                    f"DUPLICATE ID ERROR DETECTED: Model {model_id} returned duplicate ID error. "
                                    f"Error: {error_str}. "
                                    f"Tool call IDs sent: {all_tc_ids_in_final_messages}. "
                                    f"This suggests duplicates are still reaching the API despite all our checks."
                                )
                            
                            # Log warning if we get a 404 with tools (model may not support tool calling)
                            if ("404" in error_str_lower or "not found" in error_str_lower) and tools:
                                logger.warning(
                                    f"Model {model_id} returned 404 when tools were included in continuation. "
                                    f"Error: {api_error}"
                                )
                            raise
                        
                        # Reset for continuation response (but keep all_tool_call_ids_ever_seen - never reset it)
                        tool_calls_accumulated = {}
                        tool_call_ids_seen = set()  # Reset ID tracking for continuation batch
                        # NOTE: all_tool_call_ids_ever_seen is NOT reset - it tracks IDs across all iterations
                        finish_reason = None
                        reasoning_details_continue = None  # Track reasoning details in continuation
                        
                        # Stream the continuation response
                        for chunk in response_continue:
                            last_chunk = chunk  # Store last chunk for usage data
                            if chunk.choices and len(chunk.choices) > 0:
                                delta = chunk.choices[0].delta
                                
                                # Capture reasoning_details from continuation response (for recursive tool calls)
                                if hasattr(delta, "reasoning_details") and delta.reasoning_details:
                                    reasoning_details_continue = delta.reasoning_details
                                elif hasattr(chunk.choices[0], "reasoning_details") and chunk.choices[0].reasoning_details:
                                    reasoning_details_continue = chunk.choices[0].reasoning_details
                                
                                # Handle tool calls in continuation (recursive)
                                if hasattr(delta, "tool_calls") and delta.tool_calls:
                                    for tool_call_delta in delta.tool_calls:
                                        idx = tool_call_delta.index
                                        
                                        # Get tool call ID if present
                                        tool_call_id_from_delta = ""
                                        if hasattr(tool_call_delta, "id") and tool_call_delta.id:
                                            tool_call_id_from_delta = tool_call_delta.id
                                        
                                        # Skip if this tool call ID was already seen anywhere (prevent duplicates)
                                        if tool_call_id_from_delta:
                                            if tool_call_id_from_delta in all_tool_call_ids_ever_seen:
                                                logger.warning(
                                                    f"Model {model_id} returned duplicate tool call ID '{tool_call_id_from_delta}' at index {idx} in continuation delta, skipping duplicate."
                                                )
                                                continue
                                            all_tool_call_ids_ever_seen.add(tool_call_id_from_delta)
                                        
                                        # Also check local set for this batch
                                        if tool_call_id_from_delta and tool_call_id_from_delta in tool_call_ids_seen:
                                            logger.warning(
                                                f"Model {model_id} returned duplicate tool call ID '{tool_call_id_from_delta}' at index {idx} in continuation delta (local duplicate), skipping."
                                            )
                                            continue
                                        
                                        if idx not in tool_calls_accumulated:
                                            tool_calls_accumulated[idx] = {
                                                "id": "",
                                                "type": "function",
                                                "function": {"name": "", "arguments": ""}
                                            }
                                        
                                        tc = tool_calls_accumulated[idx]
                                        
                                        if tool_call_id_from_delta:
                                            tc["id"] = tool_call_id_from_delta
                                            tool_call_ids_seen.add(tool_call_id_from_delta)
                                        
                                        if hasattr(tool_call_delta, "function"):
                                            if hasattr(tool_call_delta.function, "name") and tool_call_delta.function.name:
                                                tc["function"]["name"] = tool_call_delta.function.name
                                            if hasattr(tool_call_delta.function, "arguments") and tool_call_delta.function.arguments:
                                                tc["function"]["arguments"] += tool_call_delta.function.arguments
                                
                                # Yield content chunks
                                # Check delta.content first (standard streaming)
                                if hasattr(delta, "content") and delta.content:
                                    content_chunk = delta.content
                                    full_content += content_chunk
                                    yield content_chunk
                                
                                # Also check message.content in final chunk (some models like GPT-5 return content here)
                                # This handles cases where content is only in the final chunk's message object
                                if hasattr(chunk.choices[0], "message") and chunk.choices[0].message:
                                    message = chunk.choices[0].message
                                    if hasattr(message, "content") and message.content:
                                        # Only yield if we haven't already yielded this content via delta
                                        # Check if this is new content by comparing with what we've accumulated
                                        message_content = message.content
                                        if message_content and len(message_content) > len(full_content):
                                            # Extract only the new part that hasn't been yielded yet
                                            new_content = message_content[len(full_content):]
                                            if new_content:
                                                content_chunk = new_content
                                                full_content += content_chunk
                                                yield content_chunk
                                        elif message_content and not full_content:
                                            # If we haven't yielded any content yet, yield the entire message content
                                            # This handles cases where GPT-5 models return all content in the final chunk
                                            content_chunk = message_content
                                            full_content += content_chunk
                                            yield content_chunk
                                    
                                    # Also check message.tool_calls in final chunk (some models like GPT-5 Chat return tool_calls here)
                                    # This handles cases where tool_calls are only in the final chunk's message object
                                    if hasattr(message, "tool_calls") and message.tool_calls:
                                        for tool_call in message.tool_calls:
                                            idx = tool_call.index if hasattr(tool_call, "index") else len(tool_calls_accumulated)
                                            
                                            # Get tool call ID if present
                                            tool_call_id_from_message = ""
                                            if hasattr(tool_call, "id") and tool_call.id:
                                                tool_call_id_from_message = tool_call.id
                                            
                                            # Skip if this tool call ID was already seen anywhere (prevent duplicates)
                                            if tool_call_id_from_message:
                                                if tool_call_id_from_message in all_tool_call_ids_ever_seen:
                                                    logger.warning(
                                                        f"Model {model_id} returned duplicate tool call ID '{tool_call_id_from_message}' at index {idx} in continuation message.tool_calls, skipping duplicate."
                                                    )
                                                    continue
                                                all_tool_call_ids_ever_seen.add(tool_call_id_from_message)
                                            
                                            # Also check local set for this batch
                                            if tool_call_id_from_message and tool_call_id_from_message in tool_call_ids_seen:
                                                logger.warning(
                                                    f"Model {model_id} returned duplicate tool call ID '{tool_call_id_from_message}' at index {idx} in continuation message.tool_calls (local duplicate), skipping."
                                                )
                                                continue
                                            
                                            # Initialize tool call structure if needed
                                            if idx not in tool_calls_accumulated:
                                                tool_calls_accumulated[idx] = {
                                                    "id": "",
                                                    "type": "function",
                                                    "function": {"name": "", "arguments": ""}
                                                }
                                            
                                            tc = tool_calls_accumulated[idx]
                                            
                                            # Update tool call ID (prefer message tool_call ID as it's complete)
                                            if tool_call_id_from_message:
                                                tc["id"] = tool_call_id_from_message
                                                tool_call_ids_seen.add(tool_call_id_from_message)
                                            
                                            # Update function name and arguments (prefer message tool_call as it's complete)
                                            if hasattr(tool_call, "function"):
                                                if hasattr(tool_call.function, "name") and tool_call.function.name:
                                                    tc["function"]["name"] = tool_call.function.name
                                                if hasattr(tool_call.function, "arguments") and tool_call.function.arguments:
                                                    # For message tool_calls, arguments are complete, not incremental
                                                    tc["function"]["arguments"] = tool_call.function.arguments
                                
                                # Capture finish reason from last chunk
                                if chunk.choices[0].finish_reason:
                                    finish_reason = chunk.choices[0].finish_reason
                            
                            # Extract usage data from chunk if available
                            if hasattr(chunk, "usage") and chunk.usage:
                                usage = chunk.usage
                                prompt_tokens = getattr(usage, "prompt_tokens", 0)
                                completion_tokens = getattr(usage, "completion_tokens", 0)
                                if prompt_tokens > 0 or completion_tokens > 0:
                                    usage_data = calculate_token_usage(prompt_tokens, completion_tokens)
                        
                        # Update reasoning_details for next iteration (if we have recursive tool calls)
                        if reasoning_details_continue is not None:
                            reasoning_details = reasoning_details_continue
                        
                        # Break if no more tool calls needed
                        if finish_reason != "tool_calls" or not tool_calls_accumulated:
                            break
                
                # Extract usage data from last chunk if available (from continuation response)
                if last_chunk and hasattr(last_chunk, "usage") and last_chunk.usage:
                    usage = last_chunk.usage
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
                
                # Extract structured error information from OpenAI APIError
                status_code = None
                parsed_error_message = None
                
                if isinstance(e, APIError):
                    status_code = e.status_code
                    # Try to extract meaningful error message from response body
                    try:
                        if hasattr(e, 'body') and e.body:
                            import json
                            if isinstance(e.body, dict):
                                error_body = e.body
                            elif isinstance(e.body, str):
                                error_body = json.loads(e.body)
                            else:
                                error_body = {}
                            
                            # Extract error message from structured response
                            if 'error' in error_body:
                                error_obj = error_body['error']
                                if isinstance(error_obj, dict):
                                    parsed_error_message = error_obj.get('message', str(e))
                                    # Check metadata for additional context
                                    if 'metadata' in error_obj and isinstance(error_obj['metadata'], dict):
                                        raw_error = error_obj['metadata'].get('raw', '')
                                        if raw_error:
                                            if isinstance(raw_error, str):
                                                # Use raw error if it's a string
                                                parsed_error_message = raw_error
                                            elif isinstance(raw_error, dict):
                                                # If raw is a dict, try to extract a message from it
                                                raw_msg = raw_error.get('message') or raw_error.get('error') or str(raw_error)
                                                if raw_msg and isinstance(raw_msg, str):
                                                    parsed_error_message = raw_msg
                                    # If we still don't have a good message, use the error message
                                    if not parsed_error_message or parsed_error_message == str(e):
                                        parsed_error_message = error_obj.get('message', str(e))
                                else:
                                    parsed_error_message = str(error_obj)
                            else:
                                parsed_error_message = str(e)
                    except (json.JSONDecodeError, AttributeError, KeyError):
                        # Fall back to exception message if parsing fails
                        parsed_error_message = str(e)
                else:
                    parsed_error_message = str(e)
                
                # Use parsed message if available, otherwise use original
                if parsed_error_message:
                    error_message = parsed_error_message
                    error_str = parsed_error_message.lower()
                
                # Check for 402 error related to max_tokens (OpenRouter credit/token limit issue)
                is_402_max_tokens_error = (
                    status_code == 402 or
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
                
                # Handle specific HTTP status codes
                if status_code == 400:
                    # 400 Bad Request - always prioritize showing the actual parsed error message
                    # This gives users the most accurate information about what went wrong
                    if parsed_error_message and parsed_error_message != str(e):
                        # We have a parsed error message from the provider - use it (most informative)
                        clean_message = parsed_error_message[:200] if len(parsed_error_message) > 200 else parsed_error_message
                        yield f"Error: {clean_message}"
                    elif "provider returned error" in error_str:
                        # Generic provider error - show the actual error message if available
                        clean_message = error_message[:200] if len(error_message) > 200 else error_message
                        yield f"Error: {clean_message}"
                    else:
                        # Generic 400 error - show the actual error message
                        clean_message = error_message[:200] if len(error_message) > 200 else error_message
                        yield f"Error: Invalid request - {clean_message}"
                elif status_code == 401 or "unauthorized" in error_str or "401" in error_str:
                    yield f"Error: Authentication failed"
                elif status_code == 404 or "not found" in error_str or "404" in error_str:
                    yield f"Error: Model not available"
                elif status_code == 429 or "rate limit" in error_str or "429" in error_str:
                    yield f"Error: Rate limited"
                elif "timeout" in error_str:
                    yield f"Error: Timeout ({settings.individual_model_timeout}s)"
                elif is_402_max_tokens_error:
                    yield f"Error: This request requires more credits or fewer max_tokens. Please try with a shorter prompt or reduce the number of models."
                else:
                    # Generic error - use parsed message if available, limit length
                    clean_message = error_message[:200] if len(error_message) > 200 else error_message
                    yield f"Error: {clean_message}"
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
