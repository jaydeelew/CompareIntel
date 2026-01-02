"""
Distributed rate limiter with Redis backend and in-memory fallback.

This module provides a production-ready distributed rate limiting solution
that works across multiple Gunicorn workers using Redis, with graceful
fallback to in-memory rate limiting if Redis is unavailable.

Features:
- Token bucket algorithm (better burst handling than sliding window)
- Redis-based distributed coordination across workers
- Circuit breaker pattern for API failures
- Adaptive rate limiting based on API responses
- Graceful degradation to in-memory if Redis unavailable
"""

import asyncio
import hashlib
import json
import logging
import os
import time
import threading
from dataclasses import dataclass, asdict
from typing import Optional, Dict, Any, Tuple
from collections import deque
from enum import Enum

try:
    import redis.asyncio as aioredis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False
    aioredis = None

from ..config.settings import settings

# Import cache from the original rate limiter
from .rate_limiter import SearchResultCache

logger = logging.getLogger(__name__)


class CircuitState(Enum):
    """Circuit breaker states."""
    CLOSED = "closed"  # Normal operation
    OPEN = "open"      # Failing, reject requests
    HALF_OPEN = "half_open"  # Testing if service recovered


@dataclass
class ProviderRateLimitConfig:
    """Rate limit configuration for a specific provider."""
    max_requests_per_minute: int
    max_concurrent: int
    delay_between_requests: float
    # Token bucket parameters
    bucket_capacity: int = None  # Max tokens (burst capacity)
    refill_rate: float = None  # Tokens per second
    
    def __post_init__(self):
        """Set defaults for token bucket if not provided."""
        if self.bucket_capacity is None:
            # Allow burst of up to 2x the per-minute limit
            self.bucket_capacity = max(2, self.max_requests_per_minute // 30)
        if self.refill_rate is None:
            # Refill at rate to allow max_requests_per_minute
            self.refill_rate = self.max_requests_per_minute / 60.0


@dataclass
class CircuitBreakerConfig:
    """Circuit breaker configuration."""
    failure_threshold: int = 5  # Open circuit after N failures
    success_threshold: int = 2  # Close circuit after N successes
    timeout_seconds: float = 60.0  # Time before attempting half-open


class TokenBucket:
    """Thread-safe token bucket implementation."""
    
    def __init__(self, capacity: int, refill_rate: float):
        """
        Initialize token bucket.
        
        Args:
            capacity: Maximum number of tokens
            refill_rate: Tokens added per second
        """
        self.capacity = capacity
        self.refill_rate = refill_rate
        self.tokens = float(capacity)
        self.last_refill = time.time()
        self._lock = threading.Lock()
    
    def consume(self, tokens: int = 1) -> bool:
        """
        Try to consume tokens from the bucket.
        
        Args:
            tokens: Number of tokens to consume
            
        Returns:
            True if tokens were consumed, False if insufficient tokens
        """
        with self._lock:
            now = time.time()
            elapsed = now - self.last_refill
            
            # Refill tokens based on elapsed time
            self.tokens = min(
                self.capacity,
                self.tokens + (elapsed * self.refill_rate)
            )
            self.last_refill = now
            
            # Check if we have enough tokens
            if self.tokens >= tokens:
                self.tokens -= tokens
                return True
            return False
    
    def get_wait_time(self, tokens: int = 1) -> float:
        """Calculate how long to wait before tokens are available."""
        with self._lock:
            now = time.time()
            elapsed = now - self.last_refill
            current_tokens = min(
                self.capacity,
                self.tokens + (elapsed * self.refill_rate)
            )
            
            if current_tokens >= tokens:
                return 0.0
            
            needed = tokens - current_tokens
            return needed / self.refill_rate


class CircuitBreaker:
    """Circuit breaker for API failure handling."""
    
    def __init__(self, config: CircuitBreakerConfig):
        """Initialize circuit breaker."""
        self.config = config
        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.success_count = 0
        self.last_failure_time = None
        self._lock = threading.Lock()
    
    def record_success(self):
        """Record a successful request."""
        with self._lock:
            if self.state == CircuitState.HALF_OPEN:
                self.success_count += 1
                if self.success_count >= self.config.success_threshold:
                    self.state = CircuitState.CLOSED
                    self.failure_count = 0
                    self.success_count = 0
                    logger.info("Circuit breaker: CLOSED (service recovered)")
            elif self.state == CircuitState.CLOSED:
                self.failure_count = 0
    
    def record_failure(self):
        """Record a failed request."""
        with self._lock:
            self.failure_count += 1
            self.last_failure_time = time.time()
            
            if self.state == CircuitState.CLOSED:
                if self.failure_count >= self.config.failure_threshold:
                    self.state = CircuitState.OPEN
                    logger.warning(
                        f"Circuit breaker: OPEN (failure threshold reached: {self.failure_count})"
                    )
            elif self.state == CircuitState.HALF_OPEN:
                self.state = CircuitState.OPEN
                self.success_count = 0
                logger.warning("Circuit breaker: OPEN (failure in half-open state)")
    
    def can_proceed(self) -> bool:
        """Check if requests can proceed."""
        with self._lock:
            if self.state == CircuitState.CLOSED:
                return True
            
            if self.state == CircuitState.OPEN:
                # Check if timeout has passed
                if self.last_failure_time:
                    elapsed = time.time() - self.last_failure_time
                    if elapsed >= self.config.timeout_seconds:
                        self.state = CircuitState.HALF_OPEN
                        self.success_count = 0
                        logger.info("Circuit breaker: HALF_OPEN (testing recovery)")
                        return True
                return False
            
            # HALF_OPEN: allow requests to test recovery
            return True


class RedisRateLimiter:
    """Redis-based distributed rate limiter with atomic operations."""
    
    # Lua script for atomic rate limit check and increment
    # This ensures no race conditions between workers
    ACQUIRE_SCRIPT = """
    local minute_key = KEYS[1]
    local concurrent_key = KEYS[2]
    local minute_limit = tonumber(ARGV[1])
    local concurrent_limit = tonumber(ARGV[2])
    local expire_seconds = tonumber(ARGV[3])
    
    -- Get current counts
    local minute_count = redis.call('GET', minute_key)
    local concurrent_count = redis.call('GET', concurrent_key)
    
    minute_count = minute_count and tonumber(minute_count) or 0
    concurrent_count = concurrent_count and tonumber(concurrent_count) or 0
    
    -- Check limits BEFORE incrementing (atomic check)
    if minute_count >= minute_limit then
        return {0, minute_count, concurrent_count}  -- Rate limit exceeded
    end
    
    if concurrent_count >= concurrent_limit then
        return {0, minute_count, concurrent_count}  -- Concurrent limit exceeded
    end
    
    -- Increment counters atomically
    minute_count = redis.call('INCR', minute_key)
    redis.call('EXPIRE', minute_key, expire_seconds)
    concurrent_count = redis.call('INCR', concurrent_key)
    
    return {1, minute_count, concurrent_count}  -- Success
    """
    
    def __init__(self, redis_client: Any, provider_name: str, config: ProviderRateLimitConfig):
        """
        Initialize Redis rate limiter.
        
        Args:
            redis_client: Redis async client
            provider_name: Provider identifier
            config: Rate limit configuration
        """
        self.redis = redis_client
        self.provider_name = provider_name
        self.config = config
        self.key_prefix = f"rate_limit:{provider_name}"
        # Load Lua script once for efficiency
        self._acquire_script_sha = None
    
    async def _ensure_script_loaded(self):
        """Ensure Lua script is loaded in Redis (skipped - using EVAL directly to avoid event loop issues)."""
        # Skip script loading optimization - use EVAL directly to avoid event loop mismatches
        # The performance difference is minimal and this avoids complex event loop handling
        self._acquire_script_sha = None
    
    async def acquire(self) -> Tuple[bool, float]:
        """
        Try to acquire permission for a request atomically.
        
        Returns:
            Tuple of (success, wait_time_seconds)
        """
        now = time.time()
        minute_key = f"{self.key_prefix}:minute:{int(now // 60)}"
        concurrent_key = f"{self.key_prefix}:concurrent"
        
        try:
            # Use EVAL directly (skipping script loading to avoid event loop issues)
            result = await self.redis.eval(
                self.ACQUIRE_SCRIPT,
                2,  # Number of keys
                minute_key,
                concurrent_key,
                str(self.config.max_requests_per_minute),
                str(self.config.max_concurrent),
                "60"  # Expire seconds
            )
            
            success = result[0] == 1
            minute_count = result[1]
            concurrent_count = result[2]
            
            if not success:
                # Calculate wait time
                if minute_count >= self.config.max_requests_per_minute:
                    wait_time = 60 - (now % 60) + 0.1
                else:
                    wait_time = 0.1  # Retry quickly for concurrent limit
                return False, wait_time
            
            return True, 0.0
            
        except Exception as e:
            logger.error(f"Redis acquire error: {e}")
            # Fallback: try simple increment and check (non-atomic but better than nothing)
            try:
                pipe = self.redis.pipeline()
                pipe.get(minute_key)
                pipe.get(concurrent_key)
                pipe.incr(minute_key)
                pipe.expire(minute_key, 60)
                pipe.incr(concurrent_key)
                results = await pipe.execute()
                
                # results[0] = minute_count (before increment), results[1] = concurrent_count (before increment)
                # results[2] = minute_count (after increment), results[3] = expire result, results[4] = concurrent_count (after increment)
                minute_count_after = results[2] or 1
                concurrent_count_after = results[4] or 1
                
                if minute_count_after > self.config.max_requests_per_minute:
                    await self.redis.decr(minute_key)
                    await self.redis.decr(concurrent_key)
                    wait_time = 60 - (now % 60) + 0.1
                    return False, wait_time
                
                if concurrent_count_after > self.config.max_concurrent:
                    await self.redis.decr(minute_key)
                    await self.redis.decr(concurrent_key)
                    return False, 0.1
                
                return True, 0.0
            except Exception as e2:
                logger.error(f"Redis fallback acquire also failed: {e2}")
                raise
    
    async def release(self):
        """Release concurrent slot."""
        concurrent_key = f"{self.key_prefix}:concurrent"
        try:
            await self.redis.decr(concurrent_key)
        except Exception as e:
            logger.warning(f"Redis release error: {e}")
            # Don't raise - release is best-effort


class DistributedSearchRateLimiter:
    """
    Production-ready distributed rate limiter.
    
    Uses Redis for coordination across workers, with in-memory fallback.
    Implements token bucket algorithm and circuit breaker pattern.
    """
    
    def __init__(
        self,
        default_config: ProviderRateLimitConfig,
        provider_configs: Optional[Dict[str, ProviderRateLimitConfig]] = None,
        redis_url: Optional[str] = None,
        enable_circuit_breaker: bool = True
    ):
        """
        Initialize distributed rate limiter.
        
        Args:
            default_config: Default rate limit configuration
            provider_configs: Provider-specific configurations
            redis_url: Redis connection URL (optional)
            enable_circuit_breaker: Enable circuit breaker pattern
        """
        self.default_config = default_config
        self.provider_configs = provider_configs or {}
        self.enable_circuit_breaker = enable_circuit_breaker
        
        # Redis setup
        self.redis_client = None
        self.use_redis = False
        self._redis_lock = threading.Lock()
        self._redis_url = redis_url
        self._redis_connection_verified = False
        
        if redis_url and REDIS_AVAILABLE:
            try:
                self._init_redis(redis_url)
            except Exception as e:
                logger.warning(f"Failed to initialize Redis: {e}. Using in-memory fallback.")
        
        # In-memory fallback (per-worker)
        self._buckets: Dict[str, TokenBucket] = {}
        self._concurrent_counts: Dict[str, int] = {}
        self._request_times: Dict[str, deque] = {}
        self._locks: Dict[str, threading.Lock] = {}
        self._state_lock = threading.Lock()
        
        # Circuit breakers per provider
        self._circuit_breakers: Dict[str, CircuitBreaker] = {}
        
        # Adaptive rate limiting: track API responses
        self._api_response_times: Dict[str, deque] = {}
        self._rate_limit_events: Dict[str, int] = {}
        
        # Cache for request deduplication (shared with in-memory limiter)
        # Import here to avoid circular import with rate_limiter.py
        from .rate_limiter import SearchResultCache
        self.cache = SearchResultCache(ttl_seconds=settings.search_cache_ttl_seconds)
    
    def _init_redis(self, redis_url: str):
        """Initialize Redis connection (sync, connection tested on first async use)."""
        if not REDIS_AVAILABLE:
            return
        
        try:
            # Create Redis client - connection will be tested on first async use
            self.redis_client = aioredis.from_url(
                redis_url,
                encoding="utf-8",
                decode_responses=True,
                socket_connect_timeout=5,
                socket_timeout=5,
                retry_on_timeout=True,
                health_check_interval=30
            )
            self.use_redis = True
            logger.info("✅ Redis client created - will test connection on first use")
        except Exception as e:
            logger.warning(f"Redis client creation failed: {e}. Using in-memory fallback.")
            self.use_redis = False
            self.redis_client = None
    
    async def _ensure_redis_connection(self) -> bool:
        """Ensure Redis connection is working, recreate client if event loop mismatch."""
        if not self.use_redis:
            return False
        
        # If client exists, try to use it
        if self.redis_client is not None:
            # Test if client works in current event loop
            if not self._redis_connection_verified:
                try:
                    await asyncio.wait_for(self.redis_client.ping(), timeout=2.0)
                    self._redis_connection_verified = True
                    logger.info("✅ Redis connection verified")
                    return True
                except (RuntimeError, AttributeError, Exception) as e:
                    # Event loop mismatch or connection issue - recreate client
                    error_msg = str(e).lower()
                    if "different loop" in error_msg or "attached to a different" in error_msg:
                        logger.debug(f"Redis client event loop mismatch detected, recreating client")
                    else:
                        logger.debug(f"Redis connection test failed, will recreate: {e}")
                    
                    # Close old client
                    try:
                        await self.redis_client.aclose()
                    except Exception:
                        pass
                    self.redis_client = None
                    self._redis_connection_verified = False
            else:
                # Already verified, should work
                return True
        
        # Create or recreate Redis client for current event loop
        if self.redis_client is None and self._redis_url:
            try:
                self.redis_client = aioredis.from_url(
                    self._redis_url,
                    encoding="utf-8",
                    decode_responses=True,
                    socket_connect_timeout=5,
                    socket_timeout=5,
                    retry_on_timeout=True,
                    health_check_interval=30
                )
                # Test connection
                await asyncio.wait_for(self.redis_client.ping(), timeout=2.0)
                self._redis_connection_verified = True
                logger.info("✅ Redis connection verified")
                return True
            except Exception as e:
                logger.warning(f"Redis connection failed: {e}. Falling back to in-memory.")
                self.use_redis = False
                self._redis_connection_verified = False
                if self.redis_client:
                    try:
                        await self.redis_client.aclose()
                    except Exception:
                        pass
                    self.redis_client = None
                return False
        
        return False
    
    def _get_provider_config(self, provider_name: str) -> ProviderRateLimitConfig:
        """Get configuration for provider."""
        return self.provider_configs.get(provider_name, self.default_config)
    
    def _get_provider_state(self, provider_name: str) -> Tuple[threading.Lock, TokenBucket, deque, int]:
        """Get or create state for provider."""
        if provider_name not in self._locks:
            with self._state_lock:
                if provider_name not in self._locks:
                    config = self._get_provider_config(provider_name)
                    self._locks[provider_name] = threading.Lock()
                    self._buckets[provider_name] = TokenBucket(
                        config.bucket_capacity,
                        config.refill_rate
                    )
                    self._request_times[provider_name] = deque()
                    self._concurrent_counts[provider_name] = 0
                    self._circuit_breakers[provider_name] = CircuitBreaker(
                        CircuitBreakerConfig()
                    )
                    self._api_response_times[provider_name] = deque(maxlen=100)
        return (
            self._locks[provider_name],
            self._buckets[provider_name],
            self._request_times[provider_name],
            self._concurrent_counts[provider_name]
        )
    
    async def acquire(self, provider_name: str = "default") -> None:
        """
        Acquire permission to make a request.
        
        Uses Redis if available, otherwise falls back to in-memory.
        """
        config = self._get_provider_config(provider_name)
        
        # Check circuit breaker
        if self.enable_circuit_breaker:
            lock, _, _, _ = self._get_provider_state(provider_name)
            with lock:
                circuit_breaker = self._circuit_breakers[provider_name]
                if not circuit_breaker.can_proceed():
                    wait_time = config.delay_between_requests * 2
                    logger.warning(
                        f"🚫 Circuit breaker OPEN for {provider_name}. "
                        f"Waiting {wait_time:.1f}s before retry."
                    )
                    await asyncio.sleep(wait_time)
                    # Try again
                    with lock:
                        if not circuit_breaker.can_proceed():
                            raise Exception(
                                f"Circuit breaker is OPEN for {provider_name}. "
                                f"API is currently unavailable."
                            )
        
        # Try Redis first if available
        if await self._ensure_redis_connection():
            try:
                redis_limiter = RedisRateLimiter(
                    self.redis_client,
                    provider_name,
                    config
                )
                success, wait_time = await redis_limiter.acquire()
                if success:
                    # Also update local state for monitoring
                    lock, bucket, request_times, _ = self._get_provider_state(provider_name)
                    with lock:
                        request_times.append(time.time())
                    logger.debug(
                        f"✅ Acquired rate limiter slot for {provider_name} via Redis"
                    )
                    if config.delay_between_requests > 0:
                        await asyncio.sleep(config.delay_between_requests)
                    return
                else:
                    logger.warning(
                        f"⏸️ Redis rate limit reached for {provider_name}. "
                        f"Waiting {wait_time:.2f}s"
                    )
                    await asyncio.sleep(wait_time)
                    # Retry
                    return await self.acquire(provider_name)
            except Exception as e:
                logger.warning(f"Redis error ({e}), falling back to in-memory rate limiting")
                self.use_redis = False
                self._redis_connection_verified = False
                # Continue to in-memory fallback
        
        # In-memory fallback (token bucket + sliding window)
        lock, bucket, request_times, concurrent_count_ref = self._get_provider_state(provider_name)
        
        while True:
            with lock:
                now = time.time()
                
                # Clean old requests from sliding window
                while request_times and (now - request_times[0]) > 60:
                    request_times.popleft()
                
                # Check concurrent limit
                if self._concurrent_counts[provider_name] >= config.max_concurrent:
                    wait_time = 0.1
                # Check per-minute limit
                elif len(request_times) >= config.max_requests_per_minute:
                    oldest = request_times[0]
                    wait_time = 60 - (now - oldest) + 0.1
                    self._rate_limit_events[provider_name] = \
                        self._rate_limit_events.get(provider_name, 0) + 1
                    logger.warning(
                        f"⏸️ Rate limit reached for {provider_name} "
                        f"({len(request_times)}/{config.max_requests_per_minute}). "
                        f"Waiting {wait_time:.2f}s"
                    )
                # Check token bucket
                elif not bucket.consume(1):
                    wait_time = bucket.get_wait_time(1)
                    logger.warning(
                        f"⏸️ Token bucket empty for {provider_name}. "
                        f"Waiting {wait_time:.2f}s"
                    )
                else:
                    # Success - acquire slot
                    self._concurrent_counts[provider_name] += 1
                    request_times.append(now)
                    logger.warning(
                        f"✅ Acquired rate limiter slot for {provider_name} "
                        f"({len(request_times)}/{config.max_requests_per_minute} in window, "
                        f"{self._concurrent_counts[provider_name]}/{config.max_concurrent} concurrent)"
                    )
                    break
            
            await asyncio.sleep(wait_time)
        
        # Add delay between requests
        if config.delay_between_requests > 0:
            await asyncio.sleep(config.delay_between_requests)
    
    def release(self, provider_name: str = "default"):
        """
        Release concurrent slot (synchronous for compatibility).
        
        This method is synchronous for compatibility with the old rate limiter interface.
        Redis release is handled asynchronously in the background when possible.
        """
        # Always update in-memory state immediately (sync)
        lock, _, _, _ = self._get_provider_state(provider_name)
        with lock:
            self._concurrent_counts[provider_name] = max(
                0,
                self._concurrent_counts[provider_name] - 1
            )
        
        # Try Redis release asynchronously (fire-and-forget, best effort)
        if self.use_redis and self.redis_client:
            try:
                # Try to get the current event loop
                try:
                    loop = asyncio.get_running_loop()
                    # We're in an async context, schedule the release
                    async def _async_release():
                        try:
                            if await self._ensure_redis_connection():
                                redis_limiter = RedisRateLimiter(
                                    self.redis_client,
                                    provider_name,
                                    self._get_provider_config(provider_name)
                                )
                                await redis_limiter.release()
                        except Exception as e:
                            logger.debug(f"Redis release error (non-critical): {e}")
                    
                    # Schedule but don't await (fire-and-forget)
                    loop.create_task(_async_release())
                except RuntimeError:
                    # No running event loop, can't do async operation
                    # This is fine - in-memory state was already updated
                    pass
            except Exception as e:
                logger.debug(f"Could not schedule async Redis release: {e}")
    
    def record_success(self, provider_name: str, response_time: float):
        """Record successful API call for adaptive rate limiting."""
        lock, _, _, _ = self._get_provider_state(provider_name)
        with lock:
            circuit_breaker = self._circuit_breakers[provider_name]
            circuit_breaker.record_success()
            self._api_response_times[provider_name].append(response_time)
    
    def record_failure(self, provider_name: str, error_type: str = "rate_limit"):
        """Record failed API call."""
        lock, _, _, _ = self._get_provider_state(provider_name)
        with lock:
            circuit_breaker = self._circuit_breakers[provider_name]
            circuit_breaker.record_failure()
            if error_type == "rate_limit":
                self._rate_limit_events[provider_name] = \
                    self._rate_limit_events.get(provider_name, 0) + 1
    
    def get_stats(self) -> Dict[str, Any]:
        """Get monitoring statistics."""
        stats = {
            "redis_enabled": self.use_redis,
            "circuit_breaker_enabled": self.enable_circuit_breaker,
            "rate_limit_events": dict(self._rate_limit_events),
            "providers": {}
        }
        
        for provider_name in self._locks.keys():
            lock, bucket, request_times, concurrent_count = self._get_provider_state(provider_name)
            config = self._get_provider_config(provider_name)
            circuit_breaker = self._circuit_breakers.get(provider_name)
            
            with lock:
                stats["providers"][provider_name] = {
                    "requests_in_window": len(request_times),
                    "max_requests_per_minute": config.max_requests_per_minute,
                    "current_concurrent": self._concurrent_counts[provider_name],
                    "max_concurrent": config.max_concurrent,
                    "tokens_available": bucket.tokens if hasattr(bucket, 'tokens') else 0,
                    "circuit_state": circuit_breaker.state.value if circuit_breaker else "unknown",
                    "rate_limit_hits": self._rate_limit_events.get(provider_name, 0)
                }
        
        return stats
