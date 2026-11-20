"""Unknown model ids are dropped before any OpenRouter call."""

from unittest.mock import patch

import pytest

pytestmark = pytest.mark.unit

from app.llm.registry import get_registry_model_ids, omit_unregistered_model_ids

UNKNOWN = "retired/not-in-lineup"


def _registered_id() -> str:
    return sorted(get_registry_model_ids())[0]


def test_omit_unregistered_model_ids_drops_unknown_ids():
    kept = _registered_id()
    assert omit_unregistered_model_ids([UNKNOWN, kept, UNKNOWN]) == [kept]


def test_omit_unregistered_model_ids_leaves_registered_ids_unchanged():
    models = sorted(get_registry_model_ids())[:2]
    assert len(models) == 2
    assert omit_unregistered_model_ids(models) is models


def test_omit_unregistered_model_ids_empty_list():
    assert omit_unregistered_model_ids([]) == []


def test_compare_stream_returns_400_when_every_model_is_unknown(client):
    with patch("app.services.comparison_stream.call_openrouter_streaming") as stream:
        response = client.post(
            "/api/compare-stream",
            json={"input_data": "Hello", "models": [UNKNOWN]},
        )
    assert response.status_code == 400
    assert "no longer available" in response.json()["detail"]
    stream.assert_not_called()


def test_compare_stream_drops_unknown_id_and_streams_the_rest(
    authenticated_client_starter, db_session
):
    client, user, _access, _refresh = authenticated_client_starter
    user.mock_mode_enabled = True
    db_session.commit()
    kept = _registered_id()

    with patch(
        "app.services.comparison_stream.call_openrouter_streaming",
        return_value=iter(["ok"]),
    ) as stream:
        response = client.post(
            "/api/compare-stream",
            json={"input_data": "Hello", "models": [UNKNOWN, kept]},
        )

    assert response.status_code == 200
    body = response.text
    assert UNKNOWN not in body
    assert kept in body
    called_ids = [call.args[1] for call in stream.call_args_list]
    assert called_ids == [kept]
