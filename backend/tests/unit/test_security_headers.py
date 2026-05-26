"""Unit tests for security headers middleware."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest
from starlette.responses import Response

from app.middleware.security_headers import SecurityHeadersMiddleware

pytestmark = pytest.mark.unit


@pytest.mark.asyncio
async def test_strips_disclosing_headers_and_adds_security_headers() -> None:
    middleware = SecurityHeadersMiddleware(app=MagicMock())
    request = MagicMock()
    request.url.path = "/api/compare"

    async def call_next(_request: MagicMock) -> Response:
        response = Response(content="ok")
        response.headers["X-Powered-By"] = "uvicorn"
        response.headers["server"] = "uvicorn"
        return response

    response = await middleware.dispatch(request, call_next)

    assert "X-Powered-By" not in response.headers
    assert "server" not in response.headers
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"
    assert "geolocation=(self)" in response.headers["Permissions-Policy"]
    assert response.headers["Cache-Control"] == "no-store, no-cache, must-revalidate, private"
