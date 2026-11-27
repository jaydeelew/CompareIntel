#!/usr/bin/env bash
# Install Playwright browsers with OS deps.
#
# Two GitHub-hosted ubuntu-24.04 failures abort this before any test runs:
# - apt-get update exits 100 when packages.microsoft.com returns 403 and the
#   image still lists that repo as a signed source
# - apt-get hangs inside `playwright install --with-deps`
#
# Drop the Microsoft source, then retry a bounded install. Run this from the
# package that depends on Playwright (frontend or rendering-harness).
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "usage: install-playwright-browsers.sh <browser>..." >&2
  exit 2
fi

drop_broken_microsoft_apt() {
  local src
  if [[ -f /etc/apt/sources.list ]] && grep -q 'packages.microsoft.com' /etc/apt/sources.list; then
    echo "Commenting Microsoft apt lines in /etc/apt/sources.list"
    sudo sed -i '/packages.microsoft.com/s/^/# /' /etc/apt/sources.list
  fi
  [[ -d /etc/apt/sources.list.d ]] || return 0
  while IFS= read -r -d '' src; do
    if grep -q 'packages.microsoft.com' "$src"; then
      echo "Removing Microsoft apt source that fails apt-get update: $src"
      sudo rm -f "$src"
    fi
  done < <(find /etc/apt/sources.list.d -type f \( -name '*.list' -o -name '*.sources' \) -print0)
}

drop_broken_microsoft_apt

ok=0
for attempt in 1 2 3; do
  if timeout 8m npx playwright install --with-deps "$@"; then
    ok=1
    break
  fi
  echo "Playwright install attempt ${attempt} did not finish; retrying"
done
test "$ok" = 1
