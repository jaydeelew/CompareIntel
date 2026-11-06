from datetime import UTC, datetime, timedelta, timezone

from app.utils.datetime_utils import to_naive_utc


def test_none_passes_through():
    assert to_naive_utc(None) is None


def test_naive_datetime_is_returned_unchanged():
    naive = datetime(2026, 11, 6, 2, 34, 0)
    assert to_naive_utc(naive) == naive
    assert to_naive_utc(naive).tzinfo is None


def test_utc_aware_datetime_is_stripped_of_tzinfo():
    aware = datetime(2026, 11, 6, 2, 34, 0, tzinfo=UTC)
    result = to_naive_utc(aware)
    assert result == datetime(2026, 11, 6, 2, 34, 0)
    assert result.tzinfo is None


def test_non_utc_aware_datetime_is_converted_to_utc_before_stripping():
    offset = timezone(timedelta(hours=-5))
    aware = datetime(2026, 11, 6, 2, 34, 0, tzinfo=offset)
    result = to_naive_utc(aware)
    assert result == datetime(2026, 11, 6, 7, 34, 0)
    assert result.tzinfo is None
