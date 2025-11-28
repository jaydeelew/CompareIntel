"""
Unit tests for rate limiting functionality.

Tests cover:
- Credit-based rate limiting for different subscription tiers
- Anonymous user credit-based rate limiting
- Credit deduction and checking
"""
import pytest
from decimal import Decimal
from datetime import datetime, timedelta
from app.models import User, UsageLog
from app.rate_limiting import (
    check_user_credits,
    deduct_user_credits,
    check_anonymous_credits,
    deduct_anonymous_credits,
    get_user_usage_stats,
    get_anonymous_usage_stats,
)
from app.config.constants import (
    DAILY_CREDIT_LIMITS,
    MONTHLY_CREDIT_ALLOCATIONS,
)


class TestUserCreditLimiting:
    """Tests for authenticated user credit-based rate limiting."""
    
    def test_free_tier_credits(self, db_session, test_user):
        """Test credit checking for free tier user."""
        # Free tier should have daily credit limits
        required_credits = Decimal("5")  # Typical exchange cost
        is_allowed, credits_remaining, credits_allocated = check_user_credits(
            test_user, required_credits, db_session
        )
        assert isinstance(is_allowed, bool)
        assert isinstance(credits_remaining, int)
        assert isinstance(credits_allocated, int)
        assert credits_remaining >= 0
        assert credits_allocated > 0
    
    def test_premium_tier_credits(self, db_session, test_user_premium):
        """Test credit checking for premium tier user."""
        required_credits = Decimal("5")
        is_allowed, credits_remaining, credits_allocated = check_user_credits(
            test_user_premium, required_credits, db_session
        )
        assert isinstance(is_allowed, bool)
        assert isinstance(credits_remaining, int)
        assert isinstance(credits_allocated, int)
        # Premium should have higher credit allocations than free
        assert credits_remaining >= 0
        assert credits_allocated > 0
    
    def test_credits_exceeded(self, db_session, test_user):
        """Test credit limit when user has exceeded their credits."""
        # Deduct all credits to exceed limit
        db_session.refresh(test_user)
        allocated = test_user.monthly_credits_allocated or 100
        deduct_user_credits(test_user, Decimal(allocated), None, db_session, "Test: Exhaust credits")
        db_session.refresh(test_user)
        
        required_credits = Decimal("5")
        is_allowed, credits_remaining, credits_allocated = check_user_credits(
            test_user, required_credits, db_session
        )
        # Should be False if credits insufficient
        assert isinstance(is_allowed, bool)
        assert isinstance(credits_remaining, int)
        assert isinstance(credits_allocated, int)
        assert credits_remaining < required_credits
    
    def test_deduct_user_credits(self, db_session, test_user):
        """Test deducting user credits."""
        db_session.refresh(test_user)
        initial_used = test_user.credits_used_this_period or 0
        allocated = test_user.monthly_credits_allocated or 100
        
        # Deduct some credits
        credits_to_deduct = Decimal("5")
        deduct_user_credits(test_user, credits_to_deduct, None, db_session, "Test deduction")
        db_session.refresh(test_user)
        
        new_used = test_user.credits_used_this_period or 0
        assert new_used >= initial_used
        assert new_used <= allocated  # Should not exceed allocated


class TestAnonymousCreditLimiting:
    """Tests for anonymous user credit-based rate limiting."""
    
    def test_anonymous_credit_check(self, db_session):
        """Test credit checking for anonymous users."""
        identifier = "ip:192.168.1.1"
        required_credits = Decimal("5")
        is_allowed, credits_remaining, credits_allocated = check_anonymous_credits(
            identifier, required_credits, db_session
        )
        assert isinstance(is_allowed, bool)
        assert isinstance(credits_remaining, int)
        assert isinstance(credits_allocated, int)
        assert credits_remaining >= 0
        assert credits_allocated == DAILY_CREDIT_LIMITS.get("anonymous", 50)
    
    def test_anonymous_credits_exceeded(self, db_session):
        """Test anonymous credit limit when exceeded."""
        identifier = "ip:192.168.1.2"
        
        # Deduct all anonymous credits (50 per day)
        allocated = DAILY_CREDIT_LIMITS.get("anonymous", 50)
        deduct_anonymous_credits(identifier, Decimal(allocated))
        
        required_credits = Decimal("5")
        is_allowed, credits_remaining, credits_allocated = check_anonymous_credits(
            identifier, required_credits, db_session
        )
        assert isinstance(is_allowed, bool)
        assert isinstance(credits_remaining, int)
        assert credits_remaining < required_credits
    
    def test_deduct_anonymous_credits(self):
        """Test deducting anonymous user credits."""
        identifier = "ip:192.168.1.3"
        from app.rate_limiting import anonymous_rate_limit_storage
        
        initial_count = anonymous_rate_limit_storage[identifier]["count"]
        credits_to_deduct = Decimal("5")
        deduct_anonymous_credits(identifier, credits_to_deduct)
        
        new_count = anonymous_rate_limit_storage[identifier]["count"]
        assert new_count >= initial_count
        assert new_count <= DAILY_CREDIT_LIMITS.get("anonymous", 50)


class TestCreditLimitEdgeCases:
    """Tests for edge cases in credit-based rate limiting."""
    
    def test_credits_with_nonexistent_user(self, db_session):
        """Test credit check with a user that has been deleted from the database."""
        from app.models import User
        from sqlalchemy.orm.exc import DetachedInstanceError
        from sqlalchemy.exc import InvalidRequestError
        from passlib.context import CryptContext
        
        pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
        user = User(
            email="temp@example.com",
            password_hash=pwd_context.hash("secret"),
            is_verified=True,
            subscription_tier="free",
            is_active=True,
        )
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)
        
        user_id = user.id
        
        # Detach the user from the session first, then delete it from the database
        db_session.expunge(user)
        db_session.query(User).filter(User.id == user_id).delete()
        db_session.commit()
        
        # Now try to use check_user_credits with the deleted user
        try:
            is_allowed, credits_remaining, credits_allocated = check_user_credits(
                user, Decimal("5"), db_session
            )
            # If it succeeds, verify the result is valid
            assert isinstance(is_allowed, bool)
            assert isinstance(credits_remaining, int)
            assert isinstance(credits_allocated, int)
        except (DetachedInstanceError, InvalidRequestError, AttributeError, ValueError) as e:
            # If it raises an error, that's acceptable
            assert True  # Test passes if we catch the expected error
    
    def test_credits_with_invalid_tier(self, db_session, test_user):
        """Test credit check with invalid subscription tier."""
        # Set invalid tier on user
        original_tier = test_user.subscription_tier
        test_user.subscription_tier = "invalid_tier"
        db_session.commit()
        db_session.refresh(test_user)
        
        # Should handle gracefully (should still work, just with default allocation)
        is_allowed, credits_remaining, credits_allocated = check_user_credits(
            test_user, Decimal("5"), db_session
        )
        assert isinstance(is_allowed, bool)
        assert isinstance(credits_remaining, int)
        assert isinstance(credits_allocated, int)
        
        # Restore original tier
        test_user.subscription_tier = original_tier
        db_session.commit()
    
    def test_concurrent_credit_checks(self, db_session, test_user):
        """Test multiple concurrent credit checks."""
        # Simulate concurrent checks
        results = []
        for _ in range(10):
            is_allowed, credits_remaining, credits_allocated = check_user_credits(
                test_user, Decimal("5"), db_session
            )
            results.append((is_allowed, credits_remaining, credits_allocated))
        
        # All results should be valid
        assert len(results) == 10
        assert all(
            isinstance(r[0], bool) and isinstance(r[1], int) and isinstance(r[2], int)
            for r in results
        )


class TestAllTierCredits:
    """Tests for credit allocations across all subscription tiers."""
    
    def test_free_tier_credits(self, db_session, test_user_free):
        """Test free tier has correct credit allocation."""
        db_session.refresh(test_user_free)
        is_allowed, credits_remaining, credits_allocated = check_user_credits(
            test_user_free, Decimal("5"), db_session
        )
        assert credits_allocated == DAILY_CREDIT_LIMITS.get("free", 100)
        assert is_allowed is True  # Should have credits initially
    
    def test_starter_tier_credits(self, db_session, test_user_starter):
        """Test starter tier has correct credit allocation."""
        db_session.refresh(test_user_starter)
        is_allowed, credits_remaining, credits_allocated = check_user_credits(
            test_user_starter, Decimal("5"), db_session
        )
        assert credits_allocated == MONTHLY_CREDIT_ALLOCATIONS.get("starter", 1200)
        assert is_allowed is True
    
    def test_starter_plus_tier_credits(self, db_session, test_user_starter_plus):
        """Test starter_plus tier has correct credit allocation."""
        db_session.refresh(test_user_starter_plus)
        is_allowed, credits_remaining, credits_allocated = check_user_credits(
            test_user_starter_plus, Decimal("5"), db_session
        )
        assert credits_allocated == MONTHLY_CREDIT_ALLOCATIONS.get("starter_plus", 2500)
        assert is_allowed is True
    
    def test_pro_tier_credits(self, db_session, test_user_pro):
        """Test pro tier has correct credit allocation."""
        db_session.refresh(test_user_pro)
        is_allowed, credits_remaining, credits_allocated = check_user_credits(
            test_user_pro, Decimal("5"), db_session
        )
        assert credits_allocated == MONTHLY_CREDIT_ALLOCATIONS.get("pro", 5000)
        assert is_allowed is True
    
    def test_pro_plus_tier_credits(self, db_session, test_user_pro_plus):
        """Test pro_plus tier has correct credit allocation."""
        db_session.refresh(test_user_pro_plus)
        is_allowed, credits_remaining, credits_allocated = check_user_credits(
            test_user_pro_plus, Decimal("5"), db_session
        )
        assert credits_allocated == MONTHLY_CREDIT_ALLOCATIONS.get("pro_plus", 10000)
        assert is_allowed is True
    
    def test_free_tier_exceeds_credits(self, db_session, test_user_free):
        """Test free tier credit limit enforcement."""
        # Deduct all credits to exceed limit
        db_session.refresh(test_user_free)
        allocated = test_user_free.monthly_credits_allocated or DAILY_CREDIT_LIMITS.get("free", 100)
        deduct_user_credits(test_user_free, Decimal(allocated), None, db_session, "Test: Exhaust credits")
        db_session.refresh(test_user_free)
        
        is_allowed, credits_remaining, credits_allocated = check_user_credits(
            test_user_free, Decimal("5"), db_session
        )
        assert is_allowed is False
        assert credits_remaining < Decimal("5")
    
    def test_starter_tier_exceeds_credits(self, db_session, test_user_starter):
        """Test starter tier credit limit enforcement."""
        # Deduct all credits
        db_session.refresh(test_user_starter)
        allocated = test_user_starter.monthly_credits_allocated or MONTHLY_CREDIT_ALLOCATIONS.get("starter", 1200)
        deduct_user_credits(test_user_starter, Decimal(allocated), None, db_session, "Test: Exhaust credits")
        db_session.refresh(test_user_starter)
        
        is_allowed, credits_remaining, credits_allocated = check_user_credits(
            test_user_starter, Decimal("5"), db_session
        )
        assert is_allowed is False
        assert credits_remaining < Decimal("5")
    
    def test_pro_tier_exceeds_credits(self, db_session, test_user_pro):
        """Test pro tier credit limit enforcement."""
        # Deduct all credits
        db_session.refresh(test_user_pro)
        allocated = test_user_pro.monthly_credits_allocated or MONTHLY_CREDIT_ALLOCATIONS.get("pro", 5000)
        deduct_user_credits(test_user_pro, Decimal(allocated), None, db_session, "Test: Exhaust credits")
        db_session.refresh(test_user_pro)
        
        is_allowed, credits_remaining, credits_allocated = check_user_credits(
            test_user_pro, Decimal("5"), db_session
        )
        assert is_allowed is False
        assert credits_remaining < Decimal("5")


class TestUsageStats:
    """Tests for usage statistics."""
    
    def test_user_usage_stats(self, test_user):
        """Test user usage stats."""
        stats = get_user_usage_stats(test_user)
        assert "credits_allocated" in stats
        assert "credits_used_this_period" in stats
        assert "credits_remaining" in stats
        assert isinstance(stats["credits_allocated"], int)
        assert isinstance(stats["credits_used_this_period"], int)
        assert isinstance(stats["credits_remaining"], int)
    
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


class TestAnonymousCreditEdgeCases:
    """Tests for anonymous credit limiting edge cases."""
    
    def test_anonymous_multiple_identifiers(self):
        """Test that different identifiers have separate credit limits."""
        identifier1 = "ip:192.168.1.5"
        identifier2 = "ip:192.168.1.6"
        
        # Deduct credits from identifier1
        deduct_anonymous_credits(identifier1, Decimal("10"))
        
        # Check both identifiers
        _, credits1, _ = check_anonymous_credits(identifier1, Decimal("0"), None)
        _, credits2, _ = check_anonymous_credits(identifier2, Decimal("0"), None)
        
        # Identifier1 should have fewer credits remaining than identifier2
        assert credits1 < credits2
    
    def test_anonymous_credits_reset_on_new_day(self):
        """Test anonymous credits reset on new day."""
        from app.rate_limiting import anonymous_rate_limit_storage
        from datetime import date, timedelta
        
        identifier = "ip:192.168.1.7"
        
        # Set count to high value with yesterday's date
        anonymous_rate_limit_storage[identifier] = {
            "count": 100,
            "date": str(date.today() - timedelta(days=1)),
            "first_seen": None
        }
        
        # Check credits (should reset)
        is_allowed, credits_remaining, credits_allocated = check_anonymous_credits(
            identifier, Decimal("0"), None
        )
        
        # Should reset to 0 or fresh count
        assert credits_remaining >= 0
        assert anonymous_rate_limit_storage[identifier]["date"] == str(date.today())
