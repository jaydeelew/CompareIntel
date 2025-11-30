#!/bin/bash
# Setup script for daily model availability check cron job

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PYTHON_PATH=$(which python3)
SCRIPT_PATH="$SCRIPT_DIR/check_model_availability.py"
LOG_DIR="$PROJECT_ROOT/logs"
LOG_FILE="$LOG_DIR/model_check.log"

# Create logs directory if it doesn't exist
mkdir -p "$LOG_DIR"

# Make script executable
chmod +x "$SCRIPT_PATH"

# Create cron job entry (runs daily at 9:00 AM UTC)
CRON_ENTRY="0 9 * * * cd $PROJECT_ROOT && $PYTHON_PATH $SCRIPT_PATH >> $LOG_FILE 2>&1"

# Check if cron job already exists
if crontab -l 2>/dev/null | grep -q "check_model_availability.py"; then
    echo "Cron job already exists. Removing old entry..."
    crontab -l 2>/dev/null | grep -v "check_model_availability.py" | crontab -
fi

# Add new cron job
(crontab -l 2>/dev/null; echo "$CRON_ENTRY") | crontab -

echo "✓ Daily model availability check cron job installed successfully"
echo ""
echo "Cron job details:"
echo "  Schedule: Daily at 9:00 AM UTC"
echo "  Script: $SCRIPT_PATH"
echo "  Log file: $LOG_FILE"
echo ""
echo "To view current cron jobs: crontab -l"
echo "To remove this cron job: crontab -e (then delete the line)"
echo ""
echo "To test the script manually, run:"
echo "  $PYTHON_PATH $SCRIPT_PATH"

