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
    model_exists_in_category,
    parse_recommendations_ts,
    rebuild_categories_ts,
)

# --- Fixtures ---

SAMPLE_TS_CONTENT = textwrap.dedent("""\
    export const HELP_ME_CHOOSE_CATEGORIES: HelpMeChooseCategory[] = [
      {
        id: 'cost-effective',
        label: 'Most cost-effective',
        description: 'Best quality-per-dollar for high-volume use',
        models: [
          { modelId: 'deepseek/deepseek-chat-v3.1', evidence: 'OpenRouter pricing: Value leader.' },
          { modelId: 'google/gemini-2.5-flash', evidence: 'Artificial Analysis Quality Score 51.' },
        ],
      },
      {
        id: 'fast',
        label: 'Fastest responses',
        description: 'Low latency, quick time-to-first-token',
        models: [
          { modelId: 'google/gemini-2.0-flash-001', evidence: 'AILatency: TTFT leader.' },
        ],
      },
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
          { modelId: 'openai/o3', evidence: 'SOTA reasoning.' },
        ],
      },
      {
        id: 'web-search',
        label: 'Best for web search',
        description: 'Real-time retrieval, source citation',
        models: [
          { modelId: 'anthropic/claude-sonnet-4.6', evidence: 'Provider docs: Frontier + native web search.' },
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
    def test_free_model_gets_cost_effective_and_fast(self):
        model = make_registry_model("test/model:free")
        entries = determine_categories("test/model:free", model, None)
        cat_ids = [e["category_id"] for e in entries]
        assert "cost-effective" in cat_ids
        assert "fast" in cat_ids

    def test_cheap_model_gets_cost_effective(self):
        model = make_registry_model("test/cheap-model")
        or_data = make_openrouter_data("test/cheap-model", 0.0000005, 0.0000005)
        entries = determine_categories("test/cheap-model", model, or_data)
        cat_ids = [e["category_id"] for e in entries]
        assert "cost-effective" in cat_ids

    def test_expensive_model_no_cost_effective(self):
        model = make_registry_model("test/expensive-model")
        or_data = make_openrouter_data("test/expensive-model", 0.00005, 0.00005)
        entries = determine_categories("test/expensive-model", model, or_data)
        cat_ids = [e["category_id"] for e in entries]
        assert "cost-effective" not in cat_ids

    def test_code_model_gets_coding(self):
        model = make_registry_model(
            "test/code-model", description="A coding model for code generation."
        )
        entries = determine_categories("test/code-model", model, None)
        cat_ids = [e["category_id"] for e in entries]
        assert "coding" in cat_ids

    def test_coder_in_id_gets_coding(self):
        model = make_registry_model("qwen/qwen3-coder-plus")
        entries = determine_categories("qwen/qwen3-coder-plus", model, None)
        cat_ids = [e["category_id"] for e in entries]
        assert "coding" in cat_ids

    def test_reasoning_model_gets_reasoning(self):
        model = make_registry_model(
            "test/think-model", description="A reasoning and thinking model."
        )
        entries = determine_categories("test/think-model", model, None)
        cat_ids = [e["category_id"] for e in entries]
        assert "reasoning" in cat_ids

    def test_web_search_model_gets_web_search(self):
        model = make_registry_model("test/search-model", supports_web_search=True)
        entries = determine_categories("test/search-model", model, None)
        cat_ids = [e["category_id"] for e in entries]
        assert "web-search" in cat_ids

    def test_no_web_search_no_category(self):
        model = make_registry_model("test/plain-model", supports_web_search=False)
        entries = determine_categories("test/plain-model", model, None)
        cat_ids = [e["category_id"] for e in entries]
        assert "web-search" not in cat_ids

    def test_multilingual_model_gets_multilingual(self):
        model = make_registry_model(
            "test/multi-model",
            description="A model excelling in multilingual understanding across 90+ languages.",
        )
        entries = determine_categories("test/multi-model", model, None)
        cat_ids = [e["category_id"] for e in entries]
        assert "multilingual" in cat_ids

    def test_long_context_model_gets_long_context(self):
        model = make_registry_model(
            "test/long-model",
            description="Flagship model with 1M-token context for text and code.",
        )
        entries = determine_categories("test/long-model", model, None)
        cat_ids = [e["category_id"] for e in entries]
        assert "long-context" in cat_ids

    def test_flash_model_gets_fast(self):
        model = make_registry_model("google/gemini-3-flash-preview")
        entries = determine_categories("google/gemini-3-flash-preview", model, None)
        cat_ids = [e["category_id"] for e in entries]
        assert "fast" in cat_ids

    def test_mini_model_gets_fast(self):
        model = make_registry_model("openai/gpt-5-mini")
        entries = determine_categories("openai/gpt-5-mini", model, None)
        cat_ids = [e["category_id"] for e in entries]
        assert "fast" in cat_ids

    def test_generic_model_may_get_no_categories(self):
        model = make_registry_model("test/generic-model")
        or_data = make_openrouter_data("test/generic-model", 0.00005, 0.00005)
        entries = determine_categories("test/generic-model", model, or_data)
        assert isinstance(entries, list)


# --- Tests for TS parsing ---


class TestParseRecommendationsTs:
    def test_parses_categories(self):
        cats = parse_recommendations_ts(SAMPLE_TS_CONTENT)
        assert len(cats) == 6
        assert cats[0]["id"] == "cost-effective"
        assert cats[1]["id"] == "fast"
        assert cats[2]["id"] == "coding"
        assert cats[3]["id"] == "writing"
        assert cats[4]["id"] == "reasoning"
        assert cats[5]["id"] == "web-search"

    def test_parses_models_in_category(self):
        cats = parse_recommendations_ts(SAMPLE_TS_CONTENT)
        cost_effective = cats[0]
        assert len(cost_effective["models"]) == 2
        assert cost_effective["models"][0]["modelId"] == "deepseek/deepseek-chat-v3.1"
        assert cost_effective["models"][1]["modelId"] == "google/gemini-2.5-flash"

    def test_parses_labels_and_descriptions(self):
        cats = parse_recommendations_ts(SAMPLE_TS_CONTENT)
        assert cats[0]["label"] == "Most cost-effective"
        assert cats[1]["label"] == "Fastest responses"
        assert cats[2]["label"] == "Best for coding"
        assert cats[0]["description"] == "Best quality-per-dollar for high-volume use"

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


# --- Tests for model_exists_in_category ---


class TestModelExistsInCategory:
    def test_exists(self):
        cats = parse_recommendations_ts(SAMPLE_TS_CONTENT)
        assert model_exists_in_category(cats, "cost-effective", "deepseek/deepseek-chat-v3.1")

    def test_not_exists(self):
        cats = parse_recommendations_ts(SAMPLE_TS_CONTENT)
        assert not model_exists_in_category(cats, "cost-effective", "openai/gpt-5.2")

    def test_wrong_category(self):
        cats = parse_recommendations_ts(SAMPLE_TS_CONTENT)
        assert not model_exists_in_category(cats, "coding", "deepseek/deepseek-chat-v3.1")


# --- Tests for add_model_to_category ---


class TestAddModelToCategory:
    def test_adds_new_model(self):
        cats = parse_recommendations_ts(SAMPLE_TS_CONTENT)
        result = add_model_to_category(cats, "cost-effective", "test/new-model", "Test evidence.")
        assert result is True
        assert cats[0]["models"][-1]["modelId"] == "test/new-model"
        assert cats[0]["models"][-1]["evidence"] == "Test evidence."

    def test_does_not_add_duplicate(self):
        cats = parse_recommendations_ts(SAMPLE_TS_CONTENT)
        result = add_model_to_category(
            cats, "cost-effective", "deepseek/deepseek-chat-v3.1", "Dup."
        )
        assert result is False
        assert len(cats[0]["models"]) == 2

    def test_returns_false_for_unknown_category(self):
        cats = parse_recommendations_ts(SAMPLE_TS_CONTENT)
        result = add_model_to_category(cats, "nonexistent-category", "test/model", "Ev.")
        assert result is False


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


# --- Integration-level tests ---


class TestResearchAndUpdateIntegration:
    """Tests the full research_and_update flow with mocked external calls."""

    def test_code_model_added_to_coding_category(self, tmp_path):
        """A code-specialized model should be added to the coding category."""
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

        with (
            patch("scripts.research_model_benchmarks.RECOMMENDATIONS_PATH", ts_file),
            patch("scripts.research_model_benchmarks.load_registry", return_value=registry_data),
            patch("scripts.research_model_benchmarks.fetch_openrouter_model", return_value=None),
        ):
            result = research_and_update("test/code-wizard")

        assert result["skipped"] is False
        assert "coding" in result["categories_added"]

        updated_content = ts_file.read_text(encoding="utf-8")
        cats = parse_recommendations_ts(updated_content)
        coding = next(c for c in cats if c["id"] == "coding")
        assert any(m["modelId"] == "test/code-wizard" for m in coding["models"])

    def test_web_search_model_added_correctly(self, tmp_path):
        """A model with web search should be added to the web-search category."""
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
            patch("scripts.research_model_benchmarks.fetch_openrouter_model", return_value=None),
        ):
            result = research_and_update("test/search-pro")

        assert "web-search" in result["categories_added"]

    def test_model_not_in_registry_is_skipped(self, tmp_path):
        """A model not in the registry should be skipped."""
        from scripts.research_model_benchmarks import research_and_update

        ts_file = tmp_path / "helpMeChooseRecommendations.ts"
        ts_file.write_text(SAMPLE_TS_CONTENT, encoding="utf-8")

        registry_data = {"models_by_provider": {}}

        with (
            patch("scripts.research_model_benchmarks.RECOMMENDATIONS_PATH", ts_file),
            patch("scripts.research_model_benchmarks.load_registry", return_value=registry_data),
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
            "models_by_provider": {"DeepSeek": [make_registry_model("deepseek/deepseek-chat-v3.1")]}
        }
        or_data = make_openrouter_data("deepseek/deepseek-chat-v3.1", 0.0000001, 0.0000001)

        with (
            patch("scripts.research_model_benchmarks.RECOMMENDATIONS_PATH", ts_file),
            patch("scripts.research_model_benchmarks.load_registry", return_value=registry_data),
            patch("scripts.research_model_benchmarks.fetch_openrouter_model", return_value=or_data),
        ):
            result = research_and_update("deepseek/deepseek-chat-v3.1")

        # cost-effective should not be in categories_added since it already exists
        assert "cost-effective" not in result["categories_added"]

    def test_free_model_gets_multiple_categories(self, tmp_path):
        """A free model should be added to both cost-effective and fast."""
        from scripts.research_model_benchmarks import research_and_update

        ts_file = tmp_path / "helpMeChooseRecommendations.ts"
        ts_file.write_text(SAMPLE_TS_CONTENT, encoding="utf-8")

        registry_data = {
            "models_by_provider": {"TestProvider": [make_registry_model("test/free-model:free")]}
        }

        with (
            patch("scripts.research_model_benchmarks.RECOMMENDATIONS_PATH", ts_file),
            patch("scripts.research_model_benchmarks.load_registry", return_value=registry_data),
            patch("scripts.research_model_benchmarks.fetch_openrouter_model", return_value=None),
        ):
            result = research_and_update("test/free-model:free")

        assert result["skipped"] is False
        assert "cost-effective" in result["categories_added"]
        assert "fast" in result["categories_added"]

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

        with (
            patch("scripts.research_model_benchmarks.RECOMMENDATIONS_PATH", ts_file),
            patch("scripts.research_model_benchmarks.load_registry", return_value=registry_data),
            patch("scripts.research_model_benchmarks.fetch_openrouter_model", return_value=None),
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
        assert len(cats) >= 10

    def test_all_expected_categories_exist(self, real_ts_content):
        cats = parse_recommendations_ts(real_ts_content)
        cat_ids = {c["id"] for c in cats}
        expected = [
            "cost-effective",
            "fast",
            "coding",
            "writing",
            "reasoning",
            "multilingual",
            "long-context",
            "legal",
            "medical",
            "web-search",
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

    def test_free_tier_categories_have_unregistered_models_first(self, real_ts_content):
        """Cost-effective and Fastest must list unregistered-tier models first (≥2 for unregistered users)."""
        registry_path = (
            Path(__file__).resolve().parent.parent.parent / "data" / "models_registry.json"
        )
        if not registry_path.exists():
            pytest.skip("Registry file not found")

        with open(registry_path, encoding="utf-8") as f:
            registry = json.load(f)

        unregistered = set(registry.get("unregistered_tier_models", []))

        free_tier_categories = ["cost-effective", "fast"]
        cats = parse_recommendations_ts(real_ts_content)

        for cat in cats:
            if cat["id"] not in free_tier_categories:
                continue
            models = cat["models"]
            # First 2 or more models must be unregistered-tier so unregistered users get ≥2 options
            unregistered_count = sum(1 for m in models if m["modelId"] in unregistered)
            assert unregistered_count >= 2, (
                f"Category '{cat['id']}' has {unregistered_count} unregistered-tier models; "
                "needs ≥2 so unregistered users receive ≥2 recommendations"
            )
            # First 2 models in the list must be unregistered
            first_two = [m["modelId"] for m in models[:2]]
            for mid in first_two:
                assert mid in unregistered, (
                    f"Category '{cat['id']}': first 2 models must be unregistered-tier; "
                    f"'{mid}' is not in unregistered_tier_models"
                )
