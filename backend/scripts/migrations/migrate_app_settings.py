#!/usr/bin/env python3
"""
Migration script to add AppSettings table for global application settings.

Run this once to add the app_settings table to your database.
This allows admins to control global settings like anonymous mock mode.

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
backend_dir = current_dir.parent.parent  # backend/scripts/migrations -> backend
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
        print("ERROR: Could not parse DATABASE_URL. Expected format: postgresql://user:password@host:port/database")
        sys.exit(1)
    
    db_user = match.group(2)
    db_password = match.group(3)
    db_host = match.group(4)
    db_port = match.group(5)
    db_name = match.group(6)
    
    try:
        import psycopg2
        conn = psycopg2.connect(
            host=db_host,
            port=db_port,
            user=db_user,
            password=db_password,
            database=db_name
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
        cursor.execute("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = %s
            );
        """, (table_name,))
        return cursor.fetchone()[0]
    else:
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table_name,)
        )
        return cursor.fetchone() is not None


def column_exists(table_name: str, column_name: str) -> bool:
    """Check if a column exists in a table."""
    if use_postgresql:
        cursor.execute("""
            SELECT EXISTS (
                SELECT FROM information_schema.columns 
                WHERE table_name = %s 
                AND column_name = %s
            );
        """, (table_name, column_name))
        return cursor.fetchone()[0]
    else:
        cursor.execute(f"PRAGMA table_info({table_name})")
        columns = [row[1] for row in cursor.fetchall()]
        return column_name in columns


def main():
    """Main migration function."""
    print(f"\n{'='*60}")
    print("Migration: Add AppSettings Table")
    print(f"{'='*60}\n")

    try:
        # Check if app_settings table already exists
        if table_exists("app_settings"):
            print("✅ app_settings table already exists")
            
            # Check if anonymous_mock_mode_enabled column exists
            if not column_exists("app_settings", "anonymous_mock_mode_enabled"):
                print("Adding anonymous_mock_mode_enabled column...")
                if use_postgresql:
                    cursor.execute("""
                        ALTER TABLE app_settings 
                        ADD COLUMN anonymous_mock_mode_enabled BOOLEAN DEFAULT FALSE
                    """)
                else:
                    cursor.execute("""
                        ALTER TABLE app_settings 
                        ADD COLUMN anonymous_mock_mode_enabled BOOLEAN DEFAULT 0
                    """)
                print("✅ Added anonymous_mock_mode_enabled column")
            else:
                print("✅ anonymous_mock_mode_enabled column already exists")
        else:
            # Create the app_settings table
            print("Creating app_settings table...")
            if use_postgresql:
                cursor.execute("""
                    CREATE TABLE app_settings (
                        id INTEGER PRIMARY KEY DEFAULT 1,
                        anonymous_mock_mode_enabled BOOLEAN DEFAULT FALSE,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """)
            else:
                cursor.execute("""
                    CREATE TABLE app_settings (
                        id INTEGER PRIMARY KEY DEFAULT 1,
                        anonymous_mock_mode_enabled BOOLEAN DEFAULT 0,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """)
            
            # Check if default row exists and insert if not
            cursor.execute("SELECT id FROM app_settings WHERE id = 1")
            if cursor.fetchone() is None:
                cursor.execute("""
                    INSERT INTO app_settings (id, anonymous_mock_mode_enabled) 
                    VALUES (1, FALSE)
                """)
            
            print("✅ Created app_settings table with default settings")
        
        conn.commit()
        print("\n✅ Migration completed successfully!")
        
    except Exception as e:
        print(f"\n❌ Error during migration: {e}")
        conn.rollback()
        conn.close()
        sys.exit(1)
    
    conn.close()
    
    print(f"\n{'='*60}")
    print("Migration complete!")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
