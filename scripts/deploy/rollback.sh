#!/bin/bash
# Rollback deployment using comprehensive rollback tool.
# Default: one-command redeploy of :previous image tags (no rebuild).

_rollback_tool() {
    echo "$PROJECT_DIR/scripts/rollback/rollback.sh"
}

# Redeploy :previous image tags. Never passes --with-migrations (used by auto-rollback).
rollback_to_previous_images() {
    local tool
    tool=$(_rollback_tool)
    if [ ! -f "$tool" ]; then
        err "Rollback script not found: $tool"
        return 1
    fi
    msg "Redeploying :previous image tags (no rebuild, no migration rollback)..."
    bash "$tool" previous
}

rollback_deployment() {
    local mode="${1:-previous}"
    shift || true

    local tool
    tool=$(_rollback_tool)
    if [ -f "$tool" ]; then
        case "$mode" in
            previous|"")
                bash "$tool" previous "$@"
                ;;
            --with-migrations)
                bash "$tool" previous --with-migrations "$@"
                ;;
            *)
                bash "$tool" "$mode" "$@"
                ;;
        esac
        return
    fi

    # Fallback: restart current compose services without rebuild
    cd "$PROJECT_DIR" || return 1
    docker compose -f "${COMPOSE_FILE:-docker-compose.ssl.yml}" down
    msg "Available backups:"
    # shellcheck disable=SC2012
    ls -lt "$BACKUP_DIR"/compareintel-backup-* 2>/dev/null | head -5
    # shellcheck disable=SC2012
    LATEST_BACKUP=$(ls -t "$BACKUP_DIR"/compareintel-backup-* 2>/dev/null | head -1)
    [ -n "$LATEST_BACKUP" ] && warn "To restore: see scripts/restore/postgres-restore.sh"
    docker compose -f "${COMPOSE_FILE:-docker-compose.ssl.yml}" up -d
    warn "Rollback completed. Verify application status."
}
