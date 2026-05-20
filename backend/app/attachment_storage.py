"""Serialize and parse conversation attachment payloads (vision images, text files)."""

from __future__ import annotations

import json
from typing import Any


def serialize_attached_images(attached_images: list[Any] | None) -> str | None:
    """Build file_contents JSON from compare-stream attached_images."""
    if not attached_images:
        return None
    items: list[dict[str, str]] = []
    for img in attached_images:
        if hasattr(img, "model_dump"):
            data = img.model_dump()
        elif isinstance(img, dict):
            data = img
        else:
            continue
        b64 = data.get("base64_data") or ""
        if not b64:
            continue
        name = data.get("filename") or "image"
        placeholder = data.get("placeholder") or f"[image: {name}]"
        items.append(
            {
                "name": name,
                "placeholder": placeholder,
                "mime_type": data.get("mime_type") or "image/png",
                "base64_data": b64,
            }
        )
    if not items:
        return None
    return json.dumps(items)


def parse_file_contents(raw: str | None) -> list[dict[str, Any]]:
    """Parse file_contents column into a list of attachment dicts."""
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return []
    if not isinstance(parsed, list):
        return []
    return [item for item in parsed if isinstance(item, dict)]
