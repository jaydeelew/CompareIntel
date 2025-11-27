"""Add token fields to conversation_messages

Revision ID: add_token_fields_to_conversation_messages
Revises: add_credits_system_fields
Create Date: 2025-01-27 15:00:00.000000

This migration adds token tracking fields to conversation_messages:
- input_tokens: Input tokens for user messages (from OpenRouter API)
- output_tokens: Output tokens for assistant messages (from OpenRouter API)
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'add_token_fields_to_conversation_messages'
down_revision = 'add_credits_system_fields'
branch_labels = None
depends_on = None


def upgrade():
    """Add token fields to conversation_messages table."""
    
    # Add token tracking fields to conversation_messages table
    op.add_column('conversation_messages', sa.Column('input_tokens', sa.Integer(), nullable=True))
    op.add_column('conversation_messages', sa.Column('output_tokens', sa.Integer(), nullable=True))


def downgrade():
    """Remove token fields from conversation_messages table."""
    
    # Remove token fields from conversation_messages table
    op.drop_column('conversation_messages', 'output_tokens')
    op.drop_column('conversation_messages', 'input_tokens')

