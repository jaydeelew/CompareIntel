#!/usr/bin/env python3
"""
Combined script to collect responses, analyze, and generate renderer config for a single model.

This script combines the three-step process:
1. Collect responses from the model
2. Analyze responses to identify patterns
3. Generate renderer configuration

Usage:
    python scripts/setup_model_renderer.py <model_id>
"""

import json
import re
import sys
import argparse
import asyncio
from pathlib import Path
from typing import Dict, List, Optional, Any, Set
from collections import defaultdict
from datetime import datetime, UTC
import time

# Add parent directory to path to import app modules
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.model_runner import call_openrouter, OPENROUTER_MODELS
from scripts.test_prompts import TEST_PROMPTS, get_all_prompt_names
from scripts.config_helpers import has_model_config, load_existing_configs


class ModelRendererSetup:
    """Combined class for collecting, analyzing, and generating configs for a single model."""
    
    def __init__(self, model_id: str, delay: float = 1.0, max_retries: int = 3, verbose: bool = True, concurrency: int = 5):
        self.model_id = model_id
        self.delay = delay
        self.max_retries = max_retries
        self.verbose = verbose
        self.concurrency = concurrency
        self.stats = {"total_requests": 0, "successful": 0, "failed": 0}
    
    def log(self, message: str, end: str = "\n", flush: bool = False):
        """Print log message if verbose."""
        if self.verbose:
            print(message, end=end, flush=flush)
    
    def log_progress(self, stage: str, message: str, progress: Optional[float] = None):
        """Log progress in structured format for frontend consumption."""
        progress_data = {
            "stage": stage,
            "message": message,
            "timestamp": datetime.now().isoformat()
        }
        if progress is not None:
            progress_data["progress"] = progress
        # Output as JSON on a single line prefixed with PROGRESS: for easy parsing
        print(f"PROGRESS:{json.dumps(progress_data)}", flush=True)
        # Also log normally if verbose
        if self.verbose:
            print(message, flush=True)
    
    async def collect_response_async(self, prompt_name: str, prompt_text: str) -> tuple[str, Dict]:
        """Collect a single response asynchronously."""
        loop = asyncio.get_event_loop()
        
        for attempt in range(self.max_retries):
            try:
                # Run synchronous call_openrouter in a thread pool
                response = await loop.run_in_executor(
                    None,
                    call_openrouter,
                    prompt_text,
                    self.model_id,
                    "standard",
                    None,
                    False
                )
                
                self.stats["successful"] += 1
                return prompt_name, {
                    "prompt": prompt_text,
                    "prompt_name": prompt_name,
                    "response": response,
                    "timestamp": datetime.now().isoformat(),
                    "success": True,
                }
                
            except Exception as e:
                error_str = str(e).lower()
                if attempt < self.max_retries - 1:
                    if "rate limit" in error_str or "429" in error_str:
                        wait_time = (attempt + 1) * 5
                        await asyncio.sleep(wait_time)
                        continue
                    elif "timeout" in error_str:
                        wait_time = (attempt + 1) * 2
                        await asyncio.sleep(wait_time)
                        continue
                
                self.stats["failed"] += 1
                return prompt_name, {
                    "prompt": prompt_text,
                    "prompt_name": prompt_name,
                    "response": None,
                    "error": str(e)[:200],
                    "timestamp": datetime.now().isoformat(),
                    "success": False,
                }
        
        # Should not reach here
        return prompt_name, {
            "prompt": prompt_text,
            "prompt_name": prompt_name,
            "response": None,
            "error": "Max retries exceeded",
            "timestamp": datetime.now().isoformat(),
            "success": False,
        }
    
    async def collect_responses_async(self) -> Dict[str, Dict]:
        """Collect responses from all prompts concurrently."""
        self.log(f"Collecting responses from {self.model_id}...")
        self.log_progress("collecting", f"Collecting responses from {self.model_id}...", 0.0)
        
        prompt_names = get_all_prompt_names()
        total_prompts = len(prompt_names)
        self.stats["total_requests"] = total_prompts
        
        # Create list of (prompt_name, prompt_text) tuples
        prompt_tasks = []
        for prompt_name in prompt_names:
            prompt_data = next(p for p in TEST_PROMPTS if p["name"] == prompt_name)
            prompt_tasks.append((prompt_name, prompt_data["prompt"]))
        
        # Collect all responses concurrently with a semaphore to limit concurrency
        # This prevents overwhelming the API while still being much faster than sequential
        semaphore = asyncio.Semaphore(self.concurrency)
        
        async def collect_with_semaphore(prompt_name: str, prompt_text: str):
            async with semaphore:
                return await self.collect_response_async(prompt_name, prompt_text)
        
        # Create all tasks
        tasks = [
            collect_with_semaphore(prompt_name, prompt_text)
            for prompt_name, prompt_text in prompt_tasks
        ]
        
        # Execute all tasks concurrently
        self.log(f"  Collecting {total_prompts} responses concurrently...")
        results = await asyncio.gather(*tasks)
        
        # Convert results to dictionary
        responses = {}
        for i, (prompt_name, response_data) in enumerate(results):
            responses[prompt_name] = response_data
            progress = ((i + 1) / total_prompts) * 100
            if response_data["success"]:
                self.log(f"  [{i+1}/{total_prompts}] ✓ {prompt_name}")
                self.log_progress("collecting", f"Collected {i+1} of {total_prompts}: {prompt_name}", progress)
            else:
                error_preview = response_data.get("error", "Unknown error")[:50]
                self.log(f"  [{i+1}/{total_prompts}] ✗ {prompt_name} ({error_preview})")
                self.log_progress("collecting", f"Failed {i+1} of {total_prompts}: {prompt_name}", progress)
        
        self.log_progress("collecting", f"Completed collecting {self.stats['successful']} successful responses", 100.0)
        return responses
    
    def collect_responses(self) -> Dict[str, Dict]:
        """Collect responses from the model for all test prompts (synchronous wrapper)."""
        # Run async collection in sync context
        return asyncio.run(self.collect_responses_async())
    
    def analyze_responses(self, responses: Dict[str, Dict]) -> Dict[str, Any]:
        """Analyze collected responses to identify patterns."""
        self.log(f"Analyzing responses from {self.model_id}...")
        self.log_progress("analyzing", f"Analyzing responses from {self.model_id}...", 0.0)
        
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
            delimiters = self._analyze_math_delimiters(response)
            all_delimiters["display"].update(delimiters["display"])
            all_delimiters["inline"].update(delimiters["inline"])
            
            # Analyze markdown
            markdown = self._analyze_markdown_elements(response)
            for element, present in markdown.items():
                if present:
                    all_markdown_elements[element] = True
            
            # Analyze issues
            issues = self._analyze_issues(response)
            all_issues.update(issues)
            
            # Analyze code blocks
            code_analysis = self._analyze_code_block_preservation(response)
            if code_analysis["code_block_count"] > 0:
                code_block_analyses.append(code_analysis)
        
        self.log_progress("analyzing", f"Analysis complete. Found {len(all_delimiters['display'])} display and {len(all_delimiters['inline'])} inline delimiter types", 100.0)
        
        return {
            "model_id": self.model_id,
            "successful_responses": successful_responses,
            "delimiters": {
                "display": sorted(list(all_delimiters["display"])),
                "inline": sorted(list(all_delimiters["inline"]))
            },
            "markdown_elements": dict(all_markdown_elements),
            "issues": sorted(list(all_issues)),
            "code_block_analysis": {
                "total_blocks": sum(a["code_block_count"] for a in code_block_analyses),
                "languages_found": sorted(set(
                    lang for a in code_block_analyses
                    for lang in a["languages"]
                )),
                "contains_math_like_content": any(
                    a["contains_math_like_content"] for a in code_block_analyses
                ),
                "contains_dollar_signs": any(
                    a["contains_dollar_signs"] for a in code_block_analyses
                ),
                "contains_latex_commands": any(
                    a["contains_latex_commands"] for a in code_block_analyses
                )
            },
            "needs_manual_review": len(all_issues) > 0 or len(all_delimiters["display"]) == 0
        }
    
    def _analyze_math_delimiters(self, response: str) -> Dict[str, List[str]]:
        """Analyze what math delimiters a model uses."""
        delimiters = {"display": [], "inline": []}
        
        patterns = {
            "display": [
                (r'\$\$([^\$]+?)\$\$', 'double-dollar'),
                (r'\\\[\s*([\s\S]*?)\s*\\\]', 'bracket'),
                (r'<math[^>]*>([\s\S]*?)</math>', 'mathml'),
                (r'\\begin\{equation\}([\s\S]*?)\\end\{equation\}', 'equation-env'),
                (r'\\begin\{align\}([\s\S]*?)\\end\{align\}', 'align-env'),
            ],
            "inline": [
                (r'(?<!\$)\$([^\$\n]+?)\$(?!\$)', 'single-dollar'),
                (r'\\\(\s*([^\\]*?)\s*\\\)', 'paren'),
                (r'<math[^>]*>([\s\S]*?)</math>', 'mathml-inline'),
            ]
        }
        
        for category, pattern_list in patterns.items():
            for pattern, name in pattern_list:
                matches = re.findall(pattern, response, re.IGNORECASE | re.MULTILINE)
                if matches:
                    delimiters[category].append(name)
        
        return delimiters
    
    def _analyze_markdown_elements(self, response: str) -> Dict[str, bool]:
        """Analyze what markdown elements are present."""
        elements = {
            "bold": bool(re.search(r'\*\*[^*]+\*\*', response)),
            "italic": bool(re.search(r'(?<!\*)\*[^*]+\*(?!\*)', response)),
            "code_blocks": bool(re.search(r'```[\s\S]*?```', response)),
            "inline_code": bool(re.search(r'`[^`]+`', response)),
            "headers": bool(re.search(r'^#{1,6}\s+', response, re.MULTILINE)),
            "lists": bool(re.search(r'^[\s]*[-*+]\s+', response, re.MULTILINE) or 
                          re.search(r'^\d+\.\s+', response, re.MULTILINE)),
            "links": bool(re.search(r'\[([^\]]+)\]\(([^)]+)\)', response)),
            "tables": bool(re.search(r'\|.*\|', response)),
            "blockquotes": bool(re.search(r'^>\s+', response, re.MULTILINE)),
            "horizontal_rules": bool(re.search(r'^---|^___|^\*\*\*', response, re.MULTILINE)),
        }
        return elements
    
    def _analyze_issues(self, response: str) -> List[str]:
        """Identify rendering issues in the response."""
        issues = []
        
        if 'xmlns' in response and 'w3.org' in response:
            issues.append('mathml_artifacts')
        
        if re.search(r'\\[a-zA-Z]+\{[^}]*$', response):
            issues.append('unclosed_braces')
        
        if re.search(r'<[^>]+>.*\\[a-zA-Z]', response):
            issues.append('html_in_math')
        
        code_block_count = response.count('```')
        if code_block_count > 0 and code_block_count % 2 != 0:
            issues.append('unclosed_code_blocks')
        
        if re.search(r'\\\$[0-9]', response):
            issues.append('escaped_dollar_signs')
        
        if re.search(r'\\frac\{[^}]*$', response):
            issues.append('malformed_fractions')
        
        if re.search(r'\[[^\]]*$', response) or re.search(r'\]\([^)]*$', response):
            issues.append('broken_markdown_links')
        
        return issues
    
    def _analyze_code_block_preservation(self, response: str) -> Dict[str, any]:
        """Analyze code block formatting to ensure preservation."""
        code_blocks = re.findall(r'```(\w+)?\n([\s\S]*?)```', response)
        
        analysis = {
            "code_block_count": len(code_blocks),
            "languages": [lang for lang, _ in code_blocks if lang],
            "contains_math_like_content": False,
            "contains_dollar_signs": False,
            "contains_latex_commands": False
        }
        
        for lang, content in code_blocks:
            if re.search(r'\\[a-zA-Z]+\{', content):
                analysis["contains_latex_commands"] = True
            if '$' in content:
                analysis["contains_dollar_signs"] = True
            if re.search(r'[a-zA-Z]\^[0-9]|\\frac|\\sum|\\int', content):
                analysis["contains_math_like_content"] = True
        
        return analysis
    
    def generate_config(self, analysis: Dict[str, Any]) -> Dict[str, Any]:
        """Generate renderer configuration from analysis data."""
        self.log(f"Generating config for {self.model_id}...")
        self.log_progress("generating", f"Generating renderer configuration for {self.model_id}...", 0.0)
        
        display_delimiters = analysis.get("delimiters", {}).get("display", ["double-dollar"])
        inline_delimiters = analysis.get("delimiters", {}).get("inline", ["single-dollar"])
        
        issues = analysis.get("issues", [])
        has_escaped_dollars = "escaped_dollar_signs" in issues
        has_html_in_math = "html_in_math" in issues
        has_broken_links = "broken_markdown_links" in issues
        
        markdown_elements = analysis.get("markdown_elements", {})
        
        # Create delimiter patterns
        display_patterns = []
        priority = 1
        for delim_type in display_delimiters:
            pattern = self._create_delimiter_pattern(delim_type, priority)
            if pattern:
                display_patterns.append(pattern)
                priority += 1
        
        inline_patterns = []
        priority = 1
        for delim_type in inline_delimiters:
            pattern = self._create_delimiter_pattern(delim_type, priority)
            if pattern:
                inline_patterns.append(pattern)
                priority += 1
        
        # Build preprocessing options
        preprocessing = {
            "fixEscapedDollars": has_escaped_dollars,
            "removeHtmlFromMath": has_html_in_math,
            "removeMathML": True,
            "removeSVG": True,
        }
        
        # Build markdown processing rules
        markdown_processing = {
            "processLinks": markdown_elements.get("links", True) is not False,
            "fixBrokenLinks": has_broken_links,
            "processTables": markdown_elements.get("tables", True) is not False,
            "processBlockquotes": markdown_elements.get("blockquotes", True) is not False,
            "processHorizontalRules": markdown_elements.get("horizontal_rules", True) is not False,
            "processHeaders": markdown_elements.get("headers", True) is not False,
            "processBoldItalic": True,
            "processLists": markdown_elements.get("lists", True) is not False,
            "processInlineCode": markdown_elements.get("inline_code", True) is not False,
        }
        
        # Build KaTeX options
        katex_options = {
            "throwOnError": False,
            "strict": False,
            "trust": ["\\url", "\\href", "\\includegraphics"],
            "macros": {"\\eqref": "\\href{###1}{(\\text{#1})}"},
            "maxSize": 500,
            "maxExpand": 1000,
        }
        
        # Code block preservation
        code_block_preservation = {
            "enabled": True,
            "extractBeforeProcessing": True,
            "restoreAfterProcessing": True,
        }
        
        config = {
            "modelId": self.model_id,
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
        
        self.log_progress("generating", "Renderer configuration generated successfully", 100.0)
        return config
    
    def _create_delimiter_pattern(self, delimiter_type: str, priority: int) -> Optional[Dict[str, Any]]:
        """Create a delimiter pattern object."""
        delimiter_map = {
            "double-dollar": {"pattern": r"/\$\$([^\$]+?)\$\$/gs", "name": "double-dollar"},
            "single-dollar": {"pattern": r"/(?<!\$)\$([^\$\n]+?)\$(?!\$)/g", "name": "single-dollar"},
            "bracket": {"pattern": r"/\\\[\s*([\s\S]*?)\s*\\\]/g", "name": "bracket"},
            "paren": {"pattern": r"/\\\(\s*([^\\]*?)\s*\\\)/g", "name": "paren"},
            "align-env": {"pattern": r"/\\begin\{align\}([\s\S]*?)\\end\{align\}/g", "name": "align-env"},
            "equation-env": {"pattern": r"/\\begin\{equation\}([\s\S]*?)\\end\{equation\}/g", "name": "equation-env"},
        }
        
        if delimiter_type not in delimiter_map:
            return None
        
        return {
            "pattern": delimiter_map[delimiter_type]["pattern"],
            "name": delimiter_map[delimiter_type]["name"],
            "priority": priority,
        }
    
    def save_config(self, config: Dict[str, Any]) -> Path:
        """Save configuration to the config file."""
        config_path = Path(__file__).parent.parent.parent / "frontend" / "src" / "config" / "model_renderer_configs.json"
        config_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Load existing configs
        existing_configs = load_existing_configs()
        
        # Add or update the new config
        existing_configs[self.model_id] = config
        
        # Convert back to list format
        configs_list = list(existing_configs.values())
        
        # Write to file
        with open(config_path, "w", encoding="utf-8") as f:
            json.dump(configs_list, f, indent=2, ensure_ascii=False)
        
        return config_path
    
    def run(self) -> Dict[str, Any]:
        """Run the complete setup process."""
        # Check if model already has config
        if has_model_config(self.model_id):
            raise ValueError(f"Model {self.model_id} already has a renderer configuration")
        
        # Step 1: Collect responses
        self.log_progress("starting", f"Starting setup process for {self.model_id}...", 0.0)
        responses = self.collect_responses()
        
        if self.stats["successful"] == 0:
            raise RuntimeError(f"Failed to collect any successful responses from {self.model_id}")
        
        # Step 2: Analyze responses
        analysis = self.analyze_responses(responses)
        
        # Step 3: Generate config
        config = self.generate_config(analysis)
        
        # Step 4: Save config
        self.log_progress("saving", f"Saving renderer configuration to file...", 0.0)
        config_path = self.save_config(config)
        self.log_progress("saving", f"Configuration saved successfully", 100.0)
        
        self.log(f"\n✓ Setup complete! Config saved to {config_path}")
        self.log(f"  Successful responses: {self.stats['successful']}/{self.stats['total_requests']}")
        
        return {
            "config": config,
            "analysis": analysis,
            "stats": self.stats,
            "config_path": str(config_path)
        }


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(description="Setup renderer config for a single model")
    parser.add_argument("model_id", type=str, help="Model ID (e.g., x-ai/grok-4.1-fast)")
    parser.add_argument("--delay", type=float, default=1.0, help="Delay between requests (default: 1.0, not used with concurrent collection)")
    parser.add_argument("--max-retries", type=int, default=3, help="Max retries per request (default: 3)")
    parser.add_argument("--concurrency", type=int, default=5, help="Max concurrent requests (default: 5)")
    parser.add_argument("--quiet", action="store_true", help="Suppress verbose output")
    
    args = parser.parse_args()
    
    setup = ModelRendererSetup(
        model_id=args.model_id,
        delay=args.delay,
        max_retries=args.max_retries,
        verbose=not args.quiet,
        concurrency=args.concurrency
    )
    
    try:
        result = setup.run()
        print(f"\n✓ Successfully set up renderer config for {args.model_id}")
        sys.exit(0)
    except Exception as e:
        print(f"\n✗ Error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()

