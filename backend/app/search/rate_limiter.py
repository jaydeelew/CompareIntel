"""
Shared rate limiter for search API requests.

This module provides a provider-aware rate limiter to coordinate search requests
across multiple concurrent model requests, preventing API rate limit exhaustion.

Features:
- Provider-specific rate limits
- Request deduplication/caching
- Thread-safe for use from thread pools
- Configurable via environment variables
"""

import asyncio
import hashlib
import json
import logging
import os
import time
import threading
from typing import Optional, Dict, Any, Tuple
from collections import deque
from dataclasses import dataclass
from ..config.settings import settings

logger = logging.getLogger(__name__)


@dataclass
class ProviderRateLimitConfig:
    """Rate limit configuration for a specific provider."""
    max_requests_per_minute: int
    max_concurrent: int
    delay_between_requests: float


class SearchResultCache:
    """Thread-safe cache for search results to enable request deduplication."""
    
    def __init__(self, ttl_seconds: int = 300):
        """
        Initialize the cache.
        
        Args:
            ttl_seconds: Time-to-live for cached results in seconds
        """
        self.ttl_seconds = ttl_seconds
        self._lock = threading.Lock()
        self._cache: Dict[str, Tuple[float, Any]] = {}  # query_hash -> (expiry_time, results)
    
    def _hash_query(self, provider_name: str, query: str) -> str:
        """Generate hash for query deduplication."""
        combined = f"{provider_name}:{query.lower().strip()}"
        return hashlib.sha256(combined.encode()).hexdigest()
    
    def get(self, provider_name: str, query: str) -> Optional[Any]:
        """
        Get cached results for a query.
        
        Returns:
            Cached results if available and not expired, None otherwise
        """
        if not settings.search_cache_enabled:
            return None
        
        query_hash = self._hash_query(provider_name, query)
        now = time.time()
        
        with self._lock:
            if query_hash in self._cache:
                expiry_time, results = self._cache[query_hash]
                if now < expiry_time:
                    logger.debug(f"Cache hit for query: {query[:50]}... (provider: {provider_name})")
                    return results
                else:
                    # Expired, remove it
                    del self._cache[query_hash]
        
        return None
    
    def set(self, provider_name: str, query: str, results: Any) -> None:
        """Cache search results."""
        if not settings.search_cache_enabled:
            return
        
        query_hash = self._hash_query(provider_name, query)
        expiry_time = time.time() + self.ttl_seconds
        
        with self._lock:
            self._cache[query_hash] = (expiry_time, results)
            # Clean up expired entries periodically (every 100 additions)
            if len(self._cache) % 100 == 0:
                self._cleanup_expired()
    
    def _cleanup_expired(self) -> None:
        """Remove expired cache entries."""
        now = time.time()
        expired_keys = [
            key for key, (expiry_time, _) in self._cache.items()
            if now >= expiry_time
        ]
        for key in expired_keys:
            del self._cache[key]
    
    def clear(self) -> None:
        """Clear all cached entries."""
        with self._lock:
            self._cache.clear()


class SearchRateLimiter:
    """
    Provider-aware rate limiter for search API requests.
    
    Uses a sliding window algorithm to limit the rate of search requests
    per provider. Thread-safe for use from thread pools.
    """
    
    def __init__(
        self,
        default_max_requests_per_minute: int = 20,
        default_max_concurrent: int = 3,
        default_delay_between_requests: float = 1.0,
        provider_configs: Optional[Dict[str, ProviderRateLimitConfig]] = None
    ):
        """
        Initialize the rate limiter.
        
        Args:
            default_max_requests_per_minute: Default max requests per minute
            default_max_concurrent: Default max concurrent requests
            default_delay_between_requests: Default delay between requests
            provider_configs: Optional provider-specific configurations
        """
        self.default_config = ProviderRateLimitConfig(
            max_requests_per_minute=default_max_requests_per_minute,
            max_concurrent=default_max_concurrent,
            delay_between_requests=default_delay_between_requests
        )
        
        # Provider-specific configurations
        self.provider_configs: Dict[str, ProviderRateLimitConfig] = provider_configs or {}
        
        # Thread-safe locks and state per provider
        self._state_lock = threading.Lock()  # Lock for creating new provider states
        self._locks: Dict[str, threading.Lock] = {}
        self._request_times: Dict[str, deque] = {}
        self._concurrent_counts: Dict[str, int] = {}
        
        # Cache for request deduplication
        self.cache = SearchResultCache(ttl_seconds=settings.search_cache_ttl_seconds)
        
        # Monitoring: Track rate limit events
        self._rate_limit_events: Dict[str, int] = {}  # provider -> count of rate limit hits
    
    def _get_provider_config(self, provider_name: str) -> ProviderRateLimitConfig:
        """Get rate limit configuration for a provider."""
        return self.provider_configs.get(provider_name, self.default_config)
    
    def _get_provider_state(self, provider_name: str) -> Tuple[threading.Lock, deque, int]:
        """Get or create thread-safe state for a provider."""
        if provider_name not in self._locks:
            with self._state_lock:
                if provider_name not in self._locks:
                    self._locks[provider_name] = threading.Lock()
                    self._request_times[provider_name] = deque()
                    self._concurrent_counts[provider_name] = 0
                    logger.debug(f"Created rate limiter state for provider: {provider_name}")
        return (
            self._locks[provider_name],
            self._request_times[provider_name],
            self._concurrent_counts[provider_name]
        )
    
    async def acquire(self, provider_name: str = "default") -> None:
        """
        Acquire permission to make a search request for a provider.
        
        Args:
            provider_name: Name of the search provider (e.g., "brave", "tavily")
        
        This method will wait if necessary to respect rate limits.
        """
        config = self._get_provider_config(provider_name)
        lock, request_times, concurrent_count_ref = self._get_provider_state(provider_name)
        
        # Wait for concurrent request slot and check rate limit
        while True:
            with lock:
                now = time.time()
                
                # Remove old requests from sliding window (older than 1 minute)
                while request_times and (now - request_times[0]) > 60:
                    request_times.popleft()
                
                # Check concurrent limit
                if self._concurrent_counts[provider_name] >= config.max_concurrent:
                    # Wait a bit before checking again
                    wait_time = 0.1
                # Check rate limit
                elif len(request_times) >= config.max_requests_per_minute:
                    # Calculate wait time until oldest request expires
                    oldest_request_time = request_times[0]
                    wait_time = 60 - (now - oldest_request_time) + 0.1  # Add small buffer
                    
                    # Track rate limit events for monitoring
                    self._rate_limit_events[provider_name] = self._rate_limit_events.get(provider_name, 0) + 1
                    
                    logger.warning(
                        f"⏸️ Search rate limit reached for {provider_name} "
                        f"({len(request_times)}/{config.max_requests_per_minute}). "
                        f"Waiting {wait_time:.2f}s before next request. "
                        f"(Total rate limit hits for {provider_name}: {self._rate_limit_events[provider_name]})"
                    )
                else:
                    # We can proceed - acquire slot and record request
                    self._concurrent_counts[provider_name] += 1
                    request_times.append(now)
                    logger.warning(
                        f"✅ Acquired search rate limiter slot for {provider_name} "
                        f"({len(request_times)}/{config.max_requests_per_minute} requests in window, "
                        f"{self._concurrent_counts[provider_name]}/{config.max_concurrent} concurrent)"
                    )
                    break
            
            # Wait before checking again
            await asyncio.sleep(wait_time)
        
        try:
            # Add delay between requests to prevent rapid-fire requests
            if config.delay_between_requests > 0:
                await asyncio.sleep(config.delay_between_requests)
        except Exception as e:
            # Release concurrent slot on error
            with lock:
                self._concurrent_counts[provider_name] = max(0, self._concurrent_counts[provider_name] - 1)
            raise
    
    def release(self, provider_name: str = "default") -> None:
        """Release the concurrent request slot after request completes."""
        lock, _, _ = self._get_provider_state(provider_name)
        with lock:
            self._concurrent_counts[provider_name] = max(0, self._concurrent_counts[provider_name] - 1)
    
    def get_stats(self) -> Dict[str, Any]:
        """
        Get monitoring statistics for the rate limiter.
        
        Returns:
            Dictionary with statistics including rate limit events, cache stats, etc.
        """
        stats = {
            "rate_limit_events": dict(self._rate_limit_events),
            "cache_enabled": settings.search_cache_enabled,
            "cache_size": len(self.cache._cache) if hasattr(self.cache, '_cache') else 0,
            "providers": {}
        }
        
        # Get per-provider stats
        for provider_name in self._locks.keys():
            lock, request_times, concurrent_count = self._get_provider_state(provider_name)
            config = self._get_provider_config(provider_name)
            with lock:
                stats["providers"][provider_name] = {
                    "requests_in_window": len(request_times),
                    "max_requests_per_minute": config.max_requests_per_minute,
                    "current_concurrent": self._concurrent_counts[provider_name],
                    "max_concurrent": config.max_concurrent,
                    "delay_between_requests": config.delay_between_requests,
                    "rate_limit_hits": self._rate_limit_events.get(provider_name, 0)
                }
        
        return stats


def _parse_provider_configs() -> Dict[str, ProviderRateLimitConfig]:
    """Parse provider-specific rate limit configurations from settings."""
    if not settings.search_provider_rate_limits:
        return {}
    
    try:
        config_dict = json.loads(settings.search_provider_rate_limits)
        provider_configs = {}
        
        for provider_name, config in config_dict.items():
            provider_configs[provider_name] = ProviderRateLimitConfig(
                max_requests_per_minute=config.get("max_requests_per_minute", settings.search_rate_limit_per_minute),
                max_concurrent=config.get("max_concurrent", settings.search_max_concurrent),
                delay_between_requests=config.get("delay_between_requests", settings.search_delay_between_requests)
            )
        
        return provider_configs
    except (json.JSONDecodeError, KeyError, TypeError) as e:
        logger.warning(f"Failed to parse provider rate limit config: {e}. Using defaults.")
        return {}


# Global rate limiter instance
_global_rate_limiter: Optional[SearchRateLimiter] = None
_global_rate_limiter_lock = threading.Lock()


def get_rate_limiter():
    """
    Get the global search rate limiter instance (thread-safe).
    
    Returns distributed rate limiter if Redis is enabled, otherwise in-memory.
    """
    global _global_rate_limiter
    if _global_rate_limiter is None:
        with _global_rate_limiter_lock:
            if _global_rate_limiter is None:
                # Try to use distributed rate limiter if Redis is enabled
                if settings.redis_enabled and settings.redis_url:
                    try:
                        from .distributed_rate_limiter import (
                            DistributedSearchRateLimiter,
                            ProviderRateLimitConfig
                        )
                        
                        provider_configs = _parse_provider_configs_distributed()
                        default_config = ProviderRateLimitConfig(
                            max_requests_per_minute=settings.search_rate_limit_per_minute,
                            max_concurrent=settings.search_max_concurrent,
                            delay_between_requests=settings.search_delay_between_requests
                        )
                        
                        _global_rate_limiter = DistributedSearchRateLimiter(
                            default_config=default_config,
                            provider_configs=provider_configs,
                            redis_url=settings.redis_url,
                            enable_circuit_breaker=settings.search_circuit_breaker_enabled
                        )
                        
                        logger.info(
                            f"🚀 Initialized DISTRIBUTED search rate limiter with Redis: "
                            f"{settings.search_rate_limit_per_minute} req/min, "
                            f"{settings.search_max_concurrent} concurrent, "
                            f"{settings.search_delay_between_requests}s delay. "
                            f"Cache: {'enabled' if settings.search_cache_enabled else 'disabled'}. "
                            f"Circuit breaker: {'enabled' if settings.search_circuit_breaker_enabled else 'disabled'}."
                        )
                        return _global_rate_limiter
                    except Exception as e:
                        logger.warning(
                            f"Failed to initialize distributed rate limiter: {e}. "
                            f"Falling back to in-memory rate limiter."
                        )
                
                # Fallback to in-memory rate limiter
                provider_configs = _parse_provider_configs()
                _global_rate_limiter = SearchRateLimiter(
                    default_max_requests_per_minute=settings.search_rate_limit_per_minute,
                    default_max_concurrent=settings.search_max_concurrent,
                    default_delay_between_requests=settings.search_delay_between_requests,
                    provider_configs=provider_configs
                )
                worker_count = os.getenv('GUNICORN_WORKERS', '4')
                total_capacity = settings.search_rate_limit_per_minute * int(worker_count)
                logger.warning(
                    f"🔧 Initialized search rate limiter (per-worker, in-memory): "
                    f"{settings.search_rate_limit_per_minute} req/min, "
                    f"{settings.search_max_concurrent} concurrent, "
                    f"{settings.search_delay_between_requests}s delay. "
                    f"Cache: {'enabled' if settings.search_cache_enabled else 'disabled'}. "
                    f"⚠️ WARNING: Each Gunicorn worker ({worker_count} workers) has its own rate limiter instance. "
                    f"Total capacity across all workers: ~{total_capacity} req/min. "
                    f"Enable Redis (REDIS_ENABLED=true, REDIS_URL=...) for distributed rate limiting."
                )
    return _global_rate_limiter


def _parse_provider_configs_distributed() -> Dict[str, Any]:
    """Parse provider configs for distributed rate limiter."""
    from .distributed_rate_limiter import ProviderRateLimitConfig
    
    if not settings.search_provider_rate_limits:
        return {}
    
    try:
        config_dict = json.loads(settings.search_provider_rate_limits)
        provider_configs = {}
        
        for provider_name, config in config_dict.items():
            provider_configs[provider_name] = ProviderRateLimitConfig(
                max_requests_per_minute=config.get("max_requests_per_minute", settings.search_rate_limit_per_minute),
                max_concurrent=config.get("max_concurrent", settings.search_max_concurrent),
                delay_between_requests=config.get("delay_between_requests", settings.search_delay_between_requests),
                bucket_capacity=config.get("bucket_capacity"),
                refill_rate=config.get("refill_rate")
            )
        
        return provider_configs
    except (json.JSONDecodeError, KeyError, TypeError) as e:
        logger.warning(f"Failed to parse provider rate limit config: {e}. Using defaults.")
        return {}


def reset_rate_limiter() -> None:
    """Reset the global rate limiter (useful for testing)."""
    global _global_rate_limiter
    with _global_rate_limiter_lock:
        if _global_rate_limiter:
            _global_rate_limiter.cache.clear()
        _global_rate_limiter = None
