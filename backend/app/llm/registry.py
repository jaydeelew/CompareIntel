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

# OpenRouter /models: ids that appear in openrouter_models.json snapshot
_openrouter_known_ids_cache: frozenset[str] | None = None
# Subset: models that advertise reasoning / include_reasoning parameters (separable thinking traces)
_openrouter_thinking_model_ids_cache: frozenset[str] | None = None

# Cache for model vision support (model_id -> bool)
_vision_support_cache: dict[str, bool] | None = None

# Cache for image generation support (model_id -> bool)
_image_gen_support_cache: dict[str, bool] | None = None

# Cache for pricing.image (model_id -> float, dollars per image)
_image_price_cache: dict[str, float] | None = None

# Models that OpenRouter metadata incorrectly marks as vision-capable but the API rejects image input.
# See: claude-3-5-haiku-20241022 description "It does not support image inputs."
KNOWN_NON_VISION_MODEL_IDS: frozenset[str] = frozenset(
    {
        "anthropic/claude-3.5-haiku",
        "anthropic/claude-3.5-haiku-20241022",
    }
)

# Models that do not support the temperature parameter (provider returns 400 if passed).
KNOWN_NO_TEMPERATURE_MODEL_IDS: frozenset[str] = frozenset(
    {
        "openai/gpt-5-image",
        "openai/gpt-5-image-mini",
    }
)


def _load_vision_support_map() -> dict[str, bool]:
    """Load model_id -> supports_vision from openrouter_models.json.

    Vision support is indicated by modality containing 'image' (e.g., text+image->text)
    or input_modalities containing 'image'. Checks top-level modality, architecture.modality,
    architecture.vision, and architecture.input_modalities.
    """
    global _vision_support_cache
    if _vision_support_cache is not None:
        return _vision_support_cache

    result: dict[str, bool] = {}
    try:
        if _OPENROUTER_MODELS_PATH.exists():
            with _OPENROUTER_MODELS_PATH.open() as f:
                data = json.load(f)
            for model in data.get("data", []):
                model_id = model.get("id")
                if model_id:
                    modality = model.get("modality") or ""
                    arch = model.get("architecture") or {}
                    arch_modality = (arch.get("modality") or "") if isinstance(arch, dict) else ""
                    arch_vision = (arch.get("vision") or "") if isinstance(arch, dict) else ""
                    input_mods = arch.get("input_modalities") if isinstance(arch, dict) else []
                    input_mods_str = (
                        " ".join(str(m) for m in input_mods).lower()
                        if isinstance(input_mods, (list, tuple))
                        else ""
                    )
                    vision_input = (
                        "image" in modality.lower()
                        or "image" in arch_modality.lower()
                        or "image" in str(arch_vision).lower()
                        or "image" in input_mods_str
                    )
                    result[model_id] = vision_input
    except Exception:
        pass

    _vision_support_cache = result
    return result


def get_model_supports_vision(model_id: str) -> bool:
    """Return True if the model supports image/vision inputs."""
    if model_id in KNOWN_NON_VISION_MODEL_IDS:
        return False
    return _load_vision_support_map().get(model_id, False)


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
    if model_id in KNOWN_NO_TEMPERATURE_MODEL_IDS:
        return False
    return _load_temperature_support_map().get(model_id, True)  # Default True if unknown


def is_thinking_model_from_openrouter_entry(model_data: dict[str, Any] | None) -> bool | None:
    """True if OpenRouter lists ``reasoning`` / ``include_reasoning`` in ``supported_parameters``.

    Use with a single object from the live ``/api/v1/models`` ``data[]`` list or the local snapshot.
    Returns ``None`` if the payload does not include a usable ``supported_parameters`` list.
    """
    if not model_data or not isinstance(model_data, dict):
        return None
    params = model_data.get("supported_parameters")
    if not isinstance(params, list):
        return None
    return "reasoning" in params or "include_reasoning" in params


# OpenRouter may list reasoning parameters even when the provider does not return stream chunks
# (``delta.reasoning`` / ``reasoning_content``) to the client.
_REASONING_NOT_EXPOSED_DESCRIPTION_MARKERS: tuple[str, ...] = (
    "reasoning is not exposed",
    "thinking traces are not exposed",
    "thinking trace is not exposed",
)

STREAMING_REASONING_MODEL_IDS_BLOCKED: frozenset[str] = frozenset(
    {
        "x-ai/grok-4",
    }
)

# Bundled ``openrouter_models.json`` can lag; these CompareIntel registry ids stream separable
# reasoning via OpenRouter but are missing from the snapshot — keep in sync when refreshing data.
STREAMING_REASONING_MODEL_IDS_NOT_IN_SNAPSHOT: frozenset[str] = frozenset(
    {
        "anthropic/claude-opus-4.5",
        "anthropic/claude-sonnet-4.5",
        "anthropic/claude-opus-4.6",
        "anthropic/claude-sonnet-4.6",
    }
)


def _openrouter_description_denies_exposed_reasoning(description: str) -> bool:
    d = (description or "").lower()
    return any(marker in d for marker in _REASONING_NOT_EXPOSED_DESCRIPTION_MARKERS)


def streams_separable_reasoning_from_openrouter_entry(
    model_data: dict[str, Any] | None,
) -> bool | None:
    """Whether OpenRouter metadata suggests separable reasoning text is returned in the stream.

    This is stricter than :func:`is_thinking_model_from_openrouter_entry`: some models advertise
    ``reasoning`` parameters while documentation states traces are not exposed.

    Returns ``None`` if ``supported_parameters`` is missing from the payload; otherwise ``bool``.
    """
    base = is_thinking_model_from_openrouter_entry(model_data)
    if base is None:
        return None
    if not base:
        return False
    if not model_data or not isinstance(model_data, dict):
        return False
    mid = model_data.get("id")
    if isinstance(mid, str) and mid in STREAMING_REASONING_MODEL_IDS_BLOCKED:
        return False
    desc = model_data.get("description") or ""
    if _openrouter_description_denies_exposed_reasoning(str(desc)):
        return False
    return True


def _load_openrouter_model_ids_and_thinking() -> tuple[frozenset[str], frozenset[str]]:
    """Parse openrouter_models.json once: all ids, and ids that stream separable reasoning."""
    global _openrouter_known_ids_cache, _openrouter_thinking_model_ids_cache
    if _openrouter_known_ids_cache is not None and _openrouter_thinking_model_ids_cache is not None:
        return _openrouter_known_ids_cache, _openrouter_thinking_model_ids_cache

    known: set[str] = set()
    thinking: set[str] = set()
    try:
        if _OPENROUTER_MODELS_PATH.exists():
            with _OPENROUTER_MODELS_PATH.open() as f:
                data = json.load(f)
            for model in data.get("data", []):
                model_id = model.get("id")
                if not model_id:
                    continue
                known.add(model_id)
                if streams_separable_reasoning_from_openrouter_entry(model) is True:
                    thinking.add(model_id)
    except Exception:
        pass

    _openrouter_known_ids_cache = frozenset(known)
    _openrouter_thinking_model_ids_cache = frozenset(thinking)
    return _openrouter_known_ids_cache, _openrouter_thinking_model_ids_cache


def get_openrouter_thinking_model_flag(model_id: str) -> bool | None:
    """If ``model_id`` is in the local OpenRouter snapshot, return whether it streams separable reasoning.

    Uses ``supported_parameters`` plus description / id exclusions (see
    :func:`streams_separable_reasoning_from_openrouter_entry`). When the id is missing from the
    snapshot, returns ``None``.
    """
    known, thinking = _load_openrouter_model_ids_and_thinking()
    if model_id not in known:
        return None
    return model_id in thinking


def resolve_is_thinking_model_for_ui(
    model_id: str, registry_entry: dict[str, Any] | None = None
) -> bool:
    """Whether to show the thinking-model (T) indicator and request OpenRouter reasoning stream params."""
    flag = get_openrouter_thinking_model_flag(model_id)
    if flag is not None:
        return flag
    if model_id in STREAMING_REASONING_MODEL_IDS_NOT_IN_SNAPSHOT:
        return True
    reg = registry_entry or {}
    return reg.get("is_thinking_model") is True


def is_thinking_model_registry_file_value(model_id: str) -> bool:
    """Value to persist in ``models_registry.json`` when syncing flags (no legacy key carryover)."""
    flag = get_openrouter_thinking_model_flag(model_id)
    if flag is not None:
        return flag
    return model_id in STREAMING_REASONING_MODEL_IDS_NOT_IN_SNAPSHOT


def should_request_openrouter_reasoning_traces(model_id: str) -> bool:
    """Whether to add a ``reasoning`` object to OpenRouter chat ``extra_body``.

    Without it, many providers (notably Anthropic) omit separable reasoning deltas from the stream,
    so the UI never receives ``delta.reasoning`` / ``reasoning_content`` chunks.
    """
    reg_entry: dict[str, Any] | None = None
    for m in OPENROUTER_MODELS:
        if m.get("id") == model_id:
            reg_entry = m
            break
    return resolve_is_thinking_model_for_ui(model_id, reg_entry)


def openrouter_reasoning_request_body(model_id: str) -> dict[str, Any]:
    """Value for ``extra_body[\"reasoning\"]`` (see OpenRouter reasoning-tokens docs)."""
    mid = model_id.lower()
    # Anthropic: thinking budget via max_tokens (OpenRouter normalizes to provider).
    # Provider rejects values above 31999 (e.g. 400: reasoning.maxtokens must be 1024–31999).
    if mid.startswith("anthropic/"):
        return {"max_tokens": 31999}
    # OpenAI o-series / GPT-5: effort-based
    if mid.startswith("openai/") and ("/o" in mid or "gpt-5" in mid):
        return {"effort": "medium"}
    if mid.startswith("x-ai/"):
        return {"effort": "medium"}
    return {"enabled": True}


def _load_image_gen_support_map() -> dict[str, bool]:
    global _image_gen_support_cache
    if _image_gen_support_cache is not None:
        return _image_gen_support_cache
    result: dict[str, bool] = {}
    try:
        if _OPENROUTER_MODELS_PATH.exists():
            with _OPENROUTER_MODELS_PATH.open() as f:
                data = json.load(f)
            for model in data.get("data", []):
                model_id = model.get("id")
                if model_id:
                    arch = model.get("architecture") or {}
                    out_mods = arch.get("output_modalities") if isinstance(arch, dict) else []
                    out_str = (
                        " ".join(str(m) for m in out_mods).lower()
                        if isinstance(out_mods, (list, tuple))
                        else ""
                    )
                    result[model_id] = "image" in out_str
    except Exception:
        pass
    _image_gen_support_cache = result
    return result


def get_model_supports_image_generation(model_id: str) -> bool:
    return _load_image_gen_support_map().get(model_id, False)


def _load_image_price_map() -> dict[str, float]:
    global _image_price_cache
    if _image_price_cache is not None:
        return _image_price_cache
    result: dict[str, float] = {}
    try:
        if _OPENROUTER_MODELS_PATH.exists():
            with _OPENROUTER_MODELS_PATH.open() as f:
                data = json.load(f)
            for model in data.get("data", []):
                model_id = model.get("id")
                if model_id:
                    pricing = model.get("pricing") or {}
                    img_val = pricing.get("image") if isinstance(pricing, dict) else None
                    if img_val is not None:
                        try:
                            result[model_id] = float(img_val)
                        except (ValueError, TypeError):
                            pass
    except Exception:
        pass
    _image_price_cache = result
    return result


def get_model_image_price_per_image(model_id: str) -> float | None:
    price = _load_image_price_map().get(model_id)
    return price if price and price > 0 else None


def get_model_returns_multiple_images(model_id: str) -> bool:
    """True if image_config_test_results.json showed this model returns 2+ images.

    When True, we only show the first image to the user.
    """
    for m in OPENROUTER_MODELS:
        if m.get("id") == model_id:
            return m.get("returns_multiple_images", False)
    return False


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

    # Public /models response is cached; invalidate so new models appear without stale HTTP cache.
    try:
        from app.cache import invalidate_models_cache

        invalidate_models_cache()
    except Exception:
        pass


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
