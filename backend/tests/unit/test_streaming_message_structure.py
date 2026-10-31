"""Unit tests for content-free streaming debug logs."""

import logging
from unittest.mock import patch

import pytest

from app.llm.streaming import content_free_message_structure, log_message_structure

pytestmark = pytest.mark.unit

SECRET_PROMPT = "SECRET_PAGE_CONTENT do not log this prompt"


def _sample_messages() -> list[dict]:
    return [
        {"role": "system", "content": SECRET_PROMPT},
        {"role": "user", "content": SECRET_PROMPT},
        {
            "role": "assistant",
            "content": SECRET_PROMPT,
            "tool_calls": [
                {"id": "call_1", "function": {"name": "search_web"}},
            ],
        },
        {"role": "tool", "tool_call_id": "call_1", "content": SECRET_PROMPT},
        {
            "role": "user",
            "content": [
                {"type": "text", "text": SECRET_PROMPT},
                {"type": "image_url", "image_url": {"url": "data:image/png;base64,AAAA"}},
            ],
        },
    ]


class TestContentFreeMessageStructure:
    def test_includes_roles_counts_and_lengths_only(self):
        structure = content_free_message_structure(_sample_messages())
        assert [item["role"] for item in structure] == [
            "system",
            "user",
            "assistant",
            "tool",
            "user",
        ]
        assert structure[0]["content_length"] == len(SECRET_PROMPT)
        assert structure[2]["tool_calls_count"] == 1
        assert structure[2]["tool_call_ids"] == ["call_1"]
        assert structure[2]["tool_call_functions"] == ["search_web"]
        assert structure[3]["tool_call_id"] == "call_1"
        assert structure[4]["content_length"] == len(SECRET_PROMPT)

        serialized = str(structure)
        assert SECRET_PROMPT not in serialized
        assert "SECRET" not in serialized
        assert "data:image" not in serialized

    def test_empty_messages(self):
        assert content_free_message_structure([]) == []


class TestLogMessageStructureGating:
    def test_skips_debug_log_in_production(self, caplog):
        with (
            patch("app.llm.streaming.settings.environment", "production"),
            caplog.at_level(logging.DEBUG, logger="app.llm.streaming"),
        ):
            log_message_structure(_sample_messages())
        assert caplog.records == []
        assert SECRET_PROMPT not in caplog.text

    def test_debug_log_in_development_is_content_free(self, caplog):
        with (
            patch("app.llm.streaming.settings.environment", "development"),
            caplog.at_level(logging.DEBUG, logger="app.llm.streaming"),
        ):
            log_message_structure(_sample_messages())
        assert any("Message structure:" in record.getMessage() for record in caplog.records)
        assert SECRET_PROMPT not in caplog.text
        assert "SECRET" not in caplog.text
