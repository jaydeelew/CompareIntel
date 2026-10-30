#!/bin/bash
# Shared utilities for deploy scripts.

_UTILS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${PROJECT_DIR:-$(cd "$_UTILS_DIR/../.." && pwd)}"
BACKUP_DIR="${BACKUP_DIR:-/home/ubuntu/backups}"
LOG_FILE="${LOG_FILE:-/home/ubuntu/compareintel-deploy.log}"
ENV_FILE="${ENV_FILE:-$PROJECT_DIR/backend/.env}"
CODE_CHANGED=false

msg() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"; }
ok() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] OK: $1" | tee -a "$LOG_FILE"; }
warn() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] WARN: $1" | tee -a "$LOG_FILE"; }
err() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1" | tee -a "$LOG_FILE"; }

command_exists() { command -v "$1" >/dev/null 2>&1; }

# Warn when the 2 GB production host is tight on disk or swap.
# Does not fail the deploy — operators still see a clear warning.
check_host_resources() {
    msg "Checking disk and memory pressure..."

    local disk_pct
    disk_pct=$(df -P / | awk 'NR==2 {gsub("%",""); print $5}')
    if [ -n "$disk_pct" ] && [ "$disk_pct" -ge 80 ]; then
        warn "Disk usage ${disk_pct}% (warns above 80%). Run docker image prune / builder prune, or ./deploy-production.sh will prune dangling images after a successful deploy."
    elif [ -n "$disk_pct" ]; then
        ok "Disk usage ${disk_pct}%"
    else
        warn "Could not determine disk usage"
    fi

    local mem_total mem_used mem_avail
    mem_total=$(free -m | awk '/Mem:/ {print $2}')
    mem_used=$(free -m | awk '/Mem:/ {print $3}')
    mem_avail=$(free -m | awk '/Mem:/ {print $7}')
    if [ -n "$mem_total" ]; then
        ok "Memory: ${mem_used}MB used / ${mem_total}MB total (${mem_avail:-?}MB available)"
    else
        warn "Could not determine memory usage"
    fi

    local swap_total swap_used swap_pct
    swap_total=$(free -m | awk '/Swap:/ {print $2}')
    swap_used=$(free -m | awk '/Swap:/ {print $3}')
    if [ -z "$swap_total" ] || [ "$swap_total" -le 0 ]; then
        ok "No swap configured"
    else
        swap_pct=$(( swap_used * 100 / swap_total ))
        # Heavily used: >= 50% of swap, or >= 256MB used (material on a 2 GB host).
        if [ "$swap_pct" -ge 50 ] || [ "$swap_used" -ge 256 ]; then
            warn "Swap heavily used: ${swap_used}MB / ${swap_total}MB (${swap_pct}%) — host may be under memory pressure"
        else
            ok "Swap: ${swap_used}MB / ${swap_total}MB (${swap_pct}%)"
        fi
    fi
}

# After a successful deploy, reclaim disk without touching running containers or volumes.
# Only dangling (untagged) images are removed — :current, :previous, and SHA tags stay.
prune_dangling_docker_artifacts() {
    msg "Pruning dangling Docker images and build cache (not containers, volumes, or tagged releases)..."
    docker image prune -f || warn "Dangling image prune failed"
    docker builder prune -f || warn "Build cache prune failed"
    ok "Docker dangling images and build cache pruned"
}

service_running() {
    cd "$PROJECT_DIR"
    docker compose -f docker-compose.ssl.yml ps --services --filter "status=running" 2>/dev/null | grep -q "$1"
}

service_completed() {
    cd "$PROJECT_DIR"
    CONTAINERS=$(docker compose -f docker-compose.ssl.yml ps -a --format "{{.Name}}" 2>/dev/null | grep -i "$1" || true)
    [ -z "$CONTAINERS" ] && return 1
    for container in $CONTAINERS; do
        EXIT_CODE=$(docker inspect "$container" --format='{{.State.ExitCode}}' 2>/dev/null || echo "1")
        [ "$EXIT_CODE" = "0" ] && return 0
    done
    return 1
}

load_env() {
    if [ -f "$ENV_FILE" ]; then
        msg "Loading environment from $ENV_FILE"
        set -a
        source <(grep -v '^\s*#' "$ENV_FILE" | grep -v '^\s*$')
        set +a
        ok "Environment loaded"
    else
        warn "Environment file not found: $ENV_FILE"
    fi
}
