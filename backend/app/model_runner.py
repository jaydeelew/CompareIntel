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
    # DeepSeek - Very affordable models (~$0.14-$0.55/M avg)
    "deepseek/deepseek-chat-v3.1",  # ~$0.27 input, $1.10 output = ~$0.69/M avg - borderline, keep in anon
    "deepseek/deepseek-v3.2-exp",  # Similar pricing
    # Meta - Free/open models (~$0.12-$0.30/M)
    "meta-llama/llama-3.3-70b-instruct:free",  # Free variant
    "meta-llama/llama-3.3-70b-instruct",  # ~$0.12 input, $0.30 output = ~$0.21/M avg
    # Microsoft - Efficient models (~$0.07-$0.14/M)
    "microsoft/phi-4",  # ~$0.07 input, $0.14 output = ~$0.11/M avg
    # Google - Flash models (~$0.15-$0.60/M)
    "google/gemini-2.5-flash",  # ~$0.15 input, $0.60 output = ~$0.38/M avg
    # xAI - Free variants
    "x-ai/grok-4.1-fast:free",  # Free variant,
    "google/gemini-2.0-flash",  # Auto-classified based on pricing
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
        "cohere/command-r7b-12-2024",
        "cohere/command-r-plus-08-2024",
        # Qwen - Efficient models (~$0.30-$2.00/M avg)
        "qwen/qwen3-coder-flash",
        "qwen/qwen3-30b-a3b-instruct-2507",
        "qwen/qwen3-next-80b-a3b-instruct",
        # xAI - Fast variants (~$0.50-$2.00/M avg)
        "x-ai/grok-code-fast-1",
        "x-ai/grok-4-fast",
        # Note: Premium models (Claude Opus, Sonnet 4.5, GPT-5.1, Gemini Pro, etc.)
        # require paid subscription (>= $3.00/M tokens)
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
            "id": "anthropic/claude-sonnet-4.5",
            "name": "Claude Sonnet 4.5",
            "description": 'Claude Sonnet 4.5 is Anthropic’s most advanced Sonnet model to date, optimized for real-world agents and coding workflows.',
            "category": "Language",
            "provider": "Anthropic",
        },
        {
            "id": "anthropic/claude-opus-4.5",
            "name": "Claude Opus 4.5",
            "description": 'Claude Opus 4.5 is Anthropic’s frontier reasoning model optimized for complex software engineering, agentic workflows, and long-horizon computer use.',
            "category": "Language",
            "provider": "Anthropic",
        },
        {
            "id": "anthropic/claude-opus-4.1",
            "name": "Claude Opus 4.1",
            "description": 'Claude Opus 4.1 is an updated version of Anthropic’s flagship model, offering improved performance in coding, reasoning, and agentic tasks.',
            "category": "Language/Code",
            "provider": "Anthropic",
        },
        {
            "id": "anthropic/claude-opus-4",
            "name": "Claude Opus 4",
            "description": 'Claude Opus 4 is benchmarked as the world’s best coding model, at time of release, bringing sustained performance on complex, long-running tasks and agent workflows.',
            "category": "Language",
            "provider": "Anthropic",
        },
        {
            "id": "anthropic/claude-haiku-4.5",
            "name": "Claude Haiku 4.5",
            "description": 'Claude Haiku 4.5 is Anthropic’s fastest and most efficient model, delivering near-frontier intelligence at a fraction of the cost and latency of larger Claude models.',
            "category": "Language",
            "provider": "Anthropic",
        },
        {
            "id": "anthropic/claude-sonnet-4",
            "name": "Claude 4 Sonnet",
            "description": 'Claude Sonnet 4 significantly enhances the capabilities of its predecessor, Sonnet 3.7, excelling in both coding and reasoning tasks with improved precision and controllability.',
            "category": "Language",
            "provider": "Anthropic",
        },
        {
            "id": "anthropic/claude-3.7-sonnet",
            "name": "Claude 3.7 Sonnet",
            "description": 'Claude 3.7 Sonnet is an advanced large language model with improved reasoning, coding, and problem-solving capabilities.',
            "category": "Language/Reasoning",
            "provider": "Anthropic",
        },
        {
            "id": "anthropic/claude-3.5-haiku",
            "name": "Claude 3.5 Haiku",
            "description": 'Claude 3.5 Haiku features offers enhanced capabilities in speed, coding accuracy, and tool use.',
            "category": "Language",
            "provider": "Anthropic",
        },
    ],
    "Cohere": [
        {
            "id": "cohere/command-r-plus-08-2024",
            "name": "Command R+",
            "description": "command-r-plus-08-2024 is an update of the Command R+ model with roughly 50% higher throughput and 25% lower latencies.",
            "category": "Language/Reasoning",
            "provider": "Cohere",
        },
        {
            "id": "cohere/command-r7b-12-2024",
            "name": "Command R7B",
            "description": "Command R7B (12-2024) is a small, fast update of the Command R+ model, delivered in December 2024.",
            "category": "Language",
            "provider": "Cohere",
        },
        {
            "id": "cohere/command-a",
            "name": "Command A",
            "description": "Command A is an open-weights 111B parameter model with a 256k context window focused on delivering great performance across agentic, multilingual, and coding use cases.",
            "category": "Language",
            "provider": "Cohere",
        },
    ],
    "DeepSeek": [
        {
            "id": "deepseek/deepseek-r1",
            "name": "DeepSeek R1",
            "description": "DeepSeek R1 is here: Performance on par with [OpenAI o1](/openai/o1), but open-sourced and with fully open reasoning tokens.",
            "category": "Reasoning",
            "provider": "DeepSeek",
        },
        {
            "id": "deepseek/deepseek-v3.2-exp",
            "name": "DeepSeek V3.2 Exp",
            "description": "DeepSeek-V3.2-Exp is an experimental large language model released by DeepSeek as an intermediate step between V3.1 and future architectures.",
            "category": "Language/Reasoning",
            "provider": "DeepSeek",
        },
        {
            "id": "deepseek/deepseek-chat-v3.1",
            "name": "DeepSeek Chat V3.1",
            "description": "DeepSeek-V3.1 is a large hybrid reasoning model (671B parameters, 37B active) that supports both thinking and non-thinking modes via prompt templates.",
            "category": "Language/Reasoning",
            "provider": "DeepSeek",
        },
    ],
    "Google": [
        {
            "id": "google/gemini-3-pro-preview",
            "name": "Gemini 3 Pro Preview",
            "description": 'Gemini 3 Pro is Google’s flagship frontier model for high-precision multimodal reasoning, combining strong performance across text, image, video, audio, and code with a 1M-token context window.',
            "category": "Language",
            "provider": "Google",
        },
        {
            "id": "google/gemini-2.5-pro",
            "name": "Gemini 2.5 Pro",
            "description": 'Gemini 2.5 Pro is Google’s state-of-the-art AI model designed for advanced reasoning, coding, mathematics, and scientific tasks.',
            "category": "Language",
            "provider": "Google",
        },
        {
            "id": "google/gemini-2.5-flash",
            "name": "Gemini 2.5 Flash",
            "description": "Gemini 2.5 Flash is Google's state-of-the-art workhorse model, specifically designed for advanced reasoning, coding, mathematics, and scientific tasks.",
            "category": "Language",
            "provider": "Google",
        },
        {
            "id": "google/gemini-2.0-flash",
            "name": "Gemini 2.0 Flash",
            "description": 'Gemini Flash 2.0 offers a significantly faster time to first token (TTFT) compared to Gemini Flash 1.5, while maintaining quality on par with larger models like Gemini Pro 1.5.',
            "category": "Language",
            "provider": "Google",
        },
    ],
    "Meta": [
        {
            "id": "meta-llama/llama-4-maverick",
            "name": "Llama 4 Maverick",
            "description": "Llama 4 Maverick 17B Instruct (128E) is a high-capacity multimodal language model from Meta, built on a mixture-of-experts (MoE) architecture with 128 experts and 17 billion active parameters per forward pass (400B total).",
            "category": "Multimodal",
            "provider": "Meta",
        },
        {
            "id": "meta-llama/llama-4-scout",
            "name": "Llama 4 Scout",
            "description": "Llama 4 Scout 17B Instruct (16E) is a mixture-of-experts (MoE) language model developed by Meta, activating 17 billion parameters out of a total of 109B.",
            "category": "Multimodal",
            "provider": "Meta",
        },
        {
            "id": "meta-llama/llama-3.3-70b-instruct",
            "name": "Llama 3.3 70B Instruct",
            "description": "The Meta Llama 3.3 multilingual large language model (LLM) is a pretrained and instruction tuned generative model in 70B (text in/text out).",
            "category": "Code/Language",
            "provider": "Meta",
        },
        {
            "id": "meta-llama/llama-3.3-70b-instruct:free",
            "name": "Llama 3.3 70B Instruct (Free)",
            "description": "The Meta Llama 3.3 multilingual large language model (LLM) is a pretrained and instruction tuned generative model in 70B (text in/text out).",
            "category": "Code/Language",
            "provider": "Meta",
        },
    ],
    "Microsoft": [
        {
            "id": "microsoft/wizardlm-2-8x22b",
            "name": "WizardLM-2 8x22B",
            "description": "WizardLM-2 8x22B is Microsoft AI's most advanced Wizard model.",
            "category": "Language/Reasoning",
            "provider": "Microsoft",
        },
        {
            "id": "microsoft/phi-4-reasoning-plus",
            "name": "Phi 4 Reasoning Plus",
            "description": "Phi-4-reasoning-plus is an enhanced 14B parameter model from Microsoft, fine-tuned from Phi-4 with additional reinforcement learning to boost accuracy on math, science, and code reasoning tasks.",
            "category": "Reasoning",
            "provider": "Microsoft",
        },
        {
            "id": "microsoft/phi-4",
            "name": "Phi 4",
            "description": "[Microsoft Research](/microsoft) Phi-4 is designed to perform well in complex reasoning tasks and can operate efficiently in situations with limited memory or where quick responses are needed.",
            "category": "Language/Reasoning",
            "provider": "Microsoft",
        },
    ],
    "Mistral": [
        {
            "id": "mistralai/mistral-large",
            "name": "Mistral Large",
            "description": "This is Mistral AI's flagship model, Mistral Large 2 (version `mistral-large-2407`).",
            "category": "Language/Reasoning",
            "provider": "Mistral",
        },
        {
            "id": "mistralai/mistral-medium-3.1",
            "name": "Mistral Medium 3.1",
            "description": "Mistral Medium 3.1 is an updated version of Mistral Medium 3, which is a high-performance enterprise-grade language model designed to deliver frontier-level capabilities at significantly reduced operational cost.",
            "category": "Language",
            "provider": "Mistral",
        },
        {
            "id": "mistralai/mistral-small-3.2-24b-instruct",
            "name": "Mistral Small 3.2 24B",
            "description": "Mistral-Small-3.2-24B-Instruct-2506 is an updated 24B parameter model from Mistral optimized for instruction following, repetition reduction, and improved function calling.",
            "category": "Multimodal",
            "provider": "Mistral",
        },
        {
            "id": "mistralai/devstral-medium",
            "name": "Devstral Medium",
            "description": "Devstral Medium is a high-performance code generation and agentic reasoning model developed jointly by Mistral AI and All Hands AI.",
            "category": "Code",
            "provider": "Mistral",
        },
        {
            "id": "mistralai/devstral-small",
            "name": "Devstral Small",
            "description": "Devstral Small 1.1 is a 24B parameter open-weight language model for software engineering agents, developed by Mistral AI in collaboration with All Hands AI.",
            "category": "Code",
            "provider": "Mistral",
        },
        {
            "id": "mistralai/codestral-2508",
            "name": "Codestral 2508",
            "description": "Mistral's cutting-edge language model for coding released end of July 2025.",
            "category": "Code",
            "provider": "Mistral",
        },
    ],
    "OpenAI": [
        {
            "id": "openai/gpt-5.1",
            "name": "GPT-5.1",
            "description": "GPT-5.1 is the latest frontier-grade model in the GPT-5 series, offering stronger general-purpose reasoning, improved instruction adherence, and a more natural conversational style compared to GPT-5.",
            "category": "Language",
            "provider": "OpenAI",
        },
        {
            "id": "openai/gpt-5.1-chat",
            "name": "GPT-5.1 Chat",
            "description": "GPT-5.1 Chat (AKA Instant is the fast, lightweight member of the 5.1 family, optimized for low-latency chat while retaining strong general intelligence.",
            "category": "Language",
            "provider": "OpenAI",
        },
        {
            "id": "openai/gpt-5.1-codex",
            "name": "GPT-5.1-Codex",
            "description": "GPT-5.1-Codex is a specialized version of GPT-5.1 optimized for software engineering and coding workflows.",
            "category": "Code",
            "provider": "OpenAI",
        },
        {
            "id": "openai/gpt-5.1-codex-mini",
            "name": "GPT-5.1-Codex-Mini",
            "description": "GPT-5.1-Codex-Mini is a smaller and faster version of GPT-5.1-Codex",
            "category": "Code",
            "provider": "OpenAI",
        },
        {
            "id": "openai/gpt-5",
            "name": "GPT-5",
            "description": "GPT-5 is OpenAI’s most advanced model, offering major improvements in reasoning, code quality, and user experience.",
            "category": "Language",
            "provider": "OpenAI",
        },
        {
            "id": "openai/gpt-5-mini",
            "name": "GPT-5 Mini",
            "description": "GPT-5 Mini is a compact version of GPT-5, designed to handle lighter-weight reasoning tasks.",
            "category": "Language",
            "provider": "OpenAI",
        },
        {
            "id": "openai/gpt-5-nano",
            "name": "GPT-5 Nano",
            "description": "GPT-5-Nano is the smallest and fastest variant in the GPT-5 system, optimized for developer tools, rapid interactions, and ultra-low latency environments.",
            "category": "Language",
            "provider": "OpenAI",
        },
        {
            "id": "openai/gpt-5-codex",
            "name": "GPT-5 Codex",
            "description": "GPT-5-Codex is a specialized version of GPT-5 optimized for software engineering and coding workflows.",
            "category": "Code",
            "provider": "OpenAI",
        },
        {
            "id": "openai/gpt-5-chat",
            "name": "GPT-5 Chat",
            "description": "GPT-5 Chat is designed for advanced, natural, multimodal, and context-aware conversations for enterprise applications.",
            "category": "Language",
            "provider": "OpenAI",
        },
        {
            "id": "openai/gpt-4o",
            "name": "GPT-4o",
            "description": 'GPT-4o ("o" for "omni") is OpenAI\'s latest AI model, supporting both text and image inputs with text outputs.',
            "category": "Language",
            "provider": "OpenAI",
        },
        {
            "id": "openai/o3",
            "name": "o3",
            "description": "o3 is a well-rounded and powerful model across domains.",
            "category": "Reasoning",
            "provider": "OpenAI",
        },
        {
            "id": "openai/o3-mini",
            "name": "o3 Mini",
            "description": "OpenAI o3-mini is a cost-efficient language model optimized for STEM reasoning tasks, particularly excelling in science, mathematics, and coding.",
            "category": "Reasoning",
            "provider": "OpenAI",
        },
    ],
    "Qwen": [
        {
            "id": "qwen/qwen3-vl-235b-a22b-thinking",
            "name": "Qwen3 VL 235B A22B Thinking",
            "description": "Qwen3-VL-235B-A22B Thinking is a multimodal model that unifies strong text generation with visual understanding across images and video.",
            "category": "Multimodal/Reasoning",
            "provider": "Qwen",
        },
        {
            "id": "qwen/qwen3-next-80b-a3b-thinking",
            "name": "Qwen3 Next 80B A3B Thinking",
            "description": "Qwen3-Next-80B-A3B-Thinking is a reasoning-first chat model in the Qwen3-Next line that outputs structured “thinking” traces by default.",
            "category": "Language/Reasoning",
            "provider": "Qwen",
        },
        {
            "id": "qwen/qwen3-next-80b-a3b-instruct",
            "name": "Qwen3 Next 80B A3B Instruct",
            "description": "Qwen3-Next-80B-A3B-Instruct is an instruction-tuned chat model in the Qwen3-Next series optimized for fast, stable responses without “thinking” traces.",
            "category": "Language",
            "provider": "Qwen",
        },
        {
            "id": "qwen/qwen3-max",
            "name": "Qwen3 Max",
            "description": "Qwen3-Max is an updated release built on the Qwen3 series, offering major improvements in reasoning, instruction following, multilingual support, and long-tail knowledge coverage compared to the January 2025 version.",
            "category": "Language",
            "provider": "Qwen",
        },
        {
            "id": "qwen/qwen3-coder-plus",
            "name": "Qwen3 Coder Plus",
            "description": "Qwen3 Coder Plus is Alibaba's proprietary version of the Open Source Qwen3 Coder 480B A35B.",
            "category": "Code",
            "provider": "Qwen",
        },
        {
            "id": "qwen/qwen3-coder-flash",
            "name": "Qwen3 Coder Flash",
            "description": "Qwen3 Coder Flash is Alibaba's fast and cost efficient version of their proprietary Qwen3 Coder Plus.",
            "category": "Code",
            "provider": "Qwen",
        },
        {
            "id": "qwen/qwen3-coder",
            "name": "Qwen3 Coder 480B A35B",
            "description": "Qwen3-Coder-480B-A35B-Instruct is a Mixture-of-Experts (MoE) code generation model developed by the Qwen team.",
            "category": "Code",
            "provider": "Qwen",
        },
        {
            "id": "qwen/qwen3-30b-a3b-instruct-2507",
            "name": "Qwen3 30B A3B Instruct 2507",
            "description": "Qwen3-30B-A3B-Instruct-2507 is a 30.5B-parameter mixture-of-experts language model from Qwen, with 3.3B active parameters per inference.",
            "category": "Language",
            "provider": "Qwen",
        },
        {
            "id": "qwen/qwen3-235b-a22b",
            "name": "Qwen3 235B A22B",
            "description": "Qwen3-235B-A22B is a 235B parameter mixture-of-experts (MoE) model developed by Qwen, activating 22B parameters per forward pass.",
            "category": "Language",
            "provider": "Qwen",
        },
    ],
    "xAI": [
        {
            "id": "x-ai/grok-code-fast-1",
            "name": "Grok Code Fast 1",
            "description": "Grok Code Fast 1 is a speedy and economical reasoning model that excels at agentic coding.",
            "category": "Language",
            "provider": "xAI",
        },
        {
            "id": "x-ai/grok-5",
            "name": "Grok 5 (Coming Soon)",
            "description": "xAI's upcoming Grok 5 model expected by end of 2025. This model is not yet available for selection.",
            "category": "Language",
            "provider": "xAI",
            "available": False,
        },
        {
            "id": "x-ai/grok-4.1-fast:free",
            "name": "Grok 4.1 Fast:Free",
            "description": "Grok 4.1 Fast is xAI's best agentic tool calling model that shines in real-world use cases like customer support and deep research.",
            "category": "Language",
            "provider": "xAI",
        },
        {
            "id": "x-ai/grok-4-fast",
            "name": "Grok 4 Fast",
            "description": "Grok 4 Fast is xAI's latest multimodal model with SOTA cost-efficiency and a 2M token context window.",
            "category": "Language",
            "provider": "xAI",
        },
        {
            "id": "x-ai/grok-4",
            "name": "Grok 4",
            "description": "Grok 4 is xAI's latest reasoning model with a 256k context window.",
            "category": "Language",
            "provider": "xAI",
        },
    ],

    "Minimax": [
        {
            "id": "minimax/minimax-m2",
            "name": "Minimax M2",
            "description": 'MiniMax-M2 is a compact, high-efficiency large language model optimized for end-to-end coding and agentic workflows.',
            "category": "Language",
            "provider": "Minimax",
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
        return limits.get("max_output", 8192)

    # Fallback: Model-specific token limits for exceptions (manual overrides)
    model_limits = {
        # Add any models with non-standard limits here if OpenRouter data is unavailable
        # Example: "some-provider/model-id": 4096,
    }

    # Return model-specific limit or default to 8192
    return model_limits.get(model_id, 8192)


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

    try:
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
        # Yield error messages in the stream
        if "timeout" in error_str:
            yield f"Error: Timeout ({settings.individual_model_timeout}s)"
        elif "rate limit" in error_str or "429" in error_str:
            yield f"Error: Rate limited"
        elif "not found" in error_str or "404" in error_str:
            yield f"Error: Model not available"
        elif "unauthorized" in error_str or "401" in error_str:
            yield f"Error: Authentication failed"
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
