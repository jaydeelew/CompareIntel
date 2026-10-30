#!/bin/bash
# Rollback deployment using comprehensive rollback tool.
# Default: one-command redeploy of :previous image tags (no rebuild).

rollback_deployment() {
    local mode="${1:-previous}"
    shift || true

    if [ -f "$SCRIPT_DIR/../rollback/rollback.sh" ]; then
        case "$mode" in
            previous|"")
                bash "$SCRIPT_DIR/../rollback/rollback.sh" previous "$@"
                ;;
            --with-migrations)
                bash "$SCRIPT_DIR/../rollback/rollback.sh" previous --with-migrations "$@"
                ;;
            *)
                bash "$SCRIPT_DIR/../rollback/rollback.sh" "$mode" "$@"
                ;;
        esac
        return
    fi

    # Fallback: restart current compose services without rebuild
    cd "$PROJECT_DIR"
    docker compose -f "${COMPOSE_FILE:-docker-compose.ssl.yml}" down
    msg "Available backups:"
    ls -lt "$BACKUP_DIR"/compareintel-backup-* 2>/dev/null | head -5
    LATEST_BACKUP=$(ls -t "$BACKUP_DIR"/compareintel-backup-* 2>/dev/null | head -1)
    [ -n "$LATEST_BACKUP" ] && warn "To restore: see scripts/restore/postgres-restore.sh"
    docker compose -f "${COMPOSE_FILE:-docker-compose.ssl.yml}" up -d
    warn "Rollback completed. Verify application status."
}
