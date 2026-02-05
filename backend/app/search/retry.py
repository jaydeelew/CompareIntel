"""
Shared retry logic for search providers.

This module provides reusable retry functionality with exponential backoff
and jitter for handling rate limits and transient errors.
"""

import asyncio
import logging
import random
from collections.abc import Callable
from typing import TypeVar

import httpx

logger = logging.getLogger(__name__)

T = TypeVar("T")


class RetryConfig:
    """Configuration for retry behavior."""

    def __init__(
        self,
        max_retries: int = 3,
        initial_delay: float = 2.0,
        max_delay: float = 30.0,
        jitter_factor: float = 0.2,
        retry_on_429: bool = True,
        retry_on_5xx: bool = True,
        retry_on_network_error: bool = True,
        provider_name: str = "Search Provider",
    ):
        self.max_retries = max_retries
        self.initial_delay = initial_delay
        self.max_delay = max_delay
        self.jitter_factor = jitter_factor
        self.retry_on_429 = retry_on_429
        self.retry_on_5xx = retry_on_5xx
        self.retry_on_network_error = retry_on_network_error
        self.provider_name = provider_name


async def execute_with_retry(coro_func: Callable[[], T], config: RetryConfig, query: str = "") -> T:
    """
    Execute an async function with retry logic.

    Args:
        coro_func: Async function to execute (no arguments)
        config: Retry configuration
        query: Optional query string for logging

    Returns:
        Result from coro_func

    Raises:
        Exception: If all retries are exhausted
    """
    last_exception = None

    for attempt in range(config.max_retries):
        try:
            result = await coro_func()
            return result

        except httpx.HTTPStatusError as e:
            status_code = e.response.status_code

            # Handle 429 rate limits
            if status_code == 429 and config.retry_on_429:
                if attempt < config.max_retries - 1:
                    wait_time = _calculate_wait_time(
                        e.response.headers.get("Retry-After"), attempt, config
                    )
                    logger.warning(
                        f"{config.provider_name} rate limited (429) for query '{query[:50]}...'. "
                        f"Retrying in {wait_time:.1f}s (attempt {attempt + 1}/{config.max_retries})"
                    )
                    await asyncio.sleep(wait_time)
                    continue
                error_msg = f"{config.provider_name} API rate limit exceeded after {config.max_retries} attempts"
                logger.error(error_msg)
                raise Exception(error_msg)

            # Handle 5xx server errors
            if 500 <= status_code < 600 and config.retry_on_5xx:
                if attempt < config.max_retries - 1:
                    wait_time = _calculate_wait_time(None, attempt, config)
                    logger.warning(
                        f"{config.provider_name} server error ({status_code}) for query '{query[:50]}...'. "
                        f"Retrying in {wait_time:.1f}s (attempt {attempt + 1}/{config.max_retries})"
                    )
                    await asyncio.sleep(wait_time)
                    continue

            # Don't retry other HTTP errors
            logger.error(f"{config.provider_name} API error: {status_code} - {e.response.text}")
            raise Exception(f"{config.provider_name} API error: {status_code}")

        except httpx.RequestError as e:
            if config.retry_on_network_error and attempt < config.max_retries - 1:
                wait_time = _calculate_wait_time(None, attempt, config)
                logger.warning(
                    f"{config.provider_name} network error for query '{query[:50]}...'. "
                    f"Retrying in {wait_time:.1f}s (attempt {attempt + 1}/{config.max_retries})"
                )
                await asyncio.sleep(wait_time)
                continue
            logger.error(
                f"{config.provider_name} request error (attempt {attempt + 1}/{config.max_retries}): {e}"
            )
            raise Exception(f"Failed to connect to {config.provider_name} API: {str(e)}")

        except Exception as e:
            # Don't retry unexpected errors
            logger.error(
                f"Unexpected error in {config.provider_name} (attempt {attempt + 1}/{config.max_retries}): {e}"
            )
            raise

    # Should not reach here, but just in case
    if last_exception:
        raise last_exception
    raise Exception(f"{config.provider_name} failed after all retries")


def _calculate_wait_time(retry_after: str | None, attempt: int, config: RetryConfig) -> float:
    """
    Calculate wait time with exponential backoff and jitter.

    Respects Retry-After header if provided, otherwise uses exponential backoff.
    Always adds jitter to prevent thundering herd problems.
    """
    if retry_after:
        try:
            # Retry-After can be either seconds (integer) or HTTP date
            # Try parsing as seconds first
            wait_time = float(retry_after)
            # Ensure it's within reasonable bounds
            wait_time = min(max(wait_time, config.initial_delay), config.max_delay)
        except (ValueError, TypeError):
            # If not a number, try parsing as HTTP date (RFC 7231)
            # For simplicity, fall back to exponential backoff if date parsing fails
            wait_time = min(config.initial_delay * (2**attempt), config.max_delay)
    else:
        # No Retry-After header, use exponential backoff
        wait_time = min(config.initial_delay * (2**attempt), config.max_delay)

    # Add random jitter to prevent synchronized retries across multiple models
    # Jitter helps distribute retry attempts over time
    jitter = wait_time * config.jitter_factor * random.random()
    final_wait = wait_time + jitter

    logger.debug(
        f"Calculated wait time: {final_wait:.2f}s "
        f"(base: {wait_time:.2f}s, jitter: {jitter:.2f}s, attempt: {attempt + 1})"
    )

    return final_wait
