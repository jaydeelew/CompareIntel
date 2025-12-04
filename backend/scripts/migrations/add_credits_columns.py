#!/usr/bin/env python3
"""
Script to add credit system columns to existing database.
This is a one-time migration script for databases that were created
before the credit system fields were added.

Works with both SQLite (development) and PostgreSQL (production).
This script is idempotent - safe to run multiple times.

Requires Python 3.9+
"""

import os
import sys
from pathlib import Path

# Try to load environment variables if dotenv is available
try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass

# Determine database path and type
current_dir = Path(__file__).parent.resolve()
backend_dir = current_dir
project_root = backend_dir.parent

# Check database type from environment
database_url = os.getenv("DATABASE_URL", "")

if database_url.startswith("postgresql://") or database_url.startswith("postgres://"):
    # PostgreSQL (production)
    print("Detected PostgreSQL database")
    use_postgresql = True

    # Parse connection string
    import re

    # Extract connection details
    # Format: postgresql://user:password@host:port/database
    match = re.match(r"postgres(ql)?://([^:]+):([^@]+)@([^:]+):(\d+)/(.+)", database_url)
    if not match:
        print(
            "ERROR: Could not parse DATABASE_URL. Expected format: postgresql://user:password@host:port/database"
        )
        sys.exit(1)

    db_user = match.group(2)
    db_password = match.group(3)
    db_host = match.group(4)
    db_port = match.group(5)
    db_name = match.group(6)

    try:
        import psycopg2

        conn = psycopg2.connect(
            host=db_host, port=db_port, user=db_user, password=db_password, database=db_name
        )
        cursor = conn.cursor()
        print(f"Connected to PostgreSQL database: {db_name} on {db_host}:{db_port}")
    except ImportError:
        print("ERROR: psycopg2 not installed. Install it with: pip install psycopg2-binary")
        sys.exit(1)
    except Exception as e:
        print(f"ERROR: Could not connect to PostgreSQL database: {e}")
        sys.exit(1)

elif database_url.startswith("sqlite:///"):
    # SQLite (development)
    print("Detected SQLite database")
    use_postgresql = False

    db_path = Path(database_url.replace("sqlite:///", ""))
    if not db_path.is_absolute():
        db_path = backend_dir / db_path

    if not db_path.exists():
        # Try common locations
        db_paths = [
            backend_dir / "data" / "compareintel.db",
            project_root / "backend" / "data" / "compareintel.db",
            Path("compareintel.db"),
        ]
        for path in db_paths:
            if path.exists():
                db_path = path
                break

    if not db_path.exists():
        print(f"ERROR: SQLite database not found at {db_path}")
        print("Please ensure the database exists or set DATABASE_URL environment variable.")
        sys.exit(1)

    import sqlite3

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    print(f"Connected to SQLite database: {db_path}")

else:
    # Try to find SQLite database (default for development)
    print("No DATABASE_URL set, trying to find SQLite database...")
    use_postgresql = False

    db_paths = [
        backend_dir / "data" / "compareintel.db",
        project_root / "backend" / "data" / "compareintel.db",
        Path("compareintel.db"),
    ]

    db_path = None
    for path in db_paths:
        if path.exists():
            db_path = path
            break

    if not db_path:
        print("ERROR: Could not find SQLite database.")
        print("Please set DATABASE_URL environment variable or ensure database exists.")
        sys.exit(1)

    import sqlite3

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    print(f"Connected to SQLite database: {db_path}")


def table_exists(table_name: str) -> bool:
    """Check if a table exists in the database."""
    if use_postgresql:
        cursor.execute(
            """
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = %s
            );
        """,
            (table_name,),
        )
        return cursor.fetchone()[0]
    else:
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table_name,)
        )
        return cursor.fetchone() is not None


def column_exists(table_name: str, column_name: str) -> bool:
    """Check if a column exists in a table."""
    if use_postgresql:
        cursor.execute(
            """
            SELECT EXISTS (
                SELECT FROM information_schema.columns 
                WHERE table_name = %s 
                AND column_name = %s
            );
        """,
            (table_name, column_name),
        )
        return cursor.fetchone()[0]
    else:
        cursor.execute(f"PRAGMA table_info({table_name})")
        columns = [row[1] for row in cursor.fetchall()]
        return column_name in columns


def add_column_if_not_exists(table_name: str, column_name: str, column_type: str) -> bool:
    """Add a column to a table if it doesn't already exist."""
    if column_exists(table_name, column_name):
        print(f"  [SKIP] Column '{column_name}' already exists in '{table_name}' table")
        return False

    cursor.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}")
    print(f"  [OK] Added column '{column_name}' to '{table_name}' table")
    return True


def main():
    """Main migration function."""
    print(f"\n{'='*60}")
    print("Migration: Add Credit System Columns")
    print(f"{'='*60}\n")

    added_users_columns = []
    added_usage_logs_columns = []

    # === USERS TABLE ===
    print("--- Checking users table ---")
    if not table_exists("users"):
        print("WARNING: 'users' table does not exist.")
        print("It will be created automatically when the application starts.")
    else:
        print("Adding credit columns to users table...")

        # Columns to add to users table
        users_columns = [
            ("monthly_credits_allocated", "INTEGER DEFAULT 0"),
            ("credits_used_this_period", "INTEGER DEFAULT 0"),
            ("total_credits_used", "INTEGER DEFAULT 0"),
            ("billing_period_start", "TIMESTAMP"),
            ("billing_period_end", "TIMESTAMP"),
            ("credits_reset_at", "TIMESTAMP"),
        ]

        try:
            for column_name, column_type in users_columns:
                if add_column_if_not_exists("users", column_name, column_type):
                    added_users_columns.append(column_name)

            # Set default values for existing users based on their tier
            if added_users_columns or not column_exists("users", "monthly_credits_allocated"):
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
                print(f"  [OK] Updated {rows_updated} users with default credit allocations")

            conn.commit()
            print("\n✓ Users table migration completed!")

        except Exception as e:
            conn.rollback()
            print(f"\n[ERROR] Users table migration failed: {e}")

    # === USAGE_LOGS TABLE ===
    print("\n--- Checking usage_logs table ---")
    if not table_exists("usage_logs"):
        print("WARNING: 'usage_logs' table does not exist.")
        print("It will be created automatically when the application starts.")
    else:
        print("Adding token/credit columns to usage_logs table...")

        # Columns to add to usage_logs table
        usage_logs_columns = [
            ("input_tokens", "INTEGER"),
            ("output_tokens", "INTEGER"),
            ("total_tokens", "INTEGER"),
            ("effective_tokens", "INTEGER"),
            ("credits_used", "DECIMAL(10, 4)"),
            ("actual_cost", "DECIMAL(10, 4)"),
        ]

        try:
            for column_name, column_type in usage_logs_columns:
                if add_column_if_not_exists("usage_logs", column_name, column_type):
                    added_usage_logs_columns.append(column_name)

            conn.commit()
            print("\n✓ Usage_logs table migration completed!")

        except Exception as e:
            conn.rollback()
            print(f"\n[ERROR] Usage_logs table migration failed: {e}")

    # === SUMMARY ===
    print(f"\n{'='*60}")
    print("Migration Summary")
    print(f"{'='*60}")

    if added_users_columns:
        print(f"Added columns to users: {', '.join(added_users_columns)}")
    else:
        print("Users table: No new columns added (all already exist or table missing)")

    if added_usage_logs_columns:
        print(f"Added columns to usage_logs: {', '.join(added_usage_logs_columns)}")
    else:
        print("Usage_logs table: No new columns added (all already exist or table missing)")

    # Verify users table structure
    if table_exists("users"):
        print("\nVerifying users table structure...")
        if use_postgresql:
            cursor.execute(
                """
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = 'users'
                AND column_name IN ('monthly_credits_allocated', 'credits_used_this_period', 
                                   'total_credits_used', 'billing_period_start', 
                                   'billing_period_end', 'credits_reset_at')
                ORDER BY ordinal_position;
            """
            )
            columns = cursor.fetchall()
            if columns:
                print("\nCredit columns in users table:")
                for col in columns:
                    print(f"  - {col[0]} ({col[1]})")
            else:
                print("\n[WARNING] Credit columns not found in users table!")
        else:
            cursor.execute("PRAGMA table_info(users)")
            all_columns = cursor.fetchall()
            credit_cols = [
                "monthly_credits_allocated",
                "credits_used_this_period",
                "total_credits_used",
                "billing_period_start",
                "billing_period_end",
                "credits_reset_at",
            ]
            print("\nCredit columns in users table:")
            for col in all_columns:
                if col[1] in credit_cols:
                    print(f"  - {col[1]} ({col[2]})")

    conn.close()

    print(f"\n{'='*60}")
    print("Migration complete!")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
