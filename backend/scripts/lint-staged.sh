#!/usr/bin/env bash
# Run ruff and mypy on staged backend Python files (invoked by lint-staged from repo root).
# Usage: backend/scripts/lint-staged.sh backend/app/x.py backend/app/y.py ...
set -e
export LC_ALL=C
cd "$(dirname "$0")/.."

# Strip backend/ prefix so paths are relative to backend/
FILES=()
for f in "$@"; do
  FILES+=("${f#backend/}")
done

if [ ${#FILES[@]} -gt 0 ]; then
  ruff check --fix "${FILES[@]}"
  ruff format "${FILES[@]}"
fi

# Type-check whole app when any backend file is staged (types span module boundaries)
mypy app --ignore-missing-imports
