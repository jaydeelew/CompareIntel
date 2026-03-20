"""Add composer image advanced (aspect ratio, image size) to conversations

Revision ID: 0004_composer_image
Revises: 0003_composer_adv
Create Date: 2026-03-20 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004_composer_image"
down_revision: str | None = "0003_composer_adv"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "conversations",
        sa.Column("composer_aspect_ratio", sa.String(length=32), nullable=True),
    )
    op.add_column(
        "conversations",
        sa.Column("composer_image_size", sa.String(length=32), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("conversations", "composer_image_size")
    op.drop_column("conversations", "composer_aspect_ratio")
