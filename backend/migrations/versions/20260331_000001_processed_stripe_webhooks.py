"""Stripe webhook idempotency (processed event ids)

Revision ID: 0008_processed_stripe_webhooks
Revises: 0007_billing_columns
Create Date: 2026-03-31 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0008_processed_stripe_webhooks"
down_revision: str | None = "0007_billing_columns"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "processed_stripe_webhooks" in inspector.get_table_names():
        return
    op.create_table(
        "processed_stripe_webhooks",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("stripe_event_id", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("stripe_event_id", name="uq_processed_stripe_webhooks_event_id"),
    )


def downgrade() -> None:
    op.drop_table("processed_stripe_webhooks")
