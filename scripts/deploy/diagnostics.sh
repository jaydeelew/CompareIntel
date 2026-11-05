#!/bin/bash
# Comprehensive READ-ONLY diagnostics dump for debugging production.
# Safe to run from GitHub mobile — no state changes, no rebuilds, no migrations.

run_diagnostics() {
    cd "$PROJECT_DIR"
    msg "Production Diagnostics - READ-ONLY"
    echo ""
    
    # Section 1: Compose / containers
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📦 COMPOSE / CONTAINERS"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    docker compose -f docker-compose.ssl.yml ps || warn "Failed to get compose status"
    echo ""
    
    # Section 2: Image tags
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "🏷️  IMAGE TAGS"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # Show all backend images (current, previous, SHA tags)
    echo "Backend images:"
    docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.Size}}" | \
        grep -E "REPOSITORY|compareintel-backend" || warn "No backend images found"
    echo ""
    
    # Show which backend image is actually running
    echo "Backend running:"
    local backend_cid
    backend_cid=$(service_container_id backend 2>/dev/null || echo "")
    if [ -n "$backend_cid" ]; then
        docker inspect --format '{{.Image}} ({{.Config.Image}})' "$backend_cid" 2>/dev/null || \
            warn "Could not inspect backend container"
    else
        warn "Backend container not found"
    fi
    echo ""
    
    # Show all nginx images (current, previous, SHA tags)
    echo "Nginx images:"
    docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.Size}}" | \
        grep -E "REPOSITORY|compareintel-nginx" || warn "No nginx images found"
    echo ""
    
    # Show which nginx image is actually running
    echo "Nginx running:"
    local nginx_cid
    nginx_cid=$(service_container_id nginx 2>/dev/null || echo "")
    if [ -n "$nginx_cid" ]; then
        docker inspect --format '{{.Image}} ({{.Config.Image}})' "$nginx_cid" 2>/dev/null || \
            warn "Could not inspect nginx container"
    else
        warn "Nginx container not found"
    fi
    echo ""
    
    # Section 3: Health probes
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "🏥 HEALTH PROBES"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # In-container backend health (same as verify.sh uses)
    echo "In-container backend: http://localhost:8000/health"
    if [ -n "$backend_cid" ] && service_running backend 2>/dev/null; then
        local health_body health_exit
        health_body=$(docker compose -f docker-compose.ssl.yml exec -T backend \
            python -c "import urllib.request; print(urllib.request.urlopen('http://localhost:8000/health', timeout=5).read().decode())" \
            2>&1) || health_exit=$?
        if [ "${health_exit:-0}" -eq 0 ]; then
            echo "✓ Status: OK"
            echo "$health_body" | head -20
        else
            echo "✗ Status: FAILED (exit ${health_exit:-1})"
            echo "$health_body" | head -20
        fi
    else
        warn "Backend not running, skipping in-container probe"
    fi
    echo ""
    
    # Public health check via HTTPS (with redirect visibility)
    echo "Public: https://compareintel.com/health"
    local public_health public_exit public_redirect
    public_health=$(curl -fsS -w "\nHTTP_CODE: %{http_code}\nREDIRECT_URL: %{redirect_url}\n" \
        --max-time 10 https://compareintel.com/health 2>&1) || public_exit=$?
    if [ "${public_exit:-0}" -eq 0 ]; then
        echo "✓ Status: OK"
        echo "$public_health"
    else
        echo "✗ Status: FAILED (exit ${public_exit:-1})"
        echo "$public_health" | head -20
    fi
    echo ""
    
    # Public www variant
    echo "Public: https://www.compareintel.com/health"
    local public_www_health public_www_exit
    public_www_health=$(curl -fsS -w "\nHTTP_CODE: %{http_code}\nREDIRECT_URL: %{redirect_url}\n" \
        --max-time 10 https://www.compareintel.com/health 2>&1) || public_www_exit=$?
    if [ "${public_www_exit:-0}" -eq 0 ]; then
        echo "✓ Status: OK"
        echo "$public_www_health"
    else
        echo "✗ Status: FAILED (exit ${public_www_exit:-1})"
        echo "$public_www_health" | head -20
    fi
    echo ""
    
    # Section 4: Recent logs
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📋 RECENT LOGS"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    echo "Backend (last 100 lines with timestamps):"
    docker compose -f docker-compose.ssl.yml logs --tail=100 backend 2>/dev/null || \
        warn "Failed to get backend logs"
    echo ""
    
    echo "Nginx (last 100 lines with timestamps):"
    docker compose -f docker-compose.ssl.yml logs --tail=100 nginx 2>/dev/null || \
        warn "Failed to get nginx logs"
    echo ""
    
    echo "Redis (last 50 lines with timestamps):"
    docker compose -f docker-compose.ssl.yml logs --tail=50 redis 2>/dev/null || \
        warn "Failed to get redis logs"
    echo ""
    
    # Section 5: Host resources
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "💻 HOST RESOURCES"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    echo "Disk usage:"
    df -h / 2>/dev/null || warn "Failed to get disk usage"
    echo ""
    
    echo "Memory:"
    free -h 2>/dev/null || warn "Failed to get memory info"
    echo ""
    
    echo "Load average:"
    uptime 2>/dev/null || warn "Failed to get load average"
    echo ""
    
    # Section 6: Git / deploy identity
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "🔍 GIT / DEPLOY IDENTITY"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    echo "Current checkout:"
    if [ -d .git ]; then
        echo "Branch: $(git branch --show-current 2>/dev/null || echo 'unknown')"
        echo "Commit: $(git rev-parse HEAD 2>/dev/null || echo 'unknown')"
        echo "Short:  $(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
        echo ""
        echo "Last commit:"
        git log -1 --oneline 2>/dev/null || warn "Failed to get last commit"
    else
        warn "Not a git repository"
    fi
    echo ""
    
    # Deploy marker files (if they exist)
    if [ -f "$LAST_DEPLOYED_COMMIT_FILE" ]; then
        echo "Last deployed commit (from marker file):"
        cat "$LAST_DEPLOYED_COMMIT_FILE" 2>/dev/null || warn "Failed to read marker file"
        echo ""
    fi
    
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    ok "Diagnostics complete"
    echo ""
    echo "NOTE: This was a READ-ONLY dump. No state was changed."
}
