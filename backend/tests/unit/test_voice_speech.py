"""Voice-mode system prompt and spoken-reply sanitizer."""

import pytest

pytestmark = pytest.mark.unit

from app.llm.voice_speech import (
    VOICE_SPEECH_SYSTEM_PROMPT,
    apply_voice_speech_system_prompt,
    sanitize_voice_speech,
)


class TestApplyVoiceSpeechSystemPrompt:
    def test_noop_when_not_voice(self) -> None:
        assert apply_voice_speech_system_prompt("Keep going.", voice_mode=False) == "Keep going."

    def test_appends_spoken_instructions(self) -> None:
        result = apply_voice_speech_system_prompt("Keep going.", voice_mode=True)
        assert result.startswith("Keep going.")
        assert "plain conversational speech" in result
        assert "emoji" in result.lower()
        assert VOICE_SPEECH_SYSTEM_PROMPT in result

    def test_standalone_when_system_empty(self) -> None:
        assert apply_voice_speech_system_prompt("", voice_mode=True) == VOICE_SPEECH_SYSTEM_PROMPT


class TestSanitizeVoiceSpeech:
    def test_strips_markdown_tables_lists_headers_emphasis_code_links_and_emoji(self) -> None:
        raw = (
            "# Title\n\n"
            "Here is **bold** and *italic* and `code`.\n"
            "- first item\n"
            "1. second item\n"
            "| A | B |\n"
            "| --- | --- |\n"
            "| 1 | 2 |\n"
            "See [docs](https://example.com) for more.\n"
            "```python\nprint('nope')\n```\n"
            "Hello 😀 there."
        )
        cleaned = sanitize_voice_speech(raw)
        assert "#" not in cleaned
        assert "**" not in cleaned
        assert "*" not in cleaned
        assert "`" not in cleaned
        assert "|" not in cleaned
        assert "```" not in cleaned
        assert "https://example.com" not in cleaned
        assert "😀" not in cleaned
        assert "- first" not in cleaned
        assert "1." not in cleaned
        assert "bold" in cleaned
        assert "italic" in cleaned
        assert "code" in cleaned
        assert "docs" in cleaned
        assert "Hello" in cleaned
        assert "there" in cleaned

    def test_empty_and_plain_text_pass_through(self) -> None:
        assert sanitize_voice_speech("") == ""
        assert sanitize_voice_speech("Just a spoken sentence.") == "Just a spoken sentence."


class TestVoiceModeStreamingSystemPrompt:
    def test_first_turn_includes_spoken_instructions(self) -> None:
        from unittest.mock import MagicMock

        from app.llm.streaming import call_openrouter_streaming

        mock_client = MagicMock()
        mock_client.chat.completions.create.return_value = iter([])
        list(
            call_openrouter_streaming(
                prompt="Hello",
                model_id="gpt-4",
                use_mock=False,
                voice_mode=True,
                _client=mock_client,
            )
        )
        kwargs = mock_client.chat.completions.create.call_args.kwargs
        system = next(m for m in kwargs["messages"] if m["role"] == "system")
        assert VOICE_SPEECH_SYSTEM_PROMPT in system["content"]
        assert "plain conversational speech" in system["content"]

    def test_text_mode_omits_spoken_instructions(self) -> None:
        from unittest.mock import MagicMock

        from app.llm.streaming import call_openrouter_streaming

        mock_client = MagicMock()
        mock_client.chat.completions.create.return_value = iter([])
        list(
            call_openrouter_streaming(
                prompt="Hello",
                model_id="gpt-4",
                use_mock=False,
                voice_mode=False,
                _client=mock_client,
            )
        )
        kwargs = mock_client.chat.completions.create.call_args.kwargs
        system = next(m for m in kwargs["messages"] if m["role"] == "system")
        assert VOICE_SPEECH_SYSTEM_PROMPT not in system["content"]

    def test_follow_up_still_includes_spoken_instructions(self) -> None:
        from types import SimpleNamespace
        from unittest.mock import MagicMock

        from app.llm.streaming import call_openrouter_streaming

        mock_client = MagicMock()
        mock_client.chat.completions.create.return_value = iter([])
        history = [
            SimpleNamespace(role="user", content="Hi"),
            SimpleNamespace(role="assistant", content="Hello there."),
        ]
        list(
            call_openrouter_streaming(
                prompt="Go on",
                model_id="gpt-4",
                conversation_history=history,
                use_mock=False,
                voice_mode=True,
                _client=mock_client,
            )
        )
        kwargs = mock_client.chat.completions.create.call_args.kwargs
        system = next(m for m in kwargs["messages"] if m["role"] == "system")
        assert VOICE_SPEECH_SYSTEM_PROMPT in system["content"]
