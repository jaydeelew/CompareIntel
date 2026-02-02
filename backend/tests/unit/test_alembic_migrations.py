"""
Tests for Alembic database migrations.

These tests verify that:
1. Migration files are valid Python
2. The initial migration can be imported without errors
3. Migration upgrade/downgrade functions are defined
"""

import pytest
import os
import sys


class TestAlembicSetup:
    """Tests for Alembic configuration."""
    
    def test_alembic_ini_exists(self):
        """alembic.ini should exist in the backend directory."""
        alembic_ini = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
            "alembic.ini"
        )
        assert os.path.exists(alembic_ini), "alembic.ini not found"
    
    def test_migrations_directory_exists(self):
        """migrations directory should exist."""
        migrations_dir = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
            "migrations"
        )
        assert os.path.isdir(migrations_dir), "migrations directory not found"
    
    def test_migrations_env_py_exists(self):
        """migrations/env.py should exist."""
        env_py = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
            "migrations",
            "env.py"
        )
        assert os.path.exists(env_py), "migrations/env.py not found"
    
    def test_migrations_versions_directory_exists(self):
        """migrations/versions directory should exist."""
        versions_dir = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
            "migrations",
            "versions"
        )
        assert os.path.isdir(versions_dir), "migrations/versions directory not found"


class TestInitialMigration:
    """Tests for the initial migration file."""
    
    def test_initial_migration_exists(self):
        """Initial migration file should exist."""
        migration_file = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
            "migrations",
            "versions",
            "20260202_000000_initial_schema.py"
        )
        assert os.path.exists(migration_file), "Initial migration file not found"
    
    def test_initial_migration_has_revision_id(self):
        """Initial migration should have a revision identifier."""
        # Add migrations to path
        migrations_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
            "migrations",
            "versions"
        )
        sys.path.insert(0, migrations_path)
        
        try:
            # Import the migration module (without the .py extension)
            import importlib.util
            spec = importlib.util.spec_from_file_location(
                "initial_migration",
                os.path.join(migrations_path, "20260202_000000_initial_schema.py")
            )
            migration = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(migration)
            
            assert hasattr(migration, 'revision'), "Migration missing 'revision' attribute"
            assert migration.revision == '0001_initial', f"Unexpected revision: {migration.revision}"
            assert migration.down_revision is None, "Initial migration should have no down_revision"
        finally:
            sys.path.remove(migrations_path)
    
    def test_initial_migration_has_upgrade_downgrade(self):
        """Initial migration should have upgrade and downgrade functions."""
        migrations_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
            "migrations",
            "versions"
        )
        sys.path.insert(0, migrations_path)
        
        try:
            import importlib.util
            spec = importlib.util.spec_from_file_location(
                "initial_migration",
                os.path.join(migrations_path, "20260202_000000_initial_schema.py")
            )
            migration = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(migration)
            
            assert hasattr(migration, 'upgrade'), "Migration missing 'upgrade' function"
            assert hasattr(migration, 'downgrade'), "Migration missing 'downgrade' function"
            assert callable(migration.upgrade), "'upgrade' should be callable"
            assert callable(migration.downgrade), "'downgrade' should be callable"
        finally:
            sys.path.remove(migrations_path)


class TestMigrationEnv:
    """Tests for the migration environment configuration."""
    
    def test_env_py_can_be_imported(self):
        """migrations/env.py should be importable."""
        # This test verifies that env.py doesn't have syntax errors
        # and can be loaded (though we don't run it in test context)
        env_py_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
            "migrations",
            "env.py"
        )
        
        with open(env_py_path, 'r') as f:
            content = f.read()
        
        # Verify it's valid Python by compiling it
        try:
            compile(content, env_py_path, 'exec')
        except SyntaxError as e:
            pytest.fail(f"env.py has syntax error: {e}")
    
    def test_env_py_imports_all_models(self):
        """env.py should import all database models for autogenerate."""
        env_py_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
            "migrations",
            "env.py"
        )
        
        with open(env_py_path, 'r') as f:
            content = f.read()
        
        # Check that all major models are imported
        required_imports = [
            'User',
            'UserPreference',
            'Conversation',
            'ConversationMessage',
            'UsageLog',
        ]
        
        for model in required_imports:
            assert model in content, f"env.py should import {model} model"
