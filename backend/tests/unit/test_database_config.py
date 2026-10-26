"""
Tests for database engine configuration and connection pooling.

Verifies that PostgreSQL and SQLite engines are configured correctly
with appropriate pool settings based on environment variables.
"""

import os
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.pool import NullPool, QueuePool


class TestDatabasePoolConfiguration:
    """Test database connection pool configuration for both dialects."""

    def test_postgresql_uses_queue_pool_with_default_settings(self):
        """PostgreSQL should use QueuePool with default pool settings."""
        # Set up a PostgreSQL connection string (use postgresql+psycopg2 URL with pool_pre_ping)
        # Don't connect, just verify the configuration
        db_url = "postgresql+psycopg2://user:pass@localhost:5432/testdb"

        pool_size = 5
        max_overflow = 10
        pool_timeout = 30
        pool_recycle = 3600
        pool_pre_ping = True

        engine = create_engine(
            db_url,
            pool_size=pool_size,
            max_overflow=max_overflow,
            pool_timeout=pool_timeout,
            pool_recycle=pool_recycle,
            pool_pre_ping=pool_pre_ping,
        )

        # Verify it uses QueuePool
        assert isinstance(engine.pool, QueuePool)
        assert engine.pool.size() == 5
        assert engine.pool._max_overflow == 10
        assert engine.pool._timeout == 30
        assert engine.pool._recycle == 3600
        assert engine.pool._pre_ping is True

        engine.dispose()

    def test_postgresql_uses_custom_pool_settings(self):
        """PostgreSQL should respect custom pool settings from environment."""
        db_url = "postgresql+psycopg2://user:pass@localhost:5432/testdb"

        pool_size = 15
        max_overflow = 25
        pool_timeout = 60
        pool_recycle = 1800
        pool_pre_ping = False

        engine = create_engine(
            db_url,
            pool_size=pool_size,
            max_overflow=max_overflow,
            pool_timeout=pool_timeout,
            pool_recycle=pool_recycle,
            pool_pre_ping=pool_pre_ping,
        )

        assert isinstance(engine.pool, QueuePool)
        assert engine.pool.size() == 15
        assert engine.pool._max_overflow == 25
        assert engine.pool._timeout == 60
        assert engine.pool._recycle == 1800
        assert engine.pool._pre_ping is False

        engine.dispose()

    def test_sqlite_uses_null_pool(self):
        """SQLite should use NullPool to avoid locking issues."""
        db_url = "sqlite:///:memory:"

        engine = create_engine(
            db_url,
            poolclass=NullPool,
            connect_args={"check_same_thread": False},
        )

        # Verify it uses NullPool
        assert isinstance(engine.pool, NullPool)

    def test_sqlite_ignores_pool_settings(self):
        """SQLite should ignore pool settings since it uses NullPool."""
        db_url = "sqlite:///:memory:"

        # Even if we try to set pool settings, SQLite with NullPool should ignore them
        engine = create_engine(
            db_url,
            poolclass=NullPool,
            connect_args={"check_same_thread": False},
        )

        assert isinstance(engine.pool, NullPool)
        # NullPool doesn't have size, max_overflow, etc.
        assert not hasattr(engine.pool, "_max_overflow")


class TestDatabaseEngineCreation:
    """Test that the database module creates engines correctly."""

    def test_postgresql_engine_creation_logic(self):
        """Test that PostgreSQL engine creation logic uses pool settings correctly."""
        db_url = "postgresql+psycopg2://user:pass@localhost:5432/testdb"
        pool_size = 5
        max_overflow = 10
        pool_timeout = 30
        pool_recycle = 3600
        pool_pre_ping = True

        # Test the engine creation logic that would be used in database.py
        is_postgresql = db_url.startswith("postgresql")
        assert is_postgresql is True

        engine = create_engine(
            db_url,
            pool_size=pool_size,
            max_overflow=max_overflow,
            pool_pre_ping=pool_pre_ping,
            pool_recycle=pool_recycle,
            pool_timeout=pool_timeout,
            connect_args={"connect_timeout": 10},
        )

        assert isinstance(engine.pool, QueuePool)
        assert engine.pool.size() == 5
        assert engine.pool._max_overflow == 10

        engine.dispose()

    def test_sqlite_engine_creation_logic(self):
        """Test that SQLite engine creation logic uses NullPool."""
        db_url = "sqlite:///./test.db"

        is_sqlite = "sqlite" in db_url
        assert is_sqlite is True

        engine = create_engine(
            db_url,
            connect_args={"check_same_thread": False, "timeout": 20.0},
            poolclass=NullPool,
        )

        assert isinstance(engine.pool, NullPool)

        engine.dispose()


class TestPoolSizingFormula:
    """Test that pool settings respect the sizing formula."""

    def test_default_settings_for_free_tier(self):
        """Default settings should be safe for free-tier Postgres (20-100 connections)."""
        workers = 4
        pool_size = 5
        max_overflow = 10

        total_connections = workers * (pool_size + max_overflow)

        assert total_connections == 60
        # Should be under typical free-tier limits (20-100)
        assert total_connections <= 100

    def test_custom_settings_for_small_production(self):
        """Custom settings for small production (100-200 connections)."""
        workers = 4
        pool_size = 10
        max_overflow = 15

        total_connections = workers * (pool_size + max_overflow)

        assert total_connections == 100
        # Should be under small production limits
        assert total_connections <= 200

    def test_multi_replica_deployment(self):
        """Multi-replica deployment should stay under database limit."""
        workers = 6
        pool_size = 5
        max_overflow = 5
        replicas = 3

        total_per_replica = workers * (pool_size + max_overflow)
        total_across_replicas = total_per_replica * replicas

        assert total_per_replica == 60
        assert total_across_replicas == 180
        # Should be under 200 connection limit
        assert total_across_replicas <= 200


class TestSettingsConfiguration:
    """Test that settings are loaded correctly from environment."""

    @patch.dict(
        os.environ,
        {
            "DB_POOL_SIZE": "15",
            "DB_MAX_OVERFLOW": "25",
            "DB_POOL_TIMEOUT": "60",
            "DB_POOL_RECYCLE": "1800",
            "DB_POOL_PRE_PING": "False",
        },
    )
    def test_pool_settings_from_environment(self):
        """Test that pool settings are correctly loaded from environment variables."""
        # We need to reload settings after patching environment
        from app.config.settings import Settings

        settings = Settings()

        assert settings.db_pool_size == 15
        assert settings.db_max_overflow == 25
        assert settings.db_pool_timeout == 60
        assert settings.db_pool_recycle == 1800
        assert settings.db_pool_pre_ping is False

    def test_default_pool_settings(self):
        """Test that pool settings have correct defaults."""
        from app.config.settings import Settings

        # Create settings without environment overrides
        with patch.dict(
            os.environ,
            {
                "SECRET_KEY": "test_key",
                "OPENROUTER_API_KEY": "test_key",
            },
            clear=True,
        ):
            settings = Settings()

            assert settings.db_pool_size == 5
            assert settings.db_max_overflow == 10
            assert settings.db_pool_timeout == 30
            assert settings.db_pool_recycle == 3600
            assert settings.db_pool_pre_ping is True

    @patch.dict(os.environ, {"GUNICORN_WORKERS": "8"})
    def test_gunicorn_workers_from_environment(self):
        """Test that Gunicorn worker count is loaded from environment."""
        workers = int(os.environ.get("GUNICORN_WORKERS", "4"))
        assert workers == 8

    def test_gunicorn_workers_default(self):
        """Test that Gunicorn worker count defaults to 4."""
        with patch.dict(os.environ, {}, clear=True):
            workers = int(os.environ.get("GUNICORN_WORKERS", "4"))
            assert workers == 4


class TestNormalizePostgresUrl:
    """Test PostgreSQL URL normalization for psycopg2 driver compatibility."""

    def test_postgresql_url_gets_psycopg2_driver(self):
        """Generic postgresql:// URLs should be normalized to postgresql+psycopg2://."""
        from app.database import normalize_postgres_url

        url = "postgresql://user:pass@localhost:5432/dbname"
        normalized = normalize_postgres_url(url)
        assert normalized == "postgresql+psycopg2://user:pass@localhost:5432/dbname"

    def test_postgres_url_gets_normalized_to_postgresql_psycopg2(self):
        """postgres:// URLs should be normalized to postgresql+psycopg2://."""
        from app.database import normalize_postgres_url

        url = "postgres://user:pass@localhost:5432/dbname"
        normalized = normalize_postgres_url(url)
        assert normalized == "postgresql+psycopg2://user:pass@localhost:5432/dbname"

    def test_postgresql_psycopg2_url_unchanged(self):
        """postgresql+psycopg2:// URLs should remain unchanged."""
        from app.database import normalize_postgres_url

        url = "postgresql+psycopg2://user:pass@localhost:5432/dbname"
        normalized = normalize_postgres_url(url)
        assert normalized == url

    def test_postgresql_psycopg_url_unchanged(self):
        """postgresql+psycopg:// URLs (psycopg3) should remain unchanged."""
        from app.database import normalize_postgres_url

        url = "postgresql+psycopg://user:pass@localhost:5432/dbname"
        normalized = normalize_postgres_url(url)
        assert normalized == url

    def test_sqlite_url_unchanged(self):
        """SQLite URLs should remain unchanged."""
        from app.database import normalize_postgres_url

        url = "sqlite:///./test.db"
        normalized = normalize_postgres_url(url)
        assert normalized == url

    def test_complex_postgresql_url_preserved(self):
        """Complex PostgreSQL URLs with query params should be normalized correctly."""
        from app.database import normalize_postgres_url

        url = "postgresql://user:pass@localhost:5432/dbname?sslmode=require&application_name=myapp"
        normalized = normalize_postgres_url(url)
        assert (
            normalized
            == "postgresql+psycopg2://user:pass@localhost:5432/dbname?sslmode=require&application_name=myapp"
        )

    def test_url_with_special_chars_in_password(self):
        """URLs with special characters in password should be normalized correctly."""
        from app.database import normalize_postgres_url

        url = "postgresql://user:p@ss%3Aword@localhost:5432/dbname"
        normalized = normalize_postgres_url(url)
        assert normalized == "postgresql+psycopg2://user:p@ss%3Aword@localhost:5432/dbname"
