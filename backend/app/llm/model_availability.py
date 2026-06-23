"""
OpenRouter availability checks for registry models.

The models catalog can list ids that no longer have routable provider endpoints
(for example, retired Bedrock versions). The daily report must catch those cases,
not only ids missing from GET /api/v1/models.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import httpx

from ..config import settings

OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models"
OPENROUTER_ENDPOINTS_URL = "https://openrouter.ai/api/v1/models/{slug}/endpoints"


def get_live_model_entry(
    model_id: str, live_models: dict[str, dict[str, Any]]
) -> dict[str, Any] | None:
    if model_id in live_models:
        return live_models[model_id]
    for row in live_models.values():
        if row.get("canonical_slug") == model_id:
            return row
    return None


def is_model_listed_in_openrouter(model_id: str, live_models: dict[str, dict[str, Any]]) -> bool:
    return get_live_model_entry(model_id, live_models) is not None


def _openrouter_headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {settings.openrouter_api_key}",
        "HTTP-Referer": "https://compareintel.com",
    }


def _model_expired(entry: dict[str, Any], *, now: datetime | None = None) -> bool:
    expiration = entry.get("expiration_date")
    if expiration is None:
        return False
    now = now or datetime.now(UTC)
    try:
        expiration_dt = datetime.fromtimestamp(expiration, tz=UTC)
    except (TypeError, ValueError, OSError):
        return False
    return expiration_dt <= now


def _endpoints_all_zero_uptime(endpoints: list[dict[str, Any]]) -> bool:
    if not endpoints:
        return False
    uptimes = [endpoint.get("uptime_last_1d") for endpoint in endpoints]
    return all(uptime == 0 for uptime in uptimes)


def fetch_model_endpoints(
    canonical_slug: str,
    *,
    http_client: httpx.Client,
) -> tuple[list[dict[str, Any]] | None, str | None]:
    response = http_client.get(
        OPENROUTER_ENDPOINTS_URL.format(slug=canonical_slug),
        headers=_openrouter_headers(),
        timeout=30.0,
    )
    if response.status_code != 200:
        return None, f"OpenRouter endpoints API returned HTTP {response.status_code}"

    payload = response.json().get("data") or {}
    endpoints = payload.get("endpoints")
    if not isinstance(endpoints, list):
        return None, "OpenRouter endpoints API returned an unexpected payload"
    return endpoints, None


def assess_registry_model_availability(
    model: dict[str, Any],
    live_models: dict[str, dict[str, Any]],
    *,
    http_client: httpx.Client,
    check_endpoints: bool = True,
) -> dict[str, str] | None:
    """
    Assess one registry model against the live OpenRouter catalog.

    Returns an unavailable-model payload when the model should be reported, or None
    when it appears available.
    """
    model_id = model.get("id")
    if not model_id:
        return None

    base = {
        "id": model_id,
        "name": model.get("name", model_id),
        "provider": model.get("provider", "Unknown"),
    }

    if model.get("available") is False:
        return {**base, "reason": "Marked as not available in configuration"}

    live_entry = get_live_model_entry(model_id, live_models)
    if live_entry is None:
        return {**base, "reason": "Not found in OpenRouter's model list"}

    if _model_expired(live_entry):
        return {
            **base,
            "reason": "Listed on OpenRouter but past its expiration date",
        }

    if not check_endpoints:
        return None

    canonical_slug = live_entry.get("canonical_slug")
    if not canonical_slug:
        return None

    endpoints, endpoints_error = fetch_model_endpoints(canonical_slug, http_client=http_client)
    if endpoints_error:
        return {**base, "reason": endpoints_error}

    if not endpoints:
        return {
            **base,
            "reason": "Listed on OpenRouter but no provider endpoints are configured",
        }

    if _endpoints_all_zero_uptime(endpoints):
        return {
            **base,
            "reason": (
                "Listed on OpenRouter but all provider endpoints report 0% uptime "
                "in the last 24 hours (model is likely retired or unroutable)"
            ),
        }

    return None


def check_model_availability(
    configured_models: list[dict[str, Any]],
    live_models: dict[str, dict[str, Any]] | None,
    *,
    check_endpoints: bool = True,
) -> dict[str, Any]:
    """Check configured registry models against OpenRouter."""
    result: dict[str, Any] = {
        "total_models": len(configured_models),
        "available_models": [],
        "unavailable_models": [],
        "check_timestamp": datetime.now().isoformat(),
        "error": None,
    }

    if live_models is None:
        result["error"] = "Failed to fetch models from OpenRouter API"
        return result

    with httpx.Client(timeout=30.0) as http_client:
        for model in configured_models:
            model_id = model.get("id")
            if not model_id:
                continue

            unavailable = assess_registry_model_availability(
                model,
                live_models,
                http_client=http_client,
                check_endpoints=check_endpoints,
            )
            if unavailable is not None:
                result["unavailable_models"].append(unavailable)
            else:
                result["available_models"].append(
                    {
                        "id": model_id,
                        "name": model.get("name", model_id),
                        "provider": model.get("provider", "Unknown"),
                    }
                )

    return result
