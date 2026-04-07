"""Add overage settings columns to users

Revision ID: 0009_overage_settings
Revises: 0008_processed_stripe_webhooks
Create Date: 2026-04-07 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0009_overage_settings"
down_revision: str | None = "0008_processed_stripe_webhooks"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = {c["name"] for c in inspector.get_columns("users")}

    if "overage_enabled" not in existing:
        op.add_column(
            "users",
            sa.Column("overage_enabled", sa.Boolean(), nullable=False, server_default="0"),
        )

    if "overage_spend_limit_cents" not in existing:
        op.add_column(
            "users",
            sa.Column("overage_spend_limit_cents", sa.Integer(), nullable=True),
        )

    if "overage_credits_used_this_period" not in existing:
        op.add_column(
            "users",
            sa.Column(
                "overage_credits_used_this_period",
                sa.Integer(),
                nullable=False,
                server_default="0",
            ),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = {c["name"] for c in inspector.get_columns("users")}

    for col in ("overage_credits_used_this_period", "overage_spend_limit_cents", "overage_enabled"):
        if col in existing:
            op.drop_column("users", col)
