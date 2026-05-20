#!/usr/bin/env python3
"""
Live-check language models with a red-circle PNG and see if they describe it correctly.

Uses the same probe as admin add-model (``app.llm.vision_probe``). Skips image-generation
models. Requires ``OPENROUTER_API_KEY`` (via ``app.config.settings``).

Each printed line is ``model_id`` + tab + outcome (and optional detail):

* ``observed`` — Model response mentions red and circle; vision input works.
* ``no_vision_response`` — API accepted the image but the answer did not match.
* ``rejected`` — API rejected image input (e.g. model does not support vision).
* ``skip`` + ``no_vision_metadata`` — OpenRouter snapshot lists text-only input; no API call
  (default batch mode only; use ``--all`` to probe anyway).
* ``skip`` + ``not_in_openrouter_snapshot`` — Model id missing from bundled snapshot; no API call.
* ``error`` + message — Request failed for inconclusive reasons (rate limit, timeout, etc.);
  registry unchanged on ``--apply``. OpenRouter 404 ``No endpoints found that support image
  input`` is treated as ``rejected`` instead.

Image-generation models (or ``category: Image``) are omitted entirely.

With ``--apply``, outcomes map to registry updates as follows:

* ``observed`` → set ``supports_vision_probed: true``.
* ``no_vision_response`` / ``rejected`` → set ``supports_vision_probed: false``.
* ``skip`` / ``error`` → leave that model's row unchanged.

Run from the backend directory::

    # Print results (metadata vision candidates + not-yet-probed)
    python scripts/probe_vision_models.py

    # One model
    python scripts/probe_vision_models.py --model-id openai/gpt-4o

    # Probe every language model (including text-only metadata)
    python scripts/probe_vision_models.py --all

    # Write ``supports_vision_probed`` in models_registry.json
    python scripts/probe_vision_models.py --apply

Re-run after refreshing ``openrouter_models.json`` (``python scripts/refresh_openrouter_models_json.py``)
or when onboarding new models (admin add-model upserts the snapshot row automatically).
"""

from __future__ import annotations

import argparse
import copy
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.llm.reasoning_probe import get_openrouter_snapshot_entry  # noqa: E402
from app.llm.registry import (  # noqa: E402
    get_registry_path,
    load_registry,
    openrouter_entry_supports_vision_input,
    save_registry,
)
from app.llm.vision_probe import VisionProbeResult, probe_supports_vision_input  # noqa: E402


def _is_image_registry_model(m: dict) -> bool:
    if m.get("supports_image_generation") is True:
        return True
    if (m.get("category") or "").lower() == "image":
        return True
    return False


def _should_probe_model(
    model_id: str,
    m: dict,
    *,
    probe_all: bool,
    force: bool,
) -> bool:
    if force:
        return True
    if probe_all:
        return True
    if "supports_vision_probed" in m:
        return False
    entry = get_openrouter_snapshot_entry(model_id)
    if entry is None:
        return True
    return openrouter_entry_supports_vision_input(entry)


def _format_result(model_id: str, res: VisionProbeResult) -> str:
    if res.observed:
        return f"{model_id}\tobserved"
    if res.skip_reason:
        return f"{model_id}\tskip\t{res.skip_reason}"
    if res.rejected:
        detail = (res.error or "")[:200]
        return f"{model_id}\trejected\t{detail}".rstrip()
    if res.error:
        return f"{model_id}\terror\t{res.error[:200]}"
    return f"{model_id}\tno_vision_response"


def _apply_registry_change(model_id: str, res: VisionProbeResult, m: dict) -> bool:
    """Mutate ``m``; return True if ``supports_vision_probed`` changed."""
    before = copy.deepcopy(m.get("supports_vision_probed"))

    if res.observed:
        m["supports_vision_probed"] = True
        return before is not True

    if res.skip_reason or (res.error and not res.rejected):
        return False

    if res.rejected or (not res.observed and res.error is None and res.skip_reason is None):
        m["supports_vision_probed"] = False
        return before is not False

    return False


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Probe language models for vision input with a red-circle test image."
    )
    parser.add_argument("--apply", action="store_true", help="Update models_registry.json")
    parser.add_argument("--model-id", type=str, default=None, help="Only this OpenRouter model id")
    parser.add_argument(
        "--all",
        action="store_true",
        help="Probe every language model, including those with text-only metadata",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-probe models that already have supports_vision_probed set",
    )
    args = parser.parse_args()

    registry_path = get_registry_path()
    print(f"Registry: {registry_path}")
    registry = load_registry()
    mbp = registry.get("models_by_provider", {})

    targets: list[tuple[str, dict]] = []
    for _provider, models in mbp.items():
        for m in models:
            mid = m.get("id")
            if not mid:
                continue
            if args.model_id and mid != args.model_id:
                continue
            if _is_image_registry_model(m):
                continue
            if not _should_probe_model(
                mid, m, probe_all=args.all, force=args.force or bool(args.model_id)
            ):
                continue
            targets.append((mid, m))

    if args.model_id and not targets:
        print(f"No matching language model in registry: {args.model_id}", file=sys.stderr)
        return 1

    mutated = 0
    for mid, m in targets:
        res = probe_supports_vision_input(
            mid,
            skip_if_no_vision_metadata=not args.all and not args.model_id,
        )
        print(_format_result(mid, res))
        if args.apply and _apply_registry_change(mid, res, m):
            mutated += 1

    if args.apply:
        if mutated:
            save_registry(registry)
            print(f"Saved registry ({mutated} model(s) updated).")
        else:
            print("No registry changes.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
