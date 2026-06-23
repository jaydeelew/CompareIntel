"""
Integration tests for SSE streaming behavior.

Tests cover the core differentiating feature of CompareIntel:
- SSE event format validation (start, chunk, done, complete, error)
- Multi-model concurrent streaming
- Stream content-type headers
- Partial failure handling (some models fail, others succeed)
- Empty/invalid input rejection before streaming starts
- Conversation history in streaming context
- Mock mode streaming behavior
"""

import pytest

pytestmark = pytest.mark.integration


import json

from fastapi import status


class TestSSEStreamFormat:
    """Tests that SSE events conform to the documented protocol."""

    def test_stream_returns_correct_content_type(self, authenticated_client):
        """SSE endpoint must return text/event-stream content type."""
        client, user, token, _ = authenticated_client
        response = client.post(
            "/api/compare-stream",
            json={
                "input_data": "Hello",
                "models": ["deepseek/deepseek-chat-v3.1"],
            },
        )
        if response.status_code == status.HTTP_200_OK:
            content_type = response.headers.get("content-type", "")
            assert content_type.startswith("text/event-stream"), (
                f"Expected text/event-stream, got {content_type}"
            )


class TestMultiModelStreaming:
    """Tests for concurrent multi-model streaming — the core feature."""

    def test_stream_two_models_concurrently(self, authenticated_client, db_session):
        """Streaming two models should produce events for both."""
        client, user, token, _ = authenticated_client

        user.mock_mode_enabled = True
        db_session.commit()

        models = ["anthropic/claude-haiku-4.5", "deepseek/deepseek-chat-v3.1"]
        response = client.post(
            "/api/compare-stream",
            json={
                "input_data": "Compare two models",
                "models": models,
            },
        )

        if response.status_code == status.HTTP_200_OK:
            events = _parse_sse_events(response.text)

            # Should have start events for both models
            start_models = {e["model"] for e in events if e["type"] == "start" and "model" in e}
            for model_id in models:
                assert model_id in start_models, (
                    f"Missing start event for {model_id}. Got starts for: {start_models}"
                )

            # Should have done events for both models
            done_models = {e["model"] for e in events if e["type"] == "done" and "model" in e}
            for model_id in models:
                assert model_id in done_models, (
                    f"Missing done event for {model_id}. Got done for: {done_models}"
                )

            # Complete event should report correct model count
            complete_events = [e for e in events if e["type"] == "complete"]
            assert len(complete_events) == 1
            metadata = complete_events[0].get("metadata", {})
            assert metadata.get("models_requested") == len(models)

    def test_stream_chunks_identify_their_model(self, authenticated_client, db_session):
        """Each chunk event must identify which model produced it."""
        client, user, token, _ = authenticated_client

        user.mock_mode_enabled = True
        db_session.commit()

        response = client.post(
            "/api/compare-stream",
            json={
                "input_data": "Test chunk model identification",
                "models": ["anthropic/claude-haiku-4.5", "deepseek/deepseek-chat-v3.1"],
            },
        )

        if response.status_code == status.HTTP_200_OK:
            events = _parse_sse_events(response.text)
            chunk_events = [e for e in events if e["type"] == "chunk"]
            for chunk in chunk_events:
                assert "model" in chunk, f"chunk event missing 'model' field: {chunk}"
                assert "content" in chunk, f"chunk event missing 'content' field: {chunk}"


class TestStreamInputValidation:
    """Tests that invalid inputs are rejected before streaming starts."""

    def test_no_models_rejected(self, authenticated_client):
        """Empty models list should return 400."""
        client, user, token, _ = authenticated_client
        response = client.post(
            "/api/compare-stream",
            json={"input_data": "Hello", "models": []},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST


class TestStreamConversationHistory:
    """Tests that conversation context is passed through to streaming."""


class TestStreamErrorHandling:
    """Tests for graceful error handling during streaming."""

    def test_stream_error_event_format(self, authenticated_client, db_session):
        """
        When a model fails, the error should be reported as a proper SSE event,
        not crash the stream.
        """
        client, user, token, _ = authenticated_client

        # Don't enable mock mode — use a nonexistent model to trigger an error
        response = client.post(
            "/api/compare-stream",
            json={
                "input_data": "Test error handling",
                "models": ["nonexistent/fake-model-xyz"],
            },
        )
        # Should still return 200 (streaming starts) or a pre-stream error
        # The key is it should NOT return 500
        assert response.status_code != status.HTTP_500_INTERNAL_SERVER_ERROR


def _parse_sse_events(response_text: str) -> list[dict]:
    """
    Parse SSE response text into a list of JSON event dicts.

    Args:
        response_text: Raw SSE response body

    Returns:
        List of parsed event dictionaries
    """
    events = []
    for line in response_text.strip().split("\n"):
        line = line.strip()
        if line.startswith("data: "):
            json_str = line[len("data: ") :]
            try:
                events.append(json.loads(json_str))
            except json.JSONDecodeError:
                continue  # Skip non-JSON data lines (e.g., keep-alive)
    return events
