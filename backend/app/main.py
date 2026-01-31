from fastapi import FastAPI, HTTPException, Request, Depends, BackgroundTasks
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel
from typing import Any
from contextlib import asynccontextmanager
from .model_runner import (
    call_openrouter_streaming,
    clean_model_response,
    OPENROUTER_MODELS,
    MODELS_BY_PROVIDER,
    preload_model_token_limits,
)
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, timedelta
import asyncio
import os
import json
import logging
from collections import defaultdict
from typing import Dict, Any, Optional
from sqlalchemy.orm import Session
from dotenv import load_dotenv

# Load environment variables from .env file
# Use override=False to ensure environment variables set by test runners (like Playwright) take precedence
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"), override=False)

# Import authentication modules
from .database import get_db, Base, engine
from .models import User, UsageLog
from .dependencies import get_current_user
from .rate_limiting import (
    get_user_usage_stats,
    get_anonymous_usage_stats,
    get_model_limit,
    is_overage_allowed,
    get_overage_price,
    anonymous_rate_limit_storage,
)
from .routers import auth, admin, api

# Import model_stats from api router to share the same storage
from .routers.api import model_stats

# Import configuration constants
from .config import (
    MODEL_LIMITS,
    validate_config,
    log_configuration,
    settings,
)


# Configure logging
logging.basicConfig(
    level=logging.INFO if settings.environment == "development" else logging.WARNING,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)


# Suppress harmless SQL linting/style warnings (e.g., FromAsCasing) while keeping real errors
class SQLStyleWarningFilter(logging.Filter):
    """Filter to suppress SQL style warnings that don't indicate actual problems."""

    def filter(self, record: logging.LogRecord) -> bool:
        """Return False to suppress the log record, True to allow it."""
        message = str(record.getMessage())

        # Suppress SQL linting style warnings (these are cosmetic, not errors)
        style_warning_patterns = [
            "FromAsCasing",
            "casing do not match",
            "SQL style",
            "keyword.*casing",
        ]

        # Only suppress if it's a WARNING level and matches style warning patterns
        if record.levelno == logging.WARNING:
            if any(pattern.lower() in message.lower() for pattern in style_warning_patterns):
                return False

        # Always show errors and critical issues
        if record.levelno >= logging.ERROR:
            return True

        # Allow all other log records
        return True


# Apply the filter to all loggers to catch SQL linting warnings from any source
logging.getLogger().addFilter(SQLStyleWarningFilter())

# Set INFO level for search-related modules even in production (critical for rate limiting debugging)
logging.getLogger("app.search").setLevel(logging.INFO)
logging.getLogger("app.model_runner").setLevel(logging.INFO if settings.environment == "development" else logging.WARNING)

# Suppress SQLAlchemy INFO/WARNING logs that are just query details (not errors)
# Only show SQLAlchemy errors and critical issues
sqlalchemy_logger = logging.getLogger("sqlalchemy")
if settings.environment == "production":
    sqlalchemy_logger.setLevel(logging.ERROR)  # Only show errors in production
else:
    sqlalchemy_logger.setLevel(logging.WARNING)  # Show warnings in development
sqlalchemy_logger.addFilter(SQLStyleWarningFilter())

# Suppress SQLAlchemy engine/pool INFO logs (connection pool details)
logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
logging.getLogger("sqlalchemy.pool").setLevel(logging.WARNING)

# Get logger for this module
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan event handler for FastAPI application.

    This function handles startup and shutdown events:
    - Startup: Validates configuration, logs configuration, creates database tables
    - Shutdown: Cleanup tasks (if needed)
    """
    # Startup
    try:
        # Validate configuration
        logger.info("Validating configuration...")
        validate_config()

        # Log configuration (with masked secrets)
        log_configuration()

        # Initialize database tables
        environment = os.getenv("ENVIRONMENT", "development")
        if environment != "production":
            logger.info("Initializing database tables (development mode)...")
            Base.metadata.create_all(bind=engine, checkfirst=True)
            logger.info("Database initialization complete")
        else:
            logger.info("Skipping create_all in production (tables should already exist)")

        # Preload model token limits from OpenRouter
        logger.info("Preloading model token limits...")
        preload_model_token_limits()

        # Initialize search rate limiter early to ensure it's ready and logs are visible
        logger.info("Initializing search rate limiter...")
        from .search.rate_limiter import get_rate_limiter

        rate_limiter = get_rate_limiter()  # This will log initialization details
        logger.info("Search rate limiter initialized successfully")

        logger.info("Application startup complete")
    except ValueError as e:
        # Configuration validation failed
        logger.error(f"Startup failed: {e}")
        raise
    except Exception as e:
        # Other startup errors
        logger.error(f"Startup error: {e}", exc_info=True)
        # Let the application continue, as tables may already exist
        pass

    yield

    # Shutdown (if needed)
    # Add any cleanup tasks here


app = FastAPI(title="CompareIntel API", version="1.0.0", lifespan=lifespan)


# Add CORS middleware BEFORE including routers
# For development, allow all localhost origins
if os.environ.get("ENVIRONMENT") == "development":
    allowed_origins = ["*"]  # Allow all origins in development
else:
    allowed_origins = [
        # Production domains
        "https://compareintel.com",  # Main production domain (HTTPS)
        "https://www.compareintel.com",  # www subdomain (HTTPS)
        "http://compareintel.com",  # HTTP (redirects to HTTPS)
        "http://www.compareintel.com",  # HTTP www (redirects to HTTPS)
        "http://54.163.207.252",  # Server IP (legacy)
        # Local development with SSL
        "https://localhost",  # HTTPS localhost
        "https://localhost:443",  # HTTPS localhost with port
        # Local development without SSL
        "http://localhost:5173",  # Vite default port
        "http://localhost:5174",  # Alternative Vite port
        "http://localhost:5175",  # Alternative Vite port
        "http://localhost:3000",  # Alternative local port
        "http://127.0.0.1:5173",  # Alternative localhost
        "http://127.0.0.1:5174",  # Alternative localhost
        "http://127.0.0.1:5175",  # Alternative localhost
        "http://127.0.0.1:3000",  # Alternative localhost
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Add profiling middleware for performance monitoring
# This should be added AFTER CORS middleware but BEFORE routers
from .middleware.profiling import ProfilingMiddleware

app.add_middleware(ProfilingMiddleware)


# Global exception handler to ensure all errors return JSON
# Note: HTTPException is handled by FastAPI automatically, so we only catch other exceptions
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Handle all unhandled exceptions and return JSON responses."""
    # Don't handle HTTPException - FastAPI handles it automatically
    if isinstance(exc, HTTPException):
        raise exc

    import traceback
    from sqlalchemy.exc import OperationalError, DatabaseError, DisconnectionError, SQLAlchemyError

    error_type = type(exc).__name__
    error_message = str(exc)
    traceback_str = traceback.format_exc()

    # Check if this is a database connection error
    # Check both the exception itself and its __cause__ and __context__ for SQLAlchemy errors
    is_db_error = isinstance(exc, (OperationalError, DatabaseError, DisconnectionError, SQLAlchemyError))
    if not is_db_error:
        # Check exception chain for database errors
        cause = getattr(exc, "__cause__", None)
        context = getattr(exc, "__context__", None)
        if cause and isinstance(cause, (OperationalError, DatabaseError, DisconnectionError, SQLAlchemyError)):
            is_db_error = True
        elif context and isinstance(context, (OperationalError, DatabaseError, DisconnectionError, SQLAlchemyError)):
            is_db_error = True

    # Also check error message for specific database error patterns (more restrictive)
    # Only match if it's clearly a database-related error, not just any error containing these words
    if not is_db_error:
        error_lower = error_message.lower()
        # More specific patterns that clearly indicate database issues
        db_error_patterns = [
            "no such table",
            "unable to open database",
            "database is locked",
            "disk i/o error",
            "database disk image is malformed",
            "sqlite",
            "postgresql",
            "connection to database",
            "database connection",
            "operationalerror",
            "databaseerror",
            "disconnectionerror",
            "sqlalchemy",
        ]
        # Only match if the error message clearly indicates a database issue
        # Avoid false positives from generic errors containing words like "connection"
        if any(pattern in error_lower for pattern in db_error_patterns):
            # Additional check: make sure it's not a false positive
            # Skip if it's clearly not a database error (e.g., "API connection" or "network connection")
            false_positive_patterns = ["api connection", "network connection", "http connection", "tcp connection"]
            if not any(fp_pattern in error_lower for fp_pattern in false_positive_patterns):
                is_db_error = True

    # Log the error
    if is_db_error:
        logger.error(f"Database connection error: {error_type}: {error_message}")
        logger.error(f"Full traceback:\n{traceback_str}")
    else:
        logger.error(f"Unhandled exception: {error_type}: {error_message}")
        logger.error(f"Traceback:\n{traceback_str}")

    # Return appropriate error response
    if is_db_error:
        # Return 503 Service Unavailable for database errors (more appropriate than 500)
        # Include error details in development mode for debugging
        environment = os.getenv("ENVIRONMENT", "development")
        error_detail = {"detail": "Database service temporarily unavailable. Please try again later.", "error_type": error_type}
        # Include actual error message in development mode for debugging
        if environment == "development":
            error_detail["error_message"] = error_message
            error_detail["debug_info"] = "Check backend logs for full traceback"

        return JSONResponse(status_code=503, content=error_detail)
    else:
        # Return JSON error response for other errors
        return JSONResponse(status_code=500, content={"detail": f"Internal server error: {error_message}", "error_type": error_type})


# Include routers AFTER middleware
app.include_router(auth.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(api.router, prefix="/api")

# Maximum number of models allowed per request
# Use the maximum model limit from configuration (pro_plus tier)
MAX_MODELS_PER_REQUEST: int = max(MODEL_LIMITS.values()) if MODEL_LIMITS else 9

# Note: model_stats is now imported from .routers.api to share the same storage


def get_client_ip(request: Request) -> str:
    """Extract client IP address from request, handling proxies"""
    # Check for X-Forwarded-For header (common with proxies/load balancers)
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        # Take the first IP if there are multiple
        return forwarded_for.split(",")[0].strip()

    # Check for X-Real-IP header
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip.strip()

    # Fall back to direct client connection
    if request.client:
        return request.client.host

    return "unknown"


class ConversationMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str
    model_id: Optional[str] = None  # Optional model ID for assistant messages (used to filter per-model history)


class CompareRequest(BaseModel):
    input_data: str
    models: list[str]
    conversation_history: list[ConversationMessage] = []  # Optional conversation context
    browser_fingerprint: Optional[str] = None  # Optional browser fingerprint for rate limiting


class CompareResponse(BaseModel):
    results: dict[str, str]
    metadata: dict[str, Any]


@app.get("/")
async def root():
    return {"message": "CompareIntel API is running"}


@app.get("/health")
async def health_check(db: Session = Depends(get_db)):
    import time
    from sqlalchemy import text

    start = time.time()
    print(f"[HEALTH] Health check requested at {time.strftime('%Y-%m-%d %H:%M:%S')}")

    # Test database connection
    try:
        # Simple query to test database
        query_start = time.time()
        result = db.execute(text("SELECT 1")).scalar()
        query_duration = time.time() - query_start
        print(f"[HEALTH] Database query completed in {query_duration:.3f}s, result: {result}")

        total_duration = time.time() - start
        print(f"[HEALTH] Health check completed in {total_duration:.3f}s")
        return {"status": "healthy", "db_connected": True, "duration_ms": int(total_duration * 1000)}
    except Exception as e:
        total_duration = time.time() - start
        print(f"[HEALTH] Health check failed after {total_duration:.3f}s: {type(e).__name__}: {str(e)}")
        import traceback

        traceback.print_exc()
        return {"status": "unhealthy", "error": str(e), "duration_ms": int(total_duration * 1000)}


def log_usage_to_db(usage_log: UsageLog, db: Session):
    """Background task to log usage to database without blocking the response."""
    try:
        db.add(usage_log)
        db.commit()
    except Exception as e:
        print(f"Failed to log usage to database: {e}")
        db.rollback()
