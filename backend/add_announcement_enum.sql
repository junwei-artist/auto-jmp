-- Add ANNOUNCEMENT to notificationtype enum
-- Run this SQL script manually if the migration doesn't work
-- 
-- Usage: psql -d your_database_name -f add_announcement_enum.sql
-- Or connect to your database and run the command below

DO $$ 
BEGIN
    -- Check if ANNOUNCEMENT already exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'ANNOUNCEMENT' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notificationtype')
    ) THEN
        ALTER TYPE notificationtype ADD VALUE 'ANNOUNCEMENT';
        RAISE NOTICE 'ANNOUNCEMENT enum value added successfully';
    ELSE
        RAISE NOTICE 'ANNOUNCEMENT enum value already exists';
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Error adding ANNOUNCEMENT enum value: %', SQLERRM;
END $$;

