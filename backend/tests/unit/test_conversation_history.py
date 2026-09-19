from datetime import UTC, datetime
from types import SimpleNamespace

from app.services.conversation_history import conversations_to_delete


def _conv(conv_id: int, *, saved: bool = False, created_offset: int = 0) -> SimpleNamespace:
    created = datetime(2026, 1, 1, tzinfo=UTC).replace(day=1 + created_offset)
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
