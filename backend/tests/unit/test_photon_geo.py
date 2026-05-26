"""Unit tests for Photon reverse geocode proxy endpoint."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from fastapi import HTTPException

from app.routers.api.geo import photon_reverse

pytestmark = pytest.mark.unit


@pytest.mark.asyncio
async def test_photon_reverse_returns_upstream_json() -> None:
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"features": [{"properties": {"city": "Berlin"}}]}

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_response)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    with patch("app.routers.api.geo.httpx.AsyncClient", return_value=mock_client):
        response = await photon_reverse(lat=52.52, lon=13.405, lang="en")

    assert response.status_code == 200
    body = json.loads(response.body)
    assert body["features"][0]["properties"]["city"] == "Berlin"
    mock_client.get.assert_awaited_once()


@pytest.mark.asyncio
async def test_photon_reverse_request_error_returns_502() -> None:
    mock_client = AsyncMock()
    mock_client.get = AsyncMock(side_effect=httpx.ConnectError("connection refused"))
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    with patch("app.routers.api.geo.httpx.AsyncClient", return_value=mock_client):
        with pytest.raises(HTTPException) as exc_info:
            await photon_reverse(lat=52.52, lon=13.405)

    assert exc_info.value.status_code == 502
    assert exc_info.value.detail == "Geocoding service unavailable"


@pytest.mark.asyncio
async def test_photon_reverse_non_json_response_returns_502() -> None:
    mock_response = MagicMock()
    mock_response.status_code = 403
    mock_response.json.side_effect = ValueError("not json")

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_response)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    with patch("app.routers.api.geo.httpx.AsyncClient", return_value=mock_client):
        with pytest.raises(HTTPException) as exc_info:
            await photon_reverse(lat=52.52, lon=13.405)

    assert exc_info.value.status_code == 502
    assert exc_info.value.detail == "Geocoding service unavailable"
