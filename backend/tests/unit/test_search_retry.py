"""
Unit tests for search retry logic.

Tests cover:
- RetryConfig initialization
- execute_with_retry success and retry paths
- HTTP 429, 5xx, and network error handling
- _calculate_wait_time with Retry-After and exponential backoff
"""

from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.search.retry import RetryConfig, execute_with_retry


@pytest.mark.unit
class TestRetryConfig:
    """Test RetryConfig initialization."""

    def test_default_values(self):
        """Test RetryConfig with default values."""
        config = RetryConfig()
        assert config.max_retries == 3
        assert config.initial_delay == 2.0
        assert config.max_delay == 30.0
        assert config.jitter_factor == 0.2
        assert config.retry_on_429 is True
        assert config.retry_on_5xx is True
        assert config.retry_on_network_error is True
        assert config.provider_name == "Search Provider"

    def test_custom_values(self):
        """Test RetryConfig with custom values."""
        config = RetryConfig(
            max_retries=5,
            initial_delay=1.0,
            max_delay=60.0,
            jitter_factor=0.5,
            retry_on_429=False,
            provider_name="Custom Provider",
        )
        assert config.max_retries == 5
        assert config.initial_delay == 1.0
        assert config.max_delay == 60.0
        assert config.jitter_factor == 0.5
        assert config.retry_on_429 is False
        assert config.provider_name == "Custom Provider"


@pytest.mark.unit
class TestExecuteWithRetry:
    """Test execute_with_retry function."""

    @pytest.mark.asyncio
    async def test_success_on_first_try(self):
        """Test successful execution on first attempt."""

        async def success_coro():
            return "result"

        config = RetryConfig(max_retries=3)
        result = await execute_with_retry(success_coro, config)
        assert result == "result"

    @pytest.mark.asyncio
    async def test_429_retry_then_success(self):
        """Test 429 rate limit triggers retry, then success."""
        call_count = 0

        async def flaky_coro():
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                response = MagicMock()
                response.status_code = 429
                response.headers = {"Retry-After": "0"}
                response.text = "Rate limited"
                raise httpx.HTTPStatusError("429", request=MagicMock(), response=response)
            return "success"

        config = RetryConfig(max_retries=3, initial_delay=0.01, max_delay=0.1)
        with patch("app.search.retry.asyncio.sleep", new_callable=AsyncMock):
            result = await execute_with_retry(flaky_coro, config, "test query")
        assert result == "success"
        assert call_count == 2

    @pytest.mark.asyncio
    async def test_429_exhaust_retries(self):
        """Test 429 exhausts all retries and raises."""

        async def always_429():
            response = MagicMock()
            response.status_code = 429
            response.headers = {}
            response.text = "Rate limited"
            raise httpx.HTTPStatusError("429", request=MagicMock(), response=response)

        config = RetryConfig(max_retries=2, initial_delay=0.01)
        with patch("app.search.retry.asyncio.sleep", new_callable=AsyncMock):
            with pytest.raises(Exception, match="rate limit exceeded"):
                await execute_with_retry(always_429, config)

    @pytest.mark.asyncio
    async def test_5xx_retry_then_success(self):
        """Test 5xx server error triggers retry, then success."""
        call_count = 0

        async def flaky_coro():
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                response = MagicMock()
                response.status_code = 503
                response.headers = {}
                response.text = "Service unavailable"
                raise httpx.HTTPStatusError("503", request=MagicMock(), response=response)
            return "success"

        config = RetryConfig(max_retries=3, initial_delay=0.01)
        with patch("app.search.retry.asyncio.sleep", new_callable=AsyncMock):
            result = await execute_with_retry(flaky_coro, config)
        assert result == "success"
        assert call_count == 2

    @pytest.mark.asyncio
    async def test_5xx_exhaust_retries(self):
        """Test 5xx exhausts all retries and raises."""

        async def always_5xx():
            response = MagicMock()
            response.status_code = 500
            response.headers = {}
            response.text = "Internal error"
            raise httpx.HTTPStatusError("500", request=MagicMock(), response=response)

        config = RetryConfig(max_retries=2, initial_delay=0.01)
        with patch("app.search.retry.asyncio.sleep", new_callable=AsyncMock):
            with pytest.raises(Exception, match="API error: 500"):
                await execute_with_retry(always_5xx, config)

    @pytest.mark.asyncio
    async def test_network_error_retry_then_success(self):
        """Test network error triggers retry, then success."""
        call_count = 0

        async def flaky_coro():
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise httpx.RequestError("Connection failed")
            return "success"

        config = RetryConfig(max_retries=3, initial_delay=0.01)
        with patch("app.search.retry.asyncio.sleep", new_callable=AsyncMock):
            result = await execute_with_retry(flaky_coro, config)
        assert result == "success"
        assert call_count == 2

    @pytest.mark.asyncio
    async def test_network_error_exhaust_retries(self):
        """Test network error exhausts all retries and raises."""

        async def always_fail():
            raise httpx.ConnectError("Connection refused")

        config = RetryConfig(max_retries=2, initial_delay=0.01)
        with patch("app.search.retry.asyncio.sleep", new_callable=AsyncMock):
            with pytest.raises(Exception, match="Failed to connect"):
                await execute_with_retry(always_fail, config)

    @pytest.mark.asyncio
    async def test_non_retryable_http_error(self):
        """Test 4xx errors are not retried."""

        async def bad_request():
            response = MagicMock()
            response.status_code = 400
            response.headers = {}
            response.text = "Bad request"
            raise httpx.HTTPStatusError("400", request=MagicMock(), response=response)

        config = RetryConfig(max_retries=3)
        with pytest.raises(Exception, match="API error: 400"):
            await execute_with_retry(bad_request, config)

    @pytest.mark.asyncio
    async def test_unexpected_exception_not_retried(self):
        """Test unexpected exceptions are not retried."""

        async def unexpected_error():
            raise ValueError("Unexpected")

        config = RetryConfig(max_retries=3)
        with pytest.raises(ValueError, match="Unexpected"):
            await execute_with_retry(unexpected_error, config)

    @pytest.mark.asyncio
    async def test_429_disabled_no_retry(self):
        """Test 429 is not retried when retry_on_429 is False."""

        async def rate_limited():
            response = MagicMock()
            response.status_code = 429
            response.headers = {}
            response.text = "Rate limited"
            raise httpx.HTTPStatusError("429", request=MagicMock(), response=response)

        config = RetryConfig(max_retries=3, retry_on_429=False)
        with pytest.raises(Exception):
            await execute_with_retry(rate_limited, config)

    @pytest.mark.asyncio
    async def test_429_invalid_retry_after_uses_backoff(self):
        """Test 429 with invalid Retry-After header falls back to exponential backoff."""
        call_count = 0

        async def flaky_coro():
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                response = MagicMock()
                response.status_code = 429
                response.headers = {"Retry-After": "not-a-number"}
                response.text = "Rate limited"
                raise httpx.HTTPStatusError("429", request=MagicMock(), response=response)
            return "success"

        config = RetryConfig(max_retries=3, initial_delay=0.01)
        with patch("app.search.retry.asyncio.sleep", new_callable=AsyncMock):
            result = await execute_with_retry(flaky_coro, config)
        assert result == "success"
