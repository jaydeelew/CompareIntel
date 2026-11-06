"""Integration tests for the no-login email unsubscribe endpoints.

These exercise the full request path (GET/POST /api/auth/unsubscribe) so we
confirm the token, the DB write, and the rendered confirmation page all agree,
without requiring any authentication.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import jwt
import pytest

pytestmark = pytest.mark.integration

from app.auth import ALGORITHM, SECRET_KEY, create_access_token, create_unsubscribe_token
from app.services.new_models_notify import get_new_model_notification_recipients
from tests.factories import create_free_user, create_user_preference


class TestUnsubscribeEndpointGet:
    def test_valid_token_unsubscribes_and_shows_confirmation(self, client, db_session):
        user = create_free_user(db_session, email="unsub@example.com")
        create_user_preference(db_session, user, email_notifications=True)
        token = create_unsubscribe_token(user.id, user.email)

        response = client.get("/api/auth/unsubscribe", params={"token": token})

        assert response.status_code == 200
        assert "text/html" in response.headers["content-type"]
        assert "unsubscribed" in response.text.lower()

        db_session.refresh(user)
        assert user.preferences.email_notifications is False

    def test_valid_token_works_without_any_authentication(self, client, db_session):
        """No Authorization header, no cookies: the token alone is the credential."""
        user = create_free_user(db_session, email="noauth@example.com")
        token = create_unsubscribe_token(user.id, user.email)

        assert client.cookies.get("access_token") is None
        response = client.get("/api/auth/unsubscribe", params={"token": token})

        assert response.status_code == 200
        db_session.refresh(user)
        assert user.preferences is not None
        assert user.preferences.email_notifications is False

    def test_creates_preference_row_when_user_never_had_one(self, client, db_session):
        user = create_free_user(db_session, email="firsttime@example.com")
        assert user.preferences is None
        token = create_unsubscribe_token(user.id, user.email)

        response = client.get("/api/auth/unsubscribe", params={"token": token})

        assert response.status_code == 200
        db_session.refresh(user)
        assert user.preferences is not None
        assert user.preferences.email_notifications is False

    def test_missing_token_shows_error_page(self, client):
        response = client.get("/api/auth/unsubscribe")

        assert response.status_code == 400
        assert "invalid" in response.text.lower() or "expired" in response.text.lower()

    def test_garbage_token_shows_error_page(self, client):
        response = client.get("/api/auth/unsubscribe", params={"token": "not-a-real-token"})

        assert response.status_code == 400
        assert "invalid" in response.text.lower() or "expired" in response.text.lower()

    def test_expired_token_shows_error_page_and_does_not_unsubscribe(self, client, db_session):
        user = create_free_user(db_session, email="expired@example.com")
        create_user_preference(db_session, user, email_notifications=True)
        expired_token = jwt.encode(
            {
                "sub": str(user.id),
                "email": user.email,
                "type": "unsubscribe",
                "exp": datetime.now(UTC) - timedelta(days=1),
            },
            SECRET_KEY,
            algorithm=ALGORITHM,
        )

        response = client.get("/api/auth/unsubscribe", params={"token": expired_token})

        assert response.status_code == 400
        db_session.refresh(user)
        assert user.preferences.email_notifications is True

    def test_access_token_is_rejected_at_unsubscribe_endpoint(self, client, db_session):
        """A token minted for a different purpose must not double as an unsubscribe link."""
        user = create_free_user(db_session, email="wrongtype@example.com")
        access_token = create_access_token({"sub": str(user.id)})

        response = client.get("/api/auth/unsubscribe", params={"token": access_token})

        assert response.status_code == 400

    def test_unknown_user_id_shows_error_page(self, client):
        token = create_unsubscribe_token(999999, "ghost@example.com")

        response = client.get("/api/auth/unsubscribe", params={"token": token})

        assert response.status_code == 400

    def test_stale_token_after_email_change_is_rejected(self, client, db_session):
        user = create_free_user(db_session, email="original@example.com")
        token = create_unsubscribe_token(user.id, user.email)

        user.email = "changed@example.com"
        db_session.commit()

        response = client.get("/api/auth/unsubscribe", params={"token": token})

        assert response.status_code == 400

    def test_resubscribe_restores_preference_with_no_login(self, client, db_session):
        user = create_free_user(db_session, email="undo@example.com")
        create_user_preference(db_session, user, email_notifications=True)
        token = create_unsubscribe_token(user.id, user.email)

        unsub_response = client.get("/api/auth/unsubscribe", params={"token": token})
        assert unsub_response.status_code == 200
        db_session.refresh(user)
        assert user.preferences.email_notifications is False

        resub_response = client.get(
            "/api/auth/unsubscribe", params={"token": token, "resubscribe": "true"}
        )
        assert resub_response.status_code == 200
        assert "resubscribed" in resub_response.text.lower()

        db_session.refresh(user)
        assert user.preferences.email_notifications is True


class TestUnsubscribeEndpointOneClickPost:
    def test_post_one_click_unsubscribes_without_extra_confirmation(self, client, db_session):
        """RFC 8058: mail clients POST here directly; no second step is allowed."""
        user = create_free_user(db_session, email="oneclick@example.com")
        create_user_preference(db_session, user, email_notifications=True)
        token = create_unsubscribe_token(user.id, user.email)

        response = client.post(
            "/api/auth/unsubscribe",
            params={"token": token},
            data={"List-Unsubscribe": "One-Click"},
        )

        assert response.status_code == 200
        db_session.refresh(user)
        assert user.preferences.email_notifications is False

    def test_post_with_invalid_token_fails_closed(self, client):
        response = client.post(
            "/api/auth/unsubscribe",
            params={"token": "garbage"},
            data={"List-Unsubscribe": "One-Click"},
        )

        assert response.status_code == 400


class TestUnsubscribeAffectsRecipientLists:
    def test_unsubscribed_user_excluded_from_new_model_notification_recipients(
        self, client, db_session
    ):
        subscribed = create_free_user(db_session, email="stays@example.com")
        unsubscribing = create_free_user(db_session, email="leaves@example.com")
        token = create_unsubscribe_token(unsubscribing.id, unsubscribing.email)

        recipients_before = {u.email for u in get_new_model_notification_recipients(db_session)}
        assert subscribed.email in recipients_before
        assert unsubscribing.email in recipients_before

        response = client.get("/api/auth/unsubscribe", params={"token": token})
        assert response.status_code == 200

        recipients_after = {u.email for u in get_new_model_notification_recipients(db_session)}
        assert subscribed.email in recipients_after
        assert unsubscribing.email not in recipients_after

    def test_v1_prefixed_path_also_works(self, client, db_session):
        """The auth router is mounted at both /api and /api/v1; both must work."""
        user = create_free_user(db_session, email="v1path@example.com")
        token = create_unsubscribe_token(user.id, user.email)

        response = client.get("/api/v1/auth/unsubscribe", params={"token": token})

        assert response.status_code == 200
        db_session.refresh(user)
        assert user.preferences.email_notifications is False
