"""add_community_tables

Revision ID: b1c0c1e3a001
Revises: f0195baaeb4a
Create Date: 2025-10-30 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b1c0c1e3a001'
down_revision = 'f0195baaeb4a'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'community_post',
        sa.Column('id', sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('author_id', sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey('app_user.id', ondelete='SET NULL')),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('type', sa.Enum('question', 'tutorial', 'manual', 'sharing', 'tip', 'other', name='communityposttype'), nullable=False, server_default='sharing'),
        sa.Column('tags', sa.JSON(), nullable=True),
        sa.Column('views', sa.BigInteger(), server_default='0'),
        sa.Column('is_pinned', sa.Boolean(), server_default=sa.text('false')),
        sa.Column('is_locked', sa.Boolean(), server_default=sa.text('false')),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()')),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    )

    op.create_index('ix_community_post_type_created', 'community_post', ['type', 'created_at'])
    op.create_index('ix_community_post_pinned_created', 'community_post', ['is_pinned', 'created_at'])

    op.create_table(
        'community_comment',
        sa.Column('id', sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('post_id', sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey('community_post.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey('app_user.id', ondelete='SET NULL')),
        sa.Column('parent_id', sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey('community_comment.id'), nullable=True),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()')),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    )

    op.create_index('ix_community_comment_post_created', 'community_comment', ['post_id', 'created_at'])

    op.create_table(
        'community_attachment',
        sa.Column('id', sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('post_id', sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey('community_post.id', ondelete='CASCADE'), nullable=True),
        sa.Column('comment_id', sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey('community_comment.id', ondelete='CASCADE'), nullable=True),
        sa.Column('uploaded_by', sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey('app_user.id', ondelete='SET NULL')),
        sa.Column('filename', sa.String(), nullable=False),
        sa.Column('storage_key', sa.String(), nullable=False),
        sa.Column('file_size', sa.BigInteger(), nullable=False),
        sa.Column('mime_type', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()')),
    )


def downgrade() -> None:
    op.drop_table('community_attachment')
    op.drop_index('ix_community_comment_post_created', table_name='community_comment')
    op.drop_table('community_comment')
    op.drop_index('ix_community_post_pinned_created', table_name='community_post')
    op.drop_index('ix_community_post_type_created', table_name='community_post')
    op.drop_table('community_post')
    sa.Enum(name='communityposttype').drop(op.get_bind(), checkfirst=False)

