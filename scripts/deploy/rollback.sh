#!/bin/bash
# Rollback deployment.

rollback_deployment() {
    warn "Rolling back..."
    cd "$PROJECT_DIR"
    docker compose -f docker-compose.ssl.yml down
    msg "Available backups:"
    ls -lt "$BACKUP_DIR"/compareintel-backup-* 2>/dev/null | head -5
    LATEST_BACKUP=$(ls -t "$BACKUP_DIR"/compareintel-backup-* 2>/dev/null | head -1)
    [ -n "$LATEST_BACKUP" ] && warn "To restore: PGPASSWORD=<pwd> pg_restore -h <host> -p <port> -U <user> -d <db> -c $LATEST_BACKUP"
    docker compose -f docker-compose.ssl.yml up -d
    warn "Rollback completed. Verify application status."
}
