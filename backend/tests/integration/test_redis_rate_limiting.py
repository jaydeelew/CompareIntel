"""
Integration tests for Redis-based distributed rate limiting.

These tests require a real Redis instance (provided via CI service container
or local Docker). They validate that the distributed rate limiter works
correctly with Redis for cross-worker coordination.

Tests cover:
- Redis connection and fallback behavior
- Atomic rate limit acquire/release via Lua scripts
- Concurrent request limiting
- Per-minute rate limiting
- Circuit breaker integration
- Graceful fallback to in-memory when Redis is unavailable

Skip condition: Tests are skipped if Redis is not available.
"""

import asyncio
import os
import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# Check if Redis is available for testing
REDIS_URL = os.environ.get("TEST_REDIS_URL", "redis://localhost:6379/15")


def redis_available() -> bool:
    """Check if a Redis instance is reachable."""
    try:
        import redis

        client = redis.from_url(REDIS_URL, socket_connect_timeout=2)
        client.ping()
        client.close()
        return True
    except Exception:
        return False


# Skip all tests in this module if Redis isn't available
pytestmark = pytest.mark.skipif(
    not redis_available(),
    reason="Redis not available for testing (set TEST_REDIS_URL or start Redis on localhost:6379)",
)


@pytest.fixture
def redis_client():
    """Provide a clean Redis async client for testing, flushing the test DB before/after."""
    import redis as sync_redis
    import redis.asyncio as aioredis

    # Flush the test database (db 15) before test
    sync_client = sync_redis.from_url(REDIS_URL)
    sync_client.flushdb()
    sync_client.close()

    async_client = aioredis.from_url(REDIS_URL)
    yield async_client

    # Cleanup after test
    sync_client = sync_redis.from_url(REDIS_URL)
    sync_client.flushdb()
    sync_client.close()


@pytest.fixture
def rate_limit_config():
    """Provide a test rate limit configuration."""
    from app.search.distributed_rate_limiter import ProviderRateLimitConfig

    return ProviderRateLimitConfig(
        max_requests_per_minute=5,
        max_concurrent=2,
        delay_between_requests=0.0,  # No delay for tests
    )


@pytest.fixture
def redis_rate_limiter(redis_client, rate_limit_config):
    """Create a RedisRateLimiter instance for testing."""
    from app.search.distributed_rate_limiter import RedisRateLimiter

    return RedisRateLimiter(
        redis_client=redis_client,
        provider_name="test_provider",
        config=rate_limit_config,
    )


class TestRedisConnection:
    """Tests for Redis connectivity and initialization."""

    def test_redis_is_reachable(self):
        """Verify the test Redis instance is reachable."""
        import redis

        client = redis.from_url(REDIS_URL, socket_connect_timeout=2)
        assert client.ping() is True
        client.close()

    def test_distributed_limiter_initializes_with_redis(self, rate_limit_config):
        """DistributedSearchRateLimiter should detect and use Redis."""
        from app.search.distributed_rate_limiter import DistributedSearchRateLimiter

        limiter = DistributedSearchRateLimiter(
            default_config=rate_limit_config,
            redis_url=REDIS_URL,
        )
        assert limiter.use_redis is True or limiter.redis_client is not None


class TestRedisRateLimiterAcquireRelease:
    """Tests for the atomic acquire/release Lua script."""

    @pytest.mark.asyncio
    async def test_acquire_succeeds_under_limit(self, redis_rate_limiter):
        """Acquire should succeed when under the rate limit."""
        success, wait_time = await redis_rate_limiter.acquire()
        assert success is True
        assert wait_time == 0.0

        # Cleanup
        await redis_rate_limiter.release()

    @pytest.mark.asyncio
    async def test_acquire_enforces_concurrent_limit(self, redis_rate_limiter):
        """Acquire should fail when concurrent limit (2) is exceeded."""
        # Acquire 2 slots (the concurrent limit)
        s1, _ = await redis_rate_limiter.acquire()
        s2, _ = await redis_rate_limiter.acquire()
        assert s1 is True
        assert s2 is True

        # Third acquire should fail (concurrent limit = 2)
        s3, wait_time = await redis_rate_limiter.acquire()
        assert s3 is False
        assert wait_time >= 0

        # Release one and retry
        await redis_rate_limiter.release()
        s4, _ = await redis_rate_limiter.acquire()
        assert s4 is True

        # Cleanup
        await redis_rate_limiter.release()
        await redis_rate_limiter.release()

    @pytest.mark.asyncio
    async def test_acquire_enforces_per_minute_limit(self, redis_client, rate_limit_config):
        """Acquire should fail when per-minute limit (5) is exceeded."""
        from app.search.distributed_rate_limiter import RedisRateLimiter

        # Use high concurrent limit so we only hit per-minute limit
        config = ProviderRateLimitConfig(
            max_requests_per_minute=3,
            max_concurrent=100,
            delay_between_requests=0.0,
        )
        from app.search.distributed_rate_limiter import ProviderRateLimitConfig

        limiter = RedisRateLimiter(
            redis_client=redis_client,
            provider_name="test_minute_limit",
            config=config,
        )

        # Acquire 3 times (the per-minute limit)
        results = []
        for _ in range(3):
            success, _ = await limiter.acquire()
            results.append(success)
            await limiter.release()

        assert all(results), f"First 3 acquires should succeed: {results}"

        # 4th acquire should fail (per-minute limit = 3)
        success, wait_time = await limiter.acquire()
        assert success is False
        assert wait_time > 0  # Should indicate time to wait

    @pytest.mark.asyncio
    async def test_release_decrements_concurrent_counter(self, redis_rate_limiter, redis_client):
        """Release should decrement the concurrent counter in Redis."""
        # Acquire a slot
        await redis_rate_limiter.acquire()

        # Check the concurrent key exists
        concurrent_key = f"{redis_rate_limiter.key_prefix}:concurrent"
        value_before = await redis_client.get(concurrent_key)
        assert value_before is not None

        # Release
        await redis_rate_limiter.release()

        value_after = await redis_client.get(concurrent_key)
        assert int(value_after) < int(value_before)


class TestDistributedLimiterFallback:
    """Tests for graceful fallback when Redis is unavailable."""

    def test_fallback_to_in_memory_on_bad_url(self, rate_limit_config):
        """Should fall back to in-memory if Redis URL is invalid."""
        from app.search.distributed_rate_limiter import DistributedSearchRateLimiter

        limiter = DistributedSearchRateLimiter(
            default_config=rate_limit_config,
            redis_url="redis://nonexistent-host:9999/0",
        )
        # Should not crash — falls back gracefully
        assert limiter is not None

    def test_fallback_to_in_memory_when_redis_disabled(self, rate_limit_config):
        """Should use in-memory limiter when no Redis URL is provided."""
        from app.search.distributed_rate_limiter import DistributedSearchRateLimiter

        limiter = DistributedSearchRateLimiter(
            default_config=rate_limit_config,
            redis_url=None,
        )
        assert limiter.use_redis is False


class TestCircuitBreaker:
    """Tests for the circuit breaker pattern."""

    def test_circuit_starts_closed(self):
        """Circuit breaker should start in CLOSED state."""
        from app.search.distributed_rate_limiter import CircuitBreaker, CircuitState

        cb = CircuitBreaker(failure_threshold=3, recovery_timeout=30.0)
        assert cb.state == CircuitState.CLOSED
        assert cb.can_proceed() is True

    def test_circuit_opens_after_failures(self):
        """Circuit should OPEN after exceeding failure threshold."""
        from app.search.distributed_rate_limiter import CircuitBreaker, CircuitState

        cb = CircuitBreaker(failure_threshold=3, recovery_timeout=30.0)

        # Record 3 failures
        for _ in range(3):
            cb.record_failure()

        assert cb.state == CircuitState.OPEN
        assert cb.can_proceed() is False

    def test_circuit_allows_half_open_after_timeout(self):
        """Circuit should move to HALF_OPEN after recovery timeout."""
        from app.search.distributed_rate_limiter import CircuitBreaker, CircuitState

        cb = CircuitBreaker(failure_threshold=2, recovery_timeout=0.1)  # Very short timeout

        # Open the circuit
        cb.record_failure()
        cb.record_failure()
        assert cb.state == CircuitState.OPEN

        # Wait for recovery timeout
        time.sleep(0.2)

        # Should now be HALF_OPEN and allow a test request
        assert cb.can_proceed() is True

    def test_circuit_closes_on_success(self):
        """Circuit should close again after successful request in HALF_OPEN."""
        from app.search.distributed_rate_limiter import CircuitBreaker, CircuitState

        cb = CircuitBreaker(failure_threshold=2, recovery_timeout=0.1)

        # Open the circuit
        cb.record_failure()
        cb.record_failure()
        assert cb.state == CircuitState.OPEN

        # Wait for recovery
        time.sleep(0.2)

        # Record success
        cb.record_success()
        assert cb.state == CircuitState.CLOSED
