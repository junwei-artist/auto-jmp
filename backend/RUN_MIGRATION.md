# Database Migration: Remove workspace_id from workflow table

The database still has a `workspace_id` column in the `workflow` table with a NOT NULL constraint. This needs to be removed to make workflows independent.

## Option 1: Run the Alembic Migration (Recommended)

If you have Alembic set up, run:

```bash
cd backend
source venv/bin/activate  # or activate your virtual environment
alembic upgrade head
```

## Option 2: Run the Manual Fix Script

If Alembic is not available, run the manual fix script:

```bash
cd backend
source venv/bin/activate  # or activate your virtual environment
python fix_workflow_workspace_id.py
```

## Option 3: Manual SQL Commands

If neither option works, you can run these SQL commands directly on your database:

```sql
-- 1. Create the workspace_workflow table (if it doesn't exist)
CREATE TABLE IF NOT EXISTS workspace_workflow (
    workspace_id UUID NOT NULL,
    workflow_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    PRIMARY KEY (workspace_id, workflow_id),
    FOREIGN KEY (workspace_id) REFERENCES workspace(id) ON DELETE CASCADE,
    FOREIGN KEY (workflow_id) REFERENCES workflow(id) ON DELETE CASCADE
);

-- 2. Migrate existing relationships
INSERT INTO workspace_workflow (workspace_id, workflow_id, created_at)
SELECT workspace_id, id, created_at
FROM workflow
WHERE workspace_id IS NOT NULL
ON CONFLICT (workspace_id, workflow_id) DO NOTHING;

-- 3. Drop the foreign key constraint
ALTER TABLE workflow 
DROP CONSTRAINT IF EXISTS workflow_workspace_id_fkey;

-- 4. Drop the workspace_id column
ALTER TABLE workflow 
DROP COLUMN IF EXISTS workspace_id;
```

After running any of these options, the workflow creation should work correctly.

