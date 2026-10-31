"""Unit tests for llm.registry JSON loading and tier filtering."""

import pytest

pytestmark = pytest.mark.unit


from pathlib import Path

from app.llm import registry


class TestLoadRegistry:
    def test_load_registry_returns_dict(self):
        data = registry.load_registry()
        assert isinstance(data, dict)

    def test_registry_has_required_keys(self):
        data = registry.load_registry()
        assert "models_by_provider" in data
        assert "unregistered_tier_models" in data
        assert "free_tier_additional_models" in data

    def test_models_by_provider_is_dict_of_lists(self):
        data = registry.load_registry()
        for provider, models in data["models_by_provider"].items():
            assert isinstance(provider, str)
            assert isinstance(models, list)
            for m in models:
                assert isinstance(m, dict)
                assert "id" in m

    def test_get_registry_path_returns_path(self):
        p = registry.get_registry_path()
        assert isinstance(p, Path)
        assert p.suffix == ".json"
        assert p.exists()


class TestSaveRegistry:
    def test_save_registry_accepts_valid_structure(self):
        original = registry.load_registry()
        registry.save_registry(original)
        loaded = registry.load_registry()
        assert loaded["models_by_provider"] == original["models_by_provider"]
        assert set(loaded["unregistered_tier_models"]) == set(original["unregistered_tier_models"])


class TestCatalogLineup:
    """OpenRouter's default /api/v1/models omits image-output models; keep them in registry."""

    IMAGE_OUTPUT_MODEL_IDS = (
        "black-forest-labs/flux.2-flex",
        "black-forest-labs/flux.2-pro",
        "black-forest-labs/flux.2-klein-4b",
        "black-forest-labs/flux.2-max",
        "black-forest-labs/flux-3-image",
        "bytedance-seed/seedream-4.5",
        "bytedance-seed/seedream-5-0-flash",
        "openai/gpt-image-2.5-sunburst",
        "sourceful/riverflow-v2-fast",
        "sourceful/riverflow-v2-pro",
    )

    def test_image_output_models_remain_in_registry(self):
        ids = registry.get_registry_model_ids()
        missing = [mid for mid in self.IMAGE_OUTPUT_MODEL_IDS if mid not in ids]
        assert missing == []

    def test_retired_qwen_thinking_removed_instruct_kept(self):
        ids = registry.get_registry_model_ids()
        assert "qwen/qwen3-next-80b-a3b-thinking" not in ids
        assert "qwen/qwen3-next-80b-a3b-instruct" in ids


class TestOpenRouterClientKey:
    def test_empty_api_key_is_accepted_by_openai_client(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(registry.settings, "openrouter_api_key", "")
        key = registry.openrouter_api_key_for_client()
        assert key
        from openai import OpenAI

        OpenAI(api_key=key, base_url="https://openrouter.ai/api/v1")


class TestTierFiltering:
    def test_is_model_available_paid_tier_always_true(self):
        model_id = "openai/gpt-4o"
        assert registry.is_model_available_for_tier(model_id, "starter") is True
        assert registry.is_model_available_for_tier(model_id, "pro") is True

    def test_is_model_available_unregistered(self):
        data = registry.load_registry()
        unreg = data["unregistered_tier_models"]
        if unreg:
            model_id = unreg[0]
            assert registry.is_model_available_for_tier(model_id, "unregistered") is True

    def test_filter_models_by_tier_adds_tier_access(self):
        models = [{"id": "openai/gpt-4o", "name": "GPT-4o"}]
        result = registry.filter_models_by_tier(models, "free")
        assert len(result) == 1
        assert result[0]["tier_access"] in ("unregistered", "free", "paid")
