#!/usr/bin/env python3
"""
Migration script to add missing columns to conversations table.

Adds:
- conversation_type (default: 'comparison')
- parent_conversation_id (nullable)
- breakout_model_id (nullable)

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
from app.models import Conversation


def column_exists(conn, table_name: str, column_name: str) -> bool:
    """Check if a column exists in a table."""
    inspector = inspect(engine)
    columns = [col['name'] for col in inspector.get_columns(table_name)]
    return column_name in columns


def add_column_if_not_exists(conn, table_name: str, column_name: str, column_definition: str):
    """Add a column to a table if it doesn't exist."""
    if not column_exists(conn, table_name, column_name):
        print(f"Adding column {column_name} to {table_name}...")
        conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_definition}"))
        conn.commit()
        print(f"✓ Added {column_name}")
    else:
        print(f"✓ Column {column_name} already exists, skipping")


def main():
    """Run the migration."""
    print("=" * 60)
    print("Conversation Table Migration")
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
        # Check if conversations table exists
        inspector = inspect(engine)
        if 'conversations' not in inspector.get_table_names():
            print("ERROR: conversations table does not exist!")
            print("Please run database initialization first.")
            return 1
        
        print("Checking existing columns...")
        existing_columns = [col['name'] for col in inspector.get_columns('conversations')]
        print(f"Existing columns: {', '.join(existing_columns)}")
        print()
        
        # Track if we added conversation_type
        added_conversation_type = False
        
        # Add missing columns
        print("Adding missing columns...")
        print()
        
        if is_sqlite:
            # SQLite syntax - each ALTER TABLE auto-commits
            if 'conversation_type' not in existing_columns:
                print("Adding column conversation_type to conversations...")
                conn.execute(text("ALTER TABLE conversations ADD COLUMN conversation_type VARCHAR(20) NOT NULL DEFAULT 'comparison'"))
                conn.commit()
                print("✓ Added conversation_type")
                added_conversation_type = True
            else:
                print("✓ Column conversation_type already exists, skipping")
            
            if 'parent_conversation_id' not in existing_columns:
                print("Adding column parent_conversation_id to conversations...")
                conn.execute(text("ALTER TABLE conversations ADD COLUMN parent_conversation_id INTEGER"))
                conn.commit()
                print("✓ Added parent_conversation_id")
            else:
                print("✓ Column parent_conversation_id already exists, skipping")
            
            if 'breakout_model_id' not in existing_columns:
                print("Adding column breakout_model_id to conversations...")
                conn.execute(text("ALTER TABLE conversations ADD COLUMN breakout_model_id VARCHAR(255)"))
                conn.commit()
                print("✓ Added breakout_model_id")
            else:
                print("✓ Column breakout_model_id already exists, skipping")
                
        elif is_postgresql:
            # PostgreSQL syntax - use transaction
            trans = conn.begin()
            try:
                if 'conversation_type' not in existing_columns:
                    print("Adding column conversation_type to conversations...")
                    conn.execute(text("ALTER TABLE conversations ADD COLUMN conversation_type VARCHAR(20) NOT NULL DEFAULT 'comparison'"))
                    print("✓ Added conversation_type")
                    added_conversation_type = True
                else:
                    print("✓ Column conversation_type already exists, skipping")
                
                if 'parent_conversation_id' not in existing_columns:
                    print("Adding column parent_conversation_id to conversations...")
                    conn.execute(text("ALTER TABLE conversations ADD COLUMN parent_conversation_id INTEGER"))
                    print("✓ Added parent_conversation_id")
                else:
                    print("✓ Column parent_conversation_id already exists, skipping")
                
                if 'breakout_model_id' not in existing_columns:
                    print("Adding column breakout_model_id to conversations...")
                    conn.execute(text("ALTER TABLE conversations ADD COLUMN breakout_model_id VARCHAR(255)"))
                    print("✓ Added breakout_model_id")
                else:
                    print("✓ Column breakout_model_id already exists, skipping")
                
                trans.commit()
            except Exception as e:
                trans.rollback()
                raise
        else:
            print("ERROR: Unsupported database type")
            return 1
        
        # For SQLite, we need to set default values for existing rows after adding the column
        if is_sqlite and added_conversation_type:
            result = conn.execute(text("SELECT COUNT(*) FROM conversations"))
            count = result.scalar()
            if count > 0:
                print(f"\nUpdating {count} existing rows with default conversation_type...")
                conn.execute(text("UPDATE conversations SET conversation_type = 'comparison' WHERE conversation_type IS NULL"))
                conn.commit()
                print("✓ Updated existing rows")
        
        # Add foreign key constraint for parent_conversation_id if it doesn't exist
        # Note: SQLite has limited ALTER TABLE support, so we skip FK constraints for SQLite
        if is_postgresql:
            print("\nChecking foreign key constraints...")
            # Check if FK constraint exists (this is a simplified check)
            # In production, you might want more robust constraint checking
            try:
                result = conn.execute(text("""
                    SELECT COUNT(*) FROM information_schema.table_constraints 
                    WHERE table_name = 'conversations' 
                    AND constraint_name = 'conversations_parent_conversation_id_fkey'
                """))
                if result.scalar() == 0:
                    print("Adding foreign key constraint for parent_conversation_id...")
                    trans = conn.begin()
                    try:
                        conn.execute(text("""
                            ALTER TABLE conversations 
                            ADD CONSTRAINT conversations_parent_conversation_id_fkey 
                            FOREIGN KEY (parent_conversation_id) 
                            REFERENCES conversations(id) 
                            ON DELETE SET NULL
                        """))
                        trans.commit()
                        print("✓ Added foreign key constraint")
                    except Exception as e:
                        trans.rollback()
                        raise
                else:
                    print("✓ Foreign key constraint already exists")
            except Exception as e:
                print(f"Note: Could not add foreign key constraint: {e}")
                print("(This is okay if it already exists)")
        
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

