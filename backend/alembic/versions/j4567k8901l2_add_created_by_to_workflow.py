"""add created_by to workflow

Revision ID: j4567k8901l2_add_created_by_to_workflow
Revises: i3456j7890k1_add_index_on_workflow_node_module_type
Create Date: 2024-11-11 13:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'j4567k8901l2_add_created_by_to_workflow'
down_revision = 'i3456j7890k1_add_index_on_workflow_node_module_type'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add created_by column to workflow table
    op.add_column(
        'workflow',
        sa.Column('created_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('app_user.id', ondelete='SET NULL'), nullable=True)
    )
    
    # Create index on created_by for faster queries
    op.create_index(
        'ix_workflow_created_by',
        'workflow',
        ['created_by'],
        unique=False
    )


def downgrade() -> None:
    # Drop the index
    op.drop_index('ix_workflow_created_by', table_name='workflow')
    
    # Drop the column
    op.drop_column('workflow', 'created_by')

