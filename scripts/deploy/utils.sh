#!/bin/bash
# Shared utilities for deploy scripts.

PROJECT_DIR="${PROJECT_DIR:-/home/ubuntu/CompareIntel}"
BACKUP_DIR="${BACKUP_DIR:-/home/ubuntu/backups}"
LOG_FILE="${LOG_FILE:-/home/ubuntu/compareintel-deploy.log}"
ENV_FILE="${ENV_FILE:-$PROJECT_DIR/backend/.env}"
CODE_CHANGED=false

msg() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"; }
ok() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] OK: $1" | tee -a "$LOG_FILE"; }
warn() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] WARN: $1" | tee -a "$LOG_FILE"; }
err() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1" | tee -a "$LOG_FILE"; }

command_exists() { command -v "$1" >/dev/null 2>&1; }

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
