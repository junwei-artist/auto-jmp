#!/usr/bin/env python3
"""
Script to add ANNOUNCEMENT enum value to notificationtype enum.
This can be run directly without going through alembic migrations.
"""
import asyncio
import asyncpg
import os
from urllib.parse import urlparse

async def add_announcement_enum():
    # Get database URL from environment or use default
    database_url = os.getenv("DATABASE_URL", "postgresql+asyncpg://data_user:data_userpassword@localhost/data_analysis")
    
    # Parse the database URL
    # Format: postgresql+asyncpg://user:password@host:port/database
    parsed = urlparse(database_url.replace("postgresql+asyncpg://", "postgresql://"))
    
    # Extract connection details
    user = parsed.username or "data_user"
    password = parsed.password or "data_userpassword"
    host = parsed.hostname or "localhost"
    port = parsed.port or 5432
    database = parsed.path.lstrip("/") or "data_analysis"
    
    print(f"Connecting to database: {database} on {host}:{port} as {user}")
    
    try:
        # Connect to database
        conn = await asyncpg.connect(
            host=host,
            port=port,
            user=user,
            password=password,
            database=database
        )
        
        print("Connected successfully!")
        
        # Check if ANNOUNCEMENT already exists
        check_query = """
            SELECT EXISTS (
                SELECT 1 FROM pg_enum 
                WHERE enumlabel = 'ANNOUNCEMENT' 
                AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notificationtype')
            )
        """
        
        exists = await conn.fetchval(check_query)
        
        if exists:
            print("✓ ANNOUNCEMENT enum value already exists in the database.")
        else:
            print("Adding ANNOUNCEMENT enum value...")
            
            # Add the enum value
            add_query = "ALTER TYPE notificationtype ADD VALUE 'ANNOUNCEMENT'"
            await conn.execute(add_query)
            
            print("✓ Successfully added ANNOUNCEMENT enum value!")
        
        # Verify it was added
        verify_query = """
            SELECT enumlabel FROM pg_enum 
            WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notificationtype')
            ORDER BY enumsortorder
        """
        
        enum_values = await conn.fetch(verify_query)
        print("\nCurrent notificationtype enum values:")
        for row in enum_values:
            print(f"  - {row['enumlabel']}")
        
        await conn.close()
        print("\n✓ Done!")
        
    except Exception as e:
        print(f"✗ Error: {e}")
        print("\nYou can also run this SQL manually:")
        print("ALTER TYPE notificationtype ADD VALUE 'ANNOUNCEMENT';")
        return 1
    
    return 0

if __name__ == "__main__":
    exit_code = asyncio.run(add_announcement_enum())
    exit(exit_code)

