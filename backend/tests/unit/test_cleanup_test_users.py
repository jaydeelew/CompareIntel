"""Unit tests for the reserved-domain test-user cleanup script."""

from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path

import pytest

pytestmark = pytest.mark.unit

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from app.models import Conversation, ConversationMessage, CreditTransaction, UsageLog, User
from scripts.cleanup_test_users import (
    DEFAULT_DOMAIN_SUFFIXES,
    DEFAULT_EXACT_DOMAINS,
    domain_matches,
    email_domain,
    execute,
    main,
    parse_domain_rules,
    parse_exclude,
    plan_cleanup,
)
from tests.factories import (
    create_conversation,
    create_conversation_message,
    create_usage_log,
    create_user,
)

FIXED_TIME = datetime(2024, 5, 1, 12, 0, 0)


def _user(db_session, email: str, **kwargs):
    return create_user(db_session, email=email, last_access=FIXED_TIME, **kwargs)


def test_default_domains_cover_reserved_names():
    rules = parse_domain_rules(None)
    assert rules.exact == DEFAULT_EXACT_DOMAINS
    assert rules.suffixes == DEFAULT_DOMAIN_SUFFIXES
    matching = [
        "test.com",
        "example.com",
        "example.net",
        "example.org",
        "localhost",
        "foo.test",
        "a.b.example",
        "mail.invalid",
        "app.localhost",
    ]
    for domain in matching:
        assert domain_matches(domain, rules), domain
    rejected = [
        "gmail.com",
        "nottest.com",
        "foo.test.com",
        "example.co",
        "example",
        "test",
        "invalid",
    ]
    for domain in rejected:
        assert not domain_matches(domain, rules), domain


def test_domains_flag_replaces_defaults():
    rules = parse_domain_rules("contoso.test,.invalid")
    assert domain_matches("contoso.test", rules)
    assert domain_matches("user.invalid", rules)
    assert not domain_matches("test.com", rules)
    assert not domain_matches("foo.test", rules)
    with pytest.raises(ValueError, match="--domains"):
        parse_domain_rules(" , ")


def test_email_domain_normalizes_case_and_trailing_dot():
    assert email_domain(" User@TEST.com. ") == "test.com"
    assert email_domain("no-at-sign") is None
    assert email_domain("@test.com") is None
    assert parse_exclude([" Keep@test.com ", "a@test.com,b@test.com"]) == {
        "keep@test.com",
        "a@test.com",
        "b@test.com",
    }


def test_dry_run_prints_table_and_deletes_nothing(db_session, capsys):
    target = _user(db_session, "left@test.com")
    _user(db_session, "real@gmail.com")
    code = execute(
        db_session,
        rules=parse_domain_rules(None),
        exclude=set(),
        delete=False,
        assume_yes=False,
    )
    output = capsys.readouterr().out
    assert code == 0
    assert "DRY RUN" in output
    assert "Eligible to delete: 1" in output
    assert "left@test.com" in output
    assert "id" in output and "last_access" in output
    assert "2024-05-01" in output
    assert db_session.query(User).filter(User.id == target.id).one()


def test_delete_removes_user_and_related_rows_in_one_commit(db_session, monkeypatch, capsys):
    target = _user(db_session, "gone@example.com")
    other = _user(db_session, "stay@gmail.com")
    conversation = create_conversation(db_session, target, input_data="hello")
    message = create_conversation_message(db_session, conversation, content="hi")
    usage = create_usage_log(db_session, target)
    credit = CreditTransaction(
        user_id=target.id,
        transaction_type="allocation",
        credits_amount=5,
        description="seed",
    )
    db_session.add(credit)
    db_session.commit()
    message_id = message.id
    usage_id = usage.id
    credit_id = credit.id
    conversation_id = conversation.id

    commits = {"n": 0}
    real_commit = db_session.commit

    def counting_commit():
        commits["n"] += 1
        return real_commit()

    monkeypatch.setattr(db_session, "commit", counting_commit)
    code = execute(
        db_session,
        rules=parse_domain_rules(None),
        exclude=set(),
        delete=True,
        assume_yes=True,
    )
    output = capsys.readouterr().out
    assert code == 0
    assert "Deleted 1 user" in output
    assert commits["n"] == 1
    assert db_session.query(User).filter(User.email == "gone@example.com").first() is None
    assert db_session.query(User).filter(User.id == other.id).one()
    assert db_session.query(Conversation).filter(Conversation.id == conversation_id).first() is None
    assert (
        db_session.query(ConversationMessage).filter(ConversationMessage.id == message_id).first()
        is None
    )
    assert (
        db_session.query(CreditTransaction).filter(CreditTransaction.id == credit_id).first()
        is None
    )
    usage_row = db_session.query(UsageLog).filter(UsageLog.id == usage_id).one()
    assert usage_row.user_id is None


def test_never_deletes_admin_superuser_or_excluded(db_session, capsys):
    plain = _user(db_session, "plain@test.com")
    excluded = _user(db_session, "keep@test.com")
    admin = _user(db_session, "admin@test.com", role="admin", is_admin=True)
    role_only = _user(db_session, "role-admin@example.net", role="admin", is_admin=False)
    super_admin = _user(db_session, "root@example.org", role="super_admin", is_admin=True)
    superuser = _user(db_session, "root@localhost", role="superuser", is_admin=False)
    flagged = _user(db_session, "mod@foo.test", role="moderator", is_admin=True)
    kept_ids = {excluded.id, admin.id, role_only.id, super_admin.id, superuser.id, flagged.id}

    code = execute(
        db_session,
        rules=parse_domain_rules(None),
        exclude={"keep@test.com"},
        delete=True,
        assume_yes=True,
    )
    output = capsys.readouterr().out
    assert code == 0
    assert "Protected admin/superuser (kept): 5" in output
    assert "Excluded (kept): 1" in output
    assert db_session.query(User).filter(User.id == plain.id).first() is None
    remaining = {user.id for user in db_session.query(User).all()}
    assert kept_ids <= remaining


def test_custom_domains_and_confirmation_prompt(db_session, capsys):
    match = _user(db_session, "person@contoso.test")
    ignored = _user(db_session, "other@test.com")
    answers = iter(["nope", "DELETE"])
    prompts: list[str] = []

    def fake_input(prompt: str) -> str:
        prompts.append(prompt)
        return next(answers)

    rules = parse_domain_rules("contoso.test")
    plan = plan_cleanup(db_session, rules, set())
    assert [row.email for row in plan.delete] == ["person@contoso.test"]

    cancelled = execute(
        db_session,
        rules=rules,
        exclude=set(),
        delete=True,
        assume_yes=False,
        input_fn=fake_input,
    )
    assert cancelled == 0
    assert prompts == ["Type DELETE to confirm: "]
    assert "Deletion cancelled." in capsys.readouterr().out
    assert db_session.query(User).filter(User.id == match.id).one()

    deleted = execute(
        db_session,
        rules=rules,
        exclude=set(),
        delete=True,
        assume_yes=False,
        input_fn=fake_input,
    )
    assert deleted == 0
    assert prompts[-1] == "Type DELETE to confirm: "
    assert db_session.query(User).filter(User.id == match.id).first() is None
    assert db_session.query(User).filter(User.id == ignored.id).one()


def test_non_tty_refuses_delete_without_yes(db_session, monkeypatch, capsys):
    user = _user(db_session, "tty@test.com")
    monkeypatch.setattr(sys.stdin, "isatty", lambda: False)
    code = execute(
        db_session,
        rules=parse_domain_rules(None),
        exclude=set(),
        delete=True,
        assume_yes=False,
    )
    assert code == 0
    assert "without a TTY" in capsys.readouterr().out
    assert db_session.query(User).filter(User.id == user.id).one()


def test_failed_delete_rolls_back(db_session, monkeypatch, capsys):
    user = _user(db_session, "atomic@test.com")

    def boom(*_args, **_kwargs):
        raise RuntimeError("boom")

    monkeypatch.setattr(db_session, "flush", boom)
    code = execute(
        db_session,
        rules=parse_domain_rules(None),
        exclude=set(),
        delete=True,
        assume_yes=True,
    )
    assert code == 1
    assert "rolled back" in capsys.readouterr().out
    db_session.rollback()
    assert db_session.query(User).filter(User.id == user.id).one()


def test_cli_refuses_yes_without_delete_and_empty_domains(db_session):
    user = _user(db_session, "cli@test.com")
    assert main(["--yes"]) == 2
    assert main(["--domains", ","]) == 2
    assert db_session.query(User).filter(User.id == user.id).one()


def test_suffix_and_localhost_match_subdomains_only_as_specified():
    rules = parse_domain_rules(None)
    assert email_domain("a@Foo.Example") == "foo.example"
    assert domain_matches("foo.example", rules)
    assert domain_matches("localhost", rules)
    assert not domain_matches("localhost.com", rules)
