#!/usr/bin/env python3
"""
Database Reset Script

This script resets the database and creates a fresh admin user.
Usage: python reset_db.py
"""

import asyncio
import sys
import os
import uuid
from datetime import datetime
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import text

# Add the backend directory to the Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.core.database import Base
from app.models import AppUser
from app.core.auth import get_password_hash

async def reset_database():
    """Reset the database and create admin user."""
    
    # Get database URL from environment or .env file
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        # Try to read from .env file
        env_file = os.path.join(os.path.dirname(__file__), ".env")
        if os.path.exists(env_file):
            with open(env_file, 'r') as f:
                for line in f:
                    if line.startswith("DATABASE_URL="):
                        database_url = line.split("=", 1)[1].strip()
                        break
    
    if not database_url:
        print("❌ DATABASE_URL not found in environment or .env file")
        return False
    
    print("🗄️  Database Reset & Admin Creation")
    print("====================================")
    print(f"Database URL: {database_url}")
    
    # Create engine
    engine = create_async_engine(database_url)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    
    try:
        # Drop all tables
        print("🗑️  Dropping all tables...")
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
        print("✅ Tables dropped successfully.")
        
        # Create all tables
        print("🏗️  Creating database tables...")
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        print("✅ Tables created successfully.")
        
        # Create admin user
        print("👤 Creating admin user...")
        async with session_factory() as db:
            # Check if admin user already exists
            result = await db.execute(
                text("SELECT id FROM app_user WHERE email = :email"),
                {"email": "admin@admin.com"}
            )
            existing_admin = result.fetchone()
            
            if existing_admin:
                print("⚠️  Admin user already exists. Updating password...")
                await db.execute(
                    text("UPDATE app_user SET password_hash = :password_hash, last_login = :last_login WHERE email = :email"),
                    {
                        "password_hash": get_password_hash("admin"),
                        "last_login": datetime.utcnow(),
                        "email": "admin@admin.com"
                    }
                )
            else:
                print("➕ Creating new admin user...")
                admin_user = AppUser(
                    id=uuid.uuid4(),
                    email="admin@admin.com",
                    password_hash=get_password_hash("admin"),
                    is_admin=True,
                    is_guest=False,
                    created_at=datetime.utcnow()
                )
                db.add(admin_user)
            
            await db.commit()
            print("✅ Admin user created/updated successfully!")
        
        # Verify admin user
        print("🔍 Verifying admin user...")
        async with session_factory() as db:
            result = await db.execute(
                text("SELECT id, email, is_admin, is_guest, created_at FROM app_user WHERE email = :email"),
                {"email": "admin@admin.com"}
            )
            admin_user = result.fetchone()
            
            if admin_user:
                print("✅ Admin user verified:")
                print(f"   ID: {admin_user.id}")
                print(f"   Email: {admin_user.email}")
                print(f"   Is Admin: {admin_user.is_admin}")
                print(f"   Is Guest: {admin_user.is_guest}")
                print(f"   Created: {admin_user.created_at}")
            else:
                print("❌ Admin user not found!")
                return False
        
        print("\n🎉 Database reset completed successfully!")
        print("==========================================")
        print("You can now login with:")
        print("  Email: admin@admin.com")
        print("  Password: admin")
        print("\nFrontend: http://localhost:3000")
        print("Backend:  http://localhost:8000")
        print("Admin Dashboard: http://localhost:3000/admin/dashboard")
        
        return True
        
    except Exception as e:
        print(f"❌ Error during database reset: {e}")
        return False
    
    finally:
        await engine.dispose()

if __name__ == "__main__":
    try:
        success = asyncio.run(reset_database())
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n⚠️  Operation cancelled by user.")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        sys.exit(1)
