"""
Model capability detection service.

This module provides functionality to detect model capabilities such as
function calling support, which is required for web search integration.
"""

import httpx
import logging
from typing import List, Dict, Any, Optional
from ..model_runner import MODELS_BY_PROVIDER

logger = logging.getLogger(__name__)


class ModelCapabilityService:
    """Service for detecting model capabilities."""
    
    OPENROUTER_MODELS_API = "https://openrouter.ai/api/v1/models"
    
    def __init__(self):
        """Initialize the capability service."""
        self._client = None
        self._models_cache: Optional[Dict[str, Any]] = None
    
    def _get_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client."""
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=30.0)
        return self._client
    
    async def _fetch_models_from_openrouter(self) -> Dict[str, Any]:
        """
        Fetch all models from OpenRouter API.
        
        Returns:
            Dictionary mapping model IDs to model metadata
        """
        if self._models_cache is not None:
            return self._models_cache
        
        try:
            client = self._get_client()
            response = await client.get(self.OPENROUTER_MODELS_API)
            response.raise_for_status()
            
            data = response.json()
            models_dict = {}
            
            for model in data.get("data", []):
                model_id = model.get("id")
                if model_id:
                    models_dict[model_id] = model
            
            self._models_cache = models_dict
            return models_dict
            
        except Exception as e:
            logger.error(f"Failed to fetch models from OpenRouter: {e}")
            return {}
    
    async def check_tool_calling_support(self, model_id: str) -> bool:
        """
        Check if a model supports function/tool calling.
        
        Args:
            model_id: The model ID to check (e.g., "openai/gpt-4")
            
        Returns:
            True if the model supports tool calling, False otherwise
        """
        try:
            models = await self._fetch_models_from_openrouter()
            model_data = models.get(model_id)
            
            if not model_data:
                logger.warning(f"Model {model_id} not found in OpenRouter API")
                return False
            
            # Check for function calling support indicators
            # OpenRouter models may have different fields indicating function calling
            # Common indicators:
            # - "function_calling": true
            # - "tools": true
            # - "function_calling" in "context_length" or similar
            
            # Check top-level function_calling field
            if model_data.get("function_calling") is True:
                return True
            
            # Check in top_picks or other metadata
            top_picks = model_data.get("top_picks", {})
            if isinstance(top_picks, dict) and top_picks.get("function_calling"):
                return True
            
            # Check context info
            context = model_data.get("context_length", {})
            if isinstance(context, dict) and context.get("function_calling"):
                return True
            
            # Some models explicitly list supported features
            supported_features = model_data.get("supported_features", [])
            if isinstance(supported_features, list):
                if "function_calling" in supported_features or "tools" in supported_features:
                    return True
            
            # Default: assume no function calling support if not explicitly indicated
            return False
            
        except Exception as e:
            logger.error(f"Error checking tool calling support for {model_id}: {e}")
            return False
    
    async def get_models_with_web_search(self) -> List[str]:
        """
        Get list of model IDs that support web search (from MODELS_BY_PROVIDER).
        
        Returns:
            List of model IDs that have supports_web_search=True
        """
        models_with_web_search = []
        
        for provider, models in MODELS_BY_PROVIDER.items():
            for model in models:
                if model.get("supports_web_search") is True:
                    models_with_web_search.append(model["id"])
        
        return models_with_web_search
    
    async def __aenter__(self):
        """Async context manager entry."""
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit - close HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None


# Singleton instance
_capability_service: Optional[ModelCapabilityService] = None


def get_capability_service() -> ModelCapabilityService:
    """Get the singleton capability service instance."""
    global _capability_service
    if _capability_service is None:
        _capability_service = ModelCapabilityService()
    return _capability_service

