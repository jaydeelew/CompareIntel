#!/bin/bash
# PostgreSQL restore script with safety checks

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"; }
ok() { echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] OK: $1${NC}"; }
warn() { echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] WARN: $1${NC}"; }
err() { echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"; }
info() { echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')] INFO: $1${NC}"; }

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/home/ubuntu/backups}"

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

# List available backups
list_backups() {
    info "Available backups:"
    echo ""
    echo "DAILY BACKUPS:"
    if [ -d "$BACKUP_DIR/daily" ]; then
        ls -lht "$BACKUP_DIR"/daily/compareintel-*.sql* 2>/dev/null || echo "  No daily backups found"
    else
        echo "  No daily backups found"
    fi
    echo ""
    echo "WEEKLY BACKUPS:"
    if [ -d "$BACKUP_DIR/weekly" ]; then
        ls -lht "$BACKUP_DIR"/weekly/compareintel-*.sql* 2>/dev/null || echo "  No weekly backups found"
    else
        echo "  No weekly backups found"
    fi
    echo ""
}

# Get row counts for verification
get_row_counts() {
    local db_name="$1"
    log "Getting row counts from database: $db_name"
    
    PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$db_name" -t -c "
        SELECT 
            schemaname || '.' || tablename AS table_name,
            n_live_tup AS row_count
        FROM pg_stat_user_tables
        ORDER BY schemaname, tablename;
    " 2>/dev/null || echo "Could not retrieve row counts"
}

# Verify backup file
verify_backup_file() {
    local backup_file="$1"
    
    if [ ! -f "$backup_file" ]; then
        err "Backup file not found: $backup_file"
        return 1
    fi
    
    info "Verifying backup file: $backup_file"
    
    # Check if compressed
    if [[ "$backup_file" == *.gz ]]; then
        log "Testing gzip integrity..."
        if ! gzip -t "$backup_file"; then
            err "Backup file is corrupted"
            return 1
        fi
        ok "Gzip integrity check passed"
    fi
    
    return 0
}

# Restore backup
restore_backup() {
    local backup_file="$1"
    local target_db="$2"
    
    log "Restoring backup to database: $target_db"
    
    # Check if target database exists
    local db_exists=$(PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -tAc "SELECT 1 FROM pg_database WHERE datname='$target_db'" 2>/dev/null)
    
    if [ "$db_exists" != "1" ]; then
        log "Creating database: $target_db"
        PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -c "CREATE DATABASE $target_db;" || {
            err "Failed to create database"
            return 1
        }
    fi
    
    # Restore based on file format
    if [[ "$backup_file" == *.gz ]]; then
        log "Decompressing and restoring..."
        gunzip -c "$backup_file" | PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$target_db" || {
            err "Restore failed"
            return 1
        }
    else
        log "Restoring..."
        PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$target_db" -f "$backup_file" || {
            err "Restore failed"
            return 1
        }
    fi
    
    ok "Restore completed successfully"
    return 0
}

# Interactive restore
interactive_restore() {
    parse_database_url || exit 1
    
    list_backups
    
    echo ""
    read -p "Enter path to backup file (or 'latest' for most recent daily backup): " backup_input
    
    local backup_file=""
    if [ "$backup_input" = "latest" ]; then
        backup_file=$(ls -t "$BACKUP_DIR"/daily/compareintel-*.sql* 2>/dev/null | head -1)
        if [ -z "$backup_file" ]; then
            err "No backups found"
            exit 1
        fi
        info "Using latest backup: $backup_file"
    else
        backup_file="$backup_input"
    fi
    
    verify_backup_file "$backup_file" || exit 1
    
    echo ""
    warn "⚠️  WARNING: This will restore the database!"
    echo ""
    echo "Current database: $DB_NAME"
    echo "Backup file: $backup_file"
    echo ""
    read -p "Restore to PRODUCTION database '$DB_NAME'? (yes/scratch): " restore_target
    
    if [ "$restore_target" = "yes" ]; then
        warn "⚠️  FINAL WARNING: Restoring to PRODUCTION database!"
        read -p "Type 'RESTORE' to confirm: " confirm
        if [ "$confirm" != "RESTORE" ]; then
            err "Restore cancelled"
            exit 1
        fi
        
        log "Getting pre-restore row counts..."
        get_row_counts "$DB_NAME" > /tmp/pre-restore-counts.txt
        
        restore_backup "$backup_file" "$DB_NAME" || exit 1
        
        log "Getting post-restore row counts..."
        get_row_counts "$DB_NAME" > /tmp/post-restore-counts.txt
        
        echo ""
        ok "Restore completed!"
        echo ""
        info "Row count comparison:"
        echo "Before restore:"
        cat /tmp/pre-restore-counts.txt
        echo ""
        echo "After restore:"
        cat /tmp/post-restore-counts.txt
        
    elif [ "$restore_target" = "scratch" ]; then
        local scratch_db="compareintel_restore_test_$(date +%s)"
        info "Creating scratch database: $scratch_db"
        
        restore_backup "$backup_file" "$scratch_db" || exit 1
        
        log "Getting row counts from restored database..."
        get_row_counts "$scratch_db"
        
        echo ""
        read -p "Delete scratch database '$scratch_db'? (yes/no): " delete_scratch
        if [ "$delete_scratch" = "yes" ]; then
            log "Dropping scratch database..."
            PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -c "DROP DATABASE $scratch_db;" || warn "Failed to drop database"
            ok "Scratch database deleted"
        else
            info "Scratch database preserved: $scratch_db"
        fi
    else
        err "Invalid option"
        exit 1
    fi
}

# Automated restore for testing
automated_restore_test() {
    local backup_file="$1"
    
    parse_database_url || return 1
    
    log "Running automated restore test..."
    
    # Use latest backup if not specified
    if [ -z "$backup_file" ]; then
        backup_file=$(ls -t "$BACKUP_DIR"/daily/compareintel-*.sql* 2>/dev/null | head -1)
        if [ -z "$backup_file" ]; then
            err "No backups found"
            return 1
        fi
        info "Using latest backup: $backup_file"
    fi
    
    verify_backup_file "$backup_file" || return 1
    
    # Create scratch database
    local scratch_db="compareintel_restore_test_$(date +%s)"
    info "Creating scratch database: $scratch_db"
    
    restore_backup "$backup_file" "$scratch_db" || return 1
    
    # Get row counts
    log "Verifying restored data..."
    local row_counts=$(get_row_counts "$scratch_db")
    echo "$row_counts"
    
    # Check if we got any data
    if echo "$row_counts" | grep -q "[0-9]"; then
        ok "Restore test passed - data verified"
    else
        warn "No row count data retrieved"
    fi
    
    # Cleanup
    log "Cleaning up scratch database..."
    PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -c "DROP DATABASE IF EXISTS $scratch_db;" || warn "Failed to drop database"
    
    ok "Automated restore test completed"
    return 0
}

# Main execution
main() {
    # Load environment from .env if it exists
    if [ -f "backend/.env" ]; then
        set -a
        source <(grep -v '^\s*#' backend/.env | grep -v '^\s*$')
        set +a
    fi
    
    case "${1:-interactive}" in
        interactive)
            interactive_restore
            ;;
        test)
            automated_restore_test "${2:-}"
            ;;
        list)
            list_backups
            ;;
        *)
            echo "Usage: $0 {interactive|test [backup_file]|list}"
            echo ""
            echo "Commands:"
            echo "  interactive       - Interactive restore with safety prompts"
            echo "  test [file]       - Automated restore test to scratch database"
            echo "  list              - List available backups"
            exit 1
            ;;
    esac
}

main "$@"
