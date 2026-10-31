#!/bin/bash
# nginx -t before apply, and reload when nginx.ssl.conf changes.

NGINX_SSL_CONF="${NGINX_SSL_CONF:-$PROJECT_DIR/nginx/nginx.ssl.conf}"
LAST_DEPLOYED_NGINX_HASH_FILE="${LAST_DEPLOYED_NGINX_HASH_FILE:-$PROJECT_DIR/.last_deployed_nginx_hash}"
# Set by detect_nginx_conf_change; read by deploy-production.sh.
# shellcheck disable=SC2034
NGINX_CONF_CHANGED=false

nginx_ssl_conf_hash() {
    file_sha256 "${1:-$NGINX_SSL_CONF}"
}

detect_nginx_conf_change() {
    local conf="${1:-$NGINX_SSL_CONF}"
    local current stored
    NGINX_CONF_CHANGED=false
    [ -f "$conf" ] || return 0
    current=$(nginx_ssl_conf_hash "$conf") || return 1
    if [ -f "$LAST_DEPLOYED_NGINX_HASH_FILE" ]; then
        stored=$(tr -d '[:space:]' < "$LAST_DEPLOYED_NGINX_HASH_FILE")
        if [ -n "$stored" ] && [ "$current" != "$stored" ]; then
            NGINX_CONF_CHANGED=true
            msg "nginx/nginx.ssl.conf changed since last deploy; nginx will be reloaded"
        fi
    fi
}

record_nginx_conf_hash() {
    local conf="${1:-$NGINX_SSL_CONF}"
    local current
    [ -f "$conf" ] || return 0
    current=$(nginx_ssl_conf_hash "$conf") || return 1
    echo "$current" > "$LAST_DEPLOYED_NGINX_HASH_FILE"
    ok "Recorded nginx.ssl.conf hash"
}

# Run nginx -t in the running nginx container. Does not apply a new config.
test_nginx_config() {
    cd "$PROJECT_DIR" || return 1
    if ! service_running nginx; then
        warn "nginx container is not running; skipping nginx -t"
        return 0
    fi
    msg "Testing nginx config (nginx -t)..."
    if docker compose -f docker-compose.ssl.yml exec -T nginx nginx -t; then
        ok "nginx -t passed"
        return 0
    fi
    err "nginx -t failed. Config was not applied."
    return 1
}

# Validate the bind-mounted nginx.ssl.conf before compose down / reload.
# The file is already on disk; nginx -t reads it without reloading.
test_nginx_config_before_apply() {
    cd "$PROJECT_DIR" || return 1
    if ! service_running nginx; then
        return 0
    fi
    test_nginx_config
}

reload_nginx() {
    cd "$PROJECT_DIR" || return 1
    if ! service_running nginx; then
        err "Cannot reload nginx: container is not running"
        return 1
    fi
    test_nginx_config || return 1
    msg "Reloading nginx..."
    if docker compose -f docker-compose.ssl.yml exec -T nginx nginx -s reload; then
        ok "nginx reloaded"
        return 0
    fi
    err "nginx reload failed"
    return 1
}

# Reload when nginx.ssl.conf changed (no-code-change deploy or restart).
reload_nginx_if_conf_changed() {
    local force="${1:-}"
    if [ "$force" != "force" ] && [ "$NGINX_CONF_CHANGED" != true ]; then
        return 0
    fi
    reload_nginx
}
