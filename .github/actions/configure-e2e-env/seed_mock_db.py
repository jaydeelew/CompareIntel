#!/usr/bin/env python3
"""Seed the E2E SQLite DB so comparisons use backend mock mode.

Used by .github/actions/configure-e2e-env when GitHub Actions secrets are
unavailable (Dependabot pull_request runs, forks, empty TEST_OPENROUTER_API_KEY).

Enables:
- AppSettings.anonymous_mock_mode_enabled for unregistered comparisons
- User.mock_mode_enabled for the standard E2E test accounts

Must run after backend Python deps are installed and before Playwright starts
uvicorn (which reuses this SQLite file via DATABASE_URL).
"""

from __future__ import annotations

import os
import sys
from datetime import UTC, datetime
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
BACKEND_DIR = REPO_ROOT / "backend"
sys.path.insert(0, str(BACKEND_DIR))
os.chdir(BACKEND_DIR)

os.environ.setdefault("SKIP_CONFIG_VALIDATION", "true")
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-ci-only")
os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("DATABASE_URL", "sqlite:///./test-e2e.db")

from sqlalchemy.orm import Session  # noqa: E402

from app.auth import get_password_hash  # noqa: E402
from app.database import SessionLocal, init_db  # noqa: E402
from app.models import AppSettings, User  # noqa: E402

# Match frontend/e2e/fixtures.ts TEST_CREDENTIALS and global-setup.ts fallbacks.
_DEFAULT_PASSWORD = "Test12345678/"
TEST_USERS: tuple[tuple[str, str, str, bool, str], ...] = (
    (
        os.environ.get("TEST_FREE_EMAIL") or "free@test.com",
        os.environ.get("TEST_FREE_PASSWORD") or _DEFAULT_PASSWORD,
        "user",
        False,
        "free",
    ),
    (
        os.environ.get("TEST_STARTER_EMAIL") or "starter@test.com",
        os.environ.get("TEST_STARTER_PASSWORD") or _DEFAULT_PASSWORD,
        "user",
        False,
        "starter",
    ),
    (
        os.environ.get("TEST_STARTER_PLUS_EMAIL") or "starter_plus@test.com",
        os.environ.get("TEST_STARTER_PLUS_PASSWORD") or _DEFAULT_PASSWORD,
        "user",
        False,
        "starter_plus",
    ),
    (
        os.environ.get("TEST_PRO_EMAIL") or "pro@test.com",
        os.environ.get("TEST_PRO_PASSWORD") or _DEFAULT_PASSWORD,
        "user",
        False,
        "pro",
    ),
    (
        os.environ.get("TEST_PRO_PLUS_EMAIL") or "pro_plus@test.com",
        os.environ.get("TEST_PRO_PLUS_PASSWORD") or _DEFAULT_PASSWORD,
        "user",
        False,
        "pro_plus",
    ),
    (
        os.environ.get("ADMIN_EMAIL") or "admin@example.com",
        os.environ.get("ADMIN_PASSWORD") or "AdminPassword123!",
        "admin",
        True,
        "pro_plus",
    ),
    (
        os.environ.get("MODERATOR_EMAIL") or "moderator@test.com",
        os.environ.get("MODERATOR_PASSWORD") or _DEFAULT_PASSWORD,
        "moderator",
        False,
        "pro",
    ),
)


def upsert_user(
    db: Session,
    email: str,
    password: str,
    role: str,
    is_admin: bool,
    subscription_tier: str,
) -> None:
    user = db.query(User).filter(User.email == email).first()
    password_hash = get_password_hash(password)
    if user is None:
        user = User(
            email=email,
            password_hash=password_hash,
            role=role,
            is_admin=is_admin,
            subscription_tier=subscription_tier,
            subscription_status="active",
            subscription_period="monthly",
            subscription_start_date=datetime.now(UTC),
            is_verified=True,
            is_active=True,
            mock_mode_enabled=True,
        )
        db.add(user)
        print(f"Created mock-mode user {email} ({role}/{subscription_tier})")
        return
    user.password_hash = password_hash
    user.role = role
    user.is_admin = is_admin
    user.subscription_tier = subscription_tier
    user.subscription_status = "active"
    user.is_verified = True
    user.is_active = True
    user.mock_mode_enabled = True
    print(f"Updated mock-mode user {email} ({role}/{subscription_tier})")


def main() -> int:
    init_db()
    db = SessionLocal()
    try:
        settings = db.query(AppSettings).first()
        if settings is None:
            settings = AppSettings(id=1, anonymous_mock_mode_enabled=True)
            db.add(settings)
            print("Created AppSettings with anonymous_mock_mode_enabled=True")
        else:
            settings.anonymous_mock_mode_enabled = True
            print("Set AppSettings.anonymous_mock_mode_enabled=True")

        for email, password, role, is_admin, tier in TEST_USERS:
            upsert_user(db, email, password, role, is_admin, tier)

        extra = 0
        for user in db.query(User).filter(User.mock_mode_enabled.is_(False)).all():
            user.mock_mode_enabled = True
            extra += 1
        if extra:
            print(f"Enabled mock_mode on {extra} additional user(s)")

        db.commit()

        enabled = db.query(User).filter(User.mock_mode_enabled.is_(True)).count()
        print(f"Mock mode ready: {enabled} user(s), anonymous_mock_mode_enabled=True")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
