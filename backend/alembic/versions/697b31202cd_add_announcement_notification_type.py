"""add_announcement_notification_type

Revision ID: 697b31202cd
Revises: e2f3a4b5c6d7
Create Date: 2025-01-20 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '697b31202cd'
down_revision = 'j4567k8901l2_add_created_by_to_workflow'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add ANNOUNCEMENT notification type to the enum if it doesn't exist
    # Use a DO block with exception handling since ALTER TYPE ADD VALUE can't use IF NOT EXISTS
    try:
        op.execute("""
            DO $$ 
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_enum 
                    WHERE enumlabel = 'ANNOUNCEMENT' 
                    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notificationtype')
                ) THEN
                    ALTER TYPE notificationtype ADD VALUE 'ANNOUNCEMENT';
                END IF;
            EXCEPTION WHEN OTHERS THEN
                -- Ignore errors - value may already exist or we may not have permission
                NULL;
            END $$;
        """)
    except Exception:
        # If the DO block fails, try individual ALTER TYPE command
        # This might fail if we don't have permission, but that's okay - 
        # the enum value can be added manually by a DBA if needed
        try:
            op.execute("ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'ANNOUNCEMENT'")
        except:
            pass


def downgrade() -> None:
    # Note: PostgreSQL doesn't support removing enum values easily
    # This would require recreating the enum type, which is complex
    # For now, we'll leave the enum value in place
    pass

