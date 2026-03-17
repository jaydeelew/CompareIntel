#!/usr/bin/env python3
"""
One-time script: Update models_registry.json with image_aspect_ratios and image_sizes
from image_config_test_results.json. Run from backend/: python scripts/update_registry_image_capabilities.py
"""

import json
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "data"
RESULTS_PATH = DATA_DIR / "image_config_test_results.json"
REGISTRY_PATH = DATA_DIR / "models_registry.json"

ASPECT_RATIOS = ["9:16", "2:3", "3:4", "4:5", "1:1", "5:4", "4:3", "3:2", "16:9", "21:9"]
IMAGE_SIZES = ["1K", "2K", "4K"]


def main():
    with RESULTS_PATH.open() as f:
        results = json.load(f)

    # Derive capabilities per model from results
    # success at 1K for each ratio -> aspect_ratios; success at 1:1 for each size -> image_sizes
    model_ratios: dict[str, set[str]] = {}
    model_sizes: dict[str, set[str]] = {}

    for r in results.get("results", []):
        mid = r.get("model_id")
        if not mid:
            continue
        if mid not in model_ratios:
            model_ratios[mid] = set()
            model_sizes[mid] = set()
        ar = r.get("aspect_ratio")
        sz = r.get("image_size")
        status = r.get("status") == "success"
        if status and ar:
            model_ratios[mid].add(ar)
        if status and sz:
            model_sizes[mid].add(sz)

    # Models not in test: use conservative defaults (all ratios, 1K+2K only)
    with REGISTRY_PATH.open() as f:
        registry = json.load(f)

    updated = 0
    for provider, models in registry.get("models_by_provider", {}).items():
        for m in models:
            if not m.get("supports_image_generation"):
                continue
            mid = m.get("id")
            if not mid:
                continue
            ratios = sorted(model_ratios.get(mid, set())) or ASPECT_RATIOS
            sizes = sorted(
                model_sizes.get(mid), key=lambda s: (0 if s == "1K" else 1 if s == "2K" else 2)
            )
            if not sizes:
                sizes = ["1K", "2K"]  # conservative default
            m["image_aspect_ratios"] = ratios if ratios else ASPECT_RATIOS
            m["image_sizes"] = sizes
            updated += 1

    with REGISTRY_PATH.open("w", encoding="utf-8") as f:
        json.dump(registry, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print(f"Updated {updated} image models with image_aspect_ratios and image_sizes.")


if __name__ == "__main__":
    main()
