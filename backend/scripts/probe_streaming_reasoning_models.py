#!/usr/bin/env python3
"""
Live-check each language model: one short streamed completion and look for separable reasoning.

Uses the same detection as the app (``reasoning`` / ``reasoning_content`` on stream deltas).
Skips image-generation models. Requires ``OPENROUTER_API_KEY`` (via ``app.config.settings``).

Each printed line is ``model_id`` + tab + outcome (and optional detail):

* ``observed`` — Stream returned at least one separable reasoning chunk; probe succeeded.
* ``no_reasoning_stream`` — API was called (model lists reasoning params), stream ended without
  reasoning deltas; not an error.
* ``skip`` + ``no_reasoning_parameters`` — Snapshot says the model has no ``reasoning`` /
  ``include_reasoning`` params; no API call for this model.
* ``skip`` + ``not_in_openrouter_snapshot`` — Model id missing from bundled ``openrouter_models.json``;
  no API call.
* ``error`` + message — Request failed (network, 4xx/5xx, etc.); registry unchanged on ``--apply``.

Image-generation models (or ``category: Image``) are omitted from the run entirely — no line printed,
no ``--apply`` change for them.

With ``--apply``, those outcomes map to registry updates as follows:

* ``observed`` → set ``is_thinking_model: true``.
* ``no_reasoning_stream`` → remove ``is_thinking_model`` if present.
* ``skip`` / ``no_reasoning_parameters`` → remove key if present.
* ``skip`` / ``not_in_openrouter_snapshot`` → set or remove key per
  ``is_thinking_model_registry_file_value`` (bundled snapshot + ``STREAMING_REASONING_MODEL_IDS_NOT_IN_SNAPSHOT``).
* ``error`` → leave that model’s row unchanged.

Run from the backend directory::

    # Print results only
    python scripts/probe_streaming_reasoning_models.py

    # One model
    python scripts/probe_streaming_reasoning_models.py --model-id anthropic/claude-3.7-sonnet

    # Write ``is_thinking_model`` in models_registry.json from probe outcomes
    python scripts/probe_streaming_reasoning_models.py --apply

Re-run after refreshing ``openrouter_models.json`` or when onboarding new models (admin add-model
also probes once automatically).
"""

from __future__ import annotations

import argparse
import copy
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.llm.reasoning_probe import (  # noqa: E402
    ReasoningProbeResult,
    probe_streams_separable_reasoning,
)
from app.llm.registry import (  # noqa: E402
    get_registry_path,
    is_thinking_model_registry_file_value,
    load_registry,
    save_registry,
)


def _is_image_registry_model(m: dict) -> bool:
    if m.get("supports_image_generation") is True:
        return True
    if (m.get("category") or "").lower() == "image":
        return True
    return False


def _format_result(model_id: str, res: ReasoningProbeResult) -> str:
    if res.observed:
        return f"{model_id}\tobserved"
    if res.skip_reason:
        return f"{model_id}\tskip\t{res.skip_reason}"
    if res.error:
        return f"{model_id}\terror\t{res.error[:200]}"
    return f"{model_id}\tno_reasoning_stream"


def _apply_registry_change(model_id: str, res: ReasoningProbeResult, m: dict) -> bool:
    """Mutate ``m``; return True if ``is_thinking_model`` presence or value changed."""
    before = copy.deepcopy(m.get("is_thinking_model"))

    if res.observed:
        m["is_thinking_model"] = True
        return before is not True

    if res.skip_reason == "no_reasoning_parameters":
        if "is_thinking_model" in m:
            del m["is_thinking_model"]
            return True
        return False

    if res.skip_reason == "not_in_openrouter_snapshot":
        want = is_thinking_model_registry_file_value(model_id)
        if want:
            m["is_thinking_model"] = True
            return before is not True
        if "is_thinking_model" in m:
            del m["is_thinking_model"]
            return True
        return False

    if res.error is not None:
        return False

    if "is_thinking_model" in m:
        del m["is_thinking_model"]
        return True
    return False


def main() -> int:
    parser = argparse.ArgumentParser(description="Probe models for separable reasoning streams.")
    parser.add_argument("--apply", action="store_true", help="Update models_registry.json")
    parser.add_argument("--model-id", type=str, default=None, help="Only this OpenRouter model id")
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
            targets.append((mid, m))

    if args.model_id and not targets:
        print(f"No matching language model in registry: {args.model_id}", file=sys.stderr)
        return 1

    mutated = 0
    for mid, m in targets:
        res = probe_streams_separable_reasoning(mid)
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
