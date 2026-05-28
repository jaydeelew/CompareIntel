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
            "Moonshot AI": [{"id": "moonshotai/kimi-k2.5", "name": "Kimi K2.5"}],
        }
        assert (
            _resolve_provider_name_for_registry("moonshotai/kimi-k2.6", models_by_provider)
            == "Moonshot AI"
        )

    def test_resolve_provider_uses_canonical_name_for_new_provider(self):
        assert _resolve_provider_name_for_registry("moonshotai/kimi-k2.6", {}) == "Moonshot AI"
