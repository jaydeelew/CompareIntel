"""
Security headers middleware for FastAPI application.

This middleware adds security headers and removes potentially sensitive headers
like X-Powered-By to improve application security.
"""

from collections.abc import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Middleware to add security headers and remove sensitive headers.

    Adds:
    - X-Content-Type-Options: nosniff
    - X-Frame-Options: DENY
    - Permissions-Policy: (restrictive policy)
    - Cache-Control: (for API endpoints)

    Removes:
    - X-Powered-By: (server information disclosure)
    """

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Process request and add security headers."""
        # Process request
        response = await call_next(request)

        # Remove X-Powered-By header (security best practice)
        # This prevents information disclosure about the server stack
        if "X-Powered-By" in response.headers:
            del response.headers["X-Powered-By"]
        if "server" in response.headers:
            del response.headers["server"]  # Also remove server header if present

        # Add security headers
        # X-Content-Type-Options: Prevent MIME type sniffing
        response.headers["X-Content-Type-Options"] = "nosniff"

        # X-Frame-Options: Prevent clickjacking
        response.headers["X-Frame-Options"] = "DENY"

        # Permissions-Policy: Restrict browser features
        # Only allow essential features, deny others by default
        permissions_policy = (
            "accelerometer=(), "
            "ambient-light-sensor=(), "
            "autoplay=(), "
            "battery=(), "
            "camera=(), "
            "cross-origin-isolated=(), "
            "display-capture=(), "
            "document-domain=(), "
            "encrypted-media=(), "
            "execution-while-not-rendered=(), "
            "execution-while-out-of-viewport=(), "
            "fullscreen=(), "
            "geolocation=(), "
            "gyroscope=(), "
            "keyboard-map=(), "
            "magnetometer=(), "
            "microphone=(), "
            "midi=(), "
            "navigation-override=(), "
            "payment=(), "
            "picture-in-picture=(), "
            "publickey-credentials-get=(), "
            "screen-wake-lock=(), "
            "sync-xhr=(), "
            "usb=(), "
            "web-share=(), "
            "xr-spatial-tracking=()"
        )
        response.headers["Permissions-Policy"] = permissions_policy

        # Cache-Control for API endpoints
        # API responses should not be cached by default
        if request.url.path.startswith("/api"):
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, private"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
        # Health check endpoint can be cached briefly
        elif request.url.path == "/health":
            response.headers["Cache-Control"] = "public, max-age=60"
        # Root endpoint should not be cached
        elif request.url.path == "/":
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, private"

        return response
