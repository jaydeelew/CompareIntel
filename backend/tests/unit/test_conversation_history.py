from datetime import UTC, datetime
from types import SimpleNamespace

from app.services.conversation_history import conversations_to_delete


def _conv(
    conv_id: int,
    *,
    saved: bool = False,
    created_offset: int = 0,
    aware: bool = True,
) -> SimpleNamespace:
    created = datetime(2026, 1, 1, tzinfo=UTC if aware else None).replace(day=1 + created_offset)
    return SimpleNamespace(id=conv_id, saved=saved, created_at=created, updated_at=created)


def test_trims_oldest_unsaved_first():
    rows = [_conv(i, created_offset=i) for i in range(5)]
    deleted = conversations_to_delete(rows, limit=3)
    assert [row.id for row in deleted] == [1, 0]


def test_never_deletes_saved_conversations():
    rows = [_conv(0, saved=True, created_offset=0)] + [
        _conv(i, created_offset=i) for i in range(1, 6)
    ]
    deleted = conversations_to_delete(rows, limit=3)
    assert all(not row.saved for row in deleted)
    assert 0 not in [row.id for row in deleted]


def test_keeps_newest_unsaved_when_all_slots_are_saved():
    rows = [_conv(i, saved=True, created_offset=i) for i in range(3)] + [
        _conv(10, created_offset=10),
        _conv(9, created_offset=9),
    ]
    deleted = conversations_to_delete(rows, limit=3)
    assert [row.id for row in deleted] == [9]


def test_negative_limit_deletes_nothing():
    rows = [_conv(i, created_offset=i) for i in range(3)]
    assert conversations_to_delete(rows, limit=-1) == []


def test_handles_mix_of_naive_and_aware_datetimes():
    """Regression test for Sentry COMPAREINTEL-BACKEND-3..7.

    A conversation with a timezone-aware `created_at`/`updated_at` (e.g.
    freshly assigned from an imported, client-supplied timestamp) used to
    be sorted alongside conversations with naive datetimes (as loaded from
    the DB), raising
    `TypeError: can't compare offset-naive and offset-aware datetimes`.
    """
    rows = [
        _conv(0, created_offset=0, aware=False),
        _conv(1, created_offset=1, aware=True),
        _conv(2, created_offset=2, aware=False),
        _conv(3, created_offset=3, aware=True),
        _conv(4, created_offset=4, aware=False),
    ]

    deleted = conversations_to_delete(rows, limit=3)

    assert [row.id for row in deleted] == [1, 0]


def test_handles_none_created_at_mixed_with_aware_datetime():
    naive_missing = SimpleNamespace(id=0, saved=False, created_at=None, updated_at=None)
    aware = _conv(1, created_offset=1, aware=True)

    deleted = conversations_to_delete([naive_missing, aware], limit=1)

    assert [row.id for row in deleted] == [0]
