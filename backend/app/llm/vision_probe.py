"""
Live probe: send a red-circle test image and check whether the model describes it correctly.

Used by admin "add model" and by ``scripts/probe_vision_models.py`` — not on user comparison
requests.
"""

from __future__ import annotations

import base64
import logging
import re
from dataclasses import dataclass
from io import BytesIO
from typing import Any

from ..config import settings
from .reasoning_probe import get_openrouter_snapshot_entry
from .registry import (
    client,
    get_model_supports_temperature,
    openrouter_entry_supports_vision_input,
)

logger = logging.getLogger(__name__)

_VISION_PROBE_USER = (
    "What do you see in this image? Reply in one short sentence. "
    "Your answer must include the word 'red' and the word 'circle'."
)

_REJECTION_PATTERNS = (
    re.compile(r"does not support.*image", re.I),
    re.compile(r"not support.*image", re.I),
    re.compile(r"image.*not supported", re.I),
    re.compile(r"unsupported.*image", re.I),
    re.compile(r"no vision", re.I),
    re.compile(r"multimodal.*not", re.I),
    re.compile(r"invalid.*image", re.I),
    # OpenRouter routing: no provider endpoint accepts image input for this model id.
    re.compile(r"no endpoints found.*support image", re.I),
)

_red_circle_b64: str | None = None


@dataclass(frozen=True)
class VisionProbeResult:
    """Result of a single vision probe with a red-circle test image."""

    observed: bool
    """True when the model response mentions both red and circle (or round/dot)."""
    skip_reason: str | None = None
    """If set, the API was not called (e.g. metadata says text-only)."""
    rejected: bool = False
    """True when the API explicitly rejected image input."""
    error: str | None = None
    """Set when the completion request failed for other reasons; registry unchanged on apply."""


def make_red_circle_png_base64() -> str:
    """Return base64 PNG of a red circle on a white background."""
    global _red_circle_b64
    if _red_circle_b64 is not None:
        return _red_circle_b64

    from PIL import Image, ImageDraw

    size = 128
    img = Image.new("RGB", (size, size), "white")
    draw = ImageDraw.Draw(img)
    margin = 16
    draw.ellipse([margin, margin, size - margin, size - margin], fill="red")
    buf = BytesIO()
    img.save(buf, format="PNG")
    _red_circle_b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return _red_circle_b64


def response_indicates_red_circle(text: str) -> bool:
    """Return True when the model text plausibly describes a red circle."""
    t = text.lower()
    has_red = "red" in t
    has_circle = "circle" in t or "round" in t or "dot" in t or "circular" in t
    return has_red and has_circle


def is_image_input_rejection_error(message: str) -> bool:
    """Return True when an API error indicates the model rejects image input."""
    msg = message.strip()
    if not msg:
        return False
    return any(p.search(msg) for p in _REJECTION_PATTERNS)


def probe_supports_vision_input(
    model_id: str,
    *,
    openrouter_entry: dict[str, Any] | None = None,
    skip_if_no_vision_metadata: bool = False,
    max_output_tokens: int = 64,
    timeout_seconds: float | None = None,
) -> VisionProbeResult:
    """
    Send one multimodal completion with a red-circle PNG and check the response.

    When ``skip_if_no_vision_metadata`` is True and OpenRouter metadata does not list image
    input, the probe is skipped without an API call.
    """
    entry = (
        openrouter_entry
        if openrouter_entry is not None
        else get_openrouter_snapshot_entry(model_id)
    )
    if entry is None:
        return VisionProbeResult(observed=False, skip_reason="not_in_openrouter_snapshot")

    metadata_vision = openrouter_entry_supports_vision_input(entry)
    if skip_if_no_vision_metadata and not metadata_vision:
        return VisionProbeResult(observed=False, skip_reason="no_vision_metadata")

    timeout = timeout_seconds
    if timeout is None:
        timeout = min(90.0, float(settings.individual_model_timeout))

    b64 = make_red_circle_png_base64()
    messages: list[dict[str, Any]] = [
        {
            "role": "user",
            "content": [
                {"type": "text", "text": _VISION_PROBE_USER},
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:image/png;base64,{b64}"},
                },
            ],
        }
    ]
    api_params: dict[str, Any] = {
        "model": model_id,
        "messages": messages,
        "timeout": timeout,
        "max_tokens": max_output_tokens,
        "stream": False,
    }
    if get_model_supports_temperature(model_id):
        api_params["temperature"] = 0.0

    try:
        response = client.chat.completions.create(**api_params)
        text = (response.choices[0].message.content or "").strip()
        if response_indicates_red_circle(text):
            return VisionProbeResult(observed=True)
        logger.info(
            "Vision probe for %s: API ok but response did not match red circle: %r",
            model_id,
            text[:200],
        )
        return VisionProbeResult(observed=False)
    except Exception as e:
        err = str(e).strip() or type(e).__name__
        if is_image_input_rejection_error(err):
            logger.info("Vision probe rejected image input for %s: %s", model_id, err[:200])
            return VisionProbeResult(observed=False, rejected=True, error=err[:800])
        logger.info("Vision probe failed for %s: %s", model_id, err[:200])
        return VisionProbeResult(observed=False, error=err[:800])
