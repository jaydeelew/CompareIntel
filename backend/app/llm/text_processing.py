"""
Text processing: repetition detection, response cleanup.
"""

import logging
import re

logger = logging.getLogger(__name__)

_DEGENERATE_WINDOW = 600
_SENTENCE_PUNCT_RE = re.compile(r"[.!?;:。！？；：、]")


def _content_ends_inside_code_fence(content: str) -> bool:
    """True when streaming output ends inside an unclosed markdown code fence."""
    return len(content.split("```")) % 2 == 0


def _analysis_window(content: str, window_size: int = _DEGENERATE_WINDOW) -> str | None:
    """Tail window to inspect, or None when the tail sits inside a code fence."""
    if len(content) < window_size:
        return None
    if _content_ends_inside_code_fence(content):
        return None
    last_fence = content.rfind("```")
    tail_start = len(content) - window_size
    if last_fence != -1 and last_fence > tail_start:
        segment = content[last_fence + 3 :]
        if segment.startswith("\n"):
            segment = segment[1:]
        elif "\n" in segment[:40]:
            segment = segment.split("\n", 1)[1]
        if len(segment) < window_size:
            return None
        return segment[-window_size:]
    return content[-window_size:]


def _is_mostly_non_latin(text: str) -> bool:
    if not text:
        return False
    letters = [c for c in text if c.isalpha()]
    if len(letters) < 40:
        return False
    latin = sum(1 for c in letters if ord(c) < 128)
    return latin / len(letters) < 0.5


def detect_degenerate_prose(content: str, window_size: int = _DEGENERATE_WINDOW) -> bool:
    """Detect long unstructured English-like prose runs (word salad) without sentence punctuation."""
    window = _analysis_window(content, window_size)
    if window is None:
        return False
    if "\n" in window or "\r" in window:
        return False
    if _SENTENCE_PUNCT_RE.search(window):
        return False
    if _is_mostly_non_latin(window):
        return False
    if "http://" in window or "https://" in window:
        return False
    if window.count("|") >= 3:
        return False
    if "$$" in window or "\\[" in window or "\\(" in window:
        return False
    if re.search(r"\b(def|class|import|function|const|let|var)\b", window):
        return False
    code_brace_margin = window.count("{") + window.count("}") + window.count(";")
    if code_brace_margin >= 8:
        return False

    words = window.split()
    if len(words) < 60:
        return False
    alpha_words = sum(1 for w in words if w.isalpha())
    if alpha_words / len(words) < 0.85:
        return False

    logger.warning(
        "Degenerate prose detected: last %s characters have no sentence structure "
        "(%s words, no line breaks)",
        window_size,
        len(words),
    )
    return True


def trim_degenerate_prose_tail(text: str, window_size: int = _DEGENERATE_WINDOW) -> str:
    """Drop a trailing runaway prose segment when a clear boundary exists."""
    if len(text) < window_size or not detect_degenerate_prose(text):
        return text
    boundary = re.search(
        rf"[.!?。！？]\s*([A-Za-z][A-Za-z\s]{{{window_size - 1},}})\s*$",
        text,
    )
    if boundary:
        trimmed = text[: boundary.start(1)].rstrip()
        if trimmed:
            return trimmed
    return text


def detect_repetition(
    content: str, window_size: int = 500, ngram_size: int = 5, repetition_threshold: int = 6
) -> bool:
    """Detect repetitive n-gram patterns that indicate a looping response."""
    if len(content) < window_size:
        return False
    recent_content = content[-window_size:]
    words = recent_content.split()
    if len(words) < ngram_size * repetition_threshold:
        return False
    ngrams = {}
    for i in range(len(words) - ngram_size + 1):
        ngram = tuple(words[i : i + ngram_size])
        ngrams[ngram] = ngrams.get(ngram, 0) + 1
    total_ngrams = len(words) - ngram_size + 1
    for ngram, count in ngrams.items():
        if count >= repetition_threshold:
            if all(len(word) <= 3 for word in ngram):
                continue
            ngram_text = " ".join(ngram).lower()
            if any(word.rstrip(".:)").isdigit() for word in ngram):
                continue
            skip_patterns = [
                "```",
                "---",
                "***",
                "===",
                "|",
                "#",
                "def ",
                "class ",
                "return ",
                "import ",
                "function ",
                "const ",
                "let ",
                "var ",
                "if ",
                "else ",
                "for ",
                "while ",
            ]
            if any(pattern in ngram_text for pattern in skip_patterns):
                continue
            repetition_ratio = count / total_ngrams
            if repetition_ratio < 0.15:
                continue
            logger.warning(
                f"Repetition detected: n-gram '{' '.join(ngram)}' appears {count} times "
                f"({repetition_ratio:.1%} of window) in last {window_size} characters"
            )
            return True
    if detect_degenerate_prose(content):
        return True
    return False


def clean_model_response(text: str) -> str:
    """Lightweight cleanup for model responses. Frontend LatexRenderer handles the rest."""
    if not text:
        return text
    text = re.sub(r"<math[^>]*>[\s\S]*?</math>", "", text, flags=re.IGNORECASE)
    text = re.sub(r"https?://www\.w3\.org/\d+/Math/MathML[^>\s]*>", "", text, flags=re.IGNORECASE)
    text = re.sub(r"www\.w3\.org/\d+/Math/MathML", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = trim_degenerate_prose_tail(text)
    return text.strip()
