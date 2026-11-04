#!/bin/bash
# Submit URLs to IndexNow API for instant search engine indexing.
# Run after deploying SEO changes (new pages, meta tag updates, etc.).
# See https://www.indexnow.org/documentation for API documentation.

set -euo pipefail

# IndexNow configuration
INDEXNOW_KEY="9880ff425ab0bf53e6b75fd91644c4f1"
INDEXNOW_API="https://api.indexnow.org/indexnow"
HOST="compareintel.com"
KEY_LOCATION="https://compareintel.com/${INDEXNOW_KEY}.txt"
SITEMAP_URL="https://compareintel.com/sitemap.xml"

echo "Submitting URLs to IndexNow..."
echo "  Host: ${HOST}"
echo "  Key location: ${KEY_LOCATION}"
echo ""

# Fetch and parse sitemap XML to extract URLs
echo "Fetching sitemap from ${SITEMAP_URL}..."
SITEMAP_CONTENT=$(curl -sS --max-time 30 "${SITEMAP_URL}" || true)

if [ -z "$SITEMAP_CONTENT" ]; then
  echo "⚠️  Warning: Could not fetch sitemap. Skipping IndexNow submission."
  exit 0
fi

# Extract URLs from sitemap using grep and sed
# This extracts text between <loc> and </loc> tags
URLS=$(echo "$SITEMAP_CONTENT" | grep -oP '(?<=<loc>)[^<]+' || true)

if [ -z "$URLS" ]; then
  echo "⚠️  Warning: No URLs found in sitemap. Skipping IndexNow submission."
  exit 0
fi

# Convert URLs to JSON array format
URL_ARRAY=$(echo "$URLS" | sed 's/^/"/;s/$/"/' | paste -sd, -)
URL_COUNT=$(echo "$URLS" | wc -l)

echo "Found ${URL_COUNT} URLs in sitemap"
echo ""

# Build JSON payload
JSON_PAYLOAD=$(cat <<EOF
{
  "host": "${HOST}",
  "key": "${INDEXNOW_KEY}",
  "keyLocation": "${KEY_LOCATION}",
  "urlList": [${URL_ARRAY}]
}
EOF
)

# Submit to IndexNow API
echo "Submitting to IndexNow API..."
HTTP_CODE=$(curl -sS -o /dev/null -w "%{http_code}" \
  --max-time 30 \
  -X POST \
  -H "Content-Type: application/json" \
  -d "$JSON_PAYLOAD" \
  "${INDEXNOW_API}" || echo "000")

echo "  Response: HTTP ${HTTP_CODE}"

# IndexNow response codes:
# 200 OK: URLs received successfully
# 202 Accepted: URLs received but may take time to process
# 400 Bad Request: Invalid request format
# 403 Forbidden: Invalid key or key location
# 422 Unprocessable Entity: Invalid URL format
# 429 Too Many Requests: Rate limited

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "202" ]; then
  echo "✓ URLs submitted successfully"
elif [ "$HTTP_CODE" = "000" ]; then
  echo "⚠️  Warning: Could not reach IndexNow API (network error)"
else
  echo "⚠️  Warning: IndexNow API returned HTTP ${HTTP_CODE}"
  echo "    This may indicate an issue with the submission, but CI will not fail."
fi

echo ""
echo "Done. Search engines will reindex URLs when ready."
