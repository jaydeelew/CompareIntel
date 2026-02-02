"""Initial schema - baseline migration

Revision ID: 0001_initial
Revises: 
Create Date: 2026-02-02 00:00:00.000000

This migration represents the initial database schema for CompareIntel.
It creates all tables needed for the application to function.

For existing databases: Mark this migration as applied without running it:
    alembic stamp 0001_initial
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0001_initial'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create initial database schema."""
    
    # Users table
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('email', sa.String(255), unique=True, nullable=False, index=True),
        sa.Column('password_hash', sa.String(255), nullable=False),
        sa.Column('is_verified', sa.Boolean(), default=False),
        sa.Column('is_active', sa.Boolean(), default=True),
        sa.Column('verification_token', sa.String(255), index=True),
        sa.Column('verification_token_expires', sa.DateTime()),
        sa.Column('reset_token', sa.String(255), index=True),
        sa.Column('reset_token_expires', sa.DateTime()),
        sa.Column('subscription_tier', sa.String(50), default='free'),
        sa.Column('subscription_status', sa.String(50), default='active'),
        sa.Column('subscription_period', sa.String(20), default='monthly'),
        sa.Column('subscription_start_date', sa.DateTime()),
        sa.Column('subscription_end_date', sa.DateTime()),
        sa.Column('trial_ends_at', sa.DateTime(), nullable=True),
        sa.Column('role', sa.String(50), default='user'),
        sa.Column('is_admin', sa.Boolean(), default=False),
        sa.Column('admin_permissions', sa.Text()),
        sa.Column('mock_mode_enabled', sa.Boolean(), default=False),
        sa.Column('stripe_customer_id', sa.String(255), index=True),
        sa.Column('monthly_overage_count', sa.Integer(), default=0),
        sa.Column('overage_reset_date', sa.Date(), server_default=sa.func.current_date()),
        sa.Column('monthly_credits_allocated', sa.Integer(), default=0),
        sa.Column('credits_used_this_period', sa.Integer(), default=0),
        sa.Column('total_credits_used', sa.Integer(), default=0),
        sa.Column('billing_period_start', sa.DateTime()),
        sa.Column('billing_period_end', sa.DateTime()),
        sa.Column('credits_reset_at', sa.DateTime()),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.Column('last_access', sa.DateTime()),
    )
    
    # User preferences table
    op.create_table(
        'user_preferences',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, unique=True),
        sa.Column('preferred_models', sa.Text()),
        sa.Column('theme', sa.String(50), default='light'),
        sa.Column('email_notifications', sa.Boolean(), default=True),
        sa.Column('usage_alerts', sa.Boolean(), default=True),
        sa.Column('timezone', sa.String(50), default='UTC'),
        sa.Column('zipcode', sa.String(10), nullable=True),
        sa.Column('remember_state_on_logout', sa.Boolean(), default=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    
    # Conversations table
    op.create_table(
        'conversations',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('title', sa.String(255)),
        sa.Column('input_data', sa.Text(), nullable=False),
        sa.Column('models_used', sa.Text(), nullable=False),
        sa.Column('conversation_type', sa.String(20), default='comparison', nullable=False),
        sa.Column('parent_conversation_id', sa.Integer(), sa.ForeignKey('conversations.id', ondelete='SET NULL'), nullable=True, index=True),
        sa.Column('breakout_model_id', sa.String(255), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), index=True),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    
    # Conversation messages table
    op.create_table(
        'conversation_messages',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('conversation_id', sa.Integer(), sa.ForeignKey('conversations.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('model_id', sa.String(255)),
        sa.Column('role', sa.String(20), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('input_tokens', sa.Integer()),
        sa.Column('output_tokens', sa.Integer()),
        sa.Column('success', sa.Boolean(), default=True),
        sa.Column('processing_time_ms', sa.Integer()),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )
    
    # Usage logs table
    op.create_table(
        'usage_logs',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True, index=True),
        sa.Column('ip_address', sa.String(45)),
        sa.Column('browser_fingerprint', sa.String(64)),
        sa.Column('models_used', sa.Text()),
        sa.Column('input_length', sa.Integer()),
        sa.Column('models_requested', sa.Integer()),
        sa.Column('models_successful', sa.Integer()),
        sa.Column('models_failed', sa.Integer()),
        sa.Column('processing_time_ms', sa.Integer()),
        sa.Column('estimated_cost', sa.DECIMAL(10, 4)),
        sa.Column('is_overage', sa.Boolean(), default=False),
        sa.Column('overage_charge', sa.DECIMAL(10, 4), default=0),
        sa.Column('input_tokens', sa.Integer()),
        sa.Column('output_tokens', sa.Integer()),
        sa.Column('total_tokens', sa.Integer()),
        sa.Column('effective_tokens', sa.Integer()),
        sa.Column('credits_used', sa.DECIMAL(10, 4)),
        sa.Column('actual_cost', sa.DECIMAL(10, 4)),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), index=True),
    )
    
    # Subscription history table
    op.create_table(
        'subscription_history',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('previous_tier', sa.String(50)),
        sa.Column('new_tier', sa.String(50), nullable=False),
        sa.Column('period', sa.String(20)),
        sa.Column('amount_paid', sa.DECIMAL(10, 2)),
        sa.Column('stripe_payment_id', sa.String(255)),
        sa.Column('reason', sa.String(100)),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), index=True),
    )
    
    # Payment transactions table
    op.create_table(
        'payment_transactions',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('stripe_payment_intent_id', sa.String(255), index=True),
        sa.Column('amount', sa.DECIMAL(10, 2), nullable=False),
        sa.Column('currency', sa.String(3), default='USD'),
        sa.Column('status', sa.String(50)),
        sa.Column('description', sa.Text()),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )
    
    # Admin action logs table
    op.create_table(
        'admin_action_logs',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('admin_user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True, index=True),
        sa.Column('target_user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True, index=True),
        sa.Column('action_type', sa.String(100), nullable=False),
        sa.Column('action_description', sa.Text(), nullable=False),
        sa.Column('details', sa.Text()),
        sa.Column('ip_address', sa.String(45)),
        sa.Column('user_agent', sa.Text()),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), index=True),
    )
    
    # Credit transactions table
    op.create_table(
        'credit_transactions',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('transaction_type', sa.String(50), nullable=False),
        sa.Column('credits_amount', sa.Integer(), nullable=False),
        sa.Column('description', sa.Text()),
        sa.Column('related_usage_log_id', sa.Integer(), sa.ForeignKey('usage_logs.id', ondelete='SET NULL'), nullable=True, index=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), index=True),
    )
    
    # Usage log monthly aggregates table
    op.create_table(
        'usage_log_monthly_aggregates',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('year', sa.Integer(), nullable=False, index=True),
        sa.Column('month', sa.Integer(), nullable=False, index=True),
        sa.Column('total_comparisons', sa.Integer(), default=0),
        sa.Column('total_models_requested', sa.Integer(), default=0),
        sa.Column('total_models_successful', sa.Integer(), default=0),
        sa.Column('total_models_failed', sa.Integer(), default=0),
        sa.Column('total_input_tokens', sa.BigInteger(), default=0),
        sa.Column('total_output_tokens', sa.BigInteger(), default=0),
        sa.Column('total_effective_tokens', sa.BigInteger(), default=0),
        sa.Column('avg_input_tokens', sa.DECIMAL(10, 2), default=0),
        sa.Column('avg_output_tokens', sa.DECIMAL(10, 2), default=0),
        sa.Column('avg_output_ratio', sa.DECIMAL(10, 4), default=0),
        sa.Column('total_credits_used', sa.DECIMAL(12, 4), default=0),
        sa.Column('avg_credits_per_comparison', sa.DECIMAL(10, 4), default=0),
        sa.Column('total_actual_cost', sa.DECIMAL(12, 4), default=0),
        sa.Column('total_estimated_cost', sa.DECIMAL(12, 4), default=0),
        sa.Column('model_breakdown', sa.Text()),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.UniqueConstraint('year', 'month', name='uq_usage_log_monthly_year_month'),
    )
    
    # App settings table
    op.create_table(
        'app_settings',
        sa.Column('id', sa.Integer(), primary_key=True, default=1),
        sa.Column('anonymous_mock_mode_enabled', sa.Boolean(), default=False),
        sa.Column('active_search_provider', sa.String(50), default=None),
        sa.Column('search_provider_config', sa.Text(), default=None),
        sa.Column('web_search_enabled', sa.Boolean(), default=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now()),
    )


def downgrade() -> None:
    """Drop all tables."""
    op.drop_table('app_settings')
    op.drop_table('usage_log_monthly_aggregates')
    op.drop_table('credit_transactions')
    op.drop_table('admin_action_logs')
    op.drop_table('payment_transactions')
    op.drop_table('subscription_history')
    op.drop_table('usage_logs')
    op.drop_table('conversation_messages')
    op.drop_table('conversations')
    op.drop_table('user_preferences')
    op.drop_table('users')
