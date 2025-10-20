"""add_artifact_comment_table

Revision ID: 5d4ff308ec28
Revises: 5c9ea69a7f29
Create Date: 2025-10-20 10:10:27.971287

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '5d4ff308ec28'
down_revision = '5c9ea69a7f29'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create artifact_comment table
    op.create_table('artifact_comment',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('artifact_id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('parent_id', sa.UUID(), nullable=True),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['artifact_id'], ['artifact.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['parent_id'], ['artifact_comment.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['app_user.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Add ARTIFACT_COMMENT_ADDED to notification_type enum
    op.execute("ALTER TYPE notificationtype ADD VALUE 'artifact_comment_added'")


def downgrade() -> None:
    # Drop artifact_comment table
    op.drop_table('artifact_comment')
    
    # Note: PostgreSQL doesn't support removing enum values easily
    # The enum value 'artifact_comment_added' will remain but be unused
