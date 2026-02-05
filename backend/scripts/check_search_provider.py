#!/usr/bin/env python3
"""
Script to check if a search provider is configured in the database.
"""

import sys
from pathlib import Path

# Add parent directory to path to import app modules
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.database import SessionLocal
from app.models import AppSettings
from app.search.factory import SearchProviderFactory


def check_search_provider():
    """Check search provider configuration."""
    db = SessionLocal()

    try:
        # Get app settings
        app_settings = db.query(AppSettings).first()

        if not app_settings:
            print("❌ No AppSettings found in database")
            print("   The app_settings table may be empty.")
            return

        active_provider = app_settings.active_search_provider
        print(
            f"Active Search Provider: {active_provider if active_provider else 'None (not configured)'}"
        )

        if active_provider:
            # Try to get the provider instance
            search_provider = SearchProviderFactory.get_active_provider(db)
            if search_provider:
                print(f"✅ Search provider '{active_provider}' is configured and available")
                print(f"   Provider name: {search_provider.get_provider_name()}")
            else:
                print(f"⚠️  Active provider '{active_provider}' is set but not available")
                print("   This usually means the API key is not configured in .env file")
        else:
            print("\n⚠️  No active search provider is configured!")
            print("   Web search will not work even if enabled in the UI.")
            print("\nTo fix this:")
            print(
                "1. Set up a search provider API key (e.g., BRAVE_SEARCH_API_KEY) in backend/.env"
            )
            print("2. Use the admin panel to set the active search provider")
            print("   OR run: python scripts/set_search_provider.py brave")

        # Check available providers
        available_providers = SearchProviderFactory.get_available_providers()
        print(f"\nAvailable providers (with API keys configured): {available_providers}")

    finally:
        db.close()


if __name__ == "__main__":
    check_search_provider()
