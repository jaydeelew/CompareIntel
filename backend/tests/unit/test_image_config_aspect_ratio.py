"""Unit tests for image config aspect ratio validation."""

import sys
from pathlib import Path

# Ensure backend is on path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from app.llm.image_aspect_ratio_validation import aspect_ratio_matches, resolution_matches


def test_aspect_ratio_matches_1_1():
    """1:1 ratio matches square dimensions."""
    assert aspect_ratio_matches(1024, 1024, "1:1", 0.03) is True
    assert aspect_ratio_matches(768, 768, "1:1", 0.03) is True


def test_aspect_ratio_matches_16_9():
    """16:9 landscape: width/height = 16/9."""
    assert aspect_ratio_matches(1920, 1080, "16:9", 0.03) is True
    assert aspect_ratio_matches(1024, 576, "16:9", 0.03) is True


def test_aspect_ratio_matches_9_16():
    """9:16 portrait: width/height = 9/16."""
    assert aspect_ratio_matches(576, 1024, "9:16", 0.03) is True
    assert aspect_ratio_matches(1080, 1920, "9:16", 0.03) is True


def test_aspect_ratio_matches_within_tolerance():
    """Dimensions within 3% tolerance pass."""
    assert aspect_ratio_matches(1024, 1024, "1:1", 0.03) is True
    assert aspect_ratio_matches(1050, 1024, "1:1", 0.03) is True


def test_aspect_ratio_mismatch():
    """Wrong aspect ratio fails validation."""
    assert aspect_ratio_matches(1024, 768, "1:1", 0.03) is False
    assert aspect_ratio_matches(1024, 1024, "16:9", 0.03) is False


def test_aspect_ratio_zero_height():
    """Zero height returns False."""
    assert aspect_ratio_matches(100, 0, "1:1", 0.03) is False


def test_aspect_ratio_invalid_format():
    """Invalid ratio string returns False."""
    assert aspect_ratio_matches(1024, 1024, "invalid", 0.03) is False
    assert aspect_ratio_matches(1024, 1024, "1:0", 0.03) is False


def test_resolution_matches_1k():
    """1K: longest edge ~1024 (700-1400)."""
    assert resolution_matches(1024, 1024, "1K") is True
    assert resolution_matches(768, 1344, "1K") is True
    assert resolution_matches(1344, 768, "1K") is True


def test_resolution_matches_2k():
    """2K: longest edge ~2048 (1500-2800)."""
    assert resolution_matches(2048, 2048, "2K") is True
    assert resolution_matches(1920, 1920, "2K") is True


def test_resolution_matches_4k():
    """4K: longest edge ~4096 (3000-5500)."""
    assert resolution_matches(4096, 4096, "4K") is True


def test_resolution_mismatch():
    """Wrong resolution fails validation."""
    assert resolution_matches(1024, 1024, "4K") is False
    assert resolution_matches(4096, 4096, "1K") is False
