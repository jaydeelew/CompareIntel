#!/usr/bin/env python3
"""
Helper functions for checking existing model renderer configurations.

This module provides utilities to check if models already have
individual renderer configurations, allowing scripts to skip
processing for models that are already configured.
"""

import json
import sys
from pathlib import Path
from typing import Any


def get_config_file_path(project_root: Path | None = None) -> Path:
    """
    Get the path to the model renderer configs file.

    Args:
        project_root: Optional project root path. If None, will be inferred.

    Returns:
        Path to model_renderer_configs.json
    """
    if project_root is None:
        # Assume script is in backend/scripts/, so go up 2 levels
        script_dir = Path(__file__).parent
        project_root = script_dir.parent.parent

    config_path = project_root / "frontend" / "src" / "config" / "model_renderer_configs.json"
    return config_path


def load_existing_configs(config_path: Path | None = None) -> dict[str, dict[str, Any]]:
    """
    Load existing model renderer configurations.

    Args:
        config_path: Optional path to config file. If None, uses default location.

    Returns:
        Dictionary mapping model_id -> config dict, or empty dict if file doesn't exist
    """
    if config_path is None:
        config_path = get_config_file_path()

    if not config_path.exists():
        return {}

    try:
        with open(config_path, encoding="utf-8") as f:
            configs = json.load(f)

        # Convert list of configs to dict keyed by modelId
        config_dict = {}
        if isinstance(configs, list):
            for config in configs:
                model_id = config.get("modelId")
                if model_id:
                    config_dict[model_id] = config
        elif isinstance(configs, dict):
            # Handle case where it's already a dict
            config_dict = configs

        return config_dict
    except Exception as e:
        # If we can't load, assume no configs exist
        print(f"Warning: Could not load existing configs: {e}", file=sys.stderr)
        return {}


def get_models_with_configs(config_path: Path | None = None) -> set[str]:
    """
    Get set of model IDs that already have renderer configurations.

    Args:
        config_path: Optional path to config file. If None, uses default location.

    Returns:
        Set of model IDs that have configurations
    """
    configs = load_existing_configs(config_path)
    return set(configs.keys())


def has_model_config(model_id: str, config_path: Path | None = None) -> bool:
    """
    Check if a specific model has a renderer configuration.

    Args:
        model_id: Model identifier to check
        config_path: Optional path to config file. If None, uses default location.

    Returns:
        True if model has a configuration, False otherwise
    """
    configs = load_existing_configs(config_path)
    return model_id in configs


def filter_models_without_configs(
    model_ids: list[str], config_path: Path | None = None
) -> list[str]:
    """
    Filter a list of model IDs to only include those without configurations.

    Args:
        model_ids: List of model IDs to filter
        config_path: Optional path to config file. If None, uses default location.

    Returns:
        List of model IDs that don't have configurations
    """
    existing_configs = get_models_with_configs(config_path)
    return [mid for mid in model_ids if mid not in existing_configs]
