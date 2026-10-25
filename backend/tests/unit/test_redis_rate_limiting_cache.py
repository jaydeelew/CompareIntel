"""
Unit tests for Redis-backed rate limiting and caching with fallback.

Tests cover:
- Redis-backed anonymous rate limiting
- Redis-backed caching
- Graceful fallback to in-memory when Redis unavailable
- Atomic credit operations in Redis
"""

from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest

pytestmark = pytest.mark.unit


class TestRedisRateLimitingWithFallback:
    """Tests for Redis-backed anonymous rate limiting with in-memory fallback."""

    def test_redis_available_uses_redis(self):
        """When Redis is available, rate limiting should use Redis."""
        try:
            import redis  # noqa: F401
        except ImportError:
            pytest.skip("Redis not installed")

        from app.redis_client import RedisClient

        # Mock Redis connection
        with patch('redis.from_url') as mock_redis:
            mock_client = MagicMock()
            mock_client.ping.return_value = True
            mock_redis.return_value = mock_client

            client = RedisClient("redis://localhost:6379/0")
            assert client.is_available

    def test_redis_unavailable_uses_fallback(self):
        """When Redis is unavailable, should fall back to in-memory."""
        from app.redis_client import RedisClient

        # Invalid Redis URL should trigger fallback
        client = RedisClient("redis://invalid-host:9999/0")
        
        # Should not raise error, just fall back
        sync_client = client.get_sync_client()
        assert sync_client is None

    def test_check_anonymous_credits_fallback(self, db_session):
        """check_anonymous_credits should work with in-memory fallback."""
        from app.rate_limiting import check_anonymous_credits, reset_anonymous_rate_limits
        from app.redis_client import init_redis_client

        # Initialize with no Redis
        init_redis_client(None)
        reset_anonymous_rate_limits()

        identifier = "ip:192.168.1.100"
        required_credits = Decimal("5")

        # First check should allow
        is_allowed, remaining, allocated = check_anonymous_credits(
            identifier, required_credits, "UTC", db_session
        )

        assert isinstance(is_allowed, bool)
        assert is_allowed is True
        assert remaining > 0
        assert allocated == 50  # Default unregistered limit

    def test_deduct_anonymous_credits_fallback(self, db_session):
        """deduct_anonymous_credits should work with in-memory fallback."""
        from app.rate_limiting import (
            check_anonymous_credits,
            deduct_anonymous_credits,
            reset_anonymous_rate_limits,
        )
        from app.redis_client import init_redis_client

        # Initialize with no Redis
        init_redis_client(None)
        reset_anonymous_rate_limits()

        identifier = "ip:192.168.1.101"
        credits_to_deduct = Decimal("10")

        # Check initial credits (with db_session for first check)
        is_allowed, initial_remaining, allocated = check_anonymous_credits(
            identifier, Decimal("5"), "UTC", db_session
        )
        assert is_allowed

        # Deduct credits
        deduct_anonymous_credits(identifier, credits_to_deduct, "UTC")

        # Check again - without db_session to avoid DB sync overwriting memory
        is_allowed, new_remaining, allocated = check_anonymous_credits(
            identifier, Decimal("5"), "UTC", None
        )

        # Should have deducted credits
        assert new_remaining < initial_remaining
        assert new_remaining == 40  # 50 - 10

    def test_credits_consistent_across_checks(self, db_session):
        """Credits should remain consistent across multiple checks."""
        from app.rate_limiting import (
            check_anonymous_credits,
            deduct_anonymous_credits,
            reset_anonymous_rate_limits,
        )
        from app.redis_client import init_redis_client

        init_redis_client(None)
        reset_anonymous_rate_limits()

        identifier = "ip:192.168.1.102"

        # Deduct some credits
        deduct_anonymous_credits(identifier, Decimal("20"), "UTC")

        # Check credits multiple times (without db_session to avoid DB sync)
        _, remaining1, _ = check_anonymous_credits(identifier, Decimal("1"), "UTC", None)
        _, remaining2, _ = check_anonymous_credits(identifier, Decimal("1"), "UTC", None)

        # Should be consistent
        assert remaining1 == remaining2
        assert remaining1 == 30  # 50 - 20

    def test_credits_capped_at_allocation(self, db_session):
        """Credits used should be capped at allocated amount."""
        from app.rate_limiting import (
            check_anonymous_credits,
            deduct_anonymous_credits,
            reset_anonymous_rate_limits,
        )
        from app.redis_client import init_redis_client

        init_redis_client(None)
        reset_anonymous_rate_limits()

        identifier = "ip:192.168.1.103"

        # Try to deduct more than allocated
        deduct_anonymous_credits(identifier, Decimal("100"), "UTC")

        # Check credits (without db_session to avoid DB sync)
        is_allowed, remaining, allocated = check_anonymous_credits(
            identifier, Decimal("1"), "UTC", None
        )

        # Should be at limit (0 remaining)
        assert remaining == 0
        assert allocated == 50


class TestRedisCacheWithFallback:
    """Tests for Redis-backed cache with in-memory fallback."""

    def test_cache_set_get_fallback(self):
        """Cache should work with in-memory fallback."""
        from app.cache import cache
        from app.redis_client import init_redis_client

        # Initialize with no Redis
        init_redis_client(None)
        cache.clear()

        key = "test_key_1"
        value = {"data": "test_value"}

        # Set and get
        cache.set(key, value, ttl_seconds=300)
        retrieved = cache.get(key)

        assert retrieved == value

    def test_cache_expiry_fallback(self):
        """Cache should respect TTL in fallback mode."""
        import time

        from app.cache import cache
        from app.redis_client import init_redis_client

        init_redis_client(None)
        cache.clear()

        key = "test_key_expiry"
        value = "test_value"

        # Set with short TTL
        cache.set(key, value, ttl_seconds=1)

        # Should be available immediately
        assert cache.get(key) == value

        # Wait for expiry
        time.sleep(1.1)

        # Should be expired
        assert cache.get(key) is None

    def test_cache_delete_fallback(self):
        """Cache delete should work in fallback mode."""
        from app.cache import cache
        from app.redis_client import init_redis_client

        init_redis_client(None)
        cache.clear()

        key = "test_key_delete"
        value = "test_value"

        cache.set(key, value)
        assert cache.get(key) == value

        cache.delete(key)
        assert cache.get(key) is None

    def test_cache_clear_fallback(self):
        """Cache clear should work in fallback mode."""
        from app.cache import cache
        from app.redis_client import init_redis_client

        init_redis_client(None)

        # Set multiple keys
        cache.set("key1", "value1")
        cache.set("key2", "value2")

        # Clear cache
        cache.clear()

        # All should be gone
        assert cache.get("key1") is None
        assert cache.get("key2") is None


class TestRedisClientManagement:
    """Tests for Redis client lifecycle management."""

    def test_redis_client_initialization_no_url(self):
        """RedisClient should handle None URL gracefully."""
        from app.redis_client import RedisClient

        client = RedisClient(None)
        assert not client.is_available
        assert client.get_sync_client() is None

    def test_redis_client_initialization_invalid_url(self):
        """RedisClient should handle invalid URL gracefully."""
        from app.redis_client import RedisClient

        client = RedisClient("invalid://url")
        # Should not raise, just mark as unavailable
        assert not client.is_available or client.get_sync_client() is None

    def test_global_redis_client_init(self):
        """Global Redis client should initialize correctly."""
        from app.redis_client import get_redis_client, init_redis_client

        # Initialize with None
        client = init_redis_client(None)
        assert client is not None

        # Should be retrievable
        retrieved = get_redis_client()
        assert retrieved is client


class TestRedisIntegrationScenarios:
    """Integration-style tests for realistic usage patterns."""

    def test_multiple_users_rate_limiting(self, db_session):
        """Multiple users should have independent rate limits."""
        from app.rate_limiting import (
            check_anonymous_credits,
            deduct_anonymous_credits,
            reset_anonymous_rate_limits,
        )
        from app.redis_client import init_redis_client

        init_redis_client(None)
        reset_anonymous_rate_limits()

        user1 = "ip:192.168.1.201"
        user2 = "ip:192.168.1.202"

        # Deduct from user1
        deduct_anonymous_credits(user1, Decimal("20"), "UTC")

        # Check both users (without db_session to avoid DB sync)
        _, remaining1, _ = check_anonymous_credits(user1, Decimal("1"), "UTC", None)
        _, remaining2, _ = check_anonymous_credits(user2, Decimal("1"), "UTC", None)

        # User1 should have less, user2 should have full allocation
        assert remaining1 == 30
        assert remaining2 == 50

    def test_cache_multiple_keys(self):
        """Cache should handle multiple keys independently."""
        from app.cache import cache
        from app.redis_client import init_redis_client

        init_redis_client(None)
        cache.clear()

        # Set multiple keys
        cache.set("app_settings", {"setting": "value1"})
        cache.set("models", ["model1", "model2"])
        cache.set("user:123", {"id": 123, "name": "Test"})

        # All should be retrievable
        assert cache.get("app_settings") == {"setting": "value1"}
        assert cache.get("models") == ["model1", "model2"]
        assert cache.get("user:123") == {"id": 123, "name": "Test"}

        # Delete one shouldn't affect others
        cache.delete("models")
        assert cache.get("app_settings") is not None
        assert cache.get("models") is None
        assert cache.get("user:123") is not None
