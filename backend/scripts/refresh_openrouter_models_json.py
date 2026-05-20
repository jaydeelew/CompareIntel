#!/usr/bin/env python3
"""
Refresh backend/openrouter_models.json from the live OpenRouter /api/v1/models catalog.

Writes one snapshot row per model id in models_registry.json that OpenRouter returns.
Requires ``OPENROUTER_API_KEY`` (via ``app.config.settings``).

Run from the backend directory::

    # Refresh all registry models (default)
    python scripts/refresh_openrouter_models_json.py

    # Preview counts without writing
    python scripts/refresh_openrouter_models_json.py --dry-run

    # Refresh a single registry model id
    python scripts/refresh_openrouter_models_json.py --model-id openai/gpt-4o

After a full refresh, re-run capability probes if needed::

    python scripts/probe_vision_models.py --all --apply --force
    python scripts/probe_streaming_reasoning_models.py --apply

Admin add-model upserts the new model's row automatically (no full refresh required).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.llm.registry import (  # noqa: E402
    OpenRouterSnapshotRefreshResult,
    get_openrouter_models_json_path,
    get_registry_model_ids,
    refresh_openrouter_snapshot_from_live_api,
)


def _print_result(result: OpenRouterSnapshotRefreshResult, *, model_id: str | None) -> None:
    path = get_openrouter_models_json_path()
    action = "Would write" if result.dry_run else "Wrote"
    scope = f"model {model_id}" if model_id else "registry"
    print(f"{action} {result.written} row(s) to {path} ({scope})")
    if result.added:
        print(f"  added: {result.added}")
    if result.removed:
        print(f"  removed: {result.removed}")
    if result.missing_from_api:
        print(f"  missing from OpenRouter API ({len(result.missing_from_api)}):")
        for mid in result.missing_from_api:
            print(f"    - {mid}")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Refresh openrouter_models.json from live OpenRouter metadata."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would change without writing the file",
    )
    parser.add_argument(
        "--model-id",
        type=str,
        default=None,
        help="Only refresh this OpenRouter model id (must be in models_registry.json)",
    )
    args = parser.parse_args()

    only_ids = None
    if args.model_id:
        registry_ids = get_registry_model_ids()
        if args.model_id not in registry_ids:
            print(f"Model not in registry: {args.model_id}", file=sys.stderr)
            return 1
        only_ids = {args.model_id}

    try:
        result = refresh_openrouter_snapshot_from_live_api(
            dry_run=args.dry_run,
            only_model_ids=only_ids,
        )
    except RuntimeError as e:
        print(str(e), file=sys.stderr)
        return 1

    _print_result(result, model_id=args.model_id)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
