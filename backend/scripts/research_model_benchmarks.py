"""
Research model benchmarks and update Help Me Choose recommendations.

This script is called automatically when a new model is added via the admin panel.
It can also be run standalone:

    python scripts/research_model_benchmarks.py <model_id>

The script:
1. Fetches the model's OpenRouter data (description, pricing, capabilities)
2. Fetches benchmark scores from public sources (OpenLM SWE-bench, etc.) when available
3. Determines which Help Me Choose categories the model qualifies for
4. Adds the model and sorts each category by benchmark score (best first)
5. Updates frontend/src/data/helpMeChooseRecommendations.ts with proper ranking

Only models with verifiable, publicly available benchmark data are added.
"""

import json
import re
import sys
from pathlib import Path

import httpx
from bs4 import BeautifulSoup

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
RECOMMENDATIONS_PATH = PROJECT_ROOT / "frontend" / "src" / "data" / "helpMeChooseRecommendations.ts"
REGISTRY_PATH = PROJECT_ROOT / "backend" / "data" / "models_registry.json"

# Categories with fetchable benchmark sources. Only these are auto-populated.
CATEGORY_IDS = [
    "coding",
    "writing",
    "reasoning",
    "long-context",
    "cost-effective",
    "fast",
    "multilingual",
    "legal",
    "medical",
]

# Categories where lower score is better (e.g. cost-effective: cheaper first)
SORT_ASCENDING_CATEGORIES = {"cost-effective"}

SWE_BENCH_URL = "https://openlm.ai/swe-bench/"
LMARENA_URL = "https://lmarena.ai/"
VALS_LEGAL_BENCH_URL = "https://www.vals.ai/benchmarks/legal_bench-01-30-2025"
LMSPEED_URL = "https://lmspeed.net/leaderboard/best-throughput-models-weekly"
OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models"
GLOBAL_MMLU_URL = "https://llmdb.com/benchmarks/global-mmlu"


def extract_primary_score(category_id: str, evidence: str) -> float | None:
    """Extract primary numeric score from evidence for ordering. Returns None if no comparable score."""
    # Percentage (SWE-Bench, MMLU-Pro, etc.)
    pct = re.search(r"(\d+\.?\d*)\s*%", evidence)
    if pct:
        return float(pct.group(1))
    # Mazur Writing Score (e.g. 8.561)
    if category_id == "writing":
        mazur = re.search(r"Mazur[^:]*:\s*(\d+\.\d+)", evidence, re.I)
        if mazur:
            return float(mazur.group(1))
        # Creative Writing Arena Elo (e.g. 1455–1461)
        elo = re.search(r"(\d+)\s*[–\-]\s*\d+\s*Elo", evidence, re.I)
        if elo:
            return float(elo.group(1))
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
    # Cost-effective: OpenRouter avg $X.XX/1M tokens
    if category_id == "cost-effective":
        cost = re.search(r"\$\s*(\d+\.?\d*)\s*/\s*1\s*M", evidence, re.I)
        if cost:
            return float(cost.group(1))
    # Fast: LMSpeed XXX t/s (tokens per second)
    if category_id == "fast":
        tps = re.search(r"(\d+\.?\d*)\s*t/s", evidence, re.I)
        if tps:
            return float(tps.group(1))
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


def get_model_id_to_name_map() -> dict[str, str]:
    """Build model_id -> registry name from models registry."""
    registry = load_registry()
    result: dict[str, str] = {}
    for provider_models in registry.get("models_by_provider", {}).values():
        for m in provider_models:
            if mid := m.get("id"):
                result[mid] = m.get("name", mid.split("/")[-1])
    return result


# VALS model slug (e.g. google_gemini-3-pro-preview) -> our registry model_id
VALS_TO_MODEL_ID: dict[str, str] = {
    "google_gemini-3-pro-preview": "google/gemini-3.1-pro-preview",
    "google_gemini-3-flash-preview": "google/gemini-3-flash-preview",
    "openai_gpt-5-2025-08-07": "openai/gpt-5",
    "openai_gpt-5.1-2025-11-13": "openai/gpt-5.1",
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
                result[mid] = (cost, f"OpenRouter avg: ${cost:.2f}/1M tokens.")
    except Exception as e:
        print(f"Warning: Could not fetch OpenRouter pricing: {e}", file=sys.stderr)
    return result


def fetch_global_mmlu_scores() -> dict[str, tuple[float, str]]:
    """Fetch Global-MMLU scores from llmdb.com. Returns model_id -> (score, evidence).
    Best-effort: page structure may change; models not in registry are skipped."""
    model_id_to_name = get_model_id_to_name_map()
    name_to_model_id = {_normalize_name_for_match(n): mid for mid, n in model_id_to_name.items()}
    # Build slug -> model_id from registry: gemini-2-5-pro -> google/gemini-2.5-pro
    slug_to_model_id: dict[str, str] = {}
    for mid in model_id_to_name:
        parts = mid.split("/")
        if len(parts) == 2:
            slug = parts[1].replace(".", "-")
            slug_to_model_id[slug] = mid

    result: dict[str, tuple[float, str]] = {}
    try:
        resp = httpx.get(GLOBAL_MMLU_URL, timeout=15.0)
        if resp.status_code != 200:
            return result
        soup = BeautifulSoup(resp.text, "html.parser")
        for link in soup.find_all("a", href=True):
            href = link.get("href", "")
            if "/models/" not in href:
                continue
            slug = href.split("/models/")[-1].rstrip("/").strip()
            if not slug:
                continue
            display_name = link.get_text(strip=True) or ""
            parent_row = link.find_parent("tr")
            if not parent_row:
                continue
            row_text = parent_row.get_text()
            score_match = re.search(r"\b(\d{1,2}\.\d)\b", row_text)
            if not score_match:
                continue
            try:
                score = float(score_match.group(1))
            except ValueError:
                continue
            if score < 0 or score > 100:
                continue
            mid = slug_to_model_id.get(slug)
            if not mid:
                norm = _normalize_name_for_match(display_name.split("(")[0].strip())
                mid = name_to_model_id.get(norm)
            if mid:
                result[mid] = (score, f"Global-MMLU (llmdb.com): {score}%.")
    except Exception as e:
        print(f"Warning: Could not fetch Global-MMLU scores: {e}", file=sys.stderr)
    return result


def fetch_lmspeed_scores() -> dict[str, tuple[float, str]]:
    """Fetch LMSpeed throughput (tokens/sec). Returns model_id -> (tps, evidence)."""
    model_id_to_name = get_model_id_to_name_map()
    name_to_model_id = {_normalize_name_for_match(n): mid for mid, n in model_id_to_name.items()}

    result: dict[str, tuple[float, str]] = {}
    try:
        resp = httpx.get(LMSPEED_URL, timeout=15.0)
        if resp.status_code != 200:
            return result
        text = resp.text
        # LMSpeed table: Model | Throughput (e.g. 1742.03t/s)
        for m in re.finditer(
            r"\|([^|]+)\|\s*(\d+\.?\d*)\s*t/s",
            text,
            re.I,
        ):
            model_name = m.group(1).strip()
            try:
                tps = float(m.group(2))
            except ValueError:
                continue
            norm = _normalize_name_for_match(model_name)
            mid = name_to_model_id.get(norm)
            if not mid:
                # Try provider/model format: "gpt-oss-120b" -> openai/gpt-oss-120b
                for pid, n in model_id_to_name.items():
                    if _normalize_name_for_match(n) == norm:
                        mid = pid
                        break
            if mid:
                result[mid] = (tps, f"LMSpeed (lmspeed.net): {tps:.0f} t/s.")
    except Exception as e:
        print(f"Warning: Could not fetch LMSpeed scores: {e}", file=sys.stderr)
    return result


def fetch_swebench_scores() -> dict[str, tuple[float, str]]:
    """Fetch OpenLM SWE-bench leaderboard. Returns model_id -> (score, evidence)."""
    model_id_to_name = get_model_id_to_name_map()
    name_to_model_id = {_normalize_name_for_match(n): mid for mid, n in model_id_to_name.items()}

    result: dict[str, tuple[float, str]] = {}
    try:
        resp = httpx.get(SWE_BENCH_URL, timeout=15.0)
        if resp.status_code != 200:
            return result
        soup = BeautifulSoup(resp.text, "html.parser")
        # OpenLM table: rows with Model (link) | SWE-bench (score) | ...
        for row in soup.find_all("tr"):
            cells = row.find_all("td")
            if len(cells) < 2:
                continue
            model_cell = cells[0]
            score_cell = cells[1]
            link = model_cell.find("a")
            model_name = (
                link.get_text(strip=True) if link else model_cell.get_text(strip=True)
            ) or ""
            score_text = score_cell.get_text(strip=True) or ""
            # Score may be in backticks like `79.2`
            score_text = score_text.strip("`")
            try:
                score = float(score_text)
            except ValueError:
                continue
            norm = _normalize_name_for_match(model_name)
            if norm in name_to_model_id:
                mid = name_to_model_id[norm]
                result[mid] = (score, f"SWE-Bench Verified (openlm.ai): {score}%.")
    except Exception as e:
        print(f"Warning: Could not fetch SWE-bench scores: {e}", file=sys.stderr)
    return result


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


def fetch_openrouter_model(model_id: str) -> dict | None:
    try:
        resp = httpx.get(
            "https://openrouter.ai/api/v1/models",
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


def determine_categories(
    model_id: str,
    registry_model: dict,
    openrouter_data: dict | None,
    swebench_scores: dict[str, tuple[float, str]],
    legalbench_scores: dict[str, tuple[float, str]] | None = None,
    openrouter_pricing: dict[str, tuple[float, str]] | None = None,
    lmspeed_scores: dict[str, tuple[float, str]] | None = None,
    global_mmlu_scores: dict[str, tuple[float, str]] | None = None,
) -> list[dict]:
    """Determine which Help Me Choose categories this model qualifies for.

    Only returns categories where we have a numeric benchmark score from a
    fetchable source. Models without benchmark data are not added.
    """
    entries = []
    if model_id in swebench_scores:
        score, evidence = swebench_scores[model_id]
        entries.append({"category_id": "coding", "evidence": evidence, "score": score})
    if legalbench_scores and model_id in legalbench_scores:
        score, evidence = legalbench_scores[model_id]
        entries.append({"category_id": "legal", "evidence": evidence, "score": score})
    if openrouter_pricing and model_id in openrouter_pricing:
        cost, evidence = openrouter_pricing[model_id]
        entries.append({"category_id": "cost-effective", "evidence": evidence, "score": cost})
    if lmspeed_scores and model_id in lmspeed_scores:
        tps, evidence = lmspeed_scores[model_id]
        entries.append({"category_id": "fast", "evidence": evidence, "score": tps})
    if global_mmlu_scores and model_id in global_mmlu_scores:
        score, evidence = global_mmlu_scores[model_id]
        entries.append({"category_id": "multilingual", "evidence": evidence, "score": score})
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
    swebench_scores = fetch_swebench_scores()
    if swebench_scores:
        print(f"  Fetched SWE-bench scores for {len(swebench_scores)} models.")
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

    print(
        f"PROGRESS:{json.dumps({'stage': 'researching', 'message': 'Determining category placements...', 'progress': 40})}"
    )
    category_entries = determine_categories(
        model_id,
        registry_model,
        fetch_openrouter_model(model_id),
        swebench_scores,
        legalbench_scores,
        openrouter_pricing,
        lmspeed_scores,
        global_mmlu_scores,
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
        if cat_id == "coding" and model_id in swebench_scores:
            evidence = swebench_scores[model_id][1]
        if cat_id == "legal" and legalbench_scores and model_id in legalbench_scores:
            evidence = legalbench_scores[model_id][1]
        if cat_id == "cost-effective" and openrouter_pricing and model_id in openrouter_pricing:
            evidence = openrouter_pricing[model_id][1]
        if cat_id == "fast" and lmspeed_scores and model_id in lmspeed_scores:
            evidence = lmspeed_scores[model_id][1]
        if cat_id == "multilingual" and global_mmlu_scores and model_id in global_mmlu_scores:
            evidence = global_mmlu_scores[model_id][1]
        if add_model_to_category(categories, cat_id, model_id, evidence):
            added.append(cat_id)
            print(f"  Added to '{cat_id}': {evidence}")

    # Sort each modified category by benchmark score (best first)
    fetched_by_cat: dict[str, dict] = {}
    if swebench_scores:
        fetched_by_cat["coding"] = swebench_scores
    if legalbench_scores:
        fetched_by_cat["legal"] = legalbench_scores
    if openrouter_pricing:
        fetched_by_cat["cost-effective"] = openrouter_pricing
    if lmspeed_scores:
        fetched_by_cat["fast"] = lmspeed_scores
    if global_mmlu_scores:
        fetched_by_cat["multilingual"] = global_mmlu_scores
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


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <model_id> [--dry-run]", file=sys.stderr)
        sys.exit(1)

    mid = sys.argv[1]
    dry = "--dry-run" in sys.argv
    result = research_and_update(mid, dry_run=dry)
    print(json.dumps(result, indent=2))
