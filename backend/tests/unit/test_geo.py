"""
Unit tests for geo utilities.

Tests cover:
- get_location_from_ip: IP geolocation, localhost handling, error cases
- get_timezone_from_request: timezone precedence, user preferences, validation
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.utils.geo import get_location_from_ip, get_timezone_from_request


@pytest.mark.unit
class TestGetLocationFromIp:
    """Tests for get_location_from_ip."""

    @pytest.mark.asyncio
    async def test_returns_none_for_empty_ip(self):
        """Empty IP should return None."""
        result = await get_location_from_ip("")
        assert result is None

    @pytest.mark.asyncio
    async def test_returns_none_for_unknown_ip(self):
        """'unknown' IP should return None."""
        result = await get_location_from_ip("unknown")
        assert result is None

    @pytest.mark.asyncio
    async def test_returns_none_for_localhost_127(self):
        """127.x.x.x addresses should return None."""
        result = await get_location_from_ip("127.0.0.1")
        assert result is None

    @pytest.mark.asyncio
    async def test_returns_none_for_private_192_168(self):
        """192.168.x.x addresses should return None."""
        result = await get_location_from_ip("192.168.1.1")
        assert result is None

    @pytest.mark.asyncio
    async def test_returns_none_for_private_10(self):
        """10.x.x.x addresses should return None."""
        result = await get_location_from_ip("10.0.0.1")
        assert result is None

    @pytest.mark.asyncio
    async def test_returns_none_for_ipv6_localhost(self):
        """::1 (IPv6 localhost) should return None."""
        result = await get_location_from_ip("::1")
        assert result is None

    @pytest.mark.asyncio
    async def test_returns_location_on_success(self):
        """Successful ip-api.com response should return location string."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "status": "success",
            "city": "New York",
            "regionName": "New York",
            "country": "United States",
        }

        with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = mock_response

            result = await get_location_from_ip("8.8.8.8")

        assert result == "New York, New York, United States"
        mock_get.assert_called_once()
        call_args = mock_get.call_args
        assert "8.8.8.8" in str(call_args[0])
        assert call_args[1]["params"] == {"fields": "city,regionName,country"}

    @pytest.mark.asyncio
    async def test_returns_none_when_api_status_fail(self):
        """When ip-api returns status != success, return None."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"status": "fail"}

        with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = mock_response

            result = await get_location_from_ip("8.8.8.8")

        assert result is None

    @pytest.mark.asyncio
    async def test_returns_none_on_http_error(self):
        """HTTP error should return None."""
        mock_response = MagicMock()
        mock_response.status_code = 500

        with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = mock_response

            result = await get_location_from_ip("8.8.8.8")

        assert result is None

    @pytest.mark.asyncio
    async def test_returns_none_on_exception(self):
        """Network exception should return None."""
        with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
            mock_get.side_effect = Exception("Network error")

            result = await get_location_from_ip("8.8.8.8")

        assert result is None

    @pytest.mark.asyncio
    async def test_handles_partial_location_data(self):
        """Partial location data (e.g. missing region) should still return formatted string."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "status": "success",
            "city": "London",
            "regionName": "",
            "country": "United Kingdom",
        }

        with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = mock_response

            result = await get_location_from_ip("8.8.8.8")

        assert result == "London, United Kingdom"


@pytest.mark.unit
class TestGetTimezoneFromRequest:
    """Tests for get_timezone_from_request."""

    def test_returns_request_timezone_when_valid(self):
        """Valid timezone from request should be returned."""
        result = get_timezone_from_request("America/Chicago")
        assert result == "America/Chicago"

    def test_returns_request_timezone_when_valid_without_user(self):
        """Valid timezone from request works without user/db."""
        result = get_timezone_from_request("Europe/London", None, None)
        assert result == "Europe/London"

    def test_returns_utc_when_no_timezone_and_no_user(self):
        """No timezone and no user should return UTC."""
        result = get_timezone_from_request(None, None, None)
        assert result == "UTC"

    def test_rejects_invalid_timezone_from_request(self):
        """Invalid timezone from request should fall through to UTC when no user."""
        result = get_timezone_from_request("Invalid/Timezone", None, None)
        assert result == "UTC"

    def test_returns_user_preference_when_no_request_timezone(self, db_session, test_user):
        """When no request timezone, use user's stored preference."""
        from tests.factories import create_user_preference

        pref = create_user_preference(db_session, test_user)
        pref.timezone = "America/Los_Angeles"
        db_session.commit()
        db_session.refresh(test_user)

        result = get_timezone_from_request(None, test_user, db_session)
        assert result == "America/Los_Angeles"

    def test_creates_preference_when_user_has_none_and_valid_request(self, db_session, test_user):
        """When user has no preferences and valid request timezone, create and persist."""
        result = get_timezone_from_request("America/Denver", test_user, db_session)

        assert result == "America/Denver"
        db_session.refresh(test_user)
        assert test_user.preferences is not None
        assert test_user.preferences.timezone == "America/Denver"

    def test_updates_preference_when_timezone_changes(self, db_session, test_user):
        """When request timezone differs from stored, update preference."""
        from tests.factories import create_user_preference

        create_user_preference(db_session, test_user)
        db_session.refresh(test_user)
        test_user.preferences.timezone = "America/New_York"
        db_session.commit()
        db_session.refresh(test_user)

        result = get_timezone_from_request("America/Chicago", test_user, db_session)

        assert result == "America/Chicago"
        db_session.refresh(test_user)
        assert test_user.preferences.timezone == "America/Chicago"

    def test_returns_utc_when_user_preference_invalid(self, db_session, test_user):
        """When user's stored timezone is invalid, return UTC."""
        from tests.factories import create_user_preference

        pref = create_user_preference(db_session, test_user)
        pref.timezone = "Invalid/Zone"
        db_session.commit()
        db_session.refresh(test_user)

        result = get_timezone_from_request(None, test_user, db_session)
        assert result == "UTC"
