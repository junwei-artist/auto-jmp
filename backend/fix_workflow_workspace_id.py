#!/usr/bin/env python3
"""
Script to remove workspace_id column from workflow table and create workspace_workflow table.
This fixes the database to match the new many-to-many relationship model.
"""
import asyncio
import sys
from pathlib import Path

# Add parent directory to path to import app modules
sys.path.insert(0, str(Path(__file__).parent))

from sqlalchemy import text
from app.core.database import engine

async def fix_workflow_table():
    """Remove workspace_id column and create workspace_workflow table"""
    async with engine.begin() as conn:
        try:
            # Check if workspace_workflow table exists
            result = await conn.execute(text("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = 'workspace_workflow'
                )
            """))
            table_exists = result.scalar()
            
            if not table_exists:
                print("Creating workspace_workflow table...")
                # Create the many-to-many relationship table
                await conn.execute(text("""
                    CREATE TABLE workspace_workflow (
                        workspace_id UUID NOT NULL,
                        workflow_id UUID NOT NULL,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
                        PRIMARY KEY (workspace_id, workflow_id),
                        FOREIGN KEY (workspace_id) REFERENCES workspace(id) ON DELETE CASCADE,
                        FOREIGN KEY (workflow_id) REFERENCES workflow(id) ON DELETE CASCADE
                    )
                """))
                print("✓ Created workspace_workflow table")
            else:
                print("✓ workspace_workflow table already exists")
            
            # Check if workspace_id column exists
            result = await conn.execute(text("""
                SELECT EXISTS (
                    SELECT FROM information_schema.columns 
                    WHERE table_schema = 'public' 
                    AND table_name = 'workflow' 
                    AND column_name = 'workspace_id'
                )
            """))
            column_exists = result.scalar()
            
            if column_exists:
                print("Migrating existing workflow-workspace relationships...")
                # Migrate existing data to workspace_workflow table
                await conn.execute(text("""
                    INSERT INTO workspace_workflow (workspace_id, workflow_id, created_at)
                    SELECT workspace_id, id, created_at
                    FROM workflow
                    WHERE workspace_id IS NOT NULL
                    ON CONFLICT (workspace_id, workflow_id) DO NOTHING
                """))
                print("✓ Migrated existing relationships")
                
                print("Dropping foreign key constraint...")
                # Drop foreign key constraint if it exists
                try:
                    await conn.execute(text("""
                        ALTER TABLE workflow 
                        DROP CONSTRAINT IF EXISTS workflow_workspace_id_fkey
                    """))
                    print("✓ Dropped foreign key constraint")
                except Exception as e:
                    print(f"  Note: Could not drop constraint (may not exist): {e}")
                
                print("Dropping workspace_id column...")
                # Drop the column
                await conn.execute(text("""
                    ALTER TABLE workflow 
                    DROP COLUMN IF EXISTS workspace_id
                """))
                print("✓ Dropped workspace_id column")
            else:
                print("✓ workspace_id column already removed")
            
            print("\n✅ Database migration completed successfully!")
            
        except Exception as e:
            print(f"\n❌ Error: {e}")
            import traceback
            traceback.print_exc()
            raise

if __name__ == "__main__":
    print("Starting database migration...")
    asyncio.run(fix_workflow_table())
