"""Tests for the research_model_benchmarks script.

Validates that:
1. Category determination works correctly based on model properties
2. TS file parsing and rebuilding round-trips properly
3. Models are added to the correct categories
4. Duplicate entries are not created
5. Cost-effective classification works with pricing data
6. Web search models are categorized correctly
7. Code-specialized models are detected
8. Reasoning models are detected
"""

import pytest

pytestmark = pytest.mark.unit


import json
import sys
import textwrap
from pathlib import Path
from unittest.mock import patch

# Add backend to path so we can import the script
BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from scripts.research_model_benchmarks import (
    FAST_MAX_THROUGHPUT,
    _expand_hyphenated_minor_versions,
    _merge_swe_bench_pro_row,
    _score_from_llmdb_score_cell,
    add_model_to_category,
    apply_source_health_guard,
    attach_fetch_dates,
    calculate_avg_cost,
    collect_ranked_model_ids,
    determine_categories,
    drop_rankings_not_in_lineup,
    evaluate_source_health,
    extract_primary_score,
    get_lineup_model_ids,
    get_model_id_to_name_map,
    is_plausible_score,
    mark_category_stale,
    mark_evidence_stale,
    model_exists_in_category,
    parse_recommendations_ts,
    rebuild_categories_ts,
    report_lineup_models_without_rankings,
    sort_category_by_scores,
    sync_rankings_with_lineup,
    with_fetch_date,
)

# --- Fixtures ---

SAMPLE_TS_CONTENT = textwrap.dedent("""\
    export const HELP_ME_CHOOSE_CATEGORIES: HelpMeChooseCategory[] = [
      {
        id: 'coding',
        label: 'Best for coding',
        description: 'Code generation, debugging, refactoring',
        models: [
          { modelId: 'anthropic/claude-opus-5.5', evidence: 'SWE-Bench Pro public (Scale Labs): 45.89%.' },
        ],
      },
      {
        id: 'writing',
        label: 'Best for writing',
        description: 'Prose, tone, character consistency',
        models: [
          { modelId: 'anthropic/claude-opus-4.6', evidence: 'Mazur Writing Score: 8.561.' },
        ],
      },
      {
        id: 'reasoning',
        label: 'Best for reasoning',
        description: 'Math, logic, multi-step problem solving',
        models: [
          { modelId: 'openai/gpt-5.2-pro', evidence: 'MMLU-Pro: 88.7%.' },
        ],
      },
      {
        id: 'long-context',
        label: 'Best for long context',
        description: 'Large context windows',
        models: [
          { modelId: 'google/gemini-2.5-pro', evidence: 'Michelangelo Long-Context 1M (llmdb.com): 93/100.' },
        ],
      },
    ]
""")


def make_registry_model(
    model_id: str,
    name: str = "Test Model",
    description: str = "A test model.",
    supports_web_search: bool = False,
    **kwargs,
) -> dict:
    return {
        "id": model_id,
        "name": name,
        "description": description,
        "category": "Language",
        "provider": model_id.split("/")[0],
        "supports_web_search": supports_web_search,
        **kwargs,
    }


def make_openrouter_data(
    model_id: str,
    prompt_price: float = 0.0,
    completion_price: float = 0.0,
) -> dict:
    return {
        "id": model_id,
        "pricing": {
            "prompt": str(prompt_price),
            "completion": str(completion_price),
        },
    }


# --- Tests for calculate_avg_cost ---


class TestCalculateAvgCost:
    def test_both_prices(self):
        data = make_openrouter_data("test/m", prompt_price=0.000001, completion_price=0.000003)
        cost = calculate_avg_cost(data)
        assert cost is not None
        assert abs(cost - 2.0) < 0.01  # (1 + 3) / 2

    def test_zero_prices_returns_none(self):
        data = make_openrouter_data("test/m", prompt_price=0, completion_price=0)
        assert calculate_avg_cost(data) is None

    def test_no_pricing_key(self):
        assert calculate_avg_cost({"id": "test/m"}) is None

    def test_only_prompt_price(self):
        data = make_openrouter_data("test/m", prompt_price=0.000002, completion_price=0)
        cost = calculate_avg_cost(data)
        assert cost is not None
        assert abs(cost - 2.0) < 0.01


# --- Tests for determine_categories ---


class TestDetermineCategories:
    """Only models with fetched benchmark scores are added. Categories: coding (SWE-Bench Pro), legal (LegalBench)."""

    def test_model_in_swe_bench_pro_gets_coding(self):
        model = make_registry_model("anthropic/claude-opus-5.5")
        pro = {"anthropic/claude-opus-5.5": (45.89, "SWE-Bench Pro public (Scale Labs): 45.89%.")}
        entries = determine_categories("anthropic/claude-opus-5.5", model, None, pro)
        assert len(entries) == 1
        assert entries[0]["category_id"] == "coding"
        assert entries[0]["evidence"] == "SWE-Bench Pro public (Scale Labs): 45.89%."

    def test_model_not_in_swe_bench_pro_gets_no_coding(self):
        model = make_registry_model("test/unknown-model")
        pro = {"anthropic/claude-opus-5.5": (45.89, "SWE-Bench Pro public (Scale Labs): 45.89%.")}
        entries = determine_categories("test/unknown-model", model, None, pro)
        assert len(entries) == 0

    def test_model_below_coding_threshold_gets_no_coding(self):
        from scripts.research_model_benchmarks import CODING_MIN_SWE_BENCH_PRO

        model = make_registry_model("test/low")
        pro = {
            "test/low": (
                CODING_MIN_SWE_BENCH_PRO - 0.5,
                f"SWE-Bench Pro public (Scale Labs): {CODING_MIN_SWE_BENCH_PRO - 0.5:.2f}%.",
            )
        }
        entries = determine_categories("test/low", model, None, pro)
        assert not any(e["category_id"] == "coding" for e in entries)

    def test_model_in_legalbench_gets_legal(self):
        model = make_registry_model("openai/gpt-5")
        legalbench = {"openai/gpt-5": (86.02, "LegalBench (vals.ai): 86.02%.")}
        entries = determine_categories("openai/gpt-5", model, None, {}, legalbench)
        assert len(entries) == 1
        assert entries[0]["category_id"] == "legal"
        assert entries[0]["evidence"] == "LegalBench (vals.ai): 86.02%."

    def test_empty_swe_bench_pro_returns_no_coding(self):
        model = make_registry_model("test/code-model")
        entries = determine_categories("test/code-model", model, None, {})
        assert not any(e["category_id"] == "coding" for e in entries)

    def test_cost_effective_included_when_under_one_dollar(self):
        """Best value category only includes models under $1/1M tokens."""
        model = make_registry_model("test/cheap-model")
        pricing = {
            "test/cheap-model": (0.61, "Avg. $0.61/1M tokens."),
        }
        entries = determine_categories(
            "test/cheap-model", model, None, {}, openrouter_pricing=pricing
        )
        cost_eff = [e for e in entries if e["category_id"] == "cost-effective"]
        assert len(cost_eff) == 1
        assert cost_eff[0]["evidence"] == "Avg. $0.61/1M tokens."

    def test_cost_effective_excluded_at_or_above_one_dollar(self):
        """Models at $1/1M or above are excluded from Best value."""
        model = make_registry_model("test/expensive-model")
        for cost, evidence in [
            (1.0, "Avg. $1.00/1M tokens."),
            (1.12, "Avg. $1.12/1M tokens."),
        ]:
            pricing = {"test/expensive-model": (cost, evidence)}
            entries = determine_categories(
                "test/expensive-model", model, None, {}, openrouter_pricing=pricing
            )
            cost_eff = [e for e in entries if e["category_id"] == "cost-effective"]
            assert len(cost_eff) == 0, f"Expected exclusion for cost={cost}"

    def test_model_in_vision_arena_gets_images(self):
        model = make_registry_model("openai/gpt-4o")
        vision = {"openai/gpt-4o": (1244.0, "Vision Arena (lmarena.ai): 1244.")}
        entries = determine_categories("openai/gpt-4o", model, None, {}, vision_arena_scores=vision)
        images = [e for e in entries if e["category_id"] == "images"]
        assert len(images) == 1
        assert images[0]["evidence"] == "Vision Arena (lmarena.ai): 1244."

    def test_model_below_vision_threshold_excluded(self):
        from scripts.research_model_benchmarks import VISION_MIN_ARENA

        model = make_registry_model("openai/gpt-4o-mini")
        vision = {
            "openai/gpt-4o-mini": (
                VISION_MIN_ARENA - 1,
                f"Vision Arena (lmarena.ai): {int(VISION_MIN_ARENA - 1)}.",
            )
        }
        entries = determine_categories(
            "openai/gpt-4o-mini", model, None, {}, vision_arena_scores=vision
        )
        assert not any(e["category_id"] == "images" for e in entries)


class TestSweBenchProSlugResolution:
    """Scale SWE-Bench Pro slugs vs registry display names (hyphen minors, thinking rows)."""

    def test_expand_hyphen_minor_opus_46(self):
        assert _expand_hyphenated_minor_versions("claude-opus-4-6") == "claude-opus-4.6"
        assert _expand_hyphenated_minor_versions("claude-opus-4.6") == "claude-opus-4.6"

    def test_merge_row_maps_opus_46_thinking_slug(self):
        model_id_to_name = get_model_id_to_name_map()
        result: dict = {}
        _merge_swe_bench_pro_row(result, "claude-opus-4-6 (thinking)*", 51.9, model_id_to_name)
        assert result["anthropic/claude-opus-4.6"] == (
            51.9,
            "SWE-Bench Pro public (Scale Labs): 51.90%.",
        )

    def test_merge_row_maps_gemini_31_pro_thinking_slug(self):
        model_id_to_name = get_model_id_to_name_map()
        result: dict = {}
        _merge_swe_bench_pro_row(result, "gemini-3.1-pro (thinking)*", 46.1, model_id_to_name)
        assert result["google/gemini-3.1-pro-preview"][0] == 46.1


# --- Tests for TS parsing ---


class TestParseRecommendationsTs:
    def test_parses_categories(self):
        cats = parse_recommendations_ts(SAMPLE_TS_CONTENT)
        assert len(cats) == 4
        assert cats[0]["id"] == "coding"
        assert cats[1]["id"] == "writing"
        assert cats[2]["id"] == "reasoning"
        assert cats[3]["id"] == "long-context"

    def test_parses_models_in_category(self):
        cats = parse_recommendations_ts(SAMPLE_TS_CONTENT)
        coding = cats[0]
        assert len(coding["models"]) == 1
        assert coding["models"][0]["modelId"] == "anthropic/claude-opus-5.5"

    def test_parses_labels_and_descriptions(self):
        cats = parse_recommendations_ts(SAMPLE_TS_CONTENT)
        assert cats[0]["label"] == "Best for coding"
        assert cats[1]["label"] == "Best for writing"
        assert cats[0]["description"] == "Code generation, debugging, refactoring"

    def test_empty_content_returns_empty(self):
        cats = parse_recommendations_ts("")
        assert cats == []

    def test_parses_multiline_evidence(self):
        """Multiline evidence (evidence: on one line, string on next) parses correctly."""
        ts = textwrap.dedent("""\
            export const HELP_ME_CHOOSE_CATEGORIES = [
              { id: 'test', label: 'Test', description: 'D', models: [
                { modelId: 'a/b', evidence:
                  'Multiline evidence with newline.',
                },
              ] },
            ]
        """)
        cats = parse_recommendations_ts(ts)
        assert len(cats) == 1
        assert len(cats[0]["models"]) == 1
        assert cats[0]["models"][0]["evidence"] == "Multiline evidence with newline."

    def test_parses_double_quoted_evidence(self):
        """Double-quoted evidence (e.g. with apostrophes) parses correctly."""
        ts = textwrap.dedent("""\
            export const HELP_ME_CHOOSE_CATEGORIES = [
              { id: 'test', label: 'Test', description: 'D', models: [
                { modelId: 'a/b', evidence: "Anthropic's fastest. Low latency." },
              ] },
            ]
        """)
        cats = parse_recommendations_ts(ts)
        assert len(cats) == 1
        assert len(cats[0]["models"]) == 1
        assert "Anthropic's" in cats[0]["models"][0]["evidence"]

    def test_parses_trailing_comma_on_model(self):
        """Model entries with trailing comma before } parse correctly."""
        ts = textwrap.dedent("""\
            export const HELP_ME_CHOOSE_CATEGORIES = [
              { id: 'test', label: 'Test', description: 'D', models: [
                { modelId: 'x/y', evidence: 'With comma.',
                },
              ] },
            ]
        """)
        cats = parse_recommendations_ts(ts)
        assert len(cats[0]["models"]) == 1
        assert cats[0]["models"][0]["modelId"] == "x/y"

    def test_parses_category_info_tooltip(self):
        """categoryInfoTooltip is parsed and preserved."""
        ts = textwrap.dedent("""\
            export const HELP_ME_CHOOSE_CATEGORIES = [
              { id: 'cost-effective', label: 'Best value', description: 'D',
                categoryInfoTooltip: 'Ranked by OpenRouter pricing. Lower = better.',
                models: [
                  { modelId: 'a/b', evidence: 'Avg. $0.61/1M tokens.' },
                ] },
            ]
        """)
        cats = parse_recommendations_ts(ts)
        assert len(cats) == 1
        assert cats[0].get("categoryInfoTooltip") == "Ranked by OpenRouter pricing. Lower = better."


# --- Tests for model_exists_in_category ---


class TestModelExistsInCategory:
    def test_exists(self):
        cats = parse_recommendations_ts(SAMPLE_TS_CONTENT)
        assert model_exists_in_category(cats, "coding", "anthropic/claude-opus-5.5")

    def test_not_exists(self):
        cats = parse_recommendations_ts(SAMPLE_TS_CONTENT)
        assert not model_exists_in_category(cats, "coding", "openai/gpt-5.2")

    def test_wrong_category(self):
        cats = parse_recommendations_ts(SAMPLE_TS_CONTENT)
        assert not model_exists_in_category(cats, "writing", "anthropic/claude-opus-5.5")


# --- Tests for add_model_to_category ---


class TestAddModelToCategory:
    def test_adds_new_model(self):
        cats = parse_recommendations_ts(SAMPLE_TS_CONTENT)
        result = add_model_to_category(cats, "coding", "test/new-model", "SWE-Bench: 75%.")
        assert result is True
        assert cats[0]["models"][-1]["modelId"] == "test/new-model"
        assert cats[0]["models"][-1]["evidence"] == "SWE-Bench: 75%."

    def test_does_not_add_duplicate(self):
        cats = parse_recommendations_ts(SAMPLE_TS_CONTENT)
        result = add_model_to_category(cats, "coding", "anthropic/claude-opus-5.5", "Dup.")
        assert result is False
        assert len(cats[0]["models"]) == 1

    def test_returns_false_for_unknown_category(self):
        cats = parse_recommendations_ts(SAMPLE_TS_CONTENT)
        result = add_model_to_category(cats, "nonexistent-category", "test/model", "Ev.")
        assert result is False


# --- Tests for extract_primary_score ---


class TestExtractPrimaryScore:
    def test_extracts_percentage(self):
        assert (
            extract_primary_score("coding", "SWE-Bench Pro public (Scale Labs): 45.89%.") == 45.89
        )
        assert extract_primary_score("reasoning", "MMLU-Pro: 89.5%.") == 89.5

    def test_extracts_mazur_writing_score(self):
        assert extract_primary_score("writing", "Mazur Writing Score: 8.561.") == 8.561

    def test_extracts_mrcr_fraction(self):
        assert extract_primary_score("long-context", "Michelangelo: 93/100.") == 93.0

    def test_extracts_legalbench_percentage(self):
        assert extract_primary_score("legal", "LegalBench (vals.ai): 87.04%.") == 87.04

    def test_extracts_healthbench_percentage(self):
        assert extract_primary_score("medical", "HealthBench (OpenAI): 60%.") == 60.0

    def test_extracts_cost_effective_dollar_per_million(self):
        assert extract_primary_score("cost-effective", "Avg. $0.61/1M tokens.") == 0.61
        assert extract_primary_score("cost-effective", "Avg. $1.50/1M tokens.") == 1.5

    def test_extracts_fast_tokens_per_second(self):
        assert extract_primary_score("fast", "LMSpeed (lmspeed.net): 1742 t/s.") == 1742.0
        assert extract_primary_score("fast", "LMSpeed: 116 t/s.") == 116.0

    def test_extracts_multilingual_global_mmlu_percentage(self):
        assert extract_primary_score("multilingual", "Global-MMLU (llmdb.com): 88.6%.") == 88.6
        assert extract_primary_score("multilingual", "Global-MMLU: 75.4%.") == 75.4

    def test_extracts_vision_arena_score(self):
        assert extract_primary_score("images", "Vision Arena (lmarena.ai): 1244.") == 1244.0

    def test_returns_none_for_no_score(self):
        assert extract_primary_score("coding", "Provider docs: Code-specialized.") is None


# --- Tests for sort_category_by_scores ---


class TestSortCategoryByScores:
    def test_sorts_by_extracted_score_descending(self):
        cat = {
            "id": "coding",
            "label": "Coding",
            "description": "D",
            "models": [
                {"modelId": "a/low", "evidence": "SWE-Bench: 70%."},
                {"modelId": "b/high", "evidence": "SWE-Bench: 85%."},
                {"modelId": "c/mid", "evidence": "SWE-Bench: 75%."},
            ],
        }
        sort_category_by_scores(cat, None)
        assert [m["modelId"] for m in cat["models"]] == ["b/high", "c/mid", "a/low"]

    def test_uses_fetched_scores_when_provided(self):
        cat = {
            "id": "coding",
            "label": "Coding",
            "description": "D",
            "models": [
                {"modelId": "a/old", "evidence": "No score."},
                {"modelId": "b/fetched", "evidence": "No score."},
            ],
        }
        fetched = {"b/fetched": (90.0, "SWE-Bench: 90%.")}
        sort_category_by_scores(cat, fetched)
        assert cat["models"][0]["modelId"] == "b/fetched"

    def test_models_without_scores_at_end(self):
        cat = {
            "id": "coding",
            "label": "Coding",
            "description": "D",
            "models": [
                {"modelId": "a/no", "evidence": "Qualitative."},
                {"modelId": "b/yes", "evidence": "SWE-Bench: 80%."},
            ],
        }
        sort_category_by_scores(cat, None)
        assert cat["models"][0]["modelId"] == "b/yes"
        assert cat["models"][1]["modelId"] == "a/no"

    def test_cost_effective_sorts_ascending_cheaper_first(self):
        cat = {
            "id": "cost-effective",
            "label": "Best value",
            "description": "D",
            "models": [
                {"modelId": "a/expensive", "evidence": "Avg. $2.00/1M tokens."},
                {"modelId": "b/cheap", "evidence": "Avg. $0.61/1M tokens."},
            ],
        }
        sort_category_by_scores(cat, None)
        assert cat["models"][0]["modelId"] == "b/cheap"
        assert cat["models"][1]["modelId"] == "a/expensive"


# --- Tests for rebuild_categories_ts ---


class TestRebuildCategoriesTs:
    def test_roundtrip_preserves_data(self):
        cats = parse_recommendations_ts(SAMPLE_TS_CONTENT)
        rebuilt = rebuild_categories_ts(cats)
        # Wrap in array syntax for re-parsing
        wrapped = (
            f"export const HELP_ME_CHOOSE_CATEGORIES: HelpMeChooseCategory[] = [\n{rebuilt}\n]"
        )
        reparsed = parse_recommendations_ts(wrapped)
        assert len(reparsed) == len(cats)
        for orig, reparsed_cat in zip(cats, reparsed):
            assert orig["id"] == reparsed_cat["id"]
            assert orig["label"] == reparsed_cat["label"]
            assert len(orig["models"]) == len(reparsed_cat["models"])
            for orig_m, reparsed_m in zip(orig["models"], reparsed_cat["models"]):
                assert orig_m["modelId"] == reparsed_m["modelId"]

    def test_category_info_tooltip_survives_roundtrip(self):
        """categoryInfoTooltip is preserved through parse -> rebuild -> parse."""
        ts = textwrap.dedent("""\
            export const HELP_ME_CHOOSE_CATEGORIES = [
              { id: 'cost-effective', label: 'Best value', description: 'D',
                categoryInfoTooltip: 'Ranked by OpenRouter pricing.',
                models: [
                  { modelId: 'a/b', evidence: 'Avg. $0.61/1M tokens.' },
                ] },
            ]
        """)
        cats = parse_recommendations_ts(ts)
        assert cats[0].get("categoryInfoTooltip") == "Ranked by OpenRouter pricing."
        rebuilt = rebuild_categories_ts(cats)
        wrapped = (
            f"export const HELP_ME_CHOOSE_CATEGORIES: HelpMeChooseCategory[] = [\n{rebuilt}\n]"
        )
        reparsed = parse_recommendations_ts(wrapped)
        assert reparsed[0].get("categoryInfoTooltip") == "Ranked by OpenRouter pricing."


# --- Integration-level tests ---


class TestResearchAndUpdateIntegration:
    """Tests the full research_and_update flow with mocked external calls."""

    def test_model_with_swe_bench_pro_score_added_to_coding(self, tmp_path):
        """A model with SWE-Bench Pro score should be added to the coding category."""
        from scripts.research_model_benchmarks import research_and_update

        ts_file = tmp_path / "helpMeChooseRecommendations.ts"
        ts_file.write_text(SAMPLE_TS_CONTENT, encoding="utf-8")

        registry_data = {
            "models_by_provider": {
                "TestProvider": [
                    make_registry_model(
                        "test/code-wizard",
                        name="Code Wizard",
                        description="A coding model for agentic coding tasks.",
                    )
                ]
            }
        }
        pro_scores = {"test/code-wizard": (36.5, "SWE-Bench Pro public (Scale Labs): 36.50%.")}

        with (
            patch("scripts.research_model_benchmarks.RECOMMENDATIONS_PATH", ts_file),
            patch("scripts.research_model_benchmarks.load_registry", return_value=registry_data),
            patch(
                "scripts.research_model_benchmarks.fetch_swe_bench_pro_scores",
                return_value=pro_scores,
            ),
            patch("scripts.research_model_benchmarks.fetch_legalbench_scores", return_value={}),
            patch("scripts.research_model_benchmarks.fetch_openrouter_pricing", return_value={}),
            patch("scripts.research_model_benchmarks.fetch_lmspeed_scores", return_value={}),
            patch("scripts.research_model_benchmarks.fetch_global_mmlu_scores", return_value={}),
        ):
            result = research_and_update("test/code-wizard")

        assert result["skipped"] is False
        assert "coding" in result["categories_added"]

        updated_content = ts_file.read_text(encoding="utf-8")
        cats = parse_recommendations_ts(updated_content)
        coding = next(c for c in cats if c["id"] == "coding")
        assert any(m["modelId"] == "test/code-wizard" for m in coding["models"])

    def test_model_without_benchmark_not_added(self, tmp_path):
        """A model without SWE-Bench Pro score should not be added (skipped)."""
        from scripts.research_model_benchmarks import research_and_update

        ts_file = tmp_path / "helpMeChooseRecommendations.ts"
        ts_file.write_text(SAMPLE_TS_CONTENT, encoding="utf-8")

        registry_data = {
            "models_by_provider": {
                "TestProvider": [
                    make_registry_model(
                        "test/search-pro",
                        name="Search Pro",
                        supports_web_search=True,
                    )
                ]
            }
        }

        with (
            patch("scripts.research_model_benchmarks.RECOMMENDATIONS_PATH", ts_file),
            patch("scripts.research_model_benchmarks.load_registry", return_value=registry_data),
            patch("scripts.research_model_benchmarks.fetch_swe_bench_pro_scores", return_value={}),
            patch("scripts.research_model_benchmarks.fetch_legalbench_scores", return_value={}),
            patch("scripts.research_model_benchmarks.fetch_openrouter_pricing", return_value={}),
            patch("scripts.research_model_benchmarks.fetch_lmspeed_scores", return_value={}),
            patch("scripts.research_model_benchmarks.fetch_global_mmlu_scores", return_value={}),
        ):
            result = research_and_update("test/search-pro")

        assert result["skipped"] is True
        assert result["reason"] == "no_benchmark_data"

    def test_model_not_in_registry_is_skipped(self, tmp_path):
        """A model not in the registry should be skipped."""
        from scripts.research_model_benchmarks import research_and_update

        ts_file = tmp_path / "helpMeChooseRecommendations.ts"
        ts_file.write_text(SAMPLE_TS_CONTENT, encoding="utf-8")

        registry_data = {"models_by_provider": {}}

        with (
            patch("scripts.research_model_benchmarks.RECOMMENDATIONS_PATH", ts_file),
            patch("scripts.research_model_benchmarks.load_registry", return_value=registry_data),
            patch("scripts.research_model_benchmarks.fetch_swe_bench_pro_scores", return_value={}),
            patch("scripts.research_model_benchmarks.fetch_legalbench_scores", return_value={}),
            patch("scripts.research_model_benchmarks.fetch_openrouter_pricing", return_value={}),
            patch("scripts.research_model_benchmarks.fetch_lmspeed_scores", return_value={}),
            patch("scripts.research_model_benchmarks.fetch_global_mmlu_scores", return_value={}),
        ):
            result = research_and_update("test/nonexistent")

        assert result["skipped"] is True
        assert result["reason"] == "not_in_registry"

    def test_duplicate_not_added(self, tmp_path):
        """A model already in a category should not be added again."""
        from scripts.research_model_benchmarks import research_and_update

        ts_file = tmp_path / "helpMeChooseRecommendations.ts"
        ts_file.write_text(SAMPLE_TS_CONTENT, encoding="utf-8")

        registry_data = {
            "models_by_provider": {"Anthropic": [make_registry_model("anthropic/claude-opus-5.5")]}
        }
        pro = {"anthropic/claude-opus-5.5": (45.89, "SWE-Bench Pro public (Scale Labs): 45.89%.")}

        with (
            patch("scripts.research_model_benchmarks.RECOMMENDATIONS_PATH", ts_file),
            patch("scripts.research_model_benchmarks.load_registry", return_value=registry_data),
            patch(
                "scripts.research_model_benchmarks.fetch_swe_bench_pro_scores",
                return_value=pro,
            ),
            patch("scripts.research_model_benchmarks.fetch_legalbench_scores", return_value={}),
            patch("scripts.research_model_benchmarks.fetch_openrouter_pricing", return_value={}),
            patch("scripts.research_model_benchmarks.fetch_lmspeed_scores", return_value={}),
            patch("scripts.research_model_benchmarks.fetch_global_mmlu_scores", return_value={}),
        ):
            result = research_and_update("anthropic/claude-opus-5.5")

        assert "coding" not in result["categories_added"]

    def test_dry_run_does_not_write(self, tmp_path):
        """Dry run should not modify the TS file."""
        from scripts.research_model_benchmarks import research_and_update

        ts_file = tmp_path / "helpMeChooseRecommendations.ts"
        ts_file.write_text(SAMPLE_TS_CONTENT, encoding="utf-8")
        original_content = ts_file.read_text(encoding="utf-8")

        registry_data = {
            "models_by_provider": {
                "TestProvider": [
                    make_registry_model(
                        "test/dry-run-model",
                        description="A coding model for code generation.",
                    )
                ]
            }
        }
        pro = {"test/dry-run-model": (30.0, "SWE-Bench Pro public (Scale Labs): 30.00%.")}

        with (
            patch("scripts.research_model_benchmarks.RECOMMENDATIONS_PATH", ts_file),
            patch("scripts.research_model_benchmarks.load_registry", return_value=registry_data),
            patch(
                "scripts.research_model_benchmarks.fetch_swe_bench_pro_scores",
                return_value=pro,
            ),
            patch("scripts.research_model_benchmarks.fetch_legalbench_scores", return_value={}),
            patch("scripts.research_model_benchmarks.fetch_openrouter_pricing", return_value={}),
            patch("scripts.research_model_benchmarks.fetch_lmspeed_scores", return_value={}),
            patch("scripts.research_model_benchmarks.fetch_global_mmlu_scores", return_value={}),
        ):
            result = research_and_update("test/dry-run-model", dry_run=True)

        assert result["categories_added"] == ["coding"]
        assert ts_file.read_text(encoding="utf-8") == original_content


# --- Test the actual recommendations file parses correctly ---


class TestActualRecommendationsFile:
    """Validate the real helpMeChooseRecommendations.ts file structure."""

    @pytest.fixture
    def real_ts_content(self):
        real_path = (
            Path(__file__).resolve().parent.parent.parent.parent
            / "frontend"
            / "src"
            / "data"
            / "helpMeChooseRecommendations.ts"
        )
        if not real_path.exists():
            pytest.skip("Recommendations file not found")
        return real_path.read_text(encoding="utf-8")

    def test_real_file_parses(self, real_ts_content):
        cats = parse_recommendations_ts(real_ts_content)
        assert len(cats) >= 4

    def test_all_expected_categories_exist(self, real_ts_content):
        cats = parse_recommendations_ts(real_ts_content)
        cat_ids = {c["id"] for c in cats}
        expected = [
            "coding",
            "writing",
            "reasoning",
            "long-context",
            "cost-effective",
            "fast",
            "multilingual",
            "legal",
            "medical",
            "images",
        ]
        for cat_id in expected:
            assert cat_id in cat_ids, f"Missing category: {cat_id}"

    def test_each_category_has_models(self, real_ts_content):
        cats = parse_recommendations_ts(real_ts_content)
        for cat in cats:
            assert len(cat["models"]) >= 2, f"Category '{cat['id']}' has fewer than 2 models"

    def test_each_model_has_evidence(self, real_ts_content):
        cats = parse_recommendations_ts(real_ts_content)
        for cat in cats:
            for m in cat["models"]:
                assert m["evidence"], f"Model {m['modelId']} in {cat['id']} has empty evidence"
                assert len(m["evidence"]) > 10, (
                    f"Model {m['modelId']} in {cat['id']} has very short evidence: {m['evidence']}"
                )

    def test_model_ids_look_valid(self, real_ts_content):
        cats = parse_recommendations_ts(real_ts_content)
        for cat in cats:
            for m in cat["models"]:
                assert "/" in m["modelId"], f"Invalid model ID format: {m['modelId']}"

    def test_model_ids_exist_in_registry(self, real_ts_content):
        """All ranked Help Me Choose IDs must be in the active lineup (registry)."""
        registry_path = (
            Path(__file__).resolve().parent.parent.parent / "data" / "models_registry.json"
        )
        if not registry_path.exists():
            pytest.skip("Registry file not found")

        with open(registry_path, encoding="utf-8") as f:
            registry = json.load(f)

        lineup_ids = get_lineup_model_ids(registry)
        assert lineup_ids, "Active model lineup (models_by_provider) is empty"

        cats = parse_recommendations_ts(real_ts_content)
        for cat in cats:
            for m in cat["models"]:
                assert m["modelId"] in lineup_ids, (
                    f"Model {m['modelId']} in category '{cat['id']}' is not in the "
                    "active model lineup (models_registry.json models_by_provider)"
                )

    def test_each_model_has_benchmark_score(self, real_ts_content):
        """Each model must have numeric benchmark evidence (extract_primary_score returns non-null)."""
        from scripts.research_model_benchmarks import extract_primary_score

        cats = parse_recommendations_ts(real_ts_content)
        for cat in cats:
            for m in cat["models"]:
                score = extract_primary_score(cat["id"], m["evidence"])
                assert score is not None, (
                    f"Category '{cat['id']}', model '{m['modelId']}': "
                    "must have numeric benchmark score in evidence"
                )


# --- Source-health guard, stale marking, sanity checks ---


class TestSourceHealthGuard:
    def test_zero_rows_is_unhealthy(self):
        ok, reason = evaluate_source_health("fast", fetched_count=0, existing_count=18)
        assert ok is False
        assert "0 models" in reason
        assert "SOURCE UNHEALTHY [fast]" in reason

    def test_far_fewer_than_existing_is_unhealthy(self):
        ok, reason = evaluate_source_health("math", fetched_count=1, existing_count=4)
        assert ok is False
        assert "far fewer" in reason

    def test_healthy_when_comparable_coverage(self):
        ok, reason = evaluate_source_health("writing", fetched_count=8, existing_count=8)
        assert ok is True
        assert reason == ""

    def test_healthy_when_existing_is_empty(self):
        ok, _reason = evaluate_source_health("legal", fetched_count=3, existing_count=0)
        assert ok is True

    def test_exactly_half_is_healthy(self):
        # 2 == 4 * 0.5, so not strictly fewer
        ok, _reason = evaluate_source_health("math", fetched_count=2, existing_count=4)
        assert ok is True

    def test_guard_keeps_existing_and_marks_stale_on_empty_fetch(self):
        categories = [
            {
                "id": "fast",
                "label": "Fastest",
                "description": "D",
                "models": [
                    {"modelId": "openai/gpt-5", "evidence": "LMSpeed (lmspeed.net): 490 t/s."},
                    {"modelId": "openai/gpt-5.2", "evidence": "LMSpeed (lmspeed.net): 171 t/s."},
                ],
            }
        ]
        healthy, stale, warnings = apply_source_health_guard(
            categories, {"fast": {}}, as_of="2026-10-31"
        )
        assert healthy == {}
        assert stale["fast"] == ["openai/gpt-5", "openai/gpt-5.2"]
        assert any("0 models" in w for w in warnings)
        assert "[stale as of 2026-10-31]" in categories[0]["models"][0]["evidence"]
        assert extract_primary_score("fast", categories[0]["models"][0]["evidence"]) == 490.0

    def test_guard_keeps_existing_on_sparse_fetch(self):
        categories = [
            {
                "id": "multilingual",
                "label": "Multilingual",
                "description": "D",
                "models": [
                    {"modelId": "a/one", "evidence": "Global-MMLU (llmdb.com): 88.6%."},
                    {"modelId": "a/two", "evidence": "Global-MMLU (llmdb.com): 75.4%."},
                    {"modelId": "a/three", "evidence": "Global-MMLU (llmdb.com): 72.1%."},
                    {"modelId": "a/four", "evidence": "Global-MMLU (llmdb.com): 70.8%."},
                    {"modelId": "a/five", "evidence": "Global-MMLU (llmdb.com): 68.0%."},
                ],
            }
        ]
        sparse = {"a/one": (88.6, "Global-MMLU (llmdb.com): 88.6%.")}
        healthy, stale, warnings = apply_source_health_guard(
            categories, {"multilingual": sparse}, as_of="2026-10-31"
        )
        assert "multilingual" not in healthy
        assert len(stale["multilingual"]) == 5
        assert any("far fewer" in w for w in warnings)
        assert len(categories[0]["models"]) == 5

    def test_guard_passes_through_healthy_fetch(self):
        categories = [
            {
                "id": "writing",
                "label": "Writing",
                "description": "D",
                "models": [
                    {
                        "modelId": "a/one",
                        "evidence": "Creative Writing Arena (kearai.com): 1490 Elo.",
                    },
                    {
                        "modelId": "a/two",
                        "evidence": "Creative Writing Arena (kearai.com): 1478 Elo.",
                    },
                ],
            }
        ]
        fetched = {
            "a/one": (1490.0, "Creative Writing Arena (kearai.com): 1490 Elo."),
            "a/two": (1478.0, "Creative Writing Arena (kearai.com): 1478 Elo."),
            "a/three": (1450.0, "Creative Writing Arena (kearai.com): 1450 Elo."),
        }
        healthy, stale, warnings = apply_source_health_guard(categories, {"writing": fetched})
        assert healthy["writing"] == fetched
        assert stale == {}
        assert warnings == []
        assert "[stale" not in categories[0]["models"][0]["evidence"]


class TestPlausibleScores:
    def test_rejects_sonnet_13496_tokens_per_sec(self):
        assert is_plausible_score("fast", 13496.0) is False
        assert 13496.0 > FAST_MAX_THROUGHPUT

    def test_accepts_typical_hosted_throughput(self):
        assert is_plausible_score("fast", 236.0) is True
        assert is_plausible_score("fast", 409.8) is True

    def test_rejects_zero_and_negative_throughput(self):
        assert is_plausible_score("fast", 0.0) is False
        assert is_plausible_score("fast", -10.0) is False

    def test_writing_accepts_elo_and_mazur(self):
        assert is_plausible_score("writing", 1490.0) is True
        assert is_plausible_score("writing", 8.561) is True
        assert is_plausible_score("writing", 50.0) is False


class TestFetchDateAndStaleMarkers:
    def test_with_fetch_date_appends_once(self):
        evidence = with_fetch_date("LMSpeed (lmspeed.net): 236 t/s.", fetched_on="2026-10-31")
        assert evidence == "LMSpeed (lmspeed.net): 236 t/s. Fetched 2026-10-31."
        again = with_fetch_date(evidence, fetched_on="2026-11-01")
        assert again == "LMSpeed (lmspeed.net): 236 t/s. Fetched 2026-11-01."
        assert extract_primary_score("fast", again) == 236.0

    def test_mark_evidence_stale_is_idempotent(self):
        evidence = mark_evidence_stale("MATH (llmdb.com): 76.6%.", as_of="2026-10-31")
        assert evidence.endswith("[stale as of 2026-10-31]")
        again = mark_evidence_stale(evidence, as_of="2026-11-01")
        assert again.count("[stale") == 1
        assert "2026-11-01" in again
        assert extract_primary_score("math", again) == 76.6

    def test_attach_fetch_dates_preserves_score(self):
        dated = attach_fetch_dates(
            {"openai/gpt-4o": (76.6, "MATH (llmdb.com): 76.6%.")}, fetched_on="2026-10-31"
        )
        assert dated["openai/gpt-4o"][0] == 76.6
        assert "Fetched 2026-10-31" in dated["openai/gpt-4o"][1]

    def test_mark_category_skips_implausible_rows(self):
        cat = {
            "id": "fast",
            "models": [
                {"modelId": "anthropic/claude-sonnet-4.6", "evidence": "LMSpeed: 13496 t/s."},
                {"modelId": "openai/gpt-5", "evidence": "LMSpeed: 490 t/s."},
            ],
        }
        changed = mark_category_stale(cat, as_of="2026-10-31")
        assert changed == ["openai/gpt-5"]
        assert "[stale" not in cat["models"][0]["evidence"]


class TestLlmdbScoreCell:
    def test_reads_score_span_not_version_number(self):
        from bs4 import BeautifulSoup

        html = (
            "<td><div><span class='text-sm font-medium text-gray-900'>91.8</span>"
            "<div>width:91.8%</div></div></td>"
        )
        cell = BeautifulSoup(html, "html.parser").find("td")
        assert _score_from_llmdb_score_cell(cell) == 91.8


class TestLineupSync:
    def test_get_lineup_model_ids_reads_models_by_provider_only(self):
        registry = {
            "models_by_provider": {
                "OpenAI": [{"id": "openai/gpt-5"}, {"id": "openai/gpt-4o"}],
                "Google": [{"id": "google/gemini-2.5-flash"}],
            },
            "unregistered_tier_models": ["openai/gpt-5"],
            "free_tier_additional_models": ["not-a-lineup/model"],
        }
        assert get_lineup_model_ids(registry) == {
            "openai/gpt-5",
            "openai/gpt-4o",
            "google/gemini-2.5-flash",
        }

    def test_drop_rankings_not_in_lineup_removes_stale_rows(self):
        categories = [
            {
                "id": "coding",
                "models": [
                    {"modelId": "openai/gpt-5", "evidence": "SWE-Bench: 40%."},
                    {"modelId": "retired/old-model", "evidence": "SWE-Bench: 10%."},
                ],
            },
            {
                "id": "writing",
                "models": [
                    {"modelId": "retired/old-model", "evidence": "Elo: 1400."},
                    {"modelId": "openai/gpt-4o", "evidence": "Elo: 1438."},
                ],
            },
        ]
        removed = drop_rankings_not_in_lineup(categories, {"openai/gpt-5", "openai/gpt-4o"})
        assert removed == {
            "coding": ["retired/old-model"],
            "writing": ["retired/old-model"],
        }
        assert [m["modelId"] for m in categories[0]["models"]] == ["openai/gpt-5"]
        assert [m["modelId"] for m in categories[1]["models"]] == ["openai/gpt-4o"]

    def test_report_unranked_lineup_models_is_not_an_error(self, capsys):
        categories = [
            {
                "id": "coding",
                "models": [{"modelId": "openai/gpt-5", "evidence": "SWE-Bench: 40%."}],
            }
        ]
        missing = report_lineup_models_without_rankings(
            {"openai/gpt-5", "anthropic/claude-opus-4.6"}, categories
        )
        assert missing == ["anthropic/claude-opus-4.6"]
        captured = capsys.readouterr()
        assert "report only" in captured.out
        assert "anthropic/claude-opus-4.6" in captured.out

    def test_collect_ranked_model_ids_is_unique(self):
        categories = [
            {"id": "a", "models": [{"modelId": "openai/gpt-5"}, {"modelId": "openai/gpt-4o"}]},
            {"id": "b", "models": [{"modelId": "openai/gpt-5"}]},
        ]
        assert collect_ranked_model_ids(categories) == {"openai/gpt-5", "openai/gpt-4o"}

    def test_sync_rankings_with_lineup_drops_and_reports(self, tmp_path, capsys):
        ts_file = tmp_path / "helpMeChooseRecommendations.ts"
        ts_file.write_text(
            textwrap.dedent(
                """\
                export const HELP_ME_CHOOSE_CATEGORIES: HelpMeChooseCategory[] = [
                  {
                    id: 'coding',
                    label: 'Coding',
                    description: 'D',
                    models: [
                      { modelId: 'openai/gpt-5', evidence: 'SWE-Bench Pro public (Scale Labs): 40%.' },
                      { modelId: 'retired/old-model', evidence: 'SWE-Bench Pro public (Scale Labs): 10%.' },
                    ],
                  },
                  {
                    id: 'writing',
                    label: 'Writing',
                    description: 'D',
                    models: [
                      { modelId: 'openai/gpt-4o', evidence: 'Creative Writing Arena (kearai.com): 1438 Elo.' },
                    ],
                  },
                ]
                """
            ),
            encoding="utf-8",
        )
        reg_file = tmp_path / "models_registry.json"
        reg_file.write_text(
            json.dumps(
                {
                    "models_by_provider": {
                        "OpenAI": [{"id": "openai/gpt-5"}, {"id": "openai/gpt-4o"}],
                    }
                }
            ),
            encoding="utf-8",
        )

        with (
            patch("scripts.research_model_benchmarks.RECOMMENDATIONS_PATH", ts_file),
            patch("scripts.research_model_benchmarks.REGISTRY_PATH", reg_file),
        ):
            result = sync_rankings_with_lineup(dry_run=False)

        assert result["removed"] == {"coding": ["retired/old-model"]}
        assert result["total_changes"] == 1
        assert result["unranked"] == []
        updated = parse_recommendations_ts(ts_file.read_text(encoding="utf-8"))
        coding = next(c for c in updated if c["id"] == "coding")
        assert [m["modelId"] for m in coding["models"]] == ["openai/gpt-5"]
        captured = capsys.readouterr()
        assert "retired/old-model" in captured.err
        assert "Every lineup model has at least one Help Me Choose ranking." in captured.out

    def test_sync_rankings_with_lineup_dry_run_does_not_write(self, tmp_path):
        original = textwrap.dedent(
            """\
            export const HELP_ME_CHOOSE_CATEGORIES: HelpMeChooseCategory[] = [
              {
                id: 'coding',
                label: 'Coding',
                description: 'D',
                models: [
                  { modelId: 'openai/gpt-5', evidence: 'SWE-Bench Pro public (Scale Labs): 40%.' },
                  { modelId: 'retired/old-model', evidence: 'SWE-Bench Pro public (Scale Labs): 10%.' },
                ],
              },
              {
                id: 'writing',
                label: 'Writing',
                description: 'D',
                models: [
                  { modelId: 'openai/gpt-4o', evidence: 'Creative Writing Arena (kearai.com): 1438 Elo.' },
                ],
              },
            ]
            """
        )
        ts_file = tmp_path / "helpMeChooseRecommendations.ts"
        ts_file.write_text(original, encoding="utf-8")
        reg_file = tmp_path / "models_registry.json"
        reg_file.write_text(
            json.dumps(
                {
                    "models_by_provider": {
                        "OpenAI": [{"id": "openai/gpt-5"}, {"id": "openai/gpt-4o"}],
                    }
                }
            ),
            encoding="utf-8",
        )

        with (
            patch("scripts.research_model_benchmarks.RECOMMENDATIONS_PATH", ts_file),
            patch("scripts.research_model_benchmarks.REGISTRY_PATH", reg_file),
        ):
            result = sync_rankings_with_lineup(dry_run=True)

        assert result["total_changes"] == 1
        assert ts_file.read_text(encoding="utf-8") == original
