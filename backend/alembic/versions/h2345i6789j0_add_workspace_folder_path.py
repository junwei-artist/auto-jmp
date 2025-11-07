"""add workspace folder_path column

Revision ID: h2345i6789j0_add_workspace_folder_path
Revises: g1234h5678i9_add_workspace_tables
Create Date: 2024-11-07 15:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'h2345i6789j0_add_workspace_folder_path'
down_revision = 'g1234h5678i9_add_workspace_tables'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add folder_path column to workspace table
    op.add_column('workspace', sa.Column('folder_path', sa.String(), nullable=True))


def downgrade() -> None:
    # Remove folder_path column from workspace table
    op.drop_column('workspace', 'folder_path')

