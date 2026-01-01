"""
Database configuration and session management for CompareIntel.

This module sets up SQLAlchemy with PostgreSQL support and provides
database session management for the FastAPI application.
"""

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, Session, declarative_base
from typing import Generator
import os
from pathlib import Path

# Import configuration
from .config import settings

# Database URL from configuration
# Format: postgresql://username:password@host:port/database
# Handle both running from project root and backend directory

# Determine the correct database path for SQLite fallback
current_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.dirname(current_dir)
project_root = os.path.dirname(backend_dir)

# Determine working directory to choose correct relative path
# Database is now stored in backend/data/ directory for clean project structure
cwd = os.getcwd()
if cwd.endswith(os.sep + "backend") or cwd.endswith("/backend"):
    # Running from backend directory
    default_db_path = "sqlite:///./data/compareintel.db"
else:
    # Running from project root or other location
    default_db_path = "sqlite:///./backend/data/compareintel.db"

# Use database URL from settings, with fallback to default SQLite path
# Only use default if settings still has the old default path
old_default = "sqlite:///./compareintel.db"
DATABASE_URL = settings.database_url if settings.database_url != old_default else default_db_path

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
    # Connection pooling is less critical for SQLite but still helps
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},  # Allow multi-threaded access
        pool_pre_ping=True,  # Verify connections before using them
        echo=False,  # Set to True for SQL query logging during development
    )
else:
    # Fallback for other database types
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,
        echo=False,
    )

# Enable foreign keys for SQLite (required for CASCADE deletes to work)
# SQLite disables foreign key constraints by default, so we must enable them
# on every connection for CASCADE deletes to function properly
if "sqlite" in DATABASE_URL:
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_conn, connection_record):
        """Enable foreign key constraints for SQLite connections."""
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
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
    import time
    import logging
    
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
        
        # Log actual database connection errors
        logger.error(f"[DB] Failed to create database session: {type(e).__name__}: {str(e)}")
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
    from app import models  # Import models to register them

    Base.metadata.create_all(bind=engine)


def drop_db() -> None:
    """
    Drop all database tables.
    WARNING: This will delete all data!
    Only use in development/testing.
    """
    from app import models  # Import models to register them

    Base.metadata.drop_all(bind=engine)
