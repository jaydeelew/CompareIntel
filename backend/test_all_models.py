#!/usr/bin/env python3
"""
Test script to verify all OpenRouter models are responding in a timely manner.

This script tests each available model with a simple prompt and measures:
- Response time
- Success/failure status
- Error messages (if any)

Usage:
    python test_all_models.py
"""

import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from typing import Any

# Add the backend directory to the path so we can import app modules
sys.path.insert(0, "/home/dan_wsl/jaydeelew/CompareIntel/backend")

from app.config import settings
from app.model_runner import MODELS_BY_PROVIDER, call_openrouter_streaming

# Test prompt - simple and fast
TEST_PROMPT = "Say 'Hello' in one word."

# Timeout threshold (seconds) - consider a response timely if under this
TIMELY_THRESHOLD = 30.0

# Maximum timeout per model (from settings)
MAX_TIMEOUT = settings.individual_model_timeout


def get_available_models() -> list[dict[str, Any]]:
    """Get all available models, filtering out unavailable ones."""
    available_models = []
    for provider, models in MODELS_BY_PROVIDER.items():
        for model in models:
            # Skip models marked as unavailable
            if model.get("available", True):
                available_models.append(model)
    return available_models


def test_model(model: dict[str, Any]) -> dict[str, Any]:
    """
    Test a single model and return results.

    Returns:
        Dictionary with:
        - model_id: Model identifier
        - model_name: Display name
        - provider: Provider name
        - success: Boolean indicating if test succeeded
        - response_time: Time taken in seconds
        - is_timely: Boolean indicating if response was timely
        - error: Error message if failed
        - response_length: Length of response if successful
    """
    model_id = model["id"]
    model_name = model["name"]
    provider = model["provider"]

    start_time = time.time()
    result = {
        "model_id": model_id,
        "model_name": model_name,
        "provider": provider,
        "success": False,
        "response_time": 0.0,
        "is_timely": False,
        "error": None,
        "response_length": 0,
    }

    try:
        # Call the model with a simple prompt using streaming
        chunks = []
        for chunk in call_openrouter_streaming(
            prompt=TEST_PROMPT,
            model_id=model_id,
            conversation_history=None,
            use_mock=False,  # Use real API calls
        ):
            chunks.append(chunk)

        # Combine all chunks into a single response
        response = "".join(chunks) if chunks else ""

        response_time = time.time() - start_time
        result["response_time"] = response_time
        result["is_timely"] = response_time < TIMELY_THRESHOLD

        # Check if response indicates an error
        if response and not response.startswith("Error:"):
            result["success"] = True
            result["response_length"] = len(response)
        else:
            result["success"] = False
            result["error"] = response if response else "No response received"

    except Exception as e:
        response_time = time.time() - start_time
        result["response_time"] = response_time
        result["success"] = False
        result["error"] = str(e)

    return result


def print_results(results: list[dict[str, Any]]):
    """Print formatted test results."""
    total_models = len(results)
    successful = sum(1 for r in results if r["success"])
    timely = sum(1 for r in results if r["is_timely"])
    failed = total_models - successful

    print("\n" + "=" * 80)
    print("OPENROUTER MODEL TEST RESULTS")
    print("=" * 80)
    print(f"Test Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Test Prompt: '{TEST_PROMPT}'")
    print(f"Timely Threshold: {TIMELY_THRESHOLD}s")
    print(f"Max Timeout: {MAX_TIMEOUT}s")
    print("-" * 80)
    print(f"Total Models Tested: {total_models}")
    print(f"Successful: {successful} ({successful / total_models * 100:.1f}%)")
    print(f"Timely Responses: {timely} ({timely / total_models * 100:.1f}%)")
    print(f"Failed: {failed} ({failed / total_models * 100:.1f}%)")
    print("=" * 80)

    # Group by provider
    by_provider: dict[str, list[dict[str, Any]]] = {}
    for result in results:
        provider = result["provider"]
        if provider not in by_provider:
            by_provider[provider] = []
        by_provider[provider].append(result)

    # Print results by provider
    print("\nRESULTS BY PROVIDER:")
    print("-" * 80)

    for provider in sorted(by_provider.keys()):
        provider_results = by_provider[provider]
        provider_success = sum(1 for r in provider_results if r["success"])
        provider_timely = sum(1 for r in provider_results if r["is_timely"])

        print(
            f"\n{provider}: {provider_success}/{len(provider_results)} successful, "
            f"{provider_timely}/{len(provider_results)} timely"
        )

        for result in sorted(provider_results, key=lambda x: x["response_time"]):
            status = "✅" if result["success"] else "❌"
            timely_mark = "⚡" if result["is_timely"] else "⏱️"

            print(
                f"  {status} {timely_mark} {result['model_name']:<40} "
                f"{result['response_time']:>6.2f}s",
                end="",
            )

            if result["success"]:
                print(f" ({result['response_length']} chars)")
            else:
                print(f" - ERROR: {result['error']}")

    # Print summary of failures
    failures = [r for r in results if not r["success"]]
    if failures:
        print("\n" + "=" * 80)
        print("FAILED MODELS:")
        print("-" * 80)
        for failure in failures:
            print(f"  ❌ {failure['provider']}/{failure['model_name']}: {failure['error']}")

    # Print slow models
    slow_models = [r for r in results if r["success"] and not r["is_timely"]]
    if slow_models:
        print("\n" + "=" * 80)
        print(f"SLOW MODELS (> {TIMELY_THRESHOLD}s):")
        print("-" * 80)
        for slow in sorted(slow_models, key=lambda x: x["response_time"], reverse=True):
            print(f"  ⏱️  {slow['provider']}/{slow['model_name']}: {slow['response_time']:.2f}s")


def main():
    """Main test function."""
    print("Starting OpenRouter Model Test Suite...")
    print(f"Testing all available models with prompt: '{TEST_PROMPT}'")
    print(f"Timely threshold: {TIMELY_THRESHOLD}s")
    print(f"Max timeout per model: {MAX_TIMEOUT}s")
    print("\nThis may take several minutes depending on model availability...")

    # Get all available models
    models = get_available_models()
    print(f"\nFound {len(models)} available models to test.")

    if not models:
        print("ERROR: No available models found!")
        return 1

    # Test models concurrently (but limit concurrency to avoid rate limits)
    # Using 5 concurrent tests to balance speed and rate limit avoidance
    max_workers = 5
    results = []

    print(f"\nTesting models with {max_workers} concurrent workers...")
    start_time = time.time()

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        # Submit all tests
        future_to_model = {executor.submit(test_model, model): model["name"] for model in models}

        # Process results as they complete
        completed = 0
        for future in as_completed(future_to_model):
            model_name = future_to_model[future]
            completed += 1
            try:
                result = future.result()
                results.append(result)

                # Print progress
                status = "✅" if result["success"] else "❌"
                print(
                    f"[{completed}/{len(models)}] {status} {model_name:<40} "
                    f"{result['response_time']:>6.2f}s"
                )
            except Exception as e:
                print(f"[{completed}/{len(models)}] ❌ {model_name:<40} Exception: {e}")
                results.append(
                    {
                        "model_id": "unknown",
                        "model_name": model_name,
                        "provider": "unknown",
                        "success": False,
                        "response_time": 0.0,
                        "is_timely": False,
                        "error": str(e),
                        "response_length": 0,
                    }
                )

    total_time = time.time() - start_time

    # Print final results
    print_results(results)

    print("\n" + "=" * 80)
    print(f"Total test time: {total_time:.2f}s")
    print(f"Average time per model: {total_time / len(models):.2f}s")
    print("=" * 80)

    # Return exit code based on results
    if all(r["success"] for r in results):
        print("\n✅ All models responded successfully!")
        return 0
    failed_count = sum(1 for r in results if not r["success"])
    print(f"\n⚠️  {failed_count} model(s) failed. Check results above.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
