"""Add composer_mode to conversations

Revision ID: 0014_composer_mode
Revises: 0013_conversation_saved
Create Date: 2026-10-26 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0014_composer_mode"
down_revision: str | None = "0013_conversation_saved"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "conversations",
        sa.Column("composer_mode", sa.String(16), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("conversations", "composer_mode")
