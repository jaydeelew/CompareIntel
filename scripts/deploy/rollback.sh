#!/bin/bash
# Rollback deployment using comprehensive rollback tool.

rollback_deployment() {
    warn "Initiating rollback..."
    
    # Use comprehensive rollback script if available
    if [ -f "$SCRIPT_DIR/../rollback/rollback.sh" ]; then
        bash "$SCRIPT_DIR/../rollback/rollback.sh" status
        echo ""
        warn "Use the comprehensive rollback tool for advanced options:"
        warn "  bash scripts/rollback/rollback.sh full       - Full rollback (app + DB)"
        warn "  bash scripts/rollback/rollback.sh quick      - Quick app rollback"
        warn "  bash scripts/rollback/rollback.sh database   - Rollback DB only"
        echo ""
        read -p "Perform quick rollback now? (yes/no): " confirm
        if [ "$confirm" = "yes" ]; then
            bash "$SCRIPT_DIR/../rollback/rollback.sh" quick
        else
            warn "Rollback cancelled. See scripts/rollback/rollback.sh for options."
        fi
    else
        # Fallback to basic rollback
        cd "$PROJECT_DIR"
        docker compose -f docker-compose.ssl.yml down
        msg "Available backups:"
        ls -lt "$BACKUP_DIR"/compareintel-backup-* 2>/dev/null | head -5
        LATEST_BACKUP=$(ls -t "$BACKUP_DIR"/compareintel-backup-* 2>/dev/null | head -1)
        [ -n "$LATEST_BACKUP" ] && warn "To restore: see scripts/restore/postgres-restore.sh"
        docker compose -f docker-compose.ssl.yml up -d
        warn "Rollback completed. Verify application status."
    fi
}
