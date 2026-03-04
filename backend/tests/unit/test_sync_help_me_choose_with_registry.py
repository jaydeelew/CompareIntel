"""Tests for the sync_help_me_choose_with_registry script."""

import json
import sys
import textwrap
from pathlib import Path
from unittest.mock import patch

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from scripts.sync_help_me_choose_with_registry import (
    get_all_registry_model_ids,
    resolve_model_id,
    run_sync,
)

SAMPLE_TS = textwrap.dedent("""\
    export const HELP_ME_CHOOSE_CATEGORIES = [
      { id: 'cost-effective', label: 'Cost', description: 'D', models: [
        { modelId: 'deepseek/deepseek-chat-v3.1', evidence: 'Ev1.' },
        { modelId: 'google/gemini-2.5-flash', evidence: 'Ev2.' },
      ]},
      { id: 'fast', label: 'Fast', description: 'D', models: [
        { modelId: 'google/gemini-2.0-flash-001', evidence: 'Ev.' },
      ]},
    ]
""")


class TestGetAllRegistryModelIds:
    def test_extracts_ids(self):
        registry = {
            "models_by_provider": {
                "A": [{"id": "a/m1"}, {"id": "a/m2"}],
                "B": [{"id": "b/m1"}],
            }
        }
        ids = get_all_registry_model_ids(registry)
        assert ids == {"a/m1", "a/m2", "b/m1"}

    def test_ignores_empty_provider(self):
        registry = {"models_by_provider": {"A": []}}
        assert get_all_registry_model_ids(registry) == set()


class TestResolveModelId:
    def test_exists_returns_same(self):
        ids = {"a/m1", "b/m2"}
        assert resolve_model_id("a/m1", ids) == "a/m1"

    def test_missing_returns_none(self):
        ids = {"a/m1"}
        assert resolve_model_id("x/unknown", ids) is None


class TestRunSync:
    def test_check_passes_when_all_exist(self, tmp_path):
        ts_file = tmp_path / "helpMeChooseRecommendations.ts"
        ts_file.write_text(SAMPLE_TS)
        reg_file = tmp_path / "models_registry.json"
        reg_file.write_text(
            json.dumps(
                {
                    "models_by_provider": {
                        "DeepSeek": [{"id": "deepseek/deepseek-chat-v3.1"}],
                        "Google": [
                            {"id": "google/gemini-2.5-flash"},
                            {"id": "google/gemini-2.0-flash-001"},
                        ],
                    },
                }
            )
        )

        with (
            patch("scripts.sync_help_me_choose_with_registry.RECOMMENDATIONS_PATH", ts_file),
            patch("scripts.sync_help_me_choose_with_registry.REGISTRY_PATH", reg_file),
        ):
            assert run_sync(check_only=True) == 0

    def test_check_fails_when_model_missing(self, tmp_path):
        ts_file = tmp_path / "helpMeChooseRecommendations.ts"
        ts_file.write_text(SAMPLE_TS)
        reg_file = tmp_path / "models_registry.json"
        reg_file.write_text(
            json.dumps(
                {
                    "models_by_provider": {
                        "DeepSeek": [{"id": "deepseek/deepseek-chat-v3.1"}],
                        # missing google/gemini-2.5-flash and google/gemini-2.0-flash-001
                    },
                }
            )
        )

        with (
            patch("scripts.sync_help_me_choose_with_registry.RECOMMENDATIONS_PATH", ts_file),
            patch("scripts.sync_help_me_choose_with_registry.REGISTRY_PATH", reg_file),
        ):
            assert run_sync(check_only=True) == 1
