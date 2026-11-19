"""Leaked native tool-call markup is parsed, stripped, and kept out of saved replies."""

import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from app.llm.leaked_tool_markup import (
    RECOVERY_USER_MESSAGE,
    LeakStreamFilter,
    apply_leaked_tool_calls,
    find_leaked_tool_markup,
    parse_leaked_tool_calls,
    report_unrecognized_leak,
    strip_leaked_tool_markup,
)
from app.search.base import SearchResult

pytestmark = pytest.mark.unit

BAR = "\uff5c"
JACK_SAMPLE = (
    "I'll look up suppliers of NDS Dura Slope products in your area.\n"
    "Let me check NDS's official dealer locator ... near you.\n"
    f"<{BAR}DSML{BAR}function_calls>\n"
    f'<{BAR}DSML{BAR}invoke name="search_web">\n'
    f'<{BAR}DSML{BAR}parameter name="query" string="true">Ferguson plumbing supply '
    "Fort Worth Texas NDS drainage products location\n"
    f'<{BAR}DSML{BAR}invoke name="search_web">\n'
    f'<{BAR}DSML{BAR}parameter name="query" string="true">Ewing Irrigation Fort Worth '
    "Texas NDS Dura Slope channel drain"
)
FERGUSON = "Ferguson plumbing supply Fort Worth Texas NDS drainage products location"
EWING = "Ewing Irrigation Fort Worth Texas NDS Dura Slope channel drain"
REPO_ROOT = Path(__file__).resolve().parents[3]


def _queries(text: str) -> list[str]:
    parsed = parse_leaked_tool_calls(text)
    return [json.loads(call["function"]["arguments"])["query"] for call in parsed.tool_calls]


def _stream(text: str, size: int) -> tuple[str, list[str]]:
    filt = LeakStreamFilter()
    shown: list[str] = []
    for index in range(0, len(text), size):
        shown.append(filt.push(text[index : index + size]))
    shown.append(filt.finish())
    visible = "".join(shown)
    return visible, _queries(filt.raw)


def _assert_hidden(visible: str) -> None:
    assert "DSML" not in visible
    assert "function_calls" not in visible
    assert "invoke" not in visible
    assert "parameter" not in visible
    assert "search_web" not in visible
    assert "Ferguson" not in visible
    assert "Ewing" not in visible
    assert "I'll look up suppliers" in visible
    assert "dealer locator" in visible


def test_jack_sample_becomes_two_search_calls_and_prose_only() -> None:
    parsed = parse_leaked_tool_calls(JACK_SAMPLE)
    assert parsed.formats == ["deepseek_dsml"]
    assert _queries(JACK_SAMPLE) == [FERGUSON, EWING]
    visible = strip_leaked_tool_markup(JACK_SAMPLE)
    _assert_hidden(visible)
    assert find_leaked_tool_markup(visible) == []


@pytest.mark.parametrize("size", [1, 2, 3, 5, 7, 11])
def test_jack_sample_stays_hidden_when_split_across_chunks(size: int) -> None:
    visible, queries = _stream(JACK_SAMPLE, size)
    _assert_hidden(visible)
    assert queries == [FERGUSON, EWING]


def test_split_inside_the_first_dsml_token() -> None:
    marker = f"<{BAR}DSML"
    cut = JACK_SAMPLE.index(marker) + 1
    filt = LeakStreamFilter()
    shown = filt.push(JACK_SAMPLE[:cut]) + filt.push(JACK_SAMPLE[cut:]) + filt.finish()
    _assert_hidden(shown)
    assert _queries(filt.raw) == [FERGUSON, EWING]


def test_v41_spaced_dsml_and_ascii_bars() -> None:
    spaced = (
        "Looking.\n"
        f"<{BAR}DSML{BAR} calls>\n"
        f'<{BAR}DSML{BAR} invoke name="search_web">\n'
        f'<{BAR}DSML{BAR} parameter name="query" string="true">weather today\n'
        f"</{BAR}DSML{BAR} parameter>\n"
        f"</{BAR}DSML{BAR} invoke>\n"
        f"</{BAR}DSML{BAR} calls>\n"
        "Done."
    )
    assert _queries(spaced) == ["weather today"]
    visible = strip_leaked_tool_markup(spaced)
    assert "DSML" not in visible
    assert "Looking." in visible
    assert "Done." in visible

    ascii_bars = JACK_SAMPLE.replace(BAR, "|")
    assert _queries(ascii_bars) == [FERGUSON, EWING]
    assert "DSML" not in strip_leaked_tool_markup(ascii_bars)


def test_deepseek_v3_fullwidth_and_ascii() -> None:
    block = (
        "Hi "
        "<\uff5ctool\u2581calls\u2581begin\uff5c>"
        "<\uff5ctool\u2581call\u2581begin\uff5c>search_web<\uff5ctool\u2581sep\uff5c>"
        '{"query":"weather"}'
        "<\uff5ctool\u2581call\u2581end\uff5c>"
        "<\uff5ctool\u2581calls\u2581end\uff5c>"
        " bye"
    )
    assert parse_leaked_tool_calls(block).formats == ["deepseek_v3"]
    assert _queries(block) == ["weather"]
    assert strip_leaked_tool_markup(block) == "Hi  bye"

    ascii_block = (
        "Hi <|tool_calls_begin|>"
        '<|tool_call_begin|>fetch_url<|tool_sep|>{"url":"https://example.com/a"}'
        "<|tool_call_end|><|tool_calls_end|> bye"
    )
    parsed = parse_leaked_tool_calls(ascii_block)
    assert parsed.formats == ["deepseek_v3"]
    assert json.loads(parsed.tool_calls[0]["function"]["arguments"])["url"] == (
        "https://example.com/a"
    )


def test_kimi_section_normalizes_function_name() -> None:
    text = (
        "A <|tool_calls_section_begin|><|tool_call_begin|>functions.search_web:0"
        '<|tool_call_argument_begin|>{"query":"kimi"}<|tool_call_end|>'
        "<|tool_calls_section_end|> B"
    )
    parsed = parse_leaked_tool_calls(text)
    assert parsed.formats == ["kimi_tool_section"]
    assert _queries(text) == ["kimi"]
    assert "tool_call" not in strip_leaked_tool_markup(text)
    assert "A" in strip_leaked_tool_markup(text)
    assert "B" in strip_leaked_tool_markup(text)


def test_qwen_glm_llama_mistral_xml_and_bare_json() -> None:
    qwen = '\n<tool_call>{"name":"search_web","arguments":{"query":"qwen"}}</tool_call>\nAnswer.'
    assert _queries(qwen) == ["qwen"]
    assert strip_leaked_tool_markup(qwen).strip() == "Answer."

    glm = (
        "<tool_call>search_web\n"
        "<arg_key>query</arg_key><arg_value>glm query</arg_value>\n"
        "</tool_call>"
    )
    assert parse_leaked_tool_calls(glm).formats == ["glm_tool_call"]
    assert _queries(glm) == ["glm query"]

    llama = '<|python_tag|>{"name":"search_web","parameters":{"query":"llama"}}'
    assert "llama_python_tag" in parse_leaked_tool_calls(llama).formats
    assert _queries(llama) == ["llama"]

    function = '<function=search_web>{"query":"fn"}</function>'
    assert parse_leaked_tool_calls(function).formats == ["llama_function"]
    assert _queries(function) == ["fn"]

    mistral = 'P [TOOL_CALLS][{"name":"search_web","arguments":{"query":"mist"}}] Q'
    assert parse_leaked_tool_calls(mistral).formats == ["mistral_tool_calls"]
    assert _queries(mistral) == ["mist"]
    prose = strip_leaked_tool_markup("see [TOOL_CALLS] below")
    assert "TOOL_CALLS" not in prose
    assert "below" in prose
    assert "see" in prose

    xml = (
        '<function_calls><invoke name="search_web">'
        '<parameter name="query">xml q</parameter></invoke></function_calls>'
    )
    assert _queries(xml) == ["xml q"]
    assert "function_calls" not in strip_leaked_tool_markup(xml)

    bare = '{"name":"fetch_url","arguments":{"url":"https://example.com/b"}}'
    parsed = parse_leaked_tool_calls(bare)
    assert parsed.formats == ["bare_json"]
    assert json.loads(parsed.tool_calls[0]["function"]["arguments"])["url"] == (
        "https://example.com/b"
    )


def test_ordinary_prose_and_inequalities_pass_through() -> None:
    prose = "I will use search_web if I need a source. a < b stays."
    assert parse_leaked_tool_calls(prose).had_markup is False
    assert strip_leaked_tool_markup(prose) == prose
    visible, _queries_unused = _stream("a < b and c < d", 1)
    assert visible == "a < b and c < d"
    assert _stream("x<y and <div>hello</div>", 1)[0] == "x<y and <div>hello</div>"


def test_unrecognized_markup_is_stripped_and_reported() -> None:
    text = 'Hello <custom search_web="nope"> there'
    parsed = parse_leaked_tool_calls(text)
    assert parsed.unrecognized is True
    assert parsed.tool_calls == []
    assert "custom" not in strip_leaked_tool_markup(text)
    assert "Hello" in strip_leaked_tool_markup(text)
    assert "there" in strip_leaked_tool_markup(text)

    scope = SimpleNamespace(tags={}, extras={})

    class FakeScope:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def set_tag(self, key, value):
            scope.tags[key] = value

        def set_extra(self, key, value):
            scope.extras[key] = value

    sentry = SimpleNamespace(
        breadcrumbs=[],
        messages=[],
        add_breadcrumb=lambda **kwargs: sentry.breadcrumbs.append(kwargs),
        push_scope=FakeScope,
        capture_message=lambda message, level=None: sentry.messages.append((message, level)),
    )
    with patch.dict("sys.modules", {"sentry_sdk": sentry}):
        report_unrecognized_leak("deepseek/deepseek-v4.1-flash-1017", "unrecognized_angle")
    assert scope.tags["model_id"] == "deepseek/deepseek-v4.1-flash-1017"
    assert scope.tags["leak_kind"] == "unrecognized_tool_markup"
    assert sentry.breadcrumbs[0]["data"]["leak_kind"] == "unrecognized_angle"
    assert "nope" not in json.dumps(sentry.breadcrumbs)


def test_apply_recovers_calls_or_retries_once_when_nothing_readable_remains() -> None:
    leaked = parse_leaked_tool_calls(JACK_SAMPLE)
    accumulated: dict[int, dict] = {}
    seen: set[str] = set()
    messages: list[dict] = [{"role": "user", "content": "near me"}]
    action = apply_leaked_tool_calls(
        leaked,
        model_id="deepseek/deepseek-v4.1-flash-1017",
        tool_calls_accumulated=accumulated,
        seen_ids=seen,
        visible_text="I'll look up suppliers",
        allow_retry=True,
        recovery_used=False,
        messages=messages,
    )
    assert action.added == 2
    assert action.retry is False
    assert set(accumulated) == {0, 1}

    empty = parse_leaked_tool_calls('<custom search_web="nope">')
    retry_messages: list[dict] = [{"role": "user", "content": "near me"}]
    with patch("app.llm.leaked_tool_markup.report_unrecognized_leak"):
        retry = apply_leaked_tool_calls(
            empty,
            model_id="example/model",
            tool_calls_accumulated={},
            seen_ids=set(),
            visible_text="  ",
            allow_retry=True,
            recovery_used=False,
            messages=retry_messages,
        )
    assert retry.retry is True
    assert retry.recovery_used is True
    assert retry_messages[-1]["content"] == RECOVERY_USER_MESSAGE

    kept: list[dict] = [{"role": "user", "content": "near me"}]
    with patch("app.llm.leaked_tool_markup.report_unrecognized_leak"):
        no_retry = apply_leaked_tool_calls(
            empty,
            model_id="example/model",
            tool_calls_accumulated={},
            seen_ids=set(),
            visible_text="Hello there",
            allow_retry=True,
            recovery_used=False,
            messages=kept,
        )
    assert no_retry.retry is False
    assert len(kept) == 1


def test_recovered_ids_do_not_collide_across_parses() -> None:
    first = parse_leaked_tool_calls('{"name":"search_web","arguments":{"query":"same"}}')
    second = parse_leaked_tool_calls('{"name":"search_web","arguments":{"query":"same"}}')
    assert first.tool_calls[0]["id"] != second.tool_calls[0]["id"]


class _Stream:
    def __init__(self, chunks: list[SimpleNamespace]) -> None:
        self._chunks = chunks

    def __iter__(self):
        return iter(self._chunks)


class _Client:
    def __init__(self, streams: list[_Stream]) -> None:
        self.streams = streams
        self.calls: list[dict] = []
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self.create))

    def create(self, **kwargs):
        self.calls.append(kwargs)
        if not self.streams:
            raise AssertionError("unexpected extra completion")
        return self.streams.pop(0)


class _Limiter:
    cache = None

    async def acquire(self, provider_name: str) -> None:
        return None

    def release(self, provider_name: str) -> None:
        return None


class _Search:
    def __init__(self) -> None:
        self.queries: list[str] = []

    def get_provider_name(self) -> str:
        return "fake"

    async def search(self, query: str, max_results: int = 5) -> list[SearchResult]:
        self.queries.append(query)
        return [
            SearchResult(
                title="Store",
                url="https://example.com/store",
                snippet="Sells NDS Dura Slope",
                source="fake",
            )
        ]


def _chunk(content: str | None, finish: str | None = None) -> SimpleNamespace:
    delta = SimpleNamespace(content=content, tool_calls=None)
    choice = SimpleNamespace(delta=delta, finish_reason=finish, message=None)
    return SimpleNamespace(choices=[choice], usage=None)


def _chunks_for(text: str, size: int = 9) -> _Stream:
    pieces = [text[index : index + size] for index in range(0, len(text), size)]
    chunks = [_chunk(piece) for piece in pieces[:-1]]
    chunks.append(_chunk(pieces[-1], finish="stop"))
    return _Stream(chunks)


def _run_stream(client: _Client, search: _Search) -> str:
    from app.llm.streaming import call_openrouter_streaming

    with (
        patch(
            "app.llm.streaming.require_configured_openrouter_api_key",
            return_value="sk-test",
        ),
        patch("app.llm.streaming.get_rate_limiter", return_value=_Limiter()),
    ):
        chunks = list(
            call_openrouter_streaming(
                prompt="I am looking for a company that sells NDS Dura Slope parts near me.",
                model_id="deepseek/deepseek-v4.1-flash-1017",
                enable_web_search=True,
                search_provider=search,
                _client=client,
            )
        )
    return "".join(chunk for chunk in chunks if isinstance(chunk, str))


def test_streaming_executes_parsed_calls_and_returns_a_final_answer() -> None:
    client = _Client(
        [
            _chunks_for(JACK_SAMPLE, size=7),
            _chunks_for("A store in Fort Worth sells NDS Dura Slope.", size=11),
        ]
    )
    search = _Search()
    shown = _run_stream(client, search)
    assert search.queries == [FERGUSON, EWING]
    assert "I'll look up suppliers" in shown
    assert "A store in Fort Worth sells NDS Dura Slope." in shown
    assert "DSML" not in shown
    assert "function_calls" not in shown
    assert "Ferguson" not in shown
    assert len(client.calls) == 2
    assistant = next(msg for msg in client.calls[1]["messages"] if msg.get("tool_calls"))
    assert "DSML" not in (assistant.get("content") or "")
    assert assistant["tool_calls"][0]["function"]["name"] == "search_web"


def test_streaming_retries_once_when_markup_leaves_no_answer() -> None:
    client = _Client(
        [
            _chunks_for('<custom search_web="nope">', size=4),
            _chunks_for("A plain answer.", size=5),
        ]
    )
    shown = _run_stream(client, _Search())
    assert "custom" not in shown
    assert "search_web" not in shown
    assert "A plain answer." in shown
    assert len(client.calls) == 2
    assert client.calls[1]["messages"][-1]["content"] == RECOVERY_USER_MESSAGE


def test_saved_rendering_replies_do_not_contain_tool_markup() -> None:
    runs = REPO_ROOT / "rendering-harness" / "runs"
    if not runs.is_dir():
        pytest.skip("rendering harness runs are not in this checkout")
    hits: list[str] = []
    for path in runs.rglob("*.json"):
        if path.name in {"summary.json", "manifest.json", "results.json", "coverage.json"}:
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, UnicodeError, json.JSONDecodeError):
            continue
        if not isinstance(data, dict) or not isinstance(data.get("response"), str):
            continue
        if "modelId" not in data:
            continue
        formats = find_leaked_tool_markup(data["response"])
        if formats:
            hits.append(f"{data.get('modelId')} {data.get('promptName')} {formats} {path.name}")
    assert hits == []
