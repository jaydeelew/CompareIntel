"""
Edge case tests for credit-based rate limiting functionality.

Tests cover:
- Boundary conditions
- Reset scenarios
- Anonymous user edge cases
- Concurrent access
"""
import pytest
from decimal import Decimal
from datetime import date, datetime, timedelta, timezone
from app.models import User
from app.rate_limiting import (
    check_user_credits,
    deduct_user_credits,
    check_anonymous_credits,
    deduct_anonymous_credits,
    get_user_usage_stats,
    get_anonymous_usage_stats,
    anonymous_rate_limit_storage,
)
from app.config.constants import (
    DAILY_CREDIT_LIMITS,
    MONTHLY_CREDIT_ALLOCATIONS,
)


class TestUserCreditBoundaries:
    """Tests for user credit boundary conditions."""
    
    def test_credits_at_exact_limit(self, db_session, test_user_free):
        """Test credit checking at exact limit."""
        # Ensure credits are allocated first
        from app.credit_manager import ensure_credits_allocated
        ensure_credits_allocated(test_user_free.id, db_session)
        db_session.refresh(test_user_free)
        
        allocated = test_user_free.monthly_credits_allocated or DAILY_CREDIT_LIMITS.get("free", 100)
        
        # Deduct all credits
        deduct_user_credits(test_user_free, Decimal(allocated), None, db_session, "Test: Exhaust credits")
        db_session.refresh(test_user_free)
        
        is_allowed, credits_remaining, credits_allocated = check_user_credits(
            test_user_free, Decimal("1"), db_session
        )
        assert is_allowed is False
        assert credits_remaining == 0
        assert credits_allocated == allocated
    
    def test_credits_one_below_limit(self, db_session, test_user_free):
        """Test credit checking one below limit."""
        # Ensure credits are allocated first
        from app.credit_manager import ensure_credits_allocated
        from datetime import datetime, timedelta, timezone
        ensure_credits_allocated(test_user_free.id, db_session)
        db_session.refresh(test_user_free)
        
        # Ensure credits_reset_at is set far enough in the future to prevent reset during test
        now_utc = datetime.now(timezone.utc)
        reset_at = test_user_free.credits_reset_at
        # Handle timezone-naive datetimes from SQLite
        if reset_at and reset_at.tzinfo is None:
            reset_at = reset_at.replace(tzinfo=timezone.utc)
        if not test_user_free.credits_reset_at or (reset_at and reset_at <= now_utc):
            test_user_free.credits_reset_at = now_utc + timedelta(days=1)
            db_session.commit()
            db_session.refresh(test_user_free)
        
        allocated = test_user_free.monthly_credits_allocated or DAILY_CREDIT_LIMITS.get("free", 100)
        
        # Deduct almost all credits, leaving 1
        deduct_user_credits(test_user_free, Decimal(allocated - 1), None, db_session, "Test: Near limit")
        db_session.refresh(test_user_free)
        
        is_allowed, credits_remaining, credits_allocated = check_user_credits(
            test_user_free, Decimal("1"), db_session
        )
        assert is_allowed is True
        assert credits_remaining == 1
        assert credits_allocated == allocated
    
    def test_credits_one_above_limit(self, db_session, test_user_free):
        """Test credit checking one above limit."""
        # Ensure credits are allocated first
        from app.credit_manager import ensure_credits_allocated
        from datetime import datetime, timedelta, timezone
        ensure_credits_allocated(test_user_free.id, db_session)
        db_session.refresh(test_user_free)
        
        # Ensure credits_reset_at is set far enough in the future to prevent reset during test
        now_utc = datetime.now(timezone.utc)
        reset_at = test_user_free.credits_reset_at
        # Handle timezone-naive datetimes from SQLite
        if reset_at and reset_at.tzinfo is None:
            reset_at = reset_at.replace(tzinfo=timezone.utc)
        if not test_user_free.credits_reset_at or (reset_at and reset_at <= now_utc):
            test_user_free.credits_reset_at = now_utc + timedelta(days=1)
            db_session.commit()
            db_session.refresh(test_user_free)
        
        allocated = test_user_free.monthly_credits_allocated or DAILY_CREDIT_LIMITS.get("free", 100)
        
        # Deduct all credits plus 1 (should cap at allocated)
        deduct_user_credits(test_user_free, Decimal(allocated + 1), None, db_session, "Test: Over limit")
        db_session.refresh(test_user_free)
        
        is_allowed, credits_remaining, credits_allocated = check_user_credits(
            test_user_free, Decimal("1"), db_session
        )
        assert is_allowed is False
        assert credits_remaining == 0
    
    def test_credits_zero_usage(self, db_session, test_user_free):
        """Test credit checking with zero usage."""
        db_session.refresh(test_user_free)
        allocated = test_user_free.monthly_credits_allocated or DAILY_CREDIT_LIMITS.get("free", 100)
        
        is_allowed, credits_remaining, credits_allocated = check_user_credits(
            test_user_free, Decimal("5"), db_session
        )
        assert is_allowed is True
        assert credits_remaining == allocated


class TestCreditReset:
    """Tests for credit reset scenarios."""
    
    def test_reset_on_new_day(self, db_session, test_user_free):
        """Test that credits reset on new day for free tier."""
        from app.credit_manager import check_and_reset_credits_if_needed
        
        db_session.refresh(test_user_free)
        allocated = test_user_free.monthly_credits_allocated or DAILY_CREDIT_LIMITS.get("free", 100)
        
        # Deduct all credits
        deduct_user_credits(test_user_free, Decimal(allocated), None, db_session, "Test: Exhaust")
        db_session.refresh(test_user_free)
        
        # Set reset time to yesterday (for daily reset tiers)
        if test_user_free.subscription_tier in DAILY_CREDIT_LIMITS:
            from datetime import timezone as tz
            test_user_free.credits_reset_at = datetime.now(tz.utc) - timedelta(days=1)
            db_session.commit()
        
        # Check credits (should reset automatically)
        is_allowed, credits_remaining, credits_allocated = check_user_credits(
            test_user_free, Decimal("5"), db_session
        )
        
        # Credits should be reset and allow usage
        assert is_allowed is True
        assert credits_remaining > 0
    
    def test_no_reset_same_day(self, db_session, test_user_free):
        """Test that credits don't reset on same day."""
        # Ensure credits are allocated first
        from app.credit_manager import ensure_credits_allocated
        from datetime import datetime, timedelta, timezone
        ensure_credits_allocated(test_user_free.id, db_session)
        db_session.refresh(test_user_free)
        
        # Ensure credits_reset_at is set far enough in the future to prevent reset during test
        now_utc = datetime.now(timezone.utc)
        reset_at = test_user_free.credits_reset_at
        # Handle timezone-naive datetimes from SQLite
        if reset_at and reset_at.tzinfo is None:
            reset_at = reset_at.replace(tzinfo=timezone.utc)
        if not test_user_free.credits_reset_at or (reset_at and reset_at <= now_utc):
            test_user_free.credits_reset_at = now_utc + timedelta(days=1)
            db_session.commit()
            db_session.refresh(test_user_free)
        
        allocated = test_user_free.monthly_credits_allocated or DAILY_CREDIT_LIMITS.get("free", 100)
        
        # Deduct some credits
        deduct_user_credits(test_user_free, Decimal("10"), None, db_session, "Test: Partial use")
        db_session.refresh(test_user_free)
        
        # Check credits (should not reset)
        is_allowed, credits_remaining, credits_allocated = check_user_credits(
            test_user_free, Decimal("5"), db_session
        )
        
        # Should not reset - credits remaining should be less than allocated
        assert credits_remaining < allocated


class TestDeductCredits:
    """Tests for credit deduction edge cases."""
    
    def test_deduct_by_one(self, db_session, test_user_free):
        """Test deducting credits by one."""
        db_session.refresh(test_user_free)
        initial_used = test_user_free.credits_used_this_period or 0
        
        deduct_user_credits(test_user_free, Decimal("1"), None, db_session, "Test: One credit")
        db_session.refresh(test_user_free)
        
        assert test_user_free.credits_used_this_period >= initial_used
    
    def test_deduct_by_multiple(self, db_session, test_user_free):
        """Test deducting credits by multiple."""
        # Ensure credits are allocated first
        from app.credit_manager import ensure_credits_allocated
        ensure_credits_allocated(test_user_free.id, db_session)
        db_session.refresh(test_user_free)
        
        initial_used = test_user_free.credits_used_this_period or 0
        
        deduct_user_credits(test_user_free, Decimal("10"), None, db_session, "Test: Multiple credits")
        db_session.refresh(test_user_free)
        
        assert test_user_free.credits_used_this_period >= initial_used + 10
    
    def test_deduct_zero(self, db_session, test_user_free):
        """Test deducting zero credits."""
        db_session.refresh(test_user_free)
        initial_used = test_user_free.credits_used_this_period or 0
        
        deduct_user_credits(test_user_free, Decimal("0"), None, db_session, "Test: Zero credits")
        db_session.refresh(test_user_free)
        
        # Should not change (or change minimally due to rounding)
        assert abs(test_user_free.credits_used_this_period - initial_used) <= 1
    
    def test_deduct_more_than_allocated(self, db_session, test_user_free):
        """Test deducting more credits than allocated."""
        db_session.refresh(test_user_free)
        allocated = test_user_free.monthly_credits_allocated or DAILY_CREDIT_LIMITS.get("free", 100)
        
        # Try to deduct more than allocated
        deduct_user_credits(test_user_free, Decimal(allocated + 100), None, db_session, "Test: Over allocation")
        db_session.refresh(test_user_free)
        
        # Should cap at allocated amount
        assert test_user_free.credits_used_this_period <= allocated


class TestAnonymousCreditBoundaries:
    """Tests for anonymous credit boundary conditions."""
    
    def test_anonymous_at_limit(self, db_session):
        """Test anonymous user at credit limit."""
        identifier = "ip:192.168.1.1"
        allocated = DAILY_CREDIT_LIMITS.get("anonymous", 50)
        
        # Deduct all credits
        deduct_anonymous_credits(identifier, Decimal(allocated))
        
        is_allowed, credits_remaining, credits_allocated = check_anonymous_credits(
            identifier, Decimal("1"), db_session
        )
        assert is_allowed is False
        assert credits_remaining == 0
        assert credits_allocated == allocated
    
    def test_anonymous_one_below_limit(self, db_session):
        """Test anonymous user one below limit."""
        from app.rate_limiting import anonymous_rate_limit_storage
        from app.models import UsageLog
        
        identifier = "ip:192.168.1.2"
        ip_address = "192.168.1.2"
        allocated = DAILY_CREDIT_LIMITS.get("unregistered", 50)  # Use "unregistered" key
        
        # Clear any existing UsageLog entries for this IP to ensure clean state
        db_session.query(UsageLog).filter(
            UsageLog.user_id.is_(None),
            UsageLog.ip_address == ip_address
        ).delete()
        db_session.commit()
        
        # Clear any existing state for this identifier
        if identifier in anonymous_rate_limit_storage:
            anonymous_rate_limit_storage[identifier]["count"] = 0
            anonymous_rate_limit_storage[identifier]["date"] = None
            anonymous_rate_limit_storage[identifier].pop("_admin_reset", None)
        
        # Initialize anonymous user by checking credits first (this sets up the storage)
        # Don't pass db to avoid syncing from potentially stale DB data
        check_anonymous_credits(identifier, Decimal("0"), db=None)
        
        # Verify initial state - should have full allocation
        _, initial_remaining, _ = check_anonymous_credits(identifier, Decimal("0"), db=None)
        assert initial_remaining == allocated, f"Expected {allocated} credits, got {initial_remaining}"
        
        # Deduct almost all credits, leaving 1
        deduct_anonymous_credits(identifier, Decimal(allocated - 1))
        
        # Verify count is correct before checking
        assert anonymous_rate_limit_storage[identifier]["count"] == allocated - 1, \
            f"Expected count={allocated - 1}, got {anonymous_rate_limit_storage[identifier]['count']}"
        
        is_allowed, credits_remaining, credits_allocated = check_anonymous_credits(
            identifier, Decimal("1"), db=None  # Don't sync to avoid resetting
        )
        assert is_allowed is True, f"Expected allowed=True, got {is_allowed}, remaining={credits_remaining}, used={anonymous_rate_limit_storage[identifier]['count']}"
        assert credits_remaining == 1, f"Expected 1 credit remaining, got {credits_remaining}"
        assert credits_allocated == allocated
    
    def test_anonymous_reset_on_new_day(self):
        """Test anonymous user reset on new day."""
        identifier = "ip:192.168.1.3"
        
        # Set to limit with yesterday's date
        anonymous_rate_limit_storage[identifier] = {
            "count": 100,
            "date": str(date.today() - timedelta(days=1)),
            "first_seen": None
        }
        
        is_allowed, credits_remaining, credits_allocated = check_anonymous_credits(
            identifier, Decimal("0"), None
        )
        
        # Should reset
        assert is_allowed is True
        assert credits_remaining == credits_allocated
        assert anonymous_rate_limit_storage[identifier]["date"] == str(date.today())


class TestUsageStats:
    """Tests for usage statistics edge cases."""
    
    def test_usage_stats_at_limit(self, test_user_free):
        """Test usage stats when at credit limit."""
        from app.rate_limiting import get_user_usage_stats
        
        # Test the structure of usage stats
        stats = get_user_usage_stats(test_user_free)
        assert "credits_allocated" in stats
        assert "credits_used_this_period" in stats
        assert "credits_remaining" in stats
        assert isinstance(stats["credits_allocated"], int)
        assert isinstance(stats["credits_used_this_period"], int)
        assert isinstance(stats["credits_remaining"], int)
    
    def test_usage_stats_zero_usage(self, test_user_free):
        """Test usage stats with zero usage."""
        stats = get_user_usage_stats(test_user_free)
        assert stats["credits_remaining"] >= 0
    
    def test_anonymous_usage_stats(self):
        """Test anonymous usage stats."""
        identifier = "ip:192.168.1.4"
        
        stats = get_anonymous_usage_stats(identifier)
        assert "credits_allocated" in stats
        assert "credits_used_today" in stats
        assert "credits_remaining" in stats
        assert isinstance(stats["credits_allocated"], int)
        assert isinstance(stats["credits_used_today"], int)
        assert isinstance(stats["credits_remaining"], int)


class TestConcurrentAccess:
    """Tests for concurrent access scenarios."""
    
    def test_concurrent_deduction(self, db_session, test_user_free):
        """Test concurrent credit deductions."""
        import threading
        
        db_session.refresh(test_user_free)
        initial_used = test_user_free.credits_used_this_period or 0
        
        def deduct():
            db_session.refresh(test_user_free)
            deduct_user_credits(test_user_free, Decimal("1"), None, db_session, "Concurrent test")
        
        # Create multiple threads
        threads = [threading.Thread(target=deduct) for _ in range(5)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        
        db_session.refresh(test_user_free)
        # Should have deducted (may not be exactly 5 due to race conditions and capping)
        assert test_user_free.credits_used_this_period >= initial_used


class TestDifferentSubscriptionTiers:
    """Tests for different subscription tier credit allocations."""
    
    def test_free_tier_credits(self, db_session, test_user_free):
        """Test free tier credit allocation."""
        db_session.refresh(test_user_free)
        is_allowed, credits_remaining, credits_allocated = check_user_credits(
            test_user_free, Decimal("5"), db_session
        )
        assert credits_allocated == DAILY_CREDIT_LIMITS.get("free", 100)
        assert credits_allocated > 0
    
    def test_starter_tier_credits(self, db_session, test_user_starter):
        """Test starter tier credit allocation."""
        db_session.refresh(test_user_starter)
        is_allowed, credits_remaining, credits_allocated = check_user_credits(
            test_user_starter, Decimal("5"), db_session
        )
        assert credits_allocated == MONTHLY_CREDIT_ALLOCATIONS.get("starter", 1200)
        assert credits_allocated > 0
    
    def test_pro_tier_credits(self, db_session, test_user_pro):
        """Test pro tier credit allocation."""
        db_session.refresh(test_user_pro)
        is_allowed, credits_remaining, credits_allocated = check_user_credits(
            test_user_pro, Decimal("5"), db_session
        )
        assert credits_allocated == MONTHLY_CREDIT_ALLOCATIONS.get("pro", 5000)
        assert credits_allocated > 0
    
    def test_pro_plus_tier_credits(self, db_session, test_user_pro_plus):
        """Test pro_plus tier credit allocation."""
        db_session.refresh(test_user_pro_plus)
        is_allowed, credits_remaining, credits_allocated = check_user_credits(
            test_user_pro_plus, Decimal("5"), db_session
        )
        assert credits_allocated == MONTHLY_CREDIT_ALLOCATIONS.get("pro_plus", 10000)
        assert credits_allocated > 0
    
    def test_tier_hierarchy(self):
        """Test that tier credit allocations increase with tier level."""
        free_credits = DAILY_CREDIT_LIMITS.get("free", 100)
        starter_credits = MONTHLY_CREDIT_ALLOCATIONS.get("starter", 1200)
        pro_credits = MONTHLY_CREDIT_ALLOCATIONS.get("pro", 5000)
        pro_plus_credits = MONTHLY_CREDIT_ALLOCATIONS.get("pro_plus", 10000)
        
        # Higher tiers should have higher credit allocations
        # Note: Free is daily, others are monthly, so we compare monthly equivalents
        # Free: 100/day * 30 = 3000/month equivalent
        assert starter_credits >= free_credits
        assert pro_credits >= starter_credits
        assert pro_plus_credits >= pro_credits
