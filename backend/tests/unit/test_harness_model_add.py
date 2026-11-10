"""Tests for harness reply files and the admin add-model registry write."""

import json

import pytest

pytestmark = pytest.mark.unit

from fastapi import HTTPException

from app.routers.admin.models_management import persist_added_registry
from scripts.harness_replies import (
    PROMPT_ORDER,
    admin_setup_failure_message,
    find_complete_replies,
    load_harness_prompts,
    prompts_dir,
    reply_filename,
    write_harness_replies,
)


def test_load_harness_prompts_matches_the_six_harness_files():
    prompts = load_harness_prompts()
    assert [item["name"] for item in prompts] == list(PROMPT_ORDER)
    assert all(item["prompt"].strip() for item in prompts)
    # Prompt 07 is a harness widening. It is not collected for a new text model.
    assert (prompts_dir() / "07-rare-formats.md").is_file()


def test_written_replies_are_found_and_reused(tmp_path):
    responses = {
        name: {"prompt": f"# {name}", "response": f"body {name}", "success": True}
        for name in PROMPT_ORDER
    }
    write_harness_replies("acme/new-model", "New Model", responses, tmp_path / "admin-1")
    found = find_complete_replies("acme/new-model", tmp_path)
    assert set(found) == set(PROMPT_ORDER)
    saved = json.loads(found["01-math-basics"].read_text(encoding="utf-8"))
    assert saved["modelId"] == "acme/new-model"
    assert saved["promptName"] == "01-math-basics"
    assert saved["response"] == "body 01-math-basics"
    assert saved["finishReason"] == "stop"


def test_empty_or_truncated_reply_is_not_reused(tmp_path):
    responses = {
        name: {"prompt": "p", "response": "complete", "success": True} for name in PROMPT_ORDER
    }
    write_harness_replies("acme/new-model", "New Model", responses, tmp_path / "batch")
    target = tmp_path / "batch" / reply_filename("acme/new-model", "03-code-blocks")
    data = json.loads(target.read_text(encoding="utf-8"))
    data["response"] = ""
    data["finishReason"] = "length"
    target.write_text(json.dumps(data), encoding="utf-8")
    found = find_complete_replies("acme/new-model", tmp_path)
    assert "03-code-blocks" not in found
    assert len(found) == 5


def test_render_failure_is_not_reported_as_success():
    message = admin_setup_failure_message(1, "", "RENDERING HARNESS FAILED: leftover \\[")
    assert "Rendering harness failed" in message
    assert "was not added" in message
    assert "added successfully" not in message.lower()


def test_offline_render_does_not_receive_the_openrouter_key(monkeypatch, tmp_path):
    captured: dict = {}

    def fake_run(cmd, **kwargs):
        captured["env"] = kwargs.get("env")
        results = tmp_path / "results.json"
        results.write_text(
            json.dumps(
                {
                    "results": [
                        {
                            "modelId": "acme/new-model",
                            "promptName": name,
                            "validationStatus": "pass",
                        }
                        for name in PROMPT_ORDER
                    ]
                }
            ),
            encoding="utf-8",
        )

        class Proc:
            returncode = 0
            stdout = "ok"
            stderr = ""

        return Proc()

    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-test")
    monkeypatch.setattr("scripts.harness_replies.shutil.which", lambda _name: "/usr/bin/npm")
    monkeypatch.setattr(
        "scripts.harness_replies.harness_root",
        lambda: tmp_path,
    )
    (tmp_path / "node_modules").mkdir()
    monkeypatch.setattr("scripts.harness_replies.subprocess.run", fake_run)

    from scripts.harness_replies import render_saved_replies

    result = render_saved_replies(tmp_path, "acme/new-model")
    assert result["state"] == "passed"
    assert "OPENROUTER_API_KEY" not in captured["env"]


def test_render_not_run_names_the_offline_command():
    message = admin_setup_failure_message(
        2,
        "",
        "HARNESS_RENDER_NOT_RUN: npm missing\nHARNESS_COMMAND: npm run harness -- --render-only",
    )
    assert "did not run" in message
    assert "were removed" in message
    assert "was not added" in message
    assert "added successfully" not in message.lower()


def test_unsuccessful_render_removes_files_this_attempt_wrote(monkeypatch, tmp_path):
    """A failed render and a render that cannot start both leave nothing new behind."""
    runs = tmp_path / "runs"
    historical = runs / "2026-01-01"
    historical.mkdir(parents=True)
    (historical / "keep.json").write_text("{}", encoding="utf-8")
    replies = {}
    for name in PROMPT_ORDER:
        path = historical / reply_filename("acme/new-model", name)
        path.write_text(
            json.dumps(
                {
                    "modelId": "acme/new-model",
                    "promptName": name,
                    "promptText": "p",
                    "response": "hello",
                    "finishReason": "stop",
                }
            ),
            encoding="utf-8",
        )
        replies[name] = path

    monkeypatch.setattr("scripts.setup_model_renderer.find_complete_replies", lambda _mid: replies)
    monkeypatch.setattr("scripts.setup_model_renderer.runs_root", lambda: runs)
    monkeypatch.setattr("scripts.harness_replies.runs_root", lambda: runs)
    removed: list[str] = []
    monkeypatch.setattr(
        "scripts.harness_replies.remove_model_config",
        lambda model_id: removed.append(model_id),
    )
    monkeypatch.setattr("scripts.setup_model_renderer.has_model_config", lambda _mid: False)

    def save_config(self, config):
        path = tmp_path / "config-written-this-attempt.json"
        path.write_text(json.dumps(config), encoding="utf-8")
        return path

    monkeypatch.setattr("scripts.setup_model_renderer.ModelRendererSetup.save_config", save_config)

    states = iter(["failed", "not-run"])

    def render(_run_dir, _model_id):
        state = next(states)
        return {
            "state": state,
            "command": "npm run harness -- --render-only --render-dir=runs/admin-x",
            "message": state,
        }

    monkeypatch.setattr("scripts.setup_model_renderer.render_saved_replies", render)

    from scripts.harness_replies import HarnessRenderFailedError, HarnessRenderNotRunError
    from scripts.setup_model_renderer import ModelRendererSetup

    setup = ModelRendererSetup("acme/new-model", verbose=False)
    with pytest.raises(HarnessRenderFailedError):
        setup.run(defer_coverage=True)
    assert removed == ["acme/new-model"]
    assert not any(path.name.startswith("admin-") for path in runs.iterdir())
    assert (historical / "keep.json").is_file()
    assert set(replies) == set(PROMPT_ORDER)

    monkeypatch.setattr("scripts.setup_model_renderer.has_model_config", lambda _mid: True)
    setup_skipped = ModelRendererSetup("acme/new-model", verbose=False)
    with pytest.raises(HarnessRenderNotRunError):
        setup_skipped.run(defer_coverage=True)
    assert removed == ["acme/new-model"]
    assert not any(path.name.startswith("admin-") for path in runs.iterdir())
    assert (historical / "keep.json").is_file()


def test_failed_setup_does_not_write_the_registry(monkeypatch):
    saved: list[dict] = []
    monkeypatch.setattr(
        "app.routers.admin.models_management.save_registry",
        lambda data: saved.append(data),
    )
    monkeypatch.setattr("app.routers.admin.models_management.reload_registry", lambda: None)
    with pytest.raises(HTTPException) as caught:
        persist_added_registry({"models_by_provider": {}}, setup_returncode=1)
    assert caught.value.status_code == 500
    assert saved == []


def test_successful_setup_writes_the_registry(monkeypatch):
    saved: list[dict] = []
    monkeypatch.setattr(
        "app.routers.admin.models_management.save_registry",
        lambda data: saved.append(data),
    )
    monkeypatch.setattr("app.routers.admin.models_management.reload_registry", lambda: None)
    payload = {"models_by_provider": {"Acme": [{"id": "acme/new-model"}]}}
    persist_added_registry(payload, setup_returncode=0)
    persist_added_registry(payload, setup_returncode=None)
    assert saved == [payload, payload]
