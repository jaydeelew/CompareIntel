#!/usr/bin/env python3
"""
Daily model availability check script (Production-ready version).

This script checks if all models configured in the website are available
for API calls from OpenRouter and sends an email report to support@compareintel.com.

Production usage (Docker only):
  docker exec compareintel-backend-1 python3 /app/scripts/check_model_availability_prod.py

For automated daily checks via cron, see: setup_daily_model_check_prod.sh
"""

import asyncio
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

# Determine script location and set up paths
SCRIPT_DIR = Path(__file__).parent.resolve()
BACKEND_DIR = SCRIPT_DIR.parent.resolve()

# Add backend directory to Python path
sys.path.insert(0, str(BACKEND_DIR))

# Load environment variables
# In production (Docker), environment variables are set via docker-compose/env_file
# In development, load from .env file
from dotenv import load_dotenv

# Try multiple .env locations (development scenarios)
env_paths = [
    BACKEND_DIR / ".env",
    Path("/app/.env"),  # Docker container path
]

for env_path in env_paths:
    if env_path.exists():
        load_dotenv(env_path, override=False)  # Don't override existing env vars
        break

# Import after environment is loaded
from app.email_service import EMAIL_CONFIGURED, send_model_availability_report
from app.llm.model_availability import check_model_availability as run_availability_check
from app.model_runner import OPENROUTER_MODELS, fetch_all_models_from_openrouter


def check_model_availability() -> dict[str, Any]:
    print("Fetching models from OpenRouter API...")
    openrouter_models = fetch_all_models_from_openrouter()

    if openrouter_models is None:
        return run_availability_check(OPENROUTER_MODELS, None)

    print(f"Found {len(openrouter_models)} models in OpenRouter")
    print(f"Checking {len(OPENROUTER_MODELS)} configured models (catalog + endpoint health)...")

    result = run_availability_check(OPENROUTER_MODELS, openrouter_models)
    print(f"✓ Available: {len(result['available_models'])}")
    print(f"✗ Unavailable: {len(result['unavailable_models'])}")
    return result


def print_model_availability_report(results: dict[str, Any]) -> None:
    """
    Print a formatted model availability report to the terminal.

    Args:
        results: Dictionary containing check results
    """
    total_models = results.get("total_models", 0)
    available_models = results.get("available_models", [])
    unavailable_models = results.get("unavailable_models", [])
    check_timestamp = results.get("check_timestamp", "")
    error = results.get("error")

    # Format timestamp
    try:
        dt = datetime.fromisoformat(check_timestamp.replace("Z", "+00:00"))
        formatted_timestamp = dt.strftime("%Y-%m-%d %H:%M:%S UTC")
    except:
        formatted_timestamp = check_timestamp

    print()
    print("=" * 60)
    print("MODEL AVAILABILITY REPORT")
    print("=" * 60)
    print(f"Check performed on: {formatted_timestamp}")
    print()

    # Print error if present
    if error:
        print("⚠️  ERROR:")
        print(f"   {error}")
        print()

    # Print summary
    print("SUMMARY:")
    print(f"   Total Models Checked: {total_models}")
    print(f"   ✓ Available: {len(available_models)}")
    print(f"   ✗ Unavailable: {len(unavailable_models)}")
    print()

    # Print unavailable models if any
    if unavailable_models:
        print("UNAVAILABLE MODELS:")
        for model in unavailable_models:
            model_id = model.get("id", "Unknown")
            model_name = model.get("name", model_id)
            provider = model.get("provider", "Unknown")
            reason = model.get("reason", "Unknown reason")
            print(f"   ✗ {model_name} ({model_id})")
            print(f"     Provider: {provider}")
            print(f"     Reason: {reason}")
            print()

    # Print available models summary if there are issues
    if unavailable_models and available_models:
        print(f"Available Models: {len(available_models)}/{total_models}")
        print()

    # Print status
    if error:
        print("STATUS: ⚠️  ERROR")
    elif unavailable_models:
        print(f"STATUS: ⚠️  ISSUES FOUND - {len(unavailable_models)} model(s) unavailable")
    else:
        print("STATUS: ✓ ALL MODELS AVAILABLE")
    print("=" * 60)


async def main():
    """Main entry point for the script."""
    print("=" * 60)
    print("Model Availability Check (Production)")
    print("=" * 60)
    print(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Python: {sys.executable}")
    print(f"Working directory: {os.getcwd()}")
    print(f"Backend directory: {BACKEND_DIR}")
    print()

    # Perform the check (synchronous function, run in executor to avoid blocking)
    loop = asyncio.get_event_loop()
    results = await loop.run_in_executor(None, check_model_availability)

    # Send email report or print to terminal
    print()
    if EMAIL_CONFIGURED:
        print("Sending email report...")
        try:
            await send_model_availability_report(results)
            print("✓ Email report sent successfully")
        except Exception as e:
            print(f"✗ Failed to send email report: {str(e)}")
            import traceback

            traceback.print_exc()
            sys.exit(1)
    else:
        print("Email service not configured - printing report to terminal...")
        print_model_availability_report(results)

    print()
    print("=" * 60)
    print(f"Check completed at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)

    # Exit with error code if there are unavailable models or errors
    if results.get("error") or results.get("unavailable_models"):
        sys.exit(1)
    else:
        sys.exit(0)


if __name__ == "__main__":
    asyncio.run(main())
