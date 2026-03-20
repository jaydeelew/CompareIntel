#!/bin/bash
# Ping Google and Bing to notify them of sitemap updates.
# Run after deploying SEO changes (new pages, meta tag updates, etc.).
# See docs/SEO_SETUP.md for full post-deployment checklist.
#
# Note: Google deprecated their sitemap ping endpoint (2024); it may return 404.
# Bing's ping may still work. Primary method: submit sitemap in Search Console.

# Best-effort: don't fail CI if ping endpoints are unreachable
SITEMAP_URL="https://compareintel.com/sitemap.xml"
GOOGLE_PING="https://www.google.com/ping?sitemap=${SITEMAP_URL}"
BING_PING="https://www.bing.com/ping?sitemap=${SITEMAP_URL}"

echo "Pinging search engines for sitemap update..."
echo "  Sitemap: ${SITEMAP_URL}"
echo ""

# Google
HTTP=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 10 "${GOOGLE_PING}" || echo "000")
echo "  Google: HTTP ${HTTP}"

# Bing
HTTP=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 10 "${BING_PING}" || echo "000")
echo "  Bing: HTTP ${HTTP}"

echo ""
echo "Done. Search engines will recrawl the sitemap when ready."
