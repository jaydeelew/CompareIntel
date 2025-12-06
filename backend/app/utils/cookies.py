"""
Cookie utility functions for authentication.

Provides secure cookie setting and reading functions for JWT tokens.
"""

from fastapi import Response
from datetime import datetime, timedelta
from typing import Optional
from ..config import settings


# Cookie names
ACCESS_TOKEN_COOKIE = "access_token"
REFRESH_TOKEN_COOKIE = "refresh_token"

# Cookie settings
COOKIE_MAX_AGE_ACCESS = 30 * 60  # 30 minutes (matches access token expiry)
COOKIE_MAX_AGE_REFRESH = 7 * 24 * 60 * 60  # 7 days (matches refresh token expiry)


def set_auth_cookies(
    response: Response,
    access_token: str,
    refresh_token: str,
    secure: Optional[bool] = None,
    same_site: str = "lax",
) -> None:
    """
    Set HTTP-only authentication cookies for access and refresh tokens.

    Uses SameSite='lax' by default for CSRF protection while maintaining usability.
    'Lax' allows cookies to be sent with top-level navigations (like clicking links)
    but not with cross-site POST requests, providing good CSRF protection.

    Args:
        response: FastAPI Response object
        access_token: JWT access token
        refresh_token: JWT refresh token
        secure: Whether to set Secure flag (HTTPS only). Defaults to True in production.
        same_site: SameSite attribute ('strict', 'lax', or 'none'). Defaults to 'lax' for CSRF protection.
    """
    # Determine secure flag based on environment if not explicitly set
    if secure is None:
        secure = settings.environment == "production"

    # Set access token cookie
    response.set_cookie(
        key=ACCESS_TOKEN_COOKIE,
        value=access_token,
        max_age=COOKIE_MAX_AGE_ACCESS,
        httponly=True,
        secure=secure,
        samesite=same_site,
        path="/",
    )

    # Set refresh token cookie
    response.set_cookie(
        key=REFRESH_TOKEN_COOKIE,
        value=refresh_token,
        max_age=COOKIE_MAX_AGE_REFRESH,
        httponly=True,
        secure=secure,
        samesite=same_site,
        path="/",
    )


def clear_auth_cookies(response: Response) -> None:
    """
    Clear authentication cookies by setting them to expire immediately.

    Args:
        response: FastAPI Response object
    """
    # Use the same secure setting as when cookies were set
    # This is important for cookie deletion to work properly
    secure = settings.environment == "production"

    response.set_cookie(
        key=ACCESS_TOKEN_COOKIE,
        value="",
        max_age=0,
        httponly=True,
        secure=secure,
        samesite="lax",
        path="/",
    )

    response.set_cookie(
        key=REFRESH_TOKEN_COOKIE,
        value="",
        max_age=0,
        httponly=True,
        secure=secure,
        samesite="lax",
        path="/",
    )


def get_token_from_cookies(request) -> Optional[str]:
    """
    Get access token from cookies.

    Args:
        request: FastAPI Request object

    Returns:
        Access token string if found, None otherwise
    """
    token = request.cookies.get(ACCESS_TOKEN_COOKIE)
    # Debug logging for development
    if settings.environment == "development":
        all_cookies = dict(request.cookies)
        cookie_names = list(all_cookies.keys())
        print(f"[COOKIE DEBUG] Request to {request.url.path}")
        print(f"[COOKIE DEBUG] Cookies received: {cookie_names}")
        print(f"[COOKIE DEBUG] access_token present: {token is not None}")
    return token


def get_refresh_token_from_cookies(request) -> Optional[str]:
    """
    Get refresh token from cookies.

    Args:
        request: FastAPI Request object

    Returns:
        Refresh token string if found, None otherwise
    """
    return request.cookies.get(REFRESH_TOKEN_COOKIE)
