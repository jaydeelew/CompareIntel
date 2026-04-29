"""Add purchased_credits_balance and stripe_subscription_id to users

Revision ID: 0007_billing_columns
Revises: 0006_remember_composer_advanced
Create Date: 2026-03-31 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007_billing_columns"
down_revision: str | None = "0006_remember_composer_advanced"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = {c["name"] for c in inspector.get_columns("users")}

    if "purchased_credits_balance" not in existing:
        op.add_column(
            "users",
            sa.Column(
                "purchased_credits_balance",
                sa.Integer(),
                nullable=False,
                server_default="0",
            ),
        )

    if "stripe_subscription_id" not in existing:
        op.add_column(
            "users",
            sa.Column("stripe_subscription_id", sa.String(length=255), nullable=True),
        )
        op.create_index(
            op.f("ix_users_stripe_subscription_id"),
            "users",
            ["stripe_subscription_id"],
            unique=False,
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = {c["name"] for c in inspector.get_columns("users")}

    if "stripe_subscription_id" in existing:
        try:
            op.drop_index(op.f("ix_users_stripe_subscription_id"), table_name="users")
        except Exception:
            pass
        op.drop_column("users", "stripe_subscription_id")

    if "purchased_credits_balance" in existing:
        op.drop_column("users", "purchased_credits_balance")
