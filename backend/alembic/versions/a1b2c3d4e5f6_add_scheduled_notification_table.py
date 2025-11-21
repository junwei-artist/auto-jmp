"""add_scheduled_notification_table

Revision ID: a1b2c3d4e5f6
Revises: 697b31202cd
Create Date: 2025-01-20 13:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f6'
down_revision = '697b31202cd'  # After add_announcement_notification_type
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create scheduled_notification table
    op.create_table(
        'scheduled_notification',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('scheduled_time', sa.String(), nullable=False),  # Format: "HH:MM"
        sa.Column('timezone', sa.String(), default='UTC'),
        sa.Column('is_active', sa.Boolean(), default=True),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('app_user.id'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.Column('last_sent_at', sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    # Drop scheduled_notification table
    op.drop_table('scheduled_notification')

