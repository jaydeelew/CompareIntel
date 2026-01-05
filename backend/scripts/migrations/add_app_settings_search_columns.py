#!/usr/bin/env python3
"""
Migration script to add search provider columns to app_settings table.

Adds:
- active_search_provider (String(50), nullable)
- search_provider_config (Text, nullable)
- web_search_enabled (Boolean, default=False)

This script is safe to run multiple times - it checks if columns exist before adding them.
"""

import sys
import os
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import text, inspect
from app.database import engine, SessionLocal
from app.models import AppSettings


def column_exists(conn, table_name: str, column_name: str) -> bool:
    """Check if a column exists in a table."""
    inspector = inspect(engine)
    columns = [col['name'] for col in inspector.get_columns(table_name)]
    return column_name in columns


def main():
    """Run the migration."""
    print("=" * 60)
    print("App Settings Search Provider Columns Migration")
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
        # Check if app_settings table exists
        inspector = inspect(engine)
        if 'app_settings' not in inspector.get_table_names():
            print("ERROR: app_settings table does not exist!")
            print("Please run database initialization first.")
            return 1
        
        print("Checking existing columns...")
        existing_columns = [col['name'] for col in inspector.get_columns('app_settings')]
        print(f"Existing columns: {', '.join(existing_columns)}")
        print()
        
        # Add missing columns
        print("Adding missing columns...")
        print()
        
        if is_sqlite:
            # SQLite syntax - each ALTER TABLE auto-commits
            if 'active_search_provider' not in existing_columns:
                print("Adding column active_search_provider to app_settings...")
                conn.execute(text("ALTER TABLE app_settings ADD COLUMN active_search_provider VARCHAR(50)"))
                conn.commit()
                print("✓ Added active_search_provider")
            else:
                print("✓ Column active_search_provider already exists, skipping")
            
            if 'search_provider_config' not in existing_columns:
                print("Adding column search_provider_config to app_settings...")
                conn.execute(text("ALTER TABLE app_settings ADD COLUMN search_provider_config TEXT"))
                conn.commit()
                print("✓ Added search_provider_config")
            else:
                print("✓ Column search_provider_config already exists, skipping")
            
            if 'web_search_enabled' not in existing_columns:
                print("Adding column web_search_enabled to app_settings...")
                conn.execute(text("ALTER TABLE app_settings ADD COLUMN web_search_enabled BOOLEAN DEFAULT 0"))
                conn.commit()
                print("✓ Added web_search_enabled")
            else:
                print("✓ Column web_search_enabled already exists, skipping")
                
        elif is_postgresql:
            # PostgreSQL syntax - use transaction
            trans = conn.begin()
            try:
                if 'active_search_provider' not in existing_columns:
                    print("Adding column active_search_provider to app_settings...")
                    conn.execute(text("ALTER TABLE app_settings ADD COLUMN active_search_provider VARCHAR(50)"))
                    print("✓ Added active_search_provider")
                else:
                    print("✓ Column active_search_provider already exists, skipping")
                
                if 'search_provider_config' not in existing_columns:
                    print("Adding column search_provider_config to app_settings...")
                    conn.execute(text("ALTER TABLE app_settings ADD COLUMN search_provider_config TEXT"))
                    print("✓ Added search_provider_config")
                else:
                    print("✓ Column search_provider_config already exists, skipping")
                
                if 'web_search_enabled' not in existing_columns:
                    print("Adding column web_search_enabled to app_settings...")
                    conn.execute(text("ALTER TABLE app_settings ADD COLUMN web_search_enabled BOOLEAN DEFAULT FALSE"))
                    print("✓ Added web_search_enabled")
                else:
                    print("✓ Column web_search_enabled already exists, skipping")
                
                trans.commit()
            except Exception as e:
                trans.rollback()
                raise
        else:
            print("ERROR: Unsupported database type")
            return 1
        
        # Ensure app_settings row exists (create if it doesn't)
        print("\nChecking app_settings row...")
        result = conn.execute(text("SELECT COUNT(*) FROM app_settings"))
        count = result.scalar()
        if count == 0:
            print("Creating initial app_settings row...")
            if is_sqlite:
                conn.execute(text("""
                    INSERT INTO app_settings (id, anonymous_mock_mode_enabled, web_search_enabled)
                    VALUES (1, 0, 0)
                """))
            else:
                conn.execute(text("""
                    INSERT INTO app_settings (id, anonymous_mock_mode_enabled, web_search_enabled)
                    VALUES (1, FALSE, FALSE)
                """))
            conn.commit()
            print("✓ Created app_settings row")
        else:
            print(f"✓ App settings row already exists (count: {count})")
        
        print()
        print("=" * 60)
        print("Migration completed successfully!")
        print("=" * 60)
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

