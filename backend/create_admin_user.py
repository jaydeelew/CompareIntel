#!/usr/bin/env python3
"""
Setup script to create the first admin user for CompareIntel.

This script helps you create your first super admin user after running
the database migration. It's safer than manually updating the database.
"""

import os
import sys
import getpass
from datetime import datetime, UTC
from pathlib import Path

# Load environment variables from .env file
from dotenv import load_dotenv
backend_dir = Path(__file__).parent.resolve()
load_dotenv(backend_dir / ".env")

# Add the backend directory to the Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models import User
from app.auth import get_password_hash, validate_password_strength


def create_admin_user():
    """Create the first admin user interactively."""
    print("CompareIntel Admin User Setup")
    print("=" * 40)
    print("This script will help you create your first super admin user.")
    print()

    # Get database session
    db = SessionLocal()

    try:
        # Check if any admin users already exist
        existing_admin = db.query(User).filter(User.is_admin == True).first()
        if existing_admin:
            print(f"Admin user already exists: {existing_admin.email}")
            response = input("Do you want to create another admin user? (y/N): ")
            if response.lower() != "y":
                print("Exiting...")
                return

        # Get user input
        print("Enter admin user details:")
        print()

        email = input("Email address: ").strip()
        if not email or "@" not in email:
            print("Error: Invalid email address")
            return

        # Check if email already exists
        existing_user = db.query(User).filter(User.email == email).first()
        if existing_user:
            print(f"User with email {email} already exists.")
            response = input("Do you want to promote this user to super admin? (y/N): ")
            if response.lower() == "y":
                existing_user.role = "super_admin"
                existing_user.is_admin = True
                db.commit()
                print(f"User {email} promoted to super admin successfully!")
                return
            else:
                print("Exiting...")
                return

        # Get password
        while True:
            password = getpass.getpass("Password (min 8 chars): ")
            is_valid, error_msg = validate_password_strength(password)
            if is_valid:
                break
            else:
                print(f"Password error: {error_msg}")
                print("Please try again.")

        # Confirm password
        password_confirm = getpass.getpass("Confirm password: ")
        if password != password_confirm:
            print("Error: Passwords do not match")
            return

        # Get role
        print("\nSelect admin role:")
        print("1. moderator - Basic admin access")
        print("2. admin - Full admin access")
        print("3. super_admin - Full access including user deletion")

        while True:
            role_choice = input("Enter choice (1-3): ").strip()
            if role_choice == "1":
                role = "moderator"
                break
            elif role_choice == "2":
                role = "admin"
                break
            elif role_choice == "3":
                role = "super_admin"
                break
            else:
                print("Invalid choice. Please enter 1, 2, or 3.")

        # Get subscription tier
        print("\nSelect subscription tier:")
        print("1. free - Free tier")
        print("2. starter - Starter tier")
        print("3. starter_plus - Starter+ tier")
        print("4. pro - Pro tier")
        print("5. pro_plus - Pro+ tier")

        while True:
            tier_choice = input("Enter choice (1-5): ").strip()
            if tier_choice == "1":
                subscription_tier = "free"
                break
            elif tier_choice == "2":
                subscription_tier = "starter"
                break
            elif tier_choice == "3":
                subscription_tier = "starter_plus"
                break
            elif tier_choice == "4":
                subscription_tier = "pro"
                break
            elif tier_choice == "5":
                subscription_tier = "pro_plus"
                break
            else:
                print("Invalid choice. Please enter 1, 2, 3, 4, or 5.")

        # Create user
        user = User(
            email=email,
            password_hash=get_password_hash(password),
            role=role,
            is_admin=True,
            subscription_tier=subscription_tier,
            subscription_status="active",
            subscription_period="monthly",
            is_active=True,
            is_verified=True,  # Admin users are auto-verified
            subscription_start_date=datetime.now(UTC),
        )

        db.add(user)
        db.commit()
        db.refresh(user)

        print()
        print("✅ Admin user created successfully!")
        print(f"Email: {user.email}")
        print(f"Role: {user.role}")
        print(f"Subscription: {user.subscription_tier}")
        print()
        print("You can now:")
        print("1. Login to your application")
        print("2. Access admin features at /admin/* endpoints")
        print("3. Use the admin panel in your frontend")

    except Exception as e:
        print(f"Error creating admin user: {e}")
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
