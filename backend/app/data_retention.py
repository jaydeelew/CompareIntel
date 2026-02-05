"""
Data retention and cleanup utilities for UsageLog entries.

This module provides functions to aggregate old UsageLog entries into monthly
summaries and delete detailed entries older than a specified retention period.
This helps manage database growth while preserving aggregated data for analysis.
"""

import json
from collections import defaultdict
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import and_
from sqlalchemy.orm import Session

from .models import UsageLog, UsageLogMonthlyAggregate


def cleanup_old_usage_logs(
    db: Session, keep_days: int = 90, dry_run: bool = False
) -> dict[str, Any]:
    """
    Cleanup old UsageLog entries by:
    1. Aggregating data older than keep_days into monthly summaries
    2. Deleting detailed entries older than keep_days

    This function preserves aggregated statistics for long-term analysis while
    removing detailed entries that are no longer needed for token estimation
    (which typically requires ~30 days of detailed data).

    Args:
        db: Database session
        keep_days: Number of days of detailed data to keep (default: 90)
        dry_run: If True, only report what would be deleted, don't actually delete

    Returns:
        Dictionary with cleanup statistics including:
        - status: "success", "dry_run", or "no_data"
        - cutoff_date: ISO format date string
        - aggregates_created: Number of new monthly aggregates created
        - aggregates_updated: Number of existing aggregates updated
        - entries_deleted: Number of UsageLog entries deleted
        - months_processed: Number of months aggregated
    """
    cutoff_date = datetime.now(UTC) - timedelta(days=keep_days)

    # Find all entries older than cutoff_date
    old_logs_query = db.query(UsageLog).filter(UsageLog.created_at < cutoff_date)
    old_logs = old_logs_query.all()

    if not old_logs:
        return {
            "status": "no_data",
            "message": f"No UsageLog entries older than {keep_days} days",
            "cutoff_date": cutoff_date.isoformat(),
            "entries_to_process": 0,
        }

    # Group entries by year/month for aggregation
    monthly_data = defaultdict(
        lambda: {
            "year": None,
            "month": None,
            "entries": [],
            "stats": {
                "total_comparisons": 0,
                "total_models_requested": 0,
                "total_models_successful": 0,
                "total_models_failed": 0,
                "total_input_tokens": 0,
                "total_output_tokens": 0,
                "total_effective_tokens": 0,
                "total_credits_used": Decimal(0),
                "total_actual_cost": Decimal(0),
                "total_estimated_cost": Decimal(0),
                "model_breakdown": defaultdict(
                    lambda: {
                        "count": 0,
                        "total_input": 0,
                        "total_output": 0,
                        "total_credits": Decimal(0),
                    }
                ),
            },
        }
    )

    # Process each old log entry
    for log in old_logs:
        year = log.created_at.year
        month = log.created_at.month
        key = f"{year}-{month:02d}"

        monthly_data[key]["year"] = year
        monthly_data[key]["month"] = month
        monthly_data[key]["entries"].append(log)

        stats = monthly_data[key]["stats"]
        stats["total_comparisons"] += 1
        stats["total_models_requested"] += log.models_requested or 0
        stats["total_models_successful"] += log.models_successful or 0
        stats["total_models_failed"] += log.models_failed or 0

        if log.input_tokens:
            stats["total_input_tokens"] += log.input_tokens
        if log.output_tokens:
            stats["total_output_tokens"] += log.output_tokens
        if log.effective_tokens:
            stats["total_effective_tokens"] += log.effective_tokens
        if log.credits_used:
            stats["total_credits_used"] += log.credits_used
        if log.actual_cost:
            stats["total_actual_cost"] += log.actual_cost
        if log.estimated_cost:
            stats["total_estimated_cost"] += log.estimated_cost

        # Model breakdown - parse models_used JSON
        if log.models_used:
            try:
                models = (
                    json.loads(log.models_used)
                    if isinstance(log.models_used, str)
                    else log.models_used
                )
                if isinstance(models, list):
                    for model_id in models:
                        model_stats = stats["model_breakdown"][model_id]
                        model_stats["count"] += 1
                        if log.input_tokens:
                            model_stats["total_input"] += log.input_tokens
                        if log.output_tokens:
                            model_stats["total_output"] += log.output_tokens
                        if log.credits_used:
                            model_stats["total_credits"] += log.credits_used
            except (json.JSONDecodeError, TypeError, AttributeError):
                # Skip invalid JSON or non-list models_used
                pass

    # Create or update monthly aggregates
    aggregates_created = 0
    aggregates_updated = 0

    if not dry_run:
        for key, data in monthly_data.items():
            stats = data["stats"]
            total_comparisons = stats["total_comparisons"]

            if total_comparisons == 0:
                continue

            # Calculate averages
            avg_input = (
                Decimal(stats["total_input_tokens"]) / total_comparisons
                if total_comparisons > 0
                else Decimal(0)
            )
            avg_output = (
                Decimal(stats["total_output_tokens"]) / total_comparisons
                if total_comparisons > 0
                else Decimal(0)
            )
            avg_output_ratio = avg_output / avg_input if avg_input > 0 else Decimal(0)
            avg_credits = (
                stats["total_credits_used"] / total_comparisons
                if total_comparisons > 0
                else Decimal(0)
            )

            # Convert model breakdown to JSON
            model_breakdown_json = {}
            for model_id, model_stats in stats["model_breakdown"].items():
                if model_stats["count"] > 0:
                    model_breakdown_json[model_id] = {
                        "count": model_stats["count"],
                        "avg_input_tokens": float(
                            model_stats["total_input"] / model_stats["count"]
                        ),
                        "avg_output_tokens": float(
                            model_stats["total_output"] / model_stats["count"]
                        ),
                        "total_credits": float(model_stats["total_credits"]),
                    }

            # Check if aggregate already exists
            existing = (
                db.query(UsageLogMonthlyAggregate)
                .filter(
                    and_(
                        UsageLogMonthlyAggregate.year == data["year"],
                        UsageLogMonthlyAggregate.month == data["month"],
                    )
                )
                .first()
            )

            if existing:
                # Update existing aggregate (merge with existing data)
                existing.total_comparisons += stats["total_comparisons"]
                existing.total_models_requested += stats["total_models_requested"]
                existing.total_models_successful += stats["total_models_successful"]
                existing.total_models_failed += stats["total_models_failed"]
                existing.total_input_tokens += stats["total_input_tokens"]
                existing.total_output_tokens += stats["total_output_tokens"]
                existing.total_effective_tokens += stats["total_effective_tokens"]
                existing.total_credits_used += stats["total_credits_used"]
                existing.total_actual_cost += stats["total_actual_cost"]
                existing.total_estimated_cost += stats["total_estimated_cost"]

                # Recalculate averages
                existing.avg_input_tokens = (
                    Decimal(existing.total_input_tokens) / existing.total_comparisons
                    if existing.total_comparisons > 0
                    else Decimal(0)
                )
                existing.avg_output_tokens = (
                    Decimal(existing.total_output_tokens) / existing.total_comparisons
                    if existing.total_comparisons > 0
                    else Decimal(0)
                )
                existing.avg_output_ratio = (
                    existing.avg_output_tokens / existing.avg_input_tokens
                    if existing.avg_input_tokens > 0
                    else Decimal(0)
                )
                existing.avg_credits_per_comparison = (
                    existing.total_credits_used / existing.total_comparisons
                    if existing.total_comparisons > 0
                    else Decimal(0)
                )

                # Merge model breakdowns
                existing_breakdown = (
                    json.loads(existing.model_breakdown) if existing.model_breakdown else {}
                )
                for model_id, model_stats in model_breakdown_json.items():
                    if model_id in existing_breakdown:
                        existing_breakdown[model_id]["count"] += model_stats["count"]
                        existing_breakdown[model_id]["total_credits"] += model_stats[
                            "total_credits"
                        ]
                        # Recalculate averages
                        existing_breakdown[model_id]["avg_input_tokens"] = (
                            existing_breakdown[model_id]["avg_input_tokens"]
                            * (existing_breakdown[model_id]["count"] - model_stats["count"])
                            + model_stats["avg_input_tokens"] * model_stats["count"]
                        ) / existing_breakdown[model_id]["count"]
                        existing_breakdown[model_id]["avg_output_tokens"] = (
                            existing_breakdown[model_id]["avg_output_tokens"]
                            * (existing_breakdown[model_id]["count"] - model_stats["count"])
                            + model_stats["avg_output_tokens"] * model_stats["count"]
                        ) / existing_breakdown[model_id]["count"]
                    else:
                        existing_breakdown[model_id] = model_stats
                existing.model_breakdown = json.dumps(existing_breakdown)
                aggregates_updated += 1
            else:
                # Create new aggregate
                aggregate = UsageLogMonthlyAggregate(
                    year=data["year"],
                    month=data["month"],
                    total_comparisons=stats["total_comparisons"],
                    total_models_requested=stats["total_models_requested"],
                    total_models_successful=stats["total_models_successful"],
                    total_models_failed=stats["total_models_failed"],
                    total_input_tokens=stats["total_input_tokens"],
                    total_output_tokens=stats["total_output_tokens"],
                    total_effective_tokens=stats["total_effective_tokens"],
                    avg_input_tokens=avg_input,
                    avg_output_tokens=avg_output,
                    avg_output_ratio=avg_output_ratio,
                    total_credits_used=stats["total_credits_used"],
                    avg_credits_per_comparison=avg_credits,
                    total_actual_cost=stats["total_actual_cost"],
                    total_estimated_cost=stats["total_estimated_cost"],
                    model_breakdown=json.dumps(model_breakdown_json)
                    if model_breakdown_json
                    else None,
                )
                db.add(aggregate)
                aggregates_created += 1

        # Commit aggregates before deleting
        db.flush()

        # Delete old detailed entries
        deleted_count = old_logs_query.delete()

        db.commit()

        return {
            "status": "success",
            "cutoff_date": cutoff_date.isoformat(),
            "aggregates_created": aggregates_created,
            "aggregates_updated": aggregates_updated,
            "entries_deleted": deleted_count,
            "months_processed": len(monthly_data),
        }
    # Dry run - just report what would happen
    return {
        "status": "dry_run",
        "cutoff_date": cutoff_date.isoformat(),
        "entries_to_process": len(old_logs),
        "months_to_aggregate": len(monthly_data),
        "would_create_aggregates": len(monthly_data),
        "would_delete_entries": len(old_logs),
        "monthly_breakdown": {
            f"{data['year']}-{data['month']:02d}": {
                "entries": len(data["entries"]),
                "total_comparisons": data["stats"]["total_comparisons"],
            }
            for data in monthly_data.values()
        },
    }
