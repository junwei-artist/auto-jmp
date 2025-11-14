"""add index on workflow_node module_type

Revision ID: i3456j7890k1_add_index_on_workflow_node_module_type
Revises: g1234h5678i9
Create Date: 2024-11-11 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'i3456j7890k1_add_index_on_workflow_node_module_type'
down_revision = 'h2345i6789j0_add_workspace_folder_path'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create index on workflow_node.module_type for faster queries
    op.create_index(
        'ix_workflow_node_module_type',
        'workflow_node',
        ['module_type'],
        unique=False
    )


def downgrade() -> None:
    # Drop the index
    op.drop_index('ix_workflow_node_module_type', table_name='workflow_node')

