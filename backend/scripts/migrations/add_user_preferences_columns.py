#!/usr/bin/env python3
"""
Migration script to add new columns to user_preferences table.

Adds:
- zipcode (String(10), nullable) - User's zipcode for location-based results
- remember_state_on_logout (Boolean, default False) - Remember session state on logout

This script is safe to run multiple times - it checks if columns exist before adding them.
"""

import sys
import os
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).parent.parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import text, inspect
from app.database import engine, SessionLocal
from app.models import UserPreference


def column_exists(conn, table_name: str, column_name: str) -> bool:
    """Check if a column exists in a table."""
    inspector = inspect(engine)
    columns = [col['name'] for col in inspector.get_columns(table_name)]
    return column_name in columns


def main():
    """Run the migration."""
    print("=" * 60)
    print("User Preferences Table Migration")
    print("Adding: zipcode, remember_state_on_logout columns")
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
        # Check if user_preferences table exists
        inspector = inspect(engine)
        if 'user_preferences' not in inspector.get_table_names():
            print("ERROR: user_preferences table does not exist!")
            print("Please run database initialization first.")
            return 1
        
        print("Checking existing columns...")
        existing_columns = [col['name'] for col in inspector.get_columns('user_preferences')]
        print(f"Existing columns: {', '.join(existing_columns)}")
        print()
        
        # Add missing columns
        print("Adding missing columns...")
        print()
        
        columns_added = 0
        
        if is_sqlite:
            # SQLite syntax
            if 'zipcode' not in existing_columns:
                print("Adding column zipcode to user_preferences...")
                conn.execute(text("ALTER TABLE user_preferences ADD COLUMN zipcode VARCHAR(10)"))
                conn.commit()
                print("✓ Added zipcode")
                columns_added += 1
            else:
                print("✓ Column zipcode already exists, skipping")
            
            if 'remember_state_on_logout' not in existing_columns:
                print("Adding column remember_state_on_logout to user_preferences...")
                conn.execute(text("ALTER TABLE user_preferences ADD COLUMN remember_state_on_logout BOOLEAN DEFAULT 0"))
                conn.commit()
                print("✓ Added remember_state_on_logout")
                columns_added += 1
            else:
                print("✓ Column remember_state_on_logout already exists, skipping")
                
        elif is_postgresql:
            # PostgreSQL syntax - use transaction
            trans = conn.begin()
            try:
                if 'zipcode' not in existing_columns:
                    print("Adding column zipcode to user_preferences...")
                    conn.execute(text("ALTER TABLE user_preferences ADD COLUMN zipcode VARCHAR(10)"))
                    print("✓ Added zipcode")
                    columns_added += 1
                else:
                    print("✓ Column zipcode already exists, skipping")
                
                if 'remember_state_on_logout' not in existing_columns:
                    print("Adding column remember_state_on_logout to user_preferences...")
                    conn.execute(text("ALTER TABLE user_preferences ADD COLUMN remember_state_on_logout BOOLEAN DEFAULT FALSE"))
                    print("✓ Added remember_state_on_logout")
                    columns_added += 1
                else:
                    print("✓ Column remember_state_on_logout already exists, skipping")
                
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
        print(f"Columns added: {columns_added}")
        print("=" * 60)
        print()
        print("New settings available in the user menu:")
        print("  - Zipcode: For location-based model results")
        print("  - Remember state on logout: Preserve session state")
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
