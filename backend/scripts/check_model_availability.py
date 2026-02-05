#!/usr/bin/env python3
"""
Daily model availability check script.

This script checks if all models configured in the website are available
for API calls from OpenRouter and sends an email report to support@compareintel.com.

Run this script daily via cron job.
"""

import asyncio
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

# Add parent directory to path to import app modules
backend_dir = Path(__file__).parent.parent.resolve()
sys.path.insert(0, str(backend_dir))

# Load environment variables
# In production (Docker), environment variables are set via docker-compose/env_file
# In development, load from .env file
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

from app.email_service import EMAIL_CONFIGURED, send_model_availability_report
from app.model_runner import OPENROUTER_MODELS, fetch_all_models_from_openrouter


def check_model_availability() -> dict[str, Any]:
    """
    Check availability of all configured models in OpenRouter.

    Returns:
        Dictionary with check results including:
        - total_models: Total number of models checked
        - available_models: List of available model IDs
        - unavailable_models: List of unavailable model IDs with details
        - check_timestamp: When the check was performed
        - error: Any error that occurred during the check
    """
    result = {
        "total_models": len(OPENROUTER_MODELS),
        "available_models": [],
        "unavailable_models": [],
        "check_timestamp": datetime.now().isoformat(),
        "error": None,
    }

    try:
        # Fetch all available models from OpenRouter (synchronous function)
        print("Fetching models from OpenRouter API...")
        openrouter_models = fetch_all_models_from_openrouter()

        if openrouter_models is None:
            result["error"] = "Failed to fetch models from OpenRouter API"
            return result

        print(f"Found {len(openrouter_models)} models in OpenRouter")
        print(f"Checking {len(OPENROUTER_MODELS)} configured models...")

        # Check each configured model
        openrouter_model_ids = set(openrouter_models.keys())

        for model in OPENROUTER_MODELS:
            model_id = model.get("id")
            if not model_id:
                continue

            # Skip models marked as not available (e.g., "Coming Soon" models)
            if model.get("available") is False:
                result["unavailable_models"].append(
                    {
                        "id": model_id,
                        "name": model.get("name", model_id),
                        "reason": "Marked as not available in configuration",
                        "provider": model.get("provider", "Unknown"),
                    }
                )
                continue

            # Check if model exists in OpenRouter's list
            if model_id in openrouter_model_ids:
                result["available_models"].append(
                    {
                        "id": model_id,
                        "name": model.get("name", model_id),
                        "provider": model.get("provider", "Unknown"),
                    }
                )
            else:
                # Model not found in OpenRouter
                result["unavailable_models"].append(
                    {
                        "id": model_id,
                        "name": model.get("name", model_id),
                        "reason": "Not found in OpenRouter's model list",
                        "provider": model.get("provider", "Unknown"),
                    }
                )

        print(f"✓ Available: {len(result['available_models'])}")
        print(f"✗ Unavailable: {len(result['unavailable_models'])}")

    except Exception as e:
        result["error"] = f"Error during model availability check: {str(e)}"
        print(f"ERROR: {result['error']}")

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
    print("Model Availability Check")
    print("=" * 60)
    print(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
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
            # Don't fail the script if email fails, but print the error
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
