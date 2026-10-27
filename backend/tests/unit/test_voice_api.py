"""API tests for voice config, STT, TTS, and compare-stream voice limits."""

from decimal import Decimal
from io import BytesIO
from unittest.mock import patch

import pytest
from fastapi import status

pytestmark = pytest.mark.unit

from app.llm.audio import MINIMAL_MP3, TranscriptionResult
from app.services.voice_billing import reset_pending_audio_credits


@pytest.fixture(autouse=True)
def _clear_pending() -> None:
    reset_pending_audio_credits()
    yield
    reset_pending_audio_credits()


class TestVoiceConfig:
    def test_returns_defaults(self, client) -> None:
        response = client.get("/api/voice/config")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["max_models"] == 2
        assert data["stt_model"]
        assert data["tts_model"]
        assert len(data["voices"]) >= 2
        assert data["voices"][0] != data["voices"][1]


class TestVoiceTranscribe:
    def test_empty_file_rejected(self, client) -> None:
        response = client.post(
            "/api/voice/transcribe",
            files={"file": ("clip.webm", BytesIO(b""), "audio/webm")},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_mock_transcribe_returns_text(self, client) -> None:
        result = TranscriptionResult(text="Spoken hello", cost_usd=Decimal("0.01"))
        with (
            patch("app.routers.api.voice.should_use_mock_audio", return_value=True),
            patch("app.routers.api.voice.transcribe_audio", return_value=result),
        ):
            response = client.post(
                "/api/voice/transcribe",
                files={"file": ("clip.webm", BytesIO(b"fake-audio"), "audio/webm")},
                data={"duration_seconds": "1.5"},
            )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["text"] == "Spoken hello"
        assert data["cost_usd"] == pytest.approx(0.01)


class TestVoiceSpeech:
    def test_empty_text_rejected(self, client) -> None:
        response = client.post("/api/voice/speech", json={"text": ""})
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_returns_audio_bytes(self, client) -> None:
        from app.llm.audio import SpeechResult

        speech = SpeechResult(audio=MINIMAL_MP3, content_type="audio/mpeg", cost_usd=Decimal("0"))
        with (
            patch("app.routers.api.voice.should_use_mock_audio", return_value=True),
            patch("app.routers.api.voice.synthesize_speech", return_value=speech),
        ):
            response = client.post(
                "/api/voice/speech",
                json={"text": "Hello from the model.", "voice": "alloy"},
            )
        assert response.status_code == status.HTTP_200_OK
        assert response.headers["content-type"].startswith("audio/")
        assert response.content == MINIMAL_MP3


class TestVoiceCompareLimits:
    def test_third_model_rejected(self, client) -> None:
        response = client.post(
            "/api/compare-stream",
            json={
                "input_data": "Hello",
                "models": ["openai/gpt-4o-mini", "openai/gpt-4.1-nano", "openai/gpt-4.1-mini"],
                "mode": "voice",
            },
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "limited to 2" in response.json()["detail"]

    def test_image_generation_models_rejected(self, client) -> None:
        response = client.post(
            "/api/compare-stream",
            json={
                "input_data": "Hello",
                "models": ["black-forest-labs/flux.2-flex"],
                "mode": "voice",
            },
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "image" in response.json()["detail"].lower()
