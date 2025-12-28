#!/usr/bin/env python3
"""
Script to check if a model actually supports function calling through OpenRouter API.

This script queries OpenRouter's models API to verify if a model supports
function/tool calling, which is required for web search functionality.
"""

import asyncio
import sys
from pathlib import Path

# Add parent directory to path to import app modules
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.services.model_capability import ModelCapabilityService


async def check_model_function_calling(model_id: str):
    """
    Check if a model supports function calling.
    
    Args:
        model_id: The model ID to check (e.g., "kwaipilot/kat-coder-pro:free")
    """
    async with ModelCapabilityService() as service:
        print(f"Checking function calling support for: {model_id}")
        print("-" * 60)
        
        # Check tool calling support
        supports_tool_calling = await service.check_tool_calling_support(model_id)
        
        # Also fetch the full model data to show details
        models = await service._fetch_models_from_openrouter()
        model_data = models.get(model_id)
        
        if not model_data:
            print(f"❌ Model {model_id} not found in OpenRouter API")
            return False
        
        print(f"✅ Model found in OpenRouter API")
        print(f"\nModel details:")
        print(f"  Name: {model_data.get('name', 'N/A')}")
        print(f"  Description: {model_data.get('description', 'N/A')[:100]}...")
        
        print(f"\nFunction calling support check:")
        print(f"  Result: {'✅ SUPPORTS' if supports_tool_calling else '❌ DOES NOT SUPPORT'}")
        
        # Show relevant fields
        print(f"\nRelevant capability indicators:")
        print(f"  function_calling (top-level): {model_data.get('function_calling', 'N/A')}")
        print(f"  supported_parameters: {model_data.get('supported_parameters', [])}")
        print(f"  supported_features: {model_data.get('supported_features', [])}")
        
        top_picks = model_data.get('top_picks', {})
        if isinstance(top_picks, dict):
            print(f"  top_picks.function_calling: {top_picks.get('function_calling', 'N/A')}")
        
        context = model_data.get('context_length', {})
        if isinstance(context, dict):
            print(f"  context_length.function_calling: {context.get('function_calling', 'N/A')}")
        
        return supports_tool_calling


async def main():
    """Main entry point."""
    if len(sys.argv) < 2:
        print("Usage: python check_model_function_calling.py <model_id>")
        print("Example: python check_model_function_calling.py kwaipilot/kat-coder-pro:free")
        sys.exit(1)
    
    model_id = sys.argv[1]
    supports = await check_model_function_calling(model_id)
    
    print("\n" + "=" * 60)
    if supports:
        print(f"✅ Model {model_id} SUPPORTS function calling")
        print("   The model should be able to use web search tools.")
    else:
        print(f"❌ Model {model_id} DOES NOT SUPPORT function calling")
        print("   The model should NOT be marked as supports_web_search=True")
        print("   Web search will not work for this model even if enabled.")
    print("=" * 60)
    
    sys.exit(0 if supports else 1)


if __name__ == "__main__":
    asyncio.run(main())

