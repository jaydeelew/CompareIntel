"""
Alembic migration environment configuration.

This module configures Alembic to work with CompareIntel's SQLAlchemy models
and database configuration.
"""

import os
import sys
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

# Add the parent directory to sys.path to import app modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Import the SQLAlchemy models and Base
# Import settings for database URL
from app.config import settings
from app.database import Base

# Import all models so Alembic can detect them for autogenerate
# This ensures all models are included in migration generation
from app.models import (  # noqa: F401
    Conversation,
    ConversationMessage,
    UsageLog,
    User,
    UserPreference,
)

# Alembic Config object
config = context.config

# Interpret the config file for Python logging
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Target metadata for 'autogenerate' support
target_metadata = Base.metadata


def get_database_url() -> str:
    """
    Get database URL from environment or settings.

    Priority:
    1. Environment variable DATABASE_URL
    2. App settings database_url
    3. SQLite fallback for development
    """
    url = os.environ.get("DATABASE_URL") or settings.database_url

    if not url:
        # Fallback to SQLite for development
        url = "sqlite:///./compareintel.db"

    return url


def run_migrations_offline() -> None:
    """
    Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well. By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.
    """
    url = get_database_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        # Compare types for column type changes
        compare_type=True,
        # Compare server defaults
        compare_server_default=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """
    Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.
    """
    # Override the database URL from settings
    configuration = config.get_section(config.config_ini_section)
    configuration["sqlalchemy.url"] = get_database_url()

    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            # Compare types for column type changes
            compare_type=True,
            # Compare server defaults
            compare_server_default=True,
            # Render as batch for SQLite ALTER support
            render_as_batch=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
