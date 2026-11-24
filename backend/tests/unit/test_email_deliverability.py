"""Unit tests for skipping email to reserved and undeliverable domains."""

from __future__ import annotations

import importlib
import logging
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from fastapi import status

pytestmark = pytest.mark.unit

from app.email_deliverability import (
    MAIL_UNDELIVERABLE_DOMAINS_ENV,
    is_undeliverable_email,
    split_deliverable,
    undeliverable_domain_suffixes,
)

BACKEND_ROOT = Path(__file__).resolve().parents[2]
EMAIL_SERVICE_PATH = BACKEND_ROOT / "app" / "email_service.py"


class TestUndeliverableDomains:
    @pytest.mark.parametrize(
        "address",
        [
            "user@test.com",
            "User@TEST.COM",
            "user@mail.test.com",
            "user@example.com",
            "user@dept.example.com",
            "user@example.net",
            "user@example.org",
            "user@foo.example",
            "user@foo.test",
            "user@foo.invalid",
            "user@invalid",
            "user@localhost",
            "user@api.localhost",
            "user@test",
            "user@example",
            "Ops <qa@test.com>",
        ],
    )
    def test_reserved_and_known_undeliverable_domains(self, address: str):
        assert is_undeliverable_email(address) is True

    @pytest.mark.parametrize(
        "address",
        [
            "user@compareintel.com",
            "user@mytest.com",
            "user@example.com.attacker.com",
            "user@notexample.com",
            "user@localhost.com",
            "not-an-email",
        ],
    )
    def test_deliverable_addresses_are_kept(self, address: str):
        assert is_undeliverable_email(address) is False

    def test_object_with_email_attribute(self):
        assert is_undeliverable_email(SimpleNamespace(email="qa@test.com")) is True
        assert is_undeliverable_email(SimpleNamespace(email="qa@compareintel.com")) is False

    def test_blank_env_keeps_defaults(self, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setenv(MAIL_UNDELIVERABLE_DOMAINS_ENV, "  ")
        assert "test.com" in undeliverable_domain_suffixes()
        assert is_undeliverable_email("qa@test.com") is True

    def test_env_override_replaces_the_default_list(self, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setenv(MAIL_UNDELIVERABLE_DOMAINS_ENV, " mailinator.com , .Guerrillamail.com ")
        suffixes = undeliverable_domain_suffixes()
        assert suffixes == frozenset({"mailinator.com", "guerrillamail.com"})
        assert is_undeliverable_email("qa@test.com") is False
        assert is_undeliverable_email("qa@mailinator.com") is True
        assert is_undeliverable_email("qa@spam.guerrillamail.com") is True

    def test_split_logs_skips_at_info(self, caplog: pytest.LogCaptureFixture):
        recipients = ["keep@compareintel.com", "drop@test.com", "also@example.org"]
        with caplog.at_level(logging.INFO, logger="app.email_deliverability"):
            deliverable, skipped = split_deliverable(recipients, subject="Hello", log=True)

        assert deliverable == ["keep@compareintel.com"]
        assert skipped == ["drop@test.com", "also@example.org"]
        assert "Skipping email to undeliverable recipient drop@test.com" in caplog.text
        assert "subject=Hello" in caplog.text
        assert "keep@compareintel.com" not in caplog.text


class TestSendPathGuard:
    def test_smtp_send_has_a_single_call_site(self):
        source = EMAIL_SERVICE_PATH.read_text(encoding="utf-8")
        assert source.count("fm.send_message") == 1
        assert source.count("await _send_message(") >= 1

    @pytest.fixture
    def real_email_service(self):
        previous = sys.modules.get("app.email_service")
        sys.modules.pop("app.email_service", None)
        module = importlib.import_module("app.email_service")
        try:
            yield module
        finally:
            if previous is not None:
                sys.modules["app.email_service"] = previous
            else:
                sys.modules.pop("app.email_service", None)

    async def test_send_message_skips_undeliverable_without_smtp(
        self, real_email_service, caplog: pytest.LogCaptureFixture
    ):
        sent: list[list[str]] = []

        class _FastMail:
            async def send_message(self, message):
                sent.append([str(item) for item in message.recipients])

        real_email_service.fm = _FastMail()
        message = real_email_service.MessageSchema(
            subject="Verify",
            recipients=["qa@test.com"],
            body="<p>code</p>",
            subtype="html",
        )
        with caplog.at_level(logging.INFO, logger="app.email_deliverability"):
            await real_email_service._send_message(message)

        assert sent == []
        assert "qa@test.com" in caplog.text
        assert "Skipping email send; no deliverable recipients" in caplog.text

    async def test_send_message_drops_undeliverable_and_sends_the_rest(self, real_email_service):
        sent: list[object] = []

        class _FastMail:
            async def send_message(self, message):
                sent.append(message)

        real_email_service.fm = _FastMail()
        message = real_email_service.MessageSchema(
            subject="Models",
            recipients=["qa@test.com", "person@compareintel.com"],
            cc=["ops@example.com", "ops@compareintel.com"],
            bcc=["hidden@mail.test.com"],
            body="<p>hi</p>",
            subtype="html",
        )
        await real_email_service._send_message(message)

        assert len(sent) == 1
        delivered = sent[0]
        assert [str(item.email) for item in delivered.recipients] == ["person@compareintel.com"]
        assert [str(item.email) for item in delivered.cc] == ["ops@compareintel.com"]
        assert list(delivered.bcc) == []

    async def test_verification_email_skips_test_domain_without_raising(self, real_email_service):
        sent: list[object] = []

        class _FastMail:
            async def send_message(self, message):
                sent.append(message)

        real_email_service.fm = _FastMail()
        real_email_service.EMAIL_CONFIGURED = True
        await real_email_service.send_verification_email("signup@test.com", "123456")
        assert sent == []

        await real_email_service.send_verification_email("signup@compareintel.com", "123456")
        assert len(sent) == 1


class TestSignupStillSucceeds:
    def test_register_test_com_user(self, client, db_session):
        from app.models import User

        with patch("app.routers.auth.verify_recaptcha", return_value=True):
            response = client.post(
                "/api/auth/register",
                json={"email": "e2e-user@test.com", "password": "SecurePassword123!"},
            )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.json()["user"]["email"] == "e2e-user@test.com"
        user = db_session.query(User).filter(User.email == "e2e-user@test.com").first()
        assert user is not None
        assert user.is_verified is False


def _load_script(filename: str):
    path = BACKEND_ROOT / "scripts" / filename
    spec = importlib.util.spec_from_file_location(filename.replace(".py", ""), path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class TestBulkSendersFilterFirst:
    async def test_new_models_script_does_not_send_to_test_com(
        self, caplog: pytest.LogCaptureFixture
    ):
        module = _load_script("send_new_models_added_emails.py")
        real = SimpleNamespace(id=1, email="person@compareintel.com")
        fake = SimpleNamespace(id=2, email="bot@test.com")
        sent: list[str] = []

        async def _send(user_id: int, email: str, models: list[dict[str, str]]) -> None:
            sent.append(email)

        module.get_new_model_notification_recipients = lambda db: [real, fake]
        module.EMAIL_CONFIGURED = True
        module.send_new_models_added_email = _send
        module.SessionLocal = lambda: SimpleNamespace(close=lambda: None)

        with caplog.at_level(logging.INFO, logger="app.email_deliverability"):
            code = await module.send_new_models_added_emails(
                [{"id": "openai/gpt-test", "name": "GPT Test"}],
                dry_run=False,
            )

        assert code == 0
        assert sent == ["person@compareintel.com"]
        assert "bot@test.com" in caplog.text

    async def test_trial_expired_script_does_not_send_to_example_com(self):
        module = _load_script("send_trial_expired_emails.py")
        real = SimpleNamespace(id=3, email="person@compareintel.com", trial_ends_at="yesterday")
        fake = SimpleNamespace(id=4, email="bot@example.com", trial_ends_at="yesterday")
        sent: list[str] = []

        async def _send(user_id: int, email: str) -> None:
            sent.append(email)

        module.find_users_with_expired_trials = lambda db: [fake, real]
        module.EMAIL_CONFIGURED = True
        module.send_trial_expired_email = _send
        module.SessionLocal = lambda: SimpleNamespace(close=lambda: None)

        await module.send_trial_expired_emails()
        assert sent == ["person@compareintel.com"]
