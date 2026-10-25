#!/bin/bash
##
## SEO Verification Script
## 
## Run this after deploying to production to verify that:
## 1. Each public page has unique metadata
## 2. Unknown URLs return HTTP 404
## 3. Sitemap is generated and accessible
## 4. Pages have visible content without JavaScript
##
## Usage: ./verify-seo-deployment.sh [base-url]
## Example: ./verify-seo-deployment.sh https://compareintel.com
##

set -e

BASE_URL="${1:-https://compareintel.com}"
echo "🔍 Verifying SEO deployment on: $BASE_URL"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

pass() {
    echo -e "${GREEN}✓${NC} $1"
}

fail() {
    echo -e "${RED}✗${NC} $1"
    exit 1
}

warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Test 1: Verify each page has unique title
echo "📋 Test 1: Unique page titles"
echo "========================================"

HOMEPAGE_TITLE=$(curl -sL "$BASE_URL/" | grep -o '<title>[^<]*</title>' | head -1)
ABOUT_TITLE=$(curl -sL "$BASE_URL/about" | grep -o '<title>[^<]*</title>' | head -1)
FEATURES_TITLE=$(curl -sL "$BASE_URL/features" | grep -o '<title>[^<]*</title>' | head -1)

echo "Homepage: $HOMEPAGE_TITLE"
echo "About: $ABOUT_TITLE"
echo "Features: $FEATURES_TITLE"

if [[ "$HOMEPAGE_TITLE" == *"Compare AI"* ]] && [[ "$ABOUT_TITLE" == *"About"* ]] && [[ "$FEATURES_TITLE" == *"Features"* ]]; then
    pass "All pages have unique titles"
else
    fail "Pages do not have unique titles!"
fi
echo ""

# Test 2: Verify unique meta descriptions
echo "📝 Test 2: Unique meta descriptions"
echo "========================================"

HOMEPAGE_DESC=$(curl -sL "$BASE_URL/" | grep -o '<meta name="description" content="[^"]*"' | head -1)
ABOUT_DESC=$(curl -sL "$BASE_URL/about" | grep -o '<meta name="description" content="[^"]*"' | head -1)

echo "Homepage: $HOMEPAGE_DESC"
echo "About: $ABOUT_DESC"

if [[ "$HOMEPAGE_DESC" != "$ABOUT_DESC" ]]; then
    pass "Pages have unique descriptions"
else
    fail "Pages have duplicate descriptions!"
fi
echo ""

# Test 3: Verify unique canonical URLs
echo "🔗 Test 3: Unique canonical URLs"
echo "========================================"

HOMEPAGE_CANONICAL=$(curl -sL "$BASE_URL/" | grep -o '<link rel="canonical" href="[^"]*"' | head -1)
ABOUT_CANONICAL=$(curl -sL "$BASE_URL/about" | grep -o '<link rel="canonical" href="[^"]*"' | head -1)

echo "Homepage: $HOMEPAGE_CANONICAL"
echo "About: $ABOUT_CANONICAL"

if [[ "$HOMEPAGE_CANONICAL" == *'href="https://compareintel.com/"'* ]] && [[ "$ABOUT_CANONICAL" == *'href="https://compareintel.com/about"'* ]]; then
    pass "Canonical URLs are correct and unique"
else
    fail "Canonical URLs are incorrect!"
fi
echo ""

# Test 4: Verify visible h1 content
echo "📰 Test 4: Visible H1 content"
echo "========================================"

HOMEPAGE_H1=$(curl -sL "$BASE_URL/" | grep -o '<h1[^>]*>[^<]*</h1>' | head -1 | sed 's/<[^>]*>//g')
ABOUT_H1=$(curl -sL "$BASE_URL/about" | grep -o '<h1[^>]*>[^<]*</h1>' | head -1 | sed 's/<[^>]*>//g')

echo "Homepage H1: $HOMEPAGE_H1"
echo "About H1: $ABOUT_H1"

if [[ -n "$HOMEPAGE_H1" ]] && [[ -n "$ABOUT_H1" ]]; then
    pass "Pages have visible H1 content"
else
    warn "Could not extract H1 content (might be hidden in styles)"
fi
echo ""

# Test 5: Verify 404 for unknown routes
echo "🚫 Test 5: 404 for unknown routes"
echo "========================================"

HTTP_STATUS=$(curl -sI "$BASE_URL/nonexistent-xyz-test" | grep -i "^HTTP" | head -1)
echo "Unknown URL status: $HTTP_STATUS"

if [[ "$HTTP_STATUS" == *"404"* ]]; then
    pass "Unknown routes return 404"
else
    fail "Unknown routes do not return 404! Got: $HTTP_STATUS"
fi
echo ""

# Test 6: Verify sitemap accessibility
echo "🗺️  Test 6: Sitemap accessibility"
echo "========================================"

SITEMAP_STATUS=$(curl -sI "$BASE_URL/sitemap.xml" | grep -i "^HTTP" | head -1)
echo "Sitemap status: $SITEMAP_STATUS"

if [[ "$SITEMAP_STATUS" == *"200"* ]]; then
    pass "Sitemap is accessible"
    
    # Check sitemap content
    SITEMAP_URLS=$(curl -s "$BASE_URL/sitemap.xml" | grep -c "<loc>")
    echo "Sitemap contains $SITEMAP_URLS URLs"
    
    if [[ "$SITEMAP_URLS" -ge 9 ]]; then
        pass "Sitemap has expected number of URLs (9+)"
    else
        warn "Sitemap has fewer URLs than expected"
    fi
else
    fail "Sitemap is not accessible!"
fi
echo ""

# Test 7: Verify body content without JS
echo "📄 Test 7: Body content without JS"
echo "========================================"

ABOUT_BODY=$(curl -sL "$BASE_URL/about" | grep -o "What is CompareIntel")
if [[ -n "$ABOUT_BODY" ]]; then
    pass "About page has visible body content"
else
    fail "About page body content not found!"
fi

FAQ_BODY=$(curl -sL "$BASE_URL/faq" | grep -o "Frequently Asked Questions")
if [[ -n "$FAQ_BODY" ]]; then
    pass "FAQ page has visible body content"
else
    fail "FAQ page body content not found!"
fi
echo ""

# Test 8: Test all prerendered routes
echo "🌐 Test 8: All prerendered routes"
echo "========================================"

ROUTES=("/" "/about" "/features" "/how-it-works" "/faq" "/image-generation" "/help-me-choose-methodology" "/privacy-policy" "/terms-of-service")

for route in "${ROUTES[@]}"; do
    STATUS=$(curl -sI "$BASE_URL$route" | grep -i "^HTTP" | head -1)
    if [[ "$STATUS" == *"200"* ]] || [[ "$STATUS" == *"301"* ]] || [[ "$STATUS" == *"302"* ]]; then
        pass "$route is accessible"
    else
        fail "$route returned unexpected status: $STATUS"
    fi
done
echo ""

echo "========================================"
echo -e "${GREEN}✨ All SEO verification tests passed!${NC}"
echo "========================================"
echo ""
echo "Next steps:"
echo "1. Submit sitemap to Google Search Console: $BASE_URL/sitemap.xml"
echo "2. Request re-indexing for all public pages"
echo "3. Monitor search results over the next few days"
echo ""
