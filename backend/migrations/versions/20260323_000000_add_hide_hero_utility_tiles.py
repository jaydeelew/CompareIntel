"""Add hide_hero_utility_tiles to user_preferences

Revision ID: 0005_hide_hero_tiles
Revises: 0004_composer_image
Create Date: 2026-03-23 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005_hide_hero_tiles"
down_revision: str | None = "0004_composer_image"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # SQLite cannot DROP COLUMN DEFAULT via ALTER; leaving server_default is fine for all backends.
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = {c["name"] for c in inspector.get_columns("user_preferences")}
    if "hide_hero_utility_tiles" in existing:
        return
    op.add_column(
        "user_preferences",
        sa.Column(
            "hide_hero_utility_tiles",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column("user_preferences", "hide_hero_utility_tiles")
