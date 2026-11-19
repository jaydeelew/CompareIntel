"""Cache and rate limit helpers for link preview API."""

from __future__ import annotations

import hashlib
import threading
import time
from collections import defaultdict
from datetime import UTC, datetime
from typing import Any

from ..cache import cache

POSITIVE_TTL_SECONDS = 86_400  # ~24h
NEGATIVE_TTL_SECONDS = 300
RATE_LIMIT_WINDOW_SECONDS = 60
RATE_LIMIT_MAX_REQUESTS = 40


def _cache_key(url: str) -> str:
    normalized = url.strip().lower()
    digest = hashlib.sha256(normalized.encode()).hexdigest()[:32]
    return f"link_preview:{digest}"


def get_cached_preview(url: str) -> dict[str, Any] | None:
    key = _cache_key(url)
    value = cache.get(key)
    if isinstance(value, dict):
        return value
    return None


def set_cached_preview(url: str, data: dict[str, Any], *, success: bool) -> None:
    ttl = POSITIVE_TTL_SECONDS if success else NEGATIVE_TTL_SECONDS
    cache.set(_cache_key(url), data, ttl_seconds=ttl)


_rate_lock = threading.Lock()
_rate_buckets: dict[str, list[float]] = defaultdict(list)


def check_rate_limit(client_key: str) -> None:
    """
    Raise ValueError when client_key exceeds per-minute request budget.
    client_key should be user id or IP-based identifier.
    """
    now = time.time()
    window_start = now - RATE_LIMIT_WINDOW_SECONDS
    with _rate_lock:
        bucket = _rate_buckets[client_key]
        bucket[:] = [t for t in bucket if t >= window_start]
        if len(bucket) >= RATE_LIMIT_MAX_REQUESTS:
            raise ValueError("rate_limit")
        bucket.append(now)


def negative_preview_payload(url: str, reason: str) -> dict[str, Any]:
    return {
        "title": url,
        "site_name": None,
        "image": None,
        "description": None,
        "price": None,
        "currency": None,
        "fetched_at": datetime.now(UTC).isoformat(),
        "url": url,
        "error": reason,
    }
