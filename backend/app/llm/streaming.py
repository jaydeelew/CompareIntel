"""
OpenRouter streaming API calls, web search tools, URL fetching.
"""

import asyncio
import json
import logging
import queue
import re
import threading
import time
from collections.abc import Generator
from datetime import datetime
from typing import Any

import httpx  # type: ignore[import-untyped]
from bs4 import BeautifulSoup  # type: ignore[import-untyped]
from openai import APIError

from ..config import settings
from ..mock_responses import stream_mock_response
from ..search.rate_limiter import get_rate_limiter

from .registry import client, client_with_tool_headers
from .text_processing import clean_model_response, detect_repetition
from .tokens import TokenUsage, calculate_token_usage, get_model_max_tokens

logger = logging.getLogger(__name__)


def is_time_sensitive_query(prompt: str) -> bool:
    """Return True if the query appears time-sensitive and may need web search."""
    prompt_lower = prompt.lower()
    time_sensitive_keywords = [
        "today", "now", "current", "latest", "recent", "live", "right now",
        "what is", "what's", "how is", "how's", "weather", "temperature",
        "news", "score", "price", "stock", "forecast", "prediction",
        "happening", "going on", "update", "status", "condition",
    ]
    has_time_keyword = any(keyword in prompt_lower for keyword in time_sensitive_keywords)
    time_sensitive_patterns = [
        r"\bweather\b.*\btoday\b", r"\bcurrent\b.*\bweather\b", r"\bwhat.*\bweather\b",
        r"\bhow.*\bweather\b", r"\bweather.*\blike\b", r"\bnews\b.*\btoday\b",
        r"\bcurrent\b.*\bnews\b", r"\blatest\b.*\bnews\b", r"\bstock\b.*\bprice\b",
        r"\bcurrent\b.*\bprice\b", r"\bscore\b.*\btoday\b", r"\blive\b.*\bscore\b",
    ]
    has_time_pattern = any(re.search(p, prompt_lower) for p in time_sensitive_patterns)
    return has_time_keyword or has_time_pattern


WEB_SEARCH_TOOL = {
    "type": "function",
    "function": {
        "name": "search_web",
        "description": "MANDATORY: Search the Internet for current, real-time information. You MUST use this tool for questions about current weather, recent news, current events, live data, stock prices, sports scores, or any time-sensitive information. Never guess or fabricate current information - always search first. After receiving results, you MUST cite the source URL/service name and timestamp in your response. If search fails or returns no results, explicitly state this rather than providing generic information.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "The search query to find current information on the Internet."}
            },
            "required": ["query"],
        },
    },
}

FETCH_URL_TOOL = {
    "type": "function",
    "function": {
        "name": "fetch_url",
        "description": "Fetch the actual content from a webpage URL to get detailed, accurate information. Use this after search results if you need more details from a specific source. After receiving the content, provide a complete answer to the user's question.",
        "parameters": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "The full URL of the webpage to fetch content from (must start with http:// or https://)"}
            },
            "required": ["url"],
        },
    },
}


async def fetch_url_content(url: str, max_length: int = 10000) -> str:
    """Fetch and extract text content from a webpage URL."""
    try:
        if not url.startswith(("http://", "https://")):
            raise ValueError(f"Invalid URL format: {url}. URL must start with http:// or https://")
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as http_client:
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
            }
            response = await http_client.get(url, headers=headers)
            response.raise_for_status()
            soup = BeautifulSoup(response.text, "html.parser")
            for script in soup(["script", "style", "nav", "header", "footer", "aside"]):
                script.decompose()
            text = soup.get_text(separator=" ", strip=True)
            text = re.sub(r"\s+", " ", text)
            if len(text) > max_length:
                text = text[:max_length] + "... [content truncated]"
            return text.strip()
    except httpx.HTTPStatusError as e:
        raise Exception(f"HTTP error {e.response.status_code} when fetching URL: {str(e)}")
    except httpx.RequestError as e:
        raise Exception(f"Network error when fetching URL: {str(e)}")
    except Exception as e:
        raise Exception(f"Error fetching URL content: {str(e)}")


def call_openrouter_streaming(
    prompt: str,
    model_id: str,
    conversation_history: list[Any] | None = None,
    use_mock: bool = False,
    max_tokens_override: int | None = None,
    credits_limited: bool = False,
    enable_web_search: bool = False,
    search_provider: Any | None = None,  # SearchProvider instance
    user_timezone: str | None = None,  # Optional: IANA timezone string (e.g., "America/Chicago")
    user_location: str | None = None,  # Optional: Location string (e.g., "New York, NY, USA")
    location_source: str
    | None = None,  # Optional: Source of location - "user_provided" (accurate) or "ip_based" (approximate)
    _client: Any | None = None,  # Optional: use this OpenAI client instead of global (avoids connection contention in multi-model)
) -> Generator[Any, None, TokenUsage | None]:
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
        user_timezone: Optional IANA timezone string (e.g., "America/Chicago") for context
        user_location: Optional location string (e.g., "New York, NY, USA") for context
        location_source: Optional source of location - "user_provided" (accurate) or "ip_based" (approximate)

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

    messages = []

    # Debug logging for location/timezone
    logger.debug(
        f"[Model Runner] call_openrouter_streaming called with: user_timezone={user_timezone}, user_location={user_location}, location_source={location_source}, has_history={bool(conversation_history)}"
    )

    # Add a minimal system message only to encourage complete thoughts
    if not conversation_history:
        system_content = "Provide complete responses. Finish your thoughts and explanations fully."
        system_content += "\n\nAnswer questions directly without asking clarifying questions. If you need to make reasonable assumptions about context or details not specified, make those assumptions based on common practices and state them clearly in your response. Only ask follow-up questions if the request is fundamentally unclear or missing critical information that prevents any meaningful response."

        # Add timezone context if available
        if user_timezone:
            system_content += f"\n\nUser timezone: {user_timezone}. When providing time-sensitive information or referring to times, use this timezone as context."

        # Add location context if available
        if user_location:
            logger.debug(
                f"[Model Runner] Adding location to system message: user_location={user_location}, location_source={location_source}"
            )
            if location_source and location_source == "ip_based":
                # IP-based location is approximate - let model know
                system_content += f"\n\nUser approximate location (based on IP): {user_location}. Note: IP-based location may be inaccurate (e.g., VPN, carrier routing, corporate networks). When providing location-specific information (weather, local events, etc.), use this as approximate context, but acknowledge uncertainty if asked directly about location."
            else:
                # User-provided location is accurate (browser geolocation or manual entry)
                system_content += f"\n\nUser location: {user_location}. When providing location-specific information (weather, local events, time zones, regional details, etc.), use this location as context. If asked about your location, you can share this information."

        # If web search is enabled, include current date/time context so models know what "today" means
        if enable_web_search:
            current_datetime = datetime.now()
            current_date_str = current_datetime.strftime("%A, %B %d, %Y")
            current_time_str = current_datetime.strftime("%I:%M %p %Z")
            system_content += f"\n\nCurrent date and time: {current_date_str} at {current_time_str}. When referring to 'today' or 'now', use this date and time."
            system_content += "\n\nYou have access to web search tools. For questions about current information (weather, news, events, prices, scores, etc.), use the search_web tool. If search results need more detail, use fetch_url to get full webpage content.\n\nIMPORTANT RULES:\n1. Use search_web for any time-sensitive questions. Do not guess or make up current information.\n2. After getting search results or webpage content, ALWAYS provide a complete answer. Never stop mid-response.\n3. Keep your response natural and user-friendly. Don't mention technical details about how you searched."

        messages.append(
            {
                "role": "system",
                "content": system_content,
            }
        )
    else:
        # For follow-up conversations, still include location/timezone context
        # This ensures models have access to this information even in follow-up messages
        if user_timezone or user_location:
            system_content_parts = []
            if user_timezone:
                system_content_parts.append(f"User timezone: {user_timezone}")
            if user_location:
                if location_source and location_source == "ip_based":
                    system_content_parts.append(
                        f"User approximate location (IP-based, may be inaccurate): {user_location}"
                    )
                else:
                    system_content_parts.append(
                        f"User location: {user_location}. If asked about your location, you can share this information."
                    )

            if system_content_parts:
                system_content = (
                    ". ".join(system_content_parts)
                    + ". Use this information when providing location or time-sensitive context."
                )
                logger.debug(
                    f"[Model Runner] Adding system message for follow-up with location: user_location={user_location}, location_source={location_source}"
                )
                messages.append(
                    {
                        "role": "system",
                        "content": system_content,
                    }
                )

    if conversation_history:
        for msg in conversation_history:
            messages.append({"role": msg.role, "content": msg.content})

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
                "frequency_penalty": 0.7,  # Reduce token repetition (0.0-2.0, higher = less repetition)
                "presence_penalty": 0.5,  # Reduce topic/concept repetition (0.0-2.0, higher = less repetition)
            }

            # Add tools if web search is enabled
            if tools:
                api_params["tools"] = tools
                # Some models (like GPT-5 Chat) may not support tool_choice parameter
                # However, Mistral models (including Devstral) require tool_choice to actually use tools
                # Enable tool_choice for Mistral models, but omit for models that don't support it
                if model_id.startswith("mistralai/"):
                    api_params["tool_choice"] = "auto"
                # For other models, omit tool_choice to avoid 404 errors (they'll use tools automatically if supported)

            # Enable streaming
            # Use client with tool headers when tools are enabled (required by OpenRouter for provider routing)
            # OpenRouter needs HTTP-Referer and X-Title headers to route to providers that support tool calling
            _cl = _client if _client is not None else client
            _cl_tools = _client if _client is not None else client_with_tool_headers
            try:
                if tools:
                    # Try using extra_headers parameter first (if supported by SDK)
                    # Fall back to _cl_tools if extra_headers doesn't work
                    try:
                        response = _cl.chat.completions.create(
                            **api_params,
                            extra_headers={
                                "HTTP-Referer": "https://compareintel.com",
                                "X-Title": "CompareIntel",
                            },
                        )
                    except TypeError:
                        # extra_headers not supported, use client with default headers
                        response = _cl_tools.chat.completions.create(**api_params)
                else:
                    response = _cl.chat.completions.create(**api_params)
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
            all_tool_call_ids_ever_seen = (
                set()
            )  # Track ALL tool call IDs across entire conversation (never reset)
            reasoning_details = None  # Capture reasoning details for Gemini models

            # Iterate through chunks as they arrive
            for chunk in response:
                if chunk.choices and len(chunk.choices) > 0:
                    delta = chunk.choices[0].delta

                    # Capture reasoning_details if present (required for Gemini models)
                    # Reasoning details may be in delta or in the chunk itself
                    if hasattr(delta, "reasoning_details") and delta.reasoning_details:
                        reasoning_details = delta.reasoning_details
                    elif (
                        hasattr(chunk.choices[0], "reasoning_details")
                        and chunk.choices[0].reasoning_details
                    ):
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
                            if (
                                tool_call_id_from_delta
                                and tool_call_id_from_delta in tool_call_ids_seen
                            ):
                                logger.warning(
                                    f"Model {model_id} returned duplicate tool call ID '{tool_call_id_from_delta}' at index {idx} in streaming delta (local duplicate), skipping."
                                )
                                continue

                            # Initialize tool call structure if needed
                            if idx not in tool_calls_accumulated:
                                tool_calls_accumulated[idx] = {
                                    "id": "",
                                    "type": "function",
                                    "function": {"name": "", "arguments": ""},
                                }

                            tc = tool_calls_accumulated[idx]

                            # Update tool call ID
                            if tool_call_id_from_delta:
                                tc["id"] = tool_call_id_from_delta
                                tool_call_ids_seen.add(tool_call_id_from_delta)

                            # Update function name and arguments
                            if hasattr(tool_call_delta, "function"):
                                if (
                                    hasattr(tool_call_delta.function, "name")
                                    and tool_call_delta.function.name
                                ):
                                    tc["function"]["name"] = tool_call_delta.function.name
                                if (
                                    hasattr(tool_call_delta.function, "arguments")
                                    and tool_call_delta.function.arguments
                                ):
                                    tc["function"]["arguments"] += (
                                        tool_call_delta.function.arguments
                                    )

                    # Yield content chunks as they arrive
                    # Check delta.content first (standard streaming)
                    if hasattr(delta, "content") and delta.content:
                        content_chunk = delta.content
                        full_content += content_chunk

                        # Check for repetition in streaming content
                        # Only check if we have enough content (avoid false positives early)
                        if len(full_content) > 500:
                            if detect_repetition(full_content):
                                logger.warning(
                                    f"Model {model_id} detected repetition in streaming response. "
                                    f"Stopping stream early to prevent looping."
                                )
                                yield "\n\n⚠️ Response stopped - detected repetitive content."
                                repetition_detected = True  # Mark that repetition was detected
                                finish_reason = (
                                    "length"  # Mark as length-limited to prevent further processing
                                )
                                break

                        yield content_chunk

                    # Also check message.content in final chunk (some models like GPT-5 return content here)
                    # This handles cases where content is only in the final chunk's message object
                    if hasattr(chunk.choices[0], "message") and chunk.choices[0].message:
                        message = chunk.choices[0].message
                        if hasattr(message, "content") and message.content:
                            message_content = message.content
                            if message_content and len(message_content) > len(full_content):
                                # Extract only the new part that hasn't been yielded yet
                                new_content = message_content[len(full_content) :]
                                if new_content:
                                    content_chunk = new_content
                                    full_content += content_chunk

                                    # Check for repetition
                                    if len(full_content) > 500:
                                        if detect_repetition(full_content):
                                            logger.warning(
                                                f"Model {model_id} detected repetition in streaming response. "
                                                f"Stopping stream early to prevent looping."
                                            )
                                            yield "\n\n⚠️ Response stopped - detected repetitive content."
                                            finish_reason = "length"
                                            break

                                    yield content_chunk
                            elif message_content and not full_content:
                                # If we haven't yielded any content yet, yield the entire message content
                                # This handles cases where GPT-5 models return all content in the final chunk
                                content_chunk = message_content
                                full_content += content_chunk

                                # Check for repetition
                                if len(full_content) > 500:
                                    if detect_repetition(full_content):
                                        logger.warning(
                                            f"Model {model_id} detected repetition in streaming response. "
                                            f"Stopping stream early to prevent looping."
                                        )
                                        yield "\n\n⚠️ Response stopped - detected repetitive content."
                                        repetition_detected = (
                                            True  # Mark that repetition was detected
                                        )
                                        finish_reason = "length"
                                        break

                                yield content_chunk

                        # Also check message.tool_calls in final chunk (some models like GPT-5 Chat return tool_calls here)
                        # This handles cases where tool_calls are only in the final chunk's message object
                        if hasattr(message, "tool_calls") and message.tool_calls:
                            for tool_call in message.tool_calls:
                                idx = (
                                    tool_call.index
                                    if hasattr(tool_call, "index")
                                    else len(tool_calls_accumulated)
                                )

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
                                if (
                                    tool_call_id_from_message
                                    and tool_call_id_from_message in tool_call_ids_seen
                                ):
                                    logger.warning(
                                        f"Model {model_id} returned duplicate tool call ID '{tool_call_id_from_message}' at index {idx} in message.tool_calls (local duplicate), skipping."
                                    )
                                    continue

                                # Initialize tool call structure if needed
                                if idx not in tool_calls_accumulated:
                                    tool_calls_accumulated[idx] = {
                                        "id": "",
                                        "type": "function",
                                        "function": {"name": "", "arguments": ""},
                                    }

                                tc = tool_calls_accumulated[idx]

                                # Update tool call ID (prefer message tool_call ID as it's complete)
                                if tool_call_id_from_message:
                                    tc["id"] = tool_call_id_from_message
                                    tool_call_ids_seen.add(tool_call_id_from_message)

                                # Update function name and arguments (prefer message tool_call as it's complete)
                                if hasattr(tool_call, "function"):
                                    if (
                                        hasattr(tool_call.function, "name")
                                        and tool_call.function.name
                                    ):
                                        tc["function"]["name"] = tool_call.function.name
                                    if (
                                        hasattr(tool_call.function, "arguments")
                                        and tool_call.function.arguments
                                    ):
                                        # For message tool_calls, arguments are complete, not incremental
                                        tc["function"]["arguments"] = tool_call.function.arguments

                    # Capture finish reason from last chunk
                    if chunk.choices[0].finish_reason:
                        finish_reason = chunk.choices[0].finish_reason

                        # Also check the choice object itself for reasoning_details (may be in final chunk)
                        if (
                            hasattr(chunk.choices[0], "reasoning_details")
                            and chunk.choices[0].reasoning_details
                        ):
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

            # Handle tool calls after streaming completes.
            # Some models (e.g. Gemini 2.0 Flash) make aggressive tool calls that can exhaust
            # search API rate limits when models run in parallel; the rate limiter coordinates requests.
            max_tool_call_iterations = (
                4  # Prevent infinite loops - allows more iterations for complex queries
            )
            tool_call_iteration = 0
            total_tool_calls_made = 0  # Track total tool calls across all iterations
            max_total_tool_calls = 10  # Hard limit on total tool calls to prevent excessive looping
            last_chunk = None

            # Get rate limiter for coordinating search requests across models
            # This prevents API rate limit exhaustion when multiple models make concurrent searches
            rate_limiter = get_rate_limiter()

            while (
                finish_reason == "tool_calls"
                and tool_calls_accumulated
                and search_provider
                and tool_call_iteration < max_tool_call_iterations
            ):
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

                # Deduplicate tool_calls_accumulated by ID; we only process each unique ID once.
                # all_tool_call_ids_ever_seen is not checked here because IDs are added during accumulation.
                deduplicated_tool_calls = {}
                seen_ids_in_dedup = (
                    set()
                )  # Track IDs we've added to deduplicated_tool_calls in this pass
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
                    already_in_messages = any(
                        tc.get("id", "").strip() == tool_call_id
                        for tc in tool_call_messages
                        if tc.get("id")
                    )
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
                        # Initialize search_query before try block to ensure it's always defined
                        # even if an exception occurs during JSON parsing
                        search_query = ""
                        try:
                            import json

                            # Validate arguments exist and are not empty
                            arguments_str = tool_call["function"].get("arguments", "")
                            if not arguments_str or not arguments_str.strip():
                                raise ValueError(
                                    "Tool call arguments are missing or empty. Please provide a 'query' parameter in the arguments."
                                )
                            # Parse arguments
                            args = json.loads(arguments_str)
                            search_query = args.get("query", "")
                            if not search_query:
                                raise ValueError(
                                    "Search query is missing or empty. Please provide a 'query' parameter with a valid search term."
                                )

                            # Check if this is a redundant search (same query as before)
                            # This helps prevent infinite loops where model keeps searching for the same thing
                            previous_searches = []
                            for msg in messages:
                                if msg.get("role") == "assistant" and msg.get("tool_calls"):
                                    for tc in msg["tool_calls"]:
                                        if tc.get("function", {}).get("name") == "search_web":
                                            try:
                                                prev_args = json.loads(
                                                    tc.get("function", {}).get("arguments", "{}")
                                                )
                                                prev_query = prev_args.get("query", "")
                                                if prev_query:
                                                    previous_searches.append(
                                                        prev_query.lower().strip()
                                                    )
                                            except:
                                                pass

                            if search_query and search_query.lower().strip() in previous_searches:
                                logger.warning(
                                    f"Model {model_id} attempted redundant search with query '{search_query}' "
                                    f"(already searched in previous iteration). Providing message instead of re-executing."
                                )
                                # Provide a message indicating the search was already done
                                tool_call_messages.append(
                                    {
                                        "id": tool_call_id,
                                        "type": "function",
                                        "function": {
                                            "name": "search_web",
                                            "arguments": tool_call["function"]["arguments"],
                                        },
                                    }
                                )
                                tool_results.append(
                                    {
                                        "tool_call_id": tool_call_id,
                                        "content": f"⚠️ This search query ('{search_query}') was already executed in a previous step. Please review the search results you already received and provide your answer based on that information. Making the same search again will not provide new information.",
                                    }
                                )
                                continue

                            if search_query:
                                # Yield keepalive chunk before websearch to reset frontend timeout
                                # This prevents timeout during websearch execution which can take several seconds
                                yield " "

                                # Execute search with rate limiting and periodic keepalives
                                # Since we're in a thread pool (no event loop), create a new event loop
                                # and properly clean it up to avoid semaphore leaks
                                import asyncio
                                import queue

                                logger.info(
                                    f"Executing web search for query: {search_query} (model: {model_id}, iteration: {tool_call_iteration})"
                                )

                                async def execute_search_with_rate_limit():
                                    """Execute search with rate limiting, caching, and circuit breaker."""
                                    # Get provider name - ensure we always get the correct provider
                                    if search_provider and hasattr(
                                        search_provider, "get_provider_name"
                                    ):
                                        provider_name = search_provider.get_provider_name()
                                    else:
                                        # Fallback: try to infer from search_provider type
                                        provider_name = (
                                            type(search_provider)
                                            .__name__.lower()
                                            .replace("searchprovider", "")
                                            .replace("provider", "")
                                        )
                                        if not provider_name or provider_name == "none":
                                            provider_name = "default"

                                    logger.warning(
                                        f"🔍 Preparing search request for '{search_query[:50]}...' "
                                        f"(model: {model_id}, provider: {provider_name})"
                                    )

                                    # Check cache first for request deduplication
                                    # Handle both old and new rate limiter interfaces
                                    cache = getattr(rate_limiter, "cache", None)
                                    if cache:
                                        cached_results = cache.get(provider_name, search_query)
                                        if cached_results is not None:
                                            logger.warning(
                                                f"✅ Cache HIT - Using cached search results for query: {search_query[:50]}... "
                                                f"(model: {model_id}, provider: {provider_name})"
                                            )
                                            return cached_results

                                    logger.warning(
                                        f"❌ Cache MISS - Acquiring rate limiter slot for {provider_name} "
                                        f"(model: {model_id})"
                                    )

                                    search_start_time = time.time()
                                    try:
                                        # Acquire rate limiter permission (waits if necessary)
                                        # This coordinates search requests across all concurrent models
                                        # Uses provider-specific limits if configured
                                        await rate_limiter.acquire(provider_name)
                                        logger.warning(
                                            f"🚀 Rate limiter slot acquired, executing search for '{search_query[:50]}...' "
                                            f"(model: {model_id}, provider: {provider_name})"
                                        )
                                        try:
                                            # Execute the actual search
                                            search_results = await search_provider.search(
                                                search_query, max_results=5
                                            )

                                            # Record success for circuit breaker and adaptive rate limiting
                                            response_time = time.time() - search_start_time
                                            if hasattr(rate_limiter, "record_success"):
                                                rate_limiter.record_success(
                                                    provider_name, response_time
                                                )

                                            logger.warning(
                                                f"✅ Search completed successfully, caching results for '{search_query[:50]}...' "
                                                f"(model: {model_id}, provider: {provider_name}, results: {len(search_results)}, "
                                                f"response_time: {response_time:.2f}s)"
                                            )

                                            # Cache successful results for future requests
                                            if cache:
                                                cache.set(
                                                    provider_name, search_query, search_results
                                                )

                                            return search_results
                                        finally:
                                            # Release concurrent slot after search completes
                                            logger.debug(
                                                f"🔓 Releasing rate limiter slot for {provider_name} "
                                                f"(model: {model_id})"
                                            )
                                            rate_limiter.release(provider_name)
                                            logger.debug(
                                                f"✅ Rate limiter release() called for {provider_name} "
                                                f"(model: {model_id})"
                                            )
                                    except Exception as e:
                                        # Release concurrent slot on error
                                        rate_limiter.release(provider_name)

                                        # Record failure for circuit breaker
                                        error_msg = str(e).lower()
                                        if hasattr(rate_limiter, "record_failure"):
                                            error_type = (
                                                "rate_limit"
                                                if "rate limit" in error_msg or "429" in error_msg
                                                else "error"
                                            )
                                            rate_limiter.record_failure(provider_name, error_type)

                                        logger.error(
                                            f"❌ Error during search execution for '{search_query[:50]}...' "
                                            f"(model: {model_id}, provider: {provider_name}): {e}",
                                            exc_info=True,
                                        )
                                        raise

                                # Use threading to run search in background and yield keepalives periodically
                                # This prevents frontend timeout during long search operations
                                search_queue = queue.Queue()
                                search_exception = None
                                search_results = None

                                def run_search():
                                    """Run search in thread and put result in queue."""
                                    nonlocal search_exception
                                    # Create a new event loop for this thread to avoid semaphore leaks
                                    loop = asyncio.new_event_loop()
                                    asyncio.set_event_loop(loop)
                                    try:
                                        result = loop.run_until_complete(
                                            execute_search_with_rate_limit()
                                        )
                                        search_queue.put(("success", result))
                                    except Exception as e:
                                        search_exception = e
                                        search_queue.put(("error", None))
                                    finally:
                                        # Properly close the event loop to prevent resource leaks
                                        try:
                                            # Cancel any pending tasks
                                            pending = asyncio.all_tasks(loop)
                                            for task in pending:
                                                task.cancel()
                                            # Wait for tasks to complete cancellation
                                            if pending:
                                                loop.run_until_complete(
                                                    asyncio.gather(*pending, return_exceptions=True)
                                                )
                                        except Exception:
                                            pass
                                        finally:
                                            loop.close()

                                # Start search in background thread
                                search_thread = threading.Thread(target=run_search, daemon=True)
                                search_thread.start()

                                # Yield keepalives every 5 seconds while waiting for search to complete
                                # This ensures frontend timeout is reset during long search operations
                                # Use 5 seconds to match ACTIVE_STREAMING_WINDOW in frontend
                                KEEPALIVE_INTERVAL = 5.0  # Send keepalive every 5 seconds
                                SEARCH_TIMEOUT = (
                                    120.0  # Maximum time to wait for search (2 minutes)
                                )
                                search_start_time = time.time()

                                try:
                                    while True:
                                        try:
                                            # Check if search completed (non-blocking)
                                            result_type, result_data = search_queue.get(
                                                timeout=KEEPALIVE_INTERVAL
                                            )

                                            if result_type == "success":
                                                search_results = result_data
                                                logger.info(
                                                    f"Web search completed successfully, found {len(search_results)} results"
                                                )
                                                # Yield keepalive chunk after websearch to reset frontend timeout
                                                yield " "
                                                break
                                            else:
                                                # Error occurred in search thread
                                                raise search_exception
                                        except queue.Empty:
                                            # Search still running - check for timeout
                                            elapsed = time.time() - search_start_time
                                            if elapsed > SEARCH_TIMEOUT:
                                                # Search timed out - release rate limiter and raise error
                                                provider_name = (
                                                    search_provider.get_provider_name()
                                                    if hasattr(search_provider, "get_provider_name")
                                                    else "default"
                                                )
                                                logger.warning(
                                                    f"⏱️ Search timeout after {elapsed:.1f}s for {provider_name} "
                                                    f"(model: {model_id}), releasing rate limiter slot"
                                                )
                                                try:
                                                    rate_limiter.release(provider_name)
                                                except Exception as release_error:
                                                    logger.error(
                                                        f"Failed to release rate limiter on timeout: {release_error}",
                                                        exc_info=True,
                                                    )
                                                raise Exception(
                                                    f"Search timed out after {SEARCH_TIMEOUT}s"
                                                )
                                            # Yield keepalive to reset frontend timeout
                                            yield " "

                                    # Search completed successfully, search_results is set
                                    # Ensure thread is properly joined to clean up resources
                                    search_thread.join(timeout=5.0)
                                except Exception:
                                    # Wait for thread to finish before handling error
                                    search_thread.join(timeout=5.0)
                                    if search_exception:
                                        search_exec_error = search_exception
                                    error_msg = str(search_exec_error)

                                    try:
                                        provider_name = (
                                            search_provider.get_provider_name()
                                            if hasattr(search_provider, "get_provider_name")
                                            else "default"
                                        )
                                        logger.warning(
                                            f"🔓 Releasing rate limiter slot for {provider_name} "
                                            f"due to search error/timeout (model: {model_id})"
                                        )
                                        rate_limiter.release(provider_name)
                                    except Exception as release_error:
                                        logger.error(
                                            f"Failed to release rate limiter slot: {release_error}",
                                            exc_info=True,
                                        )

                                    # Check if this is a rate limit error
                                    if "rate limit" in error_msg.lower() or "429" in error_msg:
                                        # Try to use cached results as graceful degradation
                                        cached_results = rate_limiter.cache.get(
                                            provider_name, search_query
                                        )
                                        if cached_results is not None:
                                            logger.info(
                                                f"Search API rate limit hit for model {model_id}, "
                                                f"using cached results as fallback (provider: {provider_name})"
                                            )
                                            search_results = cached_results
                                            # Continue with cached results instead of raising error
                                        else:
                                            logger.warning(
                                                f"Search API rate limit hit for model {model_id}. "
                                                f"This may occur when multiple models make concurrent search requests. "
                                                f"No cached results available."
                                            )
                                            # Provide a helpful error message to the model
                                            raise Exception(
                                                f"Search API rate limit exceeded. Please try again in a moment. "
                                                f"Error: {error_msg}"
                                            )
                                    else:
                                        logger.error(
                                            f"Error during web search execution: {search_exec_error}",
                                            exc_info=True,
                                        )
                                        raise

                                # Format search results for the model
                                # Include current date/time context so models know what "today" means
                                current_datetime = datetime.now()
                                current_date_str = current_datetime.strftime("%A, %B %d, %Y")
                                current_time_str = current_datetime.strftime("%I:%M %p %Z")

                                # Handle empty search results
                                if not search_results or len(search_results) == 0:
                                    results_text = "⚠️ SEARCH RETURNED NO RESULTS\n\n"
                                    results_text += f"Search query: '{search_query}'\n"
                                    results_text += f"Search executed at: {current_date_str} at {current_time_str}\n\n"
                                    results_text += "IMPORTANT: The search returned no results. You MUST explicitly state this to the user. Do NOT fabricate information or provide generic/historical data without clearly stating that current data is unavailable. Consider:\n"
                                    results_text += "1. Trying an alternative search query with different keywords\n"
                                    results_text += "2. Explicitly telling the user that current information could not be found\n"
                                    results_text += "3. If you provide historical/average data, clearly label it as such (e.g., 'I was unable to find current weather data, but typically in January...')"
                                else:
                                    results_text = f"✅ SEARCH SUCCESSFUL - {len(search_results)} result(s) found\n\n"
                                    results_text += f"Search query: '{search_query}'\n"
                                    results_text += f"Search executed at: {current_date_str} at {current_time_str}\n"
                                    results_text += f"Search provider: {search_provider.get_provider_name() if hasattr(search_provider, 'get_provider_name') else 'Unknown'}\n\n"
                                    results_text += "Results:\n"
                                    for i, result in enumerate(search_results, 1):
                                        results_text += f"{i}. {result.title}\n"
                                        results_text += f"   URL: {result.url}\n"
                                        # Include source if available
                                        if hasattr(result, "source") and result.source:
                                            results_text += f"   Source: {result.source}\n"
                                        results_text += f"   {result.snippet}\n\n"

                                    # Add instruction to help model provide a complete answer with source citation
                                    results_text += "\nCRITICAL: Based on these results, provide a complete answer to the user's question. You MUST:\n"
                                    results_text += "1. Cite the specific source URL or service name (e.g., 'According to Weather.com' or 'From https://weather.com/...')\n"
                                    results_text += (
                                        "2. Include the timestamp/data freshness when available\n"
                                    )
                                    results_text += "3. Distinguish between current data and historical/average data\n"
                                    results_text += "4. If you need more detailed information from a specific source, use fetch_url\n"
                                    results_text += "5. Keep your response natural and user-friendly - cite sources clearly but don't mention technical search details"

                                # Store tool call and result (tool call ID already validated above)
                                # Final check: ensure this ID isn't already in tool_call_messages
                                if not any(
                                    tc.get("id", "").strip() == tool_call_id
                                    for tc in tool_call_messages
                                    if tc.get("id")
                                ):
                                    tool_call_messages.append(
                                        {
                                            "id": tool_call_id,
                                            "type": "function",
                                            "function": {
                                                "name": "search_web",
                                                "arguments": tool_call["function"]["arguments"],
                                            },
                                        }
                                    )
                                    tool_results.append(
                                        {"tool_call_id": tool_call_id, "content": results_text}
                                    )
                                else:
                                    logger.warning(
                                        f"Model {model_id} attempted to add duplicate tool call ID '{tool_call_id}' (search_web success) to tool_call_messages, skipping."
                                    )
                        except Exception as e:
                            logger.error(f"Error executing web search tool: {e}")
                            error_msg = str(e)
                            current_datetime = datetime.now()
                            current_date_str = current_datetime.strftime("%A, %B %d, %Y")
                            current_time_str = current_datetime.strftime("%I:%M %p %Z")

                            # Create detailed error message with retry suggestions
                            error_content = "❌ SEARCH FAILED\n\n"
                            error_content += f"Search query: '{search_query}'\n"
                            error_content += (
                                f"Search attempted at: {current_date_str} at {current_time_str}\n"
                            )
                            error_content += f"Error: {error_msg}\n\n"
                            error_content += "IMPORTANT: The web search failed. You MUST explicitly state this to the user. Do NOT fabricate information or provide generic/historical data without clearly stating that the search failed.\n\n"
                            error_content += "OPTIONS:\n"
                            error_content += "1. Try an alternative search query with different keywords or phrasing\n"
                            error_content += "2. Explicitly tell the user that the search failed and current information could not be retrieved\n"
                            error_content += "3. If you provide historical/average data as a fallback, clearly label it as such (e.g., 'I was unable to retrieve current weather data due to a search error, but typically in January...')\n\n"

                            # Add retry suggestions based on error type
                            if "rate limit" in error_msg.lower() or "429" in error_msg:
                                error_content += "NOTE: This appears to be a rate limit error. You may want to wait a moment and try again with a slightly modified query."
                            elif "timeout" in error_msg.lower():
                                error_content += "NOTE: The search timed out. Try a more specific or shorter query."
                            else:
                                error_content += "NOTE: Consider trying a different search query or being more specific in your search terms."

                            # Add error result (tool call ID already validated above)
                            # Final check: ensure this ID isn't already in tool_call_messages
                            if not any(
                                tc.get("id", "").strip() == tool_call_id
                                for tc in tool_call_messages
                                if tc.get("id")
                            ):
                                tool_call_messages.append(
                                    {
                                        "id": tool_call_id,
                                        "type": "function",
                                        "function": {
                                            "name": "search_web",
                                            "arguments": tool_call["function"]["arguments"],
                                        },
                                    }
                                )
                                tool_results.append(
                                    {"tool_call_id": tool_call_id, "content": error_content}
                                )
                            else:
                                logger.warning(
                                    f"Model {model_id} attempted to add duplicate tool call ID '{tool_call_id}' (error case) to tool_call_messages, skipping."
                                )
                    elif tool_call["function"]["name"] == "fetch_url":
                        # Initialize url before try block to ensure it's always defined
                        # even if an exception occurs during JSON parsing
                        url = ""
                        try:
                            import asyncio
                            import json

                            # Validate arguments exist and are not empty
                            arguments_str = tool_call["function"].get("arguments", "")
                            if not arguments_str or not arguments_str.strip():
                                raise ValueError(
                                    "Tool call arguments are missing or empty. Please provide a 'url' parameter in the arguments."
                                )
                            # Parse arguments
                            args = json.loads(arguments_str)
                            url = args.get("url", "")
                            if not url:
                                raise ValueError(
                                    "URL is missing or empty. Please provide a 'url' parameter with a valid URL."
                                )

                            # Check if this URL was already fetched (prevent redundant fetches)
                            previous_urls = []
                            for msg in messages:
                                if msg.get("role") == "assistant" and msg.get("tool_calls"):
                                    for tc in msg["tool_calls"]:
                                        if tc.get("function", {}).get("name") == "fetch_url":
                                            try:
                                                prev_args = json.loads(
                                                    tc.get("function", {}).get("arguments", "{}")
                                                )
                                                prev_url = prev_args.get("url", "")
                                                if prev_url:
                                                    # Normalize URL (remove query params for comparison)
                                                    prev_url_normalized = (
                                                        prev_url.split("?")[0].lower().strip()
                                                    )
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
                                    tool_call_messages.append(
                                        {
                                            "id": tool_call_id,
                                            "type": "function",
                                            "function": {
                                                "name": "fetch_url",
                                                "arguments": tool_call["function"]["arguments"],
                                            },
                                        }
                                    )
                                    tool_results.append(
                                        {
                                            "tool_call_id": tool_call_id,
                                            "content": f"⚠️ This URL ('{url}') was already fetched in a previous step. The content from that fetch is already available in the conversation. Please review the previously fetched content and provide your answer based on that information. Fetching the same URL again will not provide new information.",
                                        }
                                    )
                                    continue

                            if url:
                                # Yield keepalive chunk before URL fetch to reset frontend timeout
                                yield " "

                                logger.info(
                                    f"Fetching URL content: {url} (model: {model_id}, iteration: {tool_call_iteration})"
                                )

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
                                    except Exception:
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
                                    # Create a new event loop for this thread to avoid semaphore leaks
                                    loop = asyncio.new_event_loop()
                                    asyncio.set_event_loop(loop)
                                    try:
                                        result = loop.run_until_complete(execute_url_fetch())
                                        fetch_queue.put(("success", result))
                                    except Exception as e:
                                        fetch_exception = e
                                        fetch_queue.put(("error", None))
                                    finally:
                                        # Properly close the event loop to prevent resource leaks
                                        try:
                                            # Cancel any pending tasks
                                            pending = asyncio.all_tasks(loop)
                                            for task in pending:
                                                task.cancel()
                                            # Wait for tasks to complete cancellation
                                            if pending:
                                                loop.run_until_complete(
                                                    asyncio.gather(*pending, return_exceptions=True)
                                                )
                                        except Exception:
                                            pass
                                        finally:
                                            loop.close()

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
                                            result_type, result_data = fetch_queue.get(
                                                timeout=KEEPALIVE_INTERVAL
                                            )

                                            if result_type == "success":
                                                url_content = result_data
                                                logger.info(
                                                    f"URL fetch completed successfully for {url}"
                                                )
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
                                except Exception:
                                    # Wait for thread to finish before handling error
                                    fetch_thread.join(timeout=5.0)
                                    if fetch_exception:
                                        fetch_exec_error = fetch_exception
                                    error_msg = str(fetch_exec_error)
                                    logger.error(
                                        f"Error during URL fetch execution: {fetch_exec_error}",
                                        exc_info=True,
                                    )
                                    raise

                                # Format URL content for the model
                                content_text = f"Content from {url}:\n\n{url_content}\n\nBased on this content, provide a complete answer to the user's question. Keep your response natural - don't mention technical details about how you retrieved the information."

                                # Store tool call and result (tool call ID already validated above)
                                # Final check: ensure this ID isn't already in tool_call_messages
                                if not any(
                                    tc.get("id", "").strip() == tool_call_id
                                    for tc in tool_call_messages
                                    if tc.get("id")
                                ):
                                    tool_call_messages.append(
                                        {
                                            "id": tool_call_id,
                                            "type": "function",
                                            "function": {
                                                "name": "fetch_url",
                                                "arguments": tool_call["function"]["arguments"],
                                            },
                                        }
                                    )
                                    tool_results.append(
                                        {"tool_call_id": tool_call_id, "content": content_text}
                                    )
                                else:
                                    logger.warning(
                                        f"Model {model_id} attempted to add duplicate tool call ID '{tool_call_id}' (fetch_url) to tool_call_messages, skipping."
                                    )
                        except Exception as e:
                            logger.error(f"Error executing fetch_url tool: {e}")
                            # Add error result (tool call ID already validated above)
                            # Final check: ensure this ID isn't already in tool_call_messages
                            if not any(
                                tc.get("id", "").strip() == tool_call_id
                                for tc in tool_call_messages
                                if tc.get("id")
                            ):
                                tool_call_messages.append(
                                    {
                                        "id": tool_call_id,
                                        "type": "function",
                                        "function": {
                                            "name": "fetch_url",
                                            "arguments": tool_call["function"]["arguments"],
                                        },
                                    }
                                )
                                tool_results.append(
                                    {
                                        "tool_call_id": tool_call_id,
                                        "content": f"Error fetching URL content: {str(e)}",
                                    }
                                )
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

                    assistant_message = {
                        "role": "assistant",
                        "content": full_content
                        if full_content
                        else "",  # Preserve text content that was streamed
                        "tool_calls": final_valid_tool_call_messages,
                    }

                    # Only Gemini models require reasoning_details to be echoed back
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
                            messages.append(
                                {
                                    "role": "user",
                                    "content": "🚨 STOP: You have made too many tool calls. Please provide your answer now based on the information you have already gathered. Do not make any more tool calls.",
                                }
                            )
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
                        result_id = (
                            result.get("tool_call_id", "").strip()
                            if result.get("tool_call_id")
                            else ""
                        )
                        if result_id and result_id not in existing_tool_result_ids:
                            # If this is the last iteration, add a forceful stop instruction
                            if tool_call_iteration >= max_tool_call_iterations:
                                original_content = result.get("content", "")
                                result["content"] = (
                                    original_content
                                    + "\n\nPlease provide your answer now based on the information above."
                                )

                            messages.append(
                                {
                                    "role": "tool",
                                    "tool_call_id": result_id,
                                    "content": result["content"],
                                }
                            )
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
                                    logger.warning(
                                        "Skipping assistant message with all duplicate tool calls."
                                    )
                            else:
                                # Keep non-assistant messages as-is
                                fixed_messages.append(msg)

                        messages = fixed_messages
                        logger.info(
                            f"Fixed messages array by removing {len(duplicate_ids)} duplicate tool call IDs."
                        )

                    # ONE MORE FINAL CHECK: Verify no duplicates exist before API call
                    # This is the absolute last check before sending to API
                    final_check_ids = []
                    for msg in messages:
                        if msg.get("role") == "assistant" and msg.get("tool_calls"):
                            for tc in msg["tool_calls"]:
                                if tc.get("id"):
                                    final_check_ids.append(tc["id"])

                    final_check_duplicates = [
                        id for id in final_check_ids if final_check_ids.count(id) > 1
                    ]
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
                        logger.info(
                            "Emergency fix applied - messages array rebuilt with unique tool calls only."
                        )

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
                            msg_info["tool_call_ids"] = [
                                tc.get("id") for tc in msg["tool_calls"] if tc.get("id")
                            ]
                            msg_info["tool_call_functions"] = [
                                tc.get("function", {}).get("name") for tc in msg["tool_calls"]
                            ]
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
                        tool_result_id_counts[result_id] = (
                            tool_result_id_counts.get(result_id, 0) + 1
                        )

                    duplicate_tool_result_ids = [
                        rid for rid, count in tool_result_id_counts.items() if count > 1
                    ]
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
                                    logger.warning(
                                        f"Removing duplicate tool result with tool_call_id '{result_id}'"
                                    )
                            else:
                                fixed_messages_tool_results.append(msg)
                        messages = fixed_messages_tool_results
                        logger.info(
                            f"Fixed messages array by removing {len(duplicate_tool_result_ids)} duplicate tool result IDs."
                        )

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
                        signature = tuple(
                            sorted(
                                [
                                    (tc.get("id"), tc.get("function", {}).get("name"))
                                    for tc in msg.get("tool_calls", [])
                                    if tc.get("id")
                                ]
                            )
                        )
                        tool_calls_signatures.append(signature)

                    duplicate_signatures = [
                        sig for sig in tool_calls_signatures if tool_calls_signatures.count(sig) > 1
                    ]
                    if duplicate_signatures:
                        logger.error(
                            f"CRITICAL: Found {len(set(duplicate_signatures))} assistant messages with identical tool_calls signatures. "
                            f"This will cause 'rs_' resource ID conflicts. Signatures: {set(duplicate_signatures)}"
                        )

                    # Check for duplicate tool result content (API provider might generate rs_ IDs based on content hash)
                    tool_result_contents = {}
                    for msg in messages:
                        if (
                            msg.get("role") == "tool"
                            and msg.get("tool_call_id")
                            and msg.get("content")
                        ):
                            result_id = msg["tool_call_id"]
                            content = msg["content"]
                            # Create a hash of the content to detect duplicates
                            content_hash = hash(
                                content[:1000]
                            )  # Hash first 1000 chars to detect similar content
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
                        "frequency_penalty": 0.7,  # Reduce token repetition (0.0-2.0, higher = less repetition)
                        "presence_penalty": 0.5,  # Reduce topic/concept repetition (0.0-2.0, higher = less repetition)
                    }

                    # Only include tools parameter on first iteration; in continuations tools are already in context.
                    if tools and tool_call_iteration == 1:
                        api_params_continue["tools"] = tools
                        logger.debug(
                            f"Including tools parameter in continuation request (iteration {tool_call_iteration})"
                        )
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
                            # Fall back to _cl_tools if extra_headers doesn't work
                            try:
                                response_continue = _cl.chat.completions.create(
                                    **api_params_continue,
                                    extra_headers={
                                        "HTTP-Referer": "https://compareintel.com",
                                        "X-Title": "CompareIntel",
                                    },
                                )
                            except TypeError:
                                # extra_headers not supported, use client with default headers
                                response_continue = (
                                    _cl_tools.chat.completions.create(
                                        **api_params_continue
                                    )
                                )
                        else:
                            response_continue = _cl.chat.completions.create(
                                **api_params_continue
                            )
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

                    tool_calls_accumulated = {}
                    tool_call_ids_seen = set()
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
                            elif (
                                hasattr(chunk.choices[0], "reasoning_details")
                                and chunk.choices[0].reasoning_details
                            ):
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
                                    if (
                                        tool_call_id_from_delta
                                        and tool_call_id_from_delta in tool_call_ids_seen
                                    ):
                                        logger.warning(
                                            f"Model {model_id} returned duplicate tool call ID '{tool_call_id_from_delta}' at index {idx} in continuation delta (local duplicate), skipping."
                                        )
                                        continue

                                    if idx not in tool_calls_accumulated:
                                        tool_calls_accumulated[idx] = {
                                            "id": "",
                                            "type": "function",
                                            "function": {"name": "", "arguments": ""},
                                        }

                                    tc = tool_calls_accumulated[idx]

                                    if tool_call_id_from_delta:
                                        tc["id"] = tool_call_id_from_delta
                                        tool_call_ids_seen.add(tool_call_id_from_delta)

                                    if hasattr(tool_call_delta, "function"):
                                        if (
                                            hasattr(tool_call_delta.function, "name")
                                            and tool_call_delta.function.name
                                        ):
                                            tc["function"]["name"] = tool_call_delta.function.name
                                        if (
                                            hasattr(tool_call_delta.function, "arguments")
                                            and tool_call_delta.function.arguments
                                        ):
                                            tc["function"]["arguments"] += (
                                                tool_call_delta.function.arguments
                                            )

                            # Yield content chunks
                            # Check delta.content first (standard streaming)
                            if hasattr(delta, "content") and delta.content:
                                content_chunk = delta.content
                                full_content += content_chunk

                                # Check for repetition in continuation streaming
                                if len(full_content) > 500:
                                    if detect_repetition(full_content):
                                        logger.warning(
                                            f"Model {model_id} detected repetition in continuation streaming response. "
                                            f"Stopping stream early to prevent looping."
                                        )
                                        yield "\n\n⚠️ Response stopped - detected repetitive content."
                                        repetition_detected = (
                                            True  # Mark that repetition was detected
                                        )
                                        finish_reason = "length"
                                        break

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
                                        new_content = message_content[len(full_content) :]
                                        if new_content:
                                            content_chunk = new_content
                                            full_content += content_chunk

                                            # Check for repetition
                                            if len(full_content) > 500:
                                                if detect_repetition(full_content):
                                                    logger.warning(
                                                        f"Model {model_id} detected repetition in continuation streaming response. "
                                                        f"Stopping stream early to prevent looping."
                                                    )
                                                    yield "\n\n⚠️ Response stopped - detected repetitive content."
                                                    finish_reason = "length"
                                                    break

                                            yield content_chunk
                                    elif message_content and not full_content:
                                        # If we haven't yielded any content yet, yield the entire message content
                                        # This handles cases where GPT-5 models return all content in the final chunk
                                        content_chunk = message_content
                                        full_content += content_chunk

                                        # Check for repetition
                                        if len(full_content) > 500:
                                            if detect_repetition(full_content):
                                                logger.warning(
                                                    f"Model {model_id} detected repetition in continuation streaming response. "
                                                    f"Stopping stream early to prevent looping."
                                                )
                                                yield "\n\n⚠️ Response stopped - detected repetitive content."
                                                repetition_detected = (
                                                    True  # Mark that repetition was detected
                                                )
                                                finish_reason = "length"
                                                break

                                        yield content_chunk

                                # Also check message.tool_calls in final chunk (some models like GPT-5 Chat return tool_calls here)
                                # This handles cases where tool_calls are only in the final chunk's message object
                                if hasattr(message, "tool_calls") and message.tool_calls:
                                    for tool_call in message.tool_calls:
                                        idx = (
                                            tool_call.index
                                            if hasattr(tool_call, "index")
                                            else len(tool_calls_accumulated)
                                        )

                                        # Get tool call ID if present
                                        tool_call_id_from_message = ""
                                        if hasattr(tool_call, "id") and tool_call.id:
                                            tool_call_id_from_message = tool_call.id

                                        # Skip if this tool call ID was already seen anywhere (prevent duplicates)
                                        if tool_call_id_from_message:
                                            if (
                                                tool_call_id_from_message
                                                in all_tool_call_ids_ever_seen
                                            ):
                                                logger.warning(
                                                    f"Model {model_id} returned duplicate tool call ID '{tool_call_id_from_message}' at index {idx} in continuation message.tool_calls, skipping duplicate."
                                                )
                                                continue
                                            all_tool_call_ids_ever_seen.add(
                                                tool_call_id_from_message
                                            )

                                        # Also check local set for this batch
                                        if (
                                            tool_call_id_from_message
                                            and tool_call_id_from_message in tool_call_ids_seen
                                        ):
                                            logger.warning(
                                                f"Model {model_id} returned duplicate tool call ID '{tool_call_id_from_message}' at index {idx} in continuation message.tool_calls (local duplicate), skipping."
                                            )
                                            continue

                                        # Initialize tool call structure if needed
                                        if idx not in tool_calls_accumulated:
                                            tool_calls_accumulated[idx] = {
                                                "id": "",
                                                "type": "function",
                                                "function": {"name": "", "arguments": ""},
                                            }

                                        tc = tool_calls_accumulated[idx]

                                        # Update tool call ID (prefer message tool_call ID as it's complete)
                                        if tool_call_id_from_message:
                                            tc["id"] = tool_call_id_from_message
                                            tool_call_ids_seen.add(tool_call_id_from_message)

                                        # Update function name and arguments (prefer message tool_call as it's complete)
                                        if hasattr(tool_call, "function"):
                                            if (
                                                hasattr(tool_call.function, "name")
                                                and tool_call.function.name
                                            ):
                                                tc["function"]["name"] = tool_call.function.name
                                            if (
                                                hasattr(tool_call.function, "arguments")
                                                and tool_call.function.arguments
                                            ):
                                                # For message tool_calls, arguments are complete, not incremental
                                                tc["function"]["arguments"] = (
                                                    tool_call.function.arguments
                                                )

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

            # If loop exited due to max iterations but model wanted more tool calls,
            # make a final call WITHOUT tools to force the model to provide an answer
            if finish_reason == "tool_calls" and tool_call_iteration >= max_tool_call_iterations:
                logger.info(
                    f"Model {model_id} hit max tool call iterations ({max_tool_call_iterations}) "
                    f"but still wanted to make tool calls. Making final completion call without tools."
                )

                # Add a user message asking for final answer with validation requirements
                validation_note = ""
                # Check if any search tools were used
                search_tools_used = False
                for msg in messages:
                    if msg.get("role") == "assistant" and msg.get("tool_calls"):
                        for tc in msg["tool_calls"]:
                            if tc.get("function", {}).get("name") == "search_web":
                                search_tools_used = True
                                break
                        if search_tools_used:
                            break

                # If no search tools were used but query is time-sensitive, add validation note
                if enable_web_search and not search_tools_used and is_time_sensitive_query(prompt):
                    validation_note = " IMPORTANT: If you did not use search_web for this time-sensitive query, please explicitly state that you were unable to retrieve current information and that any data provided is historical or estimated, not current."

                messages.append(
                    {
                        "role": "user",
                        "content": f"Please provide your answer now based on all the information you have gathered. Do not search for more information.{validation_note}",
                    }
                )

                # Make final API call WITHOUT tools to force completion
                try:
                    final_response = _cl.chat.completions.create(
                        model=model_id,
                        messages=messages,
                        timeout=settings.individual_model_timeout,
                        max_tokens=max_tokens,
                        stream=True,
                        frequency_penalty=0.7,  # Reduce token repetition
                        presence_penalty=0.5,  # Reduce topic repetition
                        # No tools parameter - force model to answer
                    )

                    # Stream the final response
                    for chunk in final_response:
                        last_chunk = chunk
                        if chunk.choices and len(chunk.choices) > 0:
                            delta = chunk.choices[0].delta

                            if hasattr(delta, "content") and delta.content:
                                content_chunk = delta.content
                                full_content += content_chunk

                                # Check for repetition
                                if len(full_content) > 500:
                                    if detect_repetition(full_content):
                                        logger.warning(
                                            f"Model {model_id} detected repetition in final completion response. "
                                            f"Stopping stream early to prevent looping."
                                        )
                                        yield "\n\n⚠️ Response stopped - detected repetitive content."
                                        repetition_detected = (
                                            True  # Mark that repetition was detected
                                        )
                                        finish_reason = "length"
                                        break

                                yield content_chunk

                            # Also check message.content in final chunk
                            if hasattr(chunk.choices[0], "message") and chunk.choices[0].message:
                                message = chunk.choices[0].message
                                if hasattr(message, "content") and message.content:
                                    message_content = message.content
                                    if message_content and len(message_content) > len(full_content):
                                        new_content = message_content[len(full_content) :]
                                        if new_content:
                                            full_content += new_content

                                            # Check for repetition
                                            if len(full_content) > 500:
                                                if detect_repetition(full_content):
                                                    logger.warning(
                                                        f"Model {model_id} detected repetition in final completion response. "
                                                        f"Stopping stream early to prevent looping."
                                                    )
                                                    yield "\n\n⚠️ Response stopped - detected repetitive content."
                                                    repetition_detected = (
                                                        True  # Mark that repetition was detected
                                                    )
                                                    finish_reason = "length"
                                                    break

                                            yield new_content
                                    elif message_content and not full_content:
                                        full_content += message_content

                                        # Check for repetition
                                        if len(full_content) > 500:
                                            if detect_repetition(full_content):
                                                logger.warning(
                                                    f"Model {model_id} detected repetition in final completion response. "
                                                    f"Stopping stream early to prevent looping."
                                                )
                                                yield "\n\n⚠️ Response stopped - detected repetitive content."
                                                repetition_detected = (
                                                    True  # Mark that repetition was detected
                                                )
                                                finish_reason = "length"
                                                break

                                        yield message_content

                            if chunk.choices[0].finish_reason:
                                finish_reason = chunk.choices[0].finish_reason

                        if hasattr(chunk, "usage") and chunk.usage:
                            usage = chunk.usage
                            prompt_tokens = getattr(usage, "prompt_tokens", 0)
                            completion_tokens = getattr(usage, "completion_tokens", 0)
                            if prompt_tokens > 0 or completion_tokens > 0:
                                usage_data = calculate_token_usage(prompt_tokens, completion_tokens)
                except Exception as final_error:
                    logger.error(
                        f"Error in final completion call for model {model_id}: {final_error}"
                    )
                    # Don't raise - we've already provided some response

            # Extract usage data from last chunk if available (from continuation response)
            if last_chunk and hasattr(last_chunk, "usage") and last_chunk.usage:
                usage = last_chunk.usage
                prompt_tokens = getattr(usage, "prompt_tokens", 0)
                completion_tokens = getattr(usage, "completion_tokens", 0)
                if prompt_tokens > 0 or completion_tokens > 0:
                    usage_data = calculate_token_usage(prompt_tokens, completion_tokens)

            # Check if the last assistant message had text content that suggests an incomplete response
            # Common patterns: ends with ":", "Let me", "I'll", etc.
            # This handles cases where models generate explanatory text before tool calls but don't complete
            if messages and len(messages) > 0:
                # Find the last assistant message
                last_assistant_msg = None
                for msg in reversed(messages):
                    if msg.get("role") == "assistant":
                        last_assistant_msg = msg
                        break

                if last_assistant_msg:
                    last_assistant_content = last_assistant_msg.get("content", "")
                    if last_assistant_content and isinstance(last_assistant_content, str):
                        # Check for incomplete response patterns
                        # These patterns indicate the model started to explain what it will do but didn't complete
                        incomplete_patterns = [
                            "let me get",
                            "let me try",
                            "let me check",
                            "i'll check",
                            "i'll get",
                            "i'll try",
                        ]
                        content_lower = last_assistant_content.lower().strip()
                        ends_with_colon = content_lower.endswith(":")
                        # Check if content starts with incomplete pattern (strong indicator)
                        starts_with_incomplete = any(
                            content_lower.startswith(pattern) for pattern in incomplete_patterns
                        )
                        # Check if last sentence contains incomplete pattern (more specific than checking entire content)
                        last_sentence = (
                            content_lower.split(".")[-1].strip()
                            if "." in content_lower
                            else content_lower
                        )
                        last_sentence_incomplete = any(
                            pattern in last_sentence for pattern in incomplete_patterns
                        )

                        # If response looks incomplete (ends with colon, starts with incomplete phrase, or last sentence has incomplete phrase),
                        # and we're not in a tool call loop, force a completion call
                        if (
                            ends_with_colon or starts_with_incomplete or last_sentence_incomplete
                        ) and finish_reason != "tool_calls":
                            logger.info(
                                f"Model {model_id} generated potentially incomplete response: '{last_assistant_content[:100]}...' "
                                f"Detected incomplete pattern. Forcing completion."
                            )

                            # Add a user message asking for completion
                            messages.append(
                                {
                                    "role": "user",
                                    "content": "Please complete your response. Provide the answer to the user's question.",
                                }
                            )

                            # Make completion call WITHOUT tools
                            try:
                                completion_response = _cl.chat.completions.create(
                                    model=model_id,
                                    messages=messages,
                                    timeout=settings.individual_model_timeout,
                                    max_tokens=max_tokens,
                                    stream=True,
                                    frequency_penalty=0.7,  # Reduce token repetition
                                    presence_penalty=0.5,  # Reduce topic repetition
                                    # No tools parameter - force model to complete the answer
                                )

                                # Stream the completion response
                                for chunk in completion_response:
                                    last_chunk = chunk
                                    if chunk.choices and len(chunk.choices) > 0:
                                        delta = chunk.choices[0].delta

                                        if hasattr(delta, "content") and delta.content:
                                            content_chunk = delta.content
                                            full_content += content_chunk

                                            # Check for repetition
                                            if len(full_content) > 500:
                                                if detect_repetition(full_content):
                                                    logger.warning(
                                                        f"Model {model_id} detected repetition in incomplete response completion. "
                                                        f"Stopping stream early to prevent looping."
                                                    )
                                                    yield "\n\n⚠️ Response stopped - detected repetitive content."
                                                    repetition_detected = (
                                                        True  # Mark that repetition was detected
                                                    )
                                                    finish_reason = "length"
                                                    break

                                            yield content_chunk

                                        # Also check message.content in final chunk
                                        if (
                                            hasattr(chunk.choices[0], "message")
                                            and chunk.choices[0].message
                                        ):
                                            message = chunk.choices[0].message
                                            if hasattr(message, "content") and message.content:
                                                message_content = message.content
                                                if message_content and len(message_content) > len(
                                                    full_content
                                                ):
                                                    new_content = message_content[
                                                        len(full_content) :
                                                    ]
                                                    if new_content:
                                                        full_content += new_content

                                                        # Check for repetition
                                                        if len(full_content) > 500:
                                                            if detect_repetition(full_content):
                                                                logger.warning(
                                                                    f"Model {model_id} detected repetition in incomplete response completion. "
                                                                    f"Stopping stream early to prevent looping."
                                                                )
                                                                yield "\n\n⚠️ Response stopped - detected repetitive content."
                                                                repetition_detected = True  # Mark that repetition was detected
                                                                finish_reason = "length"
                                                                break

                                                        yield new_content
                                                elif message_content and not full_content:
                                                    full_content += message_content

                                                    # Check for repetition
                                                    if len(full_content) > 500:
                                                        if detect_repetition(full_content):
                                                            logger.warning(
                                                                f"Model {model_id} detected repetition in incomplete response completion. "
                                                                f"Stopping stream early to prevent looping."
                                                            )
                                                            yield "\n\n⚠️ Response stopped - detected repetitive content."
                                                            repetition_detected = True  # Mark that repetition was detected
                                                            finish_reason = "length"
                                                            break

                                                    yield message_content

                                        if chunk.choices[0].finish_reason:
                                            finish_reason = chunk.choices[0].finish_reason

                                    if hasattr(chunk, "usage") and chunk.usage:
                                        usage = chunk.usage
                                        prompt_tokens = getattr(usage, "prompt_tokens", 0)
                                        completion_tokens = getattr(usage, "completion_tokens", 0)
                                        if prompt_tokens > 0 or completion_tokens > 0:
                                            usage_data = calculate_token_usage(
                                                prompt_tokens, completion_tokens
                                            )
                            except Exception as completion_error:
                                logger.error(
                                    f"Error in incomplete response completion call for model {model_id}: {completion_error}"
                                )
                                # Don't raise - we've already provided some response

            # After streaming completes, handle finish_reason warnings
            # Only show "maximum output length" warning if it wasn't due to repetition detection
            if finish_reason == "length" and not repetition_detected:
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
                # Safely extract status_code - APIError may have it directly or via response
                if hasattr(e, "status_code"):
                    status_code = e.status_code
                elif hasattr(e, "response") and hasattr(e.response, "status_code"):
                    status_code = e.response.status_code
                # Try to extract meaningful error message from response body
                try:
                    if hasattr(e, "body") and e.body:
                        import json

                        if isinstance(e.body, dict):
                            error_body = e.body
                        elif isinstance(e.body, str):
                            error_body = json.loads(e.body)
                        else:
                            error_body = {}

                        # Extract error message from structured response
                        if "error" in error_body:
                            error_obj = error_body["error"]
                            if isinstance(error_obj, dict):
                                parsed_error_message = error_obj.get("message", str(e))
                                # Check metadata for additional context
                                if "metadata" in error_obj and isinstance(
                                    error_obj["metadata"], dict
                                ):
                                    raw_error = error_obj["metadata"].get("raw", "")
                                    if raw_error:
                                        if isinstance(raw_error, str):
                                            # Use raw error if it's a string
                                            parsed_error_message = raw_error
                                        elif isinstance(raw_error, dict):
                                            # If raw is a dict, try to extract a message from it
                                            raw_msg = (
                                                raw_error.get("message")
                                                or raw_error.get("error")
                                                or str(raw_error)
                                            )
                                            if raw_msg and isinstance(raw_msg, str):
                                                parsed_error_message = raw_msg
                                # If we still don't have a good message, use the error message
                                if not parsed_error_message or parsed_error_message == str(e):
                                    parsed_error_message = error_obj.get("message", str(e))
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
                status_code == 402
                or "402" in error_message
                or "payment required" in error_str
                or ("requires more credits" in error_str and "max_tokens" in error_str)
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
                    clean_message = (
                        parsed_error_message[:200]
                        if len(parsed_error_message) > 200
                        else parsed_error_message
                    )
                    yield f"Error: {clean_message}"
                elif "provider returned error" in error_str:
                    # Generic provider error - show the actual error message if available
                    clean_message = (
                        error_message[:200] if len(error_message) > 200 else error_message
                    )
                    yield f"Error: {clean_message}"
                else:
                    # Generic 400 error - show the actual error message
                    clean_message = (
                        error_message[:200] if len(error_message) > 200 else error_message
                    )
                    yield f"Error: Invalid request - {clean_message}"
            elif status_code == 401 or "unauthorized" in error_str or "401" in error_str:
                yield "Error: Authentication failed"
            elif status_code == 404 or "not found" in error_str or "404" in error_str:
                # Extract provider error message if available
                provider_error = None
                provider_name = None
                if isinstance(e, APIError) and hasattr(e, "body"):
                    try:
                        import json

                        if isinstance(e.body, dict):
                            error_body = e.body
                        elif isinstance(e.body, str):
                            error_body = json.loads(e.body)
                        else:
                            error_body = {}

                        # Check for provider error in metadata
                        if "error" in error_body and isinstance(error_body["error"], dict):
                            metadata = error_body["error"].get("metadata", {})
                            if isinstance(metadata, dict):
                                provider_error = metadata.get("raw", "")
                                provider_name = metadata.get("provider_name", "")
                    except Exception as parse_err:
                        logger.debug(f"Failed to parse provider error: {parse_err}")

                # Use parsed_error_message if it contains the raw error (from earlier extraction)
                if not provider_error and parsed_error_message:
                    # Check if parsed_error_message contains the gateway error
                    if (
                        "not configured in the Gateway" in parsed_error_message
                        or "No matching route" in parsed_error_message
                    ):
                        provider_error = parsed_error_message

                # Provide more detailed error message
                if provider_error:
                    # Check if it's a gateway/routing issue
                    if (
                        "not configured in the Gateway" in provider_error
                        or "No matching route" in provider_error
                    ):
                        error_msg = f"Error: Model '{model_id}' is not currently available. "
                        if provider_name:
                            error_msg += f"The provider ({provider_name}) may not have this model configured in their gateway. "
                        else:
                            error_msg += (
                                "The provider may not have this model configured in their gateway. "
                            )
                        error_msg += "This appears in OpenRouter's model list but is not currently routable. Please try again later or use a different model."
                        yield error_msg
                    else:
                        clean_message = (
                            provider_error[:200] if len(provider_error) > 200 else provider_error
                        )
                        yield f"Error: Model not available - {clean_message}"
                elif parsed_error_message and parsed_error_message != str(e):
                    clean_message = (
                        parsed_error_message[:200]
                        if len(parsed_error_message) > 200
                        else parsed_error_message
                    )
                    yield f"Error: Model not available - {clean_message}"
                else:
                    yield "Error: Model not available"
            elif status_code == 429 or "rate limit" in error_str or "429" in error_str:
                yield "Error: Rate limited"
            elif "timeout" in error_str:
                yield f"Error: Timeout ({settings.individual_model_timeout}s)"
            elif is_402_max_tokens_error:
                yield "Error: This request requires more credits or fewer max_tokens. Please try with a shorter prompt or reduce the number of models."
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
    conversation_history: list[Any] | None = None,
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
        if "rate limit" in error_str or "429" in error_str:
            raise Exception(f"Rate limited when calling model {model_id}")
        if "not found" in error_str or "404" in error_str:
            raise Exception(f"Model {model_id} not available")
        if "unauthorized" in error_str or "401" in error_str:
            raise Exception(f"Authentication failed for model {model_id}")
