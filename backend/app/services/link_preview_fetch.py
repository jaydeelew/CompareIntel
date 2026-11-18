"""SSRF-safe HTTP fetch for link previews."""

from __future__ import annotations

import logging

import httpx

from ..utils.ssrf import (
    SSRFError,
    browser_user_agent,
    normalize_redirect_url,
    validate_outbound_url,
)

logger = logging.getLogger(__name__)

MAX_REDIRECTS = 5
FETCH_TIMEOUT_SECONDS = 3.0
MAX_HTML_BYTES = 1_048_576
MAX_IMAGE_BYTES = 2_097_152


class LinkPreviewFetchError(Exception):
    """Non-SSRF fetch failure."""


async def _request(
    client: httpx.AsyncClient,
    method: str,
    url: str,
    *,
    max_bytes: int,
) -> tuple[bytes, str, str | None]:
    """
    Perform one HTTP request with byte cap.

    Returns: (body_bytes, final_url, content_type)
    """
    validate_outbound_url(url)
    headers = {
        "User-Agent": browser_user_agent(),
        "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
    }
    async with client.stream(method, url, headers=headers, follow_redirects=False) as response:
        if response.is_redirect:
            location = response.headers.get("location")
            if not location:
                raise LinkPreviewFetchError("Redirect without Location header")
            next_url = normalize_redirect_url(url, location)
            raise _RedirectFollowError(next_url)

        body = bytearray()
        async for chunk in response.aiter_bytes():
            body.extend(chunk)
            if len(body) > max_bytes:
                raise LinkPreviewFetchError("Response exceeds size limit")
        content_type = response.headers.get("content-type")
        if response.status_code >= 400:
            raise LinkPreviewFetchError(f"HTTP {response.status_code}")
        return bytes(body), str(response.url), content_type


class _RedirectFollowError(Exception):
    def __init__(self, url: str) -> None:
        self.url = url
        super().__init__(url)


async def fetch_html_for_preview(url: str) -> tuple[str, str]:
    """
    Fetch page HTML for metadata extraction.

    Returns: (html_text, final_url)
    """
    current = url.strip()
    async with httpx.AsyncClient(timeout=FETCH_TIMEOUT_SECONDS, cookies=False) as client:
        for _ in range(MAX_REDIRECTS + 1):
            try:
                body, final_url, _ctype = await _request(
                    client, "GET", current, max_bytes=MAX_HTML_BYTES
                )
                charset = "utf-8"
                return body.decode(charset, errors="replace"), final_url
            except _RedirectFollowError as redirect:
                current = redirect.url
                validate_outbound_url(current)
                continue
            except SSRFError:
                raise
            except httpx.RequestError as exc:
                raise LinkPreviewFetchError(f"Network error: {exc}") from exc
    raise LinkPreviewFetchError("Too many redirects")


async def fetch_image_bytes(url: str) -> tuple[bytes, str | None]:
    """Fetch image bytes through the same SSRF protections."""
    current = url.strip()
    async with httpx.AsyncClient(timeout=FETCH_TIMEOUT_SECONDS, cookies=False) as client:
        for _ in range(MAX_REDIRECTS + 1):
            try:
                body, _final, content_type = await _request(
                    client, "GET", current, max_bytes=MAX_IMAGE_BYTES
                )
                if content_type and not content_type.lower().startswith("image/"):
                    # Some CDNs omit type; allow when empty
                    if content_type.split(";")[0].strip().lower() not in (
                        "",
                        "application/octet-stream",
                    ):
                        raise LinkPreviewFetchError("URL did not return an image")
                return body, content_type
            except _RedirectFollowError as redirect:
                current = redirect.url
                validate_outbound_url(current)
                continue
            except SSRFError:
                raise
            except httpx.RequestError as exc:
                raise LinkPreviewFetchError(f"Network error: {exc}") from exc
    raise LinkPreviewFetchError("Too many redirects")
