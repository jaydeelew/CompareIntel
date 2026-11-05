#!/bin/bash
# Verify deployment and run health checks.
# Returns 1 on failure (does not exit) so callers can roll back.

HEALTH_TIMEOUT_SECS="${HEALTH_TIMEOUT_SECS:-75}"
HEALTH_POLL_SECS="${HEALTH_POLL_SECS:-5}"

dump_deploy_logs() {
    docker compose -f docker-compose.ssl.yml ps
    docker compose -f docker-compose.ssl.yml logs --tail=50
    if [ "${1:-}" = "nginx" ]; then
        local nginx_logs
        nginx_logs=$(docker compose -f docker-compose.ssl.yml logs nginx 2>/dev/null || true)
        if echo "$nginx_logs" | grep -q "Permission denied"; then
            echo ""
            warn "Nginx SSL certificate permission error. Try: sudo ./setup-compareintel-ssl.sh fix-permissions"
        fi
    fi
}

# Wait until a compose service is running, or fail if it is restarting.
wait_for_service_running() {
    local name="$1"
    local elapsed=0
    while [ "$elapsed" -le "$HEALTH_TIMEOUT_SECS" ]; do
        if [ "$name" = "backend" ] && backend_is_restarting_or_unhealthy; then
            err "Backend is restarting or unhealthy while waiting for the container"
            return 1
        fi
        if service_running "$name"; then
            return 0
        fi
        sleep "$HEALTH_POLL_SECS"
        elapsed=$((elapsed + HEALTH_POLL_SECS))
    done
    return 1
}

# Python probe run inside the backend container. Prints the /health body on
# success; on any failure prints one "probe-error: ..." line and exits 1.
# (The slim backend image has no curl, so urllib is the only portable client.)
BACKEND_HEALTH_PROBE_PY='import sys, urllib.request
try:
    print(urllib.request.urlopen("http://localhost:8000/health", timeout=5).read().decode())
except Exception as exc:
    print("probe-error: %s: %s" % (type(exc).__name__, exc))
    sys.exit(1)'

# Only a real {"status": "healthy"} body passes. A bare grep for "healthy" also
# matches {"status":"unhealthy"}, which health_check returns with HTTP 200 when
# the database query fails.
health_body_is_healthy() {
    printf '%s' "$1" | grep -Eq '"status"[[:space:]]*:[[:space:]]*"healthy"'
}

# Collapse to one short line and redact anything that looks like a credential
# before it reaches deploy logs.
sanitize_diag() {
    tail -n 3 \
        | tr '\r\n\t' '   ' \
        | sed -E \
            -e 's#(sk-[A-Za-z0-9_-]{6,})#[REDACTED]#g' \
            -e 's#([Bb]earer[[:space:]]+)[A-Za-z0-9._~+/=-]+#\1[REDACTED]#g' \
            -e 's#([A-Za-z_]*(KEY|TOKEN|SECRET|PASSWORD|DSN)[A-Za-z_]*[=:][[:space:]]*)[^[:space:]]+#\1[REDACTED]#Ig' \
        | cut -c1-"${HEALTH_DIAG_MAX_CHARS:-300}"
}

# Run the python probe through one transport (compose exec or docker exec).
# Sets HEALTH_PROBE_REASON; returns 0 only when the body reports status=healthy.
_probe_backend_via() {
    local label="$1"
    shift
    local out rc=0
    out=$("$@" python -c "$BACKEND_HEALTH_PROBE_PY" 2>&1) || rc=$?
    if [ "$rc" -eq 0 ] && health_body_is_healthy "$out"; then
        return 0
    fi
    HEALTH_PROBE_REASON="$label exit=$rc: $(printf '%s' "$out" | sanitize_diag)"
    [ -n "$out" ] || HEALTH_PROBE_REASON="$label exit=$rc: (no output)"
    return 1
}

# Probe the backend /health directly, bypassing nginx. Returns 0 on success.
# On failure sets HEALTH_PROBE_REASON (exit code + truncated, redacted output).
#
# nginx serves its own static `return 200 "healthy"` on /health, so an
# nginx-level request proves nothing about the backend; it is reported by
# nginx_health_diag for context only and never counts as a pass.
probe_backend_health() {
    HEALTH_PROBE_REASON=""
    local reasons=() cid
    if _probe_backend_via "compose exec" \
        docker compose -f docker-compose.ssl.yml exec -T backend; then
        return 0
    fi
    reasons+=("$HEALTH_PROBE_REASON")

    cid=$(service_container_id backend 2>/dev/null || true)
    if [ -n "$cid" ]; then
        if _probe_backend_via "docker exec" docker exec "$cid"; then
            return 0
        fi
        reasons+=("$HEALTH_PROBE_REASON")
    else
        reasons+=("docker exec: no backend container id")
    fi
    local r
    HEALTH_PROBE_REASON=""
    for r in "${reasons[@]}"; do
        HEALTH_PROBE_REASON="${HEALTH_PROBE_REASON:+$HEALTH_PROBE_REASON | }$r"
    done
    return 1
}

# Context only: what does nginx itself answer for /health (static) right now?
nginx_health_diag() {
    local out rc=0
    out=$(curl -sS --max-time 5 -k -o /dev/null -w 'http=%{http_code}' \
        --resolve compareintel.com:443:127.0.0.1 https://compareintel.com/health 2>&1) || rc=$?
    printf 'nginx https://compareintel.com/health (static, not a backend check) curl_exit=%s %s' \
        "$rc" "$(printf '%s' "$out" | sanitize_diag)"
}

# Retry /health for HEALTH_TIMEOUT_SECS. Fail if backend is restarting/unhealthy
# or if /health never passes. Empty OPENROUTER_API_KEY raises OpenRouterConfigError
# at boot and crash-loops the backend.
wait_for_backend_health() {
    local elapsed=0 last_reason=""
    msg "Waiting up to ${HEALTH_TIMEOUT_SECS}s for backend /health..."
    while [ "$elapsed" -le "$HEALTH_TIMEOUT_SECS" ]; do
        if backend_is_restarting_or_unhealthy; then
            err "Backend is restarting or unhealthy. Empty OPENROUTER_API_KEY causes OpenRouterConfigError and a crash loop."
            return 1
        fi
        if probe_backend_health; then
            ok "Backend /health passed after ${elapsed}s"
            return 0
        fi
        if [ "$HEALTH_PROBE_REASON" != "$last_reason" ]; then
            warn "Backend /health probe failed at ${elapsed}s: $HEALTH_PROBE_REASON"
            last_reason="$HEALTH_PROBE_REASON"
        fi
        sleep "$HEALTH_POLL_SECS"
        elapsed=$((elapsed + HEALTH_POLL_SECS))
    done
    err "Backend /health did not become healthy within ${HEALTH_TIMEOUT_SECS}s"
    err "Last probe failure: $last_reason"
    err "$(nginx_health_diag)"
    return 1
}

run_seo_verify_nonfatal() {
    local seo_script="$PROJECT_DIR/verify-seo-deployment.sh"
    if [ ! -x "$seo_script" ] && [ ! -f "$seo_script" ]; then
        return 0
    fi
    msg "Running SEO verification (non-fatal)..."
    if bash "$seo_script"; then
        ok "SEO verification passed"
    else
        warn "SEO verification failed (non-fatal; deploy is still considered successful)"
    fi
}

verify_deployment() {
    msg "Verifying deployment..."
    cd "$PROJECT_DIR" || return 1

    local backend_ok=false nginx_ok=false frontend_ok=false

    if wait_for_service_running backend; then
        if backend_is_restarting_or_unhealthy; then
            err "Backend is restarting or unhealthy"
        else
            backend_ok=true
            ok "Backend running"
        fi
    else
        err "Backend not running"
    fi

    if wait_for_service_running nginx; then
        nginx_ok=true
        ok "Nginx running"
    else
        err "Nginx not running"
    fi

    if [ "$nginx_ok" = true ]; then
        frontend_ok=true
        ok "Frontend build completed"
    elif [ -d "$PROJECT_DIR/frontend/dist" ] && [ -n "$(ls -A "$PROJECT_DIR/frontend/dist" 2>/dev/null)" ]; then
        frontend_ok=true
        ok "Frontend build completed"
    elif service_completed frontend; then
        frontend_ok=true
        ok "Frontend build completed"
    else
        err "Frontend build failed"
    fi

    if [ "$backend_ok" != true ] || [ "$frontend_ok" != true ] || [ "$nginx_ok" != true ]; then
        if [ "$nginx_ok" != true ]; then
            dump_deploy_logs nginx
        else
            dump_deploy_logs
        fi
        return 1
    fi
    ok "All services running"

    if ! wait_for_backend_health; then
        dump_deploy_logs
        return 1
    fi

    if ! test_nginx_config; then
        dump_deploy_logs nginx
        return 1
    fi

    if curl -f -s -L --max-time 10 http://localhost:80 >/dev/null 2>&1; then
        ok "Frontend accessible"
    else
        warn "HTTP test failed"
    fi
    if curl -f -s -k --max-time 10 https://localhost:443 >/dev/null 2>&1; then
        ok "HTTPS OK"
    else
        warn "HTTPS test failed"
    fi
    if curl -f -s -m 10 https://compareintel.com >/dev/null 2>&1; then
        ok "Public site accessible"
    else
        warn "Public URL test skipped"
    fi

    run_seo_verify_nonfatal
    return 0
}

# After a stack down/up, roll back to :previous if verify fails. Does not touch migrations.
verify_or_rollback() {
    if verify_deployment; then
        return 0
    fi
    err "Verification failed after bringing the new stack up. Rolling back to :previous images."
    err "Database migrations are left as-is (no automatic alembic downgrade)."
    if rollback_to_previous_images; then
        err "Rolled back to :previous after failed verification. The new release is not in service."
    else
        err "Automatic rollback to :previous failed. The site may be down. Run: ./deploy-production.sh rollback"
    fi
    return 1
}
