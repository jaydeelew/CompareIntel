"""Add composer web search flag to conversations

Revision ID: 0017_composer_web_search
Revises: 0016_shared_comparisons
Create Date: 2026-11-19 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0017_composer_web_search"
down_revision: str | None = "0016_shared_comparisons"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "conversations",
        sa.Column("composer_web_search_enabled", sa.Boolean(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("conversations", "composer_web_search_enabled")
