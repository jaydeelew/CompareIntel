"""Add remember_* and saved JSON for text/image composer advanced settings

Revision ID: 0006_remember_composer_advanced
Revises: 0005_hide_hero_tiles
Create Date: 2026-03-25 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006_remember_composer_advanced"
down_revision: str | None = "0005_hide_hero_tiles"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = {c["name"] for c in inspector.get_columns("user_preferences")}

    if "remember_text_advanced_settings" not in existing:
        op.add_column(
            "user_preferences",
            sa.Column(
                "remember_text_advanced_settings",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            ),
        )
    if "remember_image_advanced_settings" not in existing:
        op.add_column(
            "user_preferences",
            sa.Column(
                "remember_image_advanced_settings",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            ),
        )
    if "text_composer_advanced" not in existing:
        op.add_column(
            "user_preferences", sa.Column("text_composer_advanced", sa.Text(), nullable=True)
        )
    if "image_composer_advanced" not in existing:
        op.add_column(
            "user_preferences", sa.Column("image_composer_advanced", sa.Text(), nullable=True)
        )


def downgrade() -> None:
    op.drop_column("user_preferences", "image_composer_advanced")
    op.drop_column("user_preferences", "text_composer_advanced")
    op.drop_column("user_preferences", "remember_image_advanced_settings")
    op.drop_column("user_preferences", "remember_text_advanced_settings")
