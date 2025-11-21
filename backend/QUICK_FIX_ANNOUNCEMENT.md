# Quick Fix: Add ANNOUNCEMENT Enum Value

The `ANNOUNCEMENT` enum value needs to be added to your PostgreSQL database. 

## Quick One-Liner Solution

Run this command in your terminal:

```bash
psql -U postgres -d data_analysis -c "DO \$\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'ANNOUNCEMENT' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notificationtype')) THEN ALTER TYPE notificationtype ADD VALUE 'ANNOUNCEMENT'; END IF; END \$\$;"
```

Or the simpler version (will error if already exists, but that's okay):

```bash
psql -U postgres -d data_analysis -c "ALTER TYPE notificationtype ADD VALUE 'ANNOUNCEMENT';"
```

**Note:** You may be prompted for the postgres user password.

## Alternative: If you don't know the postgres password

1. Connect to PostgreSQL:
```bash
psql -U postgres -d data_analysis
```

2. If prompted for password, enter your postgres password (or press Enter if no password is set)

3. Run this SQL command:
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

Or simply (will error if already exists, but that's fine):
```sql
ALTER TYPE notificationtype ADD VALUE 'ANNOUNCEMENT';
```

4. Verify it was added:
```sql
SELECT enumlabel FROM pg_enum 
WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notificationtype')
ORDER BY enumsortorder;
```

5. Exit:
```sql
\q
```

## After Adding the Enum Value

Once the enum value is added, the broadcast announcement feature will work immediately. You don't need to restart the server.

## Verify It's Working

After adding the enum value, try broadcasting an announcement again from the admin panel. It should work without errors.

