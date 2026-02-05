#!/usr/bin/env python3
"""
Tests for the configuration generator script.
"""

import sys
import unittest
from pathlib import Path

# Add parent directory to path to import the script
sys.path.insert(0, str(Path(__file__).parent.parent))

from generate_renderer_configs import ConfigGenerator


class TestConfigGenerator(unittest.TestCase):
    """Test cases for ConfigGenerator."""

    def setUp(self):
        """Set up test fixtures."""
        self.generator = ConfigGenerator(verbose=False)

    def test_create_delimiter_pattern_double_dollar(self):
        """Test creating double-dollar delimiter pattern."""
        pattern = self.generator.create_delimiter_pattern("double-dollar", 1)
        self.assertIsNotNone(pattern)
        self.assertEqual(pattern["name"], "double-dollar")
        self.assertEqual(pattern["priority"], 1)
        self.assertIn("pattern", pattern)
        # Pattern is escaped in JSON format, check for escaped version
        self.assertIn("\\$\\$", pattern["pattern"])

    def test_create_delimiter_pattern_single_dollar(self):
        """Test creating single-dollar delimiter pattern."""
        pattern = self.generator.create_delimiter_pattern("single-dollar", 1)
        self.assertIsNotNone(pattern)
        self.assertEqual(pattern["name"], "single-dollar")
        self.assertEqual(pattern["priority"], 1)

    def test_create_delimiter_pattern_bracket(self):
        """Test creating bracket delimiter pattern."""
        pattern = self.generator.create_delimiter_pattern("bracket", 1)
        self.assertIsNotNone(pattern)
        self.assertEqual(pattern["name"], "bracket")

    def test_create_delimiter_pattern_paren(self):
        """Test creating paren delimiter pattern."""
        pattern = self.generator.create_delimiter_pattern("paren", 1)
        self.assertIsNotNone(pattern)
        self.assertEqual(pattern["name"], "paren")

    def test_create_delimiter_pattern_align_env(self):
        """Test creating align-env delimiter pattern."""
        pattern = self.generator.create_delimiter_pattern("align-env", 1)
        self.assertIsNotNone(pattern)
        self.assertEqual(pattern["name"], "align-env")

    def test_create_delimiter_pattern_equation_env(self):
        """Test creating equation-env delimiter pattern."""
        pattern = self.generator.create_delimiter_pattern("equation-env", 1)
        self.assertIsNotNone(pattern)
        self.assertEqual(pattern["name"], "equation-env")

    def test_create_delimiter_pattern_unknown(self):
        """Test handling unknown delimiter type."""
        pattern = self.generator.create_delimiter_pattern("unknown-type", 1)
        self.assertIsNone(pattern)

    def test_generate_config_basic(self):
        """Test generating a basic configuration."""
        analysis = {
            "delimiters": {"display": ["double-dollar"], "inline": ["single-dollar"]},
            "issues": [],
            "markdown_elements": {"bold": True, "links": True},
            "needs_manual_review": False,
        }

        config = self.generator.generate_config("test-model", analysis)

        self.assertEqual(config["modelId"], "test-model")
        self.assertEqual(config["version"], "1.0.0")
        self.assertIn("displayMathDelimiters", config)
        self.assertIn("inlineMathDelimiters", config)
        self.assertIn("preprocessing", config)
        self.assertIn("markdownProcessing", config)
        self.assertIn("katexOptions", config)
        self.assertIn("codeBlockPreservation", config)
        self.assertIn("metadata", config)

    def test_generate_config_with_escaped_dollars(self):
        """Test generating config with escaped dollar signs issue."""
        analysis = {
            "delimiters": {"display": ["double-dollar"], "inline": ["single-dollar"]},
            "issues": ["escaped_dollar_signs"],
            "markdown_elements": {},
            "needs_manual_review": False,
        }

        config = self.generator.generate_config("test-model", analysis)

        self.assertTrue(config["preprocessing"]["fixEscapedDollars"])
        self.assertFalse(config["preprocessing"]["removeHtmlFromMath"])

    def test_generate_config_with_html_in_math(self):
        """Test generating config with HTML in math issue."""
        analysis = {
            "delimiters": {"display": ["double-dollar"], "inline": ["single-dollar"]},
            "issues": ["html_in_math"],
            "markdown_elements": {},
            "needs_manual_review": False,
        }

        config = self.generator.generate_config("test-model", analysis)

        self.assertTrue(config["preprocessing"]["removeHtmlFromMath"])
        self.assertFalse(config["preprocessing"]["fixEscapedDollars"])

    def test_generate_config_with_broken_links(self):
        """Test generating config with broken markdown links issue."""
        analysis = {
            "delimiters": {"display": ["double-dollar"], "inline": ["single-dollar"]},
            "issues": ["broken_markdown_links"],
            "markdown_elements": {"links": True},
            "needs_manual_review": False,
        }

        config = self.generator.generate_config("test-model", analysis)

        self.assertTrue(config["markdownProcessing"]["fixBrokenLinks"])

    def test_generate_config_code_block_preservation(self):
        """Test that code block preservation is always enabled."""
        analysis = {
            "delimiters": {"display": ["double-dollar"], "inline": ["single-dollar"]},
            "issues": [],
            "markdown_elements": {},
            "needs_manual_review": False,
        }

        config = self.generator.generate_config("test-model", analysis)

        cb = config["codeBlockPreservation"]
        self.assertTrue(cb["enabled"])
        self.assertTrue(cb["extractBeforeProcessing"])
        self.assertTrue(cb["restoreAfterProcessing"])

    def test_generate_config_always_removes_mathml_svg(self):
        """Test that MathML and SVG removal are always enabled."""
        analysis = {
            "delimiters": {"display": ["double-dollar"], "inline": ["single-dollar"]},
            "issues": [],
            "markdown_elements": {},
            "needs_manual_review": False,
        }

        config = self.generator.generate_config("test-model", analysis)

        self.assertTrue(config["preprocessing"]["removeMathML"])
        self.assertTrue(config["preprocessing"]["removeSVG"])

    def test_validate_config_valid(self):
        """Test validation of a valid configuration."""
        config = {
            "modelId": "test-model",
            "version": "1.0.0",
            "displayMathDelimiters": [
                {"pattern": "/\\$\\$([^\\$]+?)\\$\\$/gs", "name": "double-dollar", "priority": 1}
            ],
            "inlineMathDelimiters": [
                {
                    "pattern": "/(?<!\\$)\\$([^\\$\\n]+?)\\$(?!\\$)/g",
                    "name": "single-dollar",
                    "priority": 1,
                }
            ],
            "codeBlockPreservation": {
                "enabled": True,
                "extractBeforeProcessing": True,
                "restoreAfterProcessing": True,
            },
        }

        errors = self.generator.validate_config(config)
        self.assertEqual(len(errors), 0)

    def test_validate_config_missing_model_id(self):
        """Test validation fails when modelId is missing."""
        config = {
            "version": "1.0.0",
            "displayMathDelimiters": [],
            "inlineMathDelimiters": [],
            "codeBlockPreservation": {
                "enabled": True,
                "extractBeforeProcessing": True,
                "restoreAfterProcessing": True,
            },
        }

        errors = self.generator.validate_config(config)
        self.assertGreater(len(errors), 0)
        # Check for error about missing modelId (case-insensitive)
        error_text = " ".join(errors).lower()
        self.assertTrue("modelid" in error_text or "model" in error_text)

    def test_validate_config_code_block_not_enabled(self):
        """Test validation fails when code block preservation is not enabled."""
        config = {
            "modelId": "test-model",
            "displayMathDelimiters": [],
            "inlineMathDelimiters": [],
            "codeBlockPreservation": {
                "enabled": False,
                "extractBeforeProcessing": True,
                "restoreAfterProcessing": True,
            },
        }

        errors = self.generator.validate_config(config)
        self.assertGreater(len(errors), 0)
        self.assertTrue(any("code block" in error.lower() for error in errors))

    def test_generate_configs_from_analysis_data(self):
        """Test generating configurations from full analysis data."""
        analysis_data = {
            "analyses": {
                "model-1": {
                    "delimiters": {"display": ["double-dollar"], "inline": ["single-dollar"]},
                    "issues": ["escaped_dollar_signs"],
                    "markdown_elements": {"bold": True},
                    "needs_manual_review": False,
                },
                "model-2": {
                    "delimiters": {"display": ["bracket"], "inline": ["paren"]},
                    "issues": [],
                    "markdown_elements": {"links": True},
                    "needs_manual_review": True,
                },
            }
        }

        configs = self.generator.generate_configs(analysis_data)

        self.assertEqual(len(configs), 2)
        self.assertEqual(configs[0]["modelId"], "model-1")
        self.assertEqual(configs[1]["modelId"], "model-2")

        # Verify model-1 has escaped dollars fix enabled
        self.assertTrue(configs[0]["preprocessing"]["fixEscapedDollars"])

        # Verify model-2 has manual review flag
        self.assertTrue(configs[1]["metadata"]["needsManualReview"])


if __name__ == "__main__":
    unittest.main()
