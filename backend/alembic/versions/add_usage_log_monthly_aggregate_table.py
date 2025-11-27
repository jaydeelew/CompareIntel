"""Add usage log monthly aggregate table

Revision ID: add_usage_log_monthly_aggregate
Revises: add_credits_system_fields, add_performance_indexes
Create Date: 2025-11-24 22:00:00.000000

This migration adds the UsageLogMonthlyAggregate table for data retention.
This table stores monthly aggregated statistics from UsageLog entries,
allowing old detailed entries to be deleted while preserving aggregated
data for long-term analysis.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'add_usage_log_monthly_aggregate'
down_revision = 'add_token_fields_to_conversation_messages'  # Revises token fields migration
branch_labels = None
depends_on = None


def upgrade():
    """Create usage_log_monthly_aggregates table."""
    
    # Create usage_log_monthly_aggregates table
    op.create_table(
        'usage_log_monthly_aggregates',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('year', sa.Integer(), nullable=False),
        sa.Column('month', sa.Integer(), nullable=False),
        
        # Aggregated statistics
        sa.Column('total_comparisons', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('total_models_requested', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('total_models_successful', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('total_models_failed', sa.Integer(), nullable=True, server_default='0'),
        
        # Token aggregates
        sa.Column('total_input_tokens', sa.BigInteger(), nullable=True, server_default='0'),
        sa.Column('total_output_tokens', sa.BigInteger(), nullable=True, server_default='0'),
        sa.Column('total_effective_tokens', sa.BigInteger(), nullable=True, server_default='0'),
        sa.Column('avg_input_tokens', sa.DECIMAL(10, 2), nullable=True, server_default='0'),
        sa.Column('avg_output_tokens', sa.DECIMAL(10, 2), nullable=True, server_default='0'),
        sa.Column('avg_output_ratio', sa.DECIMAL(10, 4), nullable=True, server_default='0'),
        
        # Credit aggregates
        sa.Column('total_credits_used', sa.DECIMAL(12, 4), nullable=True, server_default='0'),
        sa.Column('avg_credits_per_comparison', sa.DECIMAL(10, 4), nullable=True, server_default='0'),
        
        # Cost aggregates
        sa.Column('total_actual_cost', sa.DECIMAL(12, 4), nullable=True, server_default='0'),
        sa.Column('total_estimated_cost', sa.DECIMAL(12, 4), nullable=True, server_default='0'),
        
        # Model breakdown (JSON)
        sa.Column('model_breakdown', sa.Text(), nullable=True),
        
        # Timestamps
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('year', 'month', name='uq_usage_log_monthly_year_month')
    )
    
    # Create indexes
    op.create_index(op.f('ix_usage_log_monthly_aggregates_id'), 'usage_log_monthly_aggregates', ['id'], unique=False)
    op.create_index(op.f('ix_usage_log_monthly_aggregates_year'), 'usage_log_monthly_aggregates', ['year'], unique=False)
    op.create_index(op.f('ix_usage_log_monthly_aggregates_month'), 'usage_log_monthly_aggregates', ['month'], unique=False)


def downgrade():
    """Drop usage_log_monthly_aggregates table."""
    op.drop_index(op.f('ix_usage_log_monthly_aggregates_month'), table_name='usage_log_monthly_aggregates')
    op.drop_index(op.f('ix_usage_log_monthly_aggregates_year'), table_name='usage_log_monthly_aggregates')
    op.drop_index(op.f('ix_usage_log_monthly_aggregates_id'), table_name='usage_log_monthly_aggregates')
    op.drop_table('usage_log_monthly_aggregates')


