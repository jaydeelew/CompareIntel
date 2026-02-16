"""Unit tests for llm.registry JSON loading and tier filtering."""

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
