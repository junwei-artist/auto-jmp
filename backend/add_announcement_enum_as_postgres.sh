#!/bin/bash
# Script to add ANNOUNCEMENT enum value as postgres superuser
# Usage: ./add_announcement_enum_as_postgres.sh [database_name]

DATABASE_NAME=${1:-data_analysis}

echo "Adding ANNOUNCEMENT enum value to notificationtype enum..."
echo "Database: $DATABASE_NAME"
echo ""

psql -U postgres -d "$DATABASE_NAME" <<EOF
DO \$\$ 
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
    RAISE NOTICE 'Error: %', SQLERRM;
END \$\$;

-- Verify
SELECT enumlabel FROM pg_enum 
WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notificationtype')
ORDER BY enumsortorder;
EOF

echo ""
echo "Done!"

