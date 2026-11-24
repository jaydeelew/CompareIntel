#!/usr/bin/env bash
# Boot production nginx against a fixture document root and check status codes.
# Unknown paths must be HTTP 404 (not 200 with the homepage canonical).
# Known prerendered pages and SPA deep links must stay HTTP 200.
# /privacy must 301 to /privacy-policy.
#
# Prefers docker nginx:alpine. Falls back to local nginx. Set NGINX_T_REQUIRE=1
# to fail when neither is available.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROD_CONF="$REPO_ROOT/nginx/nginx.prod.conf"
SSL_CONF="$REPO_ROOT/nginx/nginx.ssl.conf"
MIME="$REPO_ROOT/nginx/mime.types.custom"
REQUIRE="${NGINX_T_REQUIRE:-0}"

have_docker=0
have_nginx=0
command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1 && have_docker=1
command -v nginx >/dev/null 2>&1 && have_nginx=1

if [ "$have_docker" -eq 0 ] && [ "$have_nginx" -eq 0 ]; then
  if [ "$REQUIRE" = "1" ]; then
    echo "❌ nginx status check required but neither docker nor nginx is available"
    exit 1
  fi
  echo "⚠️  nginx and docker not available; skipping SPA status check"
  exit 0
fi

WORKDIR="$(mktemp -d)"
HTML="$WORKDIR/html"
FAIL=0
CONTAINERS=()
NGINX_PID=""

cleanup() {
  if [ -n "$NGINX_PID" ] && kill -0 "$NGINX_PID" >/dev/null 2>&1; then
    kill "$NGINX_PID" >/dev/null 2>&1 || true
    wait "$NGINX_PID" >/dev/null 2>&1 || true
  fi
  for name in "${CONTAINERS[@]}"; do
    docker rm -f "$name" >/dev/null 2>&1 || true
  done
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

mkdir -p "$HTML/models/claude-opus-5" "$HTML/admin" "$HTML/reset-password" "$HTML/assets" \
  "$HTML/about" "$HTML/features" "$HTML/how-it-works" "$HTML/faq" "$HTML/pricing" \
  "$HTML/image-generation" "$HTML/help-me-choose-methodology" "$HTML/verdict-methodology" \
  "$HTML/privacy-policy" "$HTML/terms-of-service" "$WORKDIR/certs" "$WORKDIR/cache" "$WORKDIR/logs"

# /terms is intentionally not a file so the exact-location fallback to index.html is exercised.
cat >"$HTML/index.html" <<'EOF'
<!doctype html><html><head>
<link rel="canonical" href="https://compareintel.com/" />
<title>Home</title></head><body>HOMEPAGE_MARKER</body></html>
EOF
cat >"$HTML/404.html" <<'EOF'
<!doctype html><html><head>
<title>404 - Page Not Found - CompareIntel</title>
<meta name="robots" content="noindex, nofollow" />
</head><body><h1>404 - Page Not Found</h1>NOT_FOUND_MARKER</body></html>
EOF
printf 'ABOUT_MARKER\n' >"$HTML/about/index.html"
printf 'FEATURES_MARKER\n' >"$HTML/features/index.html"
printf 'HOW_MARKER\n' >"$HTML/how-it-works/index.html"
printf 'FAQ_MARKER\n' >"$HTML/faq/index.html"
printf 'PRICING_MARKER\n' >"$HTML/pricing/index.html"
printf 'IMAGE_MARKER\n' >"$HTML/image-generation/index.html"
printf 'HELP_MARKER\n' >"$HTML/help-me-choose-methodology/index.html"
printf 'VERDICT_MARKER\n' >"$HTML/verdict-methodology/index.html"
printf 'PRIVACY_MARKER\n' >"$HTML/privacy-policy/index.html"
printf 'TERMS_MARKER\n' >"$HTML/terms-of-service/index.html"
printf 'MODELS_INDEX_MARKER\n' >"$HTML/models/index.html"
printf 'MODEL_MARKER\n' >"$HTML/models/claude-opus-5/index.html"
printf 'ADMIN_SHELL\n' >"$HTML/admin/index.html"
printf 'RESET_SHELL\n' >"$HTML/reset-password/index.html"
printf 'JS_MARKER\n' >"$HTML/assets/app.js"

openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout "$WORKDIR/certs/privkey.pem" \
  -out "$WORKDIR/certs/fullchain.pem" \
  -days 1 -subj "/CN=compareintel.com" >/dev/null 2>&1
cp "$WORKDIR/certs/fullchain.pem" "$WORKDIR/certs/chain.pem"

check() {
  local url="$1"
  local expected="$2"
  local marker="${3:-}"
  local absent="${4:-}"
  local body="$WORKDIR/body"
  local headers="$WORKDIR/headers"
  local status
  # Remaining args are extra curl flags (TLS, resolve).
  shift 4 || true
  status="$(curl -sS -o "$body" -D "$headers" -w '%{http_code}' --max-redirs 0 "$@" "$url" || true)"
  if [ "$status" != "$expected" ]; then
    echo "FAIL $url expected HTTP $expected, got $status"
    sed -n '1,12p' "$headers" || true
    FAIL=1
    return
  fi
  if [ -n "$marker" ] && ! grep -q "$marker" "$body"; then
    echo "FAIL $url HTTP $status but body is missing $marker"
    FAIL=1
    return
  fi
  if [ -n "$absent" ] && grep -q "$absent" "$body"; then
    echo "FAIL $url body unexpectedly contains $absent"
    FAIL=1
    return
  fi
  echo "ok $status $url"
}

check_redirect() {
  local url="$1"
  local expected_location="$2"
  shift 2
  local headers="$WORKDIR/headers"
  local status
  status="$(curl -sS -o /dev/null -D "$headers" -w '%{http_code}' --max-redirs 0 "$@" "$url" || true)"
  local location
  location="$(awk 'tolower($1)=="location:" { print $2 }' "$headers" | tr -d '\r')"
  # nginx expands a path redirect to an absolute URL using the request host.
  if [ "$status" != "301" ] || [[ "$location" != "$expected_location" && "$location" != *"$expected_location" ]]; then
    echo "FAIL $url expected 301 $expected_location, got $status $location"
    FAIL=1
    return
  fi
  echo "ok 301 $url -> $location"
}

assert_routes() {
  local base="$1"
  shift
  echo "—— $base ——"
  check "$base/" 200 HOMEPAGE_MARKER NOT_FOUND_MARKER "$@"
  check "$base/about" 200 ABOUT_MARKER NOT_FOUND_MARKER "$@"
  check "$base/about/" 200 ABOUT_MARKER NOT_FOUND_MARKER "$@"
  check "$base/features" 200 FEATURES_MARKER NOT_FOUND_MARKER "$@"
  check "$base/how-it-works" 200 HOW_MARKER NOT_FOUND_MARKER "$@"
  check "$base/faq" 200 FAQ_MARKER NOT_FOUND_MARKER "$@"
  check "$base/pricing" 200 PRICING_MARKER NOT_FOUND_MARKER "$@"
  check "$base/image-generation" 200 IMAGE_MARKER NOT_FOUND_MARKER "$@"
  check "$base/help-me-choose-methodology" 200 HELP_MARKER NOT_FOUND_MARKER "$@"
  check "$base/verdict-methodology" 200 VERDICT_MARKER NOT_FOUND_MARKER "$@"
  check "$base/privacy-policy" 200 PRIVACY_MARKER NOT_FOUND_MARKER "$@"
  check "$base/terms-of-service" 200 TERMS_MARKER NOT_FOUND_MARKER "$@"
  check "$base/models" 200 MODELS_INDEX_MARKER NOT_FOUND_MARKER "$@"
  check "$base/models/claude-opus-5" 200 MODEL_MARKER NOT_FOUND_MARKER "$@"
  check "$base/admin" 200 ADMIN_SHELL HOMEPAGE_MARKER "$@"
  check "$base/reset-password?token=abc" 200 RESET_SHELL 'rel="canonical" href="https://compareintel.com/"' "$@"
  # No terms/index.html: exact location falls back to the SPA index and stays 200.
  check "$base/terms" 200 HOMEPAGE_MARKER NOT_FOUND_MARKER "$@"
  check "$base/assets/app.js" 200 JS_MARKER NOT_FOUND_MARKER "$@"
  check "$base/models/does-not-exist" 404 NOT_FOUND_MARKER 'rel="canonical" href="https://compareintel.com/"' "$@"
  check "$base/random-page" 404 NOT_FOUND_MARKER HOMEPAGE_MARKER "$@"
  check "$base/about/extra" 404 NOT_FOUND_MARKER HOMEPAGE_MARKER "$@"
  check "$base/admin/extra" 404 NOT_FOUND_MARKER HOMEPAGE_MARKER "$@"
  check "$base/dashboard" 404 NOT_FOUND_MARKER HOMEPAGE_MARKER "$@"
  check_redirect "$base/privacy" "/privacy-policy" "$@"
  check_redirect "$base/privacy/" "/privacy-policy" "$@"
  check_redirect "$base/privacy?from=store" "/privacy-policy?from=store" "$@"
}

wait_for() {
  local url="$1"
  shift
  local i
  for i in 1 2 3 4 5 6 7 8 9 10; do
    if curl -sf -o /dev/null --max-redirs 0 "$@" "$url"; then
      return 0
    fi
    sleep 0.3
  done
  echo "❌ nginx did not become ready at $url"
  if [ -f "$WORKDIR/logs/error.log" ]; then
    echo "--- nginx error log ---"
    cat "$WORKDIR/logs/error.log" || true
  fi
  for name in "${CONTAINERS[@]}"; do
    echo "--- docker logs $name ---"
    docker logs "$name" || true
  done
  return 1
}

run_docker() {
  local name="$1"
  local conf="$2"
  local publish="$3"
  shift 3
  CONTAINERS+=("$name")
  docker run -d --name "$name" \
    --add-host backend:127.0.0.1 \
    -v "$conf:/etc/nginx/nginx.conf:ro" \
    -v "$MIME:/etc/nginx/mime.types.custom:ro" \
    -v "$WORKDIR/certs:/etc/letsencrypt/live/compareintel.com:ro" \
    -v "$HTML:/usr/share/nginx/html:ro" \
    -p "$publish" \
    nginx:alpine >/dev/null
}

prepare_local_conf() {
  local src="$1"
  local dest="$2"
  local nginx_version
  nginx_version="$(nginx -v 2>&1 | sed -n 's/.*nginx\///p')"
  {
    echo "pid $WORKDIR/nginx.pid;"
    echo "error_log $WORKDIR/logs/error.log warn;"
    sed -e '/^pid /d' \
        -e '/^error_log /d' \
        -e "s|/usr/share/nginx/html|$HTML|g" \
        -e "s|http://backend:8000|http://127.0.0.1:9|g" \
        -e "s|/etc/letsencrypt/live/compareintel.com|$WORKDIR/certs|g" \
        -e "s|/etc/nginx/mime.types.custom|$MIME|g" \
        -e "s/listen 8080;/listen 127.0.0.1:18080;/" \
        -e "s/listen 80;/listen 127.0.0.1:18080;/" \
        -e "s/listen 443 ssl;/listen 127.0.0.1:18443 ssl;/" \
        -e "/http2 on;/d" \
        -e "s/gzip_static on;/# gzip_static on;/" \
        -e "s/ssl_stapling on;/# ssl_stapling on;/" \
        -e "s/ssl_stapling_verify on;/# ssl_stapling_verify on;/" \
        -e "s|access_log /dev/stdout;|access_log off;|" \
        -e "s|^http {|http {\n    access_log off;\n    client_body_temp_path $WORKDIR/cache/client;\n    proxy_temp_path $WORKDIR/cache/proxy;\n    fastcgi_temp_path $WORKDIR/cache/fastcgi;\n    uwsgi_temp_path $WORKDIR/cache/uwsgi;\n    scgi_temp_path $WORKDIR/cache/scgi;|" \
        "$src"
  } >"$dest"
  if ! nginx -t -e stderr -c "$dest"; then
    echo "❌ nginx -t failed for $src (local nginx $nginx_version)"
    exit 1
  fi
}

if [ "$have_docker" -eq 1 ]; then
  echo "Using docker nginx:alpine"
  run_docker compareintel-nginx-prod-status "$PROD_CONF" "127.0.0.1:18080:8080"
  wait_for "http://127.0.0.1:18080/"
  assert_routes "http://127.0.0.1:18080"
  docker rm -f compareintel-nginx-prod-status >/dev/null
  run_docker compareintel-nginx-ssl-status "$SSL_CONF" "127.0.0.1:18443:443"
  wait_for "https://compareintel.com:18443/" -k --resolve compareintel.com:18443:127.0.0.1
  assert_routes "https://compareintel.com:18443" -k --resolve compareintel.com:18443:127.0.0.1
else
  echo "Using local nginx"
  prepare_local_conf "$PROD_CONF" "$WORKDIR/prod.conf"
  nginx -e stderr -c "$WORKDIR/prod.conf"
  NGINX_PID="$(cat "$WORKDIR/nginx.pid")"
  wait_for "http://127.0.0.1:18080/"
  assert_routes "http://127.0.0.1:18080"
  kill "$NGINX_PID" >/dev/null 2>&1 || true
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    kill -0 "$NGINX_PID" >/dev/null 2>&1 || break
    sleep 0.1
  done
  NGINX_PID=""

  prepare_local_conf "$SSL_CONF" "$WORKDIR/ssl.conf"
  nginx -e stderr -c "$WORKDIR/ssl.conf"
  NGINX_PID="$(cat "$WORKDIR/nginx.pid")"
  wait_for "https://compareintel.com:18443/" -k --resolve compareintel.com:18443:127.0.0.1
  assert_routes "https://compareintel.com:18443" -k --resolve compareintel.com:18443:127.0.0.1
fi

if [ "$FAIL" -ne 0 ]; then
  echo "❌ nginx SPA status check failed"
  if [ -f "$WORKDIR/logs/error.log" ]; then
    echo "--- nginx error log ---"
    cat "$WORKDIR/logs/error.log"
  fi
  exit 1
fi

echo "✓ known routes return 200; unknown routes return 404; /privacy 301s to /privacy-policy"
