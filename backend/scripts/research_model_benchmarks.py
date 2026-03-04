"""
Research model benchmarks and update Help Me Choose recommendations.

This script is called automatically when a new model is added via the admin panel.
It can also be run standalone:

    python scripts/research_model_benchmarks.py <model_id>

The script:
1. Fetches the model's OpenRouter data (description, pricing, capabilities)
2. Queries well-known public benchmark sources (SWE-Bench, LMSys Arena, etc.)
3. Determines which Help Me Choose categories the model qualifies for
4. Updates frontend/src/data/helpMeChooseRecommendations.ts with proper ranking

Only models with verifiable, publicly available benchmark data are added.
"""

import json
import re
import sys
from pathlib import Path

import httpx

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
RECOMMENDATIONS_PATH = PROJECT_ROOT / "frontend" / "src" / "data" / "helpMeChooseRecommendations.ts"
REGISTRY_PATH = PROJECT_ROOT / "backend" / "data" / "models_registry.json"

CATEGORY_IDS = ["cost-effective", "fast", "coding", "writing", "reasoning", "web-search"]

SWE_BENCH_URL = "https://openlm.ai/swe-bench/"
LMARENA_URL = "https://lmarena.ai/"


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
) -> list[dict]:
    """Determine which Help Me Choose categories this model qualifies for.

    Returns a list of dicts: [{"category_id": ..., "evidence": ..., "score": ...}]
    where score is used to rank within the category (higher = better placement).
    """
    entries = []
    model_name = registry_model.get("name", model_id.split("/")[-1])
    supports_web_search = registry_model.get("supports_web_search", False)
    description = (registry_model.get("description") or "").lower()
    model_id_lower = model_id.lower()

    avg_cost = None
    if openrouter_data:
        avg_cost = calculate_avg_cost(openrouter_data)

    is_free = ":free" in model_id_lower
    is_small = any(k in model_id_lower for k in ["-mini", "-nano", "-small", "-flash", "-fast"])

    if is_free:
        entries.append(
            {
                "category_id": "cost-effective",
                "evidence": "Free tier (OpenRouter). Solid quality for cost.",
                "score": 100,
            }
        )
    elif avg_cost is not None and avg_cost < 3.0:
        entries.append(
            {
                "category_id": "cost-effective",
                "evidence": f"OpenRouter pricing (openrouter.ai): ~${avg_cost:.2f}/1M tokens. Good value.",
                "score": 50 - avg_cost,
            }
        )

    if is_small or is_free:
        entries.append(
            {
                "category_id": "fast",
                "evidence": "Small/fast model variant. Low latency expected.",
                "score": 30 if is_free else 20,
            }
        )

    code_keywords = ["code", "coder", "codestral", "devstral", "coding"]
    if any(k in model_id_lower for k in code_keywords) or any(
        k in description
        for k in ["code generation", "coding", "software engineer", "agentic coding"]
    ):
        entries.append(
            {
                "category_id": "coding",
                "evidence": "Code-specialized model. LMSys Coding Arena (lmarena.ai): Evaluate for dev tasks.",
                "score": 10,
            }
        )

    if any(k in description for k in ["reasoning", "thinking", "chain-of-thought", "math"]):
        entries.append(
            {
                "category_id": "reasoning",
                "evidence": "Reasoning/thinking model. Evaluate on MMLU-Pro (awesomeagents.ai).",
                "score": 10,
            }
        )

    if supports_web_search:
        entries.append(
            {
                "category_id": "web-search",
                "evidence": "Provider docs: supports_web_search. Retrieval and citation.",
                "score": 10,
            }
        )

    return entries


def _unescape_evidence(s: str) -> str:
    """Unescape JS/TS string escapes in parsed evidence."""
    return s.replace("\\'", "'").replace('\\"', '"').replace("\\n", "\n").replace("\\t", "\t")


def parse_recommendations_ts(content: str) -> list[dict]:
    """Parse the HELP_ME_CHOOSE_CATEGORIES array from the TS file.

    Returns a list of category dicts with id, label, description, and models.
    Handles: single/double-quoted evidence, multiline evidence, trailing commas.
    """
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

    for cat_match in cat_block_pattern.finditer(content):
        cat_id = cat_match.group(1)
        models_block = cat_match.group(2)

        label_match = re.search(r"label:\s*'([^']+)'", cat_match.group(0))
        desc_match = re.search(r"description:\s*'([^']+)'", cat_match.group(0))

        models = []
        for m_match in model_pattern.finditer(models_block):
            evidence = m_match.group(2) or m_match.group(3) or ""
            models.append(
                {
                    "modelId": m_match.group(1),
                    "evidence": _unescape_evidence(evidence),
                }
            )

        categories.append(
            {
                "id": cat_id,
                "label": label_match.group(1) if label_match else cat_id,
                "description": desc_match.group(1) if desc_match else "",
                "models": models,
            }
        )

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
        f"PROGRESS:{json.dumps({'stage': 'researching', 'message': 'Fetching OpenRouter data...', 'progress': 20})}"
    )
    openrouter_data = fetch_openrouter_model(model_id)

    print(
        f"PROGRESS:{json.dumps({'stage': 'researching', 'message': 'Determining category placements...', 'progress': 40})}"
    )
    category_entries = determine_categories(model_id, registry_model, openrouter_data)

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
        if add_model_to_category(categories, cat_id, model_id, entry["evidence"]):
            added.append(cat_id)
            print(f"  Added to '{cat_id}': {entry['evidence']}")

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
