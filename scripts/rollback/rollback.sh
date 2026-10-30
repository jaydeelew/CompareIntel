#!/bin/bash
# Comprehensive rollback script for CompareIntel
# Handles both application (Docker image) and database rollback

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${PROJECT_DIR:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
BACKUP_DIR="${BACKUP_DIR:-/home/ubuntu/backups}"
ROLLBACK_STATE_FILE="${ROLLBACK_STATE_FILE:-/home/ubuntu/.compareintel-rollback-state}"

# shellcheck disable=SC1091
source "$SCRIPT_DIR/../deploy/image-tags.sh"

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
IMAGE_TAG=${IMAGE_TAG:-current}
BACKEND_IMAGE=$(compose images backend -q 2>/dev/null || echo "unknown")
NGINX_IMAGE=$(compose images nginx -q 2>/dev/null || echo "unknown")
REDIS_IMAGE=$(compose images redis -q 2>/dev/null || echo "unknown")
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
    compose down
    
    log "Starting services with rolled back images..."
    compose up -d || {
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
    compose down
    
    # Step 3: Rollback git
    rollback_app_git || warn "Git rollback failed or skipped"
    
    # Step 4: Rollback database
    rollback_database || warn "Database rollback failed or skipped"
    
    # Step 5: Rebuild and start services
    log "Rebuilding services..."
    compose up -d --build || {
        err "Failed to restart services"
        exit 1
    }
    
    # Step 6: Wait for health checks
    log "Waiting for services to be healthy..."
    sleep 10
    
    # Step 7: Verify
    log "Verifying services..."
    compose ps
    
    ok "=== FULL ROLLBACK COMPLETED ==="
}

# Quick rollback (app only, last commit)
quick_rollback() {
    warn "=== QUICK ROLLBACK (Application Only) ==="
    echo ""
    
    save_deployment_state
    
    cd "$PROJECT_DIR"
    compose down
    
    rollback_app_git || exit 1
    
    log "Rebuilding services..."
    compose up -d --build || {
        err "Failed to restart services"
        exit 1
    }
    
    ok "Quick rollback completed"
}

# One-command rollback: redeploy :previous images without rebuilding.
# Alembic downgrade is opt-in only (--with-migrations) and requires typing DOWNGRADE.
rollback_previous_tag() {
    local with_migrations=false
    local arg
    for arg in "$@"; do
        if [ "$arg" = "--with-migrations" ]; then
            with_migrations=true
        fi
    done

    warn "=== ROLLBACK TO PREVIOUS IMAGE TAG (no rebuild) ==="
    cd "$PROJECT_DIR"

    local repo missing=0
    for repo in $(release_image_repos); do
        if ! image_exists "${repo}:previous"; then
            err "No ${repo}:previous image. Deploy at least two tagged releases first."
            missing=1
        fi
    done
    [ "$missing" -eq 0 ] || return 1

    local prev_backend_id
    prev_backend_id=$(docker images -q "${IMAGE_BACKEND}:previous")
    info "Images before rollback:"
    docker images --format 'table {{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.CreatedSince}}' \
        | grep -E "compareintel-(backend|nginx)|REPOSITORY" || true
    echo ""

    # Swap first so :current is the previous release. Then `up -d` (no --build)
    # uses the compose default IMAGE_TAG=current and will not roll forward on restart.
    log "Swapping :current and :previous tags..."
    swap_current_and_previous_tags
    export IMAGE_TAG=current
    log "Starting services from :current (was :previous) without rebuild..."
    compose up -d || {
        err "Failed to start services from previous image tags"
        return 1
    }

    local running_id prev_short running_short
    running_id=$(compose images backend -q 2>/dev/null || true)
    prev_short="${prev_backend_id#sha256:}"
    prev_short="${prev_short:0:12}"
    running_short="${running_id#sha256:}"
    running_short="${running_short:0:12}"
    if [ -n "$prev_short" ] && [ -n "$running_short" ] && [ "$running_short" != "$prev_short" ]; then
        warn "Running backend image $running_id does not match previous id $prev_backend_id"
    else
        info "Backend image id ${running_short:-$prev_backend_id} is serving (was :previous)"
    fi

    log "Waiting for health checks..."
    sleep 8
    compose ps
    verify_backend_health || warn "Health check inconclusive; inspect logs"

    if [ "$with_migrations" = true ]; then
        offer_alembic_downgrade
    else
        info "Alembic downgrade skipped (opt-in only). Re-run with --with-migrations to consider it."
    fi

    ok "Previous-tag rollback completed"
}

verify_backend_health() {
    local body=""
    body=$(compose exec -T backend \
        python -c "import urllib.request; print(urllib.request.urlopen('http://localhost:8000/health', timeout=5).read().decode())" \
        2>/dev/null || true)
    if echo "$body" | grep -q "healthy"; then
        ok "Backend /health: $body"
        return 0
    fi
    if curl -fsS http://localhost:8080/api/health 2>/dev/null | grep -q "healthy"; then
        ok "Backend /health via nginx :8080"
        return 0
    fi
    if curl -fsSk https://localhost/api/health 2>/dev/null | grep -q "healthy"; then
        ok "Backend /health via nginx :443"
        return 0
    fi
    return 1
}

offer_alembic_downgrade() {
    warn "Alembic downgrade is destructive and is NOT run unless you type DOWNGRADE."
    if [ ! -t 0 ]; then
        err "No TTY: refusing alembic downgrade. Re-run interactively with --with-migrations."
        return 1
    fi
    echo ""
    read -r -p "Type 'DOWNGRADE' to run 'alembic downgrade -1' (anything else skips): " confirm
    if [ "$confirm" != "DOWNGRADE" ]; then
        info "Alembic downgrade skipped"
        return 0
    fi
    cd "$PROJECT_DIR"
    if [ -f "backend/.env" ]; then
        set -a
        source <(grep -v '^\s*#' backend/.env | grep -v '^\s*$')
        set +a
    fi
    (cd backend && alembic downgrade -1) || {
        err "alembic downgrade -1 failed"
        return 1
    }
    ok "alembic downgrade -1 completed"
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
    compose ps
    echo ""
    
    info "Release image tags:"
    docker images --format 'table {{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.CreatedSince}}' \
        | grep -E "compareintel-(backend|nginx)|REPOSITORY" || true
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
        previous)
            shift
            rollback_previous_tag "$@"
            ;;
        menu|*)
            echo "CompareIntel Rollback Tool"
            echo ""
            echo "Usage: $0 {command}"
            echo ""
            echo "Commands:"
            echo "  previous       - Redeploy :previous image tags (no rebuild)"
            echo "  previous --with-migrations"
            echo "                 - Same, then prompt to confirm alembic downgrade -1"
            echo "  full           - Full rollback (app + database)"
            echo "  quick          - Quick app rollback (last git commit + rebuild)"
            echo "  app-git        - Rollback app to previous git commit"
            echo "  app-docker     - Rollback using Docker image tags (interactive)"
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
