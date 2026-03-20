"""Add composer text advanced settings to conversations

Revision ID: 0003_composer_adv
Revises: 0002_images
Create Date: 2026-03-19 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003_composer_adv"
down_revision: str | None = "0002_images"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "conversations",
        sa.Column("composer_temperature", sa.Float(), nullable=True),
    )
    op.add_column(
        "conversations",
        sa.Column("composer_top_p", sa.Float(), nullable=True),
    )
    op.add_column(
        "conversations",
        sa.Column("composer_max_tokens", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("conversations", "composer_max_tokens")
    op.drop_column("conversations", "composer_top_p")
    op.drop_column("conversations", "composer_temperature")
