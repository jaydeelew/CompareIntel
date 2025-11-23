#!/usr/bin/env python3
"""
Script to add credit system columns to existing database.
This is a one-time migration script for databases that were created
before the credit system fields were added.

Requires Python 3.9+
"""
import sqlite3
from pathlib import Path

# Try to load environment variables if dotenv is available
try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass
import os

# Determine database path
current_dir = Path(__file__).parent.resolve()
backend_dir = current_dir
project_root = backend_dir.parent

# Check for SQLite database
db_paths = [
    backend_dir / "data" / "compareintel.db",
    project_root / "backend" / "data" / "compareintel.db",
    Path("compareintel.db"),  # Old location
]

db_path = None
for path in db_paths:
    if path.exists():
        db_path = path
        break

if not db_path:
    # Try to get from environment
    database_url = os.getenv("DATABASE_URL", "")
    if database_url.startswith("sqlite:///"):
        db_path = Path(database_url.replace("sqlite:///", ""))
        if not db_path.is_absolute():
            db_path = backend_dir / db_path
    else:
        print("Could not find SQLite database. If using PostgreSQL, please run migrations manually.")
        exit(1)

print(f"Using database: {db_path}")

# Connect to database
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Check if users table exists
cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
if not cursor.fetchone():
    print("ERROR: users table does not exist!")
    conn.close()
    exit(1)

# Get existing columns
cursor.execute("PRAGMA table_info(users)")
existing_columns = [row[1] for row in cursor.fetchall()]
print(f"Existing columns: {', '.join(existing_columns)}")

# Columns to add
columns_to_add = [
    ("monthly_credits_allocated", "INTEGER DEFAULT 0"),
    ("credits_used_this_period", "INTEGER DEFAULT 0"),
    ("total_credits_used", "INTEGER DEFAULT 0"),
    ("billing_period_start", "DATETIME"),
    ("billing_period_end", "DATETIME"),
    ("credits_reset_at", "DATETIME"),
]

# Add missing columns
added_columns = []
for column_name, column_type in columns_to_add:
    if column_name not in existing_columns:
        try:
            cursor.execute(f"ALTER TABLE users ADD COLUMN {column_name} {column_type}")
            added_columns.append(column_name)
            print(f"[OK] Added column: {column_name}")
        except sqlite3.OperationalError as e:
            print(f"[ERROR] Failed to add column {column_name}: {e}")
    else:
        print(f"[SKIP] Column {column_name} already exists")

# Set default values for existing users based on their tier
if "monthly_credits_allocated" in added_columns or "monthly_credits_allocated" not in existing_columns:
    print("\nSetting default credit allocations based on subscription tier...")
    cursor.execute(
        """
        UPDATE users 
        SET monthly_credits_allocated = CASE
            WHEN subscription_tier = 'anonymous' THEN 50
            WHEN subscription_tier = 'free' THEN 100
            WHEN subscription_tier = 'starter' THEN 1200
            WHEN subscription_tier = 'starter_plus' THEN 2500
            WHEN subscription_tier = 'pro' THEN 5000
            WHEN subscription_tier = 'pro_plus' THEN 10000
            ELSE 0
        END
        WHERE monthly_credits_allocated IS NULL OR monthly_credits_allocated = 0
    """
    )
    rows_updated = cursor.rowcount
    print(f"[OK] Updated {rows_updated} users with default credit allocations")

# Now handle usage_logs table
print("\n--- Checking usage_logs table ---")
cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='usage_logs'")
if not cursor.fetchone():
    print("WARNING: usage_logs table does not exist. It will be created when the application starts.")
else:
    # Get existing columns in usage_logs
    cursor.execute("PRAGMA table_info(usage_logs)")
    existing_usage_logs_columns = [row[1] for row in cursor.fetchall()]
    print(f"Existing usage_logs columns: {', '.join(existing_usage_logs_columns)}")

    # Columns to add to usage_logs
    usage_logs_columns_to_add = [
        ("input_tokens", "INTEGER"),
        ("output_tokens", "INTEGER"),
        ("total_tokens", "INTEGER"),
        ("effective_tokens", "INTEGER"),
        ("credits_used", "DECIMAL(10, 4)"),
        ("actual_cost", "DECIMAL(10, 4)"),
    ]

    # Add missing columns to usage_logs
    added_usage_logs_columns = []
    for column_name, column_type in usage_logs_columns_to_add:
        if column_name not in existing_usage_logs_columns:
            try:
                cursor.execute(f"ALTER TABLE usage_logs ADD COLUMN {column_name} {column_type}")
                added_usage_logs_columns.append(column_name)
                print(f"[OK] Added column to usage_logs: {column_name}")
            except sqlite3.OperationalError as e:
                print(f"[ERROR] Failed to add column {column_name} to usage_logs: {e}")
        else:
            print(f"[SKIP] Column {column_name} already exists in usage_logs")

# Commit changes
conn.commit()
conn.close()

print("\n[OK] Migration complete!")
if added_columns:
    print(f"Added columns to users: {', '.join(added_columns)}")
if "added_usage_logs_columns" in locals() and added_usage_logs_columns:
    print(f"Added columns to usage_logs: {', '.join(added_usage_logs_columns)}")
if (not added_columns) and ("added_usage_logs_columns" not in locals() or not added_usage_logs_columns):
    print("No new columns were added (all columns already exist)")
