"""Unit tests for CORS origin allowlist and extension-origin validation."""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.middleware.cors import CORSMiddleware

from app.cors import (
    CORS_EXPOSE_HEADERS,
    WEB_CORS_ORIGINS,
    get_cors_allow_origins,
    is_valid_extension_origin,
    parse_extension_cors_origins,
)
from app.main import app as fastapi_app

pytestmark = pytest.mark.unit

LISTED_CHROME_ORIGIN = "chrome-extension://abcdefghijklmnopqrstuvwxyzabcdef"
UNLISTED_CHROME_ORIGIN = "chrome-extension://zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz"
LISTED_MOZ_ORIGIN = "moz-extension://12345678-1234-1234-1234-123456789abc"
WEB_ORIGIN = "https://compareintel.com"
LOCAL_WEB_ORIGIN = "http://localhost:5173"


def _cors_client(extension_cors_origins: str | None) -> TestClient:
    test_app = FastAPI()
    test_app.add_middleware(
        CORSMiddleware,
        allow_origins=get_cors_allow_origins(extension_cors_origins),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=list(CORS_EXPOSE_HEADERS),
    )

    @test_app.get("/")
    def root() -> dict[str, bool]:
        return {"ok": True}

    return TestClient(test_app)


def _preflight(client: TestClient, origin: str):
    return client.options(
        "/",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "GET",
        },
    )


def _simple(client: TestClient, origin: str):
    return client.get("/", headers={"Origin": origin})


class TestParseExtensionCorsOrigins:
    def test_unset_and_empty_allow_no_extensions(self):
        assert parse_extension_cors_origins(None) == []
        assert parse_extension_cors_origins("") == []
        assert parse_extension_cors_origins("   ,  , ") == []

    def test_parses_chrome_and_moz_ids(self):
        raw = f"{LISTED_CHROME_ORIGIN}, {LISTED_MOZ_ORIGIN}"
        assert parse_extension_cors_origins(raw) == [LISTED_CHROME_ORIGIN, LISTED_MOZ_ORIGIN]

    def test_rejects_wildcards_and_non_extension_schemes(self):
        invalid = [
            "chrome-extension://*",
            "chrome-extension://abc*",
            r"^chrome-extension://.*$",
            "chrome-extension://",
            "chrome-extension://id/path",
            "chrome-extension://id/",
            "chrome-extension://abc?foo=1",
            "chrome-extension://abc#frag",
            "chrome-extension://id_with_underscore",
            "https://evil.example",
            "http://localhost:5173",
            "*",
        ]
        for entry in invalid:
            with pytest.raises(ValueError, match="Invalid EXTENSION_CORS_ORIGINS"):
                parse_extension_cors_origins(entry)

    def test_is_valid_extension_origin(self):
        assert is_valid_extension_origin(LISTED_CHROME_ORIGIN)
        assert is_valid_extension_origin(LISTED_MOZ_ORIGIN)
        assert not is_valid_extension_origin("chrome-extension://*")
        assert not is_valid_extension_origin("https://compareintel.com")


class TestGetCorsAllowOrigins:
    def test_web_origins_always_present(self):
        origins = get_cors_allow_origins("")
        for web_origin in WEB_CORS_ORIGINS:
            assert web_origin in origins
        assert all(not origin.startswith("chrome-extension://") for origin in origins)
        assert all(not origin.startswith("moz-extension://") for origin in origins)

    def test_listed_extension_appended(self):
        origins = get_cors_allow_origins(LISTED_CHROME_ORIGIN)
        assert LISTED_CHROME_ORIGIN in origins
        assert UNLISTED_CHROME_ORIGIN not in origins
        for web_origin in WEB_CORS_ORIGINS:
            assert web_origin in origins


class TestExtensionCorsMiddleware:
    def test_listed_extension_origin_allowed_with_credentials(self):
        client = _cors_client(LISTED_CHROME_ORIGIN)

        simple = _simple(client, LISTED_CHROME_ORIGIN)
        assert simple.headers.get("access-control-allow-origin") == LISTED_CHROME_ORIGIN
        assert simple.headers.get("access-control-allow-credentials") == "true"

        preflight = _preflight(client, LISTED_CHROME_ORIGIN)
        assert preflight.headers.get("access-control-allow-origin") == LISTED_CHROME_ORIGIN
        assert preflight.headers.get("access-control-allow-credentials") == "true"

    def test_unlisted_chrome_extension_origin_rejected(self):
        client = _cors_client(LISTED_CHROME_ORIGIN)

        simple = _simple(client, UNLISTED_CHROME_ORIGIN)
        assert "access-control-allow-origin" not in simple.headers
        assert simple.headers.get("access-control-allow-origin") != UNLISTED_CHROME_ORIGIN

        preflight = _preflight(client, UNLISTED_CHROME_ORIGIN)
        assert "access-control-allow-origin" not in preflight.headers

    def test_unset_var_rejects_all_extensions(self):
        for raw in (None, "", "  "):
            client = _cors_client(raw)
            for origin in (LISTED_CHROME_ORIGIN, UNLISTED_CHROME_ORIGIN, LISTED_MOZ_ORIGIN):
                simple = _simple(client, origin)
                assert "access-control-allow-origin" not in simple.headers
                preflight = _preflight(client, origin)
                assert "access-control-allow-origin" not in preflight.headers

    def test_web_origins_unaffected(self):
        client = _cors_client(LISTED_CHROME_ORIGIN)
        for origin in (WEB_ORIGIN, LOCAL_WEB_ORIGIN, "http://localhost:3000"):
            simple = _simple(client, origin)
            assert simple.headers.get("access-control-allow-origin") == origin
            assert simple.headers.get("access-control-allow-credentials") == "true"

            preflight = _preflight(client, origin)
            assert preflight.headers.get("access-control-allow-origin") == origin
            assert preflight.headers.get("access-control-allow-credentials") == "true"

        # Unrelated web origin still rejected
        other = _simple(client, "https://evil.example")
        assert "access-control-allow-origin" not in other.headers


class TestWiredAppCors:
    """The imported FastAPI app must not use a chrome-extension wildcard."""

    def test_imported_app_has_no_origin_regex(self):
        cors_middleware = [
            middleware
            for middleware in fastapi_app.user_middleware
            if middleware.cls is CORSMiddleware
        ]
        assert cors_middleware, "CORSMiddleware should be configured"
        kwargs = cors_middleware[0].kwargs
        assert not kwargs.get("allow_origin_regex")
        assert "*" not in kwargs.get("expose_headers", [])
        for header in CORS_EXPOSE_HEADERS:
            assert header in kwargs.get("expose_headers", [])

    def test_imported_app_rejects_extensions_when_unset(self):
        client = TestClient(fastapi_app)
        response = client.get("/", headers={"Origin": UNLISTED_CHROME_ORIGIN})
        assert "access-control-allow-origin" not in response.headers

    def test_imported_app_allows_web_origins(self):
        client = TestClient(fastapi_app)
        response = client.get("/", headers={"Origin": LOCAL_WEB_ORIGIN})
        assert response.headers.get("access-control-allow-origin") == LOCAL_WEB_ORIGIN
        assert response.headers.get("access-control-allow-credentials") == "true"
