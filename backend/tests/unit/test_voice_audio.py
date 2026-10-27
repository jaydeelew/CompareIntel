"""Unit tests for OpenRouter audio client (mocked HTTP)."""

import base64
import logging
from decimal import Decimal
from unittest.mock import MagicMock, patch

import httpx
import pytest

pytestmark = pytest.mark.unit

from app.llm.audio import (
    MINIMAL_MP3,
    MOCK_TRANSCRIPT,
    EmptyTranscriptError,
    SpeechResult,
    audio_format_for_openrouter,
    extract_transcript_text,
    synthesize_speech,
    transcribe_audio,
)


def _mock_httpx_client(payload: dict, *, status_code: int = 200, headers: dict | None = None):
    response = MagicMock()
    response.status_code = status_code
    response.headers = headers or {}
    response.text = ""
    if status_code >= 400:
        error = httpx.HTTPStatusError("boom", request=MagicMock(), response=response)
        response.raise_for_status.side_effect = error
        response.text = "bad"
    else:
        response.raise_for_status = MagicMock()
        response.json.return_value = payload

    mock_client = MagicMock()
    mock_client.__enter__.return_value = mock_client
    mock_client.__exit__.return_value = False
    mock_client.post.return_value = response
    return mock_client, response


class TestAudioFormatForOpenRouter:
    def test_webm_codecs_opus_maps_to_webm(self) -> None:
        assert audio_format_for_openrouter("turn.webm", "audio/webm;codecs=opus") == "webm"

    def test_mp4_maps_to_m4a_not_mp4(self) -> None:
        assert audio_format_for_openrouter("turn.mp4", "audio/mp4") == "m4a"

    def test_filename_webm_wins_over_odd_mime(self) -> None:
        assert audio_format_for_openrouter("clip.webm", "application/octet-stream") == "webm"


class TestExtractTranscriptText:
    def test_text_field(self) -> None:
        assert extract_transcript_text({"text": " hello "}) == "hello"

    def test_segments_when_text_empty(self) -> None:
        payload = {"text": "", "segments": [{"text": "Hello"}, {"text": "there"}]}
        assert extract_transcript_text(payload) == "Hello there"

    def test_nested_data_text(self) -> None:
        assert extract_transcript_text({"data": {"text": "nested"}}) == "nested"


class TestTranscribeAudio:
    def test_mock_skips_http(self) -> None:
        result = transcribe_audio(b"abc", filename="clip.webm", use_mock=True)
        assert result.text == MOCK_TRANSCRIPT
        assert result.cost_usd == Decimal("0")

    def test_empty_raises_friendly_message(self) -> None:
        with pytest.raises(EmptyTranscriptError, match="didn't catch that"):
            transcribe_audio(b"", use_mock=False)

    def test_sends_json_input_audio_not_multipart(self) -> None:
        payload = {"text": "hello world", "usage": {"cost": 0.012}}
        mock_client, _response = _mock_httpx_client(payload)

        with patch("app.llm.audio.httpx.Client", return_value=mock_client):
            result = transcribe_audio(
                b"audio-bytes",
                filename="turn.webm",
                content_type="audio/webm;codecs=opus",
                use_mock=False,
            )

        assert result.text == "hello world"
        assert result.cost_usd == Decimal("0.012")
        mock_client.post.assert_called_once()
        args, kwargs = mock_client.post.call_args
        assert "/audio/transcriptions" in args[0]
        assert "files" not in kwargs
        assert "data" not in kwargs
        body = kwargs["json"]
        assert body["model"]
        assert body["input_audio"]["format"] == "webm"
        assert base64.b64decode(body["input_audio"]["data"]) == b"audio-bytes"
        assert "codecs" not in body["input_audio"]["format"]

    def test_safari_mp4_blob_sends_m4a_format(self) -> None:
        payload = {"text": "hi"}
        mock_client, _response = _mock_httpx_client(payload)
        with patch("app.llm.audio.httpx.Client", return_value=mock_client):
            transcribe_audio(b"audio-bytes", filename="turn.mp4", content_type="audio/mp4")
        assert mock_client.post.call_args.kwargs["json"]["input_audio"]["format"] == "m4a"

    def test_empty_transcript_logs_diagnostics_not_audio(
        self, caplog: pytest.LogCaptureFixture
    ) -> None:
        payload = {"text": "", "usage": {"seconds": 1.2, "cost": 0.001}}
        mock_client, _response = _mock_httpx_client(
            payload, headers={"x-generation-id": "gen-test"}
        )
        audio = b"audio-bytes"
        with (
            patch("app.llm.audio.httpx.Client", return_value=mock_client),
            caplog.at_level(logging.WARNING, logger="app.llm.audio"),
            pytest.raises(EmptyTranscriptError, match="didn't catch that"),
        ):
            transcribe_audio(
                audio,
                filename="turn.webm",
                content_type="audio/webm;codecs=opus",
                use_mock=False,
            )

        log = caplog.text
        assert "audio_bytes=11" in log
        assert "mime=audio/webm;codecs=opus" in log
        assert "format=webm" in log
        assert "http_status=200" in log
        assert "generation_id=gen-test" in log
        assert "usage_seconds=1.2" in log
        assert base64.b64encode(audio).decode("ascii") not in log
        assert "Bearer" not in log
        assert audio.decode("ascii") not in log

    def test_error_object_is_not_treated_as_empty_transcript(self) -> None:
        payload = {"error": {"message": "Invalid audio format", "code": 400}}
        mock_client, _response = _mock_httpx_client(payload)
        with (
            patch("app.llm.audio.httpx.Client", return_value=mock_client),
            pytest.raises(RuntimeError, match="Invalid audio format"),
        ):
            transcribe_audio(b"audio-bytes", use_mock=False)

    def test_segments_used_when_text_missing(self) -> None:
        payload = {"segments": [{"text": "from segments"}]}
        mock_client, _response = _mock_httpx_client(payload)
        with patch("app.llm.audio.httpx.Client", return_value=mock_client):
            result = transcribe_audio(b"audio-bytes", use_mock=False)
        assert result.text == "from segments"

    def test_http_error_raises_runtime(self) -> None:
        mock_client, _response = _mock_httpx_client({}, status_code=502)

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

    def test_strips_markdown_before_sending_to_tts(self) -> None:
        response = MagicMock()
        response.raise_for_status = MagicMock()
        response.content = b"mp3-bytes"
        response.headers = {"content-type": "audio/mpeg"}

        mock_client = MagicMock()
        mock_client.__enter__.return_value = mock_client
        mock_client.__exit__.return_value = False
        mock_client.post.return_value = response

        with patch("app.llm.audio.httpx.Client", return_value=mock_client):
            synthesize_speech(
                "**Hello** and [docs](https://example.com)",
                voice="alloy",
                use_mock=False,
            )

        body = mock_client.post.call_args.kwargs["json"]
        assert body["input"] == "Hello and docs"
        assert "**" not in body["input"]
        assert "https://example.com" not in body["input"]
