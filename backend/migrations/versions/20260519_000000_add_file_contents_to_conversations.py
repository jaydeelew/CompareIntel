"""Add file_contents JSON to conversations for persisted vision attachments

Revision ID: 0011_file_contents
Revises: 0010_drop_purch_cred_bal
Create Date: 2026-05-19 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0011_file_contents"
down_revision: str | None = "0010_drop_purch_cred_bal"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "conversations",
        sa.Column("file_contents", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("conversations", "file_contents")
