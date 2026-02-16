#!/bin/bash
# Database backup (PostgreSQL or SQLite).

backup_database() {
    msg "Creating database backup..."
    mkdir -p "$BACKUP_DIR"
    load_env
    [ -z "$DATABASE_URL" ] && { warn "DATABASE_URL not set, skipping backup"; return 0; }
    BACKUP_FILE="$BACKUP_DIR/compareintel-backup-$(date +%Y%m%d-%H%M%S).sql"
    if [[ "$DATABASE_URL" == postgres* ]]; then
        DB_USER=$(echo "$DATABASE_URL" | sed -n 's/.*:\/\/\([^:]*\):.*/\1/p')
        DB_PASS=$(echo "$DATABASE_URL" | sed -n 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/p')
        DB_HOST=$(echo "$DATABASE_URL" | sed -n 's/.*@\([^:]*\):.*/\1/p')
        DB_PORT=$(echo "$DATABASE_URL" | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
        DB_NAME=$(echo "$DATABASE_URL" | sed -n 's/.*\/\([^?]*\).*/\1/p')
        PGPASSWORD="$DB_PASS" pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -F c -f "$BACKUP_FILE" || { err "PostgreSQL backup failed"; exit 1; }
        ok "PostgreSQL backed up to: $BACKUP_FILE"
    elif [[ "$DATABASE_URL" == sqlite* ]]; then
        DB_PATH=$(echo "$DATABASE_URL" | sed 's/sqlite:\/\/\///')
        [ -f "$DB_PATH" ] && cp "$DB_PATH" "${BACKUP_FILE%.sql}.db" && ok "SQLite backed up" || warn "SQLite file not found"
    else
        warn "Unknown database type, skipping backup"
        return 0
    fi
    BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/compareintel-backup-* 2>/dev/null | wc -l)
    [ "$BACKUP_COUNT" -gt 10 ] && { msg "Cleaning old backups..."; ls -1t "$BACKUP_DIR"/compareintel-backup-* | tail -n +11 | xargs rm -f; ok "Old backups removed"; }
}
