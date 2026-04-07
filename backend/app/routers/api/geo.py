"""Photon (Komoot) reverse geocode proxy — avoids browser CORS and nginx outbound HTTPS issues."""

import logging

import httpx
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse

router = APIRouter(tags=["API"])
logger = logging.getLogger(__name__)

PHOTON_REVERSE = "https://photon.komoot.io/reverse"
# Komoot returns 403 + HTML for default python-httpx User-Agent; use a generic browser UA.
_PHOTON_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (compatible; CompareIntel/1.0; +https://compareintel.com) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json",
}


@router.get("/geo/photon/reverse")
async def photon_reverse(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    lang: str = Query("en", min_length=2, max_length=10),
) -> JSONResponse:
    """Proxy to Komoot Photon reverse geocoder (same response body as upstream)."""
    url = f"{PHOTON_REVERSE}?lat={lat}&lon={lon}&lang={lang}"
    try:
        async with httpx.AsyncClient(timeout=15.0, headers=_PHOTON_HEADERS) as client:
            r = await client.get(url)
    except httpx.RequestError as e:
        logger.warning("Photon reverse request failed: %s", e)
        raise HTTPException(status_code=502, detail="Geocoding service unavailable") from e

    try:
        data = r.json()
    except ValueError:
        logger.warning("Photon reverse returned non-JSON (status %s)", r.status_code)
        raise HTTPException(status_code=502, detail="Geocoding service unavailable")

    return JSONResponse(content=data, status_code=r.status_code)
