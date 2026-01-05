# Database migration scripts directory
# 
# This directory contains database migration scripts for schema changes.
# These scripts are idempotent and safe to run multiple times.
#
# Migration scripts:
# - add_conversation_columns.py - Adds conversation_type, parent_conversation_id, breakout_model_id
# - add_app_settings_search_columns.py - Adds search provider columns to app_settings
# - add_last_access_column.py - Adds last_access timestamp to users table
#
# Usage:
#   docker compose exec backend python3 /app/scripts/migrations/<script_name>.py

