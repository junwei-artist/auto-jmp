"""add workspace tables

Revision ID: g1234h5678i9_add_workspace_tables
Revises: e2f3a4b5c6d7
Create Date: 2024-11-07 14:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'g1234h5678i9_add_workspace_tables'
down_revision = 'e2f3a4b5c6d7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Check and create workflow_status enum
    from sqlalchemy import text
    conn = op.get_bind()
    result = conn.execute(text("""
        SELECT EXISTS (
            SELECT 1 FROM pg_type WHERE typname = 'workflowstatus'
        )
    """))
    enum_exists = result.scalar()
    
    if not enum_exists:
        op.execute("CREATE TYPE workflowstatus AS ENUM ('draft', 'running', 'completed', 'failed', 'paused')")
    
    # Check and create workflow_execution_status enum
    result = conn.execute(text("""
        SELECT EXISTS (
            SELECT 1 FROM pg_type WHERE typname = 'workflowexecutionstatus'
        )
    """))
    enum_exists = result.scalar()
    
    if not enum_exists:
        op.execute("CREATE TYPE workflowexecutionstatus AS ENUM ('queued', 'running', 'completed', 'failed', 'cancelled')")
    
    # Create workspace table
    op.create_table(
        'workspace',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('owner_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('app_user.id'), nullable=True),
        sa.Column('is_public', sa.Boolean(), default=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    )
    
    # Create workflow table
    op.create_table(
        'workflow',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('workspace_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workspace.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('status', sa.Enum('draft', 'running', 'completed', 'failed', 'paused', name='workflowstatus', create_type=False), nullable=False, server_default='draft'),
        sa.Column('graph_data', postgresql.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.Column('last_run_at', sa.DateTime(timezone=True), nullable=True),
    )
    
    # Create workflow_node table
    op.create_table(
        'workflow_node',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('workflow_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workflow.id', ondelete='CASCADE'), nullable=False),
        sa.Column('module_type', sa.String(), nullable=False),
        sa.Column('module_id', sa.String(), nullable=False),
        sa.Column('position_x', sa.Integer(), default=0),
        sa.Column('position_y', sa.Integer(), default=0),
        sa.Column('config', postgresql.JSON(), nullable=True),
        sa.Column('state', postgresql.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    
    # Create workflow_connection table
    op.create_table(
        'workflow_connection',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('workflow_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workflow.id', ondelete='CASCADE'), nullable=False),
        sa.Column('source_node_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workflow_node.id', ondelete='CASCADE'), nullable=False),
        sa.Column('target_node_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workflow_node.id', ondelete='CASCADE'), nullable=False),
        sa.Column('source_port', sa.String(), nullable=False),
        sa.Column('target_port', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    
    # Create workflow_execution table
    op.create_table(
        'workflow_execution',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('workflow_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workflow.id', ondelete='CASCADE'), nullable=False),
        sa.Column('started_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('app_user.id'), nullable=True),
        sa.Column('status', sa.Enum('queued', 'running', 'completed', 'failed', 'cancelled', name='workflowexecutionstatus', create_type=False), nullable=False, server_default='queued'),
        sa.Column('message', sa.Text(), nullable=True),
        sa.Column('execution_data', postgresql.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('finished_at', sa.DateTime(timezone=True), nullable=True),
    )
    
    # Create workflow_artifact table
    op.create_table(
        'workflow_artifact',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('workspace_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workspace.id', ondelete='CASCADE'), nullable=False),
        sa.Column('workflow_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workflow.id', ondelete='CASCADE'), nullable=True),
        sa.Column('execution_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workflow_execution.id', ondelete='CASCADE'), nullable=True),
        sa.Column('node_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workflow_node.id', ondelete='SET NULL'), nullable=True),
        sa.Column('kind', sa.String(), nullable=False),
        sa.Column('storage_key', sa.String(), nullable=False),
        sa.Column('filename', sa.String(), nullable=False),
        sa.Column('size_bytes', sa.BigInteger(), nullable=True),
        sa.Column('mime_type', sa.String(), nullable=True),
        sa.Column('artifact_metadata', postgresql.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table('workflow_artifact')
    op.drop_table('workflow_execution')
    op.drop_table('workflow_connection')
    op.drop_table('workflow_node')
    op.drop_table('workflow')
    op.drop_table('workspace')
    
    # Drop enums
    op.execute("DROP TYPE IF EXISTS workflowexecutionstatus")
    op.execute("DROP TYPE IF EXISTS workflowstatus")

