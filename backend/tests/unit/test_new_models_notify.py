"""Unit tests for new-model deploy notifications."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from string import Template

import pytest

pytestmark = pytest.mark.unit

from app.services.new_models_notify import (
    REGISTRY_GIT_PATH,
    _cli,
    _git_executable,
    build_new_models_list_html,
    diff_registries_for_deploy,
    find_added_models,
    get_new_model_notification_recipients,
    load_registry_from_git,
    models_by_id,
    new_models_email_copy,
    summarize_model,
)
from tests.factories import (
    create_free_user,
    create_inactive_user,
    create_unverified_user,
    create_user_preference,
)

TEMPLATE_PATH = (
    Path(__file__).resolve().parent.parent.parent / "app" / "templates" / "new_models_added.html"
)


def _registry(*models: dict) -> dict:
    by_provider: dict[str, list[dict]] = {}
    for model in models:
        provider = model.get("provider") or "Other"
        by_provider.setdefault(provider, []).append(model)
    return {"models_by_provider": by_provider}


class TestFindAddedModels:
    def test_returns_models_only_in_new_registry(self):
        old = _registry({"id": "a/one", "name": "One", "provider": "A"})
        new = _registry(
            {"id": "a/one", "name": "One", "provider": "A"},
            {
                "id": "b/two",
                "name": "Two",
                "provider": "B",
                "description": "Brand new",
                "category": "Language",
            },
        )
        added = find_added_models(old, new)
        assert [m["id"] for m in added] == ["b/two"]
        assert added[0]["name"] == "Two"
        assert added[0]["description"] == "Brand new"
        assert added[0]["category"] == "Language"

    def test_ignores_removed_and_metadata_only_changes(self):
        old = _registry(
            {"id": "a/one", "name": "One", "provider": "A", "description": "old"},
            {"id": "a/gone", "name": "Gone", "provider": "A"},
        )
        new = _registry({"id": "a/one", "name": "One v2", "provider": "A", "description": "new"})
        assert find_added_models(old, new) == []

    def test_empty_old_registry_treats_all_as_added(self):
        new = _registry({"id": "a/one", "name": "One", "provider": "A"})
        added = find_added_models({"models_by_provider": {}}, new)
        assert [m["id"] for m in added] == ["a/one"]

    def test_sorts_by_provider_then_name(self):
        old = _registry()
        new = _registry(
            {"id": "z/last", "name": "Zed", "provider": "Zeta"},
            {"id": "a/beta", "name": "Beta", "provider": "Alpha"},
            {"id": "a/alpha", "name": "Alpha", "provider": "Alpha"},
        )
        assert [m["id"] for m in find_added_models(old, new)] == ["a/alpha", "a/beta", "z/last"]

    def test_skips_invalid_entries(self):
        old = {"models_by_provider": {"A": "not-a-list"}}
        new = {
            "models_by_provider": {
                "A": [
                    "skip-me",
                    {"name": "no id"},
                    {"id": "a/ok", "name": "Ok", "provider": "A"},
                ]
            }
        }
        assert [m["id"] for m in find_added_models(old, new)] == ["a/ok"]

    def test_none_registries(self):
        assert find_added_models(None, None) == []


class TestSummarizeAndCopy:
    def test_summarize_falls_back_to_id_and_unknown_provider(self):
        summary = summarize_model({"id": "x/y"})
        assert summary["id"] == "x/y"
        assert summary["name"] == "x/y"
        assert summary["provider"] == "Unknown"
        assert summary["description"] == ""
        assert summary["category"] == ""

    def test_models_by_id_indexes_nested_providers(self):
        indexed = models_by_id(
            _registry({"id": "a/one", "name": "One", "provider": "A"}, {"id": "b/two"})
        )
        assert set(indexed) == {"a/one", "b/two"}

    def test_singular_and_plural_email_copy(self):
        one = [
            {"id": "a/one", "name": "Alpha One", "provider": "A", "description": "", "category": ""}
        ]
        many = one + [
            {"id": "b/two", "name": "Beta Two", "provider": "B", "description": "", "category": ""}
        ]
        singular = new_models_email_copy(one)
        assert singular["subject"] == "New on CompareIntel: Alpha One"
        assert "1 new model" == singular["count_label"]
        assert "Alpha One" in singular["intro_text"]

        plural = new_models_email_copy(many)
        assert plural["subject"] == "2 new models are available on CompareIntel"
        assert plural["count_label"] == "2 new models"


class TestEmailHtml:
    def test_list_html_escapes_and_includes_each_model(self):
        html = build_new_models_list_html(
            [
                {
                    "id": "a/<script>",
                    "name": "Alpha <b>One</b>",
                    "provider": "A&B",
                    "description": "Uses $0.02 / 1K",
                    "category": "Language",
                }
            ]
        )
        assert "Alpha <b>One</b>" not in html
        assert "Alpha &lt;b&gt;One&lt;/b&gt;" in html
        assert "a/&lt;script&gt;" in html
        assert "A&amp;B" in html
        assert "Uses $0.02 / 1K" in html
        assert "Language" in html

    def test_user_template_matches_existing_theme_and_lists_models(self):
        models = [
            {
                "id": "openai/gpt-test",
                "name": "GPT Test $5",
                "provider": "OpenAI",
                "description": "A test model costing $5",
                "category": "Language",
            },
            {
                "id": "anthropic/claude-test",
                "name": "Claude Test",
                "provider": "Anthropic",
                "description": "",
                "category": "Language",
            },
        ]
        copy = new_models_email_copy(models)
        rendered = Template(TEMPLATE_PATH.read_text()).substitute(
            header_title=copy["header_title"],
            intro_text=copy["intro_text"],
            count_label=copy["count_label"],
            models_html=build_new_models_list_html(models),
            compare_url="https://compareintel.com",
        )
        assert "linear-gradient(135deg, #1e40af 0%, #0ea5e9 100%)" in rendered
        assert "2 new models" in rendered
        assert "GPT Test $5" in rendered
        assert "Claude Test" in rendered
        assert "openai/gpt-test" in rendered
        assert "https://compareintel.com" in rendered
        assert "support@compareintel.com" in rendered


class TestRecipients:
    def test_includes_verified_active_users_with_default_or_enabled_prefs(self, db_session):
        included = create_free_user(db_session, email="in@example.com")
        with_prefs = create_free_user(db_session, email="prefs@example.com")
        create_user_preference(db_session, with_prefs, email_notifications=True)
        opted_out = create_free_user(db_session, email="out@example.com")
        create_user_preference(db_session, opted_out, email_notifications=False)
        create_unverified_user(db_session, email="unverified@example.com")
        create_inactive_user(db_session, email="inactive@example.com")

        emails = {u.email for u in get_new_model_notification_recipients(db_session)}
        assert included.email in emails
        assert with_prefs.email in emails
        assert opted_out.email not in emails
        assert "unverified@example.com" not in emails
        assert "inactive@example.com" not in emails


def _git(repo: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [_git_executable(), "-C", str(repo), *args],
        check=True,
        capture_output=True,
        text=True,
    )


def _init_registry_repo(tmp_path: Path) -> Path:
    repo = tmp_path / "repo"
    registry_dir = repo / "backend" / "data"
    registry_dir.mkdir(parents=True)
    _git(repo, "init")
    _git(repo, "config", "user.email", "test@example.com")
    _git(repo, "config", "user.name", "Test")
    _git(repo, "config", "commit.gpgsign", "false")
    (registry_dir / "models_registry.json").write_text(
        json.dumps(
            _registry({"id": "a/one", "name": "One", "provider": "A", "description": "first"})
        )
        + "\n",
        encoding="utf-8",
    )
    _git(repo, "add", REGISTRY_GIT_PATH)
    _git(repo, "commit", "-m", "initial registry")
    return repo


class TestGitDiff:
    def test_diff_registries_for_deploy_finds_added_model(self, tmp_path):
        repo = _init_registry_repo(tmp_path)
        old_commit = _git(repo, "rev-parse", "HEAD").stdout.strip()
        registry_path = repo / REGISTRY_GIT_PATH
        current = json.loads(registry_path.read_text())
        current["models_by_provider"]["B"] = [
            {
                "id": "b/two",
                "name": "Two",
                "provider": "B",
                "description": "second",
                "category": "Language",
            }
        ]
        registry_path.write_text(json.dumps(current) + "\n", encoding="utf-8")

        added = diff_registries_for_deploy(repo, old_commit, registry_path)
        assert [m["id"] for m in added] == ["b/two"]
        assert added[0]["name"] == "Two"

        loaded_old = load_registry_from_git(repo, old_commit)
        assert "b/two" not in models_by_id(loaded_old)

    def test_cli_prints_json_of_added_models(self, tmp_path, capsys):
        repo = _init_registry_repo(tmp_path)
        old_commit = _git(repo, "rev-parse", "HEAD").stdout.strip()
        registry_path = repo / REGISTRY_GIT_PATH
        current = json.loads(registry_path.read_text())
        current["models_by_provider"]["B"] = [{"id": "b/two", "name": "Two", "provider": "B"}]
        registry_path.write_text(json.dumps(current) + "\n", encoding="utf-8")

        assert _cli(["--from-commit", old_commit, "--repo", str(repo)]) == 0
        payload = json.loads(capsys.readouterr().out)
        assert payload[0]["id"] == "b/two"

    def test_cli_prints_empty_list_when_commit_missing_registry(self, tmp_path, capsys):
        repo = tmp_path / "empty"
        repo.mkdir()
        _git(repo, "init")
        _git(repo, "config", "user.email", "test@example.com")
        _git(repo, "config", "user.name", "Test")
        _git(repo, "config", "commit.gpgsign", "false")
        (repo / "README").write_text("x\n", encoding="utf-8")
        _git(repo, "add", "README")
        _git(repo, "commit", "-m", "no registry")
        commit = _git(repo, "rev-parse", "HEAD").stdout.strip()
        (repo / "backend" / "data").mkdir(parents=True)
        (repo / REGISTRY_GIT_PATH).write_text(json.dumps(_registry()) + "\n", encoding="utf-8")

        assert _cli(["--from-commit", commit, "--repo", str(repo)]) == 0
        assert json.loads(capsys.readouterr().out) == []
