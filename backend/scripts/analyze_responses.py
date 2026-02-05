#!/usr/bin/env python3
"""
Response analysis script for model-specific rendering configuration generation.

This script analyzes collected model responses to identify:
- Math delimiter patterns used by each model
- Markdown formatting variations
- Common artifacts or malformed content (MathML, HTML tags, etc.)
- Edge cases and special patterns
- Any formatting that breaks with current unified renderer

The script generates initial renderer configurations and identifies
patterns that need manual review.

Usage:
    python scripts/analyze_responses.py <responses_file.json> [--output-dir DIR] [--format FORMAT]

Options:
    --output-dir: Directory to save analysis results (default: backend/data/analysis)
    --format: Output format - 'json', 'markdown', or 'both' (default: 'both')
"""

import argparse
import json
import re
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

# Add parent directory to path to import script modules
sys.path.insert(0, str(Path(__file__).parent.parent))

from scripts.config_helpers import has_model_config


class ResponseAnalyzer:
    """Analyzes model responses to identify rendering patterns."""

    def __init__(self, verbose: bool = True):
        self.verbose = verbose
        self.analysis_results = {}

    def log(self, message: str):
        """Print log message if verbose."""
        if self.verbose:
            print(message)

    def analyze_math_delimiters(self, response: str) -> dict[str, list[str]]:
        """Analyze what math delimiters a model uses."""
        delimiters = {"display": [], "inline": []}

        # Check for various delimiter patterns
        patterns = {
            "display": [
                (r"\$\$([^\$]+?)\$\$", "double-dollar"),
                (r"\\\[\s*([\s\S]*?)\s*\\\]", "bracket"),
                (r"<math[^>]*>([\s\S]*?)</math>", "mathml"),
                (r"\\begin\{equation\}([\s\S]*?)\\end\{equation\}", "equation-env"),
                (r"\\begin\{align\}([\s\S]*?)\\end\{align\}", "align-env"),
            ],
            "inline": [
                (r"(?<!\$)\$([^\$\n]+?)\$(?!\$)", "single-dollar"),
                (r"\\\(\s*([^\\]*?)\s*\\\)", "paren"),
                (r"<math[^>]*>([\s\S]*?)</math>", "mathml-inline"),
            ],
        }

        for category, pattern_list in patterns.items():
            for pattern, name in pattern_list:
                matches = re.findall(pattern, response, re.IGNORECASE | re.MULTILINE)
                if matches:
                    delimiters[category].append(name)

        return delimiters

    def analyze_markdown_elements(self, response: str) -> dict[str, bool]:
        """Analyze what markdown elements are present."""
        elements = {
            "bold": bool(re.search(r"\*\*[^*]+\*\*", response)),
            "italic": bool(re.search(r"(?<!\*)\*[^*]+\*(?!\*)", response)),
            "code_blocks": bool(re.search(r"```[\s\S]*?```", response)),
            "inline_code": bool(re.search(r"`[^`]+`", response)),
            "headers": bool(re.search(r"^#{1,6}\s+", response, re.MULTILINE)),
            "lists": bool(
                re.search(r"^[\s]*[-*+]\s+", response, re.MULTILINE)
                or re.search(r"^\d+\.\s+", response, re.MULTILINE)
            ),
            "links": bool(re.search(r"\[([^\]]+)\]\(([^)]+)\)", response)),
            "tables": bool(re.search(r"\|.*\|", response)),
            "blockquotes": bool(re.search(r"^>\s+", response, re.MULTILINE)),
            "horizontal_rules": bool(re.search(r"^---|^___|^\*\*\*", response, re.MULTILINE)),
        }
        return elements

    def analyze_issues(self, response: str) -> list[str]:
        """Identify rendering issues in the response."""
        issues = []

        # Check for MathML artifacts (common in Gemini)
        if "xmlns" in response and "w3.org" in response:
            issues.append("mathml_artifacts")

        # Check for malformed LaTeX
        if re.search(r"\\[a-zA-Z]+\{[^}]*$", response):  # Unclosed braces
            issues.append("unclosed_braces")

        # Check for HTML tags in math
        if re.search(r"<[^>]+>.*\\[a-zA-Z]", response):
            issues.append("html_in_math")

        # Check for code block issues
        code_block_count = response.count("```")
        if code_block_count > 0 and code_block_count % 2 != 0:
            issues.append("unclosed_code_blocks")

        # Check for escaped dollar signs that shouldn't be
        if re.search(r"\\\$[0-9]", response):
            issues.append("escaped_dollar_signs")

        # Check for malformed fractions
        if re.search(r"\\frac\{[^}]*$", response):
            issues.append("malformed_fractions")

        # Check for broken markdown links
        if re.search(r"\[[^\]]*$", response) or re.search(r"\]\([^)]*$", response):
            issues.append("broken_markdown_links")

        return issues

    def analyze_code_block_preservation(self, response: str) -> dict[str, any]:
        """Analyze code block formatting to ensure preservation."""
        code_blocks = re.findall(r"```(\w+)?\n([\s\S]*?)```", response)

        analysis = {
            "code_block_count": len(code_blocks),
            "languages": [lang for lang, _ in code_blocks if lang],
            "contains_math_like_content": False,
            "contains_dollar_signs": False,
            "contains_latex_commands": False,
        }

        for lang, content in code_blocks:
            if re.search(r"\\[a-zA-Z]+\{", content):
                analysis["contains_latex_commands"] = True
            if "$" in content:
                analysis["contains_dollar_signs"] = True
            if re.search(r"[a-zA-Z]\^[0-9]|\\frac|\\sum|\\int", content):
                analysis["contains_math_like_content"] = True

        return analysis

    def analyze_model_responses(self, model_id: str, responses: dict[str, dict]) -> dict:
        """Analyze all responses for a single model."""
        self.log(f"  Analyzing {model_id}...")

        # Aggregate analysis across all prompts
        all_delimiters = {"display": set(), "inline": set()}
        all_markdown_elements = defaultdict(bool)
        all_issues = set()
        code_block_analyses = []

        successful_responses = 0

        for prompt_name, response_data in responses.items():
            if not response_data.get("success") or not response_data.get("response"):
                continue

            response = response_data["response"]
            successful_responses += 1

            # Analyze delimiters
            delimiters = self.analyze_math_delimiters(response)
            all_delimiters["display"].update(delimiters["display"])
            all_delimiters["inline"].update(delimiters["inline"])

            # Analyze markdown
            markdown = self.analyze_markdown_elements(response)
            for element, present in markdown.items():
                if present:
                    all_markdown_elements[element] = True

            # Analyze issues
            issues = self.analyze_issues(response)
            all_issues.update(issues)

            # Analyze code blocks
            code_analysis = self.analyze_code_block_preservation(response)
            if code_analysis["code_block_count"] > 0:
                code_block_analyses.append(code_analysis)

        return {
            "model_id": model_id,
            "successful_responses": successful_responses,
            "delimiters": {
                "display": sorted(list(all_delimiters["display"])),
                "inline": sorted(list(all_delimiters["inline"])),
            },
            "markdown_elements": dict(all_markdown_elements),
            "issues": sorted(list(all_issues)),
            "code_block_analysis": {
                "total_blocks": sum(a["code_block_count"] for a in code_block_analyses),
                "languages_found": sorted(
                    set(lang for a in code_block_analyses for lang in a["languages"])
                ),
                "contains_math_like_content": any(
                    a["contains_math_like_content"] for a in code_block_analyses
                ),
                "contains_dollar_signs": any(
                    a["contains_dollar_signs"] for a in code_block_analyses
                ),
                "contains_latex_commands": any(
                    a["contains_latex_commands"] for a in code_block_analyses
                ),
            },
            "needs_manual_review": len(all_issues) > 0 or len(all_delimiters["display"]) == 0,
        }

    def analyze_responses_file(self, file_path: Path) -> dict:
        """Analyze a collected responses file."""
        self.log(f"Loading responses from {file_path}...")

        with open(file_path, encoding="utf-8") as f:
            data = json.load(f)

        # Extract results (handle both old and new format)
        if "results" in data:
            results = data["results"]
            collection_metadata = data.get("collection_metadata", {})
        else:
            results = data
            collection_metadata = {}

        self.log(f"Found {len(results)} models to analyze\n")

        analyses = {}
        skipped_count = 0

        for model_id, model_data in results.items():
            if "responses" not in model_data:
                continue

            # Skip models that already have configs
            if has_model_config(model_id):
                self.log(f"  Skipping {model_id} (already has renderer config)")
                skipped_count += 1
                continue

            analysis = self.analyze_model_responses(
                model_id=model_id, responses=model_data["responses"]
            )
            analyses[model_id] = analysis

        if skipped_count > 0:
            self.log(f"\nSkipped {skipped_count} model(s) that already have renderer configs")

        return {
            "analysis_metadata": {
                "timestamp": datetime.now().isoformat(),
                "source_file": str(file_path),
                "collection_metadata": collection_metadata,
                "total_models_analyzed": len(analyses),
                "script_version": "1.0",
            },
            "analyses": analyses,
        }

    def generate_summary_report(self, analysis_data: dict) -> str:
        """Generate a human-readable summary report."""
        analyses = analysis_data["analyses"]
        metadata = analysis_data["analysis_metadata"]

        report = []
        report.append("# Model Response Analysis Summary")
        report.append("")
        report.append(f"**Analysis Date:** {metadata['timestamp']}")
        report.append(f"**Source File:** {metadata['source_file']}")
        report.append(f"**Total Models Analyzed:** {metadata['total_models_analyzed']}")
        report.append("")
        report.append("---")
        report.append("")

        # Summary statistics
        total_issues = sum(len(a["issues"]) for a in analyses.values())
        models_with_issues = sum(1 for a in analyses.values() if a["issues"])
        models_needing_review = sum(1 for a in analyses.values() if a["needs_manual_review"])

        report.append("## Summary Statistics")
        report.append("")
        report.append(f"- **Total Models:** {len(analyses)}")
        report.append(f"- **Models with Issues:** {models_with_issues}")
        report.append(f"- **Models Needing Manual Review:** {models_needing_review}")
        report.append(f"- **Total Issues Found:** {total_issues}")
        report.append("")

        # Common issues
        all_issues = defaultdict(int)
        for analysis in analyses.values():
            for issue in analysis["issues"]:
                all_issues[issue] += 1

        if all_issues:
            report.append("## Common Issues")
            report.append("")
            for issue, count in sorted(all_issues.items(), key=lambda x: -x[1]):
                report.append(f"- **{issue}:** {count} models")
            report.append("")

        # Per-model details
        report.append("## Per-Model Analysis")
        report.append("")

        for model_id, analysis in sorted(analyses.items()):
            report.append(f"### {model_id}")
            report.append("")
            report.append(f"- **Successful Responses:** {analysis['successful_responses']}")
            report.append(
                f"- **Display Math Delimiters:** {', '.join(analysis['delimiters']['display']) or 'None found'}"
            )
            report.append(
                f"- **Inline Math Delimiters:** {', '.join(analysis['delimiters']['inline']) or 'None found'}"
            )
            report.append(
                f"- **Markdown Elements:** {', '.join(analysis['markdown_elements'].keys()) or 'None found'}"
            )

            if analysis["issues"]:
                report.append(f"- **Issues:** {', '.join(analysis['issues'])}")

            if analysis["code_block_analysis"]["total_blocks"] > 0:
                cb = analysis["code_block_analysis"]
                report.append(f"- **Code Blocks:** {cb['total_blocks']} found")
                if cb["languages_found"]:
                    report.append(f"  - Languages: {', '.join(cb['languages_found'])}")
                if cb["contains_math_like_content"]:
                    report.append("  - ⚠️ Contains math-like content (needs careful preservation)")
                if cb["contains_dollar_signs"]:
                    report.append("  - ⚠️ Contains dollar signs (needs careful preservation)")

            if analysis["needs_manual_review"]:
                report.append("- **⚠️ Needs Manual Review**")

            report.append("")

        return "\n".join(report)

    def save_analysis(self, analysis_data: dict, output_dir: Path, format: str = "both"):
        """Save analysis results in specified format(s)."""
        output_dir.mkdir(parents=True, exist_ok=True)

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

        if format in ("json", "both"):
            json_file = output_dir / f"analysis_{timestamp}.json"
            with open(json_file, "w", encoding="utf-8") as f:
                json.dump(analysis_data, f, indent=2, ensure_ascii=False)
            self.log(f"✓ JSON analysis saved to {json_file}")

        if format in ("markdown", "both"):
            markdown_file = output_dir / f"analysis_{timestamp}.md"
            report = self.generate_summary_report(analysis_data)
            with open(markdown_file, "w", encoding="utf-8") as f:
                f.write(report)
            self.log(f"✓ Markdown report saved to {markdown_file}")


def main():
    """Main entry point for the analysis script."""
    parser = argparse.ArgumentParser(
        description="Analyze collected model responses for rendering patterns"
    )
    parser.add_argument("responses_file", type=str, help="Path to collected responses JSON file")
    parser.add_argument(
        "--output-dir",
        type=str,
        default="backend/data/analysis",
        help="Directory to save analysis results",
    )
    parser.add_argument(
        "--format",
        choices=["json", "markdown", "both"],
        default="both",
        help="Output format (default: both)",
    )
    parser.add_argument("--quiet", action="store_true", help="Suppress verbose output")

    args = parser.parse_args()

    # Validate input file
    responses_file = Path(args.responses_file)
    if not responses_file.exists():
        print(f"Error: File not found: {responses_file}")
        sys.exit(1)

    # Create analyzer
    analyzer = ResponseAnalyzer(verbose=not args.quiet)

    # Analyze responses
    try:
        analysis_data = analyzer.analyze_responses_file(responses_file)

        # Save results
        output_dir = Path(args.output_dir)
        analyzer.save_analysis(analysis_data, output_dir, args.format)

        print("\n✓ Analysis complete!")

    except Exception as e:
        print(f"\n\nError during analysis: {e}")
        import traceback

        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
