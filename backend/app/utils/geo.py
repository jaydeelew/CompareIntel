"""Geolocation and timezone utilities."""

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from ..models import User


async def get_location_from_ip(ip_address: str) -> str | None:
    """
    Get approximate location from IP address using a geolocation service.
    Returns location string like "New York, NY, USA" or None if unavailable.
    Uses ip-api.com free tier (45 requests/minute, no API key required).
    """
    from ..config.settings import settings

    if not ip_address or ip_address == "unknown":
        return None

    if (
        ip_address.startswith("127.")
        or ip_address.startswith("192.168.")
        or ip_address.startswith("10.")
        or ip_address == "::1"
    ):
        return None

    try:
        import httpx

        async with httpx.AsyncClient(timeout=2.0) as client:
            response = await client.get(
                f"http://ip-api.com/json/{ip_address}",
                params={"fields": "city,regionName,country"},
            )
            if response.status_code == 200:
                data = response.json()
                if data.get("status") == "success":
                    city = data.get("city", "")
                    region = data.get("regionName", "")
                    country = data.get("country", "")
                    parts = [p for p in [city, region, country] if p]
                    location_str = ", ".join(parts) if parts else None
                    if location_str:
                        return location_str
    except Exception as e:
        if settings.environment == "development":
            logging.getLogger(__name__).debug(f"Geolocation lookup failed for IP {ip_address}: {e}")

    return None


def get_timezone_from_request(
    timezone: str | None,
    current_user: "User | None" = None,
    db: "Session | None" = None,
) -> str:
    """
    Get timezone from request, user preferences, or default to UTC.

    Priority:
    1. Timezone from request body
    2. User's stored timezone preference (for authenticated users)
    3. Default to UTC
    """
    import pytz

    if timezone:
        try:
            pytz.timezone(timezone)
            if current_user and db:
                if not current_user.preferences:
                    from ..models import UserPreference

                    current_user.preferences = UserPreference(
                        user_id=current_user.id, timezone=timezone
                    )
                    db.commit()
                elif current_user.preferences.timezone != timezone:
                    current_user.preferences.timezone = timezone
                    db.commit()
            return timezone
        except (pytz.exceptions.UnknownTimeZoneError, AttributeError):
            pass

    if current_user and db:
        db.refresh(current_user)
        if current_user.preferences and current_user.preferences.timezone:
            try:
                pytz.timezone(current_user.preferences.timezone)
                return current_user.preferences.timezone
            except (pytz.exceptions.UnknownTimeZoneError, AttributeError):
                pass

    return "UTC"
