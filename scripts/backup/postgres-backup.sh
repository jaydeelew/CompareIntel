#!/bin/bash
# PostgreSQL backup script with retention policy and optional off-box upload
# Supports 7 daily + 4 weekly retention and provider-agnostic remote storage

set -e
set -o pipefail

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/home/ubuntu/backups}"
DAILY_RETENTION=7
WEEKLY_RETENTION=4
COMPRESS=true
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
DATE_LABEL=$(date +%Y%m%d)
DAY_OF_WEEK=$(date +%u)  # 1=Monday, 7=Sunday

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"; }
ok() { echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] OK: $1${NC}"; }
warn() { echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] WARN: $1${NC}"; }
err() { echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"; }

# Parse DATABASE_URL
parse_database_url() {
    if [ -z "$DATABASE_URL" ]; then
        err "DATABASE_URL not set"
        return 1
    fi
    
    if [[ ! "$DATABASE_URL" =~ ^postgres ]]; then
        err "Only PostgreSQL is supported"
        return 1
    fi
    
    # Parse postgres://user:pass@host:port/dbname
    DB_USER=$(echo "$DATABASE_URL" | sed -n 's/.*:\/\/\([^:]*\):.*/\1/p')
    DB_PASS=$(echo "$DATABASE_URL" | sed -n 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/p')
    DB_HOST=$(echo "$DATABASE_URL" | sed -n 's/.*@\([^:\/]*\).*/\1/p')
    DB_PORT=$(echo "$DATABASE_URL" | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
    DB_NAME=$(echo "$DATABASE_URL" | sed -n 's/.*\/\([^?]*\).*/\1/p')
    
    # Validate
    if [ -z "$DB_USER" ] || [ -z "$DB_HOST" ] || [ -z "$DB_NAME" ]; then
        err "Failed to parse DATABASE_URL"
        return 1
    fi
    
    # Set defaults
    DB_PORT="${DB_PORT:-5432}"
}

# Create backup
create_backup() {
    log "Creating PostgreSQL backup..."
    mkdir -p "$BACKUP_DIR/daily"
    
    local backup_file="$BACKUP_DIR/daily/compareintel-${DATE_LABEL}-${TIMESTAMP}.sql"
    
    if [ "$COMPRESS" = true ]; then
        backup_file="${backup_file}.gz"
        log "Backing up to: $backup_file (compressed)"
        PGPASSWORD="$DB_PASS" pg_dump \
            -h "$DB_HOST" \
            -p "$DB_PORT" \
            -U "$DB_USER" \
            -d "$DB_NAME" \
            -F p \
            --no-owner \
            --no-acl \
            | gzip > "$backup_file"
    else
        log "Backing up to: $backup_file"
        PGPASSWORD="$DB_PASS" pg_dump \
            -h "$DB_HOST" \
            -p "$DB_PORT" \
            -U "$DB_USER" \
            -d "$DB_NAME" \
            -F p \
            --no-owner \
            --no-acl \
            -f "$backup_file"
    fi
    
    if [ $? -eq 0 ]; then
        ok "Backup created successfully"
        echo "$backup_file"
        return 0
    else
        err "Backup failed"
        return 1
    fi
}

# Upload to remote storage (provider-agnostic)
upload_backup() {
    local backup_file="$1"
    
    # Check if any remote storage is configured
    if [ -z "$BACKUP_REMOTE_ENABLED" ] || [ "$BACKUP_REMOTE_ENABLED" != "true" ]; then
        warn "Remote backup upload not enabled (set BACKUP_REMOTE_ENABLED=true)"
        return 0
    fi
    
    log "Uploading backup to remote storage..."
    
    # S3-compatible storage (AWS S3, Backblaze B2, Wasabi, MinIO, etc.)
    if [ -n "$BACKUP_S3_BUCKET" ]; then
        if ! command -v aws >/dev/null 2>&1; then
            warn "AWS CLI not installed. Install with: pip install awscli"
            return 0
        fi
        
        local s3_path="s3://${BACKUP_S3_BUCKET}/postgres/$(basename "$backup_file")"
        log "Uploading to S3: $s3_path"
        
        # Use custom endpoint if provided (for S3-compatible services)
        if [ -n "$BACKUP_S3_ENDPOINT" ]; then
            aws s3 cp "$backup_file" "$s3_path" --endpoint-url "$BACKUP_S3_ENDPOINT"
        else
            aws s3 cp "$backup_file" "$s3_path"
        fi
        
        if [ $? -eq 0 ]; then
            ok "Uploaded to S3 successfully"
        else
            warn "S3 upload failed"
        fi
        return 0
    fi
    
    # Rclone (supports 40+ cloud storage providers)
    if [ -n "$BACKUP_RCLONE_REMOTE" ]; then
        if ! command -v rclone >/dev/null 2>&1; then
            warn "rclone not installed. Install with: curl https://rclone.org/install.sh | sudo bash"
            return 0
        fi
        
        local rclone_path="${BACKUP_RCLONE_REMOTE}/postgres/$(basename "$backup_file")"
        log "Uploading via rclone: $rclone_path"
        
        rclone copy "$backup_file" "$rclone_path"
        
        if [ $? -eq 0 ]; then
            ok "Uploaded via rclone successfully"
        else
            warn "rclone upload failed"
        fi
        return 0
    fi
    
    # rsync to remote server
    if [ -n "$BACKUP_RSYNC_DEST" ]; then
        if ! command -v rsync >/dev/null 2>&1; then
            warn "rsync not installed. Install with: apt-get install rsync"
            return 0
        fi
        
        log "Uploading via rsync: $BACKUP_RSYNC_DEST"
        
        rsync -avz "$backup_file" "$BACKUP_RSYNC_DEST/postgres/"
        
        if [ $? -eq 0 ]; then
            ok "Uploaded via rsync successfully"
        else
            warn "rsync upload failed"
        fi
        return 0
    fi
    
    warn "No remote storage configured. Set BACKUP_S3_BUCKET, BACKUP_RCLONE_REMOTE, or BACKUP_RSYNC_DEST"
    return 0
}

# Manage retention policy
manage_retention() {
    log "Managing backup retention..."
    
    # Create weekly backup on Sunday
    if [ "$DAY_OF_WEEK" -eq 7 ]; then
        log "Creating weekly backup..."
        mkdir -p "$BACKUP_DIR/weekly"
        
        # Copy latest daily backup to weekly
        local latest_daily=$(ls -t "$BACKUP_DIR"/daily/compareintel-*.sql* 2>/dev/null | head -1)
        if [ -n "$latest_daily" ]; then
            local week_num=$(date +%V)
            local weekly_backup="$BACKUP_DIR/weekly/compareintel-week${week_num}-${DATE_LABEL}.sql.gz"
            cp "$latest_daily" "$weekly_backup"
            ok "Weekly backup created: $weekly_backup"
        fi
    fi
    
    # Cleanup old daily backups (keep last 7)
    local daily_count=$(ls -1 "$BACKUP_DIR"/daily/compareintel-*.sql* 2>/dev/null | wc -l)
    if [ "$daily_count" -gt "$DAILY_RETENTION" ]; then
        log "Cleaning up old daily backups (keeping last $DAILY_RETENTION)..."
        ls -t "$BACKUP_DIR"/daily/compareintel-*.sql* | tail -n +$((DAILY_RETENTION + 1)) | xargs rm -f
        ok "Old daily backups removed"
    fi
    
    # Cleanup old weekly backups (keep last 4)
    local weekly_count=$(ls -1 "$BACKUP_DIR"/weekly/compareintel-*.sql* 2>/dev/null | wc -l)
    if [ "$weekly_count" -gt "$WEEKLY_RETENTION" ]; then
        log "Cleaning up old weekly backups (keeping last $WEEKLY_RETENTION)..."
        ls -t "$BACKUP_DIR"/weekly/compareintel-*.sql* | tail -n +$((WEEKLY_RETENTION + 1)) | xargs rm -f
        ok "Old weekly backups removed"
    fi
}

# Main execution
main() {
    log "Starting PostgreSQL backup..."
    
    # Load environment from .env if it exists
    if [ -f "backend/.env" ]; then
        set -a
        source <(grep -v '^\s*#' backend/.env | grep -v '^\s*$')
        set +a
    fi
    
    # Parse database connection
    parse_database_url || exit 1
    
    # Create backup
    backup_file=$(create_backup) || exit 1
    
    # Upload to remote storage
    upload_backup "$backup_file"
    
    # Manage retention
    manage_retention
    
    ok "Backup completed successfully"
    log "Backup file: $backup_file"
    
    # Show backup summary
    log "Backup summary:"
    log "  Daily backups: $(ls -1 "$BACKUP_DIR"/daily/compareintel-*.sql* 2>/dev/null | wc -l)"
    log "  Weekly backups: $(ls -1 "$BACKUP_DIR"/weekly/compareintel-*.sql* 2>/dev/null | wc -l)"
}

main "$@"
