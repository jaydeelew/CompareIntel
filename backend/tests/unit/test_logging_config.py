"""Unit tests for process-wide logging levels."""

import logging

import pytest

from app.main import default_log_level

pytestmark = pytest.mark.unit


class TestDefaultLogLevel:
    def test_development_is_info(self):
        assert default_log_level("development") == logging.INFO
        assert default_log_level("development") >= logging.INFO

    def test_production_is_warning_or_higher(self):
        level = default_log_level("production")
        assert level == logging.WARNING
        assert level >= logging.INFO
        assert level > logging.DEBUG

    def test_non_development_never_enables_debug(self):
        for environment in ("production", "test", "staging"):
            assert default_log_level(environment) > logging.DEBUG
