"""
Model registry: JSON loading, tier filtering, OpenAI client.
"""

import json
import sys
from pathlib import Path
from typing import Any

from openai import OpenAI

from ..config import settings

_REGISTRY_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "models_registry.json"


def get_registry_path() -> Path:
    return _REGISTRY_PATH


def load_registry() -> dict[str, Any]:
    with _REGISTRY_PATH.open() as f:
        return json.load(f)


def save_registry(data: dict[str, Any]) -> None:
    with _REGISTRY_PATH.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")


def _load_registry() -> dict[str, Any]:
    return load_registry()


_registry = _load_registry()
MODELS_BY_PROVIDER = _registry["models_by_provider"]
UNREGISTERED_TIER_MODELS = set(_registry["unregistered_tier_models"])
FREE_TIER_MODELS = UNREGISTERED_TIER_MODELS.union(_registry["free_tier_additional_models"])
OPENROUTER_MODELS = []
for provider, models in MODELS_BY_PROVIDER.items():
    OPENROUTER_MODELS.extend(models)


def reload_registry() -> None:
    """Reload model data from JSON (used after admin modifies registry)."""
    global _registry, MODELS_BY_PROVIDER, UNREGISTERED_TIER_MODELS, FREE_TIER_MODELS, OPENROUTER_MODELS
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
