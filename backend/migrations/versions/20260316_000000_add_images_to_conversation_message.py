"""Add images column to conversation_messages

Revision ID: 0002_images
Revises: 0001_initial
Create Date: 2026-03-16 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0002_images"
down_revision: str | None = "0001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add images column to conversation_messages for image-generation responses."""
    op.add_column(
        "conversation_messages",
        sa.Column("images", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    """Remove images column from conversation_messages."""
    op.drop_column("conversation_messages", "images")
