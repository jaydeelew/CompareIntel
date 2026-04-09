#!/usr/bin/env python3
"""
Setup script to create admin users or update existing users for CompareIntel.

Use this after database migration. It can create a new admin account or change an
existing user's subscription tier and/or admin role—safer than editing the DB by hand.
"""

import getpass
import os
import sys
from datetime import UTC, datetime
from pathlib import Path

# Load environment variables from .env file
from dotenv import load_dotenv

backend_dir = Path(__file__).parent.resolve()
load_dotenv(backend_dir / ".env")

# Add the backend directory to the Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.auth import get_password_hash, validate_password_strength
from app.database import SessionLocal
from app.models import User


def prompt_admin_role() -> str:
    """Prompt for moderator, admin, or super_admin."""
    print("\nSelect admin role:")
    print("1. moderator - Basic admin access")
    print("2. admin - Full admin access")
    print("3. super_admin - Full access including user deletion")

    while True:
        role_choice = input("Enter choice (1-3): ").strip()
        if role_choice == "1":
            return "moderator"
        if role_choice == "2":
            return "admin"
        if role_choice == "3":
            return "super_admin"
        print("Invalid choice. Please enter 1, 2, or 3.")


def prompt_subscription_tier() -> str:
    """Prompt for subscription tier."""
    print("\nSelect subscription tier:")
    print("1. free - Free tier")
    print("2. starter - Starter tier")
    print("3. starter_plus - Starter+ tier")
    print("4. pro - Pro tier")
    print("5. pro_plus - Pro+ tier")

    while True:
        tier_choice = input("Enter choice (1-5): ").strip()
        if tier_choice == "1":
            return "free"
        if tier_choice == "2":
            return "starter"
        if tier_choice == "3":
            return "starter_plus"
        if tier_choice == "4":
            return "pro"
        if tier_choice == "5":
            return "pro_plus"
        print("Invalid choice. Please enter 1, 2, 3, 4, or 5.")


def update_existing_user(db):
    """Change an existing user's subscription tier and/or admin role."""
    print()
    print("Update an existing user")
    print("-" * 40)
    print(
        "You can change their subscription tier (billing/product level), "
        "their admin role (moderator / admin / super_admin), or both."
    )
    print()

    email = input("Email address: ").strip()
    if not email or "@" not in email:
        print("Error: Invalid email address")
        return

    user = db.query(User).filter(User.email == email).first()
    if not user:
        print(f"No user found with email {email}.")
        return

    print()
    print("Current values:")
    print(f"  Subscription tier: {user.subscription_tier}")
    print(f"  Role: {user.role}")
    print(f"  Admin access (is_admin): {user.is_admin}")
    print()

    tier_changed = False
    role_changed = False

    if input("Change subscription tier? (y/N): ").strip().lower() == "y":
        user.subscription_tier = prompt_subscription_tier()
        tier_changed = True

    if input("Change admin role (moderator / admin / super_admin)? (y/N): ").strip().lower() == "y":
        user.role = prompt_admin_role()
        user.is_admin = user.role in ("moderator", "admin", "super_admin")
        role_changed = True

    if not tier_changed and not role_changed:
        print("No changes made.")
        return

    db.commit()
    db.refresh(user)

    print()
    print("User updated successfully.")
    print(f"  Email: {user.email}")
    print(f"  Subscription tier: {user.subscription_tier}")
    print(f"  Role: {user.role}")
    print(f"  is_admin: {user.is_admin}")


def create_new_admin_user(db):
    """Create a new admin user (email must not already exist)."""
    print()
    print("Create a new admin user")
    print("-" * 40)
    print()

    email = input("Email address: ").strip()
    if not email or "@" not in email:
        print("Error: Invalid email address")
        return

    existing_user = db.query(User).filter(User.email == email).first()
    if existing_user:
        print(f"A user with email {email} already exists.")
        print(
            "To change their subscription tier or admin role, run this script again "
            "and choose option 2 (update an existing user)."
        )
        return

    while True:
        password = getpass.getpass("Password (min 8 chars): ")
        is_valid, error_msg = validate_password_strength(password)
        if is_valid:
            break
        print(f"Password error: {error_msg}")
        print("Please try again.")

    password_confirm = getpass.getpass("Confirm password: ")
    if password != password_confirm:
        print("Error: Passwords do not match")
        return

    role = prompt_admin_role()
    subscription_tier = prompt_subscription_tier()

    user = User(
        email=email,
        password_hash=get_password_hash(password),
        role=role,
        is_admin=True,
        subscription_tier=subscription_tier,
        subscription_status="active",
        subscription_period="monthly",
        is_active=True,
        is_verified=True,
        subscription_start_date=datetime.now(UTC),
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    print()
    print("Admin user created successfully.")
    print(f"Email: {user.email}")
    print(f"Role: {user.role}")
    print(f"Subscription tier: {user.subscription_tier}")
    print()
    print("You can now log in, use /admin/* endpoints, and the admin panel in the frontend.")


def create_admin_user():
    """Interactive admin setup: create new account or update tier/role on existing user."""
    print("CompareIntel Admin User Setup")
    print("=" * 40)
    print()
    print("This script can:")
    print("  1) Create a new admin user (new account with password)")
    print(
        "  2) Update an existing user — change subscription tier and/or admin role (no new account)"
    )
    print("  3) Exit")
    print()

    choice = input("Enter choice (1-3): ").strip()
    if choice == "3":
        print("Exiting...")
        return
    if choice not in ("1", "2"):
        print("Invalid choice. Exiting...")
        return

    db = SessionLocal()
    try:
        if choice == "2":
            update_existing_user(db)
        else:
            create_new_admin_user(db)
    except Exception as e:
        print(f"Error: {e}")
        db.rollback()
        sys.exit(1)
    finally:
        db.close()


def main():
    """Main function."""
    try:
        create_admin_user()
    except KeyboardInterrupt:
        print("\n\nSetup cancelled by user.")
        sys.exit(1)
    except Exception as e:
        print(f"\nUnexpected error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
