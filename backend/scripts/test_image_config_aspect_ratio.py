#!/usr/bin/env python3
"""
Test whether image generation models accept image_config.aspect_ratio and
image_config.image_size via OpenRouter across standard values.

Standard aspect ratios (OpenRouter): 1:1, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3, 21:9, 5:4, 4:5
Standard image sizes: 1K, 2K, 4K

Cost-minimization: Uses 1K when testing aspect ratios; uses 1:1 when testing sizes.
Default --all tests one model to validate params; use --all-models to test all.

Usage:
    cd backend && python scripts/test_image_config_aspect_ratio.py [OPTIONS]

Options:
    --models: Comma-separated model IDs (default: all image models, or one when --all)
    --aspect-ratio: Single ratio to test (default: 1:1)
    --image-size: Single size to test (default: 1K)
    --all-aspect-ratios: Test all 10 ratios at 1K
    --all-image-sizes: Test all 3 sizes (1K, 2K, 4K) at 1:1
    --all: Test all ratios at 1K + all sizes at 1:1 (12 combos)
    --all-models: With --all, test every model (otherwise one model for cost)
    --dry-run: Print what would be tested, no API calls
    --delay: Seconds between requests (default: 2.0)
"""

import argparse
import json
import sys
import time
from pathlib import Path

# Add parent directory to path to import app modules
sys.path.insert(0, str(Path(__file__).parent.parent))

from openai import OpenAI

from app.config.settings import settings
from app.llm.registry import MODELS_BY_PROVIDER

# Standard aspect ratios (excludes extended 8:1, 1:8, 4:1, 1:4)
ASPECT_RATIOS = ["9:16", "2:3", "3:4", "4:5", "1:1", "5:4", "4:3", "3:2", "16:9", "21:9"]
# Standard image sizes (excludes 0.5K)
IMAGE_SIZES = ["1K", "2K", "4K"]

TEST_PROMPT = "A simple red circle on white background."


def get_image_models() -> list[dict]:
    """Collect all image generation model IDs from the app registry."""
    models = []
    for provider, provider_models in MODELS_BY_PROVIDER.items():
        for m in provider_models:
            if m.get("supports_image_generation"):
                models.append(m)
    return models


def get_modalities(model_id: str) -> list[str]:
    """Return modalities for the model: image-only vs image+text."""
    if (
        model_id.startswith("black-forest-labs/")
        or model_id.startswith("sourceful/")
        or model_id.startswith("bytedance-seed/")
    ):
        return ["image"]
    return ["image", "text"]


def test_model(
    client: OpenAI,
    model_id: str,
    image_config: dict,
    delay: float,
    dry_run: bool = False,
) -> dict:
    """Test one model with given image_config. Returns result dict."""
    modalities = get_modalities(model_id)

    if dry_run:
        return {
            "model_id": model_id,
            "aspect_ratio": image_config.get("aspect_ratio"),
            "image_size": image_config.get("image_size"),
            "status": "dry_run",
        }

    # Gemini 3 Pro Image: limit to 1 image
    extra_body = {
        "modalities": modalities,
        "image_config": dict(image_config),
    }
    if model_id == "google/gemini-3-pro-image-preview":
        extra_body["image_config"]["number_of_images"] = 1

    try:
        response = client.chat.completions.create(
            model=model_id,
            messages=[{"role": "user", "content": TEST_PROMPT}],
            stream=False,
            extra_body=extra_body,
        )
        message = response.choices[0].message if response.choices else None
        has_images = bool(message and hasattr(message, "images") and message.images)
        return {
            "model_id": model_id,
            "aspect_ratio": image_config.get("aspect_ratio"),
            "image_size": image_config.get("image_size"),
            "status": "success",
            "has_images": has_images,
            "image_count": len(message.images) if has_images and message.images else 0,
            "error": None,
        }
    except Exception as e:
        return {
            "model_id": model_id,
            "aspect_ratio": image_config.get("aspect_ratio"),
            "image_size": image_config.get("image_size"),
            "status": "error",
            "error": str(e),
        }
    finally:
        if not dry_run and delay > 0:
            time.sleep(delay)


def build_test_configs(
    all_aspect_ratios: bool,
    all_image_sizes: bool,
    aspect_ratio: str,
    image_size: str,
) -> list[tuple[str, str]]:
    """
    Build (aspect_ratio, image_size) pairs to test.
    Cost-minimization: aspect ratios tested at 1K; sizes tested at 1:1.
    """
    if all_aspect_ratios and all_image_sizes:
        # All ratios at 1K + all sizes at 1:1 (dedupe 1:1+1K)
        configs = [(r, "1K") for r in ASPECT_RATIOS]
        configs += [("1:1", s) for s in IMAGE_SIZES if s != "1K"]
        return configs
    if all_aspect_ratios:
        return [(r, "1K") for r in ASPECT_RATIOS]
    if all_image_sizes:
        return [("1:1", s) for s in IMAGE_SIZES]
    return [(aspect_ratio, image_size)]


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Test image_config aspect_ratio and image_size across image models"
    )
    parser.add_argument(
        "--models",
        type=str,
        default=None,
        help="Comma-separated model IDs (default: all, or one when --all)",
    )
    parser.add_argument(
        "--aspect-ratio",
        type=str,
        default="1:1",
        choices=ASPECT_RATIOS,
        help="Single aspect ratio (default: 1:1)",
    )
    parser.add_argument(
        "--image-size",
        type=str,
        default="1K",
        choices=IMAGE_SIZES,
        help="Single image size (default: 1K)",
    )
    parser.add_argument(
        "--all-aspect-ratios",
        action="store_true",
        help="Test all 10 ratios at 1K",
    )
    parser.add_argument(
        "--all-image-sizes",
        action="store_true",
        help="Test all 3 sizes (1K, 2K, 4K) at 1:1",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Test all ratios at 1K + all sizes at 1:1",
    )
    parser.add_argument(
        "--all-models",
        action="store_true",
        help="With --all, test every model (default: one model for cost)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would be tested, no API calls",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=2.0,
        help="Seconds between requests (default: 2.0)",
    )
    parser.add_argument(
        "--output-capabilities",
        action="store_true",
        help="Output JSON capabilities per model to stdout (for add-model flow)",
    )
    args = parser.parse_args()

    if args.all:
        args.all_aspect_ratios = True
        args.all_image_sizes = True

    if not settings.openrouter_api_key:
        print("Error: OPENROUTER_API_KEY environment variable is not set.", file=sys.stderr)
        return 1

    all_image_models = get_image_models()
    if not all_image_models:
        print("No image generation models found in registry.", file=sys.stderr)
        return 1

    if args.models:
        requested = {m.strip() for m in args.models.split(",") if m.strip()}
        models_to_test = [m for m in all_image_models if m["id"] in requested]
        missing = requested - {m["id"] for m in models_to_test}
        if missing:
            print(f"Warning: Models not found or not image models: {missing}", file=sys.stderr)
    elif (args.all_aspect_ratios or args.all_image_sizes) and not args.all_models:
        # Cost minimization: test one model when running --all
        models_to_test = [all_image_models[0]]
        print(
            f"Testing 1 model (use --all-models for all {len(all_image_models)}): {models_to_test[0]['id']}"
        )
    else:
        models_to_test = all_image_models

    configs = build_test_configs(
        args.all_aspect_ratios,
        args.all_image_sizes,
        args.aspect_ratio,
        args.image_size,
    )

    total_tests = len(models_to_test) * len(configs)
    quiet = getattr(args, "output_capabilities", False)
    if not quiet:
        print(
            f"Testing {len(models_to_test)} model(s) × {len(configs)} config(s) = {total_tests} request(s)"
        )
        print(f"  Configs: {configs}")
        print(f'  prompt: "{TEST_PROMPT}"')
        if args.dry_run:
            print("\n[DRY RUN - no API calls]\n")
        else:
            print()

    client = OpenAI(
        api_key=settings.openrouter_api_key,
        base_url="https://openrouter.ai/api/v1",
    )

    results = []
    for m in models_to_test:
        model_id = m["id"]
        for ar, sz in configs:
            img_config = {"aspect_ratio": ar, "image_size": sz}
            label = f"{ar} @ {sz}"
            print(f"  {model_id} {label} ... ", end="", flush=True)
            r = test_model(client, model_id, img_config, args.delay, args.dry_run)
            results.append(r)
            if args.dry_run:
                print("(dry run)")
            elif r["status"] == "success":
                img_info = f", {r.get('image_count', 0)} image(s)" if r.get("has_images") else ""
                print(f"OK{img_info}")
            else:
                print(f"FAIL: {r.get('error', 'unknown')[:60]}")

    # Derive capabilities and optionally output for add-model flow
    model_ratios: dict[str, set[str]] = {}
    model_sizes: dict[str, set[str]] = {}
    for r in results:
        mid = r.get("model_id")
        if not mid:
            continue
        if mid not in model_ratios:
            model_ratios[mid] = set()
            model_sizes[mid] = set()
        if r.get("status") == "success":
            ar = r.get("aspect_ratio")
            sz = r.get("image_size")
            if ar:
                model_ratios[mid].add(ar)
            if sz:
                model_sizes[mid].add(sz)

    if args.output_capabilities:
        caps = []
        for mid in sorted(model_ratios.keys()):
            ratios = sorted(model_ratios.get(mid, set())) or ASPECT_RATIOS
            raw_sizes = model_sizes.get(mid)
            sizes = (
                sorted(raw_sizes, key=lambda s: ("1K", "2K", "4K").index(s))
                if raw_sizes
                else ["1K", "2K"]
            )
            caps.append({"model_id": mid, "aspect_ratios": ratios, "image_sizes": sizes})
        print(json.dumps(caps))

    # Summary
    if not args.output_capabilities:
        print("\n" + "=" * 60)
    success = [r for r in results if r["status"] == "success"]
    errors = [r for r in results if r["status"] == "error"]
    if not args.output_capabilities:
        print(f"Results: {len(success)} succeeded, {len(errors)} failed")
    if errors and not args.output_capabilities:
        print("\nFailed:")
        for r in errors:
            cfg = f"{r.get('aspect_ratio')} @ {r.get('image_size')}"
            print(f"  {r['model_id']} {cfg}: {r.get('error', '')[:80]}")

    if args.output_capabilities:
        return 0 if not errors else 1

    out_path = Path(__file__).parent.parent / "data" / "image_config_test_results.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(
            {
                "summary": {
                    "total": len(results),
                    "success": len(success),
                    "failed": len(errors),
                    "configs_tested": configs,
                },
                "results": results,
            },
            f,
            indent=2,
        )
    print(f"\nResults saved to {out_path}")

    return 0 if not errors else 1


if __name__ == "__main__":
    sys.exit(main())
