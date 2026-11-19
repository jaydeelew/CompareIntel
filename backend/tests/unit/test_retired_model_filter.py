"""Retired model ids are dropped before any OpenRouter call."""

from unittest.mock import patch

import pytest

pytestmark = pytest.mark.unit

from app.llm.registry import omit_retired_model_ids

RETIRED = "mistralai/mistral-medium-3.1"
KEPT = "mistralai/mistral-large-4-0"


def test_omit_retired_model_ids_drops_mistral_medium_31():
    assert omit_retired_model_ids([RETIRED, KEPT, RETIRED]) == [KEPT]


def test_omit_retired_model_ids_leaves_live_ids_unchanged():
    models = [KEPT, "openai/gpt-5.2"]
    assert omit_retired_model_ids(models) is models


def test_compare_stream_does_not_call_openrouter_for_only_retired_model(client):
    with patch("app.services.comparison_stream.call_openrouter_streaming") as stream:
        response = client.post(
            "/api/compare-stream",
            json={"input_data": "Hello", "models": [RETIRED]},
        )
    assert response.status_code == 400
    assert "no longer available" in response.json()["detail"]
    stream.assert_not_called()


def test_compare_stream_drops_retired_id_and_calls_the_rest(authenticated_client_starter):
    client, _user, _access, _refresh = authenticated_client_starter
    with patch(
        "app.services.comparison_stream.call_openrouter_streaming",
        return_value=iter(["ok"]),
    ) as stream:
        response = client.post(
            "/api/compare-stream",
            json={"input_data": "Hello", "models": [RETIRED, KEPT]},
        )
    assert response.status_code == 200
    body = response.text
    assert RETIRED not in body
    assert KEPT in body
    called_ids = [call.args[1] for call in stream.call_args_list]
    assert called_ids == [KEPT]
