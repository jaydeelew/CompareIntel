#!/bin/bash
# Automated backup and restore drill for CI and manual testing
# Tests full backup/restore cycle with verification

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
TEST_OUTPUT_DIR="${TEST_OUTPUT_DIR:-/tmp/compareintel-backup-test}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"; }
ok() { echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] ✓ $1${NC}"; }
warn() { echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] ⚠ $1${NC}"; }
err() { echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ✗ $1${NC}"; }
info() { echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')] ℹ $1${NC}"; }

# Test results tracking
TESTS_PASSED=0
TESTS_FAILED=0
TEST_RESULTS_FILE="$TEST_OUTPUT_DIR/test-results.txt"

record_pass() {
    TESTS_PASSED=$((TESTS_PASSED + 1))
    ok "$1"
    echo "PASS: $1" >> "$TEST_RESULTS_FILE"
}

record_fail() {
    TESTS_FAILED=$((TESTS_FAILED + 1))
    err "$1"
    echo "FAIL: $1" >> "$TEST_RESULTS_FILE"
}

# Setup test environment
setup_test() {
    log "Setting up test environment..."
    mkdir -p "$TEST_OUTPUT_DIR"
    echo "=== Backup and Restore Drill ===" > "$TEST_RESULTS_FILE"
    echo "Date: $(date)" >> "$TEST_RESULTS_FILE"
    echo "" >> "$TEST_RESULTS_FILE"
    
    cd "$PROJECT_DIR"
    
    # Load environment
    if [ -f "backend/.env" ]; then
        set -a
        source <(grep -v '^\s*#' backend/.env | grep -v '^\s*$')
        set +a
    fi
    
    ok "Test environment ready"
}

# Test 1: Check prerequisites
test_prerequisites() {
    log "Test 1: Checking prerequisites..."
    
    # Check for pg_dump
    if command -v pg_dump >/dev/null 2>&1; then
        record_pass "pg_dump is installed"
    else
        record_fail "pg_dump not found"
        return 1
    fi
    
    # Check for psql
    if command -v psql >/dev/null 2>&1; then
        record_pass "psql is installed"
    else
        record_fail "psql not found"
        return 1
    fi
    
    # Check for gzip
    if command -v gzip >/dev/null 2>&1; then
        record_pass "gzip is installed"
    else
        record_fail "gzip not found"
        return 1
    fi
    
    # Check DATABASE_URL
    if [ -n "$DATABASE_URL" ]; then
        record_pass "DATABASE_URL is set"
    else
        record_fail "DATABASE_URL not set"
        return 1
    fi
    
    # Parse database connection
    DB_USER=$(echo "$DATABASE_URL" | sed -n 's/.*:\/\/\([^:]*\):.*/\1/p')
    DB_PASS=$(echo "$DATABASE_URL" | sed -n 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/p')
    DB_HOST=$(echo "$DATABASE_URL" | sed -n 's/.*@\([^:\/]*\).*/\1/p')
    DB_PORT=$(echo "$DATABASE_URL" | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
    DB_NAME=$(echo "$DATABASE_URL" | sed -n 's/.*\/\([^?]*\).*/\1/p')
    DB_PORT="${DB_PORT:-5432}"
    
    if [ -n "$DB_HOST" ] && [ -n "$DB_NAME" ]; then
        record_pass "Database connection details parsed"
    else
        record_fail "Failed to parse DATABASE_URL"
        return 1
    fi
    
    return 0
}

# Test 2: Database connectivity
test_db_connectivity() {
    log "Test 2: Testing database connectivity..."
    
    if PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" >/dev/null 2>&1; then
        record_pass "Database connection successful"
    else
        record_fail "Cannot connect to database"
        return 1
    fi
    
    return 0
}

# Test 3: Create backup
test_create_backup() {
    log "Test 3: Creating backup..."
    
    export BACKUP_DIR="$TEST_OUTPUT_DIR/backups"
    
    if bash "$SCRIPT_DIR/postgres-backup.sh" > "$TEST_OUTPUT_DIR/backup.log" 2>&1; then
        record_pass "Backup script executed successfully"
    else
        record_fail "Backup script failed"
        cat "$TEST_OUTPUT_DIR/backup.log"
        return 1
    fi
    
    # Check if backup file was created
    local backup_file=$(ls -t "$BACKUP_DIR"/daily/compareintel-*.sql.gz 2>/dev/null | head -1)
    if [ -f "$backup_file" ]; then
        record_pass "Backup file created: $(basename "$backup_file")"
        echo "$backup_file" > "$TEST_OUTPUT_DIR/backup_file_path.txt"
    else
        record_fail "Backup file not found"
        return 1
    fi
    
    # Check backup file size
    local file_size=$(stat -f%z "$backup_file" 2>/dev/null || stat -c%s "$backup_file" 2>/dev/null)
    if [ "$file_size" -gt 100 ]; then
        record_pass "Backup file has content (${file_size} bytes)"
    else
        record_fail "Backup file is too small"
        return 1
    fi
    
    # Test gzip integrity
    if gzip -t "$backup_file" 2>/dev/null; then
        record_pass "Backup file gzip integrity OK"
    else
        record_fail "Backup file is corrupted"
        return 1
    fi
    
    return 0
}

# Test 4: Restore to scratch database
test_restore_scratch() {
    log "Test 4: Testing restore to scratch database..."
    
    local backup_file=$(cat "$TEST_OUTPUT_DIR/backup_file_path.txt")
    local scratch_db="compareintel_test_restore_$(date +%s)"
    
    # Create scratch database
    if PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -c "CREATE DATABASE $scratch_db;" 2>/dev/null; then
        record_pass "Scratch database created: $scratch_db"
    else
        record_fail "Failed to create scratch database"
        return 1
    fi
    
    # Restore backup
    if gunzip -c "$backup_file" | PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$scratch_db" > "$TEST_OUTPUT_DIR/restore.log" 2>&1; then
        record_pass "Backup restored successfully"
    else
        record_fail "Restore failed"
        cat "$TEST_OUTPUT_DIR/restore.log" | tail -20
        PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -c "DROP DATABASE IF EXISTS $scratch_db;" 2>/dev/null
        return 1
    fi
    
    # Verify restored data - check for tables
    local table_count=$(PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$scratch_db" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';" 2>/dev/null | xargs)
    
    if [ "$table_count" -gt 0 ]; then
        record_pass "Restored database has $table_count tables"
    else
        record_fail "Restored database has no tables"
        PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -c "DROP DATABASE IF EXISTS $scratch_db;" 2>/dev/null
        return 1
    fi
    
    # Get row counts
    log "Getting row counts from restored database..."
    PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$scratch_db" -c "
        SELECT 
            schemaname || '.' || tablename AS table_name,
            n_live_tup AS row_count
        FROM pg_stat_user_tables
        ORDER BY schemaname, tablename;
    " > "$TEST_OUTPUT_DIR/row_counts.txt" 2>/dev/null
    
    record_pass "Row counts extracted"
    
    # Cleanup scratch database
    if PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -c "DROP DATABASE $scratch_db;" 2>/dev/null; then
        record_pass "Scratch database cleaned up"
    else
        warn "Failed to cleanup scratch database: $scratch_db"
    fi
    
    return 0
}

# Test 5: Check alembic migrations
test_alembic_migrations() {
    log "Test 5: Testing alembic migrations..."
    
    cd "$PROJECT_DIR/backend"
    
    # Check current migration
    if alembic current > "$TEST_OUTPUT_DIR/alembic_current.txt" 2>&1; then
        record_pass "Alembic current migration retrieved"
    else
        record_fail "Failed to get current migration"
        return 1
    fi
    
    # Check migration history
    if alembic history > "$TEST_OUTPUT_DIR/alembic_history.txt" 2>&1; then
        record_pass "Alembic migration history retrieved"
    else
        record_fail "Failed to get migration history"
        return 1
    fi
    
    return 0
}

# Generate report
generate_report() {
    log "Generating test report..."
    
    local total=$((TESTS_PASSED + TESTS_FAILED))
    local success_rate=0
    if [ $total -gt 0 ]; then
        success_rate=$(awk "BEGIN {printf \"%.1f\", ($TESTS_PASSED/$total)*100}")
    fi
    
    cat <<EOF >> "$TEST_RESULTS_FILE"

=== Test Summary ===
Total Tests: $total
Passed: $TESTS_PASSED
Failed: $TESTS_FAILED
Success Rate: ${success_rate}%

EOF
    
    if [ "$TESTS_FAILED" -eq 0 ]; then
        cat <<EOF >> "$TEST_RESULTS_FILE"
✓ All tests passed!

The backup and restore system is working correctly.
EOF
    else
        cat <<EOF >> "$TEST_RESULTS_FILE"
✗ Some tests failed.

Please review the logs above for details.
EOF
    fi
    
    # Display report
    echo ""
    echo "======================================"
    cat "$TEST_RESULTS_FILE"
    echo "======================================"
    echo ""
    info "Full test results: $TEST_RESULTS_FILE"
    info "Test artifacts: $TEST_OUTPUT_DIR"
    
    if [ "$TESTS_FAILED" -eq 0 ]; then
        ok "Backup and restore drill completed successfully"
        return 0
    else
        err "Backup and restore drill completed with failures"
        return 1
    fi
}

# Main execution
main() {
    echo "======================================"
    echo "  Backup and Restore Drill"
    echo "======================================"
    echo ""
    
    setup_test
    
    test_prerequisites || true
    test_db_connectivity || true
    test_create_backup || true
    test_restore_scratch || true
    test_alembic_migrations || true
    
    generate_report
    
    exit $TESTS_FAILED
}

main "$@"
