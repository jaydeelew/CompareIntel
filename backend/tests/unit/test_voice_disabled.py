"""Voice endpoints and history stay hidden when ENABLE_VOICE is off."""

import json

import pytest
from fastapi import status

from app.config.settings import settings
from app.models import Conversation

pytestmark = pytest.mark.unit


@pytest.fixture(autouse=True)
def _disable_voice(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "enable_voice", False)


class TestVoiceDisabled:
    def test_voice_config_is_404(self, client) -> None:
        response = client.get("/api/voice/config")
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_voice_transcribe_is_404(self, client) -> None:
        response = client.post("/api/voice/transcribe")
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_voice_speech_is_404(self, client) -> None:
        response = client.post("/api/voice/speech", json={"text": "hello"})
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_compare_stream_voice_mode_is_404(self, client) -> None:
        response = client.post(
            "/api/compare-stream",
            json={
                "input_data": "Hello",
                "models": ["openai/gpt-4o-mini"],
                "mode": "voice",
            },
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_conversation_list_hides_voice_entries(self, authenticated_client, db_session) -> None:
        client, user, _access_token, _refresh_token = authenticated_client
        voice = Conversation(
            user_id=user.id,
            input_data="Spoken prompt",
            models_used=json.dumps(["openai/gpt-4o-mini"]),
            composer_mode="voice",
        )
        text = Conversation(
            user_id=user.id,
            input_data="Typed prompt",
            models_used=json.dumps(["openai/gpt-4o-mini"]),
            composer_mode="text",
        )
        db_session.add_all([voice, text])
        db_session.commit()

        response = client.get("/api/conversations")
        assert response.status_code == status.HTTP_200_OK
        payloads = response.json()
        assert [item["input_data"] for item in payloads] == ["Typed prompt"]
        assert (
            db_session.query(Conversation).filter(Conversation.id == voice.id).one_or_none()
            is not None
        )
