"""Bundled OpenRouter snapshot refresh and upsert helpers."""

import pytest

pytestmark = pytest.mark.unit


import json
from pathlib import Path

from app.llm.registry import (
    refresh_openrouter_snapshot_from_live_api,
    upsert_openrouter_snapshot_entries,
)


@pytest.fixture
def snapshot_path(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    path = tmp_path / "openrouter_models.json"
    path.write_text('{"data": [{"id": "vendor/old", "architecture": {}}]}\n', encoding="utf-8")
    monkeypatch.setattr("app.llm.registry._OPENROUTER_MODELS_PATH", path)
    monkeypatch.setattr("app.llm.registry._vision_support_cache", None)
    monkeypatch.setattr("app.llm.registry._vision_probed_cache", None)
    monkeypatch.setattr("app.llm.registry._temperature_support_cache", None)
    monkeypatch.setattr("app.llm.registry._text_token_price_cache", None)
    monkeypatch.setattr("app.llm.registry._openrouter_known_ids_cache", None)
    monkeypatch.setattr("app.llm.registry._openrouter_thinking_model_ids_cache", None)
    return path


def test_upsert_adds_and_updates_row(snapshot_path: Path) -> None:
    upsert_openrouter_snapshot_entries(
        [{"id": "vendor/new", "architecture": {"modality": "text->text"}}]
    )
    root = json.loads(snapshot_path.read_text(encoding="utf-8"))
    ids = [m["id"] for m in root["data"]]
    assert ids == ["vendor/new", "vendor/old"]

    upsert_openrouter_snapshot_entries(
        [{"id": "vendor/old", "architecture": {"modality": "text+image->text"}}]
    )
    root = json.loads(snapshot_path.read_text(encoding="utf-8"))
    old = next(m for m in root["data"] if m["id"] == "vendor/old")
    assert old["architecture"]["modality"] == "text+image->text"


def test_refresh_replaces_all_registry_rows(
    snapshot_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    registry = {
        "models_by_provider": {
            "Test": [
                {"id": "vendor/a"},
                {"id": "vendor/b"},
            ]
        },
        "unregistered_tier_models": [],
        "free_tier_additional_models": [],
    }
    monkeypatch.setattr("app.llm.registry.load_registry", lambda: registry)
    monkeypatch.setattr(
        "app.llm.tokens.fetch_all_models_from_openrouter",
        lambda: {
            "vendor/a": {"id": "vendor/a", "architecture": {"modality": "text->text"}},
            "vendor/b": {"id": "vendor/b", "architecture": {"modality": "text+image->text"}},
            "vendor/other": {"id": "vendor/other"},
        },
    )

    result = refresh_openrouter_snapshot_from_live_api(dry_run=False)
    assert result.written == 2
    assert result.removed == 1
    assert result.added == 2
    root = json.loads(snapshot_path.read_text(encoding="utf-8"))
    assert [m["id"] for m in root["data"]] == ["vendor/a", "vendor/b"]


def test_refresh_dry_run_does_not_write(
    snapshot_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    before = snapshot_path.read_text(encoding="utf-8")
    monkeypatch.setattr(
        "app.llm.registry.get_registry_model_ids",
        lambda registry=None: {"vendor/x"},
    )
    monkeypatch.setattr(
        "app.llm.tokens.fetch_all_models_from_openrouter",
        lambda: {"vendor/x": {"id": "vendor/x"}},
    )
    result = refresh_openrouter_snapshot_from_live_api(dry_run=True)
    assert result.dry_run is True
    assert result.written == 1
    assert snapshot_path.read_text(encoding="utf-8") == before
