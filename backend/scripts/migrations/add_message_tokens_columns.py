#!/usr/bin/env python3
"""
Migration script to add input_tokens and output_tokens columns to conversation_messages table.

These columns track token usage from OpenRouter API responses:
- input_tokens: Input tokens for user messages (null for assistant messages)
- output_tokens: Output tokens for assistant messages (null for user messages)

Works with both SQLite (development) and PostgreSQL (production).
This script is idempotent - safe to run multiple times.
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

    if use_postgresql:
        # PostgreSQL syntax
        cursor.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}")
    else:
        # SQLite syntax
        cursor.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}")

    print(f"  [OK] Added column '{column_name}' to '{table_name}' table")
    return True


def main():
    """Main migration function."""
    print(f"\n{'='*60}")
    print("Migration: Add Token Columns to conversation_messages Table")
    print(f"{'='*60}\n")

    # Check if conversation_messages table exists
    if not table_exists("conversation_messages"):
        print("WARNING: 'conversation_messages' table does not exist.")
        print("It will be created automatically when the application starts.")
        print("Migration complete (no action needed).")
        conn.close()
        sys.exit(0)

    print("Adding token columns to conversation_messages table...")

    try:
        # Add input_tokens column
        input_added = add_column_if_not_exists("conversation_messages", "input_tokens", "INTEGER")

        # Add output_tokens column
        output_added = add_column_if_not_exists("conversation_messages", "output_tokens", "INTEGER")

        # Commit the changes
        conn.commit()

        if input_added or output_added:
            print("\n✓ Migration completed successfully!")
        else:
            print("\n✓ No changes needed - columns already exist.")

        # Verify the columns
        print("\nVerifying table structure...")
        if use_postgresql:
            cursor.execute(
                """
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = 'conversation_messages'
                ORDER BY ordinal_position;
            """
            )
            columns = cursor.fetchall()
            print("\nconversation_messages table columns:")
            for col in columns:
                print(f"  - {col[0]} ({col[1]})")
        else:
            cursor.execute("PRAGMA table_info(conversation_messages)")
            columns = cursor.fetchall()
            print("\nconversation_messages table columns:")
            for col in columns:
                print(f"  - {col[1]} ({col[2]})")

    except Exception as e:
        conn.rollback()
        print(f"\n[ERROR] Migration failed: {e}")
        conn.close()
        sys.exit(1)

    conn.close()

    print(f"\n{'='*60}")
    print("Migration complete!")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
