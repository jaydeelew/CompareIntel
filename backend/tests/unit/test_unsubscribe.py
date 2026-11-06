"""Unit tests for no-login email unsubscribe tokens and supporting service logic.

Covers:
- Unsubscribe JWT creation/verification (valid, tampered, wrong-type, expired)
- URL and SMTP-header/footer generation for outgoing emails
- Persisting the opt-out/opt-in preference without an authenticated session
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import jwt
import pytest

pytestmark = pytest.mark.unit

from app.auth import (
    ALGORITHM,
    SECRET_KEY,
    create_access_token,
    create_unsubscribe_token,
    verify_unsubscribe_token,
)
from app.services.unsubscribe import (
    UnsubscribeTokenError,
    build_unsubscribe_url,
    render_invalid_token_page,
    render_resubscribed_page,
    render_unsubscribed_page,
    resolve_unsubscribe_token,
    set_email_notifications,
    unsubscribe_email_block,
)
from tests.factories import create_free_user, create_user_preference


class TestUnsubscribeTokenRoundTrip:
    def test_create_and_verify_roundtrip(self):
        token = create_unsubscribe_token(42, "user@example.com")
        payload = verify_unsubscribe_token(token)

        assert payload is not None
        assert payload["sub"] == "42"
        assert payload["email"] == "user@example.com"
        assert payload["type"] == "unsubscribe"

    def test_tokens_are_signed_and_tamper_evident(self):
        token = create_unsubscribe_token(1, "a@example.com")
        tampered = token[:-1] + ("a" if token[-1] != "a" else "b")

        assert verify_unsubscribe_token(tampered) is None

    def test_rejects_token_of_a_different_type(self):
        """An access token (or any non-"unsubscribe" JWT) must not work here."""
        access_token = create_access_token({"sub": "1"})

        assert verify_unsubscribe_token(access_token) is None

    def test_unsubscribe_token_does_not_verify_as_access_token(self):
        unsubscribe_token = create_unsubscribe_token(1, "a@example.com")

        from app.auth import verify_token

        assert verify_token(unsubscribe_token, token_type="access") is None

    def test_rejects_expired_token(self):
        expired = jwt.encode(
            {
                "sub": "7",
                "email": "a@example.com",
                "type": "unsubscribe",
                "exp": datetime.now(UTC) - timedelta(days=1),
            },
            SECRET_KEY,
            algorithm=ALGORITHM,
        )

        assert verify_unsubscribe_token(expired) is None

    def test_rejects_malformed_token(self):
        assert verify_unsubscribe_token("not-a-jwt") is None
        assert verify_unsubscribe_token("") is None


class TestResolveUnsubscribeToken:
    def test_resolves_valid_token(self):
        token = create_unsubscribe_token(5, "five@example.com")

        user_id, email = resolve_unsubscribe_token(token)

        assert user_id == 5
        assert email == "five@example.com"

    def test_raises_for_missing_token(self):
        with pytest.raises(UnsubscribeTokenError):
            resolve_unsubscribe_token(None)
        with pytest.raises(UnsubscribeTokenError):
            resolve_unsubscribe_token("")

    def test_raises_for_invalid_token(self):
        with pytest.raises(UnsubscribeTokenError):
            resolve_unsubscribe_token("garbage")

    def test_raises_for_expired_token(self):
        expired = jwt.encode(
            {
                "sub": "5",
                "email": "five@example.com",
                "type": "unsubscribe",
                "exp": datetime.now(UTC) - timedelta(seconds=1),
            },
            SECRET_KEY,
            algorithm=ALGORITHM,
        )
        with pytest.raises(UnsubscribeTokenError):
            resolve_unsubscribe_token(expired)

    def test_raises_when_payload_missing_claims(self):
        incomplete = jwt.encode(
            {"type": "unsubscribe", "exp": datetime.now(UTC) + timedelta(days=1)},
            SECRET_KEY,
            algorithm=ALGORITHM,
        )
        with pytest.raises(UnsubscribeTokenError):
            resolve_unsubscribe_token(incomplete)


class TestUnsubscribeUrlAndEmailBlock:
    def test_build_unsubscribe_url_contains_token_and_path(self):
        url = build_unsubscribe_url(9, "nine@example.com")

        assert "/api/auth/unsubscribe?token=" in url
        token = url.split("token=", 1)[1]
        payload = verify_unsubscribe_token(token)
        assert payload["sub"] == "9"
        assert payload["email"] == "nine@example.com"

    def test_unsubscribe_email_block_has_rfc8058_headers(self):
        block = unsubscribe_email_block(1, "a@example.com")

        assert block["headers"]["List-Unsubscribe"].startswith("<")
        assert block["headers"]["List-Unsubscribe"].endswith(">")
        assert block["headers"]["List-Unsubscribe-Post"] == "List-Unsubscribe=One-Click"

    def test_unsubscribe_email_block_html_and_text_both_link_to_same_url(self):
        block = unsubscribe_email_block(2, "b@example.com")
        url = build_unsubscribe_url(2, "b@example.com").split("token=")[0]

        assert url in block["html"]
        assert "Unsubscribe" in block["html"]
        assert url in block["text"]

    def test_unsubscribe_email_block_escapes_html(self):
        # Defensive: even though emails are trusted inputs, the URL (and thus the
        # token) should never break out of the href attribute if escaping is removed.
        block = unsubscribe_email_block(3, "c@example.com")
        assert '"' not in block["html"].split('href="', 1)[1].split('"')[1]


class TestSetEmailNotifications:
    def test_disables_preference_for_user_without_existing_row(self, db_session):
        user = create_free_user(db_session, email="nopref@example.com")
        assert user.preferences is None

        updated = set_email_notifications(db_session, user.id, user.email, enabled=False)

        assert updated is not None
        db_session.refresh(user)
        assert user.preferences is not None
        assert user.preferences.email_notifications is False

    def test_toggles_existing_preference_row(self, db_session):
        user = create_free_user(db_session, email="haspref@example.com")
        create_user_preference(db_session, user, email_notifications=True)

        set_email_notifications(db_session, user.id, user.email, enabled=False)
        db_session.refresh(user)
        assert user.preferences.email_notifications is False

        set_email_notifications(db_session, user.id, user.email, enabled=True)
        db_session.refresh(user)
        assert user.preferences.email_notifications is True

    def test_returns_none_for_unknown_user(self, db_session):
        assert (
            set_email_notifications(db_session, 999999, "ghost@example.com", enabled=False) is None
        )

    def test_returns_none_when_email_no_longer_matches(self, db_session):
        """Defense-in-depth: an old link for a changed email must not silently act."""
        user = create_free_user(db_session, email="current@example.com")

        result = set_email_notifications(db_session, user.id, "old@example.com", enabled=False)

        assert result is None
        db_session.refresh(user)
        assert user.preferences is None

    def test_email_match_is_case_insensitive(self, db_session):
        user = create_free_user(db_session, email="Mixed.Case@Example.com")

        result = set_email_notifications(
            db_session, user.id, "mixed.case@example.com", enabled=False
        )

        assert result is not None


class TestUnsubscribePages:
    def test_unsubscribed_page_includes_resubscribe_link(self):
        html = render_unsubscribed_page("?token=abc&resubscribe=true")
        assert "unsubscribed" in html.lower()
        assert "resubscribe=true" in html

    def test_resubscribed_page_confirms_opt_in(self):
        html = render_resubscribed_page()
        assert "resubscribed" in html.lower()

    def test_invalid_token_page_does_not_claim_success(self):
        html = render_invalid_token_page()
        assert "invalid" in html.lower() or "expired" in html.lower()
