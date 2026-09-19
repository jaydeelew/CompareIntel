from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from ..models import Conversation


def conversations_to_delete(
    conversations: list[Conversation],
    limit: int,
) -> list[Conversation]:
    """Unsaved rows outside the retention window. Saved rows are kept."""
    if limit < 0:
        return []

    newest_first = sorted(
        conversations,
        key=lambda conv: conv.updated_at or conv.created_at or datetime.min,
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
