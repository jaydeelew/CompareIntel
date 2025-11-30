#!/bin/bash
# Production setup script for daily model availability check cron job
# Supports both Docker and host-based deployments

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Detect if running in Docker or on host
if [ -f "/.dockerenv" ] || [ -n "$DOCKER_CONTAINER" ]; then
    echo "Running inside Docker container"
    DEPLOYMENT_TYPE="docker"
    PYTHON_PATH="/usr/local/bin/python3"
    SCRIPT_PATH="/app/scripts/check_model_availability_prod.py"
    LOG_FILE="/app/logs/model_check.log"
else
    echo "Running on host system"
    DEPLOYMENT_TYPE="host"
    PYTHON_PATH=$(which python3)
    SCRIPT_PATH="$SCRIPT_DIR/check_model_availability_prod.py"
    LOG_DIR="$PROJECT_ROOT/logs"
    LOG_FILE="$LOG_DIR/model_check.log"
    
    # Create logs directory if it doesn't exist
    mkdir -p "$LOG_DIR"
fi

# Make script executable
chmod +x "$SCRIPT_PATH"

echo "Deployment type: $DEPLOYMENT_TYPE"
echo "Python path: $PYTHON_PATH"
echo "Script path: $SCRIPT_PATH"
echo "Log file: $LOG_FILE"
echo ""

if [ "$DEPLOYMENT_TYPE" = "docker" ]; then
    # Docker deployment: Use docker exec in cron
    CONTAINER_NAME=$(docker compose -f "$PROJECT_ROOT/docker-compose.ssl.yml" ps -q backend 2>/dev/null || \
                     docker compose -f "$PROJECT_ROOT/docker-compose.prod.yml" ps -q backend 2>/dev/null || \
                     echo "compareintel-backend-1")
    
    echo "Docker container name: $CONTAINER_NAME"
    echo ""
    echo "For Docker deployments, you have two options:"
    echo ""
    echo "Option 1: Run cron on host, execute script in container"
    echo "  Add this to host crontab (crontab -e):"
    echo "  0 9 * * * docker exec $CONTAINER_NAME python3 $SCRIPT_PATH >> $LOG_FILE 2>&1"
    echo ""
    echo "Option 2: Install cron inside container (not recommended - containers may restart)"
    echo "  SSH into container: docker exec -it $CONTAINER_NAME bash"
    echo "  Then run: apt-get update && apt-get install -y cron"
    echo "  Add cron job inside container"
    echo ""
    echo "Recommended: Use Option 1 (host cron with docker exec)"
    echo ""
    
    # Create cron entry for host system
    CRON_ENTRY="0 9 * * * docker exec $CONTAINER_NAME python3 $SCRIPT_PATH >> $LOG_FILE 2>&1"
    
    # Check if cron job already exists
    if crontab -l 2>/dev/null | grep -q "check_model_availability_prod.py"; then
        echo "Cron job already exists. Removing old entry..."
        crontab -l 2>/dev/null | grep -v "check_model_availability_prod.py" | crontab -
    fi
    
    # Add new cron job (on host system)
    (crontab -l 2>/dev/null; echo "$CRON_ENTRY") | crontab -
    
    echo "✓ Cron job installed on host system (runs script in Docker container)"
    
else
    # Host deployment: Standard cron job
    CRON_ENTRY="0 9 * * * cd $PROJECT_ROOT && $PYTHON_PATH $SCRIPT_PATH >> $LOG_FILE 2>&1"
    
    # Check if cron job already exists
    if crontab -l 2>/dev/null | grep -q "check_model_availability_prod.py"; then
        echo "Cron job already exists. Removing old entry..."
        crontab -l 2>/dev/null | grep -v "check_model_availability_prod.py" | crontab -
    fi
    
    # Add new cron job
    (crontab -l 2>/dev/null; echo "$CRON_ENTRY") | crontab -
    
    echo "✓ Cron job installed successfully"
fi

echo ""
echo "Cron job details:"
echo "  Schedule: Daily at 9:00 AM UTC"
echo "  Script: $SCRIPT_PATH"
echo "  Log file: $LOG_FILE"
echo ""
echo "To view current cron jobs: crontab -l"
echo "To remove this cron job: crontab -e (then delete the line)"
echo ""
echo "To test the script manually:"
if [ "$DEPLOYMENT_TYPE" = "docker" ]; then
    echo "  docker exec $CONTAINER_NAME python3 $SCRIPT_PATH"
else
    echo "  $PYTHON_PATH $SCRIPT_PATH"
fi

