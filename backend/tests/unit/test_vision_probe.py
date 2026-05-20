"""Vision probe helpers and skip paths (no live API in these tests)."""

from unittest.mock import MagicMock, patch

from app.llm.vision_probe import (
    VisionProbeResult,
    is_image_input_rejection_error,
    make_red_circle_png_base64,
    probe_supports_vision_input,
    response_indicates_red_circle,
)


def test_response_indicates_red_circle_positive() -> None:
    assert response_indicates_red_circle("I see a red circle on white.")
    assert response_indicates_red_circle("A round red shape.")
    assert response_indicates_red_circle("red dot in the center")


def test_response_indicates_red_circle_negative() -> None:
    assert not response_indicates_red_circle("A blue square.")
    assert not response_indicates_red_circle("red")
    assert not response_indicates_red_circle("circle")


def test_is_image_input_rejection_error() -> None:
    assert is_image_input_rejection_error("This model does not support image inputs")
    assert is_image_input_rejection_error(
        "Error code: 404 - {'error': {'message': 'No endpoints found that support image input'}}"
    )
    assert not is_image_input_rejection_error("Rate limit exceeded")
    assert not is_image_input_rejection_error(
        "Error code: 404 - {'error': {'message': 'Model not found'}}"
    )


def test_make_red_circle_png_base64_is_stable() -> None:
    b64_a = make_red_circle_png_base64()
    b64_b = make_red_circle_png_base64()
    assert b64_a == b64_b
    assert len(b64_a) > 100


def test_probe_skips_when_not_in_snapshot_and_no_entry() -> None:
    r = probe_supports_vision_input("zzzz/this-model-id-should-not-exist-in-snapshot")
    assert r.observed is False
    assert r.skip_reason == "not_in_openrouter_snapshot"
    assert r.error is None


def test_probe_skips_without_vision_metadata_when_requested() -> None:
    r = probe_supports_vision_input(
        "vendor/mini",
        openrouter_entry={
            "id": "vendor/mini",
            "architecture": {
                "modality": "text->text",
                "input_modalities": ["text"],
                "output_modalities": ["text"],
            },
        },
        skip_if_no_vision_metadata=True,
    )
    assert r.observed is False
    assert r.skip_reason == "no_vision_metadata"


@patch("app.llm.vision_probe.client")
def test_probe_observed_when_response_matches(mock_client: MagicMock) -> None:
    mock_client.chat.completions.create.return_value = MagicMock(
        choices=[MagicMock(message=MagicMock(content="A red circle on a white background."))]
    )
    r = probe_supports_vision_input(
        "vendor/vision",
        openrouter_entry={
            "id": "vendor/vision",
            "architecture": {
                "modality": "text+image->text",
                "input_modalities": ["text", "image"],
            },
        },
    )
    assert r.observed is True
    assert r.error is None


@patch("app.llm.vision_probe.client")
def test_probe_rejected_on_image_support_error(mock_client: MagicMock) -> None:
    mock_client.chat.completions.create.side_effect = Exception(
        "Model does not support image inputs"
    )
    r = probe_supports_vision_input(
        "vendor/text",
        openrouter_entry={
            "id": "vendor/text",
            "architecture": {"input_modalities": ["text", "image"]},
        },
    )
    assert r.observed is False
    assert r.rejected is True


@patch("app.llm.vision_probe.client")
def test_probe_rejected_on_openrouter_no_image_endpoints_404(mock_client: MagicMock) -> None:
    mock_client.chat.completions.create.side_effect = Exception(
        "Error code: 404 - {'error': {'message': 'No endpoints found that support image input', 'code': 404}}"
    )
    r = probe_supports_vision_input(
        "deepseek/deepseek-r1",
        openrouter_entry={
            "id": "deepseek/deepseek-r1",
            "architecture": {"input_modalities": ["text"]},
        },
    )
    assert r.observed is False
    assert r.rejected is True


@patch("app.llm.vision_probe.client")
def test_probe_no_vision_response_when_answer_wrong(mock_client: MagicMock) -> None:
    mock_client.chat.completions.create.return_value = MagicMock(
        choices=[MagicMock(message=MagicMock(content="I cannot tell."))]
    )
    r = probe_supports_vision_input(
        "vendor/vision",
        openrouter_entry={
            "id": "vendor/vision",
            "architecture": {"input_modalities": ["text", "image"]},
        },
    )
    assert r.observed is False
    assert r.rejected is False
    assert r.error is None


def test_vision_probe_result_fields() -> None:
    r = VisionProbeResult(observed=False, rejected=True, error="nope")
    assert r.observed is False
    assert r.rejected is True
