"""
Research model benchmarks and update Help Me Choose recommendations.

This script is called automatically when a new model is added via the admin panel.
It can also be run standalone:

    python scripts/research_model_benchmarks.py <model_id> [--dry-run]
    python scripts/research_model_benchmarks.py --refresh-all [--dry-run]
    python scripts/research_model_benchmarks.py --sync-lineup [--dry-run]

Single-model mode:
1. Fetches the model's OpenRouter data (description, pricing, capabilities)
2. Fetches benchmark scores from public sources (Scale Labs SWE-Bench Pro public, etc.) when available
3. Determines which Help Me Choose categories the model qualifies for
4. Adds the model and sorts each category by benchmark score (best first)
5. Updates frontend/src/data/helpMeChooseRecommendations.ts with proper ranking

Refresh-all mode (--refresh-all):
  Re-evaluates ALL registry models against ALL data-driven categories
  (cost-effective, fast, coding, math, reasoning, writing, long-context, legal,
  multilingual, images/vision). Coding uses SWE-Bench Pro public (Scale Labs); models
  without a Pro leaderboard row are dropped from Best for coding. Vision uses LMArena
  Vision Arena scores. Run periodically to keep categories current as leaderboards update.

  Source-health guard: if a source returns 0 rows, or far fewer than the existing
  category, keep the previous entries, mark them stale, and log loudly. Do not
  drop a category because a scraper broke or a leaderboard went empty.

  Lineup sync: drop (or, with --dry-run, flag) rankings whose model is not in
  the active CompareIntel lineup (models_registry.json models_by_provider).
  Lineup models with no rankings are printed as a report only — not an error.

Sync-lineup mode (--sync-lineup):
  Local files only (no network / no paid API calls). Drops Help Me Choose
  rankings for models not in the lineup and reports lineup models that have
  no rankings.

Only models with verifiable, publicly available benchmark data are added.
"""

import json
import re
import sys
from datetime import datetime
from pathlib import Path

import httpx
from bs4 import BeautifulSoup

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
RECOMMENDATIONS_PATH = PROJECT_ROOT / "frontend" / "src" / "data" / "helpMeChooseRecommendations.ts"
METHODOLOGY_PATH = (
    PROJECT_ROOT / "frontend" / "src" / "components" / "pages" / "HelpMeChooseMethodology.tsx"
)
REGISTRY_PATH = PROJECT_ROOT / "backend" / "data" / "models_registry.json"

# Categories with fetchable benchmark sources. Only these are auto-populated.
CATEGORY_IDS = [
    "coding",
    "writing",
    "reasoning",
    "math",
    "long-context",
    "cost-effective",
    "fast",
    "multilingual",
    "legal",
    "medical",
    "images",
    "image-generation",
]

# Categories where lower score is better (e.g. cost-effective: cheaper first)
SORT_ASCENDING_CATEGORIES = {"cost-effective"}

# Vision (image understanding): LMArena Vision Arena via official Hugging Face dataset
VISION_ARENA_LEADERBOARD_URL = "https://lmarena.ai/leaderboard/vision"
VISION_ARENA_DATASET_ROWS_URL = "https://datasets-server.huggingface.co/rows"

# Image generation: kearai.com/leaderboard/text-to-image 404'd (moved to blog.kearai.com).
# Primary live source is the official LMArena Hugging Face dataset (same pattern as vision).
TEXT_TO_IMAGE_ARENA_URL = "https://blog.kearai.com/leaderboard/text-to-image"
TEXT_TO_IMAGE_ARENA_URLS = (
    "https://blog.kearai.com/leaderboard/text-to-image",
    "https://kearai.com/leaderboard/text-to-image",
)

# SWE-Bench Pro public leaderboard (Scale Labs; RSC payload includes entry JSON)
SWE_BENCH_PRO_URL = "https://labs.scale.com/leaderboard/swe_bench_pro_public"
# Static HTML fallback (subset of models; used if labs page format changes)
SWE_BENCH_PRO_FALLBACK_URL = "https://scaleapi.github.io/SWE-bench_Pro-os/"
LMARENA_URL = "https://lmarena.ai/"
VALS_LEGAL_BENCH_URL = "https://www.vals.ai/benchmarks/legal_bench"
# Weekly/monthly endpoint leaderboards are often empty ("No leaderboard data yet")
# and mix unofficial proxy endpoints (implausible 10k+ t/s). Prefer model-speed.
LMSPEED_URL = "https://lmspeed.net/leaderboard/model-speed"
LMSPEED_WEEKLY_URL = "https://lmspeed.net/leaderboard/best-throughput-models-weekly"
LMSPEED_MONTHLY_URL = "https://lmspeed.net/leaderboard/best-throughput-models-monthly"
OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models"
# Default GET /api/v1/models omits image-output models; always request the full catalog.
OPENROUTER_MODELS_LIST_PARAMS = {"output_modalities": "all"}
GLOBAL_MMLU_URL = "https://llmdb.com/benchmarks/global-mmlu"
MMLU_PRO_URL = "https://awesomeagents.ai/leaderboards/mmlu-pro-leaderboard/"
# kearai.com/leaderboard/creative-writing 404'd; content moved to the blog snapshot.
CREATIVE_WRITING_URL = "https://blog.kearai.com/leaderboard/creative-writing"
CREATIVE_WRITING_URLS = (
    "https://blog.kearai.com/leaderboard/creative-writing",
    "https://kearai.com/leaderboard/creative-writing",
)
# Live LMArena Creative Writing (JS-rendered; documented as the current public equivalent).
CREATIVE_WRITING_ARENA_URL = "https://arena.ai/leaderboard/chat/text/creative-writing"
MRCR_URL = "https://llmdb.com/benchmarks/mrcr-1m"
MATH_URL = "https://llmdb.com/benchmarks/math"
GSM8K_URL = "https://llmdb.com/benchmarks/gsm8k"
AIME_2025_URL = "https://llmdb.com/benchmarks/aime-2025"
AWESOME_AGENTS_LONG_CONTEXT_URL = (
    "https://awesomeagents.ai/leaderboards/long-context-benchmarks-leaderboard/"
)

# Browser-like headers: several leaderboards (LMSpeed) Cloudflare-challenge bare clients.
_HTTP_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

# Treat a fetch as collapsed when it returns fewer than this fraction of existing rows.
SOURCE_COLLAPSE_RATIO = 0.5
STALE_MARKER_RE = re.compile(r"\s*\[stale as of \d{4}-\d{2}-\d{2}\]")
FETCHED_MARKER_RE = re.compile(r"\s*Fetched \d{4}-\d{2}-\d{2}\.")


def _today_iso() -> str:
    return datetime.now().strftime("%Y-%m-%d")


def _http_get(url: str, timeout: float = 20.0, **kwargs) -> httpx.Response:
    """GET with browser-like headers and redirects. Callers still mock httpx.get."""
    headers = {**_HTTP_HEADERS, **kwargs.pop("headers", {})}
    return httpx.get(url, timeout=timeout, follow_redirects=True, headers=headers, **kwargs)


def with_fetch_date(evidence: str, fetched_on: str | None = None) -> str:
    """Append a fetch date to an evidence string (idempotent)."""
    fetched_on = fetched_on or _today_iso()
    cleaned = FETCHED_MARKER_RE.sub("", evidence).rstrip()
    if cleaned.endswith("."):
        return f"{cleaned} Fetched {fetched_on}."
    return f"{cleaned}. Fetched {fetched_on}."


def mark_evidence_stale(evidence: str, as_of: str | None = None) -> str:
    """Mark evidence stale without dropping the previous score (idempotent)."""
    as_of = as_of or _today_iso()
    cleaned = STALE_MARKER_RE.sub("", evidence).rstrip()
    return f"{cleaned} [stale as of {as_of}]"


def mark_category_stale(category: dict, as_of: str | None = None) -> list[str]:
    """Append a stale marker to every model in a category. Returns changed model ids."""
    changed: list[str] = []
    cat_id = category.get("id", "")
    for model in category.get("models", []):
        old = model.get("evidence", "")
        existing = extract_primary_score(cat_id, old)
        if existing is not None and not is_plausible_score(cat_id, existing):
            continue
        new = mark_evidence_stale(old, as_of=as_of)
        if new != old:
            model["evidence"] = new
            changed.append(model["modelId"])
    return changed


def evaluate_source_health(
    category_id: str,
    fetched_count: int,
    existing_count: int,
    *,
    collapse_ratio: float = SOURCE_COLLAPSE_RATIO,
) -> tuple[bool, str]:
    """Return (healthy, reason). Empty or far-fewer-than-before fetches are unhealthy."""
    if fetched_count == 0:
        return False, (
            f"SOURCE UNHEALTHY [{category_id}]: fetch returned 0 models "
            f"(existing category has {existing_count}). "
            "Keeping previous data and marking it stale."
        )
    if existing_count > 0 and fetched_count < existing_count * collapse_ratio:
        return False, (
            f"SOURCE UNHEALTHY [{category_id}]: fetch returned {fetched_count} models, "
            f"far fewer than the existing {existing_count} "
            f"(collapse threshold {collapse_ratio:.0%}). "
            "Keeping previous data and marking it stale."
        )
    return True, ""


def apply_source_health_guard(
    categories: list[dict],
    fetched_by_cat: dict[str, dict[str, tuple[float, str]]],
    *,
    collapse_ratio: float = SOURCE_COLLAPSE_RATIO,
    as_of: str | None = None,
) -> tuple[dict[str, dict[str, tuple[float, str]]], dict[str, list[str]], list[str]]:
    """Drop collapsed fetches, keep existing rows, mark them stale, and log loudly.

    Returns (healthy_fetched, stale_model_ids_by_cat, warning_messages).
    """
    existing_counts = {cat["id"]: len(cat.get("models", [])) for cat in categories}
    cats_by_id = {cat["id"]: cat for cat in categories}
    healthy: dict[str, dict[str, tuple[float, str]]] = {}
    stale: dict[str, list[str]] = {}
    warnings: list[str] = []

    for cat_id, scores in fetched_by_cat.items():
        ok, reason = evaluate_source_health(
            cat_id,
            len(scores),
            existing_counts.get(cat_id, 0),
            collapse_ratio=collapse_ratio,
        )
        if ok:
            healthy[cat_id] = scores
            continue
        warnings.append(reason)
        print(f"ERROR: {reason}", file=sys.stderr)
        cat = cats_by_id.get(cat_id)
        if cat is not None:
            changed = mark_category_stale(cat, as_of=as_of)
            if changed:
                stale[cat_id] = changed
                print(
                    f"ERROR: [{cat_id}] marked {len(changed)} existing model(s) stale.",
                    file=sys.stderr,
                )
    return healthy, stale, warnings


def is_plausible_score(category_id: str, score: float) -> bool:
    """Reject scrape artifacts (e.g. unofficial 13,496 t/s for a frontier chat model)."""
    if score != score:  # NaN
        return False
    if category_id == "fast":
        return 0 < score <= FAST_MAX_THROUGHPUT
    if category_id == "cost-effective":
        return score > 0
    if category_id in {"coding", "math", "reasoning", "multilingual", "legal", "medical"}:
        return 0 <= score <= 100
    if category_id == "writing":
        # Mazur ~0–10 or Arena Elo ~1000–2000
        return (0 < score <= 10) or (500 <= score <= 2500)
    if category_id in {"images", "image-generation"}:
        return 500 <= score <= 2500
    if category_id == "long-context":
        return 0 <= score <= 100
    return True


def attach_fetch_dates(
    scores: dict[str, tuple[float, str]], fetched_on: str | None = None
) -> dict[str, tuple[float, str]]:
    dated: dict[str, tuple[float, str]] = {}
    for mid, (score, evidence) in scores.items():
        dated[mid] = (score, with_fetch_date(evidence, fetched_on))
    return dated


def filter_plausible_scores(
    category_id: str, scores: dict[str, tuple[float, str]]
) -> dict[str, tuple[float, str]]:
    kept: dict[str, tuple[float, str]] = {}
    for mid, (score, evidence) in scores.items():
        if is_plausible_score(category_id, score):
            kept[mid] = (score, evidence)
        else:
            print(
                f"ERROR: [{category_id}] rejected implausible score for {mid}: {score} ({evidence})",
                file=sys.stderr,
            )
    return kept


def extract_primary_score(category_id: str, evidence: str) -> float | None:
    """Extract primary numeric score from evidence for ordering. Returns None if no comparable score."""
    # Percentage (SWE-Bench, MMLU-Pro, etc.)
    pct = re.search(r"(\d+\.?\d*)\s*%", evidence)
    if pct:
        return float(pct.group(1))
    # Writing: Creative Writing Arena Elo (e.g. "1478 Elo") or Mazur score (e.g. 8.561)
    if category_id == "writing":
        elo = re.search(r"(\d{4})\s*Elo", evidence, re.I)
        if elo:
            return float(elo.group(1))
        mazur = re.search(r"Mazur[^:]*:\s*(\d+\.\d+)", evidence, re.I)
        if mazur:
            return float(mazur.group(1))
        # Legacy range format (e.g. 1455–1461 Elo)
        elo_range = re.search(r"(\d{4})\s*[–\-]\s*\d+\s*Elo", evidence, re.I)
        if elo_range:
            return float(elo_range.group(1))
    # MRCR /100 (e.g. 93/100) or Michelangelo score (e.g. 70.5)
    frac = re.search(r"(\d+)\s*/\s*100\b", evidence)
    if frac:
        return float(frac.group(1))
    if category_id == "long-context":
        mrcr = re.search(r"(?:llmdb|Michelangelo)[^:]*:\s*(\d+\.?\d*)", evidence, re.I)
        if mrcr:
            return float(mrcr.group(1))
    # LegalBench, HealthBench, multilingual Global-MMLU (percentage)
    if category_id in ("legal", "medical", "multilingual"):
        pct = re.search(r"(\d+\.?\d*)\s*%", evidence)
        if pct:
            return float(pct.group(1))
    # Cost-effective: Avg. $X.XX/1M tokens
    if category_id == "cost-effective":
        cost = re.search(r"\$\s*(\d+\.?\d*)\s*/\s*1\s*M", evidence, re.I)
        if cost:
            return float(cost.group(1))
    # Fast: LMSpeed XXX t/s (tokens per second)
    if category_id == "fast":
        tps = re.search(r"(\d+\.?\d*)\s*t/s", evidence, re.I)
        if tps:
            return float(tps.group(1))
    # Image generation: Text-to-Image Arena Rating (e.g. "Text-to-Image Arena (kearai.com): 1154.")
    if category_id == "image-generation":
        arena = re.search(r"(?:Text-to-Image Arena|Arena Rating)[^:]*:\s*(\d+)", evidence, re.I)
        if arena:
            return float(arena.group(1))
    # Vision: LMArena Vision Arena score (e.g. "Vision Arena (lmarena.ai): 1244.")
    if category_id == "images":
        arena = re.search(r"Vision Arena[^:]*:\s*(\d+)", evidence, re.I)
        if arena:
            return float(arena.group(1))
    return None


def _normalize_name_for_match(name: str) -> str:
    """Normalize model name for fuzzy matching against leaderboard names."""
    s = name.lower().strip()
    # Remove parenthetical suffixes like "(high)" or "(11/25)"
    s = re.sub(r"\s*\([^)]*\)\s*$", "", s)
    # Normalize hyphens to spaces so "gpt-5.2" matches "gpt 5.2"
    s = s.replace("-", " ")
    s = re.sub(r"\s+", " ", s).strip()
    return s


def _expand_hyphenated_minor_versions(slug_base: str) -> str:
    """Map Scale-style hyphen minors (e.g. claude-opus-4-6) to dotted form (claude-opus-4.6).

    Registry display names use dotted versions ("Claude Opus 4.6"); the SWE-Bench Pro
    leaderboard uses single-digit segments separated by hyphens. Only single-digit pairs
    are rewritten so ids like qwen3-coder-480b-a35b stay intact.
    """
    return re.sub(r"-(\d)-(\d)(?=-|$|\s|\()", r"-\1.\2", slug_base)


def get_model_id_to_name_map() -> dict[str, str]:
    """Build model_id -> registry name from models registry."""
    registry = load_registry()
    result: dict[str, str] = {}
    for provider_models in registry.get("models_by_provider", {}).values():
        for m in provider_models:
            if mid := m.get("id"):
                result[mid] = m.get("name", mid.split("/")[-1])
    return result


# llmdb slug -> registry model_id. Only same-generation aliases — never map
# Gemini 2.0 → 2.5 or o1 → o3 (that produced fake 2.0% MATH scores).
MATH_SLUG_TO_MODEL_ID: dict[str, str] = {
    "gpt-4o": "openai/gpt-4o",
    "o3": "openai/o3",
    "gpt-oss-120b": "openai/gpt-oss-120b",
    "gemini-2-5-pro": "google/gemini-2.5-pro",
    "gemini-2-5-flash": "google/gemini-2.5-flash",
    "deepseek-v3": "deepseek/deepseek-v3.2",
}

# VALS model slug (e.g. google_gemini-3-pro-preview) -> our registry model_id
VALS_TO_MODEL_ID: dict[str, str] = {
    "google_gemini-3-pro-preview": "google/gemini-3.1-pro-preview",
    "google_gemini-3-flash-preview": "google/gemini-3-flash-preview",
    "openai_gpt-5-2025-08-07": "openai/gpt-5",
}


def fetch_legalbench_scores() -> dict[str, tuple[float, str]]:
    """Fetch LegalBench scores from VALS.ai. Returns model_id -> (score, evidence)."""
    model_id_to_name = get_model_id_to_name_map()
    name_to_model_id = {_normalize_name_for_match(n): mid for mid, n in model_id_to_name.items()}

    result: dict[str, tuple[float, str]] = {}
    try:
        resp = httpx.get(VALS_LEGAL_BENCH_URL, timeout=15.0)
        if resp.status_code != 200:
            return result
        text = resp.text
        # VALS page: model links like /models/openai_gpt-5-2025-08-07 with "86.02%" nearby
        # Pattern: href="/models/SLUG" ... (XX.XX%)
        for m in re.finditer(
            r'href="/models/([^"]+)"[^>]*>([^<]+)</a>.*?(\d+\.\d+)\s*%',
            text,
            re.DOTALL,
        ):
            slug, display_name, score_str = m.group(1), m.group(2), m.group(3)
            try:
                score = float(score_str)
            except ValueError:
                continue
            mid = VALS_TO_MODEL_ID.get(slug)
            if not mid:
                norm = _normalize_name_for_match(display_name.split("(")[0].strip())
                mid = name_to_model_id.get(norm)
            if mid:
                result[mid] = (score, f"LegalBench (vals.ai): {score}%.")
    except Exception as e:
        print(f"Warning: Could not fetch LegalBench scores: {e}", file=sys.stderr)
    return result


def fetch_openrouter_pricing() -> dict[str, tuple[float, str]]:
    """Fetch OpenRouter pricing for registry models. Returns model_id -> (avg_cost_per_1M, evidence).
    Lower cost = better. Avg = (prompt + completion) / 2 per 1M tokens."""
    registry_ids = set()
    for provider_models in load_registry().get("models_by_provider", {}).values():
        for m in provider_models:
            if mid := m.get("id"):
                registry_ids.add(mid)

    result: dict[str, tuple[float, str]] = {}
    try:
        resp = httpx.get(
            OPENROUTER_MODELS_URL,
            params=OPENROUTER_MODELS_LIST_PARAMS,
            headers={"HTTP-Referer": "https://compareintel.com"},
            timeout=20.0,
        )
        if resp.status_code != 200:
            return result
        for m in resp.json().get("data", []):
            mid = m.get("id")
            if not mid or mid not in registry_ids:
                continue
            cost = calculate_avg_cost(m)
            if cost is not None and cost > 0:
                result[mid] = (cost, f"Avg. ${cost:.2f}/1M tokens.")
    except Exception as e:
        print(f"Warning: Could not fetch OpenRouter pricing: {e}", file=sys.stderr)
    return result


def _llmdb_slug_maps(
    extra_slug_map: dict[str, str] | None = None,
) -> tuple[dict[str, str], dict[str, str]]:
    """Return (slug_to_model_id, name_to_model_id) for llmdb leaderboard rows."""
    model_id_to_name = get_model_id_to_name_map()
    name_to_model_id = {_normalize_name_for_match(n): mid for mid, n in model_id_to_name.items()}
    slug_to_model_id: dict[str, str] = {}
    for mid in model_id_to_name:
        parts = mid.split("/")
        if len(parts) == 2:
            slug_to_model_id[parts[1].replace(".", "-")] = mid
    if extra_slug_map:
        slug_to_model_id.update(extra_slug_map)
    return slug_to_model_id, name_to_model_id


def _score_from_llmdb_score_cell(score_cell) -> float | None:
    """Read the Score column only. Do not regex the whole row (matches '2.0' in 'Gemini 2.0')."""
    score_span = score_cell.find("span")
    raw = (score_span.get_text(strip=True) if score_span else score_cell.get_text(strip=True)) or ""
    raw = raw.replace(",", "").split()[0] if raw else ""
    try:
        score = float(raw)
    except ValueError:
        return None
    if score < 0 or score > 100:
        return None
    return score


def _fetch_llmdb_leaderboard(
    url: str,
    benchmark_name: str,
    evidence_template: str,
    extra_slug_map: dict[str, str] | None = None,
    extra_name_map: dict[str, str] | None = None,
) -> dict[str, tuple[float, str]]:
    """Parse an llmdb Rank|Model|Provider|Score table by column.

    Previously used a row-wide regex that captured version numbers (Gemini 2.0 → 2.0%).
    """
    slug_to_model_id, name_to_model_id = _llmdb_slug_maps(extra_slug_map)
    if extra_name_map:
        name_to_model_id.update(
            {_normalize_name_for_match(k): v for k, v in extra_name_map.items()}
        )
    result: dict[str, tuple[float, str]] = {}
    try:
        resp = _http_get(url, timeout=15.0)
        if resp.status_code != 200:
            return result
        soup = BeautifulSoup(resp.text, "html.parser")
        table = soup.find("table")
        if not table:
            return result
        for row in table.find_all("tr"):
            cells = row.find_all("td")
            if len(cells) < 4:
                continue
            link = cells[1].find("a", href=True)
            if not link:
                continue
            href = link.get("href", "")
            if "/models/" not in href:
                continue
            slug = href.split("/models/")[-1].rstrip("/").strip()
            display_name = link.get_text(strip=True) or ""
            score = _score_from_llmdb_score_cell(cells[3])
            if score is None:
                continue
            mid = slug_to_model_id.get(slug)
            if not mid:
                mid = extra_name_map.get(display_name) if extra_name_map else None
            if not mid:
                mid = name_to_model_id.get(_normalize_name_for_match(display_name.split("(")[0]))
            if mid:
                evidence = evidence_template.format(score=score)
                if mid not in result or score > result[mid][0]:
                    result[mid] = (score, evidence)
    except Exception as e:
        print(f"Warning: Could not fetch {benchmark_name} scores: {e}", file=sys.stderr)
    return result


def fetch_global_mmlu_scores() -> dict[str, tuple[float, str]]:
    """Fetch Global-MMLU scores from llmdb.com. Coverage is genuinely sparse (~2 models)."""
    return _fetch_llmdb_leaderboard(
        GLOBAL_MMLU_URL,
        "Global-MMLU",
        "Global-MMLU (llmdb.com): {score}%.",
        extra_slug_map={"gemma-3": "google/gemma-3-27b-it"},
    )


def _fetch_llmdb_math_benchmark(
    url: str, benchmark_name: str, evidence_template: str
) -> dict[str, tuple[float, str]]:
    """Fetch MATH, GSM8K, or AIME scores from llmdb.com. Returns model_id -> (score, evidence)."""
    return _fetch_llmdb_leaderboard(
        url, benchmark_name, evidence_template, extra_slug_map=MATH_SLUG_TO_MODEL_ID
    )


def fetch_math_scores() -> dict[str, tuple[float, str]]:
    """Fetch math benchmark scores. MATH first, then AIME-2025, then GSM8K.

    MATH/GSM8K on llmdb list older generations; AIME-2025 adds current registry models.
    """
    math_scores = _fetch_llmdb_math_benchmark(MATH_URL, "MATH", "MATH (llmdb.com): {score}%.")
    aime_scores = _fetch_llmdb_math_benchmark(
        AIME_2025_URL, "AIME-2025", "AIME-2025 (llmdb.com): {score}%."
    )
    gsm8k_scores = _fetch_llmdb_math_benchmark(GSM8K_URL, "GSM8K", "GSM8K (llmdb.com): {score}%.")
    merged: dict[str, tuple[float, str]] = dict(math_scores)
    for mid, (score, evidence) in aime_scores.items():
        if mid not in merged:
            merged[mid] = (score, evidence)
    for mid, (score, evidence) in gsm8k_scores.items():
        if mid not in merged and score >= MATH_MIN_GSM8K:
            merged[mid] = (score, evidence)
    return merged


def _normalize_lmspeed_name(name: str) -> str:
    """Normalize LMSpeed model names for matching against registry model IDs.

    Strips common prefixes/suffixes added by LMSpeed (self-, date stamps, API slugs)
    and normalizes separators so that e.g. 'claude-haiku-4-5-20251001' matches
    'claude haiku 4.5'.
    """
    s = name.strip()
    s = re.sub(r"^self-", "", s, flags=re.I)
    # Remove date suffixes like -20251001
    s = re.sub(r"-\d{8,}$", "", s)
    # Remove provider prefix if present (e.g. "Qwen/Qwen3..." -> "Qwen3...")
    if "/" in s:
        s = s.split("/", 1)[-1]
    return _normalize_name_for_match(s)


# Explicit LMSpeed display name -> registry model_id overrides for names
# that automated matching can't resolve.
LMSPEED_NAME_TO_MODEL_ID: dict[str, str] = {
    "claude-haiku-4-5-20251001": "anthropic/claude-haiku-4.5",
}


def _match_lmspeed_name(
    model_name: str,
    model_id_to_name: dict[str, str],
    name_to_model_id: dict[str, str],
    slug_to_model_id: dict[str, str],
) -> str | None:
    mid = LMSPEED_NAME_TO_MODEL_ID.get(model_name)
    if mid:
        return mid
    norm = _normalize_lmspeed_name(model_name)
    mid = name_to_model_id.get(norm) or slug_to_model_id.get(norm)
    if mid:
        return mid
    for pid, n in model_id_to_name.items():
        if _normalize_name_for_match(n) == norm:
            return pid
    return None


def _parse_lmspeed_html_table(html: str) -> dict[str, float]:
    """Parse the model-speed HTML table (Rank | Model | Output Speed)."""
    soup = BeautifulSoup(html, "html.parser")
    best_by_name: dict[str, float] = {}
    for table in soup.find_all("table"):
        for row in table.find_all("tr"):
            cells = row.find_all(["td", "th"])
            if len(cells) < 3:
                continue
            texts = [c.get_text(" ", strip=True) for c in cells]
            joined = " ".join(texts)
            tps_match = re.search(r"(\d+\.?\d*)\s*(?:t/s|tok/s|tokens?/s)", joined, re.I)
            if not tps_match:
                continue
            try:
                tps = float(tps_match.group(1))
            except ValueError:
                continue
            model_name = texts[1].strip()
            # Cell sometimes concatenates display name + slug (gpt-oss-120bgpt-oss-120b)
            slug_el = cells[1].find("span") or cells[1].find("code")
            if slug_el:
                model_name = slug_el.get_text(strip=True) or model_name
            if not model_name or model_name.lower() in {"model", "rank"}:
                continue
            if model_name not in best_by_name or tps > best_by_name[model_name]:
                best_by_name[model_name] = tps
    return best_by_name


def _parse_lmspeed_rsc(text: str) -> dict[str, float]:
    """Parse the legacy weekly RSC stream (unofficial per-endpoint throughputs)."""
    unesc = text.replace('\\"', '"')
    row_pattern = re.compile(
        r'"tr","([^"]+?)-https?://[^"]+?".*?'
        r'font-mono text-concrete-600[^"]*"[^}]*"children":"([^"]+)".*?'
        r'font-mono text-concrete-900"[^}]*"children":\["(\d+\.?\d*)"',
        re.DOTALL,
    )
    best_by_name: dict[str, float] = {}
    for m in row_pattern.finditer(unesc):
        model_name = m.group(2).strip()
        try:
            tps = float(m.group(3))
        except ValueError:
            continue
        if model_name not in best_by_name or tps > best_by_name[model_name]:
            best_by_name[model_name] = tps
    return best_by_name


def fetch_lmspeed_scores() -> dict[str, tuple[float, str]]:
    """Fetch LMSpeed throughput (tokens/sec). Returns model_id -> (tps, evidence).

    The weekly/monthly endpoint leaderboards are frequently empty and previously
    produced implausible values (Sonnet 4.6 at 13,496 t/s from unofficial proxies).
    Prefer /leaderboard/model-speed (one Benchize/AA row per model). Cloudflare
    may still 403 datacenter IPs; the source-health guard keeps prior data then.
    """
    model_id_to_name = get_model_id_to_name_map()
    name_to_model_id = {_normalize_name_for_match(n): mid for mid, n in model_id_to_name.items()}
    slug_to_model_id: dict[str, str] = {}
    for mid in model_id_to_name:
        parts = mid.split("/")
        if len(parts) == 2:
            slug_to_model_id[_normalize_name_for_match(parts[1])] = mid

    result: dict[str, tuple[float, str]] = {}
    try:
        best_by_name: dict[str, float] = {}
        for url in (LMSPEED_URL, LMSPEED_MONTHLY_URL, LMSPEED_WEEKLY_URL):
            try:
                resp = _http_get(url, timeout=15.0)
            except Exception as e:
                print(f"Warning: LMSpeed request failed for {url}: {e}", file=sys.stderr)
                continue
            if resp.status_code != 200:
                print(
                    f"Warning: LMSpeed {url} returned HTTP {resp.status_code}.",
                    file=sys.stderr,
                )
                continue
            parsed = _parse_lmspeed_html_table(resp.text)
            if not parsed:
                parsed = _parse_lmspeed_rsc(resp.text)
            for name, tps in parsed.items():
                if name not in best_by_name or tps > best_by_name[name]:
                    best_by_name[name] = tps
            if best_by_name:
                break

        for model_name, tps in best_by_name.items():
            if not is_plausible_score("fast", tps):
                print(
                    f"ERROR: [fast] rejected implausible LMSpeed t/s {tps} for {model_name}",
                    file=sys.stderr,
                )
                continue
            mid = _match_lmspeed_name(
                model_name, model_id_to_name, name_to_model_id, slug_to_model_id
            )
            if mid:
                result[mid] = (tps, f"LMSpeed (lmspeed.net): {tps:.0f} t/s.")
    except Exception as e:
        print(f"Warning: Could not fetch LMSpeed scores: {e}", file=sys.stderr)
    return result


# Scale Labs leaderboard slug -> OpenRouter registry model_id (public SWE-Bench Pro split).
SWE_BENCH_PRO_SLUG_TO_MODEL_ID: dict[str, str] = {
    # Explicit rows where leaderboard label does not normalize to registry display name
    "claude-opus-4-6 (thinking)*": "anthropic/claude-opus-4.6",
    "gemini-3.1-pro (thinking)*": "google/gemini-3.1-pro-preview",
    "gemini-3-pro-preview": "google/gemini-3.1-pro-preview",
    "gpt-5-2025-08-07 (High)": "openai/gpt-5",
    "claude-4-5-haiku": "anthropic/claude-haiku-4.5",
    "qwen3-coder-480b-a35b": "qwen/qwen3-coder",
    "minimax-2.1": "minimax/minimax-m2.5",
    "gemini-3-flash": "google/gemini-3-flash-preview",
    "gpt-5.2": "openai/gpt-5.2",
    "gpt-oss-120b": "openai/gpt-oss-120b",
    "claude-opus-5 (thinking)*": "anthropic/claude-opus-5",
    "claude-opus-5": "anthropic/claude-opus-5",
    "gpt-5.6-sol": "openai/gpt-5.6-sol",
    "grok-4.5": "x-ai/grok-4.5",
    "kimi-k3": "moonshotai/kimi-k3",
    "llama4-maverick-17b-instruct": "meta-llama/llama-4-maverick",
    "glm-4.6": "z-ai/glm-5",
    "codestral-2405": "mistralai/codestral-2508",
}

# RSC-embedded JSON on labs.scale.com leaderboard pages
_SWE_BENCH_PRO_ENTRY_RE = re.compile(
    r'\\"model\\":\\"((?:[^"\\]|\\\\.)*)\\",\\"version\\":\\"[^"]*\\",\\"rank\\":\d+,\\"score\\":(\d+\.?\d*)'
)


def _swe_bench_pro_evidence(score: float) -> str:
    return f"SWE-Bench Pro public (Scale Labs): {score:.2f}%."


def _merge_swe_bench_pro_row(
    result: dict[str, tuple[float, str]],
    slug: str,
    score: float,
    model_id_to_name: dict[str, str],
) -> None:
    """Map leaderboard slug to registry model_id and keep best score per model."""
    mid = SWE_BENCH_PRO_SLUG_TO_MODEL_ID.get(slug)
    if not mid:
        base = slug.split("(")[0].strip().rstrip("*").strip()
        base = _expand_hyphenated_minor_versions(base)
        norm = _normalize_name_for_match(base)
        name_to_model_id = {_normalize_name_for_match(n): m for m, n in model_id_to_name.items()}
        mid = name_to_model_id.get(norm)
    if not mid:
        return
    evidence = _swe_bench_pro_evidence(score)
    if mid not in result or score > result[mid][0]:
        result[mid] = (score, evidence)


def fetch_swe_bench_pro_scores() -> dict[str, tuple[float, str]]:
    """Fetch SWE-Bench Pro (public) scores from Scale Labs leaderboard.

    Parses RSC-payload JSON embedded in the Next.js page. Falls back to the
    static GitHub Pages mirror if the primary page returns no entries.

    Returns model_id -> (score, evidence).
    """
    model_id_to_name = get_model_id_to_name_map()

    result: dict[str, tuple[float, str]] = {}
    try:
        resp = httpx.get(
            SWE_BENCH_PRO_URL,
            timeout=20.0,
            follow_redirects=True,
            headers={"User-Agent": "Mozilla/5.0 (compatible; CompareIntel/1.0)"},
        )
        if resp.status_code == 200:
            for slug, score_s in _SWE_BENCH_PRO_ENTRY_RE.findall(resp.text):
                try:
                    score = float(score_s)
                except ValueError:
                    continue
                slug = slug.replace("\\/", "/")
                _merge_swe_bench_pro_row(result, slug, score, model_id_to_name)
    except Exception as e:
        print(f"Warning: Could not fetch SWE-Bench Pro (labs): {e}", file=sys.stderr)

    if result:
        return result

    try:
        resp = httpx.get(
            SWE_BENCH_PRO_FALLBACK_URL,
            timeout=15.0,
            follow_redirects=True,
            headers={"User-Agent": "Mozilla/5.0 (compatible; CompareIntel/1.0)"},
        )
        if resp.status_code != 200:
            return result
        soup = BeautifulSoup(resp.text, "html.parser")
        for row in soup.select("#leaderboardTable tbody tr[data-score]"):
            try:
                score = float(row.get("data-score", ""))
            except ValueError:
                continue
            name_el = row.select_one(".model-name")
            if not name_el:
                continue
            raw = name_el.get_text(strip=True)
            slug = re.sub(r"^SWE-Agent\s*\+\s*", "", raw, flags=re.I).strip()
            _merge_swe_bench_pro_row(result, slug, score, model_id_to_name)
    except Exception as e:
        print(f"Warning: Could not fetch SWE-Bench Pro (fallback): {e}", file=sys.stderr)
    return result


MMLU_PRO_NAME_TO_MODEL_ID: dict[str, str] = {
    "Gemini 3 Pro": "google/gemini-3.1-pro-preview",
    "Qwen 3.5": "qwen/qwen3.5-397b-a17b",
    "Claude Opus 5": "anthropic/claude-opus-5",
    "GPT-5.6 Sol": "openai/gpt-5.6-sol",
    "Grok 4.5": "x-ai/grok-4.5",
    "Kimi K3": "moonshotai/kimi-k3",
}


def fetch_mmlu_pro_scores() -> dict[str, tuple[float, str]]:
    """Fetch MMLU-Pro scores from awesomeagents.ai. Returns model_id -> (score, evidence)."""
    model_id_to_name = get_model_id_to_name_map()
    name_to_model_id = {_normalize_name_for_match(n): mid for mid, n in model_id_to_name.items()}

    result: dict[str, tuple[float, str]] = {}
    try:
        resp = httpx.get(MMLU_PRO_URL, timeout=15.0, follow_redirects=True)
        if resp.status_code != 200:
            return result
        soup = BeautifulSoup(resp.text, "html.parser")
        table = soup.find("table")
        if not table:
            return result
        for row in table.find_all("tr"):
            cells = row.find_all("td")
            if len(cells) < 4:
                continue
            model_name = cells[1].get_text(strip=True)
            score_text = cells[3].get_text(strip=True).rstrip("%")
            try:
                score = float(score_text)
            except ValueError:
                continue
            mid = MMLU_PRO_NAME_TO_MODEL_ID.get(model_name)
            if not mid:
                norm = _normalize_name_for_match(model_name)
                mid = name_to_model_id.get(norm)
            if mid:
                result[mid] = (score, f"MMLU-Pro (awesomeagents.ai): {score}%.")
    except Exception as e:
        print(f"Warning: Could not fetch MMLU-Pro scores: {e}", file=sys.stderr)
    return result


WRITING_NAME_TO_MODEL_ID: dict[str, str] = {
    "Claude Opus 4 6": "anthropic/claude-opus-4.6",
    "Gpt 4.5 Preview 2025 02 27": "openai/gpt-4o",
    "Chatgpt 4o Latest 20250326": "openai/gpt-4o",
    "Grok 4 1 Fast Reasoning": "x-ai/grok-4.20",
    "Grok 4.1 Thinking": "x-ai/grok-4.20",
    "Grok 4.1": "x-ai/grok-4.20",
    "Grok 3 Preview 02 24": "x-ai/grok-3-mini",
    "Gemini 3 Pro": "google/gemini-3.1-pro-preview",
    "Gemini 3 Flash": "google/gemini-3-flash-preview",
    "Gemini 3 Flash (thinking Minimal)": "google/gemini-3-flash-preview",
    "Gpt 4.1 2025 04 14": "openai/gpt-4o",
    "Claude Opus 5": "anthropic/claude-opus-5",
    "Gpt 5.6 Sol": "openai/gpt-5.6-sol",
    "Grok 4.5": "x-ai/grok-4.5",
    "Kimi K3": "moonshotai/kimi-k3",
}

WRITING_MIN_ELO = 1390
# Vision Arena scores use Bradley-Terry ratings (~880–1320 on lmarena.ai).
VISION_MIN_ARENA = 1060.0

# LMArena Vision Arena: leaderboard slug -> registry model_id
VISION_ARENA_SLUG_TO_MODEL_ID: dict[str, str] = {
    "chatgpt-4o-latest-20250326": "openai/gpt-4o",
    "gpt-4o": "openai/gpt-4o",
    "gpt-4o-2024-05-13": "openai/gpt-4o",
    "gpt-4o-mini": "openai/gpt-4o-mini",
    "gpt-4o-mini-2024-07-18": "openai/gpt-4o-mini",
    "gpt-5-chat-latest": "openai/gpt-5-chat",
    "gpt-5.2-chat-latest-20260210": "openai/gpt-5.2",
    "gpt-5.2-high": "openai/gpt-5.2",
    "gpt-5.5-high": "openai/gpt-5.5",
    "gpt-5.5-instant": "openai/gpt-5.5",
    "claude-opus-4-6": "anthropic/claude-opus-4.6",
    "claude-opus-4-6-thinking": "anthropic/claude-opus-4.6",
    "claude-opus-5": "anthropic/claude-opus-5",
    "claude-opus-5-thinking": "anthropic/claude-opus-5",
    "claude-sonnet-4-6": "anthropic/claude-sonnet-4.6",
    "gpt-5.6-sol": "openai/gpt-5.6-sol",
    "gpt-5.6-sol-high": "openai/gpt-5.6-sol",
    "grok-4.5": "x-ai/grok-4.5",
    "kimi-k3": "moonshotai/kimi-k3",
    "gemini-3-pro": "google/gemini-3.1-pro-preview",
    "gemini-3.1-pro-preview": "google/gemini-3.1-pro-preview",
    "gemini-3-flash": "google/gemini-3-flash-preview",
    "gemini-3-flash (thinking-minimal)": "google/gemini-3-flash-preview",
    "gemini-2.5-pro": "google/gemini-2.5-pro",
    "gemini-2.5-flash": "google/gemini-2.5-flash",
    "gemini-2.5-flash-preview-09-2025": "google/gemini-2.5-flash",
    "grok-4.20-beta-0309-reasoning": "x-ai/grok-4.20",
    "grok-4.20-multi-agent-beta-0309": "x-ai/grok-4.20",
    "grok-4.1-thinking": "x-ai/grok-4.20",
    "mistral-medium-2505": "mistralai/mistral-medium-3.1",
    "mistral-medium-3.1": "mistralai/mistral-medium-3.1",
    "pixtral-large-2411": "mistralai/mistral-medium-3.1",
    "qwen3.5-397b-a17b": "qwen/qwen3.5-397b-a17b",
    "qwen3-vl-235b-a22b-thinking": "qwen/qwen3-vl-235b-a22b-thinking",
    "qwen3-vl-235b-a22b-instruct": "qwen/qwen3-vl-235b-a22b-instruct",
}


def _vision_arena_evidence(score: float) -> str:
    return f"Vision Arena (lmarena.ai): {int(round(score))}."


def fetch_vision_arena_scores() -> dict[str, tuple[float, str]]:
    """Fetch Vision Arena scores from lmarena-ai/leaderboard-dataset (Hugging Face).

    Uses the official LMArena vision subset (latest split, overall category).
    Keeps the best score per registry model when multiple arena variants exist.
    """
    registry_ids = set(get_model_id_to_name_map().keys())
    model_id_to_name = get_model_id_to_name_map()
    name_to_model_id = {_normalize_name_for_match(n): mid for mid, n in model_id_to_name.items()}
    slug_to_model_id: dict[str, str] = {}
    for mid in model_id_to_name:
        parts = mid.split("/")
        if len(parts) == 2:
            slug_to_model_id[parts[1].replace(".", "-")] = mid
    for slug, mid in VISION_ARENA_SLUG_TO_MODEL_ID.items():
        slug_to_model_id[slug] = mid

    result: dict[str, tuple[float, str]] = {}
    try:
        offset = 0
        page_size = 100
        while True:
            resp = httpx.get(
                VISION_ARENA_DATASET_ROWS_URL,
                params={
                    "dataset": "lmarena-ai/leaderboard-dataset",
                    "config": "vision",
                    "split": "latest",
                    "offset": offset,
                    "length": page_size,
                },
                timeout=20.0,
            )
            if resp.status_code != 200:
                break
            data = resp.json()
            rows = data.get("rows") or []
            for item in rows:
                row = item.get("row") or {}
                if row.get("category") != "overall":
                    continue
                slug = row.get("model_name", "")
                try:
                    rating = float(row.get("rating", 0))
                except (ValueError, TypeError):
                    continue
                if rating < VISION_MIN_ARENA:
                    continue
                mid = VISION_ARENA_SLUG_TO_MODEL_ID.get(slug)
                if not mid:
                    base = slug.split("(")[0].strip().rstrip("*").strip()
                    base = _expand_hyphenated_minor_versions(base)
                    mid = slug_to_model_id.get(base)
                if not mid:
                    norm = _normalize_name_for_match(base.replace("-", " "))
                    mid = name_to_model_id.get(norm)
                if mid and mid in registry_ids:
                    evidence = _vision_arena_evidence(rating)
                    if mid not in result or rating > result[mid][0]:
                        result[mid] = (rating, evidence)
            total = data.get("num_rows_total", 0)
            offset += len(rows)
            if offset >= total or not rows:
                break
    except Exception as e:
        print(f"Warning: Could not fetch Vision Arena scores: {e}", file=sys.stderr)
    return result


# KEAR AI Text-to-Image Arena: leaderboard model name/slug -> registry model_id
TEXT_TO_IMAGE_NAME_TO_MODEL_ID: dict[str, str] = {
    "gemini-2.5-flash-image-preview": "google/gemini-2.5-flash-image",
    "gemini-2.5-flash-image": "google/gemini-2.5-flash-image",
    "gemini-3-pro-image-preview": "google/gemini-3-pro-image",
    "gemini-3-pro-image-preview-2k": "google/gemini-3-pro-image",
    "gemini-3.1-flash-image-preview": "google/gemini-3.1-flash-image",
    "flux-2-max": "black-forest-labs/flux.2-max",
    "flux-2-pro": "black-forest-labs/flux.2-pro",
    "flux-2-flex": "black-forest-labs/flux.2-flex",
    "flux-2-klein-4b": "black-forest-labs/flux.2-klein-4b",
    "seedream-4.5": "bytedance-seed/seedream-4.5",
    "seedream-5.0-flash": "bytedance-seed/seedream-5-0-flash",
    "flux-3-image": "black-forest-labs/flux-3-image",
    "gpt-image-2.5-sunburst": "openai/gpt-image-2.5-sunburst",
    "nano-banana-2.1": "google/gemini-nano-banana-2.1",
    "gemini-nano-banana-2.1": "google/gemini-nano-banana-2.1",
    "gemini-3-pro-image": "google/gemini-3-pro-image",
    "gemini-3.1-flash-image": "google/gemini-3.1-flash-image",
    "riverflow-v2-standard-preview": "sourceful/riverflow-v2-standard-preview",
    "riverflow-v2-fast-preview": "sourceful/riverflow-v2-fast-preview",
    "riverflow-v2-pro": "sourceful/riverflow-v2-pro",
    "gpt-image-1.5-high-fidelity": "openai/gpt-5-image",
    "gpt-image-1": "openai/gpt-5-image",
    "gpt-image-1-mini": "openai/gpt-5-image-mini",
    "gpt-image-2.5 sunburst": "openai/gpt-image-2.5-sunburst",
    "gemini nano banana 2.1": "google/gemini-nano-banana-2.1",
    "gemini 3.1 flash image": "google/gemini-3.1-flash-image",
    "gemini 3 pro image": "google/gemini-3-pro-image",
    "gpt-image-1.5 (high fidelity)": "openai/gpt-5-image",
    "flux.2 [max]": "black-forest-labs/flux.2-max",
    "flux.2 [flex]": "black-forest-labs/flux.2-flex",
    "flux.2 [pro]": "black-forest-labs/flux.2-pro",
    "flux.2 [klein-4b]": "black-forest-labs/flux.2-klein-4b",
    "seedream 4.5": "bytedance-seed/seedream-4.5",
    "gemini 2.5 flash image preview": "google/gemini-2.5-flash-image",
}


def _match_text_to_image_name(model_name: str, name_to_model_id: dict[str, str]) -> str | None:
    raw = model_name.strip()
    slug = re.sub(r"\s+\([^)]+\)\s*$", "", raw).strip().lower().replace(" ", "-")
    mid = TEXT_TO_IMAGE_NAME_TO_MODEL_ID.get(slug) or TEXT_TO_IMAGE_NAME_TO_MODEL_ID.get(
        raw.lower()
    )
    if mid:
        return mid
    norm = _normalize_name_for_match(re.sub(r"\s+\([^)]+\)", "", raw))
    mid = name_to_model_id.get(norm) or TEXT_TO_IMAGE_NAME_TO_MODEL_ID.get(norm)
    if mid:
        return mid
    # HF display names like "FLUX.2 [max]" / "Gemini 3 Pro Image (nano-banana-pro, 2K)"
    compact = _normalize_name_for_match(re.sub(r"[\[\](),]", " ", raw))
    return TEXT_TO_IMAGE_NAME_TO_MODEL_ID.get(compact) or name_to_model_id.get(compact)


def _fetch_text_to_image_from_html(html: str) -> dict[str, tuple[float, str]]:
    model_id_to_name = get_model_id_to_name_map()
    name_to_model_id = {_normalize_name_for_match(n): mid for mid, n in model_id_to_name.items()}
    result: dict[str, tuple[float, str]] = {}
    soup = BeautifulSoup(html, "html.parser")
    table = soup.find("table")
    if not table:
        for m in re.finditer(
            r"\[([a-zA-Z0-9.-]+)(?:\s+\([^)]+\))?\]\([^)]+\)\s*\|\s*(\d+)",
            html,
        ):
            model_slug = m.group(1).strip().lower()
            try:
                rating = int(m.group(2))
            except ValueError:
                continue
            if rating < 900:
                continue
            mid = _match_text_to_image_name(model_slug, name_to_model_id)
            if mid and (mid not in result or rating > result[mid][0]):
                result[mid] = (
                    float(rating),
                    f"Text-to-Image Arena (kearai.com): {rating}.",
                )
        return result
    for row in table.find_all("tr"):
        cells = row.find_all("td")
        if len(cells) < 3:
            continue
        model_cell = cells[1]
        link = model_cell.find("a")
        model_slug = link.get_text(strip=True) if link else model_cell.get_text(strip=True)
        score_el = cells[2].find(class_="score-val") or cells[2]
        try:
            rating = float(score_el.get_text(strip=True).replace(",", ""))
        except ValueError:
            continue
        if rating < 900:
            continue
        mid = _match_text_to_image_name(model_slug, name_to_model_id)
        if mid and (mid not in result or rating > result[mid][0]):
            result[mid] = (
                float(rating),
                f"Text-to-Image Arena (kearai.com): {int(rating)}.",
            )
    return result


def _fetch_text_to_image_from_hf() -> dict[str, tuple[float, str]]:
    """Official LMArena text-to-image leaderboard (Hugging Face dataset)."""
    model_id_to_name = get_model_id_to_name_map()
    name_to_model_id = {_normalize_name_for_match(n): mid for mid, n in model_id_to_name.items()}
    registry_ids = set(model_id_to_name)
    result: dict[str, tuple[float, str]] = {}
    offset = 0
    page_size = 100
    while True:
        resp = _http_get(
            VISION_ARENA_DATASET_ROWS_URL,
            params={
                "dataset": "lmarena-ai/leaderboard-dataset",
                "config": "text_to_image",
                "split": "latest",
                "offset": offset,
                "length": page_size,
            },
            timeout=20.0,
        )
        if resp.status_code != 200:
            break
        data = resp.json()
        rows = data.get("rows") or []
        for item in rows:
            row = item.get("row") or {}
            if row.get("category") not in (None, "overall", "text_to_image"):
                continue
            name = row.get("model_name") or ""
            try:
                rating = float(row.get("rating", 0))
            except (ValueError, TypeError):
                continue
            if rating < 900:
                continue
            mid = _match_text_to_image_name(name, name_to_model_id)
            if mid and mid in registry_ids:
                evidence = f"Text-to-Image Arena (lmarena.ai): {int(round(rating))}."
                if mid not in result or rating > result[mid][0]:
                    result[mid] = (rating, evidence)
        total = data.get("num_rows_total", 0)
        offset += len(rows)
        if offset >= total or not rows:
            break
    return result


def fetch_text_to_image_arena_scores() -> dict[str, tuple[float, str]]:
    """Fetch Text-to-Image Arena scores. kearai.com 404'd; prefer LMArena HF, then blog.kearai.com."""
    result: dict[str, tuple[float, str]] = {}
    try:
        result = _fetch_text_to_image_from_hf()
        if result:
            return result
    except Exception as e:
        print(
            f"Warning: Could not fetch Text-to-Image Arena from Hugging Face: {e}", file=sys.stderr
        )

    for url in TEXT_TO_IMAGE_ARENA_URLS:
        try:
            resp = _http_get(url, timeout=15.0)
            if resp.status_code != 200:
                print(
                    f"Warning: Text-to-Image Arena {url} returned HTTP {resp.status_code}.",
                    file=sys.stderr,
                )
                continue
            result = _fetch_text_to_image_from_html(resp.text)
            if result:
                return result
        except Exception as e:
            print(f"Warning: Could not fetch Text-to-Image Arena from {url}: {e}", file=sys.stderr)
    return result


def fetch_creative_writing_scores() -> dict[str, tuple[float, str]]:
    """Fetch Creative Writing Arena Elo. kearai.com 404'd; use blog.kearai.com snapshot.

    The live equivalent is arena.ai/leaderboard/chat/text/creative-writing (JS-rendered).
    Takes the best Elo for each registry model when multiple variants exist.
    """
    model_id_to_name = get_model_id_to_name_map()
    name_to_model_id = {_normalize_name_for_match(n): mid for mid, n in model_id_to_name.items()}

    result: dict[str, tuple[float, str]] = {}
    for url in CREATIVE_WRITING_URLS:
        try:
            resp = _http_get(url, timeout=15.0)
            if resp.status_code != 200:
                print(
                    f"Warning: Creative Writing Arena {url} returned HTTP {resp.status_code}.",
                    file=sys.stderr,
                )
                continue
            soup = BeautifulSoup(resp.text, "html.parser")
            table = soup.find("table")
            if not table:
                continue
            for row in table.find_all("tr"):
                cells = row.find_all("td")
                if len(cells) < 3:
                    continue
                model_name = cells[1].get_text(strip=True)
                score_el = cells[2].find(class_="score-val") or cells[2]
                score_text = score_el.get_text(strip=True).replace(",", "")
                try:
                    elo = float(score_text)
                except ValueError:
                    continue
                if elo < 1000:
                    continue
                mid = WRITING_NAME_TO_MODEL_ID.get(model_name)
                if not mid:
                    mid = name_to_model_id.get(_normalize_name_for_match(model_name))
                if mid and (mid not in result or elo > result[mid][0]):
                    result[mid] = (elo, f"Creative Writing Arena (kearai.com): {elo:.0f} Elo.")
            if result:
                return result
        except Exception as e:
            print(
                f"Warning: Could not fetch Creative Writing scores from {url}: {e}", file=sys.stderr
            )
    return result


MRCR_NAME_TO_MODEL_ID: dict[str, str] = {
    "Gemini 2.0 Flash": "google/gemini-2.5-flash",
    "Gemini 2.0 Pro": "google/gemini-2.5-pro",
    "Gemini 2.0 Flash-Lite": "google/gemini-2.5-flash",
}

# Awesome Agents long-context: model display name -> registry model_id
AWESOME_AGENTS_LONG_CONTEXT_NAME_TO_MODEL_ID: dict[str, str] = {
    "Gemini 3 Pro": "google/gemini-3.1-pro-preview",
    "Claude Opus 4.6": "anthropic/claude-opus-4.6",
    "GPT-5.2": "openai/gpt-5.2",
    "Claude Sonnet 4.6": "anthropic/claude-sonnet-4.6",
    "Llama 4 Scout": "meta-llama/llama-4-scout",
    "Claude Opus 5": "anthropic/claude-opus-5",
    "GPT-5.6 Sol": "openai/gpt-5.6-sol",
    "Grok 4.5": "x-ai/grok-4.5",
    "Kimi K3": "moonshotai/kimi-k3",
    "GPT-4.1": "openai/gpt-4o",  # GPT-4.1 maps to gpt-4o in registry
}


def _parse_percentage_from_cell(text: str) -> float | None:
    """Extract best numeric percentage from cell (e.g. '76%', '~85%', '26.3% (1M) / 77% (128K)')."""
    if not text or text.strip() == "-":
        return None
    # Match XX.X% or XX% patterns, take the highest
    matches = re.findall(r"~?(\d+\.?\d*)\s*%", text.strip())
    if not matches:
        return None
    try:
        return max(float(m) for m in matches)
    except ValueError:
        return None


def fetch_awesome_agents_long_context_scores() -> dict[str, tuple[float, str]]:
    """Fetch MRCR v2 and LongBench v2 scores from Awesome Agents. Returns model_id -> (score, evidence).

    Table columns: Rank | Model | MRCR v2 (8-needle, 1M) | MRCR v2 (4-needle, 256K) | LongBench v2 | ...
    Uses best available score. Prefers MRCR 8-needle 1M for evidence when tied.
    """
    model_id_to_name = get_model_id_to_name_map()
    name_to_model_id = {_normalize_name_for_match(n): mid for mid, n in model_id_to_name.items()}

    result: dict[str, tuple[float, str]] = {}
    try:
        resp = httpx.get(AWESOME_AGENTS_LONG_CONTEXT_URL, timeout=15.0, follow_redirects=True)
        if resp.status_code != 200:
            return result
        soup = BeautifulSoup(resp.text, "html.parser")
        tables = soup.find_all("table")
        if not tables:
            return result
        # First table is the long-context rankings
        for row in tables[0].find_all("tr")[1:]:  # skip header
            cells = row.find_all("td")
            if len(cells) < 7:
                continue
            model_name = cells[1].get_text(strip=True)
            mrcr_1m_raw = cells[4].get_text(strip=True)
            mrcr_256k_raw = cells[5].get_text(strip=True)
            longbench_raw = cells[6].get_text(strip=True)

            mrcr_1m = _parse_percentage_from_cell(mrcr_1m_raw)
            mrcr_256k = _parse_percentage_from_cell(mrcr_256k_raw)
            longbench = _parse_percentage_from_cell(longbench_raw)

            scores: list[tuple[float, str]] = []
            if mrcr_1m is not None:
                scores.append((mrcr_1m, f"MRCR v2 8-needle 1M (awesomeagents.ai): {mrcr_1m}%."))
            if mrcr_256k is not None:
                scores.append(
                    (mrcr_256k, f"MRCR v2 4-needle 256K (awesomeagents.ai): {mrcr_256k:.0f}%.")
                )
            if longbench is not None:
                scores.append((longbench, f"LongBench v2 (awesomeagents.ai): {longbench}%."))

            if not scores:
                continue

            best_score, best_evidence = max(scores, key=lambda x: x[0])
            if best_score < 30:
                continue
            mid = AWESOME_AGENTS_LONG_CONTEXT_NAME_TO_MODEL_ID.get(model_name)
            if not mid:
                norm = _normalize_name_for_match(model_name)
                mid = name_to_model_id.get(norm)
            if mid:
                if mid not in result or best_score > result[mid][0]:
                    result[mid] = (best_score, best_evidence)
    except Exception as e:
        print(f"Warning: Could not fetch Awesome Agents long-context scores: {e}", file=sys.stderr)
    return result


def merge_long_context_scores(
    mrcr_scores: dict[str, tuple[float, str]],
    awesome_agents_scores: dict[str, tuple[float, str]],
) -> dict[str, tuple[float, str]]:
    """Merge MRCR 1M (primary) with Awesome Agents (MRCR v2, LongBench v2). MRCR 1M wins on overlap."""
    merged: dict[str, tuple[float, str]] = dict(mrcr_scores)
    for mid, (score, evidence) in awesome_agents_scores.items():
        if mid not in merged and score >= LONG_CONTEXT_MIN_MRCR:
            merged[mid] = (score, evidence)
    return merged


def fetch_mrcr_scores() -> dict[str, tuple[float, str]]:
    """Fetch MRCR 1M scores from llmdb.com. Coverage is genuinely sparse (~7 models)."""
    return _fetch_llmdb_leaderboard(
        MRCR_URL,
        "MRCR 1M",
        "MRCR 1M (llmdb.com): {score}/100.",
        extra_name_map=MRCR_NAME_TO_MODEL_ID,
    )


def sort_category_by_scores(
    category: dict,
    fetched_scores: dict[str, tuple[float, str]] | None,
) -> None:
    """Sort category models by benchmark score. Best first (descending by default).
    For cost-effective, lower is better (ascending). Mutates category in place."""
    cat_id = category["id"]
    ascending = cat_id in SORT_ASCENDING_CATEGORIES

    def sort_key(model: dict) -> tuple[float, bool]:
        mid = model["modelId"]
        score: float | None = None
        if fetched_scores and mid in fetched_scores:
            score = fetched_scores[mid][0]
        if score is None:
            score = extract_primary_score(cat_id, model["evidence"])
        has_score = score is not None
        val = score or 0
        # For ascending (cost-effective): lower first, so use (val, not has_score)
        # For descending: higher first, so use (-val, not has_score)
        return (val if ascending else -val, not has_score)

    category["models"].sort(key=sort_key)


def load_registry() -> dict:
    with open(REGISTRY_PATH, encoding="utf-8") as f:
        return json.load(f)


def get_model_from_registry(model_id: str) -> dict | None:
    registry = load_registry()
    for provider_models in registry["models_by_provider"].values():
        for m in provider_models:
            if m["id"] == model_id:
                return m
    return None


def get_lineup_model_ids(registry: dict | None = None) -> set[str]:
    """Active CompareIntel lineup: IDs in models_registry.json models_by_provider.

    The frontend loads this same catalog via GET /models. Tier allow-lists
    (unregistered_tier_models, free_tier_additional_models) are subsets, not
    a second lineup.
    """
    data = registry if registry is not None else load_registry()
    ids: set[str] = set()
    for models in data.get("models_by_provider", {}).values():
        if not isinstance(models, list):
            continue
        for m in models:
            if isinstance(m, dict) and (mid := m.get("id")):
                ids.add(str(mid))
    return ids


def collect_ranked_model_ids(categories: list[dict]) -> set[str]:
    """Unique model IDs currently ranked in Help Me Choose."""
    ids: set[str] = set()
    for cat in categories:
        for m in cat.get("models", []):
            if mid := m.get("modelId"):
                ids.add(str(mid))
    return ids


def drop_rankings_not_in_lineup(
    categories: list[dict],
    lineup_ids: set[str],
) -> dict[str, list[str]]:
    """Remove Help Me Choose rows whose model is not in the active lineup.

    Returns category_id -> removed model IDs.
    """
    removed: dict[str, list[str]] = {}
    for cat in categories:
        kept: list[dict] = []
        for m in cat["models"]:
            mid = m["modelId"]
            if mid in lineup_ids:
                kept.append(m)
            else:
                removed.setdefault(cat["id"], []).append(mid)
                print(
                    f"  - {mid} [{cat['id']}]: dropped (not in active model lineup)",
                    file=sys.stderr,
                )
        cat["models"] = kept
    return removed


def report_lineup_models_without_rankings(
    lineup_ids: set[str],
    categories: list[dict],
) -> list[str]:
    """Print lineup models that have no Help Me Choose ranking. Not an error."""
    missing = sorted(lineup_ids - collect_ranked_model_ids(categories))
    if missing:
        print(
            f"Lineup models with no Help Me Choose rankings "
            f"({len(missing)} of {len(lineup_ids)}; report only):"
        )
        for mid in missing:
            print(f"  - {mid}")
    else:
        print("Every lineup model has at least one Help Me Choose ranking.")
    return missing


def sync_rankings_with_lineup(dry_run: bool = False) -> dict:
    """Drop rankings not in the lineup and report unranked lineup models.

    Local files only — no network or paid API calls.
    Unranked lineup models are reported and never treated as an error.
    """
    if not RECOMMENDATIONS_PATH.exists():
        print(f"Error: {RECOMMENDATIONS_PATH} not found", file=sys.stderr)
        return {"removed": {}, "unranked": [], "total_changes": 0, "error": "file_not_found"}

    if not REGISTRY_PATH.exists():
        print(f"Error: {REGISTRY_PATH} not found", file=sys.stderr)
        return {"removed": {}, "unranked": [], "total_changes": 0, "error": "registry_not_found"}

    content = RECOMMENDATIONS_PATH.read_text(encoding="utf-8")
    categories = parse_recommendations_ts(content)
    if not categories:
        print("Error: could not parse categories", file=sys.stderr)
        return {"removed": {}, "unranked": [], "total_changes": 0, "error": "parse_error"}

    lineup_ids = get_lineup_model_ids()
    removed = drop_rankings_not_in_lineup(categories, lineup_ids)
    unranked = report_lineup_models_without_rankings(lineup_ids, categories)
    total = sum(len(v) for v in removed.values())

    if total > 0 and not dry_run:
        update_recommendations_file(categories)
        print(f"Wrote lineup sync: {total} ranking(s) dropped (not in active lineup).")
    elif total > 0:
        print(f"(Dry run) Would drop {total} ranking(s) for models not in the lineup.")
    else:
        print("All Help Me Choose rankings are in the active model lineup.")

    return {"removed": removed, "unranked": unranked, "total_changes": total}


def fetch_openrouter_model(model_id: str) -> dict | None:
    try:
        resp = httpx.get(
            OPENROUTER_MODELS_URL,
            params=OPENROUTER_MODELS_LIST_PARAMS,
            headers={"HTTP-Referer": "https://compareintel.com"},
            timeout=15.0,
        )
        if resp.status_code == 200:
            for m in resp.json().get("data", []):
                if m.get("id") == model_id:
                    return m
    except Exception as e:
        print(f"Warning: Could not fetch OpenRouter data: {e}", file=sys.stderr)
    return None


def calculate_avg_cost(model_data: dict) -> float | None:
    pricing = model_data.get("pricing", {})
    if not pricing:
        return None
    try:
        inp = float(pricing.get("prompt", 0) or 0)
        out = float(pricing.get("completion", 0) or 0)
    except (ValueError, TypeError):
        return None
    if inp == 0 and out == 0:
        return None
    inp_m = inp * 1_000_000
    out_m = out * 1_000_000
    if inp_m > 0 and out_m > 0:
        return (inp_m + out_m) / 2
    return inp_m or out_m or None


# Category qualification thresholds.  Models must meet these to be included.
COST_EFFECTIVE_MAX_PRICE = 1.00  # max avg $/1M tokens (exclusive: under $1)
FAST_MIN_THROUGHPUT = 50.0  # min tokens/sec
# Cerebras/Groq-class hosted inference tops out around 1–2k t/s. Values like
# 13,496 t/s for Sonnet 4.6 came from unofficial weekly proxy endpoints.
FAST_MAX_THROUGHPUT = 2500.0
# SWE-Bench Pro public scores are much lower than SWE-Bench Verified (typical range ~2–46%).
CODING_MIN_SWE_BENCH_PRO = (
    1.0  # min % resolved on public split; include all mapped leaderboard rows
)
REASONING_MIN_MMLU_PRO = 80.0  # min MMLU-Pro %
MATH_MIN_GSM8K = 85.0  # min GSM8K % when MATH not available (MATH has no min; all scored included)
LONG_CONTEXT_MIN_MRCR = 30.0  # min MRCR 1M score


def determine_categories(
    model_id: str,
    registry_model: dict,
    openrouter_data: dict | None,
    swe_bench_pro_scores: dict[str, tuple[float, str]],
    legalbench_scores: dict[str, tuple[float, str]] | None = None,
    openrouter_pricing: dict[str, tuple[float, str]] | None = None,
    lmspeed_scores: dict[str, tuple[float, str]] | None = None,
    global_mmlu_scores: dict[str, tuple[float, str]] | None = None,
    mmlu_pro_scores: dict[str, tuple[float, str]] | None = None,
    creative_writing_scores: dict[str, tuple[float, str]] | None = None,
    mrcr_scores: dict[str, tuple[float, str]] | None = None,
    text_to_image_scores: dict[str, tuple[float, str]] | None = None,
    math_scores: dict[str, tuple[float, str]] | None = None,
    vision_arena_scores: dict[str, tuple[float, str]] | None = None,
) -> list[dict]:
    """Determine which Help Me Choose categories this model qualifies for.

    Only returns categories where we have a numeric benchmark score from a
    fetchable source. Models without benchmark data are not added.
    """
    entries = []
    if model_id in swe_bench_pro_scores:
        score, evidence = swe_bench_pro_scores[model_id]
        if score >= CODING_MIN_SWE_BENCH_PRO:
            entries.append({"category_id": "coding", "evidence": evidence, "score": score})
    if legalbench_scores and model_id in legalbench_scores:
        score, evidence = legalbench_scores[model_id]
        entries.append({"category_id": "legal", "evidence": evidence, "score": score})
    if openrouter_pricing and model_id in openrouter_pricing:
        cost, evidence = openrouter_pricing[model_id]
        if cost < COST_EFFECTIVE_MAX_PRICE:
            entries.append({"category_id": "cost-effective", "evidence": evidence, "score": cost})
    if lmspeed_scores and model_id in lmspeed_scores:
        tps, evidence = lmspeed_scores[model_id]
        if tps >= FAST_MIN_THROUGHPUT:
            entries.append({"category_id": "fast", "evidence": evidence, "score": tps})
    if global_mmlu_scores and model_id in global_mmlu_scores:
        score, evidence = global_mmlu_scores[model_id]
        entries.append({"category_id": "multilingual", "evidence": evidence, "score": score})
    if mmlu_pro_scores and model_id in mmlu_pro_scores:
        score, evidence = mmlu_pro_scores[model_id]
        if score >= REASONING_MIN_MMLU_PRO:
            entries.append({"category_id": "reasoning", "evidence": evidence, "score": score})
    if creative_writing_scores and model_id in creative_writing_scores:
        elo, evidence = creative_writing_scores[model_id]
        if elo >= WRITING_MIN_ELO:
            entries.append({"category_id": "writing", "evidence": evidence, "score": elo})
    if mrcr_scores and model_id in mrcr_scores:
        score, evidence = mrcr_scores[model_id]
        if score >= LONG_CONTEXT_MIN_MRCR:
            entries.append({"category_id": "long-context", "evidence": evidence, "score": score})
    if (
        registry_model.get("supports_image_generation")
        and text_to_image_scores
        and model_id in text_to_image_scores
    ):
        score, evidence = text_to_image_scores[model_id]
        entries.append({"category_id": "image-generation", "evidence": evidence, "score": score})
    if math_scores and model_id in math_scores:
        score, evidence = math_scores[model_id]
        entries.append({"category_id": "math", "evidence": evidence, "score": score})
    if vision_arena_scores and model_id in vision_arena_scores:
        score, evidence = vision_arena_scores[model_id]
        if score >= VISION_MIN_ARENA:
            entries.append({"category_id": "images", "evidence": evidence, "score": score})
    return entries


def _unescape_evidence(s: str) -> str:
    """Unescape JS/TS string escapes in parsed evidence."""
    return s.replace("\\'", "'").replace('\\"', '"').replace("\\n", "\n").replace("\\t", "\t")


def parse_recommendations_ts(content: str) -> list[dict]:
    """Parse the HELP_ME_CHOOSE_CATEGORIES array from the TS file.

    Returns a list of category dicts with id, label, description, and models.
    Handles: single/double-quoted evidence, multiline evidence, trailing commas.
    Only parses the array value (after "= ["), not any duplicate block in the type position.
    """
    # Restrict to content after "= [" to avoid parsing a corrupted duplicate block
    assign_bracket = content.find("= [")
    parse_content = content[assign_bracket:] if assign_bracket != -1 else content

    categories = []
    cat_block_pattern = re.compile(
        r"\{\s*id:\s*'([^']+)'.*?models:\s*\[(.*?)\]\s*,?\s*\}",
        re.DOTALL,
    )
    # Match modelId + evidence; evidence can be single- or double-quoted, multiline,
    # and may contain escaped quotes. Trailing comma before } is optional.
    model_pattern = re.compile(
        r"\{\s*modelId:\s*'([^']+)',\s*evidence:\s*"
        r"(?:'((?:[^'\\]|\\.)*)'|\"((?:[^\"\\]|\\.)*)\")\s*,?\s*\}",
        re.DOTALL,
    )

    for cat_match in cat_block_pattern.finditer(parse_content):
        cat_id = cat_match.group(1)
        models_block = cat_match.group(2)

        label_match = re.search(r"label:\s*'([^']+)'", cat_match.group(0))
        desc_match = re.search(r"description:\s*'([^']+)'", cat_match.group(0))
        info_match = re.search(
            r"categoryInfoTooltip:\s*['\"]([^'\"]*(?:\\.[^'\"]*)*)['\"]",
            cat_match.group(0),
        )
        category_info = _unescape_evidence(info_match.group(1)) if info_match else None

        models = []
        for m_match in model_pattern.finditer(models_block):
            evidence = m_match.group(2) or m_match.group(3) or ""
            models.append(
                {
                    "modelId": m_match.group(1),
                    "evidence": _unescape_evidence(evidence),
                }
            )

        cat_dict: dict = {
            "id": cat_id,
            "label": label_match.group(1) if label_match else cat_id,
            "description": desc_match.group(1) if desc_match else "",
            "models": models,
        }
        if category_info:
            cat_dict["categoryInfoTooltip"] = category_info
        categories.append(cat_dict)

    return categories


def model_exists_in_category(categories: list[dict], category_id: str, model_id: str) -> bool:
    for cat in categories:
        if cat["id"] == category_id:
            for m in cat["models"]:
                if m["modelId"] == model_id:
                    return True
    return False


def add_model_to_category(
    categories: list[dict],
    category_id: str,
    model_id: str,
    evidence: str,
) -> bool:
    """Add a model to the end of a category. Returns True if added."""
    for cat in categories:
        if cat["id"] == category_id:
            if any(m["modelId"] == model_id for m in cat["models"]):
                return False
            cat["models"].append({"modelId": model_id, "evidence": evidence})
            return True
    return False


def rebuild_categories_ts(categories: list[dict]) -> str:
    """Rebuild the HELP_ME_CHOOSE_CATEGORIES array as TypeScript source."""
    lines = []
    for cat in categories:
        lines.append("  {")
        lines.append(f"    id: '{cat['id']}',")
        lines.append(f"    label: '{cat['label']}',")
        lines.append(f"    description: '{cat['description']}',")
        if cat.get("categoryInfoTooltip"):
            tip_escaped = cat["categoryInfoTooltip"].replace("'", "\\'")
            lines.append(f"    categoryInfoTooltip: '{tip_escaped}',")
        lines.append("    models: [")
        for m in cat["models"]:
            evidence_escaped = m["evidence"].replace("'", "\\'")
            lines.append(f"      {{ modelId: '{m['modelId']}', evidence: '{evidence_escaped}' }},")
        lines.append("    ],")
        lines.append("  },")
    return "\n".join(lines)


def update_recommendations_file(categories: list[dict]) -> None:
    """Write updated categories back to the TS file, preserving the file structure."""
    content = RECOMMENDATIONS_PATH.read_text(encoding="utf-8")

    array_start = content.find("export const HELP_ME_CHOOSE_CATEGORIES")
    if array_start == -1:
        raise ValueError("Could not find HELP_ME_CHOOSE_CATEGORIES in file")

    # Target the array value's "[" (after "= ["), not the type's "[" in "HelpMeChooseCategory[]"
    assign_bracket = content.find("= [", array_start)
    if assign_bracket != -1:
        bracket_start = assign_bracket + 2  # position of the "["
    else:
        bracket_start = content.find("[", array_start)
    if bracket_start == -1:
        raise ValueError("Could not find opening bracket of categories array")

    depth = 0
    bracket_end = -1
    for i in range(bracket_start, len(content)):
        if content[i] == "[":
            depth += 1
        elif content[i] == "]":
            depth -= 1
            if depth == 0:
                bracket_end = i
                break

    if bracket_end == -1:
        raise ValueError("Could not find closing bracket of categories array")

    new_array_content = "[\n" + rebuild_categories_ts(categories) + "\n]"
    new_content = content[:bracket_start] + new_array_content + content[bracket_end + 1 :]

    RECOMMENDATIONS_PATH.write_text(new_content, encoding="utf-8")


def update_methodology_last_updated() -> None:
    """Update the 'Last updated' date in the Help Me Choose methodology page."""
    if not METHODOLOGY_PATH.exists():
        print(f"Warning: Methodology file not found at {METHODOLOGY_PATH}", file=sys.stderr)
        return
    content = METHODOLOGY_PATH.read_text(encoding="utf-8")
    date_str = datetime.now().strftime("%B %Y")
    pattern = r'(<p className="last-updated">Last updated: )[^<]+(</p>)'
    if not re.search(pattern, content):
        print(
            f"Warning: Could not find last-updated pattern in {METHODOLOGY_PATH.name}",
            file=sys.stderr,
        )
        return
    new_content = re.sub(pattern, r"\1" + date_str + r"\2", content)
    METHODOLOGY_PATH.write_text(new_content, encoding="utf-8")
    print(f"  Updated methodology page: Last updated: {date_str}")


def research_and_update(model_id: str, dry_run: bool = False) -> dict:
    """Research benchmarks for a model and update Help Me Choose recommendations.

    Returns a summary dict: {"model_id": ..., "categories_added": [...], "skipped": bool}
    """
    print(
        f"PROGRESS:{json.dumps({'stage': 'researching', 'message': f'Researching benchmarks for {model_id}...', 'progress': 0})}"
    )

    registry_model = get_model_from_registry(model_id)
    if not registry_model:
        print(
            f"Model {model_id} not found in registry. Skipping Help Me Choose update.",
            file=sys.stderr,
        )
        return {
            "model_id": model_id,
            "categories_added": [],
            "skipped": True,
            "reason": "not_in_registry",
        }

    print(
        f"PROGRESS:{json.dumps({'stage': 'researching', 'message': 'Fetching benchmark scores...', 'progress': 20})}"
    )
    swe_bench_pro_scores = fetch_swe_bench_pro_scores()
    if swe_bench_pro_scores:
        print(f"  Fetched SWE-Bench Pro scores for {len(swe_bench_pro_scores)} models.")
    legalbench_scores = fetch_legalbench_scores()
    if legalbench_scores:
        print(f"  Fetched LegalBench scores for {len(legalbench_scores)} models.")
    openrouter_pricing = fetch_openrouter_pricing()
    if openrouter_pricing:
        print(f"  Fetched OpenRouter pricing for {len(openrouter_pricing)} models.")
    lmspeed_scores = fetch_lmspeed_scores()
    if lmspeed_scores:
        print(f"  Fetched LMSpeed scores for {len(lmspeed_scores)} models.")
    global_mmlu_scores = fetch_global_mmlu_scores()
    if global_mmlu_scores:
        print(f"  Fetched Global-MMLU scores for {len(global_mmlu_scores)} models.")
    mmlu_pro_scores = fetch_mmlu_pro_scores()
    if mmlu_pro_scores:
        print(f"  Fetched MMLU-Pro scores for {len(mmlu_pro_scores)} models.")
    creative_writing_scores = fetch_creative_writing_scores()
    if creative_writing_scores:
        print(f"  Fetched Creative Writing scores for {len(creative_writing_scores)} models.")
    text_to_image_scores = fetch_text_to_image_arena_scores()
    if text_to_image_scores:
        print(f"  Fetched Text-to-Image Arena scores for {len(text_to_image_scores)} models.")
    mrcr_scores = fetch_mrcr_scores()
    awesome_agents_long_context = fetch_awesome_agents_long_context_scores()
    long_context_scores = merge_long_context_scores(mrcr_scores, awesome_agents_long_context)
    if long_context_scores:
        print(
            f"  Fetched long-context scores for {len(long_context_scores)} models "
            f"(MRCR 1M + Awesome Agents)."
        )
    math_scores = fetch_math_scores()
    if math_scores:
        print(f"  Fetched MATH/GSM8K scores for {len(math_scores)} models.")
    vision_arena_scores = fetch_vision_arena_scores()
    if vision_arena_scores:
        print(f"  Fetched Vision Arena scores for {len(vision_arena_scores)} models.")

    print(
        f"PROGRESS:{json.dumps({'stage': 'researching', 'message': 'Determining category placements...', 'progress': 40})}"
    )
    category_entries = determine_categories(
        model_id,
        registry_model,
        fetch_openrouter_model(model_id),
        swe_bench_pro_scores,
        legalbench_scores,
        openrouter_pricing,
        lmspeed_scores,
        global_mmlu_scores,
        mmlu_pro_scores,
        creative_writing_scores,
        long_context_scores,
        text_to_image_scores,
        math_scores,
        vision_arena_scores,
    )

    if not category_entries:
        print(
            f"No Help Me Choose categories determined for {model_id}. Model may need manual benchmark research."
        )
        print(
            f"PROGRESS:{json.dumps({'stage': 'researching', 'message': 'No benchmark data found. Manual review needed.', 'progress': 100})}"
        )
        return {
            "model_id": model_id,
            "categories_added": [],
            "skipped": True,
            "reason": "no_benchmark_data",
        }

    print(
        f"PROGRESS:{json.dumps({'stage': 'researching', 'message': f'Found {len(category_entries)} category placements. Updating recommendations...', 'progress': 60})}"
    )

    if not RECOMMENDATIONS_PATH.exists():
        print(f"Recommendations file not found: {RECOMMENDATIONS_PATH}", file=sys.stderr)
        return {
            "model_id": model_id,
            "categories_added": [],
            "skipped": True,
            "reason": "file_not_found",
        }

    content = RECOMMENDATIONS_PATH.read_text(encoding="utf-8")
    categories = parse_recommendations_ts(content)

    if not categories:
        print("Warning: Could not parse existing categories from TS file.", file=sys.stderr)
        return {
            "model_id": model_id,
            "categories_added": [],
            "skipped": True,
            "reason": "parse_error",
        }

    added = []
    for entry in category_entries:
        cat_id = entry["category_id"]
        if model_exists_in_category(categories, cat_id, model_id):
            print(f"  Model already in '{cat_id}', skipping.")
            continue
        evidence = entry["evidence"]
        if cat_id == "coding" and model_id in swe_bench_pro_scores:
            evidence = swe_bench_pro_scores[model_id][1]
        if cat_id == "legal" and legalbench_scores and model_id in legalbench_scores:
            evidence = legalbench_scores[model_id][1]
        if cat_id == "cost-effective" and openrouter_pricing and model_id in openrouter_pricing:
            evidence = openrouter_pricing[model_id][1]
        if cat_id == "fast" and lmspeed_scores and model_id in lmspeed_scores:
            evidence = lmspeed_scores[model_id][1]
        if cat_id == "multilingual" and global_mmlu_scores and model_id in global_mmlu_scores:
            evidence = global_mmlu_scores[model_id][1]
        if cat_id == "reasoning" and mmlu_pro_scores and model_id in mmlu_pro_scores:
            evidence = mmlu_pro_scores[model_id][1]
        if cat_id == "writing" and creative_writing_scores and model_id in creative_writing_scores:
            evidence = creative_writing_scores[model_id][1]
        if cat_id == "long-context" and long_context_scores and model_id in long_context_scores:
            evidence = long_context_scores[model_id][1]
        if (
            cat_id == "image-generation"
            and text_to_image_scores
            and model_id in text_to_image_scores
        ):
            evidence = text_to_image_scores[model_id][1]
        if cat_id == "math" and math_scores and model_id in math_scores:
            evidence = math_scores[model_id][1]
        if cat_id == "images" and vision_arena_scores and model_id in vision_arena_scores:
            evidence = vision_arena_scores[model_id][1]
        evidence = with_fetch_date(evidence)
        if add_model_to_category(categories, cat_id, model_id, evidence):
            added.append(cat_id)
            print(f"  Added to '{cat_id}': {evidence}")

    # Sort each modified category by benchmark score (best first)
    fetched_by_cat: dict[str, dict] = {}
    if swe_bench_pro_scores:
        fetched_by_cat["coding"] = swe_bench_pro_scores
    if legalbench_scores:
        fetched_by_cat["legal"] = legalbench_scores
    if openrouter_pricing:
        fetched_by_cat["cost-effective"] = openrouter_pricing
    if lmspeed_scores:
        fetched_by_cat["fast"] = lmspeed_scores
    if global_mmlu_scores:
        fetched_by_cat["multilingual"] = global_mmlu_scores
    if mmlu_pro_scores:
        fetched_by_cat["reasoning"] = mmlu_pro_scores
    if creative_writing_scores:
        fetched_by_cat["writing"] = creative_writing_scores
    if long_context_scores:
        fetched_by_cat["long-context"] = long_context_scores
    if text_to_image_scores:
        fetched_by_cat["image-generation"] = text_to_image_scores
    if math_scores:
        fetched_by_cat["math"] = math_scores
    if vision_arena_scores:
        fetched_by_cat["images"] = vision_arena_scores
    for cat in categories:
        if cat["id"] in added:
            fetched = fetched_by_cat.get(cat["id"])
            sort_category_by_scores(cat, fetched)
            print(f"  Sorted '{cat['id']}' by benchmark score.")

    if added and not dry_run:
        print(
            f"PROGRESS:{json.dumps({'stage': 'researching', 'message': 'Writing updated recommendations...', 'progress': 80})}"
        )
        update_recommendations_file(categories)
        print(f"Updated {RECOMMENDATIONS_PATH.name} with {len(added)} new category placements.")
    elif not added:
        print(f"Model {model_id} already present in all qualifying categories.")

    print(
        f"PROGRESS:{json.dumps({'stage': 'researching', 'message': 'Benchmark research complete.', 'progress': 100})}"
    )

    return {
        "model_id": model_id,
        "categories_added": added,
        "skipped": False,
    }


def _sync_evidence_and_prune(
    categories: list[dict],
    fetched_by_cat: dict[str, dict[str, tuple[float, str]]],
) -> tuple[dict[str, list[str]], dict[str, list[str]]]:
    """Update stale evidence strings and remove models that no longer qualify.

    For data-driven categories (cost-effective, fast, coding), replaces the
    stored evidence with the latest fetched value so prices/throughput stay
    accurate.  Also removes models whose current score falls outside the
    category threshold.

    Returns (updated, removed) dicts mapping category_id -> [model_ids].
    """
    thresholds: dict[str, tuple[str, float]] = {
        "cost-effective": ("max_exclusive", COST_EFFECTIVE_MAX_PRICE),  # under $1/1M
        "fast": ("min", FAST_MIN_THROUGHPUT),
        "coding": ("min", CODING_MIN_SWE_BENCH_PRO),
        "reasoning": ("min", REASONING_MIN_MMLU_PRO),
        "writing": ("min", WRITING_MIN_ELO),
        "long-context": ("min", LONG_CONTEXT_MIN_MRCR),
        "images": ("min", VISION_MIN_ARENA),
    }

    updated: dict[str, list[str]] = {}
    removed: dict[str, list[str]] = {}

    for cat in categories:
        cat_id = cat["id"]
        fetched = fetched_by_cat.get(cat_id)
        threshold = thresholds.get(cat_id)
        to_remove: list[int] = []

        for i, m in enumerate(cat["models"]):
            mid = m["modelId"]
            existing_score = extract_primary_score(cat_id, m.get("evidence", ""))
            if existing_score is not None and not is_plausible_score(cat_id, existing_score):
                to_remove.append(i)
                removed.setdefault(cat_id, []).append(mid)
                print(
                    f"ERROR: [{cat_id}] dropping {mid} with implausible stored score "
                    f"{existing_score} ({m.get('evidence')})",
                    file=sys.stderr,
                )
                continue
            if not fetched:
                continue
            # Best for coding tracks SWE-Bench Pro only; drop entries without a Pro score.
            if cat_id == "coding" and mid not in fetched:
                to_remove.append(i)
                removed.setdefault(cat_id, []).append(mid)
                continue  # no SWE-Bench Pro public row for this registry model
            # Best for vision tracks Vision Arena only; drop entries without an arena score.
            if cat_id == "images" and mid not in fetched:
                to_remove.append(i)
                removed.setdefault(cat_id, []).append(mid)
                continue
            if mid not in fetched:
                continue
            score, new_evidence = fetched[mid]
            if not is_plausible_score(cat_id, score):
                print(
                    f"ERROR: [{cat_id}] not applying implausible fetched score {score} for {mid}",
                    file=sys.stderr,
                )
                continue

            if threshold:
                kind, limit = threshold
                if (
                    (kind == "max" and score > limit)
                    or (kind == "max_exclusive" and score >= limit)
                    or (kind == "min" and score < limit)
                ):
                    to_remove.append(i)
                    removed.setdefault(cat_id, []).append(mid)
                    continue

            if m["evidence"] != new_evidence:
                m["evidence"] = new_evidence
                updated.setdefault(cat_id, []).append(mid)

        for i in reversed(to_remove):
            cat["models"].pop(i)

    return updated, removed


def refresh_all_categories(dry_run: bool = False) -> dict:
    """Re-evaluate ALL registry models for data-driven categories.

    Fetches current benchmark data from all sources and:
    1. Drops rankings whose model is not in the active lineup
    2. Adds missing models that now qualify
    3. Updates stale evidence (e.g. outdated prices) on existing models
    4. Removes models that no longer meet category thresholds
    5. Re-sorts all data-driven categories
    6. Reports lineup models that have no rankings (not an error)

    Returns {"added": {...}, "updated": {...}, "removed": {...}, "total_changes": int}.
    """
    registry = load_registry()
    lineup_ids = get_lineup_model_ids(registry)
    all_model_ids = sorted(lineup_ids)

    print(f"Refreshing categories for {len(all_model_ids)} registry models...")
    print("Fetching benchmark data from all sources...")

    swe_bench_pro_scores = fetch_swe_bench_pro_scores()
    print(f"  SWE-Bench Pro: {len(swe_bench_pro_scores)} models")
    legalbench_scores = fetch_legalbench_scores()
    print(f"  LegalBench: {len(legalbench_scores)} models")
    openrouter_pricing = fetch_openrouter_pricing()
    print(f"  OpenRouter pricing: {len(openrouter_pricing)} models")
    lmspeed_scores = fetch_lmspeed_scores()
    print(f"  LMSpeed: {len(lmspeed_scores)} models")
    global_mmlu_scores = fetch_global_mmlu_scores()
    print(f"  Global-MMLU: {len(global_mmlu_scores)} models")
    mmlu_pro_scores = fetch_mmlu_pro_scores()
    print(f"  MMLU-Pro: {len(mmlu_pro_scores)} models")
    creative_writing_scores = fetch_creative_writing_scores()
    print(f"  Creative Writing Arena: {len(creative_writing_scores)} models")
    text_to_image_scores = fetch_text_to_image_arena_scores()
    print(f"  Text-to-Image Arena: {len(text_to_image_scores)} models")
    mrcr_scores = fetch_mrcr_scores()
    print(f"  MRCR 1M: {len(mrcr_scores)} models")
    awesome_agents_long_context = fetch_awesome_agents_long_context_scores()
    print(f"  Awesome Agents long-context: {len(awesome_agents_long_context)} models")
    long_context_scores = merge_long_context_scores(mrcr_scores, awesome_agents_long_context)
    print(f"  Long-context (merged): {len(long_context_scores)} models")
    math_scores = fetch_math_scores()
    print(f"  MATH/GSM8K: {len(math_scores)} models")
    vision_arena_scores = fetch_vision_arena_scores()
    print(f"  Vision Arena: {len(vision_arena_scores)} models")

    if not RECOMMENDATIONS_PATH.exists():
        print(f"Error: {RECOMMENDATIONS_PATH} not found", file=sys.stderr)
        return {"added": {}, "updated": {}, "removed": {}, "stale": {}, "total_changes": 0}

    content = RECOMMENDATIONS_PATH.read_text(encoding="utf-8")
    categories = parse_recommendations_ts(content)
    if not categories:
        print("Error: could not parse categories", file=sys.stderr)
        return {"added": {}, "updated": {}, "removed": {}, "stale": {}, "total_changes": 0}

    lineup_removed = drop_rankings_not_in_lineup(categories, lineup_ids)

    raw_fetched: dict[str, dict[str, tuple[float, str]]] = {
        "coding": swe_bench_pro_scores,
        "legal": legalbench_scores,
        "cost-effective": openrouter_pricing,
        "fast": lmspeed_scores,
        "multilingual": global_mmlu_scores,
        "reasoning": mmlu_pro_scores,
        "writing": creative_writing_scores,
        "image-generation": text_to_image_scores,
        "math": math_scores,
        "images": vision_arena_scores,
        "long-context": long_context_scores,
    }
    # Always register every source (including 0-row fetches) so the guard can fire.
    dated_fetched = {
        cat_id: attach_fetch_dates(filter_plausible_scores(cat_id, scores))
        for cat_id, scores in raw_fetched.items()
    }
    fetched_by_cat, stale_marked, _health_warnings = apply_source_health_guard(
        categories, dated_fetched
    )

    # Unhealthy sources stay out of fetched_by_cat so we do not add/prune from them.
    swe_bench_pro_scores = fetched_by_cat.get("coding", {})
    legalbench_scores = fetched_by_cat.get("legal", {})
    openrouter_pricing = fetched_by_cat.get("cost-effective", {})
    lmspeed_scores = fetched_by_cat.get("fast", {})
    global_mmlu_scores = fetched_by_cat.get("multilingual", {})
    mmlu_pro_scores = fetched_by_cat.get("reasoning", {})
    creative_writing_scores = fetched_by_cat.get("writing", {})
    text_to_image_scores = fetched_by_cat.get("image-generation", {})
    math_scores = fetched_by_cat.get("math", {})
    vision_arena_scores = fetched_by_cat.get("images", {})
    long_context_scores = fetched_by_cat.get("long-context", {})

    # Step 1: Sync evidence and prune models that no longer qualify
    ev_updated, ev_removed = _sync_evidence_and_prune(categories, fetched_by_cat)
    stale_pairs = {(cat_id, mid) for cat_id, mids in stale_marked.items() for mid in mids}
    for cat_id, mids in stale_marked.items():
        ev_updated.setdefault(cat_id, [])
        for mid in mids:
            if mid not in ev_updated[cat_id]:
                ev_updated[cat_id].append(mid)
            print(f"  ~ {mid} [{cat_id}]: marked stale (source collapsed)")
    for cat_id, mids in ev_updated.items():
        for mid in mids:
            if (cat_id, mid) in stale_pairs:
                continue
            print(f"  ~ {mid} [{cat_id}]: evidence updated")
    for cat_id, mids in ev_removed.items():
        for mid in mids:
            print(f"  - {mid} [{cat_id}]: removed (no current score or below category threshold)")
    for cat_id, mids in lineup_removed.items():
        ev_removed.setdefault(cat_id, []).extend(mids)

    # Step 2: Add missing models
    added: dict[str, list[str]] = {}
    for model_id in all_model_ids:
        registry_model = get_model_from_registry(model_id)
        if not registry_model:
            continue
        entries = determine_categories(
            model_id,
            registry_model,
            None,
            swe_bench_pro_scores,
            legalbench_scores,
            openrouter_pricing,
            lmspeed_scores,
            global_mmlu_scores,
            mmlu_pro_scores,
            creative_writing_scores,
            long_context_scores,
            text_to_image_scores,
            math_scores,
            vision_arena_scores,
        )
        for entry in entries:
            cat_id = entry["category_id"]
            evidence = with_fetch_date(entry["evidence"])
            if add_model_to_category(categories, cat_id, model_id, evidence):
                added.setdefault(cat_id, []).append(model_id)
                print(f"  + {model_id} -> {cat_id}: {evidence}")

    # Step 3: Re-sort all data-driven categories
    for cat in categories:
        if cat["id"] in fetched_by_cat:
            sort_category_by_scores(cat, fetched_by_cat.get(cat["id"]))

    total = (
        sum(len(v) for v in added.values())
        + sum(len(v) for v in ev_updated.values())
        + sum(len(v) for v in ev_removed.values())
    )
    if total > 0 and not dry_run:
        update_recommendations_file(categories)
        print(
            f"\nWrote changes: {sum(len(v) for v in added.values())} added, "
            f"{sum(len(v) for v in ev_updated.values())} updated, "
            f"{sum(len(v) for v in ev_removed.values())} removed."
        )
    elif total > 0:
        print(f"\n(Dry run) Would make {total} changes.")
    else:
        print("\nAll models already up to date.")

    if not dry_run:
        update_methodology_last_updated()

    unranked = report_lineup_models_without_rankings(lineup_ids, categories)

    return {
        "added": added,
        "updated": ev_updated,
        "removed": ev_removed,
        "stale": stale_marked,
        "unranked": unranked,
        "total_changes": total,
    }


if __name__ == "__main__":
    if "--refresh-all" in sys.argv:
        dry = "--dry-run" in sys.argv
        result = refresh_all_categories(dry_run=dry)
        print(json.dumps(result, indent=2))
    elif "--sync-lineup" in sys.argv:
        dry = "--dry-run" in sys.argv
        result = sync_rankings_with_lineup(dry_run=dry)
        print(json.dumps(result, indent=2))
        sys.exit(1 if result.get("error") else 0)
    elif len(sys.argv) < 2:
        print(
            f"Usage: {sys.argv[0]} <model_id> [--dry-run]\n"
            f"       {sys.argv[0]} --refresh-all [--dry-run]\n"
            f"       {sys.argv[0]} --sync-lineup [--dry-run]",
            file=sys.stderr,
        )
        sys.exit(1)
    else:
        mid = sys.argv[1]
        dry = "--dry-run" in sys.argv
        result = research_and_update(mid, dry_run=dry)
        print(json.dumps(result, indent=2))
