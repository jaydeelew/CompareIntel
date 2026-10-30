"""Internal (non-public) endpoints. Hidden from OpenAPI; not for product clients."""

from __future__ import annotations

import hmac
from typing import Annotated, Any

from fastapi import APIRouter, Header, HTTPException

from ..config import settings
from ..host_metrics import collect_host_metrics

router = APIRouter(prefix="/internal", include_in_schema=False)


def _bearer_token(authorization: str | None) -> str:
    if not authorization:
        return ""
    scheme, separator, token = authorization.partition(" ")
    if not separator or scheme.lower() != "bearer":
        return ""
    return token


def _metrics_token_matches(provided: str, expected: str) -> bool:
    try:
        return hmac.compare_digest(provided.encode("utf-8"), expected.encode("utf-8"))
    except (TypeError, ValueError):
        return False


@router.get("/metrics/host")
def get_host_metrics(
    authorization: Annotated[str | None, Header()] = None,
) -> dict[str, Any]:
    """Return host memory/swap/disk snapshot for Pulse. Disabled when token unset."""
    expected = settings.metrics_token
    if not expected:
        raise HTTPException(status_code=404, detail="Not Found")
    provided = _bearer_token(authorization)
    if not _metrics_token_matches(provided, expected):
        raise HTTPException(status_code=401, detail="Unauthorized")
    return collect_host_metrics()
