"""
Application settings loaded from environment variables.

This module uses Pydantic Settings v2 for type validation and environment variable loading.
All settings are loaded from environment variables with sensible defaults.
"""

from pathlib import Path

from dotenv import load_dotenv
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

env_path = Path(__file__).parent.parent.parent / ".env"
if env_path.exists():
    load_dotenv(env_path, override=False)


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
    # Optional in test environments (when SKIP_CONFIG_VALIDATION is set)
    # Validation function will check this in non-test environments
    openrouter_api_key: str = Field(default="")

    # Search Provider API Keys (Optional)
    brave_search_api_key: str | None = None
    tavily_api_key: str | None = None

    # reCAPTCHA v3 (Optional - for registration protection)
    recaptcha_secret_key: str | None = None

    # Email (Optional)
    mail_username: str | None = None
    mail_password: str | None = None
    mail_from: str | None = None
    mail_server: str | None = None
    mail_port: int | None = None

    @field_validator("mail_port", mode="before")
    @classmethod
    def parse_mail_port(cls, v):
        """Convert empty strings to None for mail_port."""
        if v == "" or v is None:
            return None
        return v

    @field_validator("recaptcha_secret_key", mode="before")
    @classmethod
    def parse_recaptcha_secret_key(cls, v):
        """Convert empty strings to None for recaptcha_secret_key."""
        if v == "" or v is None:
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

    # Search Rate Limiter Configuration
    # These settings control rate limiting for search API requests across all providers
    # Can be overridden via environment variables for provider-specific tuning

    # Default rate limits (applied to all providers unless provider-specific limits are set)
    # With Redis disabled, each Gunicorn worker has its own rate limiter instance.
    # With 4 workers, total capacity = 4 * search_rate_limit_per_minute
    # Set conservatively to account for multiple workers (default: 3 req/min per worker = 12 total with 4 workers)
    # With Redis enabled, these limits apply globally across all workers
    search_rate_limit_per_minute: int = 3  # Per-worker limit (or global if Redis enabled)
    search_max_concurrent: int = 2  # Reduced to prevent bursts
    search_delay_between_requests: float = 3.0  # Increased delay to space out requests more

    # Provider-specific rate limits (optional, falls back to defaults above)
    # Format: JSON string like '{"brave": {"max_requests_per_minute": 15, "max_concurrent": 2}}'
    search_provider_rate_limits: str | None = None

    # Search result cache configuration
    search_cache_enabled: bool = True  # Enable request deduplication/caching
    search_cache_ttl_seconds: int = 300  # Cache results for 5 minutes

    # Redis configuration for distributed rate limiting (optional)
    redis_url: str | None = None  # e.g., "redis://localhost:6379/0"
    redis_enabled: bool = False  # Set to True to enable Redis-based distributed rate limiting

    # Circuit breaker configuration
    search_circuit_breaker_enabled: bool = True  # Enable circuit breaker for API failures

    # Pydantic Settings v2 configuration
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


settings = Settings()
