"""Voice-mode spoken replies: system prompt and markdown/emoji sanitizer."""

from __future__ import annotations

import re

VOICE_SPEECH_SYSTEM_PROMPT = (
    "You are speaking out loud in a spoken conversation. Reply in plain conversational "
    "speech only. Do not use markdown of any kind: no tables, bullet or numbered lists, "
    "headings, bold, italics, code blocks, inline code, links, or images. Do not use emoji. "
    "Use complete spoken sentences. If you need several points, weave them into sentences "
    "with words like first, then, and finally."
)

_EMOJI_RE = re.compile(
    "["
    "\U0001f300-\U0001f5ff"
    "\U0001f600-\U0001f64f"
    "\U0001f680-\U0001f6ff"
    "\U0001f700-\U0001f77f"
    "\U0001f780-\U0001f7ff"
    "\U0001f800-\U0001f8ff"
    "\U0001f900-\U0001f9ff"
    "\U0001fa00-\U0001faff"
    "\U00002700-\U000027bf"
    "\U00002600-\U000026ff"
    "\U0000fe00-\U0000fe0f"
    "\U0001f1e6-\U0001f1ff"
    "]+",
    flags=re.UNICODE,
)


def apply_voice_speech_system_prompt(system_content: str, *, voice_mode: bool) -> str:
    """Append spoken-reply instructions when the comparison is in voice mode."""
    if not voice_mode:
        return system_content
    prompt = VOICE_SPEECH_SYSTEM_PROMPT
    cleaned = (system_content or "").rstrip()
    if not cleaned:
        return prompt
    return f"{cleaned}\n\n{prompt}"


def sanitize_voice_speech(text: str) -> str:
    """Strip markdown, tables, lists, links, code, and emoji for TTS and display."""
    if not text:
        return ""
    s = text
    s = re.sub(r"```[\w+-]*\n?[\s\S]*?```", " ", s)
    s = re.sub(r"```[\s\S]*", " ", s)
    s = re.sub(r"`([^`]+)`", r"\1", s)
    s = s.replace("`", "")
    s = re.sub(r"!\[([^\]]*)\]\([^)]*\)", r"\1", s)
    s = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", s)
    s = re.sub(r"<[^>]+>", " ", s)
    s = re.sub(r"^#{1,6}\s+", "", s, flags=re.MULTILINE)
    s = re.sub(r"^>\s?", "", s, flags=re.MULTILINE)
    s = re.sub(r"^\s*([-*_]){3,}\s*$", "", s, flags=re.MULTILINE)
    s = re.sub(
        r"^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$",
        "",
        s,
        flags=re.MULTILINE,
    )
    s = re.sub(r"\|", " ", s)
    s = re.sub(r"^(\s*)([-*+]|\d+[.)])\s+", r"\1", s, flags=re.MULTILINE)
    s = re.sub(r"\*\*\*(.+?)\*\*\*", r"\1", s)
    s = re.sub(r"\*\*(.+?)\*\*", r"\1", s)
    s = re.sub(r"__(.+?)__", r"\1", s)
    s = re.sub(r"(?<!\w)_(.+?)_(?!\w)", r"\1", s)
    s = re.sub(r"(?<!\w)\*(.+?)\*(?!\w)", r"\1", s)
    s = re.sub(r"~~(.+?)~~", r"\1", s)
    s = s.replace("**", "").replace("__", "")
    s = _EMOJI_RE.sub("", s)
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r"\s+", " ", s)
    return s.strip()
