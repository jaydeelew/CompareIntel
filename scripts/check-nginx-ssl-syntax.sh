#!/usr/bin/env bash
# Validate nginx/nginx.ssl.conf with nginx -t using dummy certs.
# Prefers docker nginx:alpine (same family as frontend/Dockerfile prod).
# Set NGINX_T_REQUIRE=1 in CI so a missing runtime fails the job.
# Local check-ci.sh skips when neither docker nor nginx is installed.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONF="$REPO_ROOT/nginx/nginx.ssl.conf"
MIME="$REPO_ROOT/nginx/mime.types.custom"
REQUIRE="${NGINX_T_REQUIRE:-0}"

if [ ! -f "$CONF" ]; then
  echo "❌ missing $CONF"
  exit 1
fi
if [ ! -f "$MIME" ]; then
  echo "❌ missing $MIME"
  exit 1
fi

have_docker=0
have_nginx=0
command -v docker >/dev/null 2>&1 && have_docker=1
command -v nginx >/dev/null 2>&1 && have_nginx=1

if [ "$have_docker" -eq 0 ] && [ "$have_nginx" -eq 0 ]; then
  if [ "$REQUIRE" = "1" ]; then
    echo "❌ nginx -t required but neither docker nor nginx is available"
    exit 1
  fi
  echo "⚠️  nginx and docker not available; skipping nginx -t"
  exit 0
fi

WORKDIR="$(mktemp -d)"
cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

mkdir -p "$WORKDIR/certs"
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout "$WORKDIR/certs/privkey.pem" \
  -out "$WORKDIR/certs/fullchain.pem" \
  -days 1 -subj "/CN=compareintel.com" >/dev/null 2>&1
cp "$WORKDIR/certs/fullchain.pem" "$WORKDIR/certs/chain.pem"

# proxy_pass http://backend:8000 is compose DNS; resolve it for offline nginx -t.
if [ "$have_docker" -eq 1 ]; then
  docker run --rm \
    --add-host backend:127.0.0.1 \
    -v "$CONF:/etc/nginx/nginx.conf:ro" \
    -v "$MIME:/etc/nginx/mime.types.custom:ro" \
    -v "$WORKDIR/certs:/etc/letsencrypt/live/compareintel.com:ro" \
    nginx:alpine nginx -t
  echo "✓ nginx -t passed (docker nginx:alpine)"
  exit 0
fi

# Local nginx: rewrite absolute cert/mime paths and the compose hostname.
# Temp-file paths must be writable by the current user (package defaults are root-only).
mkdir -p "$WORKDIR/cache"
TMPCONF="$WORKDIR/nginx.conf"
{
  echo "pid $WORKDIR/nginx.pid;"
  echo "error_log stderr;"
  sed -e "s|/etc/letsencrypt/live/compareintel.com|$WORKDIR/certs|g" \
      -e "s|/etc/nginx/mime.types.custom|$MIME|g" \
      -e "s|http://backend:8000|http://127.0.0.1:8000|g" \
      -e "s/listen 80;/listen 18080;/" \
      -e "s/listen 443 ssl;/listen 18443 ssl;/" \
      -e "s|^http {|http {\n    access_log off;\n    client_body_temp_path $WORKDIR/cache/client;\n    proxy_temp_path $WORKDIR/cache/proxy;\n    fastcgi_temp_path $WORKDIR/cache/fastcgi;\n    uwsgi_temp_path $WORKDIR/cache/uwsgi;\n    scgi_temp_path $WORKDIR/cache/scgi;|" \
      "$CONF"
} > "$TMPCONF"

if nginx -t -e stderr -c "$TMPCONF"; then
  echo "✓ nginx -t passed (local nginx)"
  exit 0
fi

echo "❌ nginx -t failed"
exit 1
