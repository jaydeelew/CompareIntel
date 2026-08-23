"""Detect newly added CompareIntel models and prepare user notifications.

This module is stdlib-only at import time so production deploy can run
``python3 -m app.services.new_models_notify`` on the host (no FastAPI/DB)
to diff ``models_registry.json`` between the previous deploy and HEAD.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

REGISTRY_GIT_PATH = "backend/data/models_registry.json"


def models_by_id(registry: dict[str, Any] | None) -> dict[str, dict[str, Any]]:
    """Index registry models by id. Invalid entries are skipped."""
    indexed: dict[str, dict[str, Any]] = {}
    if not isinstance(registry, dict):
        return indexed
    providers = registry.get("models_by_provider", {})
    if not isinstance(providers, dict):
        return indexed
    for models in providers.values():
        if not isinstance(models, list):
            continue
        for model in models:
            if not isinstance(model, dict):
                continue
            model_id = model.get("id")
            if not model_id:
                continue
            indexed[str(model_id)] = model
    return indexed


def summarize_model(model: dict[str, Any], model_id: str | None = None) -> dict[str, str]:
    """Return the fields shown in the new-models user email."""
    resolved_id = str(model_id or model.get("id") or "unknown")
    name = str(model.get("name") or resolved_id)
    provider = str(model.get("provider") or "Unknown")
    description = str(model.get("description") or "").strip()
    category = str(model.get("category") or "").strip()
    return {
        "id": resolved_id,
        "name": name,
        "provider": provider,
        "description": description,
        "category": category,
    }


def find_added_models(
    old_registry: dict[str, Any] | None,
    new_registry: dict[str, Any] | None,
) -> list[dict[str, str]]:
    """Return models present in ``new_registry`` whose ids are absent from ``old_registry``."""
    old_ids = models_by_id(old_registry)
    new_ids = models_by_id(new_registry)
    added: list[dict[str, str]] = []
    for model_id, model in new_ids.items():
        if model_id not in old_ids:
            added.append(summarize_model(model, model_id))
    added.sort(key=lambda m: (m["provider"].lower(), m["name"].lower(), m["id"]))
    return added


def load_registry_from_path(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise ValueError(f"Registry at {path} is not a JSON object")
    return data


def _git_executable() -> str:
    git_bin = shutil.which("git")
    if not git_bin:
        raise FileNotFoundError("git executable not found on PATH")
    return git_bin


def load_registry_from_git(
    repo: Path, commit: str, relpath: str = REGISTRY_GIT_PATH
) -> dict[str, Any]:
    """Load a registry JSON blob from a git commit. Raises FileNotFoundError if missing."""
    result = subprocess.run(
        [_git_executable(), "-C", str(repo), "show", f"{commit}:{relpath}"],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        stderr = (result.stderr or "").strip() or "git show failed"
        raise FileNotFoundError(f"Could not read {relpath} at {commit}: {stderr}")
    data = json.loads(result.stdout)
    if not isinstance(data, dict):
        raise ValueError(f"Registry at {commit}:{relpath} is not a JSON object")
    return data


def build_new_models_list_html(models: list[dict[str, str]]) -> str:
    """Build inline-styled HTML cards listing each new model (email-safe)."""
    import html as html_lib

    cards: list[str] = []
    for model in models:
        name = html_lib.escape(model.get("name") or model.get("id") or "Unknown")
        model_id = html_lib.escape(model.get("id") or "")
        provider = html_lib.escape(model.get("provider") or "Unknown")
        category = html_lib.escape((model.get("category") or "").strip())
        description = html_lib.escape((model.get("description") or "").strip())

        meta_parts = [f"Provider: {provider}"]
        if category:
            meta_parts.append(category)
        meta = " &middot; ".join(meta_parts)

        description_html = ""
        if description:
            description_html = (
                f"<p style='margin: 8px 0 0 0; font-size: 14px; color: #444;'>{description}</p>"
            )

        cards.append(
            f"""
            <div style="background-color: white !important; background: white !important; border-left: 4px solid #0ea5e9; padding: 16px; margin: 12px 0; border-radius: 4px;">
                <strong style="font-size: 16px; color: #1e40af;">{name}</strong><br>
                <code style="background: #e0e7ff; padding: 2px 6px; border-radius: 3px; font-size: 13px;">{model_id}</code><br>
                <span style="color: #666; font-size: 14px;">{meta}</span>
                {description_html}
            </div>
            """
        )
    return "".join(cards)


def new_models_email_copy(models: list[dict[str, str]]) -> dict[str, str]:
    """Subject, header, and intro copy for one or more newly added models."""
    count = len(models)
    if count == 1:
        name = models[0].get("name") or models[0].get("id") or "a new model"
        return {
            "subject": f"New on CompareIntel: {name}",
            "header_title": "A New Model Is Available",
            "intro_text": (
                f"{name} has been added to CompareIntel. "
                "You can compare it with other models on the site now."
            ),
            "count_label": "1 new model",
        }
    return {
        "subject": f"{count} new models are available on CompareIntel",
        "header_title": "New Models Are Available",
        "intro_text": (
            f"We've added {count} new models to CompareIntel. "
            "Each one is listed below — compare them on the site whenever you're ready."
        ),
        "count_label": f"{count} new models",
    }


def get_new_model_notification_recipients(db: Any) -> list[Any]:
    """Verified, active users who have not opted out of email notifications."""
    from sqlalchemy import or_

    from app.models import User, UserPreference

    return (
        db.query(User)
        .outerjoin(UserPreference, User.id == UserPreference.user_id)
        .filter(
            User.is_verified == True,
            User.is_active == True,
            or_(
                UserPreference.email_notifications == True,
                UserPreference.email_notifications.is_(None),
            ),
        )
        .order_by(User.id.asc())
        .all()
    )


def diff_registries_for_deploy(
    repo: Path,
    from_commit: str,
    new_registry_path: Path | None = None,
) -> list[dict[str, str]]:
    """Compare the registry at ``from_commit`` with the working-tree (deployed) file."""
    old_registry = load_registry_from_git(repo, from_commit)
    current_path = new_registry_path or (repo / REGISTRY_GIT_PATH)
    new_registry = load_registry_from_path(current_path)
    return find_added_models(old_registry, new_registry)


def _cli(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Print JSON of models added since a previous git commit."
    )
    parser.add_argument("--from-commit", required=True, help="Git commit of the previous deploy")
    parser.add_argument(
        "--repo",
        default=".",
        help="Path to the CompareIntel git repository (default: current directory)",
    )
    parser.add_argument(
        "--new-registry",
        default=None,
        help="Path to the current models_registry.json (default: <repo>/backend/data/models_registry.json)",
    )
    args = parser.parse_args(argv)

    repo = Path(args.repo).resolve()
    new_registry_path = Path(args.new_registry).resolve() if args.new_registry else None
    try:
        added = diff_registries_for_deploy(repo, args.from_commit, new_registry_path)
    except FileNotFoundError as exc:
        print(f"WARN: {exc}", file=sys.stderr)
        print("[]")
        return 0
    except (json.JSONDecodeError, ValueError, OSError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        print("[]")
        return 1

    json.dump(added, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(_cli())
