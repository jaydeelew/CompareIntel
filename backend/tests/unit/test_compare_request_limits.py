"""Unit tests for CompareRequest / EstimateTokensRequest input_data max_length."""

from unittest.mock import patch

import pytest
from pydantic import ValidationError

from app.routers.api.core import CompareRequest, EstimateTokensRequest
from app.schemas import INPUT_DATA_MAX_LENGTH

pytestmark = pytest.mark.unit


def _valid_compare_payload(input_data: str) -> dict:
    return {"input_data": input_data, "models": ["openai/gpt-4o"]}


def _valid_estimate_payload(input_data: str) -> dict:
    return {"input_data": input_data, "model_id": "openai/gpt-4o"}


class TestCompareRequestInputDataMaxLength:
    def test_accepts_input_at_max_length(self):
        req = CompareRequest.model_validate(_valid_compare_payload("x" * INPUT_DATA_MAX_LENGTH))
        assert len(req.input_data) == INPUT_DATA_MAX_LENGTH

    def test_rejects_input_over_max_length(self):
        with pytest.raises(ValidationError) as exc_info:
            CompareRequest.model_validate(_valid_compare_payload("x" * (INPUT_DATA_MAX_LENGTH + 1)))
        errors = exc_info.value.errors()
        assert any(err.get("loc") == ("input_data",) for err in errors)
        assert any(err.get("type") == "string_too_long" for err in errors)

    def test_compare_stream_returns_422_before_tokenizing(self, client):
        with (
            patch("app.routers.api.core.estimate_token_count") as estimate,
            patch("app.services.comparison_stream.call_openrouter_streaming") as stream,
        ):
            response = client.post(
                "/api/compare-stream",
                json=_valid_compare_payload("x" * (INPUT_DATA_MAX_LENGTH + 1)),
            )
        assert response.status_code == 422
        estimate.assert_not_called()
        stream.assert_not_called()
        body = response.json()
        assert body["detail"][0]["loc"][-1] == "input_data"
        assert body["detail"][0]["type"] == "string_too_long"


class TestEstimateTokensRequestInputDataMaxLength:
    def test_accepts_input_at_max_length(self):
        req = EstimateTokensRequest.model_validate(
            _valid_estimate_payload("y" * INPUT_DATA_MAX_LENGTH)
        )
        assert len(req.input_data) == INPUT_DATA_MAX_LENGTH

    def test_rejects_input_over_max_length(self):
        with pytest.raises(ValidationError) as exc_info:
            EstimateTokensRequest.model_validate(
                _valid_estimate_payload("y" * (INPUT_DATA_MAX_LENGTH + 1))
            )
        errors = exc_info.value.errors()
        assert any(err.get("loc") == ("input_data",) for err in errors)
        assert any(err.get("type") == "string_too_long" for err in errors)

    def test_estimate_tokens_returns_422_before_tokenizing(self, client):
        with patch("app.routers.api.core.estimate_token_count") as estimate:
            response = client.post(
                "/api/estimate-tokens",
                json=_valid_estimate_payload("y" * (INPUT_DATA_MAX_LENGTH + 1)),
            )
        assert response.status_code == 422
        estimate.assert_not_called()
        body = response.json()
        assert body["detail"][0]["loc"][-1] == "input_data"
        assert body["detail"][0]["type"] == "string_too_long"


class TestOpenAPIInputDataMaxLength:
    def test_compare_and_estimate_schemas_advertise_max_length(self, client):
        schema = client.get("/openapi.json").json()
        components = schema["components"]["schemas"]
        assert components["CompareRequest"]["properties"]["input_data"]["maxLength"] == (
            INPUT_DATA_MAX_LENGTH
        )
        assert components["EstimateTokensRequest"]["properties"]["input_data"]["maxLength"] == (
            INPUT_DATA_MAX_LENGTH
        )
