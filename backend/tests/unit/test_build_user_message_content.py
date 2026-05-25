"""Tests for vision multimodal message assembly (attached images without prompt placeholders)."""

import pytest

pytestmark = pytest.mark.unit


from unittest.mock import patch

from app.llm.streaming import _build_user_message_content


@patch("app.llm.streaming.get_model_supports_vision", return_value=True)
def test_includes_images_when_prompt_has_no_placeholders(_mock_vision: object) -> None:
    """Chip/paste UI attaches images without inserting [image: …] into the textarea."""
    attached = [
        {
            "mime_type": "image/png",
            "base64_data": "abc123",
            "filename": "photo.png",
            "placeholder": "[image: photo.png]",
        }
    ]
    content = _build_user_message_content(
        "What is in this image?",
        "anthropic/claude-opus-4",
        attached,
    )
    assert isinstance(content, list)
    assert any(
        p.get("type") == "text" and "What is in this image?" in p.get("text", "") for p in content
    )
    image_parts = [p for p in content if p.get("type") == "image_url"]
    assert len(image_parts) == 1
    assert "abc123" in image_parts[0]["image_url"]["url"]


@patch("app.llm.streaming.get_model_supports_vision", return_value=True)
def test_image_only_prompt_gets_default_instruction_and_image(_mock_vision: object) -> None:
    attached = [
        {
            "mime_type": "image/jpeg",
            "base64_data": "xyz",
            "filename": "pasted-image.jpg",
            "placeholder": "[image: pasted-image.jpg]",
        }
    ]
    content = _build_user_message_content("", "anthropic/claude-opus-4", attached)
    assert isinstance(content, list)
    assert any(p.get("type") == "text" for p in content)
    assert any(p.get("type") == "image_url" for p in content)


@patch("app.llm.streaming.get_model_supports_vision", return_value=True)
def test_interleaves_when_placeholder_present_in_prompt(_mock_vision: object) -> None:
    attached = [
        {
            "mime_type": "image/png",
            "base64_data": "img1",
            "filename": "a.png",
            "placeholder": "[image: a.png]",
        }
    ]
    content = _build_user_message_content(
        "Before [image: a.png] after",
        "anthropic/claude-opus-4",
        attached,
    )
    assert isinstance(content, list)
    types = [p.get("type") for p in content]
    assert types == ["text", "image_url", "text"]
    assert content[0]["text"] == "Before "
    assert content[2]["text"] == " after"
    assert len([p for p in content if p.get("type") == "image_url"]) == 1


@patch("app.llm.streaming.get_model_supports_vision", return_value=False)
def test_non_vision_model_omits_images(_mock_vision: object) -> None:
    attached = [
        {
            "mime_type": "image/png",
            "base64_data": "abc",
            "filename": "photo.png",
            "placeholder": "[image: photo.png]",
        }
    ]
    content = _build_user_message_content("Hello", "some/text-only-model", attached)
    assert isinstance(content, str)
    assert "image_url" not in content
