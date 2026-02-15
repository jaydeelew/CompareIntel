"""
Connection quality testing.
"""

import time

from ..type_defs import ConnectionQualityDict
from .registry import client


def test_connection_quality() -> ConnectionQualityDict:
    """Test connection quality by making a quick API call."""
    test_model = "anthropic/claude-3-haiku"
    test_prompt = "Hello"
    start_time = time.time()
    try:
        response = client.chat.completions.create(
            model=test_model,
            messages=[{"role": "user", "content": test_prompt}],
            timeout=10,
            max_tokens=100,
        )
        response_time = time.time() - start_time
        if response_time < 2:
            quality = "excellent"
            multiplier = 1.0
        elif response_time < 4:
            quality = "good"
            multiplier = 1.2
        elif response_time < 7:
            quality = "average"
            multiplier = 1.5
        else:
            quality = "slow"
            multiplier = 2.0
        return {
            "response_time": response_time,
            "quality": quality,
            "time_multiplier": multiplier,
            "success": True,
        }
    except Exception as e:
        return {
            "response_time": 0,
            "quality": "poor",
            "time_multiplier": 3.0,
            "success": False,
            "error": str(e),
        }
