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

import json
import sys
import textwrap
from pathlib import Path
from unittest.mock import patch

import pytest

# Add backend to path so we can import the script
BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from scripts.research_model_benchmarks import (
    add_model_to_category,
    calculate_avg_cost,
    determine_categories,
    extract_primary_score,
    model_exists_in_category,
    parse_recommendations_ts,
    rebuild_categories_ts,
    sort_category_by_scores,
)

# --- Fixtures ---

SAMPLE_TS_CONTENT = textwrap.dedent("""\
    export const HELP_ME_CHOOSE_CATEGORIES: HelpMeChooseCategory[] = [
      {
        id: 'coding',
        label: 'Best for coding',
        description: 'Code generation, debugging, refactoring',
        models: [
          { modelId: 'anthropic/claude-opus-4.5', evidence: 'SWE-Bench Verified: 80.9%.' },
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
    """Only models with fetched benchmark scores are added. Categories: coding (SWE-bench), legal (LegalBench)."""

    def test_model_in_swebench_gets_coding(self):
        model = make_registry_model("anthropic/claude-opus-4.5")
        swebench = {"anthropic/claude-opus-4.5": (80.9, "SWE-Bench Verified: 80.9%.")}
        entries = determine_categories("anthropic/claude-opus-4.5", model, None, swebench)
        assert len(entries) == 1
        assert entries[0]["category_id"] == "coding"
        assert entries[0]["evidence"] == "SWE-Bench Verified: 80.9%."

    def test_model_not_in_swebench_gets_no_categories(self):
        model = make_registry_model("test/unknown-model")
        swebench = {"anthropic/claude-opus-4.5": (80.9, "SWE-Bench Verified: 80.9%.")}
        entries = determine_categories("test/unknown-model", model, None, swebench)
        assert len(entries) == 0

    def test_model_in_legalbench_gets_legal(self):
        model = make_registry_model("openai/gpt-5")
        legalbench = {"openai/gpt-5": (86.02, "LegalBench (vals.ai): 86.02%.")}
        entries = determine_categories("openai/gpt-5", model, None, {}, legalbench)
        assert len(entries) == 1
        assert entries[0]["category_id"] == "legal"
        assert entries[0]["evidence"] == "LegalBench (vals.ai): 86.02%."

    def test_empty_swebench_returns_empty(self):
        model = make_registry_model("test/code-model")
        entries = determine_categories("test/code-model", model, None, {})
        assert len(entries) == 0

    def test_cost_effective_included_when_under_one_dollar(self):
        """Best value category only includes models under $1/1M tokens."""
        model = make_registry_model("test/cheap-model")
        pricing = {
            "test/cheap-model": (0.61, "OpenRouter avg: $0.61/1M tokens."),
        }
        entries = determine_categories(
            "test/cheap-model", model, None, {}, openrouter_pricing=pricing
        )
        cost_eff = [e for e in entries if e["category_id"] == "cost-effective"]
        assert len(cost_eff) == 1
        assert cost_eff[0]["evidence"] == "OpenRouter avg: $0.61/1M tokens."

    def test_cost_effective_excluded_at_or_above_one_dollar(self):
        """Models at $1/1M or above are excluded from Best value."""
        model = make_registry_model("test/expensive-model")
        for cost, evidence in [
            (1.0, "OpenRouter avg: $1.00/1M tokens."),
            (1.12, "OpenRouter avg: $1.12/1M tokens."),
        ]:
            pricing = {"test/expensive-model": (cost, evidence)}
            entries = determine_categories(
                "test/expensive-model", model, None, {}, openrouter_pricing=pricing
            )
            cost_eff = [e for e in entries if e["category_id"] == "cost-effective"]
            assert len(cost_eff) == 0, f"Expected exclusion for cost={cost}"


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
        assert coding["models"][0]["modelId"] == "anthropic/claude-opus-4.5"

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
                  { modelId: 'a/b', evidence: 'OpenRouter avg: $0.61/1M tokens.' },
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
        assert model_exists_in_category(cats, "coding", "anthropic/claude-opus-4.5")

    def test_not_exists(self):
        cats = parse_recommendations_ts(SAMPLE_TS_CONTENT)
        assert not model_exists_in_category(cats, "coding", "openai/gpt-5.2")

    def test_wrong_category(self):
        cats = parse_recommendations_ts(SAMPLE_TS_CONTENT)
        assert not model_exists_in_category(cats, "writing", "anthropic/claude-opus-4.5")


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
        result = add_model_to_category(cats, "coding", "anthropic/claude-opus-4.5", "Dup.")
        assert result is False
        assert len(cats[0]["models"]) == 1

    def test_returns_false_for_unknown_category(self):
        cats = parse_recommendations_ts(SAMPLE_TS_CONTENT)
        result = add_model_to_category(cats, "nonexistent-category", "test/model", "Ev.")
        assert result is False


# --- Tests for extract_primary_score ---


class TestExtractPrimaryScore:
    def test_extracts_percentage(self):
        assert extract_primary_score("coding", "SWE-Bench Verified: 80.9%.") == 80.9
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
        assert extract_primary_score("cost-effective", "OpenRouter avg: $0.61/1M tokens.") == 0.61
        assert extract_primary_score("cost-effective", "OpenRouter avg: $1.50/1M tokens.") == 1.5

    def test_extracts_fast_tokens_per_second(self):
        assert extract_primary_score("fast", "LMSpeed (lmspeed.net): 1742 t/s.") == 1742.0
        assert extract_primary_score("fast", "LMSpeed: 116 t/s.") == 116.0

    def test_extracts_multilingual_global_mmlu_percentage(self):
        assert extract_primary_score("multilingual", "Global-MMLU (llmdb.com): 88.6%.") == 88.6
        assert extract_primary_score("multilingual", "Global-MMLU: 75.4%.") == 75.4

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
                {"modelId": "a/expensive", "evidence": "OpenRouter avg: $2.00/1M tokens."},
                {"modelId": "b/cheap", "evidence": "OpenRouter avg: $0.61/1M tokens."},
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

    def test_added_model_survives_roundtrip(self):
        cats = parse_recommendations_ts(SAMPLE_TS_CONTENT)
        add_model_to_category(cats, "coding", "x-ai/grok-4", "SWE-Bench 70.6%.")
        rebuilt = rebuild_categories_ts(cats)
        wrapped = (
            f"export const HELP_ME_CHOOSE_CATEGORIES: HelpMeChooseCategory[] = [\n{rebuilt}\n]"
        )
        reparsed = parse_recommendations_ts(wrapped)
        coding = next(c for c in reparsed if c["id"] == "coding")
        assert any(m["modelId"] == "x-ai/grok-4" for m in coding["models"])

    def test_category_info_tooltip_survives_roundtrip(self):
        """categoryInfoTooltip is preserved through parse -> rebuild -> parse."""
        ts = textwrap.dedent("""\
            export const HELP_ME_CHOOSE_CATEGORIES = [
              { id: 'cost-effective', label: 'Best value', description: 'D',
                categoryInfoTooltip: 'Ranked by OpenRouter pricing.',
                models: [
                  { modelId: 'a/b', evidence: 'OpenRouter avg: $0.61/1M tokens.' },
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

    def test_model_with_swebench_score_added_to_coding(self, tmp_path):
        """A model with SWE-bench score should be added to the coding category."""
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
        swebench_scores = {"test/code-wizard": (75.0, "SWE-Bench Verified (openlm.ai): 75.0%.")}

        with (
            patch("scripts.research_model_benchmarks.RECOMMENDATIONS_PATH", ts_file),
            patch("scripts.research_model_benchmarks.load_registry", return_value=registry_data),
            patch(
                "scripts.research_model_benchmarks.fetch_swebench_scores",
                return_value=swebench_scores,
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
        """A model without SWE-bench score should not be added (skipped)."""
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
            patch("scripts.research_model_benchmarks.fetch_swebench_scores", return_value={}),
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
            "models_by_provider": {"Anthropic": [make_registry_model("anthropic/claude-opus-4.5")]}
        }
        swebench = {"anthropic/claude-opus-4.5": (80.9, "SWE-Bench Verified: 80.9%.")}

        with (
            patch("scripts.research_model_benchmarks.RECOMMENDATIONS_PATH", ts_file),
            patch("scripts.research_model_benchmarks.load_registry", return_value=registry_data),
            patch(
                "scripts.research_model_benchmarks.fetch_swebench_scores",
                return_value=swebench,
            ),
            patch("scripts.research_model_benchmarks.fetch_legalbench_scores", return_value={}),
            patch("scripts.research_model_benchmarks.fetch_openrouter_pricing", return_value={}),
            patch("scripts.research_model_benchmarks.fetch_lmspeed_scores", return_value={}),
            patch("scripts.research_model_benchmarks.fetch_global_mmlu_scores", return_value={}),
        ):
            result = research_and_update("anthropic/claude-opus-4.5")

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
        swebench = {"test/dry-run-model": (72.0, "SWE-Bench Verified: 72.0%.")}

        with (
            patch("scripts.research_model_benchmarks.RECOMMENDATIONS_PATH", ts_file),
            patch("scripts.research_model_benchmarks.load_registry", return_value=registry_data),
            patch(
                "scripts.research_model_benchmarks.fetch_swebench_scores",
                return_value=swebench,
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
        """All model IDs in Help Me Choose must exist in the models registry."""
        registry_path = (
            Path(__file__).resolve().parent.parent.parent / "data" / "models_registry.json"
        )
        if not registry_path.exists():
            pytest.skip("Registry file not found")

        with open(registry_path, encoding="utf-8") as f:
            registry = json.load(f)

        all_registry_ids = set()
        for provider_models in registry["models_by_provider"].values():
            for m in provider_models:
                all_registry_ids.add(m["id"])

        cats = parse_recommendations_ts(real_ts_content)
        for cat in cats:
            for m in cat["models"]:
                assert m["modelId"] in all_registry_ids, (
                    f"Model {m['modelId']} in category '{cat['id']}' not found in models registry"
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
