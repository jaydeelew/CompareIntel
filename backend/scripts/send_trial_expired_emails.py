#!/usr/bin/env python3
"""
Script to send trial expiration emails to free tier users.

This script finds users whose 7-day trial has expired and sends them
an email reminding them that paid tiers are coming soon.

Run this script daily via cron job (e.g., once per day).
"""

import sys
import os
from pathlib import Path
from datetime import datetime, timedelta, timezone
from typing import List
import asyncio

# Add parent directory to path to import app modules
backend_dir = Path(__file__).parent.parent.resolve()
sys.path.insert(0, str(backend_dir))

# Load environment variables
from dotenv import load_dotenv

# Try multiple .env locations (development scenarios)
env_paths = [
    backend_dir / ".env",
    Path("/app/.env"),  # Docker container path
]

for env_path in env_paths:
    if env_path.exists():
        load_dotenv(env_path, override=False)  # Don't override existing env vars
        break

from app.database import SessionLocal
from app.models import User
from app.email_service import send_trial_expired_email, EMAIL_CONFIGURED
from sqlalchemy import and_


def find_users_with_expired_trials(db) -> List[User]:
    """
    Find users whose trial has expired but haven't been sent the email yet.
    
    We check for users where:
    - subscription_tier == 'free'
    - trial_ends_at is not None
    - trial_ends_at is in the past
    - trial_ends_at is within the last 7 days (to avoid sending old emails)
    
    Args:
        db: Database session
        
    Returns:
        List of User objects with expired trials
    """
    now = datetime.now(timezone.utc)
    # Only check trials that expired in the last 7 days to avoid sending emails for very old trials
    seven_days_ago = now - timedelta(days=7)
    
    # Get all potential users first, then filter in Python to handle timezone issues
    potential_users = db.query(User).filter(
        and_(
            User.subscription_tier == "free",
            User.trial_ends_at.isnot(None),
            User.is_verified == True,  # Only send to verified users
            User.is_active == True,  # Only send to active users
        )
    ).all()
    
    # Filter users with expired trials, handling both timezone-aware and naive datetimes
    users = []
    for user in potential_users:
        if user.trial_ends_at is None:
            continue
        
        # Handle both timezone-aware and naive datetimes
        trial_end = user.trial_ends_at
        if trial_end.tzinfo is None:
            trial_end = trial_end.replace(tzinfo=timezone.utc)
        
        # Check if trial expired and is within the last 7 days
        if trial_end <= now and trial_end >= seven_days_ago:
            users.append(user)
    
    return users


async def send_trial_expired_emails() -> None:
    """
    Main function to find users with expired trials and send them emails.
    """
    if not EMAIL_CONFIGURED:
        print("Email service not configured - skipping trial expired emails")
        return
    
    db = SessionLocal()
    try:
        users = find_users_with_expired_trials(db)
        
        if not users:
            print("No users with expired trials found.")
            return
        
        print(f"Found {len(users)} user(s) with expired trials.")
        
        success_count = 0
        error_count = 0
        
        for user in users:
            try:
                print(f"Sending trial expired email to {user.email} (trial ended: {user.trial_ends_at})...")
                await send_trial_expired_email(user.email)
                success_count += 1
                print(f"✓ Email sent successfully to {user.email}")
            except Exception as e:
                error_count += 1
                print(f"✗ Failed to send email to {user.email}: {str(e)}")
        
        print(f"\nSummary:")
        print(f"  Total users: {len(users)}")
        print(f"  Emails sent successfully: {success_count}")
        print(f"  Errors: {error_count}")
        
    finally:
        db.close()


def main():
    """Entry point for the script."""
    print("=" * 60)
    print("CompareIntel - Trial Expired Email Sender")
    print("=" * 60)
    print(f"Started at: {datetime.now().isoformat()}")
    print()
    
    try:
        asyncio.run(send_trial_expired_emails())
        print()
        print("Script completed successfully.")
    except Exception as e:
        print(f"\n✗ Script failed with error: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
