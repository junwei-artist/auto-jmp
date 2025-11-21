"""add_project_history_log_table

Revision ID: d1e2f3a4b5c6
Revises: c2d0d2e4b002
Create Date: 2025-01-15 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = 'd1e2f3a4b5c6'
down_revision = 'c2d0d2e4b002'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'project_history_log',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('project.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('app_user.id', ondelete='SET NULL'), nullable=True),
        sa.Column('action_type', sa.String(), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('extra_data', postgresql.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()')),
    )

    op.create_index('ix_project_history_log_project_created', 'project_history_log', ['project_id', 'created_at'])


def downgrade() -> None:
    op.drop_index('ix_project_history_log_project_created', table_name='project_history_log')
    op.drop_table('project_history_log')

