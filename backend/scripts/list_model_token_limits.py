#!/usr/bin/env python3
"""
List all models and their input token capacities.

This script fetches token limits from OpenRouter API and displays all configured
models with their input capacities in a readable format.

Usage:
    python scripts/list_model_token_limits.py [OPTIONS]

Options:
    --format: Output format - 'table' (default), 'json', or 'csv'
    --sort-by: Sort by 'provider' (default), 'name', 'capacity', or 'model_id'
    --provider: Filter by specific provider (e.g., 'OpenAI', 'Anthropic')
    --min-capacity: Filter by minimum input capacity (e.g., 100000)
    --output-file: Save output to file (optional)
"""

import sys
import json
import argparse
from pathlib import Path
from typing import Dict, List, Optional, Any
from collections import defaultdict

# Add parent directory to path to import app modules
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.model_runner import (
    MODELS_BY_PROVIDER,
    OPENROUTER_MODELS,
    fetch_all_models_from_openrouter,
)


def extract_token_limits(model_data: Dict[str, Any]) -> Dict[str, int]:
    """
    Extract token limits from OpenRouter model data.
    (Duplicated from model_runner.py to avoid importing private function)
    
    Args:
        model_data: Model data dictionary from OpenRouter API
        
    Returns:
        Dictionary with 'max_input' and 'max_output' keys
    """
    limits = {}
    
    # Get context_length (total context window)
    context_length = model_data.get("context_length")
    
    # Get max_completion_tokens from top_provider
    top_provider = model_data.get("top_provider", {})
    max_completion_tokens = top_provider.get("max_completion_tokens")
    
    # If we have context_length but no max_completion_tokens, estimate
    # Most models use ~80% of context for input, 20% for output
    if context_length:
        limits["max_input"] = context_length
        if max_completion_tokens:
            limits["max_output"] = max_completion_tokens
        else:
            # Estimate: assume output can be up to 20% of context window
            limits["max_output"] = int(context_length * 0.2)
    elif max_completion_tokens:
        # If we only have max_completion_tokens, estimate input as 4x output
        limits["max_output"] = max_completion_tokens
        limits["max_input"] = max_completion_tokens * 4
    else:
        # No data available, use defaults
        limits["max_input"] = 8192  # Default context window
        limits["max_output"] = 8192  # Default output
    
    return limits


def get_model_token_limits(model_id: str, openrouter_data: Optional[Dict[str, Any]]) -> Dict[str, int]:
    """
    Get token limits for a model from OpenRouter data.
    
    Args:
        model_id: Model identifier
        openrouter_data: Dictionary of all models from OpenRouter API
        
    Returns:
        Dictionary with 'max_input' and 'max_output' keys
    """
    if openrouter_data and model_id in openrouter_data:
        return extract_token_limits(openrouter_data[model_id])
    else:
        # Return defaults if not found
        return {"max_input": 8192, "max_output": 8192}


def format_number(num: int) -> str:
    """Format large numbers with commas."""
    return f"{num:,}"


def format_capacity(capacity: int) -> str:
    """Format capacity in a human-readable way."""
    if capacity >= 1_000_000:
        return f"{capacity / 1_000_000:.1f}M"
    elif capacity >= 1_000:
        return f"{capacity / 1_000:.0f}K"
    else:
        return str(capacity)


def collect_model_data(
    openrouter_data: Optional[Dict[str, Any]],
    provider_filter: Optional[str] = None,
    min_capacity: Optional[int] = None
) -> List[Dict[str, Any]]:
    """
    Collect model data with token limits.
    
    Args:
        openrouter_data: Dictionary of all models from OpenRouter API
        provider_filter: Optional provider name to filter by
        min_capacity: Optional minimum input capacity to filter by
        
    Returns:
        List of model dictionaries with token limits
    """
    models_data = []
    
    for provider, models in MODELS_BY_PROVIDER.items():
        if provider_filter and provider != provider_filter:
            continue
            
        for model in models:
            model_id = model.get("id")
            if not model_id:
                continue
                
            # Skip unavailable models
            if not model.get("available", True):
                continue
                
            limits = get_model_token_limits(model_id, openrouter_data)
            max_input = limits.get("max_input", 8192)
            
            # Apply minimum capacity filter
            if min_capacity and max_input < min_capacity:
                continue
                
            models_data.append({
                "provider": provider,
                "model_id": model_id,
                "name": model.get("name", model_id),
                "category": model.get("category", "Unknown"),
                "max_input_tokens": max_input,
                "max_output_tokens": limits.get("max_output", 8192),
            })
    
    return models_data


def sort_models(models_data: List[Dict[str, Any]], sort_by: str) -> List[Dict[str, Any]]:
    """Sort models by the specified field."""
    if sort_by == "provider":
        return sorted(models_data, key=lambda x: (x["provider"], x["name"]))
    elif sort_by == "name":
        return sorted(models_data, key=lambda x: x["name"])
    elif sort_by == "capacity":
        return sorted(models_data, key=lambda x: x["max_input_tokens"], reverse=True)
    elif sort_by == "model_id":
        return sorted(models_data, key=lambda x: x["model_id"])
    else:
        return models_data


def print_table(models_data: List[Dict[str, Any]]):
    """Print models in a formatted table."""
    if not models_data:
        print("No models found matching the criteria.")
        return
    
    # Calculate column widths
    max_provider_len = max(len(m["provider"]) for m in models_data)
    max_name_len = max(len(m["name"]) for m in models_data)
    max_id_len = max(len(m["model_id"]) for m in models_data)
    
    # Set minimum widths
    provider_width = max(10, max_provider_len + 2)
    name_width = max(25, max_name_len + 2)
    id_width = max(30, max_id_len + 2)
    
    # Header
    header = (
        f"{'Provider':<{provider_width}} "
        f"{'Model Name':<{name_width}} "
        f"{'Model ID':<{id_width}} "
        f"{'Input Capacity':>15} "
        f"{'Output Capacity':>15} "
        f"{'Category':<20}"
    )
    print(header)
    print("=" * len(header))
    
    # Group by provider
    by_provider = defaultdict(list)
    for model in models_data:
        by_provider[model["provider"]].append(model)
    
    total_models = 0
    for provider in sorted(by_provider.keys()):
        provider_models = by_provider[provider]
        print(f"\n{provider} ({len(provider_models)} models)")
        print("-" * len(header))
        
        for model in sorted(provider_models, key=lambda x: x["name"]):
            total_models += 1
            print(
                f"{model['provider']:<{provider_width}} "
                f"{model['name']:<{name_width}} "
                f"{model['model_id']:<{id_width}} "
                f"{format_number(model['max_input_tokens']):>15} "
                f"{format_number(model['max_output_tokens']):>15} "
                f"{model['category']:<20}"
            )
    
    print("\n" + "=" * len(header))
    print(f"Total: {total_models} models")


def print_json(models_data: List[Dict[str, Any]]):
    """Print models in JSON format."""
    output = {
        "total_models": len(models_data),
        "models": models_data
    }
    print(json.dumps(output, indent=2))


def print_csv(models_data: List[Dict[str, Any]]):
    """Print models in CSV format."""
    import csv
    import io
    
    if not models_data:
        return
    
    output = io.StringIO()
    writer = csv.DictWriter(
        output,
        fieldnames=["provider", "name", "model_id", "max_input_tokens", "max_output_tokens", "category"]
    )
    writer.writeheader()
    writer.writerows(models_data)
    print(output.getvalue())


def print_summary(models_data: List[Dict[str, Any]]):
    """Print summary statistics."""
    if not models_data:
        return
    
    capacities = [m["max_input_tokens"] for m in models_data]
    
    print("\n" + "=" * 60)
    print("SUMMARY STATISTICS")
    print("=" * 60)
    print(f"Total Models: {len(models_data)}")
    print(f"Min Input Capacity: {format_number(min(capacities))} tokens")
    print(f"Max Input Capacity: {format_number(max(capacities))} tokens")
    print(f"Average Input Capacity: {format_number(int(sum(capacities) / len(capacities)))} tokens")
    
    # Count by provider
    by_provider = defaultdict(int)
    for model in models_data:
        by_provider[model["provider"]] += 1
    
    print("\nModels by Provider:")
    for provider, count in sorted(by_provider.items()):
        print(f"  {provider}: {count}")
    
    # Capacity ranges
    ranges = {
        "0-10K": 0,
        "10K-100K": 0,
        "100K-500K": 0,
        "500K-1M": 0,
        "1M+": 0,
    }
    
    for capacity in capacities:
        if capacity < 10_000:
            ranges["0-10K"] += 1
        elif capacity < 100_000:
            ranges["10K-100K"] += 1
        elif capacity < 500_000:
            ranges["100K-500K"] += 1
        elif capacity < 1_000_000:
            ranges["500K-1M"] += 1
        else:
            ranges["1M+"] += 1
    
    print("\nCapacity Distribution:")
    for range_name, count in ranges.items():
        if count > 0:
            print(f"  {range_name}: {count} models")


def main():
    parser = argparse.ArgumentParser(
        description="List all models and their input token capacities",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )
    parser.add_argument(
        "--format",
        choices=["table", "json", "csv"],
        default="table",
        help="Output format (default: table)"
    )
    parser.add_argument(
        "--sort-by",
        choices=["provider", "name", "capacity", "model_id"],
        default="provider",
        help="Sort order (default: provider)"
    )
    parser.add_argument(
        "--provider",
        help="Filter by specific provider (e.g., 'OpenAI', 'Anthropic')"
    )
    parser.add_argument(
        "--min-capacity",
        type=int,
        help="Filter by minimum input capacity (e.g., 100000)"
    )
    parser.add_argument(
        "--output-file",
        help="Save output to file (optional)"
    )
    parser.add_argument(
        "--summary",
        action="store_true",
        help="Show summary statistics (only for table format)"
    )
    
    args = parser.parse_args()
    
    # Fetch data from OpenRouter
    print("Fetching model data from OpenRouter API...", file=sys.stderr)
    openrouter_data = fetch_all_models_from_openrouter()
    
    if openrouter_data is None:
        print("Warning: Could not fetch data from OpenRouter API. Using defaults.", file=sys.stderr)
    else:
        print(f"Fetched data for {len(openrouter_data)} models from OpenRouter.", file=sys.stderr)
    
    # Collect model data
    models_data = collect_model_data(
        openrouter_data,
        provider_filter=args.provider,
        min_capacity=args.min_capacity
    )
    
    # Sort models
    models_data = sort_models(models_data, args.sort_by)
    
    # Prepare output
    if args.output_file:
        # Redirect stdout to file
        original_stdout = sys.stdout
        with open(args.output_file, "w") as f:
            sys.stdout = f
            
            try:
                if args.format == "table":
                    print_table(models_data)
                    if args.summary:
                        print_summary(models_data)
                elif args.format == "json":
                    print_json(models_data)
                elif args.format == "csv":
                    print_csv(models_data)
            finally:
                sys.stdout = original_stdout
        
        print(f"Output saved to {args.output_file}", file=sys.stderr)
    else:
        # Print to stdout
        if args.format == "table":
            print_table(models_data)
            if args.summary:
                print_summary(models_data)
        elif args.format == "json":
            print_json(models_data)
        elif args.format == "csv":
            print_csv(models_data)


if __name__ == "__main__":
    main()

