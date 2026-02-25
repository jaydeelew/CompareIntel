"""
Model registry: JSON loading, tier filtering, OpenAI client.
"""

import json
import re
import sys
from pathlib import Path
from typing import Any

from openai import OpenAI

from ..config import settings

_REGISTRY_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "models_registry.json"
_OPENROUTER_MODELS_PATH = Path(__file__).resolve().parent.parent.parent / "openrouter_models.json"

# Cache for model temperature support (model_id -> bool)
_temperature_support_cache: dict[str, bool] | None = None


def _load_temperature_support_map() -> dict[str, bool]:
    """Load model_id -> supports_temperature from openrouter_models.json."""
    global _temperature_support_cache
    if _temperature_support_cache is not None:
        return _temperature_support_cache

    result: dict[str, bool] = {}
    try:
        if _OPENROUTER_MODELS_PATH.exists():
            with _OPENROUTER_MODELS_PATH.open() as f:
                data = json.load(f)
            for model in data.get("data", []):
                model_id = model.get("id")
                if model_id:
                    params = model.get("supported_parameters", [])
                    result[model_id] = (
                        "temperature" in params if isinstance(params, list) else False
                    )
    except Exception:
        pass

    _temperature_support_cache = result
    return result


def get_model_supports_temperature(model_id: str) -> bool:
    """Return True if the model supports the temperature parameter."""
    return _load_temperature_support_map().get(model_id, True)  # Default True if unknown


def get_registry_path() -> Path:
    return _REGISTRY_PATH


def load_registry() -> dict[str, Any]:
    with _REGISTRY_PATH.open() as f:
        return json.load(f)


def save_registry(data: dict[str, Any]) -> None:
    with _REGISTRY_PATH.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")


def _deduplicate_models_by_provider(
    mbp: dict[str, list[dict[str, Any]]],
) -> dict[str, list[dict[str, Any]]]:
    """Remove duplicate models (by id) within each provider. Keeps first occurrence."""
    result = {}
    for provider, models in mbp.items():
        seen_ids: set[str] = set()
        deduped = []
        for m in models:
            mid = m.get("id")
            if mid and mid not in seen_ids:
                seen_ids.add(mid)
                deduped.append(m)
        result[provider] = deduped
    return result


def _load_registry() -> dict[str, Any]:
    data = load_registry()
    # Deduplicate models to prevent duplicate entries in UI
    if "models_by_provider" in data:
        data["models_by_provider"] = _deduplicate_models_by_provider(data["models_by_provider"])
    return data


_registry = _load_registry()
MODELS_BY_PROVIDER = _registry["models_by_provider"]
UNREGISTERED_TIER_MODELS = set(_registry["unregistered_tier_models"])
FREE_TIER_MODELS = UNREGISTERED_TIER_MODELS.union(_registry["free_tier_additional_models"])
OPENROUTER_MODELS = []
for provider, models in MODELS_BY_PROVIDER.items():
    OPENROUTER_MODELS.extend(models)


def reload_registry() -> None:
    """Reload model data from JSON (used after admin modifies registry)."""
    global \
        _registry, \
        MODELS_BY_PROVIDER, \
        UNREGISTERED_TIER_MODELS, \
        FREE_TIER_MODELS, \
        OPENROUTER_MODELS
    _registry = _load_registry()
    MODELS_BY_PROVIDER = _registry["models_by_provider"]
    UNREGISTERED_TIER_MODELS = set(_registry["unregistered_tier_models"])
    FREE_TIER_MODELS = UNREGISTERED_TIER_MODELS.union(_registry["free_tier_additional_models"])
    OPENROUTER_MODELS = []
    for provider, models in MODELS_BY_PROVIDER.items():
        OPENROUTER_MODELS.extend(models)

    llm_mod = sys.modules.get("app.llm")
    if llm_mod:
        llm_mod.MODELS_BY_PROVIDER = MODELS_BY_PROVIDER
        llm_mod.UNREGISTERED_TIER_MODELS = UNREGISTERED_TIER_MODELS
        llm_mod.FREE_TIER_MODELS = FREE_TIER_MODELS
        llm_mod.OPENROUTER_MODELS = OPENROUTER_MODELS
    mr_mod = sys.modules.get("app.model_runner")
    if mr_mod:
        mr_mod.MODELS_BY_PROVIDER = MODELS_BY_PROVIDER
        mr_mod.UNREGISTERED_TIER_MODELS = UNREGISTERED_TIER_MODELS
        mr_mod.FREE_TIER_MODELS = FREE_TIER_MODELS
        mr_mod.OPENROUTER_MODELS = OPENROUTER_MODELS


def _get_model_tier_for_sort(model_id: str) -> int:
    """Get tier classification for sorting: 0=unregistered, 1=free, 2=paid."""
    if model_id in UNREGISTERED_TIER_MODELS:
        return 0
    if model_id in FREE_TIER_MODELS:
        return 1
    return 2


def _extract_version_number(model_name: str) -> tuple[int, int, int]:
    """Extract version numbers from model name for sorting. Returns (major, minor, patch)."""
    version_patterns = [
        r"(\d+)\.(\d+)\.(\d+)",
        r"(\d+)\.(\d+)",
        r"(\d+)",
    ]
    for pattern in version_patterns:
        match = re.search(pattern, model_name)
        if match:
            groups = match.groups()
            if len(groups) == 3:
                return (int(groups[0]), int(groups[1]), int(groups[2]))
            if len(groups) == 2:
                return (int(groups[0]), int(groups[1]), 0)
            if len(groups) == 1:
                return (int(groups[0]), 0, 0)
    return (0, 0, 0)


def sort_models_by_tier_and_version(
    models: list[dict[str, Any]],
    tier_overrides: dict[str, str] | None = None,
) -> list[dict[str, Any]]:
    """Sort models by tier (Unregistered, Free, Premium) then by version ascending.

    tier_overrides: Optional map of model_id -> 'unregistered'|'free'|'paid' for models
    not yet in the registry (e.g., newly added).
    """
    tier_overrides = tier_overrides or {}
    tier_order = {"unregistered": 0, "free": 1, "paid": 2}

    def sort_key(model: dict[str, Any]) -> tuple:
        model_id = model.get("id", "")
        model_name = model.get("name", "")
        tier = tier_overrides.get(model_id)
        tier_num = tier_order[tier] if tier is not None else _get_model_tier_for_sort(model_id)
        version = _extract_version_number(model_name)
        return (tier_num, version, model_name)

    return sorted(models, key=sort_key)


def is_model_available_for_tier(model_id: str, tier: str, is_trial_active: bool = False) -> bool:
    if is_trial_active and tier == "free":
        return True
    if tier in ["starter", "starter_plus", "pro", "pro_plus"]:
        return True
    if tier == "unregistered":
        return model_id in UNREGISTERED_TIER_MODELS
    if tier == "free":
        return model_id in FREE_TIER_MODELS
    return False


def filter_models_by_tier(
    models: list[dict[str, Any]], tier: str, is_trial_active: bool = False
) -> list[dict[str, Any]]:
    result = []
    for model in models:
        model_id = model.get("id")
        if not model_id:
            continue
        model_with_access = model.copy()
        if model_id in UNREGISTERED_TIER_MODELS:
            model_with_access["tier_access"] = "unregistered"
        elif model_id in FREE_TIER_MODELS:
            model_with_access["tier_access"] = "free"
        else:
            model_with_access["tier_access"] = "paid"
        if is_trial_active and tier == "free" and model_with_access["tier_access"] == "paid":
            model_with_access["trial_unlocked"] = True
        result.append(model_with_access)
    return result


client = OpenAI(api_key=settings.openrouter_api_key, base_url="https://openrouter.ai/api/v1")
client_with_tool_headers = OpenAI(
    api_key=settings.openrouter_api_key,
    base_url="https://openrouter.ai/api/v1",
    default_headers={
        "HTTP-Referer": "https://compareintel.com",
        "X-Title": "CompareIntel",
    },
)
