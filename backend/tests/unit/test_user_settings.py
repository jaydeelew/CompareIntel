"""
Unit tests for user settings/preferences API endpoints.

Tests cover:
- Getting user preferences
- Updating user preferences (zipcode, remember_state_on_logout)
- Deleting all conversations
- Validation of zipcode format
"""

from fastapi import status


class TestUserPreferences:
    """Tests for user preferences endpoints."""

    def test_get_preferences_unauthenticated(self, client):
        """Test getting preferences without authentication returns 401."""
        response = client.get("/api/user/preferences")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_get_preferences_authenticated(self, authenticated_client):
        """Test getting preferences for authenticated user."""
        client, user, access_token, refresh_token = authenticated_client
        response = client.get("/api/user/preferences")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()

        # Check default values
        assert "theme" in data
        assert "email_notifications" in data
        assert "usage_alerts" in data
        assert "zipcode" in data
        assert "remember_state_on_logout" in data

    def test_get_preferences_creates_default_if_not_exists(self, authenticated_client, db_session):
        """Test that getting preferences creates default preferences if they don't exist."""
        client, user, access_token, refresh_token = authenticated_client

        # First, ensure user has no preferences
        from app.models import UserPreference

        db_session.query(UserPreference).filter(UserPreference.user_id == user.id).delete()
        db_session.commit()

        response = client.get("/api/user/preferences")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()

        # Should have default values
        assert data["theme"] == "light"
        assert data["email_notifications"] is True
        assert data["usage_alerts"] is True
        assert data["remember_state_on_logout"] is False

    def test_update_preferences_zipcode(self, authenticated_client):
        """Test updating zipcode preference."""
        client, user, access_token, refresh_token = authenticated_client
        response = client.put("/api/user/preferences", json={"zipcode": "12345"})
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["zipcode"] == "12345"

    def test_update_preferences_zipcode_with_plus4(self, authenticated_client):
        """Test updating zipcode with ZIP+4 format."""
        client, user, access_token, refresh_token = authenticated_client
        response = client.put("/api/user/preferences", json={"zipcode": "12345-6789"})
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["zipcode"] == "12345-6789"

    def test_update_preferences_invalid_zipcode(self, authenticated_client):
        """Test updating with invalid zipcode format returns error."""
        client, user, access_token, refresh_token = authenticated_client
        response = client.put("/api/user/preferences", json={"zipcode": "invalid"})
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT

    def test_update_preferences_clear_zipcode(self, authenticated_client):
        """Test clearing zipcode by setting to null."""
        client, user, access_token, refresh_token = authenticated_client

        # First set a zipcode
        client.put("/api/user/preferences", json={"zipcode": "12345"})

        # Then clear it
        response = client.put("/api/user/preferences", json={"zipcode": None})
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["zipcode"] is None

    def test_update_preferences_remember_state(self, authenticated_client):
        """Test updating remember_state_on_logout preference."""
        client, user, access_token, refresh_token = authenticated_client
        response = client.put("/api/user/preferences", json={"remember_state_on_logout": True})
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["remember_state_on_logout"] is True

    def test_update_preferences_multiple_fields(self, authenticated_client):
        """Test updating multiple preference fields at once."""
        client, user, access_token, refresh_token = authenticated_client
        response = client.put(
            "/api/user/preferences",
            json={"zipcode": "90210", "remember_state_on_logout": True, "theme": "dark"},
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["zipcode"] == "90210"
        assert data["remember_state_on_logout"] is True
        assert data["theme"] == "dark"

    def test_update_preferences_unauthenticated(self, client):
        """Test updating preferences without authentication returns 401."""
        response = client.put("/api/user/preferences", json={"zipcode": "12345"})
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


class TestDeleteAllConversations:
    """Tests for delete all conversations endpoint."""

    def test_delete_all_conversations_unauthenticated(self, client):
        """Test deleting all conversations without authentication returns 401."""
        response = client.delete("/api/conversations/all")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_delete_all_conversations_no_conversations(self, authenticated_client):
        """Test deleting when user has no conversations."""
        client, user, access_token, refresh_token = authenticated_client
        response = client.delete("/api/conversations/all")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["deleted_count"] == 0
        assert "message" in data

    def test_delete_all_conversations_when_user_has_conversations(
        self, authenticated_client, db_session
    ):
        """Test deleting all conversations when user has existing conversations."""
        client, user, access_token, refresh_token = authenticated_client
        import json

        from app.models import Conversation

        # Create some conversations for the user
        for i in range(3):
            conv = Conversation(
                user_id=user.id,
                title=f"Test Conversation {i}",
                input_data=f"Test input {i}",
                models_used=json.dumps(["gpt-4", "claude-3"]),
            )
            db_session.add(conv)
        db_session.commit()

        # Verify conversations were created
        count_before = (
            db_session.query(Conversation).filter(Conversation.user_id == user.id).count()
        )
        assert count_before == 3

        # Delete all
        response = client.delete("/api/conversations/all")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["deleted_count"] == 3

        # Verify they're deleted
        count_after = db_session.query(Conversation).filter(Conversation.user_id == user.id).count()
        assert count_after == 0

    def test_delete_all_conversations_only_own_conversations(self, client, db_session):
        """Test that deleting only affects the current user's conversations."""
        import json

        from app.models import Conversation
        from tests.factories import DEFAULT_TEST_PASSWORD, create_user

        # Create two users
        user1 = create_user(db_session, email="user1@test.com")
        user2 = create_user(db_session, email="user2@test.com")

        # Create conversations for both users
        for i in range(2):
            conv1 = Conversation(
                user_id=user1.id,
                title=f"User1 Conversation {i}",
                input_data=f"Test input {i}",
                models_used=json.dumps(["gpt-4"]),
            )
            conv2 = Conversation(
                user_id=user2.id,
                title=f"User2 Conversation {i}",
                input_data=f"Test input {i}",
                models_used=json.dumps(["claude-3"]),
            )
            db_session.add(conv1)
            db_session.add(conv2)
        db_session.commit()

        # Login as user1 and delete their conversations
        login_response = client.post(
            "/api/auth/login", json={"email": "user1@test.com", "password": DEFAULT_TEST_PASSWORD}
        )
        assert login_response.status_code == status.HTTP_200_OK

        delete_response = client.delete("/api/conversations/all")
        assert delete_response.status_code == status.HTTP_200_OK
        assert delete_response.json()["deleted_count"] == 2

        # Verify user1's conversations are deleted
        user1_count = (
            db_session.query(Conversation).filter(Conversation.user_id == user1.id).count()
        )
        assert user1_count == 0

        # Verify user2's conversations still exist
        user2_count = (
            db_session.query(Conversation).filter(Conversation.user_id == user2.id).count()
        )
        assert user2_count == 2
