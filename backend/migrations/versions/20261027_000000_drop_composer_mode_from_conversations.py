"""Drop composer_mode from conversations

Revision ID: 0015_drop_composer_mode
Revises: 0014_composer_mode
Create Date: 2026-10-27 00:00:00.000000

Voice mode (PRs #93 / #101 / #103) added composer_mode. The feature is being
removed; keep 0014 as-shipped and drop the column here.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0015_drop_composer_mode"
down_revision: str | None = "0014_composer_mode"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_column("conversations", "composer_mode")


def downgrade() -> None:
    op.add_column(
        "conversations",
        sa.Column("composer_mode", sa.String(16), nullable=True),
    )
