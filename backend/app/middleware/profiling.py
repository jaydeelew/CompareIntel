"""
API profiling middleware for performance monitoring.

This middleware tracks request/response times and logs slow endpoints
to help identify performance bottlenecks.
"""

import logging
import time
from collections.abc import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger(__name__)

# Performance thresholds (in seconds)
SLOW_REQUEST_THRESHOLD = 1.0  # Log requests taking > 1 second
VERY_SLOW_REQUEST_THRESHOLD = 3.0  # Log requests taking > 3 seconds as warnings


class ProfilingMiddleware(BaseHTTPMiddleware):
    """
    Middleware to profile API endpoints and log slow requests.

    Tracks:
    - Request processing time
    - Endpoint path and method
    - Response status code

    Logs warnings for slow endpoints to help identify bottlenecks.
    """

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Process request and measure execution time."""
        start_time = time.time()

        # Process request
        response = await call_next(request)

        # Calculate processing time
        process_time = time.time() - start_time

        # Add X-Process-Time header for client-side monitoring
        response.headers["X-Process-Time"] = f"{process_time:.4f}"

        # Log slow requests
        path = request.url.path
        method = request.method
        status_code = response.status_code

        # Skip health checks and static files
        if path in ["/health", "/"]:
            return response

        # Log based on threshold
        if process_time > VERY_SLOW_REQUEST_THRESHOLD:
            logger.warning(
                f"VERY SLOW REQUEST: {method} {path} - {process_time:.3f}s - Status: {status_code}"
            )
        elif process_time > SLOW_REQUEST_THRESHOLD:
            logger.info(
                f"Slow request: {method} {path} - {process_time:.3f}s - Status: {status_code}"
            )

        return response
