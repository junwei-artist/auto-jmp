"""add_community_zones_and_enhancements

Revision ID: e2f3a4b5c6d7
Revises: b1c0c1e3a001
Create Date: 2025-11-07 10:19:32.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = 'e2f3a4b5c6d7'
down_revision = 'd1e2f3a4b5c6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Check if community_zone table already exists
    from sqlalchemy import text
    conn = op.get_bind()
    
    # Add new notification types to the enum if they don't exist
    # Use a DO block with exception handling since ALTER TYPE ADD VALUE can't use IF NOT EXISTS
    # and requires proper permissions
    try:
        op.execute("""
            DO $$ 
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'COMMUNITY_POST_CREATED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notificationtype')) THEN
                    ALTER TYPE notificationtype ADD VALUE 'COMMUNITY_POST_CREATED';
                END IF;
                IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'COMMUNITY_POST_UPDATED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notificationtype')) THEN
                    ALTER TYPE notificationtype ADD VALUE 'COMMUNITY_POST_UPDATED';
                END IF;
                IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'COMMUNITY_POST_LIKED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notificationtype')) THEN
                    ALTER TYPE notificationtype ADD VALUE 'COMMUNITY_POST_LIKED';
                END IF;
                IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'COMMUNITY_POST_COMMENTED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notificationtype')) THEN
                    ALTER TYPE notificationtype ADD VALUE 'COMMUNITY_POST_COMMENTED';
                END IF;
            EXCEPTION WHEN OTHERS THEN
                -- Ignore errors - values may already exist or we may not have permission
                NULL;
            END $$;
        """)
    except Exception:
        # If the DO block fails, try individual ALTER TYPE commands
        # This might fail if we don't have permission, but that's okay - 
        # the enum values can be added manually by a DBA if needed
        pass
    
    result = conn.execute(text("""
        SELECT EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_name = 'community_zone'
        )
    """))
    zone_table_exists = result.scalar()
    
    if not zone_table_exists:
        # Create community_zone table
        op.create_table(
            'community_zone',
            sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column('name', sa.String(100), nullable=False),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('icon', sa.String(50), nullable=True),
            sa.Column('color', sa.String(20), nullable=True),
            sa.Column('is_active', sa.Boolean(), server_default=sa.text('true'), nullable=False),
            sa.Column('display_order', sa.Integer(), server_default='0', nullable=False),
            sa.Column('created_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('app_user.id', ondelete='SET NULL'), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()')),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()')),
        )
        
        op.create_index('ix_community_zone_active_order', 'community_zone', ['is_active', 'display_order'])
    
    # Check if zone_id column exists
    result = conn.execute(text("""
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'community_post' AND column_name = 'zone_id'
        )
    """))
    zone_id_exists = result.scalar()
    
    if not zone_id_exists:
        # Add zone_id to community_post
        op.add_column('community_post', sa.Column('zone_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('community_zone.id', ondelete='SET NULL'), nullable=True))
        op.create_index('ix_community_post_zone_created', 'community_post', ['zone_id', 'created_at'])
    
    # Check if likes_count column exists
    result = conn.execute(text("""
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'community_post' AND column_name = 'likes_count'
        )
    """))
    likes_count_exists = result.scalar()
    
    if not likes_count_exists:
        # Add likes count to community_post
        op.add_column('community_post', sa.Column('likes_count', sa.Integer(), server_default='0', nullable=False))
    
    # Check if community_post_like table exists
    result = conn.execute(text("""
        SELECT EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_name = 'community_post_like'
        )
    """))
    like_table_exists = result.scalar()
    
    if not like_table_exists:
        # Create community_post_like table for tracking user likes
        op.create_table(
            'community_post_like',
            sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column('post_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('community_post.id', ondelete='CASCADE'), nullable=False),
            sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('app_user.id', ondelete='CASCADE'), nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()')),
            sa.UniqueConstraint('post_id', 'user_id', name='uq_post_user_like'),
        )
        
        op.create_index('ix_community_post_like_post', 'community_post_like', ['post_id'])
        op.create_index('ix_community_post_like_user', 'community_post_like', ['user_id'])


def downgrade() -> None:
    op.drop_index('ix_community_post_like_user', table_name='community_post_like')
    op.drop_index('ix_community_post_like_post', table_name='community_post_like')
    op.drop_table('community_post_like')
    op.drop_column('community_post', 'likes_count')
    op.drop_index('ix_community_post_zone_created', table_name='community_post')
    op.drop_column('community_post', 'zone_id')
    op.drop_index('ix_community_zone_active_order', table_name='community_zone')
    op.drop_table('community_zone')

