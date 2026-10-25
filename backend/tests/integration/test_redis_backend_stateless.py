"""
Integration tests for Redis-backed stateless backend.

These tests verify that the backend can scale horizontally using Redis for:
- Anonymous rate limiting across workers
- Shared caching across workers

Tests can run with either a real Redis instance (set TEST_REDIS_URL) or
will be skipped if Redis is not available.
"""

import os
from decimal import Decimal

import pytest

pytestmark = pytest.mark.integration

# Check if Redis is available for testing
TEST_REDIS_URL = os.environ.get("TEST_REDIS_URL", "redis://localhost:6379/15")


def redis_available() -> bool:
    """Check if a Redis instance is reachable."""
    try:
        import redis

        client = redis.from_url(TEST_REDIS_URL, socket_connect_timeout=2)
        client.ping()
        client.close()
        return True
    except Exception:
        return False


# Skip all tests in this module if Redis isn't available
pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(
        not redis_available(),
        reason="Redis not available for testing (set TEST_REDIS_URL or start Redis on localhost:6379)",
    ),
]


@pytest.fixture
def test_redis_client():
    """Provide a clean Redis client for testing, flushing the test DB before/after."""
    import redis

    client = redis.from_url(TEST_REDIS_URL, decode_responses=True)

    # Clean before test
    client.flushdb()

    yield client

    # Clean after test
    client.flushdb()
    client.close()


@pytest.fixture
def redis_rate_limiting(test_redis_client):
    """Set up Redis-backed rate limiting for testing."""
    from app.redis_client import init_redis_client

    # Initialize with test Redis URL
    client = init_redis_client(TEST_REDIS_URL)

    yield test_redis_client

    # Cleanup
    test_redis_client.flushdb()


class TestRedisRateLimitingDistributed:
    """Tests for distributed rate limiting using Redis."""

    def test_rate_limit_shared_across_workers(self, redis_rate_limiting, db_session):
        """Rate limits should be shared across simulated workers."""
        from app.rate_limiting import check_anonymous_credits, deduct_anonymous_credits

        identifier = "ip:192.168.1.50"

        # Worker 1: Deduct 20 credits
        deduct_anonymous_credits(identifier, Decimal("20"), "UTC")

        # Worker 2: Check credits (should see worker 1's deduction)
        # Don't pass db_session to avoid DB sync overwriting Redis state
        is_allowed, remaining, allocated = check_anonymous_credits(
            identifier, Decimal("5"), "UTC", None
        )

        # Should reflect the deduction from worker 1
        assert remaining == 30  # 50 - 20

    def test_atomic_credit_operations(self, redis_rate_limiting, db_session):
        """Credit operations should be atomic in Redis."""
        from app.rate_limiting import check_anonymous_credits, deduct_anonymous_credits

        identifier = "ip:192.168.1.51"

        # Simulate concurrent deductions
        deduct_anonymous_credits(identifier, Decimal("10"), "UTC")
        deduct_anonymous_credits(identifier, Decimal("15"), "UTC")

        # Check final state (without db_session to avoid DB sync)
        _, remaining, _ = check_anonymous_credits(identifier, Decimal("1"), "UTC", None)

        # Should have deducted both amounts
        assert remaining == 25  # 50 - 10 - 15

    def test_rate_limit_reset_at_midnight(self, redis_rate_limiting, db_session):
        """Rate limits should reset at local midnight."""
        from app.rate_limiting import check_anonymous_credits, deduct_anonymous_credits

        identifier = "ip:192.168.1.52"

        # Use credits on "day 1"
        deduct_anonymous_credits(identifier, Decimal("30"), "UTC")
        _, remaining_day1, _ = check_anonymous_credits(identifier, Decimal("1"), "UTC", None)
        assert remaining_day1 == 20

        # Simulate next day by manually updating the stored date
        from app.redis_client import get_redis_client

        redis_client = get_redis_client()

        if redis_client and redis_client.is_available:
            with redis_client.get_sync_connection() as conn:
                if conn:
                    key = f"rate_limit:anon:{identifier}"
                    conn.delete(key)

        # Check on "day 2" - should be reset
        _, remaining_day2, _ = check_anonymous_credits(identifier, Decimal("1"), "UTC", db_session)
        assert remaining_day2 == 50  # Full allocation


class TestRedisCacheDistributed:
    """Tests for distributed caching using Redis."""

    def test_cache_shared_across_workers(self, redis_rate_limiting):
        """Cache should be shared across simulated workers."""
        from app.cache import cache

        key = "shared_cache_key"
        value = {"data": "shared_value"}

        # Worker 1: Set cache
        cache.set(key, value, ttl_seconds=300)

        # Worker 2: Get cache (should see worker 1's value)
        retrieved = cache.get(key)
        assert retrieved == value

    def test_cache_invalidation_propagates(self, redis_rate_limiting):
        """Cache invalidation should propagate across workers."""
        from app.cache import cache

        key = "invalidation_test"
        value = "test_value"

        # Worker 1: Set cache
        cache.set(key, value)

        # Worker 2: Verify it's there
        assert cache.get(key) == value

        # Worker 1: Delete cache
        cache.delete(key)

        # Worker 2: Should be gone
        assert cache.get(key) is None

    def test_cache_ttl_respected(self, redis_rate_limiting):
        """Cache TTL should be respected in Redis."""
        import time

        from app.cache import cache

        key = "ttl_test"
        value = "ttl_value"

        # Set with short TTL
        cache.set(key, value, ttl_seconds=2)

        # Should be available immediately
        assert cache.get(key) == value

        # Verify TTL is set in Redis
        ttl = redis_rate_limiting.ttl(f"cache:{key}")
        assert ttl > 0  # TTL should be set

        # Wait for expiry
        time.sleep(2.5)

        # Should be expired in real Redis
        retrieved = cache.get(key)
        # In Redis, this should be None after TTL expires
        assert retrieved is None


class TestRedisFailoverScenarios:
    """Tests for Redis failure and recovery scenarios."""

    def test_fallback_to_memory_on_redis_failure(self, db_session):
        """Should fall back to memory when Redis fails."""
        from app.rate_limiting import check_anonymous_credits, deduct_anonymous_credits
        from app.redis_client import init_redis_client

        # Initialize with invalid Redis (simulates Redis down)
        init_redis_client("redis://nonexistent:9999/0")

        identifier = "ip:192.168.1.60"

        # Should still work using in-memory fallback
        deduct_anonymous_credits(identifier, Decimal("10"), "UTC")
        is_allowed, remaining, allocated = check_anonymous_credits(
            identifier, Decimal("5"), "UTC", None
        )

        # Should work (using fallback)
        assert isinstance(is_allowed, bool)
        assert remaining < allocated
        assert remaining == 40  # 50 - 10

    def test_cache_fallback_on_redis_failure(self):
        """Cache should fall back to memory when Redis fails."""
        from app.cache import cache
        from app.redis_client import init_redis_client

        # Initialize with invalid Redis
        init_redis_client("redis://nonexistent:9999/0")

        key = "fallback_test"
        value = "fallback_value"

        # Should still work using in-memory fallback
        cache.set(key, value)
        retrieved = cache.get(key)

        assert retrieved == value


class TestRedisMemoryManagement:
    """Tests for Redis memory management and eviction."""

    def test_redis_key_naming_convention(self, redis_rate_limiting):
        """Redis keys should follow naming conventions."""
        from app.cache import cache
        from app.rate_limiting import deduct_anonymous_credits

        identifier = "ip:192.168.1.70"

        # Generate some rate limit and cache keys
        deduct_anonymous_credits(identifier, Decimal("5"), "UTC")
        cache.set("test_key", "test_value")

        # Check Redis keys follow conventions
        keys = redis_rate_limiting.keys("*")

        # Should have keys with proper prefixes
        rate_limit_keys = [k for k in keys if k.startswith("rate_limit:anon:")]
        cache_keys = [k for k in keys if k.startswith("cache:")]

        assert len(rate_limit_keys) > 0 or len(cache_keys) > 0

    def test_redis_ttl_set_on_rate_limit_keys(self, redis_rate_limiting):
        """Rate limit keys should have TTL set to prevent unbounded growth."""
        from app.rate_limiting import deduct_anonymous_credits

        identifier = "ip:192.168.1.71"
        deduct_anonymous_credits(identifier, Decimal("5"), "UTC")

        key = f"rate_limit:anon:{identifier}"
        ttl = redis_rate_limiting.ttl(key)

        # TTL should be set (not -1 which means no expiry)
        # We set it to 172800 seconds (48 hours) in the code
        assert ttl > 0


class TestRedisProductionScenarios:
    """Tests simulating production scenarios with multiple workers."""

    def test_concurrent_worker_credit_checks(self, redis_rate_limiting, db_session):
        """Simulate multiple workers checking credits concurrently."""
        from app.rate_limiting import check_anonymous_credits, deduct_anonymous_credits

        identifier = "ip:192.168.1.80"

        # Simulate multiple workers deducting credits
        for _ in range(5):
            deduct_anonymous_credits(identifier, Decimal("5"), "UTC")

        # Any worker should see consistent state (without db_session to avoid DB sync)
        _, remaining, allocated = check_anonymous_credits(identifier, Decimal("1"), "UTC", None)

        # Should have deducted 5*5 = 25 credits
        assert remaining == 25

    def test_cache_consistency_across_workers(self, redis_rate_limiting):
        """Cache should remain consistent across worker updates."""
        from app.cache import cache

        key = "worker_shared_settings"

        # Worker 1 sets initial value
        cache.set(key, {"version": 1})

        # Worker 2 reads
        value = cache.get(key)
        assert value == {"version": 1}

        # Worker 3 updates
        cache.set(key, {"version": 2})

        # Worker 4 reads updated value
        value = cache.get(key)
        assert value == {"version": 2}
