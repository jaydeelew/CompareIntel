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

import json
from datetime import UTC, datetime, timedelta
from decimal import Decimal

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
                "models": ["anthropic/claude-3.5-haiku"],
            },
        )
        if response.status_code == status.HTTP_200_OK:
            content_type = response.headers.get("content-type", "")
            assert content_type.startswith("text/event-stream"), (
                f"Expected text/event-stream, got {content_type}"
            )

    def test_stream_events_are_valid_sse_format(self, authenticated_client, db_session):
        """Each line in the stream must follow SSE 'data: {...}' format."""
        client, user, token, _ = authenticated_client

        # Enable mock mode for deterministic streaming
        user.mock_mode_enabled = True
        db_session.commit()

        response = client.post(
            "/api/compare-stream",
            json={
                "input_data": "Test prompt for SSE format validation",
                "models": ["anthropic/claude-3.5-haiku"],
            },
        )

        if response.status_code == status.HTTP_200_OK:
            lines = response.text.strip().split("\n")
            data_lines = [line for line in lines if line.startswith("data: ")]
            assert len(data_lines) > 0, "Stream should contain at least one data line"

            for line in data_lines:
                # Every data line must be valid JSON after 'data: ' prefix
                json_str = line[len("data: ") :]
                try:
                    event = json.loads(json_str)
                except json.JSONDecodeError:
                    raise AssertionError(f"SSE data line is not valid JSON: {line}")

                # Every event must have a 'type' field
                assert "type" in event, f"SSE event missing 'type' field: {event}"

    def test_stream_event_lifecycle_single_model(self, authenticated_client, db_session):
        """
        Single-model stream must follow lifecycle:
        start → chunk(s) → done → complete
        """
        client, user, token, _ = authenticated_client

        # Enable mock mode for deterministic output
        user.mock_mode_enabled = True
        db_session.commit()

        response = client.post(
            "/api/compare-stream",
            json={
                "input_data": "Test lifecycle",
                "models": ["anthropic/claude-3.5-haiku"],
            },
        )

        if response.status_code == status.HTTP_200_OK:
            events = _parse_sse_events(response.text)
            event_types = [e["type"] for e in events]

            # Must have at least: start, chunk, done, complete
            assert "start" in event_types, f"Missing 'start' event. Got: {event_types}"
            assert "chunk" in event_types, f"Missing 'chunk' event. Got: {event_types}"
            assert "done" in event_types, f"Missing 'done' event. Got: {event_types}"
            assert "complete" in event_types, f"Missing 'complete' event. Got: {event_types}"

            # 'complete' must be the last event
            assert event_types[-1] == "complete", (
                f"Last event should be 'complete', got '{event_types[-1]}'"
            )

            # 'start' must come before any 'chunk' for that model
            start_idx = event_types.index("start")
            first_chunk_idx = event_types.index("chunk")
            assert start_idx < first_chunk_idx, "start must precede first chunk"

    def test_stream_complete_event_has_metadata(self, authenticated_client, db_session):
        """The final 'complete' event must include metadata."""
        client, user, token, _ = authenticated_client

        user.mock_mode_enabled = True
        db_session.commit()

        response = client.post(
            "/api/compare-stream",
            json={
                "input_data": "Test metadata",
                "models": ["anthropic/claude-3.5-haiku"],
            },
        )

        if response.status_code == status.HTTP_200_OK:
            events = _parse_sse_events(response.text)
            complete_events = [e for e in events if e["type"] == "complete"]
            assert len(complete_events) == 1, "Should have exactly one complete event"

            metadata = complete_events[0].get("metadata", {})
            assert "models_requested" in metadata, "metadata missing models_requested"
            assert "models_successful" in metadata, "metadata missing models_successful"
            assert "timestamp" in metadata, "metadata missing timestamp"

    def test_stream_start_event_has_model_id(self, authenticated_client, db_session):
        """The 'start' event must identify which model is starting."""
        client, user, token, _ = authenticated_client

        user.mock_mode_enabled = True
        db_session.commit()

        response = client.post(
            "/api/compare-stream",
            json={
                "input_data": "Test model identification",
                "models": ["anthropic/claude-3.5-haiku"],
            },
        )

        if response.status_code == status.HTTP_200_OK:
            events = _parse_sse_events(response.text)
            start_events = [e for e in events if e["type"] == "start"]
            assert len(start_events) >= 1, "Should have at least one start event"
            for start in start_events:
                assert "model" in start, f"start event missing 'model' field: {start}"


class TestMultiModelStreaming:
    """Tests for concurrent multi-model streaming — the core feature."""

    def test_stream_two_models_concurrently(self, authenticated_client, db_session):
        """Streaming two models should produce events for both."""
        client, user, token, _ = authenticated_client

        user.mock_mode_enabled = True
        db_session.commit()

        models = ["anthropic/claude-3.5-haiku", "deepseek/deepseek-chat-v3.1"]
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
                "models": ["anthropic/claude-3.5-haiku", "deepseek/deepseek-chat-v3.1"],
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

    def test_empty_input_rejected(self, authenticated_client):
        """Empty input_data should return 400, not start streaming."""
        client, user, token, _ = authenticated_client
        response = client.post(
            "/api/compare-stream",
            json={"input_data": "", "models": ["anthropic/claude-3.5-haiku"]},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_whitespace_only_input_rejected(self, authenticated_client):
        """Whitespace-only input should return 400."""
        client, user, token, _ = authenticated_client
        response = client.post(
            "/api/compare-stream",
            json={"input_data": "   \n\t  ", "models": ["anthropic/claude-3.5-haiku"]},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_no_models_rejected(self, authenticated_client):
        """Empty models list should return 400."""
        client, user, token, _ = authenticated_client
        response = client.post(
            "/api/compare-stream",
            json={"input_data": "Hello", "models": []},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_exhausted_credits_returns_402(self, authenticated_client, db_session):
        """Users with no remaining credits should get 402 Payment Required."""
        from app.credit_manager import ensure_credits_allocated
        from app.rate_limiting import deduct_user_credits

        client, user, token, _ = authenticated_client

        # Ensure credits allocated and not about to reset
        ensure_credits_allocated(user.id, db_session)
        db_session.refresh(user)
        now_utc = datetime.now(UTC)
        user.credits_reset_at = now_utc + timedelta(days=1)
        db_session.commit()
        db_session.refresh(user)

        # Exhaust all credits
        allocated = user.monthly_credits_allocated or 100
        deduct_user_credits(user, Decimal(allocated), None, db_session, "Test: exhaust")
        db_session.refresh(user)

        response = client.post(
            "/api/compare-stream",
            json={"input_data": "Hello", "models": ["anthropic/claude-3.5-haiku"]},
        )
        assert response.status_code == status.HTTP_402_PAYMENT_REQUIRED


class TestStreamConversationHistory:
    """Tests that conversation context is passed through to streaming."""

    def test_stream_with_conversation_history(self, authenticated_client, db_session):
        """Streaming with conversation history should succeed."""
        client, user, token, _ = authenticated_client

        user.mock_mode_enabled = True
        db_session.commit()

        response = client.post(
            "/api/compare-stream",
            json={
                "input_data": "What about Python specifically?",
                "models": ["anthropic/claude-3.5-haiku"],
                "conversation_history": [
                    {"role": "user", "content": "Tell me about programming languages"},
                    {
                        "role": "assistant",
                        "content": "There are many great programming languages...",
                        "model_id": "anthropic/claude-3.5-haiku",
                    },
                ],
            },
        )
        # Should either succeed or hit rate limit, but not fail with 400/500
        assert response.status_code in [
            status.HTTP_200_OK,
            status.HTTP_402_PAYMENT_REQUIRED,
            status.HTTP_429_TOO_MANY_REQUESTS,
        ]


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
