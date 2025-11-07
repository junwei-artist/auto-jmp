"""Make workflows independent of workspaces (many-to-many relationship)

Revision ID: i3456j7890k1
Revises: h2345i6789j0
Create Date: 2025-01-07 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'i3456j7890k1'
down_revision = 'h2345i6789j0'
branch_labels = None
depends_on = None


def upgrade():
    # Create the many-to-many relationship table
    op.create_table(
        'workspace_workflow',
        sa.Column('workspace_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('workflow_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['workspace_id'], ['workspace.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['workflow_id'], ['workflow.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('workspace_id', 'workflow_id')
    )
    
    # Migrate existing workflow-workspace relationships to the new table
    op.execute("""
        INSERT INTO workspace_workflow (workspace_id, workflow_id, created_at)
        SELECT workspace_id, id, created_at
        FROM workflow
        WHERE workspace_id IS NOT NULL
    """)
    
    # Remove the workspace_id foreign key constraint and column
    op.drop_constraint('workflow_workspace_id_fkey', 'workflow', type_='foreignkey')
    op.drop_column('workflow', 'workspace_id')


def downgrade():
    # Add back the workspace_id column
    op.add_column('workflow', sa.Column('workspace_id', postgresql.UUID(as_uuid=True), nullable=True))
    
    # Migrate data back (use first workspace for each workflow)
    op.execute("""
        UPDATE workflow w
        SET workspace_id = (
            SELECT workspace_id
            FROM workspace_workflow ww
            WHERE ww.workflow_id = w.id
            LIMIT 1
        )
    """)
    
    # Add back the foreign key constraint
    op.create_foreign_key('workflow_workspace_id_fkey', 'workflow', 'workspace', ['workspace_id'], ['id'], ondelete='CASCADE')
    
    # Drop the many-to-many table
    op.drop_table('workspace_workflow')

