"""Unit tests for admin model provider name resolution."""

import pytest

pytestmark = pytest.mark.unit

from app.routers.admin.models_management import (
    _display_provider_from_openrouter_slug,
    _normalize_provider_key,
    _resolve_provider_name_for_registry,
)


class TestProviderNameResolution:
    def test_normalize_provider_key_ignores_spaces_and_case(self):
        assert _normalize_provider_key("Moonshot AI") == "moonshotai"
        assert _normalize_provider_key("Moonshotai") == "moonshotai"

    def test_display_provider_from_openrouter_slug_moonshotai(self):
        assert _display_provider_from_openrouter_slug("moonshotai") == "Moonshot AI"

    def test_resolve_provider_reuses_existing_moonshot_ai_bucket(self):
        models_by_provider = {
            "Moonshot AI": [{"id": "moonshotai/kimi-k2.6", "name": "Kimi K2.6"}],
        }
        assert (
            _resolve_provider_name_for_registry("moonshotai/kimi-k3.1-pro", models_by_provider)
            == "Moonshot AI"
        )

    def test_resolve_provider_uses_canonical_name_for_new_provider(self):
        assert _resolve_provider_name_for_registry("moonshotai/kimi-k2.6", {}) == "Moonshot AI"

    @pytest.mark.parametrize("slug", ["meta-llama", "meta", "META"])
    def test_display_provider_maps_meta_slugs_to_meta(self, slug):
        assert _display_provider_from_openrouter_slug(slug) == "Meta"

    def test_resolve_provider_puts_meta_prefix_in_existing_meta_bucket(self):
        models_by_provider = {
            "Meta": [{"id": "meta-llama/llama-4-maverick", "name": "Llama 4 Maverick"}],
        }
        assert (
            _resolve_provider_name_for_registry("meta/muse-spark-1.3", models_by_provider) == "Meta"
        )

    def test_resolve_provider_maps_mistralai_slug_to_mistral_bucket(self):
        models_by_provider = {
            "Mistral": [{"id": "mistralai/mistral-medium-3.1", "name": "Mistral Medium 3.1"}],
        }
        assert _display_provider_from_openrouter_slug("mistralai") == "Mistral"
        assert (
            _resolve_provider_name_for_registry("mistralai/mistral-large-4-0", models_by_provider)
            == "Mistral"
        )

    @pytest.mark.parametrize(
        ("model_id", "expected"),
        [
            ("tencent/hy4-preview", "Tencent"),
            ("stepfun/step-5-preview", "Stepfun"),
        ],
    )
    def test_resolve_provider_new_provider_names_match_icon_keys(self, model_id, expected):
        assert _resolve_provider_name_for_registry(model_id, {}) == expected
