"""Tests for conversation attachment serialization."""

import pytest

pytestmark = pytest.mark.unit


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


def test_serialize_attached_images_accepts_pydantic_like_objects() -> None:
    class ImagePayload:
        def model_dump(self) -> dict[str, str]:
            return {
                "mime_type": "image/jpeg",
                "base64_data": "xyz",
                "filename": "snap.jpg",
            }

    payload = serialize_attached_images([ImagePayload()])
    assert payload is not None
    items = parse_file_contents(payload)
    assert items[0]["name"] == "snap.jpg"
    assert items[0]["placeholder"] == "[image: snap.jpg]"


def test_serialize_attached_images_skips_unsupported_items() -> None:
    assert serialize_attached_images(["not-a-dict"]) is None


def test_parse_file_contents_handles_invalid_json() -> None:
    assert parse_file_contents("{bad json") == []


def test_parse_file_contents_rejects_non_list_payload() -> None:
    assert parse_file_contents('{"name": "only-dict"}') == []


def test_parse_file_contents_filters_non_dict_entries() -> None:
    parsed = parse_file_contents('[{"name": "ok"}, "skip", 42]')
    assert parsed == [{"name": "ok"}]
