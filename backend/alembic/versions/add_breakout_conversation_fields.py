"""Add breakout conversation fields

Revision ID: add_breakout_conversation_fields
Revises: add_usage_log_monthly_aggregate
Create Date: 2025-12-19 10:00:00.000000

This migration adds support for breakout conversations:
- conversation_type: 'comparison' or 'breakout' to distinguish conversation types
- parent_conversation_id: References the original comparison conversation (for breakouts)
- breakout_model_id: The specific model that was broken out
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "add_breakout_conversation_fields"
down_revision = "add_usage_log_monthly_aggregate"
branch_labels = None
depends_on = None


def upgrade():
    """Add breakout conversation fields to conversations table."""

    # Add conversation_type column with default value 'comparison'
    op.add_column("conversations", sa.Column("conversation_type", sa.String(20), nullable=False, server_default="comparison"))

    # Add parent_conversation_id for linking breakout to original comparison
    op.add_column("conversations", sa.Column("parent_conversation_id", sa.Integer(), nullable=True))

    # Add breakout_model_id to track which model was broken out
    op.add_column("conversations", sa.Column("breakout_model_id", sa.String(255), nullable=True))

    # Create foreign key constraint for parent_conversation_id
    op.create_foreign_key(
        "fk_conversations_parent_conversation_id",
        "conversations",
        "conversations",
        ["parent_conversation_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # Create index on parent_conversation_id for efficient lookups
    op.create_index("ix_conversations_parent_conversation_id", "conversations", ["parent_conversation_id"])

    # Create index on conversation_type for filtering
    op.create_index("ix_conversations_conversation_type", "conversations", ["conversation_type"])


def downgrade():
    """Remove breakout conversation fields from conversations table."""

    # Drop indexes
    op.drop_index("ix_conversations_conversation_type", table_name="conversations")
    op.drop_index("ix_conversations_parent_conversation_id", table_name="conversations")

    # Drop foreign key constraint
    op.drop_constraint("fk_conversations_parent_conversation_id", "conversations", type_="foreignkey")

    # Drop columns
    op.drop_column("conversations", "breakout_model_id")
    op.drop_column("conversations", "parent_conversation_id")
    op.drop_column("conversations", "conversation_type")
