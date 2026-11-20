"""Link preview metadata and image proxy (SSRF-safe)."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any
from urllib.parse import unquote

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import Response

from ...dependencies import get_current_user
from ...services.link_preview_cache import (
    check_rate_limit,
    get_cached_preview,
    negative_preview_payload,
    set_cached_preview,
)
from ...services.link_preview_fetch import (
    LinkPreviewFetchError,
    fetch_html_for_preview,
    fetch_image_bytes,
)
from ...services.link_preview_metadata import parse_link_preview_metadata, truncate_html_head
from ...utils.request import get_client_ip
from ...utils.ssrf import SSRFError, validate_http_url_scheme, validate_outbound_url

if TYPE_CHECKING:
    from ...models import User

router = APIRouter(tags=["API"])
logger = logging.getLogger(__name__)


def _client_rate_key(request: Request, user: User | None) -> str:
    if user is not None and user.id:
        return f"user:{user.id}"
    return f"ip:{get_client_ip(request)}"


def _validate_target_url(url: str) -> str:
    decoded = unquote(url.strip())
    if len(decoded) > 2048:
        raise HTTPException(status_code=400, detail="URL too long")
    try:
        validate_http_url_scheme(decoded)
        validate_outbound_url(decoded)
    except SSRFError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return decoded


@router.get("/link-preview")
async def link_preview(
    request: Request,
    url: str = Query(..., min_length=8, max_length=2048),
    user: User | None = Depends(get_current_user),
) -> dict[str, Any]:
    """Return Open Graph / JSON-LD preview metadata for a URL."""
    target = _validate_target_url(url)
    client_key = _client_rate_key(request, user)
    try:
        check_rate_limit(client_key)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Link preview rate limit exceeded",
        ) from None

    cached = get_cached_preview(target)
    if cached is not None:
        return cached

    try:
        html, final_url = await fetch_html_for_preview(target)
        html = truncate_html_head(html)
        payload = parse_link_preview_metadata(html, final_url)
        set_cached_preview(target, payload, success=True)
        return payload
    except SSRFError as exc:
        payload = negative_preview_payload(target, str(exc))
        set_cached_preview(target, payload, success=False)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LinkPreviewFetchError as exc:
        payload = negative_preview_payload(target, str(exc))
        set_cached_preview(target, payload, success=False)
        return payload
    except Exception as exc:
        logger.warning("link_preview unexpected error: %s", exc)
        payload = negative_preview_payload(target, "preview_unavailable")
        set_cached_preview(target, payload, success=False)
        return payload


@router.get("/link-preview/image")
async def link_preview_image(
    request: Request,
    url: str = Query(..., min_length=8, max_length=2048),
    user: User | None = Depends(get_current_user),
) -> Response:
    """Proxy remote preview images (size-limited, SSRF-safe)."""
    target = _validate_target_url(url)
    client_key = _client_rate_key(request, user)
    try:
        check_rate_limit(client_key)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Link preview rate limit exceeded",
        ) from None

    try:
        body, content_type = await fetch_image_bytes(target)
    except SSRFError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LinkPreviewFetchError as exc:
        raise HTTPException(status_code=502, detail="Failed to fetch image") from exc

    media = (content_type or "image/jpeg").split(";")[0].strip()
    if not media.startswith("image/"):
        media = "image/jpeg"

    return Response(
        content=body,
        media_type=media,
        headers={
            "Cache-Control": "public, max-age=86400",
            "Referrer-Policy": "no-referrer",
            "X-Content-Type-Options": "nosniff",
        },
    )
