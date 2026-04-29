"""
Live probe: one short streamed completion to see if separable reasoning chunks arrive.

Used by admin “add model” and by ``scripts/probe_streaming_reasoning_models.py`` — not on user
comparison requests.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ..config import settings
from .registry import (
    client,
    get_model_supports_temperature,
    is_thinking_model_from_openrouter_entry,
    openrouter_reasoning_request_body,
)
from .streaming import _reasoning_text_delta

logger = logging.getLogger(__name__)

_OPENROUTER_PATH = Path(__file__).resolve().parent.parent.parent / "openrouter_models.json"
_SNAPSHOT_BY_ID: dict[str, dict[str, Any]] | None = None


def invalidate_openrouter_snapshot_cache() -> None:
    """Clear the in-memory index of openrouter_models.json (call after that file changes on disk)."""
    global _SNAPSHOT_BY_ID
    _SNAPSHOT_BY_ID = None


# Encourage internal reasoning; separable traces depend on provider + OpenRouter.
_REASONING_PROBE_USER = (
    "In at most 3 short sentences: is 221 prime? Give a brief justification. "
    "Use careful step-by-step reasoning if it helps you answer correctly."
)


@dataclass(frozen=True)
class ReasoningProbeResult:
    """Result of a single streaming probe for separable reasoning text."""

    observed: bool
    """True if at least one chunk contained non-empty ``reasoning`` / ``reasoning_content``."""
    skip_reason: str | None = None
    """If set, the API was not called (e.g. model has no reasoning parameters in metadata)."""
    error: str | None = None
    """Set when the completion request failed; callers may fall back to catalog heuristics."""


def _load_snapshot_by_id() -> dict[str, dict[str, Any]]:
    global _SNAPSHOT_BY_ID
    if _SNAPSHOT_BY_ID is not None:
        return _SNAPSHOT_BY_ID
    result: dict[str, dict[str, Any]] = {}
    try:
        if _OPENROUTER_PATH.exists():
            with _OPENROUTER_PATH.open(encoding="utf-8") as f:
                data = json.load(f)
            for m in data.get("data", []):
                mid = m.get("id")
                if isinstance(mid, str):
                    result[mid] = m
    except Exception as e:
        logger.warning("Could not load openrouter_models.json for reasoning probe: %s", e)
    _SNAPSHOT_BY_ID = result
    return result


def get_openrouter_snapshot_entry(model_id: str) -> dict[str, Any] | None:
    """Return the bundled OpenRouter snapshot object for ``model_id``, if present."""
    return _load_snapshot_by_id().get(model_id)


def probe_streams_separable_reasoning(
    model_id: str,
    *,
    openrouter_entry: dict[str, Any] | None = None,
    max_output_tokens: int = 256,
    timeout_seconds: float | None = None,
) -> ReasoningProbeResult:
    """
    Stream one minimal completion with ``extra_body[\"reasoning\"]`` when metadata allows.

    Returns :attr:`ReasoningProbeResult.observed` True when any chunk includes separable reasoning
    text (same fields as :func:`app.llm.streaming._reasoning_text_delta`).
    """
    entry = (
        openrouter_entry
        if openrouter_entry is not None
        else get_openrouter_snapshot_entry(model_id)
    )
    if entry is None:
        return ReasoningProbeResult(observed=False, skip_reason="not_in_openrouter_snapshot")

    if is_thinking_model_from_openrouter_entry(entry) is not True:
        return ReasoningProbeResult(observed=False, skip_reason="no_reasoning_parameters")

    timeout = timeout_seconds
    if timeout is None:
        timeout = min(90.0, float(settings.individual_model_timeout))

    messages: list[dict[str, Any]] = [{"role": "user", "content": _REASONING_PROBE_USER}]
    api_params: dict[str, Any] = {
        "model": model_id,
        "messages": messages,
        "timeout": timeout,
        "max_tokens": max_output_tokens,
        "stream": True,
    }
    if get_model_supports_temperature(model_id):
        api_params["temperature"] = 0.2

    extra_body = {"reasoning": openrouter_reasoning_request_body(model_id)}

    try:
        stream = client.chat.completions.create(**api_params, extra_body=extra_body)
        for chunk in stream:
            if not chunk.choices:
                continue
            choice = chunk.choices[0]
            delta = choice.delta
            text = _reasoning_text_delta(delta, choice)
            if text:
                return ReasoningProbeResult(observed=True)
    except Exception as e:
        err = str(e).strip() or type(e).__name__
        logger.info("Reasoning probe failed for %s: %s", model_id, err)
        return ReasoningProbeResult(observed=False, error=err[:800])

    return ReasoningProbeResult(observed=False)
