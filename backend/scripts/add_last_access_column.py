#!/usr/bin/env python3
"""
Migration script to add last_access column to users table.

Adds:
- last_access (DateTime, nullable) - Last time user accessed the website

This script is safe to run multiple times - it checks if the column exists before adding it.
"""

import sys
import os
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import text, inspect
from app.database import engine, SessionLocal
from app.models import User


def column_exists(conn, table_name: str, column_name: str) -> bool:
    """Check if a column exists in a table."""
    inspector = inspect(engine)
    columns = [col['name'] for col in inspector.get_columns(table_name)]
    return column_name in columns


def main():
    """Run the migration."""
    print("=" * 60)
    print("Users Table Migration - Add last_access Column")
    print("=" * 60)
    print()
    
    # Check database type
    db_url = str(engine.url)
    is_sqlite = "sqlite" in db_url.lower()
    is_postgresql = db_url.startswith("postgresql")
    
    print(f"Database type: {'SQLite' if is_sqlite else 'PostgreSQL' if is_postgresql else 'Unknown'}")
    print(f"Database URL: {db_url}")
    print()
    
    # Get a connection
    conn = engine.connect()
    
    try:
        # Check if users table exists
        inspector = inspect(engine)
        if 'users' not in inspector.get_table_names():
            print("ERROR: users table does not exist!")
            print("Please run database initialization first.")
            return 1
        
        print("Checking existing columns...")
        existing_columns = [col['name'] for col in inspector.get_columns('users')]
        print(f"Existing columns: {', '.join(existing_columns)}")
        print()
        
        # Add missing column
        print("Adding missing column...")
        print()
        
        if is_sqlite:
            # SQLite syntax
            if 'last_access' not in existing_columns:
                print("Adding column last_access to users...")
                conn.execute(text("ALTER TABLE users ADD COLUMN last_access DATETIME"))
                conn.commit()
                print("✓ Added last_access")
            else:
                print("✓ Column last_access already exists, skipping")
                
        elif is_postgresql:
            # PostgreSQL syntax - use transaction
            trans = conn.begin()
            try:
                if 'last_access' not in existing_columns:
                    print("Adding column last_access to users...")
                    conn.execute(text("ALTER TABLE users ADD COLUMN last_access TIMESTAMP"))
                    print("✓ Added last_access")
                else:
                    print("✓ Column last_access already exists, skipping")
                
                trans.commit()
            except Exception as e:
                trans.rollback()
                raise
        else:
            print("ERROR: Unsupported database type")
            return 1
        
        print()
        print("=" * 60)
        print("Migration completed successfully!")
        print("=" * 60)
        print()
        print("Note: The last_access field will be automatically updated when:")
        print("  - Users log in")
        print("  - Users make authenticated requests (updated every 60 seconds)")
        return 0
        
    except Exception as e:
        print(f"\nERROR: Migration failed: {e}")
        import traceback
        traceback.print_exc()
        return 1
    finally:
        conn.close()


if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)
