"""Drop purchased_credits_balance from users

Revision ID: 0010_drop_purch_cred_bal
Revises: 0009_overage_settings
Create Date: 2026-04-16 00:00:00.000000

The ``purchased_credits_balance`` column was introduced as a placeholder for a
future admin-grant / one-time top-up feature that never shipped. The helper
``add_purchased_credits`` was never wired to any webhook, admin endpoint, or
CLI, so every row is 0 in practice. Removing it to simplify the credit model
(monthly pool -> overage).

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0010_drop_purch_cred_bal"
down_revision: str | None = "0009_overage_settings"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = {c["name"] for c in inspector.get_columns("users")}

    if "purchased_credits_balance" in existing:
        with op.batch_alter_table("users") as batch_op:
            batch_op.drop_column("purchased_credits_balance")


def downgrade() -> None:
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
