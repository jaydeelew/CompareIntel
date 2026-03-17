"""Image generation credit calculation."""

from decimal import ROUND_CEILING, Decimal

from ..config.constants import CREDITS_PER_DOLLAR, IMAGE_CREDITS_PER_GENERATION
from .registry import get_model_image_price_per_image


def calculate_image_credits(model_id: str, num_images: int) -> Decimal:
    price = get_model_image_price_per_image(model_id)
    if price and price > 0:
        credits = Decimal(str(price)) * Decimal(str(CREDITS_PER_DOLLAR)) * num_images
    else:
        credits = Decimal(IMAGE_CREDITS_PER_GENERATION) * num_images
    return max(Decimal(1), credits.quantize(Decimal("1"), rounding=ROUND_CEILING))
