"""Unit tests for image credit calculation."""

from decimal import Decimal
from unittest.mock import patch

from app.llm.image_credits import calculate_image_credits


class TestCalculateImageCredits:
    """Tests for calculate_image_credits function."""

    @patch("app.llm.image_credits.get_model_image_price_per_image")
    def test_with_model_price_multiple_images(self, mock_get_price):
        """When model has price, credits = price * CREDITS_PER_DOLLAR * num_images."""
        mock_get_price.return_value = 0.04  # $0.04 per image
        result = calculate_image_credits("openai/dall-e-3", 4)
        # 0.04 * 100 * 4 = 16 credits
        assert result == Decimal("16")

    @patch("app.llm.image_credits.get_model_image_price_per_image")
    def test_with_model_price_single_image(self, mock_get_price):
        """When model has price, single image uses price-based calculation."""
        mock_get_price.return_value = 0.02  # $0.02 per image
        result = calculate_image_credits("openai/dall-e-2", 1)
        # 0.02 * 100 * 1 = 2 credits
        assert result == Decimal("2")

    @patch("app.llm.image_credits.get_model_image_price_per_image")
    def test_without_model_price_uses_default(self, mock_get_price):
        """When model has no price, uses IMAGE_CREDITS_PER_GENERATION per image."""
        mock_get_price.return_value = None
        result = calculate_image_credits("unknown/model", 2)
        # 5 * 2 = 10 credits (IMAGE_CREDITS_PER_GENERATION=5)
        assert result == Decimal("10")

    @patch("app.llm.image_credits.get_model_image_price_per_image")
    def test_with_zero_price_uses_default(self, mock_get_price):
        """When model price is 0, uses IMAGE_CREDITS_PER_GENERATION per image."""
        mock_get_price.return_value = 0.0
        result = calculate_image_credits("free/model", 1)
        assert result == Decimal("5")

    @patch("app.llm.image_credits.get_model_image_price_per_image")
    def test_minimum_one_credit(self, mock_get_price):
        """Result is at least 1 credit even for very cheap generations."""
        mock_get_price.return_value = 0.001  # Very cheap
        result = calculate_image_credits("cheap/model", 1)
        # 0.001 * 100 * 1 = 0.1, rounds up to 1
        assert result == Decimal("1")
