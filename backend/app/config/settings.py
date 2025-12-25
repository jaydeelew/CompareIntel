"""
Application settings loaded from environment variables.

This module uses Pydantic Settings v2 for type validation and environment variable loading.
All settings are loaded from environment variables with sensible defaults.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator
from typing import Optional
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables from .env file
# Handle both running from project root and backend directory
env_path = Path(__file__).parent.parent.parent / ".env"
if env_path.exists():
    load_dotenv(env_path)
else:
    # Fallback to parent directory
    load_dotenv(Path(__file__).parent.parent.parent.parent / ".env")


class Settings(BaseSettings):
    """
    Application settings loaded from environment variables.
    
    Uses Pydantic Settings v2 for type validation and environment variable loading.
    All fields can be overridden via environment variables.
    """
    
    # Database
    # Default path is now in backend/data/ directory for clean project structure
    database_url: str = "sqlite:///./data/compareintel.db"
    
    # Security
    secret_key: str
    
    # API Keys
    openrouter_api_key: str
    # AssemblyAI API key (Optional - for speech-to-text)
    # If not set, speech-to-text endpoint will return an error
    # Get your free API key at: https://www.assemblyai.com/
    assemblyai_api_key: Optional[str] = None
    
    # reCAPTCHA v3 (Optional - for registration protection)
    recaptcha_secret_key: Optional[str] = None
    
    # Email (Optional)
    mail_username: Optional[str] = None
    mail_password: Optional[str] = None
    mail_from: Optional[str] = None
    mail_server: Optional[str] = None
    mail_port: Optional[int] = None
    
    @field_validator('mail_port', mode='before')
    @classmethod
    def parse_mail_port(cls, v):
        """Convert empty strings to None for mail_port."""
        if v == '' or v is None:
            return None
        return v
    
    # Frontend
    frontend_url: str = "http://localhost:5173"
    
    # Environment
    environment: str = "development"
    
    # Performance Configuration
    # These can be overridden via environment variables.
    individual_model_timeout: int = 120
    
    # Backend per-model inactivity timeout (in seconds)
    # If a model doesn't send any chunks within this time, it's marked as timed out.
    # Set to 55s to give 5-second buffer before frontend's 60-second timeout.
    # User-facing message displays "1 minute" for cleaner UX.
    model_inactivity_timeout: int = 55
    
    # Pydantic Settings v2 configuration
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


# Create settings instance
settings = Settings()

