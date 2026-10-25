#!/bin/bash
# Comprehensive rollback script for CompareIntel
# Handles both application (Docker image) and database rollback

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${PROJECT_DIR:-/home/ubuntu/CompareIntel}"
BACKUP_DIR="${BACKUP_DIR:-/home/ubuntu/backups}"
ROLLBACK_STATE_FILE="${ROLLBACK_STATE_FILE:-/home/ubuntu/.compareintel-rollback-state}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"; }
ok() { echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] OK: $1${NC}"; }
warn() { echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] WARN: $1${NC}"; }
err() { echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"; }
info() { echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')] INFO: $1${NC}"; }

# Save current deployment state
save_deployment_state() {
    log "Saving current deployment state..."
    cd "$PROJECT_DIR"
    
    local state_data=$(cat <<EOF
TIMESTAMP=$(date +%s)
DATE=$(date '+%Y-%m-%d %H:%M:%S')
GIT_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
GIT_BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
BACKEND_IMAGE=$(docker compose -f docker-compose.ssl.yml images backend -q 2>/dev/null || echo "unknown")
NGINX_IMAGE=$(docker compose -f docker-compose.ssl.yml images nginx -q 2>/dev/null || echo "unknown")
REDIS_IMAGE=$(docker compose -f docker-compose.ssl.yml images redis -q 2>/dev/null || echo "unknown")
EOF
)
    
    echo "$state_data" > "$ROLLBACK_STATE_FILE"
    ok "Deployment state saved"
}

# Load previous deployment state
load_previous_state() {
    if [ ! -f "$ROLLBACK_STATE_FILE" ]; then
        warn "No previous deployment state found"
        return 1
    fi
    
    source "$ROLLBACK_STATE_FILE"
    info "Previous deployment state loaded"
    info "  Timestamp: $DATE"
    info "  Git commit: $GIT_COMMIT"
    info "  Git branch: $GIT_BRANCH"
}

# Rollback application to previous git commit
rollback_app_git() {
    log "Rolling back application to previous git commit..."
    cd "$PROJECT_DIR"
    
    load_previous_state || {
        err "Cannot rollback without previous state"
        return 1
    }
    
    if [ "$GIT_COMMIT" = "unknown" ]; then
        err "Previous git commit not recorded"
        return 1
    fi
    
    warn "⚠️  Rolling back to commit: $GIT_COMMIT"
    read -p "Continue? (yes/no): " confirm
    [ "$confirm" != "yes" ] && { err "Rollback cancelled"; return 1; }
    
    # Stash any local changes
    git stash
    
    # Checkout previous commit
    git checkout "$GIT_COMMIT" || {
        err "Failed to checkout previous commit"
        return 1
    }
    
    ok "Git rollback completed"
}

# Rollback application using Docker image tags
rollback_app_docker() {
    log "Rolling back Docker images..."
    cd "$PROJECT_DIR"
    
    # List recent images
    info "Recent backend images:"
    docker images | grep -E "compareintel-backend|compareintel_backend" | head -5
    echo ""
    info "Recent nginx images:"
    docker images | grep -E "compareintel-nginx|compareintel_nginx" | head -5
    echo ""
    
    read -p "Enter backend image tag to rollback to (or 'skip'): " backend_tag
    read -p "Enter nginx image tag to rollback to (or 'skip'): " nginx_tag
    
    if [ "$backend_tag" != "skip" ] && [ -n "$backend_tag" ]; then
        log "Tagging backend image for rollback..."
        docker tag "$backend_tag" compareintel-backend:rollback || {
            err "Failed to tag backend image"
            return 1
        }
    fi
    
    if [ "$nginx_tag" != "skip" ] && [ -n "$nginx_tag" ]; then
        log "Tagging nginx image for rollback..."
        docker tag "$nginx_tag" compareintel-nginx:rollback || {
            err "Failed to tag nginx image"
            return 1
        }
    fi
    
    log "Stopping services..."
    docker compose -f docker-compose.ssl.yml down
    
    log "Starting services with rolled back images..."
    docker compose -f docker-compose.ssl.yml up -d || {
        err "Failed to start services"
        return 1
    }
    
    ok "Docker image rollback completed"
}

# Rollback database to previous backup
rollback_database() {
    log "Rolling back database..."
    
    # List recent backups
    info "Recent backups:"
    ls -lht "$BACKUP_DIR"/daily/compareintel-*.sql* 2>/dev/null | head -5
    echo ""
    
    read -p "Enter backup file path (or 'latest' for most recent): " backup_input
    
    local backup_file=""
    if [ "$backup_input" = "latest" ]; then
        backup_file=$(ls -t "$BACKUP_DIR"/daily/compareintel-*.sql* 2>/dev/null | head -1)
        if [ -z "$backup_file" ]; then
            err "No backups found"
            return 1
        fi
        info "Using latest backup: $backup_file"
    else
        backup_file="$backup_input"
    fi
    
    if [ ! -f "$backup_file" ]; then
        err "Backup file not found: $backup_file"
        return 1
    fi
    
    warn "⚠️  WARNING: This will restore the database from backup!"
    warn "⚠️  All data after the backup will be LOST!"
    echo ""
    read -p "Type 'RESTORE' to confirm database rollback: " confirm
    
    if [ "$confirm" != "RESTORE" ]; then
        err "Database rollback cancelled"
        return 1
    fi
    
    # Call restore script
    bash "$SCRIPT_DIR/../restore/postgres-restore.sh" automated "$backup_file" || {
        err "Database restore failed"
        return 1
    }
    
    ok "Database rollback completed"
}

# Rollback database migrations
rollback_migrations() {
    log "Rolling back database migrations..."
    
    cd "$PROJECT_DIR"
    
    # Load environment
    if [ -f "backend/.env" ]; then
        set -a
        source <(grep -v '^\s*#' backend/.env | grep -v '^\s*$')
        set +a
    fi
    
    info "Current migration status:"
    cd backend && alembic current
    
    echo ""
    read -p "How many migrations to rollback? (number or 'base' for all): " steps
    
    warn "⚠️  Rolling back $steps migration(s)"
    read -p "Continue? (yes/no): " confirm
    [ "$confirm" != "yes" ] && { err "Migration rollback cancelled"; return 1; }
    
    if [ "$steps" = "base" ]; then
        alembic downgrade base || {
            err "Migration rollback failed"
            return 1
        }
    else
        alembic downgrade -$steps || {
            err "Migration rollback failed"
            return 1
        }
    fi
    
    ok "Migration rollback completed"
}

# Full rollback procedure
full_rollback() {
    warn "=== FULL ROLLBACK PROCEDURE ==="
    warn "This will rollback both application and database"
    echo ""
    
    read -p "Continue with full rollback? (yes/no): " confirm
    [ "$confirm" != "yes" ] && { err "Full rollback cancelled"; exit 1; }
    
    # Step 1: Save current state
    save_deployment_state
    
    # Step 2: Stop services
    log "Stopping services..."
    cd "$PROJECT_DIR"
    docker compose -f docker-compose.ssl.yml down
    
    # Step 3: Rollback git
    rollback_app_git || warn "Git rollback failed or skipped"
    
    # Step 4: Rollback database
    rollback_database || warn "Database rollback failed or skipped"
    
    # Step 5: Rebuild and start services
    log "Rebuilding services..."
    docker compose -f docker-compose.ssl.yml up -d --build || {
        err "Failed to restart services"
        exit 1
    }
    
    # Step 6: Wait for health checks
    log "Waiting for services to be healthy..."
    sleep 10
    
    # Step 7: Verify
    log "Verifying services..."
    docker compose -f docker-compose.ssl.yml ps
    
    ok "=== FULL ROLLBACK COMPLETED ==="
}

# Quick rollback (app only, last commit)
quick_rollback() {
    warn "=== QUICK ROLLBACK (Application Only) ==="
    echo ""
    
    save_deployment_state
    
    cd "$PROJECT_DIR"
    docker compose -f docker-compose.ssl.yml down
    
    rollback_app_git || exit 1
    
    log "Rebuilding services..."
    docker compose -f docker-compose.ssl.yml up -d --build || {
        err "Failed to restart services"
        exit 1
    }
    
    ok "Quick rollback completed"
}

# Show rollback status
show_status() {
    info "=== CURRENT STATUS ==="
    echo ""
    
    if [ -f "$ROLLBACK_STATE_FILE" ]; then
        info "Previous deployment state:"
        cat "$ROLLBACK_STATE_FILE"
        echo ""
    else
        warn "No previous deployment state found"
        echo ""
    fi
    
    cd "$PROJECT_DIR"
    
    info "Current git status:"
    git log -1 --oneline
    echo ""
    
    info "Running services:"
    docker compose -f docker-compose.ssl.yml ps
    echo ""
    
    info "Available backups:"
    echo "Daily (last 5):"
    ls -lht "$BACKUP_DIR"/daily/compareintel-*.sql* 2>/dev/null | head -5
    echo ""
    echo "Weekly (last 5):"
    ls -lht "$BACKUP_DIR"/weekly/compareintel-*.sql* 2>/dev/null | head -5
}

# Main menu
main() {
    case "${1:-menu}" in
        full)
            full_rollback
            ;;
        quick)
            quick_rollback
            ;;
        app-git)
            save_deployment_state
            rollback_app_git
            ;;
        app-docker)
            rollback_app_docker
            ;;
        database)
            rollback_database
            ;;
        migrations)
            rollback_migrations
            ;;
        status)
            show_status
            ;;
        save-state)
            save_deployment_state
            ;;
        menu|*)
            echo "CompareIntel Rollback Tool"
            echo ""
            echo "Usage: $0 {command}"
            echo ""
            echo "Commands:"
            echo "  full           - Full rollback (app + database)"
            echo "  quick          - Quick app rollback (last git commit)"
            echo "  app-git        - Rollback app to previous git commit"
            echo "  app-docker     - Rollback using Docker image tags"
            echo "  database       - Rollback database from backup"
            echo "  migrations     - Rollback database migrations"
            echo "  status         - Show current status and available rollback points"
            echo "  save-state     - Save current deployment state"
            echo ""
            exit 1
            ;;
    esac
}

main "$@"
