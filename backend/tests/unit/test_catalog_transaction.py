"""Validation, atomic catalog commits, and the CI catalog checks."""

import json
import os
from pathlib import Path

import pytest

pytestmark = pytest.mark.unit

from scripts.catalog_transaction import (
    ADDING_NEW_MODELS_DOC,
    STANDARD_PROMPTS,
    CatalogPaths,
    CatalogValidationError,
    CatalogWriteError,
    check_live_catalog,
    commit_catalog_files,
    consistency_errors,
    new_model_gate_errors,
    renderer_config_errors,
    repo_root,
    tempfile_mkstemp,
    validate_registry,
    validate_renderer_configs,
)

REPO = repo_root()


def _model(model_id: str = "acme/new-model", **overrides: object) -> dict:
    entry: dict = {
        "id": model_id,
        "name": "New Model",
        "description": "A text model used in tests",
        "category": "Language",
        "provider": "Acme",
    }
    entry.update(overrides)
    return entry


def _config(model_id: str = "acme/new-model") -> dict:
    return {
        "modelId": model_id,
        "version": "1.0.0",
        "displayMathDelimiters": [
            {"pattern": r"/\$\$([^$]+?)\$\$/gs", "name": "double-dollar", "priority": 1},
            {"pattern": r"/\\\[\s*([\s\S]*?)\s*\\\]/g", "name": "bracket", "priority": 2},
        ],
        "inlineMathDelimiters": [
            {
                "pattern": r"/(?<!\$)\$([^$\n]+?)\$(?!\$)/g",
                "name": "single-dollar",
                "priority": 1,
            },
            {"pattern": r"/\\\(\s*([\s\S]*?)\s*\\\)/g", "name": "paren", "priority": 2},
        ],
        "codeBlockPreservation": {
            "enabled": True,
            "extractBeforeProcessing": True,
            "restoreAfterProcessing": True,
        },
    }


def _registry(*models: dict) -> dict:
    return {"models_by_provider": {"Acme": list(models)}}


def _paths(tmp_path: Path) -> CatalogPaths:
    return CatalogPaths(
        registry=tmp_path / "models_registry.json",
        renderer_configs=tmp_path / "model_renderer_configs.json",
        defaults=tmp_path / "renderer_defaults.json",
        allowlist=tmp_path / "coverage-allowlist.json",
        runs=tmp_path / "runs",
    )


def _write_pair(paths: CatalogPaths, registry: dict, configs: list[dict]) -> None:
    paths.registry.write_text(json.dumps(registry), encoding="utf-8")
    paths.renderer_configs.write_text(json.dumps(configs), encoding="utf-8")
    paths.defaults.write_text(json.dumps({"entries": []}), encoding="utf-8")


def test_registry_rejects_bad_id_duplicate_and_missing_fields():
    errors = validate_registry(
        {
            "models_by_provider": {
                "Acme": [
                    _model("not a slug"),
                    _model("acme/one", name=""),
                    _model("acme/two", provider="Other"),
                    _model("acme/two"),
                ]
            }
        }
    )
    joined = "\n".join(errors)
    assert "provider/model-name" in joined
    assert "missing required field name" in joined
    assert "does not match" in joined
    assert "Duplicate model id acme/two" in joined


def test_renderer_config_requires_schema_and_provider_id():
    config = _config("bare-id")
    assert any("provider/model-name" in error for error in renderer_config_errors(config))
    broken = _config()
    broken["codeBlockPreservation"] = {
        "enabled": False,
        "extractBeforeProcessing": False,
        "restoreAfterProcessing": False,
    }
    broken["displayMathDelimiters"] = [{"pattern": "/(/", "name": "double-dollar"}]
    errors = validate_renderer_configs([broken, broken])
    joined = "\n".join(errors)
    assert "Duplicate renderer config modelId" in joined
    assert "Code block preservation must be enabled" in joined
    assert "Invalid regex" in joined


def test_validation_failure_does_not_touch_files(tmp_path: Path):
    paths = _paths(tmp_path)
    original_registry = _registry(_model())
    original_configs = [_config()]
    _write_pair(paths, original_registry, original_configs)
    before_registry = paths.registry.read_bytes()
    before_config = paths.renderer_configs.read_bytes()

    invalid = _registry(_model(), _model())
    with pytest.raises(CatalogValidationError) as caught:
        commit_catalog_files(
            invalid,
            original_configs,
            paths=paths,
            defaults={"entries": []},
        )
    assert caught.value.errors
    assert paths.registry.read_bytes() == before_registry
    assert paths.renderer_configs.read_bytes() == before_config
    assert list(tmp_path.glob(".*.tmp")) == []


def test_commit_replaces_both_files(tmp_path: Path):
    paths = _paths(tmp_path)
    _write_pair(paths, _registry(_model()), [_config()])
    updated = _registry(_model(name="Renamed"))
    rollback = commit_catalog_files(
        updated,
        [_config()],
        paths=paths,
        defaults={"entries": []},
    )
    assert (
        json.loads(paths.registry.read_text(encoding="utf-8"))["models_by_provider"]["Acme"][0][
            "name"
        ]
        == "Renamed"
    )
    assert json.loads(paths.renderer_configs.read_text(encoding="utf-8"))[0]["modelId"] == (
        "acme/new-model"
    )
    rollback()
    assert (
        json.loads(paths.registry.read_text(encoding="utf-8"))["models_by_provider"]["Acme"][0][
            "name"
        ]
        == "New Model"
    )


def test_failed_second_replace_restores_the_registry(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    paths = _paths(tmp_path)
    _write_pair(paths, _registry(_model()), [_config()])
    before_registry = paths.registry.read_bytes()
    before_config = paths.renderer_configs.read_bytes()
    real_replace = os.replace
    calls = {"n": 0}

    def flaky(src, dst):
        calls["n"] += 1
        if calls["n"] == 2:
            raise OSError("disk full")
        return real_replace(src, dst)

    monkeypatch.setattr("scripts.catalog_transaction.os.replace", flaky)
    with pytest.raises(CatalogWriteError) as caught:
        commit_catalog_files(
            _registry(_model(name="Renamed")),
            [_config()],
            paths=paths,
            defaults={"entries": []},
        )
    assert "restored" in str(caught.value)
    assert paths.registry.read_bytes() == before_registry
    assert paths.renderer_configs.read_bytes() == before_config
    assert list(tmp_path.glob(".*.tmp")) == []


def test_failed_temp_write_leaves_both_files(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    paths = _paths(tmp_path)
    _write_pair(paths, _registry(_model()), [_config()])
    before_registry = paths.registry.read_bytes()
    before_config = paths.renderer_configs.read_bytes()
    real_mkstemp = tempfile_mkstemp
    calls = {"n": 0}

    def flaky(path: Path):
        calls["n"] += 1
        if calls["n"] == 2:
            raise OSError("cannot create temp")
        return real_mkstemp(path)

    monkeypatch.setattr("scripts.catalog_transaction.tempfile_mkstemp", flaky)
    with pytest.raises(OSError, match="cannot create temp"):
        commit_catalog_files(
            _registry(_model(name="Renamed")),
            [_config()],
            paths=paths,
            defaults={"entries": []},
        )
    assert paths.registry.read_bytes() == before_registry
    assert paths.renderer_configs.read_bytes() == before_config
    assert list(tmp_path.glob(".*.tmp")) == []


def test_explicit_default_covers_a_text_model_and_orphans_fail():
    registry = _registry(_model(), _model("acme/other-model", name="Other"))
    configs = [_config()]
    defaults = {
        "entries": [
            {
                "modelId": "acme/other-model",
                "reason": "Uses the built-in default renderer; replies use $$ and $ only.",
            }
        ]
    }
    assert consistency_errors(registry, configs, defaults) == []

    orphan = consistency_errors(registry, [_config(), _config("gone/retired")], {"entries": []})
    assert any("Orphan renderer config gone/retired" in error for error in orphan)
    assert any("acme/other-model has no renderer config" in error for error in orphan)

    both = consistency_errors(
        registry,
        configs,
        {"entries": [{"modelId": "acme/new-model", "reason": "duplicate of the config"}]},
    )
    assert any("both a renderer config and an explicit default" in error for error in both)


def test_generator_drift_flags_a_config_missing_standard_delimiters():
    stale = _config()
    stale["displayMathDelimiters"] = [
        {"pattern": r"/\$\$([^$]+?)\$\$/gs", "name": "double-dollar", "priority": 1}
    ]
    stale["inlineMathDelimiters"] = [
        {
            "pattern": r"/(?<!\$)\$([^$\n]+?)\$(?!\$)/g",
            "name": "single-dollar",
            "priority": 1,
        }
    ]
    errors = consistency_errors(_registry(_model()), [stale], {"entries": []})
    assert any("generate_renderer_configs.py" in error for error in errors)
    assert any(ADDING_NEW_MODELS_DOC in error for error in errors)


def test_new_model_gate_requires_saved_cells_or_allowlist(tmp_path: Path):
    base = _registry(_model("acme/old-model", name="Old"))
    head = _registry(
        _model("acme/old-model", name="Old"),
        _model(),
        _model("acme/picture", name="Picture", category="Image"),
    )
    missing = new_model_gate_errors(base, head, runs_root=tmp_path / "runs", allowlist=[])
    assert len(missing) == 1
    assert "acme/new-model" in missing[0]
    assert "01-math-basics" in missing[0]
    assert ADDING_NEW_MODELS_DOC in missing[0]
    assert "acme/picture" not in missing[0]
    assert "acme/old-model" not in missing[0]

    runs = tmp_path / "runs" / "batch"
    runs.mkdir(parents=True)
    for prompt in STANDARD_PROMPTS:
        (runs / f"{prompt}.json").write_text(
            json.dumps(
                {
                    "modelId": "acme/new-model",
                    "promptName": prompt,
                    "response": f"saved reply for {prompt}",
                }
            ),
            encoding="utf-8",
        )
    assert new_model_gate_errors(base, head, runs_root=tmp_path / "runs", allowlist=[]) == []

    empty_runs = tmp_path / "empty"
    allowed = new_model_gate_errors(
        base,
        head,
        runs_root=empty_runs,
        allowlist=[{"modelId": "acme/new-model", "reason": "Documented exception for this test."}],
    )
    assert allowed == []


def test_current_master_catalog_passes_consistency():
    errors = check_live_catalog(REPO)
    assert errors == []
