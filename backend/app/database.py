"""
Database configuration and session management for CompareIntel.

This module sets up SQLAlchemy with PostgreSQL support and provides
database session management for the FastAPI application.
"""

import os
from collections.abc import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, declarative_base, sessionmaker

# Import configuration
from .config import settings

# Database URL from configuration
# Format: postgresql://username:password@host:port/database
# Handle both running from project root and backend directory

# Determine the correct database path for SQLite fallback
# Use absolute paths to avoid issues with working directory changes
current_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.dirname(current_dir)
project_root = os.path.dirname(backend_dir)

# Database is stored in backend/data/ directory for clean project structure
# Use absolute path to avoid issues with working directory
db_dir = os.path.join(backend_dir, "data")
os.makedirs(db_dir, exist_ok=True)  # Ensure directory exists
db_file = os.path.join(db_dir, "compareintel.db")
default_db_path = f"sqlite:///{db_file}"

# Use database URL from settings, with fallback to default SQLite path
# Only use default if settings still has the old default path
old_default = "sqlite:///./compareintel.db"
DATABASE_URL = settings.database_url if settings.database_url != old_default else default_db_path

# Convert relative SQLite paths to absolute paths for reliability
if DATABASE_URL.startswith("sqlite:///./"):
    # Relative path - convert to absolute
    relative_path = DATABASE_URL.replace("sqlite:///./", "")
    if not os.path.isabs(relative_path):
        # Resolve relative to backend directory
        abs_path = os.path.abspath(os.path.join(backend_dir, relative_path))
        DATABASE_URL = f"sqlite:///{abs_path}"
        # Ensure directory exists
        db_dir = os.path.dirname(abs_path)
        os.makedirs(db_dir, exist_ok=True)
elif DATABASE_URL.startswith("sqlite:///"):
    # Already absolute or using 3 slashes, ensure directory exists
    db_path = DATABASE_URL.replace("sqlite:///", "")
    if os.path.isabs(db_path):
        db_dir = os.path.dirname(db_path)
        os.makedirs(db_dir, exist_ok=True)

# Log the database URL being used (mask password if present)
import logging

db_logger = logging.getLogger(__name__)
if "postgresql" in DATABASE_URL:
    # Mask password in PostgreSQL URL
    masked_url = DATABASE_URL
    if "@" in masked_url:
        parts = masked_url.split("@")
        if ":" in parts[0]:
            user_pass = parts[0].split(":")
            if len(user_pass) > 1:
                masked_url = f"{user_pass[0]}:****@{parts[1]}"
    db_logger.info(f"[DB] Using database: {masked_url}")
else:
    db_logger.info(f"[DB] Using database: {DATABASE_URL}")

# Create SQLAlchemy engine with optimized connection pooling
# Connection pooling improves performance by reusing database connections
is_postgresql = DATABASE_URL.startswith("postgresql")
is_sqlite = "sqlite" in DATABASE_URL

if is_postgresql:
    # PostgreSQL: Use connection pooling for better performance
    engine = create_engine(
        DATABASE_URL,
        pool_size=10,  # Number of connections to maintain
        max_overflow=20,  # Additional connections allowed beyond pool_size
        pool_pre_ping=True,  # Verify connections before using them (prevents stale connections)
        pool_recycle=3600,  # Recycle connections after 1 hour
        pool_timeout=30,  # Wait up to 30 seconds for a connection from the pool
        connect_args={
            "connect_timeout": 10,  # Wait up to 10 seconds to establish connection
        },
        echo=False,  # Set to True for SQL query logging during development
    )
elif is_sqlite:
    # SQLite: Use check_same_thread=False for async compatibility
    # SQLite doesn't need connection pooling - use NullPool to avoid locking issues
    # Connection pooling with SQLite can cause "database is locked" errors
    # Add timeout to handle concurrent access better
    from sqlalchemy.pool import NullPool

    engine = create_engine(
        DATABASE_URL,
        connect_args={
            "check_same_thread": False,  # Allow multi-threaded access
            "timeout": 20.0,  # Wait up to 20 seconds for database lock
        },
        poolclass=NullPool,  # No connection pooling for SQLite to avoid locking issues
        echo=False,  # Set to True for SQL query logging during development
    )
else:
    # Fallback for other database types
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,
        echo=False,
    )

# Enable foreign keys and optimize SQLite settings for better concurrency
# SQLite disables foreign key constraints by default, so we must enable them
# on every connection for CASCADE deletes to function properly
# WAL mode improves concurrent read/write performance
if "sqlite" in DATABASE_URL:

    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_conn, connection_record):
        """Configure SQLite connection with optimal settings."""
        cursor = dbapi_conn.cursor()
        # Enable foreign keys (required for CASCADE deletes)
        cursor.execute("PRAGMA foreign_keys=ON")
        # Use WAL mode for better concurrent access
        cursor.execute("PRAGMA journal_mode=WAL")
        # Optimize for better performance
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA busy_timeout=20000")  # 20 second timeout
        cursor.close()


# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for all models
Base = declarative_base()


def get_db() -> Generator[Session, None, None]:
    """
    Dependency function for FastAPI to get database session.

    Usage:
        @app.get("/endpoint")
        def endpoint(db: Session = Depends(get_db)):
            # Use db here
            pass

    Yields:
        Session: Database session
    """
    import logging
    import time

    logger = logging.getLogger(__name__)
    db_start = time.time()
    db = None
    try:
        db = SessionLocal()
        db_duration = time.time() - db_start
        if db_duration > 0.1:  # Log if session creation takes more than 100ms
            logger.warning(f"[DB] Session creation took {db_duration:.3f}s")
        yield db
    except Exception as e:
        # Don't log HTTPException as database errors - these are normal FastAPI exceptions
        # (e.g., authentication errors) that should be handled by FastAPI's exception handlers
        from fastapi import HTTPException

        if isinstance(e, HTTPException):
            # Re-raise HTTPException without logging - FastAPI will handle it
            raise

        # Log actual database connection errors with full details
        import traceback

        logger.error(f"[DB] Failed to create database session: {type(e).__name__}: {str(e)}")
        logger.error(f"[DB] Traceback: {traceback.format_exc()}")
        # Re-raise the exception so FastAPI can handle it properly
        raise
    finally:
        if db is not None:
            try:
                close_start = time.time()
                db.close()
                close_duration = time.time() - close_start
                if close_duration > 0.1:  # Log if closing takes more than 100ms
                    logger.warning(f"[DB] Session close took {close_duration:.3f}s")
            except Exception as e:
                # Log errors during session close, but don't raise
                logger.error(f"[DB] Error closing database session: {type(e).__name__}: {str(e)}")


def init_db() -> None:
    """
    Initialize database tables.
    This creates all tables defined in models.
    """

    Base.metadata.create_all(bind=engine)


def drop_db() -> None:
    """
    Drop all database tables.
    WARNING: This will delete all data!
    Only use in development/testing.
    """

    Base.metadata.drop_all(bind=engine)
