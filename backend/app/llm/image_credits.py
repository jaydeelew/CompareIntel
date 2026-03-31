"""Image generation credit calculation."""

from decimal import ROUND_CEILING, Decimal

from ..config.constants import CREDITS_PER_DOLLAR, IMAGE_CREDITS_PER_GENERATION
from .registry import get_model_image_price_per_image


def calculate_image_credits_fractional(model_id: str, num_images: int) -> Decimal:
    """Fractional credits before request-level ceil (multi-model compare)."""
    price = get_model_image_price_per_image(model_id)
    if price and price > 0:
        return Decimal(str(price)) * Decimal(str(CREDITS_PER_DOLLAR)) * num_images
    return Decimal(IMAGE_CREDITS_PER_GENERATION) * num_images


def usd_logged_for_image(model_id: str, num_images: int) -> Decimal:
    """USD attributed to image generation for UsageLog.actual_cost."""
    price = get_model_image_price_per_image(model_id)
    if price and price > 0:
        return Decimal(str(price)) * num_images
    frac = calculate_image_credits_fractional(model_id, num_images)
    return frac / Decimal(str(CREDITS_PER_DOLLAR))


def calculate_image_credits(model_id: str, num_images: int) -> Decimal:
    credits = calculate_image_credits_fractional(model_id, num_images)
    return max(Decimal(1), credits.quantize(Decimal("1"), rounding=ROUND_CEILING))
