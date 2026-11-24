#!/usr/bin/env python3
"""Delete leftover reserved-domain test users. Dry-run unless ``--delete`` is passed.

Finds users whose email domain is ``test.com``, ``example.com``, ``example.net``,
``example.org``, or ``localhost``, or whose domain ends in ``.test``, ``.example``,
``.invalid``, or ``.localhost``. Override that list with ``--domains`` (comma-separated;
a token that starts with ``.`` is a suffix). Accounts with ``is_admin`` set, or with
role ``admin``, ``super_admin``, or ``superuser``, are never deleted. ``--exclude``
keeps specific emails.

Deletion uses the same ``db.delete(user)`` path as
``DELETE /api/admin/users/{user_id}`` (``app.routers.admin.users.delete_user``).
ORM cascades remove preferences, conversations (and their messages), subscription
history, payment transactions, and credit transactions. Usage logs and admin-action
log foreign keys are nullable and are cleared (``ON DELETE SET NULL``), as are
shared-comparison owners. All deletes commit in one transaction.

No database migration is required.

Take a database backup before ``--delete``. On the production host::

    cd /home/ubuntu/CompareIntel
    bash scripts/backup/postgres-backup.sh
    docker compose -f docker-compose.ssl.yml exec backend \\
        python scripts/cleanup_test_users.py
    docker compose -f docker-compose.ssl.yml exec backend \\
        python scripts/cleanup_test_users.py --delete

``--yes`` skips the interactive ``DELETE`` confirmation and is only honored
together with ``--delete``. The script does not run against production by itself.

E2E and CI do not depend on these rows in production. Playwright seeds a
throwaway SQLite file (``.github/actions/configure-e2e-env/seed_mock_db.py``)
with ``@test.com`` fallbacks. Deleting production reserved-domain users does
not change that fixture.

There is no shared reserved-domain helper on master yet. This list is local so
the script can ship on its own. A later send-time guard should import or copy
``DEFAULT_EXACT_DOMAINS`` and ``DEFAULT_DOMAIN_SUFFIXES``.
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import TYPE_CHECKING

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from dotenv import load_dotenv

for env_path in (backend_dir / ".env", Path("/app/.env")):
    if env_path.exists():
        load_dotenv(env_path, override=False)
        break

from app.database import SessionLocal
from app.models import User

if TYPE_CHECKING:
    from collections.abc import Callable, Sequence

    from sqlalchemy.orm import Session

# Exact email domains (the part after "@").
DEFAULT_EXACT_DOMAINS: frozenset[str] = frozenset(
    {
        "test.com",
        "example.com",
        "example.net",
        "example.org",
        "localhost",
    }
)
# Domain must end with one of these (``user@foo.test``, not the bare TLD).
DEFAULT_DOMAIN_SUFFIXES: frozenset[str] = frozenset(
    {
        ".test",
        ".example",
        ".invalid",
        ".localhost",
    }
)
PROTECTED_ROLES: frozenset[str] = frozenset({"admin", "super_admin", "superuser"})
CONFIRMATION_PHRASE = "DELETE"


@dataclass(frozen=True)
class DomainRules:
    """Exact domains and leading-dot suffixes used to match an email domain."""

    exact: frozenset[str]
    suffixes: frozenset[str]


@dataclass(frozen=True)
class UserSnapshot:
    """Printable user row. Detached from the session so the read transaction can end."""

    id: int
    email: str
    created_at: datetime | None
    is_admin: bool
    role: str | None
    last_access: datetime | None
    bucket: str  # "delete", "protected", or "excluded"


@dataclass(frozen=True)
class CleanupPlan:
    """Users partitioned by what the script will do with them."""

    delete: tuple[UserSnapshot, ...]
    protected: tuple[UserSnapshot, ...]
    excluded: tuple[UserSnapshot, ...]


def default_rules() -> DomainRules:
    """Return the built-in reserved-domain rules."""
    return DomainRules(exact=DEFAULT_EXACT_DOMAINS, suffixes=DEFAULT_DOMAIN_SUFFIXES)


def parse_domain_rules(raw: str | None) -> DomainRules:
    """Parse ``--domains``. ``None`` keeps the defaults.

    Tokens that start with ``.`` are suffixes. Every other token is an exact
    domain. Passing the flag replaces the defaults entirely.
    """
    if raw is None:
        return default_rules()
    exact: set[str] = set()
    suffixes: set[str] = set()
    for part in raw.split(","):
        token = part.strip().lower().rstrip(".")
        if not token:
            continue
        if token.startswith("."):
            suffixes.add(token)
        else:
            exact.add(token)
    if not exact and not suffixes:
        raise ValueError("--domains must list at least one domain or suffix")
    return DomainRules(exact=frozenset(exact), suffixes=frozenset(suffixes))


def parse_exclude(values: Sequence[str] | None) -> set[str]:
    """Normalize repeated and comma-separated ``--exclude`` emails."""
    emails: set[str] = set()
    for value in values or []:
        for part in value.split(","):
            email = part.strip().lower()
            if email:
                emails.add(email)
    return emails


def email_domain(email: str | None) -> str | None:
    """Return the lowercased domain of an email address, or None when it is unusable."""
    if email is None:
        return None
    local, separator, domain = email.strip().rpartition("@")
    if separator != "@" or not local or not domain:
        return None
    domain = domain.strip().lower().rstrip(".")
    if not domain or any(char.isspace() for char in domain):
        return None
    return domain


def domain_matches(domain: str, rules: DomainRules) -> bool:
    """Return True when ``domain`` is an exact match or ends with a configured suffix."""
    normalized = domain.lower().rstrip(".")
    if normalized in rules.exact:
        return True
    return any(normalized.endswith(suffix) for suffix in rules.suffixes)


def is_protected_account(user: User) -> bool:
    """Return True for admin and superuser accounts, which this script never deletes.

    ``is_admin`` is included so a moderator or admin flagged in that column is
    kept even when the role string is unexpected. Role ``superuser`` is kept
    alongside the app's ``super_admin`` role.
    """
    if bool(user.is_admin):
        return True
    role = (user.role or "").strip().lower()
    return role in PROTECTED_ROLES


def _snapshot(user: User, bucket: str) -> UserSnapshot:
    return UserSnapshot(
        id=int(user.id),
        email=str(user.email),
        created_at=user.created_at,
        is_admin=bool(user.is_admin),
        role=None if user.role is None else str(user.role),
        last_access=user.last_access,
        bucket=bucket,
    )


def user_is_deletable(user: User, rules: DomainRules, exclude: set[str]) -> bool:
    """Return True when this user may be deleted under the current rules."""
    domain = email_domain(user.email)
    if domain is None or not domain_matches(domain, rules):
        return False
    if str(user.email).strip().lower() in exclude:
        return False
    return not is_protected_account(user)


def plan_cleanup(db: Session, rules: DomainRules, exclude: set[str]) -> CleanupPlan:
    """Load users and split reserved-domain matches into delete, protected, and excluded."""
    delete: list[UserSnapshot] = []
    protected: list[UserSnapshot] = []
    excluded: list[UserSnapshot] = []
    users = db.query(User).order_by(User.id).all()
    for user in users:
        domain = email_domain(user.email)
        if domain is None or not domain_matches(domain, rules):
            continue
        email_key = str(user.email).strip().lower()
        if email_key in exclude:
            excluded.append(_snapshot(user, "excluded"))
        elif is_protected_account(user):
            protected.append(_snapshot(user, "protected"))
        else:
            delete.append(_snapshot(user, "delete"))
    return CleanupPlan(delete=tuple(delete), protected=tuple(protected), excluded=tuple(excluded))


def _format_cell(value: object) -> str:
    if value is None:
        return "-"
    if isinstance(value, datetime):
        return value.isoformat(sep=" ", timespec="seconds")
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


def render_table(rows: Sequence[UserSnapshot]) -> str:
    """Render id, email, created_at, is_admin, role, and last access (last login)."""
    headers = ("id", "email", "created_at", "is_admin", "role", "last_access")
    body = [
        (
            _format_cell(row.id),
            _format_cell(row.email),
            _format_cell(row.created_at),
            _format_cell(row.is_admin),
            _format_cell(row.role),
            _format_cell(row.last_access),
        )
        for row in rows
    ]
    widths = [len(header) for header in headers]
    for cells in body:
        for index, cell in enumerate(cells):
            widths[index] = max(widths[index], len(cell))
    lines = [
        "  ".join(header.ljust(widths[index]) for index, header in enumerate(headers)),
        "  ".join("-" * widths[index] for index in range(len(headers))),
    ]
    lines.extend(
        "  ".join(cell.ljust(widths[index]) for index, cell in enumerate(cells)) for cells in body
    )
    return "\n".join(lines)


def render_report(plan: CleanupPlan, *, delete: bool) -> str:
    """Build the dry-run or pre-delete report."""
    mode = "DELETE" if delete else "DRY RUN"
    lines = [
        f"{mode}: reserved-domain user cleanup",
        (
            f"Eligible to delete: {len(plan.delete)}. "
            f"Protected admin/superuser (kept): {len(plan.protected)}. "
            f"Excluded (kept): {len(plan.excluded)}."
        ),
    ]
    if plan.delete:
        lines.extend(["", "Eligible:", render_table(plan.delete)])
    else:
        lines.extend(["", "No eligible users."])
    if plan.protected:
        lines.extend(["", "Protected (not deleted):", render_table(plan.protected)])
    if plan.excluded:
        lines.extend(["", "Excluded (not deleted):", render_table(plan.excluded)])
    if not delete:
        lines.extend(
            [
                "",
                "Nothing was deleted. Pass --delete to remove eligible users "
                "(you must type DELETE to confirm, or pass --yes).",
            ]
        )
    return "\n".join(lines)


def confirm_delete(assume_yes: bool, input_fn: Callable[[str], str] | None = None) -> bool:
    """Require the exact phrase DELETE unless ``--yes`` was passed.

    A non-interactive stdin is refused unless the caller supplies ``input_fn``
    (tests) or ``assume_yes`` (``--yes``).
    """
    if assume_yes:
        print("Proceeding with deletion (--yes).")
        return True
    if input_fn is None and not sys.stdin.isatty():
        print("Refusing to delete without a TTY. Re-run with --delete --yes.")
        return False
    reader = input if input_fn is None else input_fn
    try:
        response = reader("Type DELETE to confirm: ")
    except EOFError:
        print("Deletion cancelled.")
        return False
    if response.strip() != CONFIRMATION_PHRASE:
        print("Deletion cancelled.")
        return False
    return True


def delete_users(
    db: Session, user_ids: Sequence[int], rules: DomainRules, exclude: set[str]
) -> int:
    """Delete eligible users with the admin endpoint's ``db.delete`` path.

    Re-checks domain, exclude, and admin rules on freshly loaded rows. Flushes
    in the caller's transaction; the caller commits once. On failure the caller
    rolls the whole transaction back.
    """
    if not user_ids:
        return 0
    users = db.query(User).filter(User.id.in_(list(user_ids))).order_by(User.id).all()
    found = {int(user.id): user for user in users}
    deleted = 0
    for user_id in user_ids:
        user = found.get(user_id)
        if user is None:
            print(f"Skipping id {user_id}: user no longer exists.")
            continue
        if not user_is_deletable(user, rules, exclude):
            print(f"Skipping {user.email}: no longer an eligible non-admin reserved-domain user.")
            continue
        # Same deletion as app.routers.admin.users.delete_user.
        db.delete(user)
        deleted += 1
    db.flush()
    return deleted


def execute(
    db: Session,
    *,
    rules: DomainRules,
    exclude: set[str],
    delete: bool,
    assume_yes: bool,
    input_fn: Callable[[str], str] | None = None,
) -> int:
    """Print the plan and, only with ``delete`` plus confirmation, remove users.

    Returns 0 on success or a cancelled confirmation, and 1 when deletion fails.
    """
    plan = plan_cleanup(db, rules, exclude)
    # End the read transaction before prompting so we do not hold it open.
    db.rollback()
    print(render_report(plan, delete=delete))
    if not delete or not plan.delete:
        return 0
    if not confirm_delete(assume_yes, input_fn):
        return 0
    user_ids = [row.id for row in plan.delete]
    try:
        deleted = delete_users(db, user_ids, rules, exclude)
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"Deletion failed; transaction rolled back. {exc}")
        return 1
    print(f"Deleted {deleted} user(s) in one transaction.")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "List or delete users on reserved test domains "
            "(test.com, example.com/.net/.org, localhost, .test, .example, .invalid, .localhost). "
            "Dry-run by default. Never deletes admin or superuser accounts."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            "  python scripts/cleanup_test_users.py\n"
            "  python scripts/cleanup_test_users.py --exclude keep@test.com\n"
            "  python scripts/cleanup_test_users.py --domains test.com,.invalid\n"
            "  python scripts/cleanup_test_users.py --delete\n"
            "  python scripts/cleanup_test_users.py --delete --yes\n"
            "\n"
            "Back up the database before --delete. See the module docstring."
        ),
    )
    parser.add_argument(
        "--domains",
        default=None,
        help=(
            "Comma-separated domains that replace the defaults. "
            "Prefix a token with '.' to match a suffix (example: .test)."
        ),
    )
    parser.add_argument(
        "--exclude",
        action="append",
        default=[],
        help="Email to keep. Repeat the flag or separate emails with commas.",
    )
    parser.add_argument(
        "--delete",
        action="store_true",
        help="Delete eligible users. Requires typing DELETE, or --yes.",
    )
    parser.add_argument(
        "--yes",
        action="store_true",
        help="Skip the DELETE confirmation. Has no effect unless --delete is also set.",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    """CLI entry point. Does not delete anything unless ``--delete`` is present."""
    args = build_parser().parse_args(list(argv) if argv is not None else None)
    try:
        rules = parse_domain_rules(args.domains)
    except ValueError as exc:
        print(str(exc))
        return 2
    if args.yes and not args.delete:
        print("--yes only skips the confirmation prompt. Pass --delete to delete users.")
        return 2
    exclude = parse_exclude(args.exclude)
    db = SessionLocal()
    try:
        return execute(
            db,
            rules=rules,
            exclude=exclude,
            delete=args.delete,
            assume_yes=args.yes,
        )
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
