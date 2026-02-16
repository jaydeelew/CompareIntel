#!/bin/bash
# Check search ranking of compareintel.com for a query using Chrome/Selenium.
# Usage: ./GoogleBingSearchRank.sh  (or HEADLESS_MODE=false for visible browser)

set -e

SEARCH_QUERY="${SEARCH_QUERY:-compare ai models side by side}"
TARGET_DOMAIN="${TARGET_DOMAIN:-compareintel.com}"
HEADLESS_MODE="${HEADLESS_MODE:-true}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_SCRIPT="$SCRIPT_DIR/scripts/search_rank_checker.py"

command -v python3 >/dev/null 2>&1 || { echo "ERROR: python3 required"; exit 1; }
python3 -c "import selenium; from webdriver_manager.chrome import ChromeDriverManager" 2>/dev/null || {
    echo "ERROR: pip install selenium webdriver-manager"; exit 1;
}

echo "Search ranking: $SEARCH_QUERY -> $TARGET_DOMAIN (headless=$HEADLESS_MODE)"
echo ""

python3 "$PYTHON_SCRIPT" "$SEARCH_QUERY" "$TARGET_DOMAIN" "$HEADLESS_MODE" 2>&1 | while IFS= read -r line; do
    case "$line" in
        SEARCHING_GOOGLE) echo "Checking Google...";;
        SEARCHING_BING) echo "Checking Bing...";;
        GOOGLE_RESULT:NOT_FOUND) echo "WARN: $TARGET_DOMAIN not found in Google";;
        GOOGLE_RESULT:*) echo "OK: $TARGET_DOMAIN at position ${line#GOOGLE_RESULT:} in Google";;
        BING_RESULT:NOT_FOUND) echo "WARN: $TARGET_DOMAIN not found in Bing";;
        BING_RESULT:*) echo "OK: $TARGET_DOMAIN at position ${line#BING_RESULT:} in Bing";;
        ERROR:*) echo "ERROR: ${line#ERROR:}" >&2;;
    esac
done

echo ""
