"""Persistence and API schema for per-conversation web search flag."""

from datetime import UTC, datetime

from app.models import Conversation
from app.schemas import ConversationDetail


def test_conversation_model_has_composer_web_search_column():
    assert hasattr(Conversation, "composer_web_search_enabled")


def test_conversation_detail_exposes_composer_web_search_enabled():
    detail = ConversationDetail(
        id=1,
        title=None,
        input_data="hello",
        models_used=["openai/gpt-4o-mini"],
        created_at=datetime.now(UTC),
        messages=[],
        composer_web_search_enabled=True,
    )
    assert detail.composer_web_search_enabled is True
