"""
Redis client management with graceful fallback.

Provides a centralized Redis connection manager that:
- Manages Redis connection lifecycle
- Provides graceful fallback when Redis is unavailable
- Supports both synchronous and asynchronous operations
- Used by rate limiting and cache modules for stateless operation
"""

import logging
from contextlib import asynccontextmanager, contextmanager
from typing import Any

logger = logging.getLogger(__name__)

try:
    import redis
    import redis.asyncio as aioredis
    from redis import Redis
    from redis.asyncio import Redis as AsyncRedis

    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False
    redis = None
    aioredis = None
    Redis = None
    AsyncRedis = None


class RedisClient:
    """
    Redis client manager with graceful fallback.

    Manages Redis connections for rate limiting and caching with automatic
    fallback to in-memory storage when Redis is unavailable.
    """

    def __init__(self, redis_url: str | None = None):
        """
        Initialize Redis client manager.

        Args:
            redis_url: Redis connection URL (e.g., "redis://localhost:6379/0")
        """
        self.redis_url = redis_url
        self._sync_client: Redis | None = None
        self._async_client: AsyncRedis | None = None
        self._is_available = False
        self._connection_tested = False

        if redis_url and REDIS_AVAILABLE:
            try:
                self._init_clients()
            except Exception as e:
                logger.warning(f"Failed to initialize Redis clients: {e}")
                self._is_available = False

    def _init_clients(self):
        """Initialize sync and async Redis clients."""
        if not self.redis_url or not REDIS_AVAILABLE:
            return

        try:
            self._sync_client = redis.from_url(
                self.redis_url,
                decode_responses=True,
                socket_connect_timeout=5,
                socket_timeout=5,
            )
            self._async_client = aioredis.from_url(
                self.redis_url,
                decode_responses=True,
                socket_connect_timeout=5,
                socket_timeout=5,
            )
            self._is_available = True
        except Exception as e:
            logger.warning(f"Failed to create Redis clients: {e}")
            self._is_available = False
            self._sync_client = None
            self._async_client = None

    @property
    def is_available(self) -> bool:
        """Check if Redis is available."""
        return self._is_available and self._sync_client is not None

    def get_sync_client(self) -> Redis | None:
        """
        Get synchronous Redis client.

        Returns:
            Redis client or None if unavailable
        """
        if not self._connection_tested and self._sync_client:
            try:
                self._sync_client.ping()
                self._connection_tested = True
                logger.info("✅ Redis connection verified (sync)")
            except Exception as e:
                logger.warning(f"Redis connection test failed: {e}. Using fallback.")
                self._is_available = False
                self._sync_client = None
                return None

        return self._sync_client if self.is_available else None

    async def get_async_client(self) -> AsyncRedis | None:
        """
        Get asynchronous Redis client.

        Returns:
            Async Redis client or None if unavailable
        """
        if not self._connection_tested and self._async_client:
            try:
                await self._async_client.ping()
                self._connection_tested = True
                logger.info("✅ Redis connection verified (async)")
            except Exception as e:
                logger.warning(f"Redis connection test failed: {e}. Using fallback.")
                self._is_available = False
                self._async_client = None
                return None

        return self._async_client if self.is_available else None

    @contextmanager
    def get_sync_connection(self):
        """
        Context manager for synchronous Redis operations.

        Yields:
            Redis client or None if unavailable

        Example:
            with redis_client.get_sync_connection() as conn:
                if conn:
                    conn.set("key", "value")
                else:
                    # Fallback to in-memory
                    pass
        """
        client = self.get_sync_client()
        try:
            yield client
        except Exception as e:
            logger.error(f"Redis operation failed: {e}")
            self._is_available = False
            yield None

    @asynccontextmanager
    async def get_async_connection(self):
        """
        Context manager for asynchronous Redis operations.

        Yields:
            Async Redis client or None if unavailable

        Example:
            async with redis_client.get_async_connection() as conn:
                if conn:
                    await conn.set("key", "value")
                else:
                    # Fallback to in-memory
                    pass
        """
        client = await self.get_async_client()
        try:
            yield client
        except Exception as e:
            logger.error(f"Redis operation failed: {e}")
            self._is_available = False
            yield None

    def close(self):
        """Close Redis connections."""
        if self._sync_client:
            try:
                self._sync_client.close()
            except Exception as e:
                logger.warning(f"Error closing sync Redis client: {e}")

        self._sync_client = None
        self._async_client = None
        self._is_available = False

    async def aclose(self):
        """Close Redis connections (async)."""
        if self._async_client:
            try:
                await self._async_client.close()
            except Exception as e:
                logger.warning(f"Error closing async Redis client: {e}")

        if self._sync_client:
            try:
                self._sync_client.close()
            except Exception as e:
                logger.warning(f"Error closing sync Redis client: {e}")

        self._sync_client = None
        self._async_client = None
        self._is_available = False


# Global Redis client instance (initialized from settings)
_global_redis_client: RedisClient | None = None


def init_redis_client(redis_url: str | None) -> RedisClient:
    """
    Initialize global Redis client.

    Args:
        redis_url: Redis connection URL

    Returns:
        RedisClient instance
    """
    global _global_redis_client
    _global_redis_client = RedisClient(redis_url)
    return _global_redis_client


def get_redis_client() -> RedisClient | None:
    """
    Get global Redis client instance.

    Returns:
        RedisClient instance or None if not initialized
    """
    return _global_redis_client
