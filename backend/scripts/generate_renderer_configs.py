#!/usr/bin/env python3
"""
Configuration generator script for model-specific rendering.

This script generates renderer configurations from Phase 1 analysis data.
It reads the analysis JSON file and generates configurations for all models
based on the identified patterns and issues.

Usage:
    python scripts/generate_renderer_configs.py <analysis_file.json> [--output FILE]

Options:
    --output: Output file path (default: frontend/src/config/model_renderer_configs.json)
"""

import argparse
import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

# Add parent directory to path to import script modules
sys.path.insert(0, str(Path(__file__).parent.parent))

from scripts.config_helpers import (
    ensure_standard_math_delimiters,
    has_model_config,
    load_existing_configs,
)


class ConfigGenerator:
    """Generates renderer configurations from analysis data."""

    def __init__(self, verbose: bool = True):
        self.verbose = verbose

    def log(self, message: str):
        """Print log message if verbose."""
        if self.verbose:
            print(message)

    def create_delimiter_pattern(self, delimiter_type: str, priority: int) -> dict[str, Any]:
        """Create a delimiter pattern object from delimiter type name.

        Args:
            delimiter_type: Type name (e.g., 'double-dollar', 'bracket')
            priority: Priority number (lower processed first)

        Returns:
            Dictionary with pattern (as string), name, and priority
        """
        # Map delimiter types to regex patterns (as strings for JSON)
        delimiter_map = {
            "double-dollar": {"pattern": r"/\$\$([^\$]+?)\$\$/gs", "name": "double-dollar"},
            "single-dollar": {
                "pattern": r"/(?<!\$)\$([^\$\n]+?)\$(?!\$)/g",
                "name": "single-dollar",
            },
            "bracket": {"pattern": r"/\\\[\s*([\s\S]*?)\s*\\\]/g", "name": "bracket"},
            "paren": {"pattern": r"/\\\(\s*([\s\S]*?)\s*\\\)/g", "name": "paren"},
            "align-env": {
                "pattern": r"/\\begin\{align\}([\s\S]*?)\\end\{align\}/g",
                "name": "align-env",
            },
            "equation-env": {
                "pattern": r"/\\begin\{equation\}([\s\S]*?)\\end\{equation\}/g",
                "name": "equation-env",
            },
        }

        if delimiter_type not in delimiter_map:
            self.log(f"Warning: Unknown delimiter type '{delimiter_type}', skipping")
            return None

        return {
            "pattern": delimiter_map[delimiter_type]["pattern"],
            "name": delimiter_map[delimiter_type]["name"],
            "priority": priority,
        }

    def generate_config(self, model_id: str, analysis: dict[str, Any]) -> dict[str, Any]:
        """Generate a renderer configuration from analysis data.

        Args:
            model_id: Model identifier
            analysis: Analysis data for the model

        Returns:
            Generated configuration dictionary
        """
        # Extract delimiter information
        display_delimiters = analysis.get("delimiters", {}).get("display", ["double-dollar"])
        inline_delimiters = analysis.get("delimiters", {}).get("inline", ["single-dollar"])

        # Extract issues
        issues = analysis.get("issues", [])
        has_escaped_dollars = "escaped_dollar_signs" in issues
        has_html_in_math = "html_in_math" in issues
        has_broken_links = "broken_markdown_links" in issues

        # Extract markdown elements
        markdown_elements = analysis.get("markdown_elements", {})

        # Create delimiter patterns
        display_patterns = []
        priority = 1
        for delim_type in display_delimiters:
            pattern = self.create_delimiter_pattern(delim_type, priority)
            if pattern:
                display_patterns.append(pattern)
                priority += 1

        inline_patterns = []
        priority = 1
        for delim_type in inline_delimiters:
            pattern = self.create_delimiter_pattern(delim_type, priority)
            if pattern:
                inline_patterns.append(pattern)
                priority += 1

        # `$`-only samples must not drop `\(...\)` / `\[...\]`.
        display_patterns, inline_patterns = ensure_standard_math_delimiters(
            display_patterns, inline_patterns
        )

        # Build preprocessing options
        preprocessing = {
            "fixEscapedDollars": has_escaped_dollars,
            "removeHtmlFromMath": has_html_in_math,
            "removeMathML": True,  # Always remove MathML artifacts
            "removeSVG": True,  # Always remove SVG artifacts
        }

        # Build markdown processing rules
        markdown_processing = {
            "processLinks": markdown_elements.get("links", True) is not False,
            "fixBrokenLinks": has_broken_links,
            "processTables": markdown_elements.get("tables", True) is not False,
            "processBlockquotes": markdown_elements.get("blockquotes", True) is not False,
            "processHorizontalRules": markdown_elements.get("horizontal_rules", True) is not False,
            "processHeaders": markdown_elements.get("headers", True) is not False,
            "processBoldItalic": True,  # Always process
            "processLists": markdown_elements.get("lists", True) is not False,
            "processInlineCode": markdown_elements.get("inline_code", True) is not False,
        }

        # Build KaTeX options (standardized best practices)
        katex_options = {
            "throwOnError": False,  # Graceful degradation
            "strict": False,  # Permissive mode
            "trust": ["\\url", "\\href", "\\includegraphics"],  # Trust these commands
            "macros": {"\\eqref": "\\href{###1}{(\\text{#1})}"},
            "maxSize": 500,
            "maxExpand": 1000,
        }

        # Code block preservation (always enabled)
        code_block_preservation = {
            "enabled": True,
            "extractBeforeProcessing": True,
            "restoreAfterProcessing": True,
        }

        # Build configuration
        config = {
            "modelId": model_id,
            "version": "1.0.0",
            "displayMathDelimiters": display_patterns,
            "inlineMathDelimiters": inline_patterns,
            "preprocessing": preprocessing,
            "markdownProcessing": markdown_processing,
            "katexOptions": katex_options,
            "codeBlockPreservation": code_block_preservation,
            "metadata": {
                "createdAt": datetime.now(UTC).isoformat() + "Z",
                "needsManualReview": analysis.get("needs_manual_review", False),
            },
        }

        return config

    def validate_config(self, config: dict[str, Any]) -> list[str]:
        """Validate a generated configuration.

        Args:
            config: Configuration to validate

        Returns:
            List of validation errors (empty if valid)
        """
        from scripts.catalog_transaction import renderer_config_errors

        # The generator unit tests use short fixture ids. The catalog commit
        # and ``--check`` path require provider/model-name ids separately.
        return renderer_config_errors(config, require_provider_id=False)

    def generate_configs(
        self, analysis_data: dict[str, Any], preserve_existing: bool = True
    ) -> list[dict[str, Any]]:
        """Generate configurations for all models in analysis data.

        Args:
            analysis_data: Full analysis data dictionary
            preserve_existing: If True, preserve existing configs for models not in analysis

        Returns:
            List of generated configurations
        """
        analyses = analysis_data.get("analyses", {})
        configs = []
        errors = []
        skipped_count = 0

        # Load existing configs if preserving
        existing_configs = {}
        if preserve_existing:
            existing_configs = load_existing_configs()
            self.log(f"Loaded {len(existing_configs)} existing configurations")

        self.log(f"Generating configurations for {len(analyses)} models...")

        new_configs_count = 0
        for model_id, analysis in analyses.items():
            # Skip models that already have configs
            if preserve_existing and has_model_config(model_id):
                self.log(f"Skipping {model_id} (already has renderer config)")
                skipped_count += 1
                continue

            try:
                config = self.generate_config(model_id, analysis)
                validation_errors = self.validate_config(config)

                if validation_errors:
                    errors.append(f"{model_id}: {', '.join(validation_errors)}")
                    self.log(f"Warning: Validation errors for {model_id}: {validation_errors}")
                else:
                    configs.append(config)
                    new_configs_count += 1
                    self.log(f"Generated config for {model_id}")
            except Exception as e:
                errors.append(f"{model_id}: {str(e)}")
                self.log(f"Error generating config for {model_id}: {e}")

        # Add existing configs that weren't regenerated
        preserved_count = 0
        if preserve_existing:
            for model_id, existing_config in existing_configs.items():
                # Only add if not in the new configs (wasn't regenerated)
                if not any(c.get("modelId") == model_id for c in configs):
                    configs.append(existing_config)
                    preserved_count += 1
                    self.log(f"Preserved existing config for {model_id}")

        if skipped_count > 0:
            self.log(f"\nSkipped {skipped_count} model(s) that already have renderer configs")

        if errors:
            self.log(f"\nEncountered {len(errors)} errors:")
            for error in errors:
                self.log(f"  - {error}")

        self.log(
            f"\nSuccessfully generated {len(configs)} total configurations ({new_configs_count} new, {preserved_count} preserved)"
        )
        return configs


def _output_path(raw: str) -> Path:
    if Path(raw).is_absolute():
        return Path(raw)
    script_dir = Path(__file__).parent
    project_root = script_dir.parent.parent
    return project_root / raw


def _check_output(output_path: Path) -> int:
    """Validate the committed configs and compare them to generator normalization.

    Writes nothing. A drift or schema error leaves the file unchanged.
    """
    from scripts.catalog_transaction import (
        generator_drift,
        load_renderer_configs,
        validate_renderer_configs,
    )

    if not output_path.is_file():
        print(f"Error: Renderer config file not found: {output_path}", file=sys.stderr)
        return 1
    configs = load_renderer_configs(output_path)
    errors = validate_renderer_configs(configs)
    errors.extend(generator_drift(configs))
    if errors:
        print("Renderer configs are not up to date with the generator:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        print("See docs/development/ADDING_NEW_MODELS.md", file=sys.stderr)
        return 1
    print(f"Renderer configs match the generator checks: {output_path}")
    return 0


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Generate renderer configurations from analysis data"
    )
    parser.add_argument(
        "analysis_file",
        nargs="?",
        type=str,
        help="Path to analysis JSON file (omit with --check)",
    )
    parser.add_argument(
        "--output",
        type=str,
        default="frontend/src/config/model_renderer_configs.json",
        help="Output file path",
    )
    parser.add_argument("--quiet", action="store_true", help="Suppress verbose output")
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Overwrite existing configs instead of preserving them",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Validate the output file against the generator and write nothing",
    )

    args = parser.parse_args()
    output_path = _output_path(args.output)

    if args.check and not args.analysis_file:
        sys.exit(_check_output(output_path))

    if not args.analysis_file:
        print("Error: analysis file is required unless --check is set", file=sys.stderr)
        sys.exit(1)

    # Load analysis data
    analysis_path = Path(args.analysis_file)
    if not analysis_path.exists():
        print(f"Error: Analysis file not found: {analysis_path}", file=sys.stderr)
        sys.exit(1)

    generator = ConfigGenerator(verbose=not args.quiet)
    generator.log(f"Loading analysis data from {analysis_path}...")

    try:
        with open(analysis_path, encoding="utf-8") as f:
            analysis_data = json.load(f)
    except Exception as e:
        print(f"Error loading analysis file: {e}", file=sys.stderr)
        sys.exit(1)

    # Generate configurations (preserve existing by default)
    preserve_existing = not args.overwrite
    configs = generator.generate_configs(analysis_data, preserve_existing=preserve_existing)

    if not configs:
        print("Error: No configurations generated", file=sys.stderr)
        sys.exit(1)

    from scripts.catalog_transaction import validate_renderer_configs

    validation_errors = validate_renderer_configs(configs)
    if validation_errors:
        print("Refusing to write renderer configs. Validation failed:", file=sys.stderr)
        for error in validation_errors:
            print(f"- {error}", file=sys.stderr)
        print("The output file was not changed.", file=sys.stderr)
        sys.exit(1)

    if args.check:
        sys.exit(_check_output(output_path))

    # Write configurations only after every config validates.
    from app.utils.atomic_json import atomic_write_json

    generator.log(f"\nWriting configurations to {output_path}...")
    try:
        atomic_write_json(output_path, configs)
        generator.log(f"Successfully wrote {len(configs)} configurations to {output_path}")
    except Exception as e:
        print(f"Error writing output file: {e}", file=sys.stderr)
        sys.exit(1)

    generator.log("\nConfiguration generation complete!")


if __name__ == "__main__":
    main()
