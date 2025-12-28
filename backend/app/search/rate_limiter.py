"""
Shared rate limiter for search API requests.

This module provides a global rate limiter to coordinate search requests
across multiple concurrent model requests, preventing API rate limit exhaustion.

This rate limiter is thread-safe and works even when called from asyncio.run()
in thread pools, as it uses threading locks instead of asyncio locks.
"""

import asyncio
import logging
import time
import threading
from typing import Optional
from collections import deque

logger = logging.getLogger(__name__)


class SearchRateLimiter:
    """
    Rate limiter for search API requests.
    
    Uses a sliding window algorithm to limit the rate of search requests
    across all concurrent model requests. Thread-safe for use from thread pools.
    """
    
    def __init__(
        self,
        max_requests_per_minute: int = 30,
        max_concurrent: int = 5,
        delay_between_requests: float = 0.5
    ):
        """
        Initialize the rate limiter.
        
        Args:
            max_requests_per_minute: Maximum number of requests per minute
            max_concurrent: Maximum number of concurrent requests
            delay_between_requests: Minimum delay between requests in seconds
        """
        self.max_requests_per_minute = max_requests_per_minute
        self.max_concurrent = max_concurrent
        self.delay_between_requests = delay_between_requests
        
        # Thread-safe lock for state updates
        self._lock = threading.Lock()
        
        # Track request timestamps for sliding window (thread-safe deque)
        self.request_times = deque()
        
        # Thread-safe counter for concurrent requests
        self._concurrent_count = 0
    
    async def acquire(self) -> None:
        """
        Acquire permission to make a search request.
        
        This method will wait if necessary to respect rate limits.
        """
        # Wait for concurrent request slot and check rate limit
        while True:
            with self._lock:
                now = time.time()
                
                # Remove old requests from sliding window (older than 1 minute)
                while self.request_times and (now - self.request_times[0]) > 60:
                    self.request_times.popleft()
                
                # Check concurrent limit
                if self._concurrent_count >= self.max_concurrent:
                    # Wait a bit before checking again
                    wait_time = 0.1
                # Check rate limit
                elif len(self.request_times) >= self.max_requests_per_minute:
                    # Calculate wait time until oldest request expires
                    oldest_request_time = self.request_times[0]
                    wait_time = 60 - (now - oldest_request_time) + 0.1  # Add small buffer
                    logger.info(
                        f"Search rate limit reached ({len(self.request_times)}/{self.max_requests_per_minute}). "
                        f"Waiting {wait_time:.2f}s before next request."
                    )
                else:
                    # We can proceed - acquire slot and record request
                    self._concurrent_count += 1
                    self.request_times.append(now)
                    break
            
            # Wait before checking again
            await asyncio.sleep(wait_time)
        
        try:
            # Add delay between requests to prevent rapid-fire requests
            if self.delay_between_requests > 0:
                await asyncio.sleep(self.delay_between_requests)
        except Exception as e:
            # Release concurrent slot on error
            with self._lock:
                self._concurrent_count = max(0, self._concurrent_count - 1)
            raise
    
    def release(self) -> None:
        """Release the concurrent request slot after request completes."""
        with self._lock:
            self._concurrent_count = max(0, self._concurrent_count - 1)


# Global rate limiter instance
# Default: 30 requests per minute, max 5 concurrent, 0.5s delay between requests
# This should be safe for most search APIs while allowing reasonable throughput
_global_rate_limiter: Optional[SearchRateLimiter] = None
_global_rate_limiter_lock = threading.Lock()


def get_rate_limiter() -> SearchRateLimiter:
    """Get the global search rate limiter instance (thread-safe)."""
    global _global_rate_limiter
    if _global_rate_limiter is None:
        with _global_rate_limiter_lock:
            if _global_rate_limiter is None:
                _global_rate_limiter = SearchRateLimiter(
                    max_requests_per_minute=30,
                    max_concurrent=5,
                    delay_between_requests=0.5
                )
    return _global_rate_limiter


def reset_rate_limiter() -> None:
    """Reset the global rate limiter (useful for testing)."""
    global _global_rate_limiter
    with _global_rate_limiter_lock:
        _global_rate_limiter = None

