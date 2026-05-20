"""Tests for conversation attachment serialization."""

from app.attachment_storage import parse_file_contents, serialize_attached_images


def test_serialize_attached_images_builds_json() -> None:
    payload = serialize_attached_images(
        [
            {
                "mime_type": "image/png",
                "base64_data": "abc123",
                "filename": "photo.png",
                "placeholder": "[image: photo.png]",
            }
        ]
    )
    assert payload is not None
    items = parse_file_contents(payload)
    assert len(items) == 1
    assert items[0]["name"] == "photo.png"
    assert items[0]["base64_data"] == "abc123"
    assert items[0]["mime_type"] == "image/png"


def test_serialize_attached_images_empty_when_no_data() -> None:
    assert serialize_attached_images([]) is None
    assert serialize_attached_images([{"mime_type": "image/png", "base64_data": ""}]) is None
