"""Add performance indexes for frequently queried columns

Revision ID: add_performance_indexes
Revises: 
Create Date: 2025-01-XX XX:XX:XX.XXXXXX

This migration adds database indexes to optimize frequently queried columns.
These indexes improve query performance for:
- User lookups by email
- Conversation queries by user_id and created_at
- Message queries by conversation_id
- Usage log queries by user_id and created_at
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_performance_indexes'
down_revision = 'add_credits_system_fields'  # Revises credits system fields migration
branch_labels = None
depends_on = None


def upgrade():
    """
    Add indexes for performance optimization.
    
    Note: Some indexes may already exist from model definitions.
    This migration ensures all critical indexes are present.
    """
    # Indexes on users table
    # email already has index=True in model, but ensure it exists
    try:
        op.create_index('ix_users_email', 'users', ['email'], unique=True, if_not_exists=True)
    except Exception:
        pass  # Index may already exist
    
    # Index on subscription_tier for admin queries
    try:
        op.create_index('ix_users_subscription_tier', 'users', ['subscription_tier'], if_not_exists=True)
    except Exception:
        pass
    
    # Index on usage_reset_date for daily usage queries
    try:
        op.create_index('ix_users_usage_reset_date', 'users', ['usage_reset_date'], if_not_exists=True)
    except Exception:
        pass
    
    # Indexes on conversations table
    # user_id and created_at already have indexes, but ensure they exist
    try:
        op.create_index('ix_conversations_user_id', 'conversations', ['user_id'], if_not_exists=True)
    except Exception:
        pass
    
    try:
        op.create_index('ix_conversations_created_at', 'conversations', ['created_at'], if_not_exists=True)
    except Exception:
        pass
    
    # Composite index for common query pattern: user_id + created_at DESC
    try:
        op.create_index(
            'ix_conversations_user_created',
            'conversations',
            ['user_id', sa.text('created_at DESC')],
            if_not_exists=True
        )
    except Exception:
        pass
    
    # Indexes on conversation_messages table
    # conversation_id already has index, but ensure it exists
    try:
        op.create_index('ix_conversation_messages_conversation_id', 'conversation_messages', ['conversation_id'], if_not_exists=True)
    except Exception:
        pass
    
    # Composite index for common query: conversation_id + created_at ASC
    try:
        op.create_index(
            'ix_conversation_messages_conv_created',
            'conversation_messages',
            ['conversation_id', 'created_at'],
            if_not_exists=True
        )
    except Exception:
        pass
    
    # Indexes on usage_logs table
    try:
        op.create_index('ix_usage_logs_user_id', 'usage_logs', ['user_id'], if_not_exists=True)
    except Exception:
        pass
    
    try:
        op.create_index('ix_usage_logs_created_at', 'usage_logs', ['created_at'], if_not_exists=True)
    except Exception:
        pass
    
    # Composite index for user usage queries
    try:
        op.create_index(
            'ix_usage_logs_user_created',
            'usage_logs',
            ['user_id', 'created_at'],
            if_not_exists=True
        )
    except Exception:
        pass


def downgrade():
    """Remove performance indexes."""
    # Remove composite indexes first
    try:
        op.drop_index('ix_usage_logs_user_created', table_name='usage_logs')
    except Exception:
        pass
    
    try:
        op.drop_index('ix_conversation_messages_conv_created', table_name='conversation_messages')
    except Exception:
        pass
    
    try:
        op.drop_index('ix_conversations_user_created', table_name='conversations')
    except Exception:
        pass
    
    # Remove single-column indexes
    try:
        op.drop_index('ix_usage_logs_created_at', table_name='usage_logs')
    except Exception:
        pass
    
    try:
        op.drop_index('ix_usage_logs_user_id', table_name='usage_logs')
    except Exception:
        pass
    
    try:
        op.drop_index('ix_conversation_messages_conversation_id', table_name='conversation_messages')
    except Exception:
        pass
    
    try:
        op.drop_index('ix_conversations_created_at', table_name='conversations')
    except Exception:
        pass
    
    try:
        op.drop_index('ix_conversations_user_id', table_name='conversations')
    except Exception:
        pass
    
    try:
        op.drop_index('ix_users_usage_reset_date', table_name='users')
    except Exception:
        pass
    
    try:
        op.drop_index('ix_users_subscription_tier', table_name='users')
    except Exception:
        pass
    
    # Note: Don't drop unique index on email as it's required for data integrity

