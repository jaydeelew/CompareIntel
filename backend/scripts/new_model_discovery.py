#!/usr/bin/env python3
"""
Weekly new model discovery script.

Uses the same weekly **Top Models** usage chart embedded on OpenRouter's LLM Rankings
page (https://openrouter.ai/rankings), then cross-checks CompareIntel's registry and the
OpenRouter models API.

Only leaderboard models appear in the report and in the summary at the end.

Stdout is minimal: one OpenRouter model id per line for chart rows not in CompareIntel,
or a single line when there are none. Errors go to stderr.

Run this script weekly via cron job.
"""

import asyncio
import json
import re
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx

backend_dir = Path(__file__).parent.parent.resolve()
sys.path.insert(0, str(backend_dir))

from dotenv import load_dotenv

env_paths = [
    backend_dir / ".env",
    Path("/app/.env"),
]

for env_path in env_paths:
    if env_path.exists():
        load_dotenv(env_path, override=False)
        break

from app.config import settings
from app.email_service import EMAIL_CONFIGURED

REGISTRY_PATH = backend_dir / "data" / "models_registry.json"
RANKINGS_URL = "https://openrouter.ai/rankings"

# Embedded time-series chunks in the rankings HTML: "x":"YYYY-MM-DD","ys":{ "model/id": volume, ... }
_WEEK_YS_PATTERN = re.compile(r'\\"x\\":\\"(20\d\d-\d\d-\d\d)\\",\\"ys\\":\{([^}]*)\}')


def load_registry_model_ids() -> set[str]:
    """Return the set of model IDs already in models_registry.json."""
    with open(REGISTRY_PATH) as f:
        registry = json.load(f)

    ids: set[str] = set()
    for provider_models in registry.get("models_by_provider", {}).values():
        for model in provider_models:
            model_id = model.get("id")
            if model_id:
                ids.add(model_id)
    return ids


def fetch_rankings_html() -> str | None:
    """Download the public rankings page (contains embedded leaderboard JSON)."""
    try:
        with httpx.Client(timeout=45.0, follow_redirects=True) as client:
            response = client.get(
                RANKINGS_URL,
                headers={
                    "User-Agent": "CompareIntel-ModelDiscovery/1.0 (+https://compareintel.com)",
                    "Accept": "text/html,application/xhtml+xml",
                },
            )
            if response.status_code == 200:
                return response.text
            print(f"ERROR: Rankings page HTTP {response.status_code}", file=sys.stderr)
    except Exception as e:
        print(f"ERROR: Failed to fetch rankings page: {e}", file=sys.stderr)
    return None


def parse_top_models_leaderboard(
    html: str,
) -> tuple[str | None, list[str], dict[str, int]]:
    """
    Extract ordered chart keys and weekly token volumes from the main **Top Models** chart.

    The page embeds many charts; we take the latest week (max date) and choose the `ys`
    block whose largest model volume matches the main network-scale leaderboard (same
    ordering as the default Top Models list on /rankings).

    Returns:
        week label, ordered chart slugs, slug -> token volume for that week (excl. Others).
    """
    matches = _WEEK_YS_PATTERN.findall(html)
    if not matches:
        return None, [], {}

    max_date = max(m[0] for m in matches)
    best_ys: str | None = None
    best_top = -1

    for date, ys in matches:
        if date != max_date:
            continue
        pairs = re.findall(r'\\"([^\\"]+)\\":(\d+)', ys)
        volumes = [int(v) for k, v in pairs if k != "Others"]
        if not volumes:
            continue
        top1 = max(volumes)
        if top1 > best_top:
            best_top = top1
            best_ys = ys

    if best_ys is None:
        return max_date, [], {}

    pairs = re.findall(r'\\"([^\\"]+)\\":(\d+)', best_ys)
    ordered = [k for k, _ in pairs if k != "Others"]
    vol_map = {k: int(v) for k, v in pairs if k != "Others"}
    return max_date, ordered, vol_map


def format_chart_token_volume(n: int) -> str:
    """Human-readable token count from embedded weekly usage numbers."""
    if n >= 1_000_000_000_000:
        return f"{n / 1_000_000_000_000:.2f}T"
    if n >= 1_000_000_000:
        return f"{n / 1_000_000_000:.2f}B"
    if n >= 1_000_000:
        return f"{n / 1_000_000:.2f}M"
    return str(n)


def build_admin_tail_summary_plain(
    leaderboard_slugs: list[str],
    chart_volumes: dict[str, int],
    by_id: dict[str, dict[str, Any]],
    registry_ids: set[str],
) -> str:
    """
    Tail output for terminal/email: actionable OpenRouter ids only for models not in the
    registry, plus a compact list of ids already registered.

    Admin validate/add expects the exact `id` from GET /api/v1/models (not dated chart keys).
    """
    covered = build_leaderboard_slugs_covered_by_registry(registry_ids, by_id)
    lines: list[str] = []
    lines.append(
        "OpenRouter model id = exact `id` from GET /api/v1/models (same string admin validate uses)."
    )
    lines.append("")

    missing_blocks: list[str] = []
    present_ids: list[str] = []

    for rank, slug in enumerate(leaderboard_slugs, 1):
        entry = resolve_to_openrouter_entry(slug, by_id)
        api_id = entry["id"] if entry and entry.get("id") else slug
        vol = chart_volumes.get(slug, 0)
        vol_h = format_chart_token_volume(vol) if vol else "?"
        name = (entry or {}).get("name", "") or "—"
        if slug in covered:
            present_ids.append(api_id)
        else:
            missing_blocks.append(
                f"  {api_id}\n      Rank #{rank} on Top Models chart · {vol_h} tokens · {name}"
            )

    lines.append(
        f"NOT IN COMPAREINTEL REGISTRY — add via admin ({len(missing_blocks)} of {len(leaderboard_slugs)} on chart):"
    )
    lines.append("")
    if not missing_blocks:
        lines.append("  (none — every row on this chart is already in the registry.)")
    else:
        lines.append("\n\n".join(missing_blocks))
    lines.append("")
    lines.append(f"ALREADY IN REGISTRY ({len(present_ids)} on chart — no action):")
    lines.append("")
    if present_ids:
        for pid in present_ids:
            lines.append(f"  {pid}")
    else:
        lines.append("  —")
    return "\n".join(lines).rstrip() + "\n"


def fetch_openrouter_models() -> list[dict[str, Any]] | None:
    """Fetch the full model catalog from OpenRouter."""
    try:
        with httpx.Client(timeout=30.0) as client:
            response = client.get(
                "https://openrouter.ai/api/v1/models",
                params={"output_modalities": "all"},
                headers={
                    "Authorization": f"Bearer {settings.openrouter_api_key}",
                    "HTTP-Referer": "https://compareintel.com",
                },
            )
            if response.status_code == 200:
                return response.json().get("data", [])
    except Exception as e:
        print(f"ERROR: Failed to fetch models from OpenRouter: {e}", file=sys.stderr)
    return None


def build_openrouter_index(
    models: list[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    """Map model id -> OpenRouter model object."""
    return {m["id"]: m for m in models if m.get("id")}


def provider_from_id(model_id: str) -> str:
    return model_id.split("/")[0] if "/" in model_id else ""


def is_text_model(model: dict[str, Any]) -> bool:
    arch = model.get("architecture", {})
    output_mods = arch.get("output_modalities", [])
    if not output_mods:
        return True
    return "text" in output_mods


def resolve_to_openrouter_entry(
    slug: str,
    by_id: dict[str, dict[str, Any]],
) -> dict[str, Any] | None:
    if slug in by_id:
        return by_id[slug]
    for entry in by_id.values():
        if entry.get("canonical_slug") == slug:
            return entry
    return None


def build_leaderboard_slugs_covered_by_registry(
    registry_ids: set[str],
    by_id: dict[str, dict[str, Any]],
) -> set[str]:
    """
    All chart slugs / API ids that should count as "already in CompareIntel".

    The /rankings Top Models chart often keys rows by OpenRouter's dated
    canonical_slug (e.g. anthropic/claude-4.6-opus-20260205) while the registry
    stores the public API id (e.g. anthropic/claude-opus-4.6). For each registry
    id present in the models API, we also add that row's canonical_slug so both
    forms match without relying on resolve order alone.
    """
    covered: set[str] = set(registry_ids)
    for rid in registry_ids:
        row = by_id.get(rid)
        if not row:
            continue
        cs = row.get("canonical_slug")
        if cs:
            covered.add(cs)
    return covered


def discover_new_models(
    leaderboard_slugs: list[str],
    by_id: dict[str, dict[str, Any]],
    registry_ids: set[str],
) -> list[dict[str, Any]]:
    """
    Leaderboard models not represented in the CompareIntel registry (by id or
    canonical_slug from API rows for registered ids), still text-oriented when
    an API entry exists.
    """
    covered_slugs = build_leaderboard_slugs_covered_by_registry(registry_ids, by_id)
    out: list[dict[str, Any]] = []
    for slug in leaderboard_slugs:
        entry = resolve_to_openrouter_entry(slug, by_id)
        if entry is not None and not is_text_model(entry):
            continue
        if slug in covered_slugs:
            continue
        if entry is not None:
            out.append(entry)
        else:
            out.append(
                {
                    "id": slug,
                    "name": slug,
                    "description": (
                        "Leaderboard slug not found in GET /api/v1/models; "
                        "verify the id on OpenRouter or wait for catalog sync."
                    ),
                    "context_length": "N/A",
                    "created": None,
                    "architecture": {"output_modalities": ["text"]},
                }
            )
    return out


def format_model_for_display(model: dict[str, Any]) -> dict[str, str]:
    model_id = model.get("id", "")
    name = model.get("name", model_id)
    description = model.get("description", "No description available.")
    provider = provider_from_id(model_id)
    context_length = model.get("context_length", "N/A")

    created_ts = model.get("created")
    if created_ts:
        created_str = datetime.fromtimestamp(created_ts, tz=UTC).strftime("%Y-%m-%d")
    else:
        created_str = "Unknown"

    return {
        "id": model_id,
        "name": name,
        "description": description,
        "provider": provider,
        "context_length": str(context_length),
        "created": created_str,
    }


def print_missing_leaderboard_models_stdout(new_raw: list[dict[str, Any]]) -> None:
    """Print only ids for Top Models chart rows not in CompareIntel (one id per line)."""
    if not new_raw:
        print("No new leaderboard models missing from CompareIntel.")
        return
    for m in new_raw:
        mid = m.get("id")
        if mid:
            print(mid)


async def send_discovery_email(
    new_models: list[dict[str, str]],
    leaderboard_summary_plain: str,
    week_label: str | None,
) -> None:
    from app.email_service import send_new_model_discovery_report

    await send_new_model_discovery_report(new_models, leaderboard_summary_plain, week_label)


async def main() -> None:
    registry_ids = load_registry_model_ids()

    rankings_html = fetch_rankings_html()
    if rankings_html is None:
        print("ERROR: Could not load rankings page. Exiting.", file=sys.stderr)
        sys.exit(1)

    week_label, leaderboard_slugs, chart_volumes = parse_top_models_leaderboard(rankings_html)
    if not leaderboard_slugs:
        print(
            "ERROR: Could not parse Top Models leaderboard from page. Exiting.",
            file=sys.stderr,
        )
        sys.exit(1)

    raw_models = fetch_openrouter_models()
    if raw_models is None:
        print("ERROR: Could not fetch models from OpenRouter. Exiting.", file=sys.stderr)
        sys.exit(1)
    by_id = build_openrouter_index(raw_models)

    summary_plain = build_admin_tail_summary_plain(
        leaderboard_slugs, chart_volumes, by_id, registry_ids
    )

    new_raw = discover_new_models(leaderboard_slugs, by_id, registry_ids)
    new_models = [format_model_for_display(m) for m in new_raw]

    if EMAIL_CONFIGURED:
        try:
            await send_discovery_email(new_models, summary_plain, week_label)
        except Exception as e:
            print(f"ERROR: Failed to send email: {e}", file=sys.stderr)
            print_missing_leaderboard_models_stdout(new_raw)
            sys.exit(1)

    print_missing_leaderboard_models_stdout(new_raw)
    sys.exit(0)


if __name__ == "__main__":
    asyncio.run(main())
