"""add_oauth2_tables

Revision ID: f0195baaeb4a
Revises: 4dfd0f633d72
Create Date: 2025-10-27 13:46:03.299981

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'f0195baaeb4a'
down_revision = '4dfd0f633d72'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create oauth_client table
    op.create_table(
        'oauth_client',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('client_id', sa.String(), unique=True, nullable=False),
        sa.Column('client_secret_hash', sa.String(), nullable=False),
        sa.Column('client_name', sa.String(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('redirect_uris', postgresql.JSON(), nullable=True),
        sa.Column('owner_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('is_active', sa.Boolean(), default=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('last_used_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['owner_id'], ['app_user.id'], ondelete='CASCADE'),
    )
    
    # Create authorization_code table
    op.create_table(
        'authorization_code',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('code', sa.String(), unique=True, nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('client_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('redirect_uri', sa.String(), nullable=False),
        sa.Column('code_challenge', sa.String(), nullable=True),
        sa.Column('code_challenge_method', sa.String(), nullable=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('used', sa.Boolean(), default=False),
        sa.ForeignKeyConstraint(['user_id'], ['app_user.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['client_id'], ['oauth_client.id'], ondelete='CASCADE'),
    )


def downgrade() -> None:
    op.drop_table('authorization_code')
    op.drop_table('oauth_client')
