"""add_drawing_folder_and_images_tables

Revision ID: c2d0d2e4b002
Revises: b1c0c1e3a001
Create Date: 2025-01-01 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c2d0d2e4b002'
down_revision = 'b1c0c1e3a001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'drawing_folder',
        sa.Column('id', sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('project_id', sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey('project.id', ondelete='CASCADE'), nullable=False),
        sa.Column('created_by', sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey('app_user.id', ondelete='SET NULL')),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()')),
    )

    op.create_index('ix_drawing_folder_project_created', 'drawing_folder', ['project_id', 'created_at'])

    op.create_table(
        'drawing_image',
        sa.Column('id', sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('folder_id', sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey('drawing_folder.id', ondelete='CASCADE'), nullable=False),
        sa.Column('uploaded_by', sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey('app_user.id', ondelete='SET NULL')),
        sa.Column('filename', sa.String(), nullable=False),
        sa.Column('storage_key', sa.String(), nullable=False),
        sa.Column('file_size', sa.BigInteger(), nullable=False),
        sa.Column('mime_type', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()')),
    )

    op.create_index('ix_drawing_image_folder_created', 'drawing_image', ['folder_id', 'created_at'])


def downgrade() -> None:
    op.drop_index('ix_drawing_image_folder_created', table_name='drawing_image')
    op.drop_table('drawing_image')
    op.drop_index('ix_drawing_folder_project_created', table_name='drawing_folder')
    op.drop_table('drawing_folder')

