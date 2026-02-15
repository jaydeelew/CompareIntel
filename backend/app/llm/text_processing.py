"""
Text processing: repetition detection, response cleanup.
"""

import re
import logging

logger = logging.getLogger(__name__)


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
                "```", "---", "***", "===", "|", "#", "def ", "class ", "return ",
                "import ", "function ", "const ", "let ", "var ", "if ", "else ",
                "for ", "while ",
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
    return False


def clean_model_response(text: str) -> str:
    """Lightweight cleanup for model responses. Frontend LatexRenderer handles the rest."""
    if not text:
        return text
    text = re.sub(r"<math[^>]*>[\s\S]*?</math>", "", text, flags=re.IGNORECASE)
    text = re.sub(r"https?://www\.w3\.org/\d+/Math/MathML[^>\s]*>", "", text, flags=re.IGNORECASE)
    text = re.sub(r"www\.w3\.org/\d+/Math/MathML", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()
