"""
Search provider factory for creating and managing search provider instances.

This module provides a factory pattern for creating search providers based on
configuration stored in the database.
"""

import logging
from typing import Optional
from sqlalchemy.orm import Session
from .base import SearchProvider
from .brave import BraveSearchProvider
from ..models import AppSettings
from ..config.settings import settings

logger = logging.getLogger(__name__)


class SearchProviderFactory:
    """Factory for creating search provider instances."""
    
    @staticmethod
    def get_provider(provider_name: str, db: Session) -> Optional[SearchProvider]:
        """
        Get a search provider instance based on provider name.
        
        Args:
            provider_name: Name of the provider ("brave", "tavily", etc.)
            db: Database session for reading configuration
            
        Returns:
            SearchProvider instance or None if provider is not available
        """
        # Get active provider from database
        app_settings = db.query(AppSettings).first()
        if not app_settings:
            logger.warning("AppSettings not found in database")
            return None
        
        # Get provider-specific API key from settings
        api_key = None
        if provider_name == "brave":
            api_key = settings.brave_search_api_key
        elif provider_name == "tavily":
            api_key = settings.tavily_api_key
        else:
            logger.warning(f"Unknown search provider: {provider_name}")
            return None
        
        if not api_key:
            logger.warning(f"API key not configured for provider: {provider_name}")
            return None
        
        # Create provider instance
        if provider_name == "brave":
            return BraveSearchProvider(api_key)
        elif provider_name == "tavily":
            # Future implementation
            logger.warning("Tavily provider not yet implemented")
            return None
        
        return None
    
    @staticmethod
    def get_active_provider(db: Session) -> Optional[SearchProvider]:
        """
        Get the currently active search provider from database settings.
        
        Args:
            db: Database session
            
        Returns:
            Active SearchProvider instance or None if not configured
        """
        app_settings = db.query(AppSettings).first()
        if not app_settings or not app_settings.active_search_provider:
            return None
        
        return SearchProviderFactory.get_provider(app_settings.active_search_provider, db)
    
    @staticmethod
    def get_available_providers() -> list[str]:
        """
        Get list of available provider names.
        
        Returns:
            List of provider names
        """
        providers = []
        
        if settings.brave_search_api_key:
            providers.append("brave")
        
        if settings.tavily_api_key:
            providers.append("tavily")
        
        return providers

