"""
CORS origin allowlist and extension-origin validation.

Browser-extension pages are cross-origin to the API. Only exact IDs listed in
EXTENSION_CORS_ORIGINS may make credentialed requests. Unset/empty means no
extension origins are allowed. There is no chrome-extension:// wildcard.
"""

from __future__ import annotations

import re
from urllib.parse import urlparse

# Existing first-party and local web origins. Used in every environment so
# unlisted extension origins cannot ride a development "*" allowlist.
WEB_CORS_ORIGINS: tuple[str, ...] = (
    # Production domains
    "https://compareintel.com",
    "https://www.compareintel.com",
    "http://compareintel.com",  # HTTP (redirects to HTTPS)
    "http://www.compareintel.com",
    "http://54.163.207.252",  # Server IP (legacy)
    # Local development with SSL
    "https://localhost",
    "https://localhost:443",
    # Local development without SSL
    "http://localhost:5173",  # Vite default port
    "http://localhost:4173",  # Vite preview (production build testing)
    "http://localhost:5174",  # Alternative Vite port
    "http://localhost:5175",  # Extension web app / alternative Vite port
    "http://localhost:3000",  # Alternative local port
    "http://127.0.0.1:5173",
    "http://127.0.0.1:4173",
    "http://127.0.0.1:5174",
    "http://127.0.0.1:5175",
    "http://127.0.0.1:3000",
)

# Non-safelisted response headers the API actually sets that JS may read.
# Content-Type and other CORS-safelisted headers are always exposed.
# Do not use "*" — browsers ignore it on credentialed responses.
CORS_EXPOSE_HEADERS: tuple[str, ...] = (
    "Retry-After",
    "X-Process-Time",
)

_EXTENSION_SCHEMES = frozenset({"chrome-extension", "moz-extension"})
_EXTENSION_ID_RE = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$")
_WILDCARD_CHARS = frozenset("*?[]")


def is_valid_extension_origin(origin: str) -> bool:
    """Return True if origin is an exact chrome- or moz-extension origin with an id."""
    if not origin or any(char in origin for char in _WILDCARD_CHARS):
        return False
    if origin.endswith("/") or "\\" in origin:
        return False

    parsed = urlparse(origin)
    if parsed.scheme not in _EXTENSION_SCHEMES:
        return False
    if parsed.path not in {"", "/"}:
        return False
    if parsed.query or parsed.fragment or parsed.params:
        return False

    extension_id = parsed.netloc
    if not extension_id or not _EXTENSION_ID_RE.fullmatch(extension_id):
        return False
    return True


def parse_extension_cors_origins(raw: str | None) -> list[str]:
    """
    Parse EXTENSION_CORS_ORIGINS (comma-separated exact extension origins).

    Returns an empty list when unset or empty. Raises ValueError if any entry
    is not chrome-extension://<id> or moz-extension://<id> (no wildcards).
    """
    if raw is None:
        return []

    origins: list[str] = []
    for part in raw.split(","):
        origin = part.strip()
        if not origin:
            continue
        if not is_valid_extension_origin(origin):
            raise ValueError(
                f"Invalid EXTENSION_CORS_ORIGINS entry: {origin!r}. "
                "Expected an exact chrome-extension://<id> or moz-extension://<id> "
                "with no wildcards, paths, or query strings."
            )
        if origin not in origins:
            origins.append(origin)
    return origins


def get_cors_allow_origins(extension_cors_origins: str | None = None) -> list[str]:
    """Web origins plus validated extension origins from EXTENSION_CORS_ORIGINS."""
    origins = list(WEB_CORS_ORIGINS)
    for origin in parse_extension_cors_origins(extension_cors_origins):
        if origin not in origins:
            origins.append(origin)
    return origins
