"""
Caching utilities for CompareIntel backend.

This module provides a simple in-memory cache for frequently accessed,
rarely-changing data like AppSettings and model lists.
"""

import logging
from collections.abc import Callable
from datetime import datetime, timedelta
from functools import wraps
from typing import TypeVar

logger = logging.getLogger(__name__)

T = TypeVar("T")


class SimpleCache:
    """
    Simple in-memory cache with TTL (Time To Live) support.

    Suitable for caching:
    - AppSettings (rarely changes)
    - Model lists (static data)
    - User data (with short TTL)
    """

    def __init__(self):
        self._cache: dict[str, tuple[any, datetime]] = {}

    def get(self, key: str, default: T | None = None) -> T | None:
        """Get value from cache if it exists and hasn't expired."""
        if key not in self._cache:
            return default

        value, expiry = self._cache[key]

        # Check if expired
        if datetime.now() > expiry:
            del self._cache[key]
            return default

        return value

    def set(self, key: str, value: T, ttl_seconds: int = 300) -> None:
        """Set value in cache with TTL."""
        expiry = datetime.now() + timedelta(seconds=ttl_seconds)
        self._cache[key] = (value, expiry)

    def delete(self, key: str) -> None:
        """Delete a key from cache."""
        if key in self._cache:
            del self._cache[key]

    def clear(self) -> None:
        """Clear all cache entries."""
        self._cache.clear()

    def cleanup_expired(self) -> int:
        """Remove expired entries. Returns count of removed entries."""
        now = datetime.now()
        expired_keys = [key for key, (_, expiry) in self._cache.items() if now > expiry]
        for key in expired_keys:
            del self._cache[key]
        return len(expired_keys)


# Global cache instance
cache = SimpleCache()


def cached(ttl_seconds: int = 300, key_prefix: str = ""):
    """
    Decorator to cache function results.

    Args:
        ttl_seconds: Time to live in seconds (default: 5 minutes)
        key_prefix: Optional prefix for cache keys

    Example:
        @cached(ttl_seconds=600, key_prefix="app_settings")
        def get_app_settings():
            return db.query(AppSettings).first()
    """

    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @wraps(func)
        def wrapper(*args, **kwargs):
            # Generate cache key from function name and arguments
            cache_key = f"{key_prefix}:{func.__name__}"
            if args:
                cache_key += f":{hash(args)}"
            if kwargs:
                cache_key += f":{hash(tuple(sorted(kwargs.items())))}"

            # Try to get from cache
            cached_value = cache.get(cache_key)
            if cached_value is not None:
                logger.debug(f"Cache hit: {cache_key}")
                return cached_value

            # Call function and cache result
            logger.debug(f"Cache miss: {cache_key}")
            result = func(*args, **kwargs)
            cache.set(cache_key, result, ttl_seconds)
            return result

        return wrapper

    return decorator


# Cache key constants
CACHE_KEY_APP_SETTINGS = "app_settings:single"
CACHE_KEY_MODELS = "models:all"
CACHE_KEY_USER_PREFIX = "user:"


def get_cached_app_settings(getter_func: Callable[[], T]) -> T | None:
    """
    Get AppSettings from cache or call getter function.

    Args:
        getter_func: Function that returns AppSettings from database

    Returns:
        AppSettings or None
    """
    cached_value = cache.get(CACHE_KEY_APP_SETTINGS)
    if cached_value is not None:
        return cached_value

    # Get from database and cache
    settings = getter_func()
    if settings is not None:
        # Cache for 5 minutes (AppSettings rarely changes)
        cache.set(CACHE_KEY_APP_SETTINGS, settings, ttl_seconds=300)

    return settings


def invalidate_app_settings_cache() -> None:
    """Invalidate AppSettings cache (call after updates)."""
    cache.delete(CACHE_KEY_APP_SETTINGS)
    logger.info("AppSettings cache invalidated")


def get_cached_models(getter_func: Callable[[], T]) -> T:
    """
    Get models list from cache or call getter function.

    Args:
        getter_func: Function that returns models list

    Returns:
        Models list (cached for 1 hour since it's static)
    """
    cached_value = cache.get(CACHE_KEY_MODELS)
    if cached_value is not None:
        return cached_value

    # Get models and cache for 1 hour (static data)
    models = getter_func()
    cache.set(CACHE_KEY_MODELS, models, ttl_seconds=3600)
    return models


def invalidate_models_cache() -> None:
    """
    Invalidate the models cache.

    Call this after adding or deleting models to ensure fresh data is returned.
    """
    cache.delete(CACHE_KEY_MODELS)
    logger.info("Models cache invalidated")


def get_cached_user(user_id: int, getter_func: Callable[[int], T | None]) -> T | None:
    """
    Get user from cache or call getter function.

    Args:
        user_id: User ID
        getter_func: Function that takes user_id and returns User from database

    Returns:
        User or None

    Note: User cache has short TTL (1 minute) since user data can change.
    """
    cache_key = f"{CACHE_KEY_USER_PREFIX}{user_id}"
    cached_value = cache.get(cache_key)
    if cached_value is not None:
        return cached_value

    # Get from database and cache for 1 minute
    user = getter_func(user_id)
    if user is not None:
        cache.set(cache_key, user, ttl_seconds=60)

    return user


def invalidate_user_cache(user_id: int) -> None:
    """Invalidate user cache (call after user updates)."""
    cache_key = f"{CACHE_KEY_USER_PREFIX}{user_id}"
    cache.delete(cache_key)
    logger.debug(f"User cache invalidated for user_id={user_id}")
