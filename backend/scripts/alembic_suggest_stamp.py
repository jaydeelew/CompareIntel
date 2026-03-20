#!/usr/bin/env python3
"""
Suggest Alembic stamp target when alembic_version points at an orphaned revision.

Typical case: production was migrated with an old revision id (e.g.
add_breakout_conversation_fields) that no longer exists in repo after history
was squashed to 0001_initial + numeric revisions.

Usage (production / Docker):
  docker compose -f docker-compose.ssl.yml exec backend \\
    python /app/scripts/alembic_suggest_stamp.py

Then run the printed alembic stamp + upgrade head commands (after backup).
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

from sqlalchemy import create_engine, inspect, text

SCRIPT_DIR = Path(__file__).parent.resolve()
BACKEND_DIR = SCRIPT_DIR.parent.resolve()
sys.path.insert(0, str(BACKEND_DIR))

# Dev: load .env when DATABASE_URL not inherited from compose
from dotenv import load_dotenv  # noqa: E402

for env_path in (BACKEND_DIR / ".env", Path("/app/.env")):
    if env_path.exists():
        load_dotenv(env_path)
        break

CURRENT_REVISIONS = (
    "0001_initial",
    "0002_images",
    "0003_composer_adv",
    "0004_composer_image",
)


def _infer_stamp(inspector) -> str:
    """Map observable DDL to the latest revision that appears fully applied."""

    if not inspector.has_table("conversations") or not inspector.has_table("conversation_messages"):
        print("ERROR: core tables missing — do not stamp; investigate schema.")
        sys.exit(2)

    msg_cols = {c["name"] for c in inspector.get_columns("conversation_messages")}
    conv_cols = {c["name"] for c in inspector.get_columns("conversations")}

    has_images = "images" in msg_cols
    has_text_adv = {
        "composer_temperature",
        "composer_top_p",
        "composer_max_tokens",
    }.issubset(conv_cols)
    has_image_adv = {"composer_aspect_ratio", "composer_image_size"}.issubset(conv_cols)

    if has_image_adv and not has_text_adv:
        print(
            "WARNING: composer_aspect_ratio/size without text advanced columns — "
            "unexpected. Verify schema manually before stamping.",
        )
    if has_text_adv and not has_images:
        print(
            "WARNING: text advanced columns without conversation_messages.images — "
            "unexpected. Verify schema manually before stamping.",
        )

    if has_image_adv:
        return "0004_composer_image"
    if has_text_adv:
        return "0003_composer_adv"
    if has_images:
        return "0002_images"
    return "0001_initial"


def main() -> None:
    url = os.getenv("DATABASE_URL")
    if not url:
        print("DATABASE_URL is not set.")
        sys.exit(1)

    if "sqlite" in url.lower():
        print("SQLite detected — alembic_version issues are rare here.")
        print("Run: alembic current && alembic upgrade head")
        sys.exit(0)

    engine = create_engine(url)
    insp = inspect(engine)
    with engine.connect() as conn:
        version_row = conn.execute(text("SELECT version_num FROM alembic_version")).fetchone()
        version = version_row[0] if version_row else None

    print(f"alembic_version.version_num = {version!r}")
    if version in CURRENT_REVISIONS:
        print("\nRevision is already on the current migration branch.")
        print("Next: alembic upgrade head")
        sys.exit(0)

    if version is None:
        print("\nNo row in alembic_version — initialize with care (alembic stamp …).")
        sys.exit(3)

    suggested = _infer_stamp(insp)
    print(f"\nOrphan or unknown revision (not in {CURRENT_REVISIONS}).")
    print("Inferred schema matches through:", suggested)
    print("\nAfter a database backup, run:")
    print(f"  alembic stamp {suggested}")
    print("  alembic upgrade head")
    print("\n(Use docker compose exec backend … if running in Docker.)")


if __name__ == "__main__":
    main()
