"""Unit tests for OpenRouter audio client (mocked HTTP)."""

from decimal import Decimal
from unittest.mock import MagicMock, patch

import httpx
import pytest

pytestmark = pytest.mark.unit

from app.llm.audio import (
    MINIMAL_MP3,
    MOCK_TRANSCRIPT,
    SpeechResult,
    synthesize_speech,
    transcribe_audio,
)


class TestTranscribeAudio:
    def test_mock_skips_http(self) -> None:
        result = transcribe_audio(b"abc", filename="clip.webm", use_mock=True)
        assert result.text == MOCK_TRANSCRIPT
        assert result.cost_usd == Decimal("0")

    def test_empty_raises(self) -> None:
        with pytest.raises(ValueError, match="empty"):
            transcribe_audio(b"", use_mock=False)

    def test_json_success_uses_api_cost(self) -> None:
        payload = {"text": "hello world", "usage": {"cost": 0.012}}
        response = MagicMock()
        response.raise_for_status = MagicMock()
        response.json.return_value = payload
        response.headers = {}

        mock_client = MagicMock()
        mock_client.__enter__.return_value = mock_client
        mock_client.__exit__.return_value = False
        mock_client.post.return_value = response

        with patch("app.llm.audio.httpx.Client", return_value=mock_client):
            result = transcribe_audio(b"audio-bytes", filename="a.webm", use_mock=False)

        assert result.text == "hello world"
        assert result.cost_usd == Decimal("0.012")
        mock_client.post.assert_called_once()
        assert "/audio/transcriptions" in mock_client.post.call_args.args[0]
        assert mock_client.post.call_args.kwargs["data"]["model"]
        assert "file" in mock_client.post.call_args.kwargs["files"]

    def test_http_error_raises_runtime(self) -> None:
        response = MagicMock()
        response.status_code = 502
        response.text = "bad"
        error = httpx.HTTPStatusError("boom", request=MagicMock(), response=response)
        response.raise_for_status.side_effect = error

        mock_client = MagicMock()
        mock_client.__enter__.return_value = mock_client
        mock_client.__exit__.return_value = False
        mock_client.post.return_value = response

        with (
            patch("app.llm.audio.httpx.Client", return_value=mock_client),
            pytest.raises(RuntimeError, match="Speech-to-text"),
        ):
            transcribe_audio(b"audio-bytes", use_mock=False)


class TestSynthesizeSpeech:
    def test_mock_returns_mp3(self) -> None:
        result = synthesize_speech("Hello there.", voice="alloy", use_mock=True)
        assert isinstance(result, SpeechResult)
        assert result.audio == MINIMAL_MP3
        assert result.cost_usd == Decimal("0")

    def test_empty_text_raises(self) -> None:
        with pytest.raises(ValueError, match="empty"):
            synthesize_speech("   ", voice="alloy", use_mock=False)

    def test_success_uses_header_cost(self) -> None:
        response = MagicMock()
        response.raise_for_status = MagicMock()
        response.content = b"mp3-bytes"
        response.headers = {"x-openrouter-cost": "0.003", "content-type": "audio/mpeg"}

        mock_client = MagicMock()
        mock_client.__enter__.return_value = mock_client
        mock_client.__exit__.return_value = False
        mock_client.post.return_value = response

        with patch("app.llm.audio.httpx.Client", return_value=mock_client):
            result = synthesize_speech("Hello.", voice="nova", use_mock=False)

        assert result.audio == b"mp3-bytes"
        assert result.cost_usd == Decimal("0.003")
        assert "/audio/speech" in mock_client.post.call_args.args[0]
        body = mock_client.post.call_args.kwargs["json"]
        assert body["voice"] == "nova"
        assert body["input"] == "Hello."
