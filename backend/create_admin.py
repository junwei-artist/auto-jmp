#!/usr/bin/env python3
"""
Script to create an admin user in the database.
Usage: python create_admin.py
"""

import asyncio
import sys
import os
import hashlib
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

# Add the backend directory to the Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.core.database import AsyncSessionLocal, engine
from app.models import AppUser, Base

def simple_password_hash(password: str) -> str:
    """Simple password hashing for admin creation."""
    # Use SHA-256 with salt for simplicity
    salt = "admin_salt_2024"
    return hashlib.sha256((password + salt).encode()).hexdigest()

async def create_admin_user():
    """Create an admin user with email admin@admin.com and password admin."""
    
    # Create tables if they don't exist
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    async with AsyncSessionLocal() as db:
        try:
            # Check if admin user already exists
            result = await db.execute(select(AppUser).where(AppUser.email == "admin@admin.com"))
            existing_admin = result.scalar_one_or_none()
            
            if existing_admin:
                print("✅ Admin user already exists!")
                print(f"   Email: {existing_admin.email}")
                print(f"   ID: {existing_admin.id}")
                print(f"   Is Admin: {existing_admin.is_admin}")
                print(f"   Created: {existing_admin.created_at}")
                return
            
            # Create new admin user
            admin_user = AppUser(
                email="admin@admin.com",
                password_hash=simple_password_hash("admin"),
                is_admin=True,
                is_guest=False
            )
            
            db.add(admin_user)
            await db.commit()
            await db.refresh(admin_user)
            
            print("✅ Admin user created successfully!")
            print(f"   Email: {admin_user.email}")
            print(f"   Password: admin")
            print(f"   ID: {admin_user.id}")
            print(f"   Is Admin: {admin_user.is_admin}")
            print(f"   Created: {admin_user.created_at}")
            
        except Exception as e:
            print(f"❌ Error creating admin user: {e}")
            await db.rollback()
            raise

async def main():
    """Main function."""
    print("🔐 Creating Admin User")
    print("=" * 50)
    print("Email: admin@admin.com")
    print("Password: admin")
    print("=" * 50)
    
    try:
        await create_admin_user()
        print("\n🎉 Admin user setup complete!")
        print("You can now login with:")
        print("  Email: admin@admin.com")
        print("  Password: admin")
        
    except Exception as e:
        print(f"\n❌ Failed to create admin user: {e}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())
