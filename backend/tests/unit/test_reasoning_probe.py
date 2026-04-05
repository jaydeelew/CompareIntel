"""Reasoning probe skips and shape (no live API in these tests)."""

from app.llm.reasoning_probe import ReasoningProbeResult, probe_streams_separable_reasoning


def test_probe_skips_when_not_in_snapshot_and_no_entry() -> None:
    r = probe_streams_separable_reasoning("zzzz/this-model-id-should-not-exist-in-snapshot")
    assert r.observed is False
    assert r.skip_reason == "not_in_openrouter_snapshot"
    assert r.error is None


def test_probe_skips_without_reasoning_parameters() -> None:
    r = probe_streams_separable_reasoning(
        "vendor/mini",
        openrouter_entry={
            "id": "vendor/mini",
            "supported_parameters": ["max_tokens", "temperature"],
        },
    )
    assert r.observed is False
    assert r.skip_reason == "no_reasoning_parameters"


def test_reasoning_probe_result_repr_fields() -> None:
    r = ReasoningProbeResult(observed=False, error="boom")
    assert r.observed is False
    assert r.error == "boom"
