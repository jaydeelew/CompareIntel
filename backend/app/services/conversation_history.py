from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

from ..models import Conversation
from ..utils.datetime_utils import to_naive_utc

_NAIVE_MIN = datetime.min


def _sort_key(conv: Conversation) -> datetime:
    """Naive-UTC sort key.

    `conv.updated_at`/`conv.created_at` are normally naive (DB columns have
    no timezone), but a caller could hand us a timezone-aware value (e.g.
    freshly assigned from a client payload before it round-trips through
    the DB). Normalizing here keeps `sorted()` from mixing aware and naive
    datetimes, which raises `TypeError: can't compare offset-naive and
    offset-aware datetimes`.
    """
    value = conv.updated_at or conv.created_at
    if value is None:
        return _NAIVE_MIN
    return to_naive_utc(value) or _NAIVE_MIN


def conversations_to_delete(
    conversations: list[Conversation],
    limit: int,
) -> list[Conversation]:
    """Unsaved rows outside the retention window. Saved rows are kept."""
    if limit < 0:
        return []

    newest_first = sorted(
        conversations,
        key=_sort_key,
        reverse=True,
    )
    saved = [conv for conv in newest_first if conv.saved]
    unsaved = [conv for conv in newest_first if not conv.saved]
    budget = 1 if len(saved) >= limit else max(0, limit - len(saved))
    keep = set(id(conv) for conv in unsaved[:budget])
    return [conv for conv in unsaved if id(conv) not in keep]


def enforce_history_limit(db: Session, user_id: int, limit: int) -> list[int]:
    rows = db.query(Conversation).filter(Conversation.user_id == user_id).all()
    stale = conversations_to_delete(rows, limit)
    ids = [int(conv.id) for conv in stale]
    for conv in stale:
        db.delete(conv)
    return ids
