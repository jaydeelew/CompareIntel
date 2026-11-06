import json

import pytest
from fastapi import status

from app.models import Conversation, ConversationMessage
from app.schemas import ImportedConversation, ImportedConversationMessage

pytestmark = pytest.mark.unit


class TestConversationSavedAndImport:
    def test_patch_saved_flag(self, authenticated_client, db_session):
        client, user, _access_token, _refresh_token = authenticated_client
        conv = Conversation(
            user_id=user.id,
            input_data="Keep this one",
            models_used=json.dumps(["openai/gpt-4o-mini"]),
        )
        db_session.add(conv)
        db_session.commit()

        response = client.patch(f"/api/conversations/{conv.id}", json={"saved": True})
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["saved"] is True

        db_session.refresh(conv)
        assert conv.saved is True

    def test_import_conversations(self, authenticated_client, db_session):
        client, user, _access_token, _refresh_token = authenticated_client
        response = client.post(
            "/api/conversations/import",
            json={
                "conversations": [
                    {
                        "input_data": "Device chat",
                        "models_used": ["openai/gpt-4o-mini"],
                        "client_source": "extension",
                        "saved": True,
                        "messages": [
                            {"role": "user", "content": "Device chat"},
                            {
                                "role": "assistant",
                                "content": "Hello",
                                "model_id": "openai/gpt-4o-mini",
                            },
                        ],
                    }
                ]
            },
        )
        assert response.status_code == status.HTTP_200_OK
        imported_ids = response.json()["imported_ids"]
        assert len(imported_ids) == 1

        stored = db_session.query(Conversation).filter(Conversation.user_id == user.id).one()
        assert stored.input_data == "Device chat"
        assert stored.saved is True
        assert stored.client_source == "extension"
        messages = (
            db_session.query(ConversationMessage)
            .filter(ConversationMessage.conversation_id == stored.id)
            .all()
        )
        assert len(messages) == 2

    def test_import_keeps_request_order_when_an_item_is_skipped(
        self, authenticated_client, db_session
    ):
        client, _user, _access_token, _refresh_token = authenticated_client
        response = client.post(
            "/api/conversations/import",
            json={
                "conversations": [
                    {
                        "input_data": "No user turn",
                        "models_used": ["openai/gpt-4o-mini"],
                        "messages": [{"role": "assistant", "content": "Hello"}],
                    },
                    {
                        "input_data": "Keep me",
                        "models_used": ["openai/gpt-4o-mini"],
                        "messages": [{"role": "user", "content": "Keep me"}],
                    },
                ]
            },
        )
        assert response.status_code == status.HTTP_200_OK
        payload = response.json()
        assert payload["skipped"] == 1
        assert payload["imported_ids"][0] is None
        assert payload["imported_ids"][1] is not None

    def test_import_with_tz_aware_created_at_does_not_raise_when_compared_to_naive_rows(
        self, authenticated_client, db_session
    ):
        """Regression test for Sentry COMPAREINTEL-BACKEND-3..7.

        `app.routers.api.conversations.import_conversations` previously
        assigned a client-supplied (and often timezone-aware, e.g. from a
        "Z"-suffixed ISO timestamp) `created_at` straight onto the ORM
        model. DB-loaded rows store naive datetimes, so sorting them
        together in `enforce_history_limit` raised:
        `TypeError: can't compare offset-naive and offset-aware datetimes`.
        """
        client, user, _access_token, _refresh_token = authenticated_client

        # An existing conversation already persisted with the DB's naive
        # `func.now()` default, as in production.
        existing = Conversation(
            user_id=user.id,
            input_data="Existing naive row",
            models_used=json.dumps(["openai/gpt-4o-mini"]),
        )
        db_session.add(existing)
        db_session.commit()
        assert existing.created_at.tzinfo is None

        # The client (e.g. the browser extension) sends an explicit,
        # timezone-aware timestamp, as `Date.prototype.toISOString()` does.
        response = client.post(
            "/api/conversations/import",
            json={
                "conversations": [
                    {
                        "input_data": "Imported with aware timestamp",
                        "models_used": ["openai/gpt-4o-mini"],
                        "created_at": "2026-11-06T02:34:00Z",
                        "messages": [
                            {
                                "role": "user",
                                "content": "Imported with aware timestamp",
                                "created_at": "2026-11-06T02:34:00Z",
                            },
                        ],
                    }
                ]
            },
        )

        assert response.status_code == status.HTTP_200_OK
        imported_ids = response.json()["imported_ids"]
        assert imported_ids[0] is not None

        imported = db_session.query(Conversation).filter(Conversation.id == imported_ids[0]).one()
        # Stored naive, matching every other row (implicitly UTC).
        assert imported.created_at.tzinfo is None
        assert imported.created_at.isoformat() == "2026-11-06T02:34:00"

    def test_imported_conversation_schema_accepts_naive_and_aware_timestamps(self):
        """Pydantic happily parses both; the route must normalize either."""
        naive = ImportedConversation(
            input_data="naive",
            models_used=["openai/gpt-4o-mini"],
            messages=[ImportedConversationMessage(role="user", content="hi")],
            created_at="2026-11-06T02:34:00",
        )
        aware = ImportedConversation(
            input_data="aware",
            models_used=["openai/gpt-4o-mini"],
            messages=[ImportedConversationMessage(role="user", content="hi")],
            created_at="2026-11-06T02:34:00Z",
        )
        assert naive.created_at.tzinfo is None
        assert aware.created_at.tzinfo is not None
