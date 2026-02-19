#!/usr/bin/env python3
"""
Re-sort all models in the registry by tier (Unregistered, Free, Premium) then by version.

Run from the backend directory:
    python scripts/sort_registry_models.py

This updates models_registry.json in place. Models are sorted:
1. By tier: Unregistered (0) → Free (1) → Premium (2)
2. Within tier: by model version ascending (e.g., Glm 4.7 before Glm 5)
"""

import sys
from pathlib import Path

# Add parent directory to path to import app modules
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.llm.registry import (
    get_registry_path,
    load_registry,
    save_registry,
    sort_models_by_tier_and_version,
)


def main() -> int:
    registry_path = get_registry_path()
    print(f"Loading registry from {registry_path}")

    registry = load_registry()
    mbp = registry.get("models_by_provider", {})

    changes = 0
    for provider, models in mbp.items():
        if not models:
            continue
        sorted_models = sort_models_by_tier_and_version(models)
        if sorted_models != models:
            mbp[provider] = sorted_models
            changes += 1
            print(f"  Re-sorted {provider} ({len(models)} models)")

    if changes == 0:
        print("Registry already sorted. No changes made.")
        return 0

    save_registry(registry)
    print(f"Saved registry. Re-sorted {changes} provider(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
