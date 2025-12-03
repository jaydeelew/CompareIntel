#!/usr/bin/env python3
"""
Script to add timezone column to user_preferences table.
This migration adds timezone support for credit reset timing.

Works with both SQLite (development) and PostgreSQL (production).
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

# Check if user_preferences table exists
if use_postgresql:
    cursor.execute("""
        SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_name = 'user_preferences'
        );
    """)
    table_exists = cursor.fetchone()[0]
else:
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='user_preferences'")
    table_exists = cursor.fetchone() is not None

if not table_exists:
    print("WARNING: user_preferences table does not exist.")
    print("It will be created automatically when the application starts.")
    print("Migration complete (no action needed).")
    conn.close()
    sys.exit(0)

# Check if timezone column already exists
if use_postgresql:
    cursor.execute("""
        SELECT EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_name = 'user_preferences' 
            AND column_name = 'timezone'
        );
    """)
    column_exists = cursor.fetchone()[0]
else:
    cursor.execute("PRAGMA table_info(user_preferences)")
    existing_columns = [row[1] for row in cursor.fetchall()]
    column_exists = "timezone" in existing_columns

if column_exists:
    print("[SKIP] Column 'timezone' already exists in user_preferences table")
    conn.close()
    sys.exit(0)

# Add timezone column
print("Adding 'timezone' column to user_preferences table...")
try:
    if use_postgresql:
        cursor.execute("""
            ALTER TABLE user_preferences 
            ADD COLUMN timezone VARCHAR(50) DEFAULT 'UTC';
        """)
    else:
        cursor.execute("""
            ALTER TABLE user_preferences 
            ADD COLUMN timezone VARCHAR(50) DEFAULT 'UTC';
        """)
    
    conn.commit()
    print("[OK] Added 'timezone' column to user_preferences table")
    
    # Set default value for existing rows (if any)
    if use_postgresql:
        cursor.execute("""
            UPDATE user_preferences 
            SET timezone = 'UTC' 
            WHERE timezone IS NULL;
        """)
    else:
        cursor.execute("""
            UPDATE user_preferences 
            SET timezone = 'UTC' 
            WHERE timezone IS NULL;
        """)
    
    rows_updated = cursor.rowcount
    if rows_updated > 0:
        print(f"[OK] Updated {rows_updated} existing user preferences with default timezone (UTC)")
    
    conn.commit()
    
except Exception as e:
    print(f"[ERROR] Failed to add timezone column: {e}")
    conn.rollback()
    conn.close()
    sys.exit(1)

conn.close()
print("\n[OK] Migration complete!")
print("All user preferences now have timezone support.")
print("Default timezone is set to 'UTC' for existing users.")
print("Users' timezones will be auto-detected from their browser on first use.")

