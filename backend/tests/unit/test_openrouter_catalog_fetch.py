"""OpenRouter catalog fetches must include image-output models."""

from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import MagicMock

import pytest

pytestmark = pytest.mark.unit

from app.llm.tokens import OPENROUTER_MODELS_LIST_PARAMS, fetch_all_models_from_openrouter

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(BACKEND_DIR))


def test_openrouter_models_list_params_include_all_output_modalities() -> None:
    assert OPENROUTER_MODELS_LIST_PARAMS == {"output_modalities": "all"}


def test_fetch_all_models_from_openrouter_requests_output_modalities_all(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, object] = {}

    class DummyResponse:
        status_code = 200

        def json(self) -> dict[str, list[dict[str, str]]]:
            return {"data": [{"id": "black-forest-labs/flux.2-pro"}]}

    class DummyClient:
        def __init__(self, timeout: float | None = None) -> None:
            self.timeout = timeout

        def __enter__(self) -> DummyClient:
            return self

        def __exit__(self, *args: object) -> bool:
            return False

        def get(self, url: str, params: dict[str, str] | None = None, headers: dict | None = None):
            captured["url"] = url
            captured["params"] = params
            captured["headers"] = headers
            return DummyResponse()

    monkeypatch.setattr("app.llm.tokens.httpx.Client", DummyClient)

    result = fetch_all_models_from_openrouter()

    assert captured["url"] == "https://openrouter.ai/api/v1/models"
    assert captured["params"] == OPENROUTER_MODELS_LIST_PARAMS
    assert result == {
        "black-forest-labs/flux.2-pro": {"id": "black-forest-labs/flux.2-pro"},
    }


def test_research_benchmarks_pricing_fetch_requests_output_modalities_all(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from scripts.research_model_benchmarks import fetch_openrouter_pricing

    captured: dict[str, object] = {}

    def fake_get(url: str, params: dict[str, str] | None = None, **kwargs: object) -> MagicMock:
        captured["url"] = url
        captured["params"] = params
        response = MagicMock()
        response.status_code = 200
        response.json.return_value = {"data": []}
        return response

    monkeypatch.setattr(
        "scripts.research_model_benchmarks.load_registry",
        lambda: {"models_by_provider": {"Test": [{"id": "vendor/a"}]}},
    )
    monkeypatch.setattr("scripts.research_model_benchmarks.httpx.get", fake_get)

    fetch_openrouter_pricing()

    assert captured["url"] == "https://openrouter.ai/api/v1/models"
    assert captured["params"] == {"output_modalities": "all"}
