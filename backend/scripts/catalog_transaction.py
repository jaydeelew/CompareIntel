"""Validate and commit models_registry.json together with renderer configs.

Validation runs before any catalog file is opened for writing. The commit
writes a temp file next to each destination and renames it into place. When
both files are part of the commit, a failure replacing the second file restores
the first from the bytes captured at the start, so a failed step leaves both
files unchanged.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Any

from scripts.config_helpers import ensure_standard_math_delimiters

if TYPE_CHECKING:
    from collections.abc import Callable

# OpenRouter ids are ``provider-slug/model-name``, with an optional ``:variant``.
MODEL_ID_RE = re.compile(r"^[a-z0-9][a-z0-9._-]*/[A-Za-z0-9][A-Za-z0-9._:-]*$")

REQUIRED_MODEL_FIELDS = ("id", "name", "description", "category", "provider")

# The six prompts a newly added text model must already have saved replies for.
# 07-rare-formats and 08-casual-prose stay optional; the coverage manifest covers those.
STANDARD_PROMPTS = (
    "01-math-basics",
    "02-markdown-formatting",
    "03-code-blocks",
    "04-mixed-markdown-latex",
    "05-complex-scenarios",
    "06-edge-cases-boundaries",
)

ADDING_NEW_MODELS_DOC = "docs/development/ADDING_NEW_MODELS.md"

_SKIP_REPLY_NAMES = {
    "summary.json",
    "manifest.json",
    "catalog.json",
    "prompts.json",
    "coverage.json",
    "unique-coverage.json",
    "next-batch-preflight.json",
    "summary-partial.json",
    "guard-global-state.json",
    "results.json",
}

_TIER_LIST_KEYS = (
    "unregistered_tier_models",
    "free_tier_additional_models",
    "image_unregistered_tier_models",
    "image_free_tier_additional_models",
)


class CatalogValidationError(Exception):
    """Raised before any catalog file is written."""

    def __init__(self, errors: list[str]):
        self.errors = errors
        super().__init__("\n".join(errors))


class CatalogWriteError(Exception):
    """A catalog replace failed. Destinations are restored to their prior bytes."""


@dataclass(frozen=True)
class CatalogPaths:
    registry: Path
    renderer_configs: Path
    defaults: Path
    allowlist: Path
    runs: Path


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def default_paths(root: Path | None = None) -> CatalogPaths:
    base = root or repo_root()
    return CatalogPaths(
        registry=base / "backend" / "data" / "models_registry.json",
        renderer_configs=base / "frontend" / "src" / "config" / "model_renderer_configs.json",
        defaults=base / "frontend" / "src" / "config" / "renderer_defaults.json",
        allowlist=base / "rendering-harness" / "coverage-allowlist.json",
        runs=base / "rendering-harness" / "runs",
    )


def validate_model_id(model_id: object) -> list[str]:
    if not isinstance(model_id, str) or not model_id.strip():
        return ["Model id must be a non-empty string in provider/model-name form"]
    if not MODEL_ID_RE.fullmatch(model_id):
        return [
            f"Model id {model_id!r} must be provider/model-name "
            "(lowercase provider slug, a single slash, then the model name)"
        ]
    return []


def registry_model_ids(registry: dict[str, Any]) -> list[str]:
    ids: list[str] = []
    providers = registry.get("models_by_provider")
    if not isinstance(providers, dict):
        return ids
    for models in providers.values():
        if not isinstance(models, list):
            continue
        for model in models:
            if isinstance(model, dict) and isinstance(model.get("id"), str):
                ids.append(model["id"])
    return ids


def text_model_ids(registry: dict[str, Any]) -> list[str]:
    ids: list[str] = []
    providers = registry.get("models_by_provider")
    if not isinstance(providers, dict):
        return ids
    for models in providers.values():
        if not isinstance(models, list):
            continue
        for model in models:
            if not isinstance(model, dict) or not isinstance(model.get("id"), str):
                continue
            if model.get("category") == "Image":
                continue
            ids.append(model["id"])
    return ids


def validate_registry(registry: dict[str, Any]) -> list[str]:
    """Schema, required fields, unique ids, and provider/model-name format."""
    errors: list[str] = []
    if not isinstance(registry, dict):
        return ["Registry must be a JSON object"]
    providers = registry.get("models_by_provider")
    if not isinstance(providers, dict):
        return ["Registry is missing models_by_provider object"]

    seen: dict[str, str] = {}
    for provider_name, models in providers.items():
        if not isinstance(provider_name, str) or not provider_name.strip():
            errors.append("Registry provider bucket name must be a non-empty string")
            continue
        if not isinstance(models, list):
            errors.append(f"Registry provider {provider_name!r} must be a list of models")
            continue
        for index, model in enumerate(models):
            label = f"{provider_name}[{index}]"
            if not isinstance(model, dict):
                errors.append(f"Registry entry {label} must be an object")
                continue
            model_id = model.get("id")
            label = model_id if isinstance(model_id, str) else label
            errors.extend(f"{label}: {message}" for message in validate_model_id(model_id))
            for field in REQUIRED_MODEL_FIELDS:
                value = model.get(field)
                if not isinstance(value, str) or not value.strip():
                    errors.append(f"{label}: missing required field {field}")
            if isinstance(model_id, str) and model_id in seen:
                errors.append(
                    f"Duplicate model id {model_id} under {provider_name!r} and {seen[model_id]!r}"
                )
            elif isinstance(model_id, str):
                seen[model_id] = provider_name
            provider_field = model.get("provider")
            if isinstance(provider_field, str) and provider_field != provider_name:
                errors.append(
                    f"{label}: provider {provider_field!r} does not match bucket {provider_name!r}"
                )

    known = set(seen)
    for key in _TIER_LIST_KEYS:
        if key not in registry:
            continue
        entries = registry[key]
        if not isinstance(entries, list):
            errors.append(f"Registry {key} must be a list")
            continue
        for item in entries:
            if not isinstance(item, str):
                errors.append(f"Registry {key} contains a non-string id")
                continue
            id_errors = validate_model_id(item)
            errors.extend(f"{key}: {message}" for message in id_errors)
            if not id_errors and item not in known:
                errors.append(f"Registry {key} lists {item}, which is not in models_by_provider")
    return errors


def renderer_config_errors(
    config: dict[str, Any], *, require_provider_id: bool = True
) -> list[str]:
    """Structural renderer-config errors. Empty when the config can be written."""
    errors: list[str] = []
    if not isinstance(config, dict):
        return ["Renderer config must be an object"]

    model_id = config.get("modelId")
    if not isinstance(model_id, str) or not model_id.strip():
        errors.append("Missing modelId")
    elif require_provider_id:
        errors.extend(validate_model_id(model_id))

    for field in ("displayMathDelimiters", "inlineMathDelimiters"):
        patterns = config.get(field)
        if not isinstance(patterns, list) or len(patterns) == 0:
            errors.append(f"Missing or invalid {field}")
            continue
        for pattern in patterns:
            if not isinstance(pattern, dict):
                errors.append(f"Missing pattern in {field}")
                continue
            if not pattern.get("pattern") or not isinstance(pattern.get("pattern"), str):
                errors.append(f"Missing pattern in {field}")
            else:
                regex_error = _regex_error(pattern["pattern"])
                if regex_error:
                    errors.append(f"Invalid regex in {field} for {model_id}: {regex_error}")
            if not pattern.get("name") or not isinstance(pattern.get("name"), str):
                errors.append(f"Missing name in {field}")

    preservation = config.get("codeBlockPreservation")
    if not isinstance(preservation, dict):
        errors.append("Missing codeBlockPreservation")
    else:
        if not preservation.get("enabled"):
            errors.append("Code block preservation must be enabled")
        if not preservation.get("extractBeforeProcessing"):
            errors.append("Code blocks must be extracted before processing")
        if not preservation.get("restoreAfterProcessing"):
            errors.append("Code blocks must be restored after processing")
    return errors


def validate_renderer_configs(configs: list[dict[str, Any]]) -> list[str]:
    errors: list[str] = []
    if not isinstance(configs, list):
        return ["Renderer configs must be a list"]
    seen: set[str] = set()
    for config in configs:
        model_id = config.get("modelId") if isinstance(config, dict) else None
        if isinstance(model_id, str):
            if model_id in seen:
                errors.append(f"Duplicate renderer config modelId: {model_id}")
            seen.add(model_id)
        errors.extend(renderer_config_errors(config))
    return errors


def _regex_error(pattern_str: str) -> str | None:
    match = re.fullmatch(r"/(.+)/([gimsuvy]*)", pattern_str)
    body = match.group(1) if match else pattern_str
    try:
        re.compile(body)
    except re.error as exc:
        return str(exc)
    return None


def validate_defaults(defaults: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    if not isinstance(defaults, dict):
        return ["renderer_defaults.json must be an object"]
    entries = defaults.get("entries")
    if not isinstance(entries, list):
        return ["renderer_defaults.json is missing an entries array"]
    seen: set[str] = set()
    for index, entry in enumerate(entries):
        if not isinstance(entry, dict):
            errors.append(f"renderer_defaults.json entries[{index}] must be an object")
            continue
        model_id = entry.get("modelId")
        id_errors = validate_model_id(model_id)
        if id_errors:
            errors.append(
                f"renderer_defaults.json entries[{index}] needs a provider/model-name modelId"
            )
        elif isinstance(model_id, str):
            if model_id in seen:
                errors.append(f"Duplicate renderer default for {model_id}")
            seen.add(model_id)
        reason = entry.get("reason")
        if not isinstance(reason, str) or not reason.strip():
            errors.append(
                f"renderer_defaults.json entry for {model_id} needs a non-empty reason "
                f"explaining why the built-in default renderer is enough. See {ADDING_NEW_MODELS_DOC}"
            )
    return errors


def generator_drift(configs: list[dict[str, Any]]) -> list[str]:
    """Configs the generator would still change by adding standard delimiters."""
    errors: list[str] = []
    for config in configs:
        if not isinstance(config, dict):
            continue
        display = config.get("displayMathDelimiters")
        inline = config.get("inlineMathDelimiters")
        if not isinstance(display, list) or not isinstance(inline, list):
            continue
        normalized_display, normalized_inline = ensure_standard_math_delimiters(display, inline)
        if normalized_display != display or normalized_inline != inline:
            model_id = config.get("modelId")
            errors.append(
                f"Renderer config for {model_id} is not what generate_renderer_configs.py "
                "would emit: standard bracket and paren math delimiters are missing. "
                f"Re-run backend/scripts/generate_renderer_configs.py. See {ADDING_NEW_MODELS_DOC}"
            )
    return errors


def consistency_errors(
    registry: dict[str, Any],
    configs: list[dict[str, Any]],
    defaults: dict[str, Any],
) -> list[str]:
    """Text models have a config or an explicit default, and configs are not orphaned."""
    errors = validate_registry(registry)
    errors.extend(validate_renderer_configs(configs))
    errors.extend(validate_defaults(defaults))
    errors.extend(generator_drift(configs))

    text_ids = set(text_model_ids(registry))
    all_ids = set(registry_model_ids(registry))
    config_ids: set[str] = set()
    for config in configs:
        if isinstance(config, dict) and isinstance(config.get("modelId"), str):
            config_ids.add(config["modelId"])
    default_ids: set[str] = set()
    for entry in defaults.get("entries") or []:
        if isinstance(entry, dict) and isinstance(entry.get("modelId"), str):
            default_ids.add(entry["modelId"])

    for model_id in sorted(text_ids - config_ids - default_ids):
        errors.append(
            f"Text model {model_id} has no renderer config and no explicit default in "
            "frontend/src/config/renderer_defaults.json. "
            f"See {ADDING_NEW_MODELS_DOC}"
        )
    for model_id in sorted(config_ids - all_ids):
        errors.append(
            f"Orphan renderer config {model_id} is not in backend/data/models_registry.json. "
            f"See {ADDING_NEW_MODELS_DOC}"
        )
    for model_id in sorted(default_ids - text_ids):
        errors.append(
            f"renderer_defaults.json lists {model_id}, which is not a text model in the registry. "
            f"See {ADDING_NEW_MODELS_DOC}"
        )
    for model_id in sorted(default_ids & config_ids):
        errors.append(
            f"{model_id} has both a renderer config and an explicit default. Keep one. "
            f"See {ADDING_NEW_MODELS_DOC}"
        )
    return errors


def load_json(path: Path) -> Any:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def load_registry_document(path: Path) -> dict[str, Any]:
    data = load_json(path)
    if not isinstance(data, dict):
        raise CatalogValidationError([f"{path} must be a JSON object"])
    return data


def load_renderer_configs(path: Path) -> list[dict[str, Any]]:
    if not path.is_file():
        return []
    data = load_json(path)
    if not isinstance(data, list):
        raise CatalogValidationError([f"{path} must be a JSON list"])
    return data


def load_defaults(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return {"entries": []}
    data = load_json(path)
    if not isinstance(data, dict):
        raise CatalogValidationError([f"{path} must be a JSON object"])
    return data


def load_allowlist(path: Path) -> list[dict[str, str]]:
    if not path.is_file():
        return []
    data = load_json(path)
    entries = data.get("entries") if isinstance(data, dict) else None
    if not isinstance(entries, list):
        raise CatalogValidationError([f"{path} is missing an entries array"])
    loaded: list[dict[str, str]] = []
    for index, entry in enumerate(entries):
        if not isinstance(entry, dict):
            raise CatalogValidationError([f"{path} entries[{index}] must be an object"])
        model_id = entry.get("modelId")
        reason = entry.get("reason")
        if not isinstance(model_id, str) or not model_id.strip():
            raise CatalogValidationError([f"{path} entries[{index}] is missing modelId"])
        if not isinstance(reason, str) or not reason.strip():
            raise CatalogValidationError(
                [
                    f"{path} entry for {model_id} needs a non-empty reason. "
                    f"See {ADDING_NEW_MODELS_DOC}"
                ]
            )
        loaded.append({"modelId": model_id.strip(), "reason": reason.strip()})
    return loaded


def merge_model_entry(registry: dict[str, Any], entry: dict[str, Any]) -> dict[str, Any]:
    """Return a new registry with ``entry`` added. Does not write a file."""
    errors = validate_model_id(entry.get("id") if isinstance(entry, dict) else None)
    if not isinstance(entry, dict):
        raise CatalogValidationError(["--model-json must be an object"])
    provider = entry.get("provider")
    if not isinstance(provider, str) or not provider.strip():
        errors.append("Registry entry is missing provider")
    if errors:
        raise CatalogValidationError(errors)
    updated = json.loads(json.dumps(registry))
    providers = updated.setdefault("models_by_provider", {})
    bucket = providers.setdefault(provider, [])
    model_id = entry["id"]
    for existing_provider, models in providers.items():
        if isinstance(models, list) and any(
            isinstance(model, dict) and model.get("id") == model_id for model in models
        ):
            raise CatalogValidationError(
                [f"Model {model_id} already exists in registry provider {existing_provider}"]
            )
    bucket.append(entry)
    validation = validate_registry(updated)
    if validation:
        raise CatalogValidationError(validation)
    return updated


def canonical_json(data: Any) -> str:
    return json.dumps(data, indent=2, ensure_ascii=False) + "\n"


def _atomic_write_bytes(path: Path, data: bytes) -> None:
    from app.utils.atomic_json import atomic_write_bytes

    atomic_write_bytes(path, data)


def _atomic_write_text(path: Path, text: str) -> None:
    _atomic_write_bytes(path, text.encode("utf-8"))


def commit_catalog_files(
    registry: dict[str, Any],
    configs: list[dict[str, Any]],
    *,
    paths: CatalogPaths | None = None,
    defaults: dict[str, Any] | None = None,
    write_registry: bool = True,
    write_configs: bool = True,
) -> Callable[[], None]:
    """Validate, then replace the requested catalog files.

    Returns a rollback that restores both destinations to the bytes captured
    before the commit. Validation failures raise ``CatalogValidationError``
    and do not create or modify either file.
    """
    catalog_paths = paths or default_paths()
    defaults_doc = defaults if defaults is not None else load_defaults(catalog_paths.defaults)
    errors = consistency_errors(registry, configs, defaults_doc)
    if errors:
        raise CatalogValidationError(errors)
    if not write_registry and not write_configs:
        return lambda: None

    registry_before = _read_bytes(catalog_paths.registry)
    config_before = _read_bytes(catalog_paths.renderer_configs)

    def rollback() -> None:
        _restore(catalog_paths.registry, registry_before)
        _restore(catalog_paths.renderer_configs, config_before)

    if write_registry and write_configs:
        _replace_both(
            catalog_paths.registry,
            canonical_json(registry).encode("utf-8"),
            catalog_paths.renderer_configs,
            canonical_json(configs).encode("utf-8"),
            restore_first=_restore_pair(catalog_paths.registry, registry_before),
        )
    elif write_registry:
        _atomic_write_text(catalog_paths.registry, canonical_json(registry))
    else:
        _atomic_write_text(catalog_paths.renderer_configs, canonical_json(configs))
    return rollback


def _replace_both(
    first: Path,
    first_payload: bytes,
    second: Path,
    second_payload: bytes,
    *,
    restore_first: Callable[[], None],
) -> None:
    first_tmp = _write_temp(first, first_payload)
    try:
        second_tmp = _write_temp(second, second_payload)
    except Exception:
        _unlink(first_tmp)
        raise
    try:
        os.replace(first_tmp, first)
        _fsync_dir(first.parent)
    except Exception as exc:
        _unlink(first_tmp)
        _unlink(second_tmp)
        raise CatalogWriteError(
            f"Failed to replace {first.name}; no catalog file was changed"
        ) from exc
    try:
        os.replace(second_tmp, second)
        _fsync_dir(second.parent)
    except Exception as exc:
        _unlink(second_tmp)
        restore_first()
        raise CatalogWriteError(
            f"Failed to replace {second.name}; {first.name} was restored"
        ) from exc


def _write_temp(path: Path, payload: bytes) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile_mkstemp(path)
    tmp = Path(name)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
    except Exception:
        _unlink(tmp)
        raise
    return tmp


def tempfile_mkstemp(path: Path) -> tuple[int, str]:
    """Indirection so tests can fail a temp write without patching tempfile itself."""
    return tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")


def _fsync_dir(directory: Path) -> None:
    fd = os.open(directory, os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def _read_bytes(path: Path) -> bytes | None:
    if not path.is_file():
        return None
    return path.read_bytes()


def _restore(path: Path, raw: bytes | None) -> None:
    if raw is None:
        if path.exists():
            path.unlink()
        return
    _atomic_write_bytes(path, raw)


def _restore_pair(path: Path, raw: bytes | None) -> Callable[[], None]:
    def restore() -> None:
        _restore(path, raw)

    return restore


def _unlink(path: Path) -> None:
    if path.exists():
        path.unlink()


def saved_standard_prompts(model_id: str, runs_root: Path) -> set[str]:
    """Prompt names that have a non-empty saved harness reply for ``model_id``."""
    found: set[str] = set()
    if not runs_root.is_dir():
        return found
    for batch in runs_root.iterdir():
        if not batch.is_dir():
            continue
        directories = [batch]
        reruns = batch / "reruns"
        if reruns.is_dir():
            directories.append(reruns)
        for directory in directories:
            for path in directory.glob("*.json"):
                if path.name in _SKIP_REPLY_NAMES or path.name.startswith("unique-"):
                    continue
                try:
                    data = json.loads(path.read_text(encoding="utf-8"))
                except (OSError, json.JSONDecodeError):
                    continue
                if not isinstance(data, dict) or data.get("modelId") != model_id:
                    continue
                prompt_name = data.get("promptName")
                response = data.get("response")
                if (
                    isinstance(prompt_name, str)
                    and prompt_name in STANDARD_PROMPTS
                    and isinstance(response, str)
                    and response.strip()
                ):
                    found.add(prompt_name)
    return found


def new_text_model_ids(base_registry: dict[str, Any], head_registry: dict[str, Any]) -> list[str]:
    base_ids = set(text_model_ids(base_registry))
    return sorted(
        model_id for model_id in text_model_ids(head_registry) if model_id not in base_ids
    )


def new_model_gate_errors(
    base_registry: dict[str, Any],
    head_registry: dict[str, Any],
    *,
    runs_root: Path,
    allowlist: list[dict[str, str]],
) -> list[str]:
    """Saved standard-prompt replies, or an allowlist reason, for text models new vs base.

    This check only reads files. It does not call a model API.
    """
    allowed = {entry["modelId"] for entry in allowlist}
    errors: list[str] = []
    for model_id in new_text_model_ids(base_registry, head_registry):
        if model_id in allowed:
            continue
        found = saved_standard_prompts(model_id, runs_root)
        missing = [name for name in STANDARD_PROMPTS if name not in found]
        if not missing:
            continue
        joined = ", ".join(missing)
        errors.append(
            f"Text model {model_id} was added to the registry without saved "
            f"rendering-harness replies for the standard prompts: {joined}. "
            "Run the rendering harness, commit the saved reply JSON, and attach the "
            f"screenshots to the PR. Or add an explicit reason to "
            f"rendering-harness/coverage-allowlist.json. See {ADDING_NEW_MODELS_DOC}"
        )
    return errors


def registry_at_git_ref(root: Path, ref: str) -> dict[str, Any]:
    git = shutil.which("git")
    if git is None:
        raise RuntimeError("git is required to read the base registry")
    proc = subprocess.run(
        [git, "show", f"{ref}:backend/data/models_registry.json"],
        cwd=root,
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        detail = (proc.stderr or proc.stdout or f"git show {ref} failed").strip()
        raise RuntimeError(detail)
    data = json.loads(proc.stdout)
    if not isinstance(data, dict):
        raise RuntimeError(f"{ref}:backend/data/models_registry.json is not an object")
    return data


def check_live_catalog(
    root: Path | None = None,
    *,
    base_ref: str | None = None,
    require_base: bool = False,
) -> list[str]:
    """Consistency of the files on disk, plus the new-model gate when ``base_ref`` is set."""
    base = root or repo_root()
    paths = default_paths(base)
    registry = load_registry_document(paths.registry)
    configs = load_renderer_configs(paths.renderer_configs)
    defaults = load_defaults(paths.defaults)
    errors = consistency_errors(registry, configs, defaults)
    if base_ref is None:
        return errors
    try:
        base_registry = registry_at_git_ref(base, base_ref)
    except RuntimeError as exc:
        message = (
            f"New-model rendering gate could not read the base registry at {base_ref}: {exc}. "
            f"See {ADDING_NEW_MODELS_DOC}"
        )
        if require_base:
            errors.append(message)
        else:
            print(
                f"New-model rendering gate skipped ({base_ref} unavailable). "
                f"See {ADDING_NEW_MODELS_DOC}",
                file=sys.stderr,
            )
        return errors
    allowlist = load_allowlist(paths.allowlist)
    errors.extend(
        new_model_gate_errors(
            base_registry,
            registry,
            runs_root=paths.runs,
            allowlist=allowlist,
        )
    )
    return errors
