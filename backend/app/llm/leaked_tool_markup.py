"""Recover native tool-call markup that providers leave in assistant text.

Some OpenRouter routes (DeepSeek V4.1 DSML, DeepSeek V3, Qwen/Hermes, Llama,
Mistral, Kimi, GLM, and lookalikes) put the model's private tool syntax in
``content`` instead of ``tool_calls``. This module is model-agnostic: every
web-search stream runs the same registry. Known formats become real tool
calls. Anything else that names our tools inside markup is stripped, logged,
and reported so a new dialect shows up quickly.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from collections.abc import Callable

logger = logging.getLogger(__name__)

EXECUTABLE_TOOLS = frozenset({"search_web", "fetch_url"})
_CALL_SEQ = 0

RECOVERY_USER_MESSAGE = (
    "Your previous reply printed tool-call markup instead of calling a tool or answering. "
    "Answer the user in plain prose, or invoke tools only through the tool interface. "
    "Do not print DSML, tool_call tags, function-call syntax, or raw tool JSON."
)

_BAR = r"(?:\uff5c|\|)"
_DSML_TAG = rf"<\s*{_BAR}\s*DSML\s*{_BAR}\s*"
_DSML_CLOSE = rf"</\s*{_BAR}\s*DSML\s*{_BAR}\s*"
_BLOCK_NAME = r"(?:function_calls|tool_calls|calls)"

_DSML_MARK_RE = re.compile(rf"<\s*{_BAR}\s*DSML\s*{_BAR}", re.IGNORECASE)
_DSML_CLOSE_RE = re.compile(rf"{_DSML_CLOSE}{_BLOCK_NAME}\s*>", re.IGNORECASE)
_DSML_INVOKE_RE = re.compile(
    rf"{_DSML_TAG}invoke\b([^>]*)>(.*?)(?={_DSML_TAG}invoke\b|{_DSML_CLOSE}{_BLOCK_NAME}\s*>|$)",
    re.IGNORECASE | re.DOTALL,
)
_DSML_PARAM_RE = re.compile(
    rf"{_DSML_TAG}parameter\b([^>]*)>(.*?)(?={_DSML_TAG}|{_DSML_CLOSE}|$)",
    re.IGNORECASE | re.DOTALL,
)

_XML_INVOKE_RE = re.compile(
    r"<invoke\b([^>]*)>(.*?)(?=<invoke\b|</function_calls\s*>|</tool_calls\s*>|$)",
    re.IGNORECASE | re.DOTALL,
)
_XML_PARAM_RE = re.compile(
    r"<parameter\b([^>]*)>(.*?)(?=</parameter\s*>|<parameter\b|</invoke\s*>|</function\s*>|</tool_call\s*>|$)",
    re.IGNORECASE | re.DOTALL,
)
_FUNCTION_EQ_RE = re.compile(
    r"<function=([A-Za-z0-9_.:-]+)\s*>(.*?)(?=</function\s*>|<function=|$)",
    re.IGNORECASE | re.DOTALL,
)
_ARG_PAIR_RE = re.compile(
    r"<arg_key\b[^>]*>(.*?)</arg_key\s*>\s*<arg_value\b[^>]*>(.*?)(?=</arg_value\s*>|<arg_key\b|$)",
    re.IGNORECASE | re.DOTALL,
)
_ATTR_RE = re.compile(r"""([A-Za-z_][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')""")
_TOOL_NAME_RE = re.compile(r"\b(?:search_web|fetch_url)\b", re.IGNORECASE)
_CONTROL_RE = re.compile(
    rf"<(?:{_BAR})(?:begin|end)\u2581of\u2581sentence(?:{_BAR})>"
    rf"|<(?:{_BAR})(?:begin|end)_of_sentence(?:{_BAR})>"
)

_FALLBACK_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    (
        "unrecognized_angle",
        re.compile(
            r"<[^>\n]{0,240}\b(?:search_web|fetch_url)\b[^>\n]{0,240}>",
            re.IGNORECASE,
        ),
    ),
    (
        "unrecognized_block",
        re.compile(
            r"<(?P<tag>[A-Za-z_][\w:.-]{0,40})\b[^>]{0,200}\b(?:search_web|fetch_url)\b[^>]*>"
            r".*?</(?P=tag)\s*>",
            re.IGNORECASE | re.DOTALL,
        ),
    ),
    (
        "unrecognized_bracket",
        re.compile(
            r"\[[^\]\n]{0,80}(?:TOOL_CALL|tool_call|ARGS)[^\]\n]{0,80}"
            r"\b(?:search_web|fetch_url)\b[^\]\n]{0,80}\]",
            re.IGNORECASE,
        ),
    ),
)

# Literal prefixes held back when a stream chunk ends mid-token.
_OPENER_STEMS: tuple[str, ...] = (
    "<\uff5cDSML\uff5c",
    "<|DSML|",
    "<\uff5ctool\u2581",
    "<|tool\u2581",
    "<\uff5ctool_",
    "<|tool_",
    "<tool_call",
    "<tool_calls",
    "<function_calls",
    "<function=",
    "<invoke",
    "<|python_tag|>",
    "<|tool_calls_section_begin|>",
    "<|tool_call_begin|>",
    "<|tool_call_argument_begin|>",
    "[TOOL_CALLS]",
    "[tool_calls]",
)


def _ds_tokens(core: str) -> list[str]:
    """Fullwidth-bar and ASCII-bar forms, with ▁ or '_' as the word separator."""
    cores = {core}
    if "\u2581" in core:
        cores.add(core.replace("\u2581", "_"))
    elif "_" in core:
        cores.add(core.replace("_", "\u2581"))
    tokens: list[str] = []
    for item in cores:
        for bar in ("\uff5c", "|"):
            tokens.append(f"<{bar}{item}{bar}>")
    return tokens


_V3_CALLS_BEGIN = _ds_tokens("tool\u2581calls\u2581begin")
_V3_CALLS_END = _ds_tokens("tool\u2581calls\u2581end")
_V3_CALL_BEGIN = _ds_tokens("tool\u2581call\u2581begin")
_V3_CALL_END = _ds_tokens("tool\u2581call\u2581end")
_V3_SEP = _ds_tokens("tool\u2581sep")


@dataclass
class _PendingCall:
    name: str
    arguments: str


@dataclass
class _Span:
    start: int
    end: int | None
    format_id: str
    calls: list[_PendingCall] = field(default_factory=list)
    unrecognized: bool = False


@dataclass
class LeakParseResult:
    """Tool calls recovered from one assistant text, plus what was unreadable."""

    tool_calls: list[dict[str, Any]]
    formats: list[str]
    unrecognized: bool
    unrecognized_kind: str
    had_markup: bool


@dataclass
class LeakApplyResult:
    added: int
    retry: bool
    recovery_used: bool


def _normalize_tool_name(name: str) -> str:
    cleaned = name.strip()
    if "::" in cleaned:
        cleaned = cleaned.split("::")[-1]
    if cleaned.startswith("functions."):
        cleaned = cleaned[len("functions.") :]
    cleaned = re.sub(r":\d+$", "", cleaned)
    return cleaned.strip()


def _attr_map(blob: str) -> dict[str, str]:
    found: dict[str, str] = {}
    for match in _ATTR_RE.finditer(blob or ""):
        found[match.group(1).lower()] = (
            match.group(2) if match.group(2) is not None else match.group(3)
        )
    return found


def _coerce_param(raw: str, string_flag: str | None) -> Any:
    text = raw.strip()
    if string_flag == "false":
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            return text
    if string_flag == "true" or string_flag is None:
        return text
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return text


def _alias_arguments(payload: dict[str, Any], tool_name: str) -> dict[str, Any] | None:
    data = dict(payload)
    if tool_name == "search_web":
        if "query" not in data:
            for key in ("q", "search_query", "searchquery", "text"):
                if key in data and isinstance(data[key], str):
                    data["query"] = data.pop(key)
                    break
        query = data.get("query")
        if not isinstance(query, str) or not query.strip():
            return None
        data["query"] = query.strip()
        return data
    if tool_name == "fetch_url":
        if "url" not in data:
            for key in ("link", "href", "uri"):
                if key in data and isinstance(data[key], str):
                    data["url"] = data.pop(key)
                    break
        url = data.get("url")
        if not isinstance(url, str) or not url.strip():
            return None
        data["url"] = url.strip()
        return data
    return None


def _call_from_payload(name: str, payload: Any) -> _PendingCall | None:
    tool = _normalize_tool_name(name)
    if tool not in EXECUTABLE_TOOLS:
        return None
    if isinstance(payload, str):
        try:
            parsed = json.loads(payload)
        except json.JSONDecodeError:
            parsed = {"query": payload} if tool == "search_web" else {"url": payload}
        payload = parsed
    if not isinstance(payload, dict):
        return None
    arguments = _alias_arguments(payload, tool)
    if arguments is None:
        return None
    encoded = json.dumps(arguments, ensure_ascii=False, separators=(",", ":"))
    return _PendingCall(tool, encoded)


def _calls_from_obj(obj: Any) -> list[_PendingCall]:
    calls: list[_PendingCall] = []
    if isinstance(obj, list):
        for item in obj:
            calls.extend(_calls_from_obj(item))
        return calls
    if not isinstance(obj, dict):
        return calls
    name = obj.get("name") or obj.get("tool") or obj.get("function")
    if isinstance(name, dict):
        name = name.get("name")
    payload = obj.get("arguments", obj.get("parameters", obj.get("args")))
    if isinstance(name, str) and payload is not None:
        call = _call_from_payload(name, payload)
        if call:
            calls.append(call)
        return calls
    # A bare arguments object is not a tool call.
    return calls


def _calls_from_json_text(text: str) -> list[_PendingCall]:
    stripped = text.strip()
    stripped = re.sub(r"^```(?:json)?\s*", "", stripped, flags=re.IGNORECASE)
    stripped = re.sub(r"\s*```$", "", stripped)
    start_obj = stripped.find("{")
    start_arr = stripped.find("[")
    starts = [pos for pos in (start_obj, start_arr) if pos >= 0]
    if not starts:
        return []
    start = min(starts)
    try:
        obj, _end = json.JSONDecoder().raw_decode(stripped[start:])
    except json.JSONDecodeError:
        return []
    return _calls_from_obj(obj)


def _params_from_regex(body: str, pattern: re.Pattern[str]) -> dict[str, Any]:
    payload: dict[str, Any] = {}
    for match in pattern.finditer(body):
        attrs = _attr_map(match.group(1))
        key = attrs.get("name")
        if not key:
            continue
        flag = attrs.get("string")
        payload[key] = _coerce_param(match.group(2), flag.lower() if flag else None)
    return payload


def _calls_from_invokes(
    body: str, invoke_re: re.Pattern[str], param_re: re.Pattern[str]
) -> list[_PendingCall]:
    calls: list[_PendingCall] = []
    for match in invoke_re.finditer(body):
        attrs = _attr_map(match.group(1))
        name = attrs.get("name") or ""
        inner = match.group(2)
        payload = _params_from_regex(inner, param_re)
        if not payload:
            payload_calls = _calls_from_json_text(inner)
            if payload_calls and _normalize_tool_name(name) in EXECUTABLE_TOOLS:
                # JSON body belongs to the invoke name when the JSON omitted it.
                for pending in payload_calls:
                    if pending.name == _normalize_tool_name(name) or not name:
                        calls.append(pending)
                if calls:
                    continue
            if not payload_calls and name:
                call = _call_from_payload(name, _params_from_regex(inner, param_re) or {})
                if call:
                    calls.append(call)
                continue
            calls.extend(payload_calls)
            continue
        call = _call_from_payload(name, payload)
        if call:
            calls.append(call)
    return calls


def _find_token(text: str, tokens: list[str], start: int = 0) -> tuple[int, str] | None:
    best: tuple[int, str] | None = None
    for token in tokens:
        idx = text.find(token, start)
        if idx >= 0 and (best is None or idx < best[0]):
            best = (idx, token)
    return best


def _occupy(span: _Span) -> tuple[int, int]:
    end = span.end if span.end is not None else 10**12
    return span.start, end


def _overlaps(start: int, end: int | None, occupied: list[tuple[int, int]]) -> bool:
    actual_end = end if end is not None else 10**12
    for left, right in occupied:
        if start < right and left < actual_end:
            return True
    return False


def _add_span(
    spans: list[_Span],
    occupied: list[tuple[int, int]],
    span: _Span,
) -> None:
    if span.end is not None and span.end <= span.start:
        return
    if _overlaps(span.start, span.end, occupied):
        return
    spans.append(span)
    occupied.append(_occupy(span))


def _find_dsml(text: str) -> list[_Span]:
    """Any DSML marker starts a region, including a block that never closes."""
    spans: list[_Span] = []
    cursor = 0
    while cursor < len(text):
        mark = _DSML_MARK_RE.search(text, cursor)
        if mark is None:
            break
        close = _DSML_CLOSE_RE.search(text, mark.end())
        end = close.end() if close else None
        body_end = close.start() if close else len(text)
        body = text[mark.start() : body_end]
        calls = _calls_from_invokes(body, _DSML_INVOKE_RE, _DSML_PARAM_RE)
        spans.append(_Span(mark.start(), end, "deepseek_dsml", calls))
        if end is None:
            break
        cursor = end
    return spans


def _parse_v3_inner(body: str) -> list[_PendingCall]:
    calls: list[_PendingCall] = []
    cursor = 0
    while cursor < len(body):
        begin = _find_token(body, _V3_CALL_BEGIN, cursor)
        if begin is None:
            break
        sep = _find_token(body, _V3_SEP, begin[0] + len(begin[1]))
        if sep is None:
            break
        end = _find_token(body, _V3_CALL_END, sep[0] + len(sep[1]))
        name_blob = body[begin[0] + len(begin[1]) : sep[0]].strip()
        arg_end = end[0] if end else len(body)
        arg_blob = body[sep[0] + len(sep[1]) : arg_end].strip()
        name = name_blob
        if name_blob.lower() in {"function", "tool"} or "\n" in name_blob:
            # Some templates emit the type, then the name, before the separator.
            lines = [line.strip() for line in name_blob.splitlines() if line.strip()]
            if lines:
                name = lines[-1]
        name = name.split("<")[0].strip()
        parsed = _calls_from_json_text(arg_blob)
        if parsed:
            calls.extend(parsed)
        else:
            call = _call_from_payload(name, arg_blob)
            if call:
                calls.append(call)
        cursor = (end[0] + len(end[1])) if end else len(body)
        if end is None:
            break
    return calls


def _is_kimi_region(text: str, start: int) -> bool:
    """Kimi reuses ``<|tool_call_begin|>`` but then writes an argument token, not a V3 sep."""
    window = text[start : start + 240]
    arg = window.find("<|tool_call_argument_begin|>")
    sep = _find_token(window, _V3_SEP, 0)
    if arg < 0:
        return (
            "<|tool_calls_section_begin|>" in window
            or "<|tool_calls_section_end|>" in text[start : start + 400]
        )
    if sep is None:
        return True
    return arg < sep[0]


def _find_v3(text: str) -> list[_Span]:
    spans: list[_Span] = []
    cursor = 0
    while cursor < len(text):
        begin = _find_token(text, _V3_CALLS_BEGIN, cursor)
        single = _find_token(text, _V3_CALL_BEGIN, cursor)
        if begin is None and single is None:
            break
        use_wrapper = begin is not None and (single is None or begin[0] <= single[0])
        if use_wrapper and begin is not None:
            start, token = begin
            # ``<|tool_calls_begin|>`` must not match inside ``<|tool_calls_section_begin|>``.
            if text.startswith("<|tool_calls_section_", start) or text.startswith(
                "<\uff5ctool_calls_section_", start
            ):
                cursor = start + len(token)
                continue
            end_tok = _find_token(text, _V3_CALLS_END, start + len(token))
            body_end = end_tok[0] if end_tok else len(text)
            end = (end_tok[0] + len(end_tok[1])) if end_tok else None
            body = text[start + len(token) : body_end]
            if "\u2581" not in token and _find_token(body, _V3_SEP, 0) is None and end is None:
                cursor = start + len(token)
                continue
            spans.append(_Span(start, end, "deepseek_v3", _parse_v3_inner(body)))
            cursor = end if end is not None else len(text)
            if end is None:
                break
            continue
        if single is None:
            break
        start, token = single
        if _is_kimi_region(text, start):
            cursor = start + len(token)
            continue
        sep = _find_token(text, _V3_SEP, start + len(token))
        if sep is None and "\u2581" not in token:
            cursor = start + len(token)
            continue
        end_tok = _find_token(text, _V3_CALL_END, start + len(token))
        region_end = (end_tok[0] + len(end_tok[1])) if end_tok else None
        body = text[start : region_end if region_end is not None else len(text)]
        spans.append(_Span(start, region_end, "deepseek_v3", _parse_v3_inner(body)))
        cursor = region_end if region_end is not None else len(text)
        if region_end is None:
            break
    return spans


def _find_kimi(text: str) -> list[_Span]:
    begin = "<|tool_calls_section_begin|>"
    end_token = "<|tool_calls_section_end|>"
    call_begin = "<|tool_call_begin|>"
    arg_begin = "<|tool_call_argument_begin|>"
    call_end = "<|tool_call_end|>"
    spans: list[_Span] = []
    cursor = 0
    while True:
        start = text.find(begin, cursor)
        loose = text.find(call_begin, cursor)
        if start < 0 and loose < 0:
            break
        if start < 0 or (loose >= 0 and loose < start):
            start = loose
            token = call_begin
            wrapper = False
        else:
            token = begin
            wrapper = True
        if wrapper:
            end_at = text.find(end_token, start + len(token))
            region_end = (end_at + len(end_token)) if end_at >= 0 else None
            body = text[start + len(token) : end_at if end_at >= 0 else len(text)]
        else:
            end_at = text.find(call_end, start + len(token))
            region_end = (end_at + len(call_end)) if end_at >= 0 else None
            body = text[start : region_end if region_end is not None else len(text)]
        calls: list[_PendingCall] = []
        scan = body
        pos = 0
        while True:
            cb = scan.find(call_begin, pos)
            if cb < 0:
                break
            ab = scan.find(arg_begin, cb + len(call_begin))
            ce = scan.find(call_end, ab + len(arg_begin) if ab >= 0 else cb)
            if ab < 0:
                break
            name_blob = scan[cb + len(call_begin) : ab].strip()
            arg_blob = scan[ab + len(arg_begin) : ce if ce >= 0 else len(scan)]
            parsed = _calls_from_json_text(arg_blob)
            if parsed:
                calls.extend(parsed)
            else:
                call = _call_from_payload(name_blob, arg_blob)
                if call:
                    calls.append(call)
            pos = (ce + len(call_end)) if ce >= 0 else len(scan)
            if ce < 0:
                break
        spans.append(_Span(start, region_end, "kimi_tool_section", calls))
        cursor = region_end if region_end is not None else len(text)
        if region_end is None:
            break
    return spans


def _find_mistral(text: str) -> list[_Span]:
    spans: list[_Span] = []
    for match in re.finditer(r"\[TOOL_CALLS\]", text, flags=re.IGNORECASE):
        rest = text[match.end() :]
        stripped = rest.lstrip()
        lead = len(rest) - len(stripped)
        calls: list[_PendingCall] = []
        end: int | None
        if not stripped:
            # The token just ended. Hold it so a following JSON payload can attach.
            end = None
        elif rest[:1].isspace() and stripped[0] not in "[{":
            # "[TOOL_CALLS] below" is the token plus prose, not name[ARGS].
            end = match.end()
        elif stripped[0] in "[{":
            try:
                obj, offset = json.JSONDecoder().raw_decode(stripped)
            except json.JSONDecodeError:
                end = None
                calls = []
            else:
                end = match.end() + lead + offset
                calls = _calls_from_obj(obj)
        else:
            named = re.match(
                r"([A-Za-z0-9_.:-]+)\s*\[ARGS\]\s*",
                stripped,
                flags=re.IGNORECASE,
            )
            if not named:
                # Still typing `name` or `name[ARGS]` with no payload yet.
                end = (
                    None
                    if re.match(r"^[A-Za-z0-9_.:-]+(\[ARGS\]?)?$", stripped, flags=re.IGNORECASE)
                    else match.end()
                )
            else:
                after = stripped[named.end() :]
                try:
                    obj, offset = json.JSONDecoder().raw_decode(after.lstrip())
                except json.JSONDecodeError:
                    end = None
                    call = _call_from_payload(named.group(1), {})
                    calls = [call] if call else []
                else:
                    pad = len(after) - len(after.lstrip())
                    end = match.end() + lead + named.end() + pad + offset
                    call = _call_from_payload(named.group(1), obj if isinstance(obj, dict) else {})
                    calls = [call] if call else _calls_from_obj(obj)
        spans.append(_Span(match.start(), end, "mistral_tool_calls", calls))
    return spans


def _find_python_tag(text: str) -> list[_Span]:
    token = "<|python_tag|>"
    spans: list[_Span] = []
    cursor = 0
    while True:
        start = text.find(token, cursor)
        if start < 0:
            break
        rest = text[start + len(token) :]
        end_markers = ["<|eom_id|>", "<|eot_id|>"]
        end_at = None
        marker_len = 0
        for marker in end_markers:
            idx = rest.find(marker)
            if idx >= 0 and (end_at is None or idx < end_at):
                end_at = idx
                marker_len = len(marker)
        if end_at is None:
            body = rest
            region_end = None
        else:
            body = rest[:end_at]
            region_end = start + len(token) + end_at + marker_len
        calls = _calls_from_json_text(body)
        if not calls:
            py = re.match(
                r"\s*(?:functions\.)?([A-Za-z_][\w]*)\s*(?:\.call)?\s*\((.*)\)\s*$",
                body,
                flags=re.DOTALL,
            )
            if py:
                pairs = re.findall(
                    r"(\w+)\s*=\s*[\"']([^\"']*)[\"']",
                    py.group(2),
                )
                call = _call_from_payload(py.group(1), dict(pairs))
                calls = [call] if call else []
        spans.append(_Span(start, region_end, "llama_python_tag", calls))
        cursor = region_end if region_end is not None else len(text)
        if region_end is None:
            break
    return spans


def _calls_from_tool_body(body: str, attrs: str) -> tuple[list[_PendingCall], str]:
    attr_map = _attr_map(attrs)
    name = attr_map.get("name", "")
    json_calls = _calls_from_json_text(body)
    if json_calls:
        return json_calls, "qwen_hermes_tool_call"
    fn_calls: list[_PendingCall] = []
    for match in _FUNCTION_EQ_RE.finditer(body):
        fn_name = match.group(1)
        inner = match.group(2)
        payload = _params_from_regex(inner, _XML_PARAM_RE)
        if not payload:
            pairs = re.findall(
                r"<parameter=([A-Za-z0-9_-]+)\s*>(.*?)(?=</parameter\s*>|<parameter=|$)",
                inner,
                flags=re.IGNORECASE | re.DOTALL,
            )
            payload = {key: value.strip() for key, value in pairs}
        if not payload:
            json_inner = _calls_from_json_text(inner)
            if json_inner:
                fn_calls.extend(json_inner)
                continue
        call = _call_from_payload(fn_name, payload)
        if call:
            fn_calls.append(call)
    if fn_calls:
        return fn_calls, "llama_function"
    arg_pairs = _ARG_PAIR_RE.findall(body)
    if arg_pairs or (name and body.strip()):
        payload = {key.strip(): value.strip() for key, value in arg_pairs}
        if not name:
            first = body.strip().splitlines()[0].strip() if body.strip() else ""
            if first and "<" not in first:
                name = first
        call = _call_from_payload(name, payload)
        if call:
            return [call], "glm_tool_call"
    if name:
        call = _call_from_payload(name, _calls_from_json_text(body) and {} or {})
        if call:
            return [call], "qwen_hermes_tool_call"
    return [], "qwen_hermes_tool_call"


def _find_tool_call_blocks(text: str) -> list[_Span]:
    spans: list[_Span] = []
    for match in re.finditer(r"<tool_call\b([^>]*)>", text, flags=re.IGNORECASE):
        close = re.search(r"</tool_call\s*>", text[match.end() :], flags=re.IGNORECASE)
        if close:
            body = text[match.end() : match.end() + close.start()]
            end: int | None = match.end() + close.end()
        else:
            body = text[match.end() :]
            end = None
        calls, format_id = _calls_from_tool_body(body, match.group(1) or "")
        spans.append(_Span(match.start(), end, format_id, calls))
    return spans


def _find_function_blocks(text: str) -> list[_Span]:
    spans: list[_Span] = []
    for match in re.finditer(r"<function_calls\b[^>]*>", text, flags=re.IGNORECASE):
        close = re.search(r"</function_calls\s*>", text[match.end() :], flags=re.IGNORECASE)
        if close:
            body = text[match.end() : match.end() + close.start()]
            end: int | None = match.end() + close.end()
        else:
            body = text[match.end() :]
            end = None
        calls = _calls_from_invokes(body, _XML_INVOKE_RE, _XML_PARAM_RE)
        if not calls:
            calls = _calls_from_json_text(body)
        spans.append(_Span(match.start(), end, "xml_function_calls", calls))
    return spans


def _find_function_eq(text: str) -> list[_Span]:
    spans: list[_Span] = []
    for match in _FUNCTION_EQ_RE.finditer(text):
        close_rel = text.find("</function>", match.end())
        # The regex already consumed through the next function or end via non-greedy body,
        # but the match includes the body. Use the match span, extended through a close tag.
        end = match.end()
        if close_rel >= match.start() and text.find("</function>", match.end() - 20) >= 0:
            close_at = text.find("</function>", match.end())
            if close_at >= 0:
                end = close_at + len("</function>")
        name = match.group(1)
        inner = match.group(2)
        payload = _params_from_regex(inner, _XML_PARAM_RE)
        if not payload:
            json_calls = _calls_from_json_text(inner)
            if json_calls:
                spans.append(_Span(match.start(), end, "llama_function", json_calls))
                continue
            call = _call_from_payload(name, inner.strip())
        else:
            call = _call_from_payload(name, payload)
        spans.append(_Span(match.start(), end, "llama_function", [call] if call else []))
    return spans


def _find_xml_invoke(text: str) -> list[_Span]:
    spans: list[_Span] = []
    for match in re.finditer(r"<invoke\b[^>]*>", text, flags=re.IGNORECASE):
        close = re.search(r"</invoke\s*>", text[match.end() :], flags=re.IGNORECASE)
        region = text[match.start() : match.end() + close.end()] if close else text[match.start() :]
        end = (match.end() + close.end()) if close else None
        calls = _calls_from_invokes(region, _XML_INVOKE_RE, _XML_PARAM_RE)
        spans.append(_Span(match.start(), end, "xml_invoke", calls))
    return spans


def _find_bare_json(text: str) -> list[_Span]:
    spans: list[_Span] = []
    cursor = 0
    while cursor < len(text):
        nxt_obj = text.find("{", cursor)
        nxt_arr = text.find("[", cursor)
        candidates = [pos for pos in (nxt_obj, nxt_arr) if pos >= 0]
        if not candidates:
            break
        start = min(candidates)
        window = text[start : start + 80]
        if start == nxt_obj and not re.match(r'\{\s*"name"\s*:', window):
            if _incomplete_tool_json(text[start:]) and start == text.rfind("{", 0, len(text)):
                if re.search(r'"name"\s*:\s*"(?:search_web|fetch_url)"', text[start:]):
                    spans.append(
                        _Span(start, None, "bare_json", _calls_from_json_text(text[start:]))
                    )
                    break
            cursor = start + 1
            continue
        try:
            obj, offset = json.JSONDecoder().raw_decode(text[start:])
        except json.JSONDecodeError:
            if re.search(r'"name"\s*:\s*"(?:search_web|fetch_url)"', text[start : start + 240]):
                spans.append(_Span(start, None, "bare_json", []))
                break
            cursor = start + 1
            continue
        calls = _calls_from_obj(obj)
        if calls:
            spans.append(_Span(start, start + offset, "bare_json", calls))
            cursor = start + offset
        else:
            cursor = start + 1
    return spans


def _incomplete_tool_json(fragment: str) -> bool:
    if not fragment.startswith("{") or len(fragment) > 500:
        return False
    named = re.search(r'"name"\s*:\s*"([^"]*)"', fragment)
    if named:
        value = named.group(1)
        if value not in EXECUTABLE_TOOLS and not any(
            tool.startswith(value) for tool in EXECUTABLE_TOOLS
        ):
            return False
        return fragment.count("{") > fragment.count("}")
    return bool(
        re.match(
            r"""^\{\s*(?:"(?:name?)?"?)?(?::\s*"?(?:search_web|fetch_url|s|se|sea|sear|search|search_|search_w|search_we|f|fe|fet|fetc|fetch|fetch_|fetch_u|fetch_ur)?\"?)?$""",
            fragment,
            flags=re.IGNORECASE,
        )
    )


def _find_control(text: str) -> list[_Span]:
    return [
        _Span(match.start(), match.end(), "deepseek_control")
        for match in _CONTROL_RE.finditer(text)
    ]


def _find_fallback(text: str) -> list[_Span]:
    spans: list[_Span] = []
    for format_id, pattern in _FALLBACK_PATTERNS:
        for match in pattern.finditer(text):
            if not _TOOL_NAME_RE.search(match.group(0)):
                continue
            spans.append(_Span(match.start(), match.end(), format_id, unrecognized=True))
    return spans


_FINDERS: tuple[Callable[[str], list[_Span]], ...] = (
    _find_dsml,
    _find_v3,
    _find_kimi,
    _find_mistral,
    _find_python_tag,
    _find_tool_call_blocks,
    _find_function_blocks,
    _find_function_eq,
    _find_xml_invoke,
    _find_bare_json,
    _find_control,
    _find_fallback,
)


def scan_leaks(text: str) -> list[_Span]:
    spans: list[_Span] = []
    occupied: list[tuple[int, int]] = []
    for finder in _FINDERS:
        for span in finder(text):
            _add_span(spans, occupied, span)
    spans.sort(key=lambda item: (item.start, item.end is None, -(item.end or 10**12)))
    return spans


def parse_leaked_tool_calls(text: str) -> LeakParseResult:
    spans = scan_leaks(text)
    formats: list[str] = []
    pending: list[_PendingCall] = []
    unrecognized = False
    kinds: list[str] = []
    for span in spans:
        if span.format_id not in formats:
            formats.append(span.format_id)
        if span.unrecognized:
            unrecognized = True
            if span.format_id not in kinds:
                kinds.append(span.format_id)
        pending.extend(span.calls)
    tool_calls: list[dict[str, Any]] = []
    global _CALL_SEQ
    for index, call in enumerate(pending):
        _CALL_SEQ += 1
        digest = hashlib.sha256(
            f"{_CALL_SEQ}\0{index}\0{call.name}\0{call.arguments}".encode()
        ).hexdigest()[:12]
        tool_calls.append(
            {
                "id": f"call_leak_{digest}",
                "type": "function",
                "function": {"name": call.name, "arguments": call.arguments},
            }
        )
    return LeakParseResult(
        tool_calls=tool_calls,
        formats=formats,
        unrecognized=unrecognized,
        unrecognized_kind=",".join(kinds),
        had_markup=bool(formats),
    )


def find_leaked_tool_markup(text: str) -> list[str]:
    """Format ids present in ``text``. Empty when the reply is safe to show."""
    if not text:
        return []
    return parse_leaked_tool_calls(text).formats


def _partial_hold_len(text: str) -> int:
    """How many trailing characters might still grow into tool-call markup.

    A completed opener stem is not enough: ``<｜DSML｜function_calls`` has already
    passed ``<｜DSML｜`` and must stay buffered until the tag's ``>`` arrives and
    the span scanner can see it.
    """
    if not text:
        return 0
    hold = 0
    window = text[-240:]
    for length in range(1, len(window) + 1):
        suffix = window[-length:]
        if any(stem.startswith(suffix) for stem in _OPENER_STEMS):
            hold = length
    for stem in _OPENER_STEMS:
        idx = window.rfind(stem)
        if idx < 0:
            continue
        tail = window[idx:]
        if stem.startswith("["):
            # Keep a just-finished token so the next chunk can extend it into JSON.
            if tail == stem:
                hold = max(hold, len(tail))
            continue
        if ">" not in tail[len(stem) :]:
            hold = max(hold, len(tail))
    brace = text.rfind("{", max(0, len(text) - 180))
    if brace >= 0 and _incomplete_tool_json(text[brace:]):
        hold = max(hold, len(text) - brace)
    # An unrecognized tag such as ``<custom search_web="...">`` does not match a
    # known stem until the tool name has arrived. Hold from the ``<`` until ``>``
    # so the fallback scanner sees the whole tag. ``a < b`` has a space after
    # ``<`` and is not held.
    window = text[-260:]
    start = window.rfind("<")
    if start >= 0:
        tail = window[start:]
        if (
            "\n" not in tail
            and ">" not in tail
            and len(tail) <= 241
            and (
                len(tail) == 1
                or (not tail[1].isspace() and tail[1] not in "=/" and not tail[1].isdigit())
            )
            and (len(tail) == 1 or tail[1].isalpha() or tail[1] in "|｜")
        ):
            hold = max(hold, len(tail))
    return hold


def _should_drop_hold(held: str) -> bool:
    """Drop a buffered tail only when finishing would reveal tool markup."""
    if len(held) < 2:
        return False
    if _TOOL_NAME_RE.search(held):
        return True
    return any(stem.startswith(held) or held.startswith(stem) for stem in _OPENER_STEMS)


def split_stream_buffer(pending: str, *, final: bool) -> tuple[str, str]:
    """Return ``(safe_to_emit, still_holding)`` for one stream buffer."""
    emitted: list[str] = []
    while pending:
        spans = scan_leaks(pending)
        span = next((item for item in spans if item.start >= 0), None)
        if span is None:
            hold = _partial_hold_len(pending)
            if not final:
                if hold:
                    emitted.append(pending[:-hold])
                    return "".join(emitted), pending[-hold:]
                emitted.append(pending)
                return "".join(emitted), ""
            if hold and _should_drop_hold(pending[-hold:]):
                emitted.append(pending[:-hold])
                return "".join(emitted), ""
            emitted.append(pending)
            return "".join(emitted), ""
        if span.start > 0:
            emitted.append(pending[: span.start])
            pending = pending[span.start :]
            continue
        if span.end is None:
            if final:
                return "".join(emitted), ""
            return "".join(emitted), pending
        pending = pending[span.end :]
    return "".join(emitted), ""


class LeakStreamFilter:
    """Hide tool-call markup that arrives split across stream chunks."""

    def __init__(self) -> None:
        self.raw = ""
        self._pending = ""

    def push(self, chunk: str) -> str:
        if not chunk:
            return ""
        self.raw += chunk
        self._pending += chunk
        emit, self._pending = split_stream_buffer(self._pending, final=False)
        return emit

    def finish(self) -> str:
        emit, self._pending = split_stream_buffer(self._pending, final=True)
        self._pending = ""
        return emit

    def parse(self) -> LeakParseResult:
        return parse_leaked_tool_calls(self.raw)


def strip_leaked_tool_markup(text: str) -> str:
    filt = LeakStreamFilter()
    return filt.push(text) + filt.finish()


def report_unrecognized_leak(model_id: str, kind: str) -> None:
    """Structured warning plus a Sentry breadcrumb and event tagged with the model."""
    safe_kind = kind or "unrecognized"
    logger.warning(
        "leaked_tool_markup_unrecognized model_id=%s leak_kind=%s",
        model_id,
        safe_kind,
    )
    try:
        import sentry_sdk
    except ImportError:
        logger.debug("sentry_sdk is not installed; unrecognized tool markup was logged only")
        return
    try:
        sentry_sdk.add_breadcrumb(
            category="leaked_tool_markup",
            message="Unrecognized tool-call markup stripped from model content",
            level="warning",
            data={"model_id": model_id, "leak_kind": safe_kind},
        )
        scope_cm = getattr(sentry_sdk, "new_scope", None) or sentry_sdk.push_scope
        with scope_cm() as scope:
            scope.set_tag("model_id", model_id)
            scope.set_tag("leak_kind", "unrecognized_tool_markup")
            scope.set_extra("model_id", model_id)
            scope.set_extra("leak_kind", safe_kind)
            sentry_sdk.capture_message(
                "Unrecognized tool-call markup stripped from model content",
                level="warning",
            )
    except Exception:
        logger.debug("Sentry reporting failed for leaked tool markup", exc_info=True)


def apply_leaked_tool_calls(
    leaked: LeakParseResult | None,
    *,
    model_id: str,
    tool_calls_accumulated: dict[int, dict[str, Any]],
    seen_ids: set[str],
    visible_text: str,
    allow_retry: bool,
    recovery_used: bool,
    messages: list[dict[str, Any]],
) -> LeakApplyResult:
    """Merge recovered calls into the live tool loop, or schedule one clean retry."""
    if leaked is None or not leaked.had_markup:
        return LeakApplyResult(added=0, retry=False, recovery_used=recovery_used)

    if leaked.unrecognized:
        report_unrecognized_leak(model_id, leaked.unrecognized_kind)
    elif leaked.tool_calls:
        logger.info(
            "Recovered leaked tool markup model_id=%s formats=%s count=%s tools=%s",
            model_id,
            ",".join(leaked.formats),
            len(leaked.tool_calls),
            [call["function"]["name"] for call in leaked.tool_calls],
        )
    else:
        logger.warning(
            "Stripped leaked tool markup without an executable tool call model_id=%s formats=%s",
            model_id,
            ",".join(leaked.formats),
        )

    added = 0
    next_idx = max(tool_calls_accumulated) + 1 if tool_calls_accumulated else 0
    for call in leaked.tool_calls:
        call_id = str(call.get("id") or "")
        if not call_id or call_id in seen_ids:
            continue
        tool_calls_accumulated[next_idx] = call
        seen_ids.add(call_id)
        next_idx += 1
        added += 1

    if (
        allow_retry
        and not recovery_used
        and added == 0
        and not tool_calls_accumulated
        and not visible_text.strip()
    ):
        messages.append({"role": "user", "content": RECOVERY_USER_MESSAGE})
        logger.warning(
            "Retrying once after leaked tool markup with no answer model_id=%s",
            model_id,
        )
        return LeakApplyResult(added=0, retry=True, recovery_used=True)

    return LeakApplyResult(added=added, retry=False, recovery_used=recovery_used)
