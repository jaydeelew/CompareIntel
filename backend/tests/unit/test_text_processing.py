"""Unit tests for runaway output detection in text_processing."""

from app.llm.text_processing import (
    detect_degenerate_prose,
    detect_repetition,
    trim_degenerate_prose_tail,
)

WORD_SALAD_CHUNK = (
    "serving culture safeguarding heritage enriching experience deepening understanding "
    "broadening perspective illuminating insight revealing truth unveiling mystery "
    "unlocking potential realizing possibility manifesting destiny fulfilling purpose "
    "embodying virtue expressing compassion sharing love radiating joy spreading kindness "
)


def _long_word_salad(repeats: int = 12) -> str:
    return WORD_SALAD_CHUNK * repeats


def test_word_salad_after_normal_answer_triggers_degenerate_detection():
    prefix = (
        "Here is a Python swap function:\n\n```python\ndef swap(a, b):\n    return b, a\n```\n\n"
    )
    content = prefix + _long_word_salad()
    assert detect_degenerate_prose(content)
    assert detect_repetition(content)


def test_normal_prose_does_not_trigger():
    text = (
        "Artificial intelligence helps people solve problems. "
        "It can assist with coding, writing, and analysis. "
        "Good models stay on topic and stop when the task is complete."
    ) * 20
    assert not detect_degenerate_prose(text)
    assert not detect_repetition(text)


def test_code_fence_tail_does_not_trigger():
    code = "def swap(a, b):\n    a, b = b, a\n    return a, b\n" * 40
    content = "Explanation.\n\n```python\n" + code
    assert not detect_degenerate_prose(content)


def test_markdown_table_does_not_trigger():
    rows = "| Name | Value |\n| --- | --- |\n" + "\n".join(
        f"| item {i} | {i * 2} |" for i in range(80)
    )
    content = "Results:\n\n" + rows
    assert not detect_degenerate_prose(content)


def test_katex_does_not_trigger():
    content = ("The integral is $\\\\int_0^1 x^2 dx = \\\\frac{1}{3}$. Display: $$E = mc^2$$ ") * 30
    assert not detect_degenerate_prose(content)


def test_long_cjk_paragraph_does_not_trigger():
    content = (
        "人工智能可以帮助我们理解复杂的问题。"
        "它在教育、医疗和科研领域都有广泛的应用。"
        "使用者应当保持批判性思维，并验证模型给出的关键事实。"
    ) * 40
    assert not detect_degenerate_prose(content)


def test_trim_degenerate_prose_tail_keeps_good_prefix():
    prefix = "Valid answer ending here."
    content = prefix + " " + _long_word_salad(10)
    trimmed = trim_degenerate_prose_tail(content)
    assert trimmed == prefix
