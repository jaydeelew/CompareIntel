"""Hybrid vision support resolution (probed registry overrides metadata)."""

from app.llm.registry import (
    KNOWN_NON_VISION_MODEL_IDS,
    get_model_supports_vision,
    invalidate_vision_probed_cache,
    openrouter_entry_supports_vision_input,
)


def test_openrouter_entry_supports_vision_input() -> None:
    assert openrouter_entry_supports_vision_input(
        {
            "architecture": {
                "modality": "text+image->text",
                "input_modalities": ["text", "image"],
            }
        }
    )
    assert not openrouter_entry_supports_vision_input(
        {
            "architecture": {
                "modality": "text->text",
                "input_modalities": ["text"],
            }
        }
    )


def test_get_model_supports_vision_uses_probed_true(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.llm.registry.MODELS_BY_PROVIDER",
        {"Test": [{"id": "vendor/x", "supports_vision_probed": True}]},
    )
    invalidate_vision_probed_cache()
    assert get_model_supports_vision("vendor/x") is True


def test_get_model_supports_vision_uses_probed_false_over_metadata(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.llm.registry.MODELS_BY_PROVIDER",
        {"Test": [{"id": "vendor/x", "supports_vision_probed": False}]},
    )
    monkeypatch.setattr(
        "app.llm.registry._load_vision_support_map",
        lambda: {"vendor/x": True},
    )
    invalidate_vision_probed_cache()
    assert get_model_supports_vision("vendor/x") is False


def test_get_model_supports_vision_known_non_vision_without_probe(monkeypatch) -> None:
    monkeypatch.setattr("app.llm.registry.MODELS_BY_PROVIDER", {"Test": []})
    monkeypatch.setattr(
        "app.llm.registry._load_vision_support_map",
        lambda: {"anthropic/claude-3.5-haiku": True},
    )
    invalidate_vision_probed_cache()
    model_id = next(iter(KNOWN_NON_VISION_MODEL_IDS))
    assert get_model_supports_vision(model_id) is False


def test_get_model_supports_vision_falls_back_to_metadata(monkeypatch) -> None:
    monkeypatch.setattr("app.llm.registry.MODELS_BY_PROVIDER", {"Test": []})
    monkeypatch.setattr(
        "app.llm.registry._load_vision_support_map",
        lambda: {"vendor/y": True},
    )
    invalidate_vision_probed_cache()
    assert get_model_supports_vision("vendor/y") is True
