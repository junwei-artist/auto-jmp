-- Add new notification type enum values
-- IMPORTANT: These commands CANNOT be run inside a transaction
-- Run this script manually using psql or your database client
-- 
-- Usage: psql -d data_analysis -f add_notification_enum_values.sql
-- Or connect to your database and run each command individually

-- Note: PostgreSQL doesn't support IF NOT EXISTS for ALTER TYPE ADD VALUE
-- If a value already exists, you'll get an error - that's okay, just skip it

DO $$ 
BEGIN
    -- Check and add COMMUNITY_POST_CREATED
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'COMMUNITY_POST_CREATED' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notificationtype')
    ) THEN
        ALTER TYPE notificationtype ADD VALUE 'COMMUNITY_POST_CREATED';
    END IF;
    
    -- Check and add COMMUNITY_POST_UPDATED
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'COMMUNITY_POST_UPDATED' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notificationtype')
    ) THEN
        ALTER TYPE notificationtype ADD VALUE 'COMMUNITY_POST_UPDATED';
    END IF;
    
    -- Check and add COMMUNITY_POST_LIKED
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'COMMUNITY_POST_LIKED' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notificationtype')
    ) THEN
        ALTER TYPE notificationtype ADD VALUE 'COMMUNITY_POST_LIKED';
    END IF;
    
    -- Check and add COMMUNITY_POST_COMMENTED
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'COMMUNITY_POST_COMMENTED' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notificationtype')
    ) THEN
        ALTER TYPE notificationtype ADD VALUE 'COMMUNITY_POST_COMMENTED';
    END IF;
END $$;


