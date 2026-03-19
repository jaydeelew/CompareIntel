"""Aspect ratio and resolution validation for image generation tests."""


def aspect_ratio_matches(width: int, height: int, ratio_str: str, tolerance: float) -> bool:
    """Check if image dimensions match the requested aspect ratio within tolerance."""
    try:
        w_num, h_num = map(int, ratio_str.split(":"))
        expected = w_num / h_num
    except (ValueError, ZeroDivisionError):
        return False
    if height <= 0:
        return False
    actual = width / height
    return abs(actual - expected) <= expected * tolerance


# Expected longest edge per size; tolerance ±35% to account for model variance (e.g. 1920 for 2K)
RESOLUTION_BANDS: dict[str, tuple[int, int]] = {
    "1K": (700, 1400),  # ~1024 ±35%
    "2K": (1500, 2800),  # ~2048 ±35%
    "4K": (3000, 5500),  # ~4096 ±35%
}


def resolution_matches(width: int, height: int, size_str: str) -> bool:
    """Check if image longest edge falls within the expected resolution band."""
    if not size_str or size_str not in RESOLUTION_BANDS:
        return False
    longest = max(width, height)
    if longest <= 0:
        return False
    lo, hi = RESOLUTION_BANDS[size_str]
    return lo <= longest <= hi
