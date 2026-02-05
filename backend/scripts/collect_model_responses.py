#!/usr/bin/env python3
"""
Response collection script for model-specific rendering analysis.

This script sends test prompts to all available models and collects their
raw responses for analysis. The responses are saved without any processing
to preserve the original formatting patterns used by each model.

The script supports incremental saving and automatic resume:
- Results are saved after each model completes
- If interrupted, run the script again with the same arguments to resume
- The script automatically detects the most recent results file and skips
  already-collected model/prompt combinations
- Use --output-file to specify a specific file to resume from

Usage:
    python scripts/collect_model_responses.py [OPTIONS]

Options:
    --models: Specific model IDs to test (default: all available models)
    --prompts: Specific prompt names to use (default: all prompts)
    --output-dir: Directory to save responses (default: backend/data/model_responses)
    --output-file: Specific output filename. If file exists, will resume and append.
    --delay: Delay between requests in seconds (default: 1.0)
    --max-retries: Maximum retries for failed requests (default: 3)
    --quiet: Suppress verbose output
"""

import argparse
import asyncio
import copy
import json
import sys
from datetime import datetime
from pathlib import Path

# Add parent directory to path to import app modules
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.model_runner import OPENROUTER_MODELS, call_openrouter
from scripts.config_helpers import filter_models_without_configs
from scripts.test_prompts import get_all_prompt_names, get_prompt_by_name


class ResponseCollector:
    """Collects model responses for rendering analysis."""

    def __init__(
        self,
        output_dir: Path,
        delay: float = 1.0,
        max_retries: int = 3,
        verbose: bool = True,
        output_file: Path | None = None,
        concurrency: int = 5,
    ):
        self.output_dir = output_dir
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.delay = delay
        self.max_retries = max_retries
        self.verbose = verbose
        self.output_file = output_file
        self.concurrency = concurrency
        self.stats = {"total_requests": 0, "successful": 0, "failed": 0, "skipped": 0, "errors": []}
        self.existing_results: dict[str, dict] = {}
        self.existing_collection_metadata: dict = {}

    def log(self, message: str, end: str = "\n", flush: bool = False):
        """Print log message if verbose."""
        if self.verbose:
            print(message, end=end, flush=flush)

    def load_existing_results(self) -> bool:
        """Load existing results from output file if it exists."""
        if self.output_file and self.output_file.exists():
            try:
                with open(self.output_file, encoding="utf-8") as f:
                    data = json.load(f)

                # Extract results and metadata
                if "results" in data:
                    self.existing_results = data["results"]
                    self.existing_collection_metadata = data.get("collection_metadata", {})
                else:
                    # Old format - treat entire data as results
                    self.existing_results = data
                    self.existing_collection_metadata = {}

                self.log(f"Loaded existing results from {self.output_file}")
                self.log(f"  Found {len(self.existing_results)} models with existing data")
                return True
            except Exception as e:
                self.log(f"Warning: Could not load existing results: {e}")
                return False
        return False

    def has_response(self, model_id: str, prompt_name: str) -> bool:
        """Check if a model/prompt combination already exists in loaded results."""
        if model_id not in self.existing_results:
            return False

        model_data = self.existing_results[model_id]
        if "responses" not in model_data:
            return False

        return prompt_name in model_data["responses"] and model_data["responses"][prompt_name].get(
            "success", False
        )

    async def collect_response_async(
        self, model_id: str, prompt_text: str, prompt_name: str
    ) -> dict:
        """Collect a single response asynchronously."""
        self.stats["total_requests"] += 1
        loop = asyncio.get_event_loop()

        for attempt in range(self.max_retries):
            try:
                self.log(f"    Attempt {attempt + 1}/{self.max_retries}...")

                # Run synchronous call_openrouter in a thread pool
                response = await loop.run_in_executor(
                    None, call_openrouter, prompt_text, model_id, "standard", None, False
                )

                self.stats["successful"] += 1
                return {
                    "prompt": prompt_text,
                    "prompt_name": prompt_name,
                    "response": response,
                    "timestamp": datetime.now().isoformat(),
                    "success": True,
                    "attempts": attempt + 1,
                }

            except Exception as e:
                error_str = str(e).lower()

                # Check if it's a retryable error
                if attempt < self.max_retries - 1:
                    if "rate limit" in error_str or "429" in error_str:
                        wait_time = (attempt + 1) * 5  # Exponential backoff
                        self.log(f"      Rate limited, waiting {wait_time}s...")
                        await asyncio.sleep(wait_time)
                        continue
                    if "timeout" in error_str:
                        wait_time = (attempt + 1) * 2
                        self.log(f"      Timeout, waiting {wait_time}s...")
                        await asyncio.sleep(wait_time)
                        continue

                # Non-retryable or final attempt failed
                self.stats["failed"] += 1
                error_msg = str(e)[:200]  # Truncate long errors
                self.stats["errors"].append(
                    {"model": model_id, "prompt": prompt_name, "error": error_msg}
                )

                return {
                    "prompt": prompt_text,
                    "prompt_name": prompt_name,
                    "response": None,
                    "error": error_msg,
                    "timestamp": datetime.now().isoformat(),
                    "success": False,
                    "attempts": attempt + 1,
                }

        # Should not reach here, but just in case
        return {
            "prompt": prompt_text,
            "prompt_name": prompt_name,
            "response": None,
            "error": "Max retries exceeded",
            "timestamp": datetime.now().isoformat(),
            "success": False,
            "attempts": self.max_retries,
        }

    def collect_response(self, model_id: str, prompt_text: str, prompt_name: str) -> dict:
        """Collect a single response from a model (synchronous wrapper for backward compatibility)."""
        return asyncio.run(self.collect_response_async(model_id, prompt_text, prompt_name))

    async def collect_model_responses_async(
        self, model_id: str, prompts_to_use: list[dict]
    ) -> dict:
        """Collect all responses for a single model concurrently."""
        # Filter prompts that haven't been collected yet
        prompts_to_collect = [
            (prompt["name"], prompt["prompt"])
            for prompt in prompts_to_use
            if not self.has_response(model_id, prompt["name"])
        ]

        if not prompts_to_collect:
            return {}

        # Use semaphore to limit concurrent requests (respect rate limits)
        semaphore = asyncio.Semaphore(self.concurrency)

        async def collect_with_semaphore(prompt_name: str, prompt_text: str):
            async with semaphore:
                return await self.collect_response_async(model_id, prompt_text, prompt_name)

        # Create all tasks
        tasks = [
            collect_with_semaphore(prompt_name, prompt_text)
            for prompt_name, prompt_text in prompts_to_collect
        ]

        # Execute concurrently
        results = await asyncio.gather(*tasks)

        # Convert to dictionary
        responses = {}
        for result in results:
            prompt_name = result["prompt_name"]
            responses[prompt_name] = result

        return responses

    def collect_all_responses(self, model_ids: list[str], prompt_names: list[str]) -> dict:
        """Collect responses from all specified models for all prompts."""
        # Start with existing results if available (deep copy to avoid modifying original)
        results: dict[str, dict] = {}
        if self.existing_results:
            results = copy.deepcopy(self.existing_results)

        # Filter out models that already have configs
        model_ids_without_configs = filter_models_without_configs(model_ids)
        skipped_configs = len(model_ids) - len(model_ids_without_configs)
        if skipped_configs > 0:
            self.log(f"\nSkipping {skipped_configs} model(s) that already have renderer configs:")
            for mid in model_ids:
                if mid not in model_ids_without_configs:
                    self.log(f"  - {mid}")

        # Filter to available models only (and those without configs)
        available_models = [
            m
            for m in OPENROUTER_MODELS
            if m.get("id") in model_ids_without_configs and m.get("available", True)
        ]

        # Get prompts
        prompts_to_use = [get_prompt_by_name(name) for name in prompt_names]

        # Count how many requests we actually need to make
        total_needed = 0
        for model in available_models:
            model_id = model["id"]
            for prompt in prompts_to_use:
                if not self.has_response(model_id, prompt["name"]):
                    total_needed += 1

        total_requests = len(available_models) * len(prompts_to_use)
        skipped = total_requests - total_needed

        self.log(f"\n{'=' * 60}")
        self.log("Starting response collection")
        self.log(f"Models: {len(available_models)}")
        self.log(f"Prompts: {len(prompts_to_use)}")
        self.log(f"Total combinations: {total_requests}")
        if skipped > 0:
            self.log(f"Already collected: {skipped}")
            self.log(f"Remaining to collect: {total_needed}")
            self.stats["skipped"] = skipped
        self.log(f"{'=' * 60}\n")

        current_request = 0

        for model in available_models:
            model_id = model["id"]
            model_name = model.get("name", model_id)
            provider = model.get("provider", "Unknown")

            self.log(f"\n[{current_request + 1}/{total_requests}] Testing {model_name}")
            self.log(f"  Model ID: {model_id}")
            self.log(f"  Provider: {provider}")

            # Initialize or preserve existing model data
            if model_id not in results:
                results[model_id] = {
                    "model_name": model_name,
                    "model_id": model_id,
                    "provider": provider,
                    "responses": {},
                    "metadata": {
                        "collection_timestamp": datetime.now().isoformat(),
                        "total_prompts": len(prompts_to_use),
                        "successful_responses": 0,
                        "failed_responses": 0,
                    },
                }
            else:
                # Preserve existing data but update metadata
                results[model_id]["model_name"] = model_name
                results[model_id]["provider"] = provider
                if "responses" not in results[model_id]:
                    results[model_id]["responses"] = {}
                if "metadata" not in results[model_id]:
                    results[model_id]["metadata"] = {
                        "collection_timestamp": datetime.now().isoformat(),
                        "total_prompts": len(prompts_to_use),
                        "successful_responses": 0,
                        "failed_responses": 0,
                    }
                # Count existing successful responses
                existing_successful = sum(
                    1
                    for resp in results[model_id]["responses"].values()
                    if isinstance(resp, dict) and resp.get("success", False)
                )
                results[model_id]["metadata"]["successful_responses"] = existing_successful
                results[model_id]["metadata"]["failed_responses"] = (
                    len(results[model_id]["responses"]) - existing_successful
                )

            # Collect all responses for this model concurrently
            prompts_to_collect = [
                p for p in prompts_to_use if not self.has_response(model_id, p["name"])
            ]
            if prompts_to_collect:
                self.log(f"  Collecting {len(prompts_to_collect)} responses concurrently...")
                model_responses = asyncio.run(
                    self.collect_model_responses_async(model_id, prompts_to_use)
                )
            else:
                model_responses = {}

            # Merge with existing responses and log results
            for prompt in prompts_to_use:
                prompt_name = prompt["name"]

                # Skip if already collected
                if self.has_response(model_id, prompt_name):
                    self.log(
                        f"  - {prompt_name}... (already collected, skipping)", end=" ", flush=True
                    )
                    self.log("⊘")
                    current_request += 1
                    continue

                # Get response from concurrent collection
                if prompt_name in model_responses:
                    response_data = model_responses[prompt_name]
                    results[model_id]["responses"][prompt_name] = response_data

                    if response_data["success"]:
                        results[model_id]["metadata"]["successful_responses"] += 1
                        self.log(f"  ✓ {prompt_name}")
                    else:
                        results[model_id]["metadata"]["failed_responses"] += 1
                        error_preview = response_data.get("error", "Unknown error")[:50]
                        self.log(f"  ✗ {prompt_name} ({error_preview})")

                    current_request += 1

            # Save incrementally after each model completes
            if self.output_file:
                self.save_results(results, self.output_file.name)

        return results

    def save_results(self, results: dict, filename: str | None = None, silent: bool = False):
        """Save collected results to JSON file."""
        if filename is None:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"model_responses_{timestamp}.json"

        output_file = self.output_dir / filename

        # Merge with existing collection metadata if available
        collection_metadata = (
            self.existing_collection_metadata.copy() if self.existing_collection_metadata else {}
        )
        collection_metadata.update(
            {
                "last_updated": datetime.now().isoformat(),
                "total_models": len(results),
                "collection_stats": self.stats,
                "script_version": "1.0",
            }
        )
        # Preserve original timestamp if it exists
        if "timestamp" not in collection_metadata:
            collection_metadata["timestamp"] = datetime.now().isoformat()

        # Add collection metadata
        output_data = {
            "collection_metadata": collection_metadata,
            "results": results,
        }

        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(output_data, f, indent=2, ensure_ascii=False)

        if not silent:
            self.log(f"\n✓ Results saved to {output_file}")
        return output_file

    def print_summary(self):
        """Print collection summary statistics."""
        self.log(f"\n{'=' * 60}")
        self.log("Collection Summary")
        self.log(f"{'=' * 60}")
        self.log(f"Total requests: {self.stats['total_requests']}")
        self.log(f"Successful: {self.stats['successful']}")
        self.log(f"Failed: {self.stats['failed']}")
        self.log(f"Skipped: {self.stats['skipped']}")

        if self.stats["errors"]:
            self.log(f"\nErrors encountered: {len(self.stats['errors'])}")
            for error in self.stats["errors"][:10]:  # Show first 10
                self.log(f"  - {error['model']} / {error['prompt']}: {error['error']}")
            if len(self.stats["errors"]) > 10:
                self.log(f"  ... and {len(self.stats['errors']) - 10} more")


def main():
    """Main entry point for the collection script."""
    parser = argparse.ArgumentParser(description="Collect model responses for rendering analysis")
    parser.add_argument(
        "--models", nargs="+", help="Specific model IDs to test (default: all available models)"
    )
    parser.add_argument(
        "--prompts", nargs="+", help="Specific prompt names to use (default: all prompts)"
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default="backend/data/model_responses",
        help="Directory to save responses",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=1.0,
        help="Delay between requests in seconds (default: 1.0, not used with concurrent collection)",
    )
    parser.add_argument(
        "--max-retries",
        type=int,
        default=3,
        help="Maximum retries for failed requests (default: 3)",
    )
    parser.add_argument(
        "--concurrency",
        type=int,
        default=5,
        help="Max concurrent requests per model (default: 5)",
    )
    parser.add_argument("--quiet", action="store_true", help="Suppress verbose output")
    parser.add_argument(
        "--output-file",
        type=str,
        help="Specific output filename to use. If file exists, will resume collection and append results.",
    )

    args = parser.parse_args()

    # Determine models to test
    if args.models:
        model_ids = args.models
    else:
        # Get all available model IDs
        model_ids = [m["id"] for m in OPENROUTER_MODELS if m.get("available", True)]

    # Determine prompts to use
    if args.prompts:
        prompt_names = args.prompts
        # Validate prompt names
        all_prompt_names = get_all_prompt_names()
        invalid = [p for p in prompt_names if p not in all_prompt_names]
        if invalid:
            print(f"Error: Invalid prompt names: {invalid}")
            print(f"Available prompts: {', '.join(all_prompt_names)}")
            sys.exit(1)
    else:
        prompt_names = get_all_prompt_names()

    # Create output directory
    # Resolve relative paths from project root (two levels up from script location)
    if not Path(args.output_dir).is_absolute():
        project_root = Path(__file__).parent.parent.parent
        output_dir = project_root / args.output_dir
    else:
        output_dir = Path(args.output_dir)

    # Determine output file
    output_file = None
    if args.output_file:
        output_file = output_dir / args.output_file
    else:
        # Look for most recent file in output directory to resume from
        existing_files = sorted(
            output_dir.glob("model_responses_*.json"), key=lambda p: p.stat().st_mtime, reverse=True
        )
        if existing_files:
            output_file = existing_files[0]
            if not args.quiet:
                print(f"Found existing results file: {output_file}")
                print(
                    "Will resume collection and append new results. Use --output-file to specify a different file."
                )

    # Create collector
    collector = ResponseCollector(
        output_dir=output_dir,
        delay=args.delay,
        max_retries=args.max_retries,
        verbose=not args.quiet,
        output_file=output_file,
        concurrency=args.concurrency,
    )

    # Load existing results if resuming
    if output_file:
        collector.load_existing_results()
        # Update output_file to use the loaded file
        if not args.output_file:
            # If we auto-detected a file, use it
            pass
    else:
        # Create new file with timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_file = output_dir / f"model_responses_{timestamp}.json"
        collector.output_file = output_file

    # Collect responses
    results = {}
    try:
        results = collector.collect_all_responses(model_ids=model_ids, prompt_names=prompt_names)

        # Save final results
        final_file = collector.save_results(results, output_file.name)

        # Print summary
        collector.print_summary()

        print(f"\n✓ Collection complete! Results saved to: {final_file}")

    except KeyboardInterrupt:
        print("\n\nCollection interrupted by user.")
        if collector.output_file and results:
            # Save partial results
            try:
                partial_file = collector.save_results(
                    results, collector.output_file.name, silent=True
                )
                print(f"Partial results saved to: {partial_file}")
                print(
                    "You can resume collection by running the script again with the same arguments."
                )
            except Exception as save_error:
                print(f"Warning: Could not save partial results: {save_error}")
        else:
            print("No partial results to save.")
        sys.exit(1)
    except Exception as e:
        print(f"\n\nError during collection: {e}")
        if collector.output_file and results:
            # Try to save partial results on error
            try:
                partial_file = collector.save_results(
                    results, collector.output_file.name, silent=True
                )
                print(f"Partial results saved to: {partial_file}")
            except Exception as save_error:
                print(f"Warning: Could not save partial results: {save_error}")
        import traceback

        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
