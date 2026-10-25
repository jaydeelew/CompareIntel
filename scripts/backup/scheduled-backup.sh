#!/bin/bash
# Scheduled daily backup script for cron
# Add to crontab: 0 2 * * * /path/to/compareintel/scripts/backup/scheduled-backup.sh >> /var/log/compareintel-backup.log 2>&1

set -e

# Determine script location and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/home/ubuntu/backups}"
LOCK_FILE="/tmp/compareintel-backup.lock"
LOG_FILE="${LOG_FILE:-/var/log/compareintel-backup.log}"

# Logging functions
log() { 
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" 
    [ -w "$(dirname "$LOG_FILE")" ] && echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

ok() { log "OK: $1"; }
warn() { log "WARN: $1"; }
err() { log "ERROR: $1"; }

# Lock mechanism to prevent concurrent backups
acquire_lock() {
    if [ -f "$LOCK_FILE" ]; then
        local pid=$(cat "$LOCK_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            err "Backup already running (PID: $pid)"
            exit 1
        else
            warn "Removing stale lock file"
            rm -f "$LOCK_FILE"
        fi
    fi
    
    echo $$ > "$LOCK_FILE"
}

release_lock() {
    rm -f "$LOCK_FILE"
}

# Trap to ensure lock is released
trap release_lock EXIT

# Main execution
main() {
    log "=== Starting scheduled backup ==="
    
    acquire_lock
    
    # Change to project directory
    cd "$PROJECT_DIR"
    
    # Load environment variables
    if [ -f "backend/.env" ]; then
        log "Loading environment from backend/.env"
        set -a
        source <(grep -v '^\s*#' backend/.env | grep -v '^\s*$')
        set +a
    else
        warn "backend/.env not found"
    fi
    
    # Check if DATABASE_URL is set
    if [ -z "$DATABASE_URL" ]; then
        err "DATABASE_URL not set - cannot proceed with backup"
        exit 1
    fi
    
    # Run backup script
    if [ -f "$SCRIPT_DIR/postgres-backup.sh" ]; then
        bash "$SCRIPT_DIR/postgres-backup.sh" || {
            err "Backup script failed"
            exit 1
        }
    else
        err "Backup script not found: $SCRIPT_DIR/postgres-backup.sh"
        exit 1
    fi
    
    ok "=== Scheduled backup completed ==="
}

main "$@"
