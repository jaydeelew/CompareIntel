#!/bin/bash
# Database backup (PostgreSQL or SQLite).

backup_database() {
    msg "Creating database backup..."
    load_env
    [ -z "$DATABASE_URL" ] && { warn "DATABASE_URL not set, skipping backup"; return 0; }
    
    if [[ "$DATABASE_URL" == postgres* ]]; then
        # Use new comprehensive backup script for PostgreSQL
        if [ -f "$SCRIPT_DIR/../backup/postgres-backup.sh" ]; then
            bash "$SCRIPT_DIR/../backup/postgres-backup.sh" || { err "PostgreSQL backup failed"; exit 1; }
        else
            # Fallback to simple backup if script not found
            mkdir -p "$BACKUP_DIR"
            BACKUP_FILE="$BACKUP_DIR/compareintel-backup-$(date +%Y%m%d-%H%M%S).sql"
            DB_USER=$(echo "$DATABASE_URL" | sed -n 's/.*:\/\/\([^:]*\):.*/\1/p')
            DB_PASS=$(echo "$DATABASE_URL" | sed -n 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/p')
            DB_HOST=$(echo "$DATABASE_URL" | sed -n 's/.*@\([^:]*\):.*/\1/p')
            DB_PORT=$(echo "$DATABASE_URL" | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
            DB_NAME=$(echo "$DATABASE_URL" | sed -n 's/.*\/\([^?]*\).*/\1/p')
            PGPASSWORD="$DB_PASS" pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -F c -f "$BACKUP_FILE" || { err "PostgreSQL backup failed"; exit 1; }
            ok "PostgreSQL backed up to: $BACKUP_FILE"
        fi
    elif [[ "$DATABASE_URL" == sqlite* ]]; then
        mkdir -p "$BACKUP_DIR"
        BACKUP_FILE="$BACKUP_DIR/compareintel-backup-$(date +%Y%m%d-%H%M%S).sql"
        DB_PATH=$(echo "$DATABASE_URL" | sed 's/sqlite:\/\/\///')
        [ -f "$DB_PATH" ] && cp "$DB_PATH" "${BACKUP_FILE%.sql}.db" && ok "SQLite backed up" || warn "SQLite file not found"
    else
        warn "Unknown database type, skipping backup"
        return 0
    fi
}
