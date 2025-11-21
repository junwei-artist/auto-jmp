# Adding ANNOUNCEMENT Enum Value

The `ANNOUNCEMENT` notification type needs to be added to the database enum before the broadcast feature can work.

## Option 1: Run Alembic Migration (Recommended)

```bash
cd backend
alembic upgrade head
```

This will run the migration file `697b31202cd_add_announcement_notification_type.py` which adds the `ANNOUNCEMENT` value to the `notificationtype` enum.

## Option 2: Run SQL Script Manually

If the migration doesn't work, you can run the SQL script directly:

```bash
psql -d your_database_name -f backend/add_announcement_enum.sql
```

Or connect to your database and run:

```sql
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'ANNOUNCEMENT' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notificationtype')
    ) THEN
        ALTER TYPE notificationtype ADD VALUE 'ANNOUNCEMENT';
    END IF;
END $$;
```

## Verify

After running either option, verify the enum value was added:

```sql
SELECT enumlabel FROM pg_enum 
WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notificationtype')
ORDER BY enumsortorder;
```

You should see `ANNOUNCEMENT` in the list.

