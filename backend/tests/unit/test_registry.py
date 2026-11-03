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
        "sourceful/riverflow-v2-pro",
        "sourceful/riverflow-v2.6-pro",
        "qwen/qwen-image-2.1-pro",
    )

    def test_image_output_models_remain_in_registry(self):
        ids = registry.get_registry_model_ids()
        missing = [mid for mid in self.IMAGE_OUTPUT_MODEL_IDS if mid not in ids]
        assert missing == []

    def test_retired_qwen_thinking_removed_instruct_kept(self):
        ids = registry.get_registry_model_ids()
        assert "qwen/qwen3-next-80b-a3b-thinking" not in ids
        assert "qwen/qwen3-next-80b-a3b-instruct" in ids

    def test_weekly_refresh_adds_and_removes(self):
        ids = registry.get_registry_model_ids()
        for model_id in (
            "openai/gpt-6-astra",
            "openai/gpt-6.1-terra",
            "sourceful/riverflow-v2.6-pro",
            "qwen/qwen-image-2.1-pro",
        ):
            assert model_id in ids
        for model_id in (
            "openai/gpt-4o",
            "openai/gpt-5.6-terra",
            "sourceful/riverflow-v2-fast",
            "cohere/command-r7b-12-2024",
        ):
            assert model_id not in ids

    def test_qwen_image_model_is_image_only_and_text_qwen_is_not(self):
        """Qwen text and image models share a prefix, so image-only comes from metadata."""
        from app.llm.registry import (
            get_model_outputs_image_only,
            get_model_supports_image_generation,
            invalidate_openrouter_models_json_caches,
        )

        invalidate_openrouter_models_json_caches()
        assert get_model_supports_image_generation("qwen/qwen-image-2.1-pro") is True
        assert get_model_outputs_image_only("qwen/qwen-image-2.1-pro") is True
        assert get_model_supports_image_generation("qwen/qwen3.8-max-0902") is False
        assert get_model_outputs_image_only("qwen/qwen3.8-max-0902") is False

        qwen = {
            model["id"]: model for model in registry.load_registry()["models_by_provider"]["Qwen"]
        }
        image_model = qwen["qwen/qwen-image-2.1-pro"]
        assert image_model["category"] == "Image"
        assert image_model["supports_image_generation"] is True
        assert image_model["provider"] == "Qwen"


class TestOpenRouterClientKey:
    def test_empty_api_key_is_accepted_by_openai_client(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(registry.settings, "openrouter_api_key", "")
        monkeypatch.setattr(registry.settings, "environment", "development")
        key = registry.openrouter_api_key_for_client()
        assert key
        assert key == registry._MISSING_OPENROUTER_API_KEY
        from openai import OpenAI

        OpenAI(api_key=key, base_url="https://openrouter.ai/api/v1")

    def test_production_empty_key_raises_at_client_construction(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(registry.settings, "openrouter_api_key", "")
        monkeypatch.setattr(registry.settings, "environment", "production")
        with pytest.raises(registry.OpenRouterConfigError, match="OPENROUTER_API_KEY is not set"):
            registry.openrouter_api_key_for_client()

    def test_placeholder_is_rejected_on_request_path(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(registry.settings, "openrouter_api_key", "")
        monkeypatch.setattr(registry.settings, "environment", "development")
        with pytest.raises(
            registry.OpenRouterConfigError, match="OPENROUTER_API_KEY is not configured"
        ):
            registry.require_configured_openrouter_api_key()

        monkeypatch.setattr(
            registry.settings, "openrouter_api_key", registry._MISSING_OPENROUTER_API_KEY
        )
        with pytest.raises(
            registry.OpenRouterConfigError, match="OPENROUTER_API_KEY is not configured"
        ):
            registry.require_configured_openrouter_api_key()

    def test_configured_key_is_returned(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(registry.settings, "openrouter_api_key", "sk-or-v1-real")
        monkeypatch.setattr(registry.settings, "environment", "production")
        assert registry.openrouter_api_key_for_client() == "sk-or-v1-real"
        assert registry.require_configured_openrouter_api_key() == "sk-or-v1-real"

    def test_streaming_request_raises_clear_config_error(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(registry.settings, "openrouter_api_key", "")
        monkeypatch.setattr(registry.settings, "environment", "development")
        from app.llm.streaming import call_openrouter_streaming

        with pytest.raises(
            registry.OpenRouterConfigError, match="OPENROUTER_API_KEY is not configured"
        ):
            next(
                call_openrouter_streaming(
                    prompt="hi", model_id="openai/gpt-4o-mini", use_mock=False
                )
            )


class TestTierFiltering:
    def test_is_model_available_paid_tier_always_true(self):
        model_id = "openai/gpt-4o-mini"
        assert registry.is_model_available_for_tier(model_id, "starter") is True
        assert registry.is_model_available_for_tier(model_id, "pro") is True

    def test_is_model_available_unregistered(self):
        data = registry.load_registry()
        unreg = data["unregistered_tier_models"]
        if unreg:
            model_id = unreg[0]
            assert registry.is_model_available_for_tier(model_id, "unregistered") is True

    def test_filter_models_by_tier_adds_tier_access(self):
        models = [{"id": "openai/gpt-4o-mini", "name": "GPT-4o Mini"}]
        result = registry.filter_models_by_tier(models, "free")
        assert len(result) == 1
        assert result[0]["tier_access"] in ("unregistered", "free", "paid")
