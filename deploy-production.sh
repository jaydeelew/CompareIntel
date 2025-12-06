#!/bin/bash

# ============================================================================
# CompareIntel Production Deployment Script
# ============================================================================
# This script handles database migrations, dependency checks, and deployment
# for the CompareIntel application on Ubuntu/PostgreSQL production servers.
#
# All Python dependencies and execution happen inside Docker containers.
# No virtual environment (venv) is used on the host.
#
# Available Commands:
#   check        - Check system requirements and SSL certificates
#   backup       - Create database backup only (PostgreSQL pg_dump)
#   migrate      - Apply database migrations only (via Docker)
#   build        - Build and deploy without git pull or migrations
#   deploy       - Full deployment with git pull and migrations (default)
#   quick-deploy - Deploy local fixes without git pull
#   rollback     - Rollback to previous version
#   restart      - Restart all services
#   status       - Show current deployment status
#   logs         - Follow container logs
#
# Usage: ./deploy-production.sh [command]
# ============================================================================

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_DIR="/home/ubuntu/CompareIntel"
BACKUP_DIR="/home/ubuntu/backups"
LOG_FILE="/home/ubuntu/compareintel-deploy.log"
ENV_FILE="$PROJECT_DIR/backend/.env"
MIGRATIONS_DIR="$PROJECT_DIR/backend/scripts/migrations"

# Function to log messages
log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] ✅ $1${NC}" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] ⚠️  $1${NC}" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ❌ $1${NC}" | tee -a "$LOG_FILE"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check if service is running
service_running() {
    cd "$PROJECT_DIR"
    docker compose -f docker-compose.ssl.yml ps --services --filter "status=running" 2>/dev/null | grep -q "$1"
}

# Function to load environment variables from .env file
load_env() {
    if [ -f "$ENV_FILE" ]; then
        log "Loading environment variables from $ENV_FILE"
        # Export variables from .env file (handle comments and empty lines)
        set -a
        source <(grep -v '^\s*#' "$ENV_FILE" | grep -v '^\s*$')
        set +a
        log_success "Environment variables loaded"
    else
        log_warning "Environment file not found: $ENV_FILE"
    fi
}

# Function to backup database (PostgreSQL)
backup_database() {
    log "Creating database backup..."
    
    # Create backup directory if it doesn't exist
    mkdir -p "$BACKUP_DIR"
    
    # Load environment to get DATABASE_URL
    load_env
    
    if [ -z "$DATABASE_URL" ]; then
        log_warning "DATABASE_URL not set, skipping backup"
        return 0
    fi
    
    BACKUP_FILE="$BACKUP_DIR/compareintel-backup-$(date +%Y%m%d-%H%M%S).sql"
    
    # Check if using PostgreSQL
    if [[ "$DATABASE_URL" == postgres* ]]; then
        log "Detected PostgreSQL database"
        
        # Parse DATABASE_URL: postgresql://user:password@host:port/database
        DB_USER=$(echo "$DATABASE_URL" | sed -n 's/.*:\/\/\([^:]*\):.*/\1/p')
        DB_PASS=$(echo "$DATABASE_URL" | sed -n 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/p')
        DB_HOST=$(echo "$DATABASE_URL" | sed -n 's/.*@\([^:]*\):.*/\1/p')
        DB_PORT=$(echo "$DATABASE_URL" | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
        DB_NAME=$(echo "$DATABASE_URL" | sed -n 's/.*\/\([^?]*\).*/\1/p')
        
        # Create backup using pg_dump
        PGPASSWORD="$DB_PASS" pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -F c -f "$BACKUP_FILE"
        
        if [ $? -eq 0 ]; then
            log_success "PostgreSQL database backed up to: $BACKUP_FILE"
        else
            log_error "Failed to backup PostgreSQL database"
            exit 1
        fi
    elif [[ "$DATABASE_URL" == sqlite* ]]; then
        # SQLite backup (development)
        DB_PATH=$(echo "$DATABASE_URL" | sed 's/sqlite:\/\/\///')
        if [ -f "$DB_PATH" ]; then
            cp "$DB_PATH" "${BACKUP_FILE%.sql}.db"
            log_success "SQLite database backed up to: ${BACKUP_FILE%.sql}.db"
        else
            log_warning "SQLite database file not found: $DB_PATH"
        fi
    else
        log_warning "Unknown database type, skipping backup"
        return 0
    fi
    
    # Clean up old backups (keep last 10)
    BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/compareintel-backup-* 2>/dev/null | wc -l)
    if [ "$BACKUP_COUNT" -gt 10 ]; then
        log "Cleaning up old backups (keeping last 10)..."
        ls -1t "$BACKUP_DIR"/compareintel-backup-* | tail -n +11 | xargs rm -f
        log_success "Old backups cleaned up"
    fi
}

# Function to check system requirements
check_system_requirements() {
    log "Checking system requirements..."
    
    # Check if running as root or with sudo
    if [ "$EUID" -eq 0 ]; then
        log_warning "Running as root. Consider using a non-root user with sudo privileges."
    fi
    
    # Check Docker
    if ! command_exists docker; then
        log_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    log_success "Docker is installed"
    
    # Check Docker Compose
    if ! command_exists docker-compose && ! docker compose version >/dev/null 2>&1; then
        log_error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi
    log_success "Docker Compose is installed"
    
    # Check pg_dump (needed for PostgreSQL backups)
    if command_exists pg_dump; then
        log_success "pg_dump is installed (for PostgreSQL backups)"
    else
        log_warning "pg_dump is not installed. Install with: sudo apt-get install postgresql-client"
    fi
    
    # Check curl (needed for health checks)
    if ! command_exists curl; then
        log_warning "curl is not installed. Health checks may fail."
        log "Install with: sudo apt-get install curl"
    else
        log_success "curl is installed"
    fi
    
    # Check available disk space (at least 2GB)
    AVAILABLE_SPACE=$(df / | awk 'NR==2 {print $4}')
    if [ "$AVAILABLE_SPACE" -lt 2097152 ]; then  # 2GB in KB
        log_warning "Low disk space detected. At least 2GB recommended."
    else
        AVAILABLE_GB=$(echo "scale=1; $AVAILABLE_SPACE / 1048576" | bc 2>/dev/null || echo "unknown")
        log_success "Disk space: ${AVAILABLE_GB}GB available"
    fi
    
    # Check memory (at least 1GB)
    TOTAL_MEM=$(free -m | awk 'NR==2{print $2}')
    if [ "$TOTAL_MEM" -lt 1024 ]; then
        log_warning "Low memory detected. At least 1GB RAM recommended."
    else
        log_success "Memory: ${TOTAL_MEM}MB available"
    fi
    
    # Check if project directory exists
    if [ ! -d "$PROJECT_DIR" ]; then
        log_error "Project directory not found: $PROJECT_DIR"
        exit 1
    fi
    log_success "Project directory exists: $PROJECT_DIR"
    
    # Check if .env file exists
    if [ -f "$ENV_FILE" ]; then
        log_success "Environment file exists: $ENV_FILE"
    else
        log_error "Environment file not found: $ENV_FILE"
        exit 1
    fi
    
    log_success "System requirements check completed"
}

# Function to check SSL certificates
check_ssl_certificates() {
    log "Checking SSL certificates..."
    
    # Use sudo to check certificate directory (requires root permissions to read /etc/letsencrypt/live/)
    if ! sudo test -d "/etc/letsencrypt/live/compareintel.com"; then
        log_error "SSL certificates not found. Please run setup-compareintel-ssl.sh first."
        exit 1
    fi
    
    # Check certificate expiration (use sudo to read cert file)
    CERT_EXPIRY=$(sudo openssl x509 -in /etc/letsencrypt/live/compareintel.com/fullchain.pem -noout -enddate | cut -d= -f2)
    CERT_EXPIRY_EPOCH=$(date -d "$CERT_EXPIRY" +%s)
    CURRENT_EPOCH=$(date +%s)
    DAYS_UNTIL_EXPIRY=$(( (CERT_EXPIRY_EPOCH - CURRENT_EPOCH) / 86400 ))
    
    if [ "$DAYS_UNTIL_EXPIRY" -lt 90 ]; then
        log_warning "SSL certificate expires in $DAYS_UNTIL_EXPIRY days. Consider renewing soon."
        if [ "$DAYS_UNTIL_EXPIRY" -lt 30 ]; then
            log_error "SSL certificate expires in $DAYS_UNTIL_EXPIRY days! Renew immediately!"
        fi
    else
        log_success "SSL certificate is valid for $DAYS_UNTIL_EXPIRY more days"
    fi
}

# Function to apply database migrations (via Docker)
apply_database_migrations() {
    log "Applying database migrations via Docker..."
    
    cd "$PROJECT_DIR"
    
    # Ensure backend container is running
    if ! docker compose -f docker-compose.ssl.yml ps --services --filter "status=running" 2>/dev/null | grep -q "backend"; then
        log_error "Backend container is not running. Please run 'build' or 'deploy' first."
        exit 1
    fi
    
    # Wait a moment for the container to be fully ready
    log "Waiting for backend container to be ready..."
    sleep 5
    
    # Run each migration script inside the Docker container
    # All dependencies are already installed in the container
    MIGRATION_SCRIPTS=(
        "add_credits_columns.py"
        "add_message_tokens_columns.py"
        "add_timezone_column.py"
        "migrate_app_settings.py"
    )
    
    for script in "${MIGRATION_SCRIPTS[@]}"; do
        SCRIPT_PATH="/app/scripts/migrations/$script"
        log "Running migration: $script"
        if docker compose -f docker-compose.ssl.yml exec -T backend python3 "$SCRIPT_PATH" 2>&1; then
            log_success "Migration $script completed"
        else
            log_warning "Migration $script had issues (may already be applied)"
        fi
    done
    
    log_success "All database migrations completed"
}

# Function to pull latest code
pull_latest_code() {
    log "Pulling latest code from repository..."
    
    cd "$PROJECT_DIR"
    
    # Check if we're in a git repository
    if [ ! -d ".git" ]; then
        log_error "Not in a git repository. Please ensure you're in the CompareIntel project directory."
        exit 1
    fi
    
    # Detect the default branch (main or master)
    DEFAULT_BRANCH=$(git remote show origin 2>/dev/null | grep 'HEAD branch' | awk '{print $NF}')
    if [ -z "$DEFAULT_BRANCH" ]; then
        # Fallback: check if main or master exists
        if git show-ref --verify --quiet refs/remotes/origin/main; then
            DEFAULT_BRANCH="main"
        else
            DEFAULT_BRANCH="master"
        fi
    fi
    
    log "Using branch: $DEFAULT_BRANCH"
    
    # Fetch and pull latest changes
    git fetch origin
    git pull origin "$DEFAULT_BRANCH"
    
    if [ $? -eq 0 ]; then
        log_success "Code updated successfully from $DEFAULT_BRANCH"
    else
        log_error "Failed to pull latest code from $DEFAULT_BRANCH"
        exit 1
    fi
}

# Function to build and deploy
build_and_deploy() {
    log "Building and deploying application..."
    
    cd "$PROJECT_DIR"
    
    # Stop existing services
    log "Stopping existing services..."
    docker compose -f docker-compose.ssl.yml down
    
    # Clean up old images to free space
    log "Cleaning up old Docker images..."
    docker image prune -f
    
    # Build and start services
    log "Building and starting services..."
    docker compose -f docker-compose.ssl.yml up -d --build
    
    if [ $? -eq 0 ]; then
        log_success "Services started successfully"
    else
        log_error "Failed to start services"
        exit 1
    fi
}

# Function to verify deployment
verify_deployment() {
    log "Verifying deployment..."
    
    cd "$PROJECT_DIR"
    
    # Wait for services to start
    log "Waiting for services to initialize..."
    sleep 15
    
    # Check if services are running
    if service_running "backend" && service_running "frontend" && service_running "nginx"; then
        log_success "All services are running"
    else
        log_error "Some services failed to start"
        docker compose -f docker-compose.ssl.yml ps
        docker compose -f docker-compose.ssl.yml logs --tail=50
        exit 1
    fi
    
    # Test backend health via Docker network (backend port not exposed to host)
    log "Testing backend health..."
    BACKEND_HEALTH=$(docker compose -f docker-compose.ssl.yml exec -T backend curl -f -s http://localhost:8000/health 2>/dev/null || echo "failed")
    if echo "$BACKEND_HEALTH" | grep -q "healthy"; then
        log_success "Backend is healthy"
    else
        # Fallback: try via nginx /api path
        if curl -f -s -k https://localhost/api/health >/dev/null 2>&1; then
            log_success "Backend is healthy (via nginx)"
        else
            log_warning "Backend health check inconclusive - checking logs..."
            docker compose -f docker-compose.ssl.yml logs --tail=20 backend
        fi
    fi
    
    # Test frontend via nginx (HTTP redirects to HTTPS)
    log "Testing frontend..."
    if curl -f -s -L http://localhost:80 >/dev/null 2>&1; then
        log_success "Frontend is accessible (HTTP)"
    else
        log_warning "HTTP frontend test failed"
    fi
    
    # Test HTTPS
    log "Testing HTTPS..."
    if curl -f -s -k https://localhost:443 >/dev/null 2>&1; then
        log_success "HTTPS is working"
    else
        log_warning "HTTPS test failed (this might be normal if testing locally without valid certs)"
    fi
    
    # Test public URL if available
    log "Testing public URL..."
    if curl -f -s -m 10 https://compareintel.com >/dev/null 2>&1; then
        log_success "Public site https://compareintel.com is accessible"
    else
        log_warning "Public URL test skipped or failed (expected if running locally)"
    fi
}

# Function to show deployment status
show_status() {
    cd "$PROJECT_DIR"
    log "Deployment Status:"
    echo ""
    echo "Services:"
    docker compose -f docker-compose.ssl.yml ps
    echo ""
    echo "Recent logs:"
    docker compose -f docker-compose.ssl.yml logs --tail=20
    echo ""
    echo "Disk usage:"
    df -h /
    echo ""
    echo "Memory usage:"
    free -h
}

# Function to rollback deployment
rollback_deployment() {
    log_warning "Rolling back deployment..."
    
    cd "$PROJECT_DIR"
    
    # Stop current services
    docker compose -f docker-compose.ssl.yml down
    
    # List available backups
    log "Available backups:"
    ls -lt "$BACKUP_DIR"/compareintel-backup-* 2>/dev/null | head -5
    
    # Get the latest backup
    LATEST_BACKUP=$(ls -t "$BACKUP_DIR"/compareintel-backup-* 2>/dev/null | head -1)
    
    if [ -n "$LATEST_BACKUP" ]; then
        log "Latest backup: $LATEST_BACKUP"
        log_warning "To restore PostgreSQL backup manually, run:"
        echo "  PGPASSWORD=<password> pg_restore -h <host> -p <port> -U <user> -d <dbname> -c $LATEST_BACKUP"
        log_warning "Database restoration must be done manually for safety."
    else
        log_warning "No backups found in $BACKUP_DIR"
    fi
    
    # Start previous version (if available)
    docker compose -f docker-compose.ssl.yml up -d
    
    log_warning "Rollback completed. Please check the application status."
}

# Main deployment function
main() {
    echo ""
    echo "=========================================="
    log "CompareIntel Production Deployment"
    echo "=========================================="
    echo ""
    
    # Parse command line arguments
    case "${1:-deploy}" in
        "check")
            check_system_requirements
            check_ssl_certificates
            log_success "System check completed"
            ;;
        "backup")
            backup_database
            log_success "Backup completed"
            ;;
        "migrate")
            backup_database
            # For standalone migrate command, ensure containers are running
            cd "$PROJECT_DIR"
            if ! docker compose -f docker-compose.ssl.yml ps --services --filter "status=running" 2>/dev/null | grep -q "backend"; then
                log "Starting backend container for migrations..."
                docker compose -f docker-compose.ssl.yml up -d backend
                sleep 10
            fi
            apply_database_migrations
            log_success "Database migration completed"
            ;;
        "build")
            build_and_deploy
            log_success "Build and deploy completed"
            ;;
        "deploy")
            check_system_requirements
            check_ssl_certificates
            backup_database
            pull_latest_code
            build_and_deploy
            apply_database_migrations  # Run after build so migrations use new code in container
            verify_deployment
            show_status
            echo ""
            log_success "=== Deployment completed successfully! ==="
            ;;
        "quick-deploy")
            # Quick deploy: skip git pull (useful for hotfixes already on server)
            log_warning "Quick deploy mode: skipping git pull"
            check_system_requirements
            backup_database
            build_and_deploy
            verify_deployment
            log_success "Quick deployment completed!"
            ;;
        "rollback")
            rollback_deployment
            ;;
        "status")
            show_status
            ;;
        "logs")
            cd "$PROJECT_DIR"
            docker compose -f docker-compose.ssl.yml logs -f --tail=100
            ;;
        "restart")
            cd "$PROJECT_DIR"
            log "Restarting services..."
            docker compose -f docker-compose.ssl.yml restart
            sleep 10
            verify_deployment
            log_success "Services restarted"
            ;;
        *)
            echo "Usage: $0 {check|backup|migrate|build|deploy|quick-deploy|rollback|restart|status|logs}"
            echo ""
            echo "Commands:"
            echo "  check        - Check system requirements and SSL certificates"
            echo "  backup       - Create database backup only (PostgreSQL pg_dump)"
            echo "  migrate      - Apply database migrations only (via Docker)"
            echo "  build        - Build and deploy without git pull or migrations"
            echo "  deploy       - Full deployment (default)"
            echo "  quick-deploy - Deploy without git pull (for hotfixes)"
            echo "  rollback     - Rollback to previous version"
            echo "  restart      - Restart all services"
            echo "  status       - Show current deployment status"
            echo "  logs         - Follow container logs"
            echo ""
            echo "Note: All Python dependencies are managed inside Docker containers."
            echo "      No virtual environment (venv) is used on the host."
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"
