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

# Probe backend /health. Prints nothing secret; returns 0 if the body contains "healthy".
probe_backend_health() {
    local body=""
    body=$(docker compose -f docker-compose.ssl.yml exec -T backend \
        curl -fsS --max-time 5 http://localhost:8000/health 2>/dev/null || true)
    if echo "$body" | grep -q "healthy"; then
        return 0
    fi
    body=$(curl -fsS --max-time 5 -k https://localhost/api/health 2>/dev/null || true)
    if echo "$body" | grep -q "healthy"; then
        return 0
    fi
    return 1
}

# Retry /health for HEALTH_TIMEOUT_SECS. Fail if backend is restarting/unhealthy
# or if /health never passes. Empty OPENROUTER_API_KEY raises OpenRouterConfigError
# at boot and crash-loops the backend.
wait_for_backend_health() {
    local elapsed=0
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
        sleep "$HEALTH_POLL_SECS"
        elapsed=$((elapsed + HEALTH_POLL_SECS))
    done
    err "Backend /health did not become healthy within ${HEALTH_TIMEOUT_SECS}s"
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
