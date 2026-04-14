#!/bin/bash
# Setup script for weekly new model discovery cron job.
# Supports both Docker and host-based deployments.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

if [ -f "/.dockerenv" ] || [ -n "$DOCKER_CONTAINER" ]; then
    echo "Running inside Docker container"
    DEPLOYMENT_TYPE="docker"
    PYTHON_PATH="/usr/local/bin/python3"
    SCRIPT_PATH="/app/scripts/new_model_discovery.py"
    LOG_FILE="/app/logs/model_discovery.log"
else
    echo "Running on host system"
    DEPLOYMENT_TYPE="host"
    PYTHON_PATH=$(which python3)
    SCRIPT_PATH="$SCRIPT_DIR/new_model_discovery.py"
    LOG_DIR="$PROJECT_ROOT/logs"
    LOG_FILE="$LOG_DIR/model_discovery.log"
    mkdir -p "$LOG_DIR"
fi

chmod +x "$SCRIPT_PATH"

echo "Deployment type: $DEPLOYMENT_TYPE"
echo "Python path: $PYTHON_PATH"
echo "Script path: $SCRIPT_PATH"
echo "Log file: $LOG_FILE"
echo ""

CRON_MARKER="new_model_discovery.py"

if [ "$DEPLOYMENT_TYPE" = "docker" ]; then
    CONTAINER_NAME=$(docker compose -f "$PROJECT_ROOT/docker-compose.ssl.yml" ps -q backend 2>/dev/null || \
                     docker compose -f "$PROJECT_ROOT/docker-compose.prod.yml" ps -q backend 2>/dev/null || \
                     echo "compareintel-backend-1")

    # Runs every Monday at 10:00 AM UTC
    CRON_ENTRY="0 10 * * 1 docker exec $CONTAINER_NAME python3 $SCRIPT_PATH >> $LOG_FILE 2>&1"
else
    CRON_ENTRY="0 10 * * 1 cd $PROJECT_ROOT && $PYTHON_PATH $SCRIPT_PATH >> $LOG_FILE 2>&1"
fi

# Remove existing entry if present
if crontab -l 2>/dev/null | grep -q "$CRON_MARKER"; then
    echo "Cron job already exists. Removing old entry..."
    crontab -l 2>/dev/null | grep -v "$CRON_MARKER" | crontab -
fi

# Install the new entry
TEMP_CRON=$(mktemp)
trap "rm -f '$TEMP_CRON'" EXIT
crontab -l 2>/dev/null > "$TEMP_CRON" || true
echo "$CRON_ENTRY" >> "$TEMP_CRON"
crontab "$TEMP_CRON"

if crontab -l 2>/dev/null | grep -q "$CRON_MARKER"; then
    echo "✓ Weekly model discovery cron job installed successfully"
else
    echo "✗ ERROR: Failed to install cron job."
    exit 1
fi

echo ""
echo "Cron job details:"
echo "  Schedule: Every Monday at 10:00 AM UTC"
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
