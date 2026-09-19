import json

import pytest
from fastapi import status

from app.models import Conversation, ConversationMessage

pytestmark = pytest.mark.unit


class TestConversationSavedAndImport:
    def test_patch_saved_flag(self, authenticated_client, db_session):
        client, user, _access_token, _refresh_token = authenticated_client
        conv = Conversation(
            user_id=user.id,
            input_data="Keep this one",
            models_used=json.dumps(["openai/gpt-4o"]),
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
                        "models_used": ["openai/gpt-4o"],
                        "client_source": "extension",
                        "saved": True,
                        "messages": [
                            {"role": "user", "content": "Device chat"},
                            {
                                "role": "assistant",
                                "content": "Hello",
                                "model_id": "openai/gpt-4o",
                            },
                        ],
                    }
                ]
            },
        )
        assert response.status_code == status.HTTP_200_OK
        imported_ids = response.json()["imported_ids"]
        assert len(imported_ids) == 1

        stored = (
            db_session.query(Conversation).filter(Conversation.user_id == user.id).one()
        )
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
                        "models_used": ["openai/gpt-4o"],
                        "messages": [{"role": "assistant", "content": "Hello"}],
                    },
                    {
                        "input_data": "Keep me",
                        "models_used": ["openai/gpt-4o"],
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
