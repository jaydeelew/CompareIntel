#!/usr/bin/env python3
"""One short web-search prompt per web-capable model, looking for leaked tool markup.

Not part of CI. Sends a single non-streaming chat completion (the app's
search_web and fetch_url tools, low max_tokens) and scores that same reply
twice: raw, and after leaked_tool_markup. It does not run Brave search or the
continuation turn. Stops before the next call's estimate would push spend past
--max-usd (default $3).

    python scripts/sweep_web_search_leaks.py --dry-run
    python scripts/sweep_web_search_leaks.py --max-usd 3 --max-tokens 180

A missing or placeholder OpenRouter key exits without calling the API.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

os.environ.setdefault("SECRET_KEY", "sweep-script-not-a-production-secret-32chars")
os.environ.setdefault("ENVIRONMENT", "development")

import httpx  # noqa: E402

from app.llm.leaked_tool_markup import (  # noqa: E402
    find_leaked_tool_markup,
    parse_leaked_tool_calls,
    strip_leaked_tool_markup,
)
from app.llm.streaming import FETCH_URL_TOOL, WEB_SEARCH_TOOL  # noqa: E402

REGISTRY_PATH = BACKEND_ROOT / "data" / "models_registry.json"
CATALOG_PATH = BACKEND_ROOT / "openrouter_models.json"
PROMPT = (
    "Name one hardware store that sells NDS Dura Slope channel drain parts near Fort Worth, Texas."
)
SYSTEM = (
    "You have access to web search tools. Use search_web for this request. "
    "Invoke tools only through the tool interface. Never print tool-call markup."
)
PLACEHOLDER_KEYS = {
    "",
    "test-api-key-for-testing-only",
    "missing-openrouter-api-key",
}
UNKNOWN_PRICE_RESERVE = 0.05
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


def _real_openrouter_key() -> str:
    """Return a live OpenRouter key, never the unit-test placeholder."""
    candidates = [os.environ.get("OPENROUTER_API_KEY", "")]
    try:
        from dotenv import dotenv_values
    except ImportError:
        dotenv_values = None
    if dotenv_values is not None:
        for path in (BACKEND_ROOT / ".env", BACKEND_ROOT.parent / ".env"):
            if path.is_file():
                values = dotenv_values(path)
                candidates.append(str(values.get("OPENROUTER_API_KEY") or ""))
    for raw in candidates:
        key = raw.strip()
        if key in PLACEHOLDER_KEYS or not key.startswith("sk-or-"):
            continue
        return key
    return ""


def _web_models() -> list[dict[str, str]]:
    registry = json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
    seen: set[str] = set()
    models: list[dict[str, str]] = []
    for group in registry.get("models_by_provider", {}).values():
        if not isinstance(group, list):
            continue
        for entry in group:
            if not isinstance(entry, dict) or not entry.get("supports_web_search"):
                continue
            model_id = str(entry.get("id") or "")
            if not model_id or model_id in seen:
                continue
            seen.add(model_id)
            models.append({"id": model_id, "name": str(entry.get("name") or model_id)})
    return models


def _prices() -> dict[str, tuple[float, float] | None]:
    catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    prices: dict[str, tuple[float, float] | None] = {}
    for entry in catalog.get("data", []):
        if not isinstance(entry, dict) or not entry.get("id"):
            continue
        pricing = entry.get("pricing") or {}
        try:
            prices[str(entry["id"])] = (
                float(pricing.get("prompt") or 0),
                float(pricing.get("completion") or 0),
            )
        except (TypeError, ValueError):
            prices[str(entry["id"])] = None
    return prices


def _request_body(model_id: str, max_tokens: int) -> dict:
    return {
        "model": model_id,
        "messages": [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": PROMPT},
        ],
        "tools": [WEB_SEARCH_TOOL, FETCH_URL_TOOL],
        "max_tokens": max_tokens,
        "temperature": 0,
        "usage": {"include": True},
    }


def _estimate(
    model_id: str, prices: dict[str, tuple[float, float] | None], tokens: int, max_tokens: int
) -> tuple[float, str]:
    pricing = prices.get(model_id)
    if pricing is None and model_id not in prices:
        return UNKNOWN_PRICE_RESERVE, "unpriced"
    if pricing is None:
        return UNKNOWN_PRICE_RESERVE, "unpriced"
    prompt_price, completion_price = pricing
    return prompt_price * tokens + completion_price * max_tokens, "catalog"


def _score(content: str, native_calls: int) -> dict[str, str | int]:
    parsed = parse_leaked_tool_calls(content)
    visible = strip_leaked_tool_markup(content)
    residual = find_leaked_tool_markup(visible)
    return {
        "raw_formats": ",".join(parsed.formats) if parsed.formats else "none",
        "answer_raw": "y" if content.strip() else "n",
        "answer_after_parser": "y" if visible.strip() else "n",
        "residual_formats": ",".join(residual) if residual else "none",
        "native_tool_calls": native_calls,
        "parsed_calls": len(parsed.tool_calls),
    }


def _markdown(rows: list[dict[str, str]], spent: float, note: str) -> str:
    lines = [
        note,
        "",
        "| model | leaked markup | final answer raw | final answer after parser | residual markup | native tool call | parsed calls | cost |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for row in rows:
        lines.append(
            "| {model} | {raw_formats} | {answer_raw} | {answer_after_parser} | {residual_formats} | {native} | {parsed_calls} | {cost} |".format(
                **row
            )
        )
    lines.append("")
    lines.append(f"Total actual cost: ${spent:.6f}")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run", action="store_true", help="Print the cost estimate and do not call OpenRouter"
    )
    parser.add_argument("--max-usd", type=float, default=3.0)
    parser.add_argument("--max-tokens", type=int, default=180)
    parser.add_argument("--write-summary", type=Path, default=None)
    args = parser.parse_args()

    models = _web_models()
    prices = _prices()
    sample = _request_body(models[0]["id"] if models else "openai/gpt-4o-mini", args.max_tokens)
    prompt_tokens = max(1, len(json.dumps(sample)) // 4)
    ranked = []
    for model in models:
        estimate, source = _estimate(model["id"], prices, prompt_tokens, args.max_tokens)
        ranked.append({**model, "estimate": estimate, "price_source": source})
    ranked.sort(key=lambda item: (item["estimate"], item["id"]))
    total_estimate = sum(item["estimate"] for item in ranked)

    print(f"Web-capable models: {len(ranked)}")
    print(f"Prompt token estimate (tools included): {prompt_tokens}")
    print(f"Completion cap: {args.max_tokens}")
    print(f"Catalog estimate for every model, one call each: ${total_estimate:.4f}")
    print(f"Spend cap: ${args.max_usd:.2f}")
    print(
        "Unpriced models reserve $" + f"{UNKNOWN_PRICE_RESERVE:.2f}" + " until usage.cost returns."
    )
    print("Order is cheapest estimate first so the cap covers more models.")

    if args.dry_run:
        for item in ranked:
            print(f"  {item['id']}: ${item['estimate']:.6f} ({item['price_source']})")
        print("Dry run only. No OpenRouter calls were made.")
        return 0

    key = _real_openrouter_key()
    if not key:
        print("OPENROUTER_API_KEY is not set to a live sk-or- key. No calls were made.")
        return 2

    spent = 0.0
    rows: list[dict[str, str]] = []
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://compareintel.com",
        "X-Title": "CompareIntel Leak Sweep",
    }
    with httpx.Client(timeout=90.0) as client:
        for item in ranked:
            estimate = float(item["estimate"])
            if spent + estimate > args.max_usd:
                rows.append(
                    {
                        "model": item["id"],
                        "raw_formats": "not run",
                        "answer_raw": "n",
                        "answer_after_parser": "n",
                        "residual_formats": "not run",
                        "native": "n",
                        "parsed_calls": "0",
                        "cost": "skipped, cap",
                    }
                )
                continue
            try:
                response = client.post(
                    OPENROUTER_URL,
                    headers=headers,
                    json=_request_body(item["id"], args.max_tokens),
                )
            except httpx.HTTPError:
                spent += estimate
                rows.append(
                    {
                        "model": item["id"],
                        "raw_formats": "transport error",
                        "answer_raw": "n",
                        "answer_after_parser": "n",
                        "residual_formats": "n/a",
                        "native": "n",
                        "parsed_calls": "0",
                        "cost": f"${estimate:.6f} reserved",
                    }
                )
                print(
                    f"{item['id']}: transport error, reserved ${estimate:.6f}, spent=${spent:.6f}"
                )
                continue
            if response.status_code in {401, 403}:
                print("OpenRouter rejected the API key. Stopped without further calls.")
                return 2
            cost = estimate
            content = ""
            native = 0
            if response.status_code == 200:
                payload = response.json()
                usage = payload.get("usage") or {}
                if usage.get("cost") is not None:
                    try:
                        cost = float(usage["cost"])
                    except (TypeError, ValueError):
                        cost = estimate
                message = (payload.get("choices") or [{}])[0].get("message") or {}
                content = message.get("content") or ""
                if not isinstance(content, str):
                    content = json.dumps(content)
                native = len(message.get("tool_calls") or [])
            else:
                content = ""
            spent += cost
            scored = (
                _score(content, native)
                if response.status_code == 200
                else {
                    "raw_formats": f"http {response.status_code}",
                    "answer_raw": "n",
                    "answer_after_parser": "n",
                    "residual_formats": "n/a",
                    "native_tool_calls": 0,
                    "parsed_calls": 0,
                }
            )
            rows.append(
                {
                    "model": item["id"],
                    "raw_formats": str(scored["raw_formats"]),
                    "answer_raw": str(scored["answer_raw"]),
                    "answer_after_parser": str(scored["answer_after_parser"]),
                    "residual_formats": str(scored["residual_formats"]),
                    "native": "y" if int(scored["native_tool_calls"]) else "n",
                    "parsed_calls": str(scored["parsed_calls"]),
                    "cost": f"${cost:.6f}",
                }
            )
            print(
                f"{item['id']}: raw={scored['raw_formats']} answer={scored['answer_after_parser']} "
                f"native={scored['native_tool_calls']} cost=${cost:.6f} spent=${spent:.6f}"
            )
            if spent >= args.max_usd:
                break

    note = (
        "One completion per model on the web-search tool schema. "
        "Raw columns are the provider content before the parser. "
        "After-parser columns run leaked_tool_markup on that same text. "
        "This pass does not execute search or a continuation turn. "
        f"Models are ordered by catalog estimate. Cap ${args.max_usd:.2f}."
    )
    summary = _markdown(rows, spent, note)
    print(summary)
    if args.write_summary is not None:
        args.write_summary.write_text(summary + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
