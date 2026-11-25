#!/usr/bin/env python3
"""CI check for the model registry and renderer configs.

Exits 1 when a text model has no renderer config and no explicit default, when
a renderer config is orphaned or stale versus the generator, or when a text
model added since the base ref has no saved rendering-harness replies for the
standard prompts and no allowlist reason. This process does not call a model API.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from scripts.catalog_transaction import ADDING_NEW_MODELS_DOC, check_live_catalog, repo_root


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--base-ref",
        default=os.environ.get("CATALOG_BASE_REF", "origin/master"),
        help="Git ref whose registry is the base for the new-model rendering gate",
    )
    parser.add_argument(
        "--skip-new-model-gate",
        action="store_true",
        help="Only run the registry and renderer-config consistency checks",
    )
    args = parser.parse_args()
    require_base = os.environ.get("CI") == "true" and not args.skip_new_model_gate
    errors = check_live_catalog(
        repo_root(),
        base_ref=None if args.skip_new_model_gate else args.base_ref,
        require_base=require_base,
    )
    if errors:
        print("Model catalog check failed.", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        print(f"See {ADDING_NEW_MODELS_DOC}", file=sys.stderr)
        return 1
    print("Model catalog check passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
