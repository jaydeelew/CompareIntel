"""Add client_source to conversations

Revision ID: 0012_client_source
Revises: 0011_file_contents
Create Date: 2026-09-07 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0012_client_source"
down_revision: str | None = "0011_file_contents"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "conversations",
        sa.Column("client_source", sa.String(length=32), nullable=False, server_default="web"),
    )


def downgrade() -> None:
    op.drop_column("conversations", "client_source")
