"""
Sync Help Me Choose recommendations with the models registry.

Validates that all model IDs in helpMeChooseRecommendations.ts exist in the
models registry. Optionally removes stale/deprecated models and optionally
applies model ID aliases for renamed models.

Usage:
    python scripts/sync_help_me_choose_with_registry.py [--fix] [--dry-run]

    Default: Validate only; exit 1 if any models are missing
    --fix     Remove models not in registry; apply alias replacements
    --dry-run With --fix: show changes without writing
"""

import argparse
import json
import sys
from pathlib import Path

# Ensure backend is on path for scripts.* imports
_BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

PROJECT_ROOT = _BACKEND_DIR.parent
RECOMMENDATIONS_PATH = PROJECT_ROOT / "frontend" / "src" / "data" / "helpMeChooseRecommendations.ts"
REGISTRY_PATH = PROJECT_ROOT / "backend" / "data" / "models_registry.json"

# Model ID aliases: old_id -> new_id (for renamed/deprecated models)
# Add entries when providers rename models; sync will replace old IDs with new ones
MODEL_ID_ALIASES: dict[str, str] = {}


def load_registry() -> dict:
    """Load the models registry JSON."""
    with open(REGISTRY_PATH, encoding="utf-8") as f:
        return json.load(f)


def get_all_registry_model_ids(registry: dict) -> set[str]:
    """Extract all model IDs from the registry."""
    ids: set[str] = set()
    for provider_models in registry.get("models_by_provider", {}).values():
        for m in provider_models:
            if mid := m.get("id"):
                ids.add(mid)
    return ids


def resolve_model_id(model_id: str, registry_ids: set[str]) -> str | None:
    """
    Resolve a model ID to a valid registry ID.
    Returns the model_id if it exists, or the alias target if mapped and exists, else None.
    """
    if model_id in registry_ids:
        return model_id
    if model_id in MODEL_ID_ALIASES:
        alias_target = MODEL_ID_ALIASES[model_id]
        if alias_target in registry_ids:
            return alias_target
    return None


def run_sync(check_only: bool = True, fix: bool = False, dry_run: bool = False) -> int:
    """
    Validate and optionally fix Help Me Choose recommendations.

    Returns 0 on success, 1 if validation fails or fix cannot complete.
    """
    from scripts.research_model_benchmarks import (
        parse_recommendations_ts,
        update_recommendations_file,
    )

    if not RECOMMENDATIONS_PATH.exists():
        print(f"Error: Recommendations file not found: {RECOMMENDATIONS_PATH}", file=sys.stderr)
        return 1

    if not REGISTRY_PATH.exists():
        print(f"Error: Registry file not found: {REGISTRY_PATH}", file=sys.stderr)
        return 1

    registry = load_registry()
    registry_ids = get_all_registry_model_ids(registry)

    content = RECOMMENDATIONS_PATH.read_text(encoding="utf-8")
    categories = parse_recommendations_ts(content)

    if not categories:
        print("Error: Could not parse recommendations TS file.", file=sys.stderr)
        return 1

    # Collect issues: (category_id, model_id, resolution)
    # resolution: "missing" | "alias:new_id"
    issues: list[tuple[str, str, str]] = []
    to_replace: list[tuple[str, int, str]] = []  # (category_id, model_index, new_id)

    for cat in categories:
        cat_id = cat["id"]
        for i, m in enumerate(cat["models"]):
            model_id = m["modelId"]
            resolved = resolve_model_id(model_id, registry_ids)
            if resolved is None:
                issues.append((cat_id, model_id, "missing"))
            elif resolved != model_id:
                issues.append((cat_id, model_id, f"alias:{resolved}"))
                to_replace.append((cat_id, i, resolved))

    # Report missing models
    missing = [(c, m) for c, m, r in issues if r == "missing"]
    if missing:
        print("Models in Help Me Choose but not in registry:", file=sys.stderr)
        for cat_id, model_id in missing:
            print(f"  - {model_id} (category: {cat_id})", file=sys.stderr)

    # Report alias replacements
    aliased = [(c, m, r) for c, m, r in issues if r.startswith("alias:")]
    if aliased:
        print("Models with ID aliases (old -> new):", file=sys.stderr)
        for cat_id, model_id, res in aliased:
            new_id = res.split(":", 1)[1]
            print(f"  - {model_id} -> {new_id} (category: {cat_id})", file=sys.stderr)

    if check_only:
        if missing:
            print(
                "\nRun with --fix to remove missing models, or add MODEL_ID_ALIASES for renamed models.",
                file=sys.stderr,
            )
            return 1
        if not issues:
            print("All Help Me Choose model IDs exist in the registry.")
        return 0

    if fix:
        if not missing and not to_replace:
            print("No fixes needed.")
            return 0

        # Apply alias replacements first
        for cat_id, model_index, new_id in to_replace:
            cat = next(c for c in categories if c["id"] == cat_id)
            old_id = cat["models"][model_index]["modelId"]
            cat["models"][model_index]["modelId"] = new_id
            print(f"Replaced {old_id} -> {new_id} in {cat_id}")

        # Remove missing models (iterate in reverse to preserve indices)
        missing_set = set(missing)
        for cat in categories:
            cat_id = cat["id"]
            for i in range(len(cat["models"]) - 1, -1, -1):
                model_id = cat["models"][i]["modelId"]
                if (cat_id, model_id) in missing_set:
                    cat["models"].pop(i)
                    print(f"Removed {model_id} from {cat_id}")

        # Ensure each category still has >= 2 models
        for cat in categories:
            if len(cat["models"]) < 2:
                print(
                    f"Error: Category '{cat['id']}' would have fewer than 2 models after fix.",
                    file=sys.stderr,
                )
                return 1

        if not dry_run:
            update_recommendations_file(categories)
            print(f"Updated {RECOMMENDATIONS_PATH.name}")
        else:
            print("(Dry run - no changes written)")

        return 0

    return 0 if not missing else 1


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Sync Help Me Choose recommendations with models registry."
    )
    parser.add_argument(
        "--fix",
        action="store_true",
        help="Remove models not in registry; apply alias replacements",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="With --fix: show changes without writing",
    )
    args = parser.parse_args()

    check_only = not args.fix
    return run_sync(check_only=check_only, fix=args.fix, dry_run=args.dry_run)


if __name__ == "__main__":
    sys.exit(main())
