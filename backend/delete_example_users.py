#!/usr/bin/env python3
r"""
Script to delete all users with email ending in @example.com.

This script helps clean up test/example users from the database.
WARNING: This operation cannot be undone!

USAGE:
    # Interactive mode (requires confirmation by typing 'DELETE'):
    python3 delete_example_users.py

    # Non-interactive mode (skips confirmation):
    python3 delete_example_users.py --yes

    # Make script executable and run directly:
    chmod +x delete_example_users.py
    ./delete_example_users.py --yes

CUSTOMIZATION:
    To delete users with a different email pattern, modify line 39:
    
    # Current: Delete users ending in @example.com
    example_users = db.query(User).filter(User.email.endswith("@example.com")).all()
    
    # Examples of other patterns:
    # - Delete users starting with "test-":
    #   example_users = db.query(User).filter(User.email.startswith("test-")).all()
    # 
    # - Delete users containing "@test.":
    #   example_users = db.query(User).filter(User.email.contains("@test.")).all()
    #
    # - Delete users matching a regex pattern:
    #   from sqlalchemy import func
    #   example_users = db.query(User).filter(func.regexp_match(User.email, r'^test.*@.*\.com$')).all()
    #
    # - Delete users by multiple criteria (e.g., email AND role):
    #   example_users = db.query(User).filter(
    #       User.email.endswith("@example.com"),
    #       User.role == "user"
    #   ).all()
    #
    # - Delete users created before a certain date:
    #   from datetime import datetime
    #   cutoff_date = datetime(2024, 1, 1)
    #   example_users = db.query(User).filter(
    #       User.email.endswith("@example.com"),
    #       User.created_at < cutoff_date
    #   ).all()

CASCADE DELETION:
    When a user is deleted, the following related records are automatically deleted
    due to cascade relationships defined in the User model:
    - UserPreference (user preferences)
    - Conversation (user conversations)
    - SubscriptionHistory (subscription history)
    - PaymentTransaction (payment transactions)
    - CreditTransaction (credit transactions)
    
    Note: UsageLog records are NOT automatically deleted (no cascade), but they
    reference the user_id which will become invalid.

SAFETY:
    - Always review the list of users before confirming deletion
    - Consider running without --yes first to see what would be deleted
    - The script uses database transactions - if an error occurs, changes are rolled back
    - Make a database backup before running in production environments
"""

import os
import sys
import argparse
from pathlib import Path

# Load environment variables from .env file
from dotenv import load_dotenv
backend_dir = Path(__file__).parent.resolve()
load_dotenv(backend_dir / ".env")

# Add the backend directory to the Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models import User


def delete_example_users(skip_confirmation=False):
    """
    Delete all users with email ending in @example.com.
    
    Args:
        skip_confirmation (bool): If True, skip the confirmation prompt and proceed
                                 with deletion. If False, require user to type 'DELETE'
                                 to confirm.
    
    Returns:
        None
    
    Example:
        # Interactive deletion (requires confirmation):
        delete_example_users(skip_confirmation=False)
        
        # Non-interactive deletion (no confirmation):
        delete_example_users(skip_confirmation=True)
    """
    print("CompareIntel - Delete Example Users")
    print("=" * 50)
    print("This script will delete all users with email ending in @example.com")
    print("WARNING: This operation cannot be undone!")
    print()

    # Get database session
    db = SessionLocal()

    try:
        # Find all users with email ending in @example.com
        # 
        # TO CUSTOMIZE: Modify this filter to match different criteria.
        # See the module docstring for examples of other filter patterns.
        # 
        # Common filter methods:
        # - .endswith(suffix)     : Email ends with suffix
        # - .startswith(prefix)   : Email starts with prefix
        # - .contains(substring)  : Email contains substring
        # - .like(pattern)        : SQL LIKE pattern matching
        # - .in_(list)            : Email in a list of values
        example_users = db.query(User).filter(User.email.endswith("@example.com")).all()

        if not example_users:
            print("No users found with email ending in @example.com.")
            return

        # Display users that will be deleted
        print(f"Found {len(example_users)} user(s) to delete:")
        print("-" * 50)
        for user in example_users:
            print(f"  ID: {user.id}")
            print(f"  Email: {user.email}")
            print(f"  Role: {user.role}")
            print(f"  Created: {user.created_at}")
            print()

        # Confirm deletion (unless --yes flag is used)
        if not skip_confirmation:
            print("⚠️  WARNING: This will permanently delete these users and all associated data!")
            response = input("Do you want to proceed? Type 'DELETE' to confirm: ").strip()

            if response != "DELETE":
                print("Deletion cancelled.")
                return
        else:
            print("⚠️  WARNING: Proceeding with deletion (--yes flag provided)")
            print()

        # Delete users one by one
        # Note: SQLAlchemy will handle cascade deletions automatically based on
        # the relationships defined in the User model (cascade="all, delete-orphan")
        deleted_count = 0
        for user in example_users:
            try:
                email = user.email
                user_id = user.id
                db.delete(user)
                deleted_count += 1
                print(f"✓ Deleted user: {email} (ID: {user_id})")
            except Exception as e:
                print(f"✗ Error deleting user {user.email}: {e}")

        # Commit the transaction
        # All deletions happen in a single transaction - if any error occurs,
        # the entire operation is rolled back (see except block below)
        db.commit()
        print()
        print(f"✅ Successfully deleted {deleted_count} user(s).")

    except Exception as e:
        print(f"❌ Error: {e}")
        db.rollback()
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        db.close()


def main():
    """
    Main function - handles command-line arguments and executes deletion.
    
    Command-line arguments:
        --yes    : Skip confirmation prompt and proceed with deletion immediately
                   Use this flag for automated scripts or when you're certain
                   about the deletion.
    
    Examples:
        # See what would be deleted (interactive):
        python3 delete_example_users.py
        
        # Delete without confirmation (non-interactive):
        python3 delete_example_users.py --yes
        
        # Get help:
        python3 delete_example_users.py --help
    """
    parser = argparse.ArgumentParser(
        description="Delete all users with email ending in @example.com",
        epilog=(
            "Examples:\n"
            "  %(prog)s                    # Interactive mode with confirmation\n"
            "  %(prog)s --yes              # Non-interactive mode (skip confirmation)\n"
            "\n"
            "For customization instructions, see the script's docstring."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "--yes",
        action="store_true",
        help="Skip confirmation prompt and proceed with deletion (use with caution!)",
    )
    args = parser.parse_args()

    try:
        delete_example_users(skip_confirmation=args.yes)
    except KeyboardInterrupt:
        print("\n\nOperation cancelled by user.")
        sys.exit(1)
    except Exception as e:
        print(f"\nUnexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
