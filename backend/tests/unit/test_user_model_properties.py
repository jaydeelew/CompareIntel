"""Cheap coverage for computed User helpers (no DB dependency)."""

from __future__ import annotations

import pytest

from app.models import User

pytestmark = pytest.mark.unit


def test_user_credits_remaining_property_clamped_to_zero() -> None:
    """Covers ``User.credits_remaining`` helper used for subscription credit UI."""
    u = User(monthly_credits_allocated=720, credits_used_this_period=100)
    assert u.credits_remaining == 620

    u.credits_used_this_period = 800
    assert u.credits_remaining == 0


def test_user_credits_remaining_handles_none_allocations_as_zero() -> None:
    u = User(monthly_credits_allocated=None, credits_used_this_period=None)
    assert u.credits_remaining == 0
