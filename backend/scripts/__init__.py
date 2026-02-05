"""
Scripts for model-specific rendering analysis and configuration generation.

This package contains scripts for:
- Collecting model responses (collect_model_responses.py)
- Analyzing responses for rendering patterns (analyze_responses.py)
- Test prompt definitions (test_prompts.py)
"""

from scripts.test_prompts import TEST_PROMPTS, get_all_prompt_names, get_prompt_by_name

__all__ = [
    "TEST_PROMPTS",
    "get_prompt_by_name",
    "get_all_prompt_names",
]
