"""Helpers for normalizing datetimes to the backend's naive-UTC convention.

Database `DateTime` columns in this project are stored without a timezone
(see `app/models.py`), and values default to `func.now()`, which yields
naive datetimes that are implicitly UTC. Client-supplied timestamps (for
example JSON payloads with a trailing "Z") are parsed by Pydantic into
timezone-aware `datetime` objects. Mixing an aware datetime with the naive
datetimes loaded from the database raises
`TypeError: can't compare offset-naive and offset-aware datetimes`
whenever the two are sorted or compared together.

Use `to_naive_utc` whenever an externally supplied datetime is about to be
stored on a model or compared against values loaded from the database.
"""

from __future__ import annotations

from datetime import UTC, datetime


def to_naive_utc(value: datetime | None) -> datetime | None:
    """Convert `value` to a naive UTC datetime, matching stored DB values.

    - `None` is returned unchanged.
    - Timezone-aware datetimes are converted to UTC and stripped of tzinfo.
    - Naive datetimes are assumed to already be UTC and returned as-is.
    """
    if value is None:
        return None
    if value.tzinfo is not None:
        return value.astimezone(UTC).replace(tzinfo=None)
    return value
