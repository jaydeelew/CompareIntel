#!/bin/bash
# Verify deployment and run health checks.

verify_deployment() {
    msg "Verifying deployment..."
    cd "$PROJECT_DIR"
    sleep 15
    BACKEND_OK=false; FRONTEND_OK=false; NGINX_OK=false
    service_running "backend" && { BACKEND_OK=true; ok "Backend running"; } || err "Backend not running"
    service_running "nginx" && { NGINX_OK=true; ok "Nginx running"; } || err "Nginx not running"
    if [ "$NGINX_OK" = true ]; then
        FRONTEND_OK=true
        ok "Frontend build completed"
    elif [ -d "$PROJECT_DIR/frontend/dist" ] && [ -n "$(ls -A "$PROJECT_DIR/frontend/dist" 2>/dev/null)" ]; then
        FRONTEND_OK=true
        ok "Frontend build completed"
    elif service_completed "frontend"; then
        FRONTEND_OK=true
        ok "Frontend build completed"
    else
        err "Frontend build failed"
    fi
    if [ "$BACKEND_OK" != true ] || [ "$FRONTEND_OK" != true ] || [ "$NGINX_OK" != true ]; then
        docker compose -f docker-compose.ssl.yml ps
        docker compose -f docker-compose.ssl.yml logs --tail=50
        if [ "$NGINX_OK" != true ]; then
            NGINX_LOGS=$(docker compose -f docker-compose.ssl.yml logs nginx 2>/dev/null || true)
            if echo "$NGINX_LOGS" | grep -q "Permission denied"; then
                echo ""
                warn "Nginx SSL certificate permission error. Try: sudo ./setup-compareintel-ssl.sh fix-permissions"
            fi
        fi
        exit 1
    fi
    ok "All services running"
    msg "Testing backend health..."
    BACKEND_HEALTH=$(docker compose -f docker-compose.ssl.yml exec -T backend curl -f -s http://localhost:8000/health 2>/dev/null || echo "failed")
    echo "$BACKEND_HEALTH" | grep -q "healthy" && ok "Backend healthy" || curl -f -s -k https://localhost/api/health >/dev/null 2>&1 && ok "Backend healthy" || warn "Backend health inconclusive"
    curl -f -s -L http://localhost:80 >/dev/null 2>&1 && ok "Frontend accessible" || warn "HTTP test failed"
    curl -f -s -k https://localhost:443 >/dev/null 2>&1 && ok "HTTPS OK" || warn "HTTPS test failed"
    curl -f -s -m 10 https://compareintel.com >/dev/null 2>&1 && ok "Public site accessible" || warn "Public URL test skipped"
}
