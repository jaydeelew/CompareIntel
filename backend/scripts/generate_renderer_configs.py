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

from scripts.config_helpers import has_model_config, load_existing_configs


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
            "paren": {"pattern": r"/\\\(\s*([^\\]*?)\s*\\\)/g", "name": "paren"},
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
        errors = []

        # Required fields
        if not config.get("modelId"):
            errors.append("Missing modelId")

        if not config.get("displayMathDelimiters") or not isinstance(
            config["displayMathDelimiters"], list
        ):
            errors.append("Missing or invalid displayMathDelimiters")

        if not config.get("inlineMathDelimiters") or not isinstance(
            config["inlineMathDelimiters"], list
        ):
            errors.append("Missing or invalid inlineMathDelimiters")

        if not config.get("codeBlockPreservation"):
            errors.append("Missing codeBlockPreservation")
        else:
            cb = config["codeBlockPreservation"]
            if not cb.get("enabled"):
                errors.append("Code block preservation must be enabled")
            if not cb.get("extractBeforeProcessing"):
                errors.append("Code blocks must be extracted before processing")
            if not cb.get("restoreAfterProcessing"):
                errors.append("Code blocks must be restored after processing")

        # Validate delimiter patterns
        for delim_type in ["displayMathDelimiters", "inlineMathDelimiters"]:
            if delim_type in config:
                for delim in config[delim_type]:
                    if not delim.get("pattern"):
                        errors.append(f"Missing pattern in {delim_type}")
                    if not delim.get("name"):
                        errors.append(f"Missing name in {delim_type}")

        return errors

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


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Generate renderer configurations from analysis data"
    )
    parser.add_argument("analysis_file", type=str, help="Path to analysis JSON file")
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

    args = parser.parse_args()

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

    # Create output directory if needed
    # Resolve relative paths from project root (two levels up from script location)
    if not Path(args.output).is_absolute():
        script_dir = Path(__file__).parent
        project_root = script_dir.parent.parent
        output_path = project_root / args.output
    else:
        output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Write configurations
    generator.log(f"\nWriting configurations to {output_path}...")
    try:
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(configs, f, indent=2, ensure_ascii=False)
        generator.log(f"Successfully wrote {len(configs)} configurations to {output_path}")
    except Exception as e:
        print(f"Error writing output file: {e}", file=sys.stderr)
        sys.exit(1)

    generator.log("\nConfiguration generation complete!")


if __name__ == "__main__":
    main()
