"""Add shared_comparisons table for public permalink snapshots

Revision ID: 0016_shared_comparisons
Revises: 0015_drop_composer_mode
Create Date: 2026-10-30 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0016_shared_comparisons"
down_revision: str | None = "0015_drop_composer_mode"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "shared_comparisons",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("slug", sa.String(length=16), nullable=False),
        sa.Column("prompt", sa.Text(), nullable=False),
        sa.Column("snapshot_json", sa.Text(), nullable=False),
        sa.Column("is_public", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("owner_user_id", sa.Integer(), nullable=True),
        sa.Column("revoke_token_hash", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=True),
        sa.ForeignKeyConstraint(["owner_user_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_shared_comparisons_id", "shared_comparisons", ["id"])
    op.create_index("ix_shared_comparisons_slug", "shared_comparisons", ["slug"], unique=True)
    op.create_index("ix_shared_comparisons_is_public", "shared_comparisons", ["is_public"])
    op.create_index("ix_shared_comparisons_owner_user_id", "shared_comparisons", ["owner_user_id"])
    op.create_index("ix_shared_comparisons_created_at", "shared_comparisons", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_shared_comparisons_created_at", table_name="shared_comparisons")
    op.drop_index("ix_shared_comparisons_owner_user_id", table_name="shared_comparisons")
    op.drop_index("ix_shared_comparisons_is_public", table_name="shared_comparisons")
    op.drop_index("ix_shared_comparisons_slug", table_name="shared_comparisons")
    op.drop_index("ix_shared_comparisons_id", table_name="shared_comparisons")
    op.drop_table("shared_comparisons")
