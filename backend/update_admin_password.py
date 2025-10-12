import asyncio
import sys
import os
import hashlib
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from datetime import datetime

# Add the backend directory to the Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.core.database import AsyncSessionLocal, engine
from app.models import AppUser, Base

def simple_password_hash(password: str) -> str:
    """Simple password hashing for admin creation."""
    # Use SHA-256 with salt for consistency
    salt = "data_analysis_salt_2024"
    return hashlib.sha256((password + salt).encode()).hexdigest()

async def update_admin_password():
    """Update admin user password to use new hash method."""
    
    # Create tables if they don't exist
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as db:
        print("🔐 Updating Admin User Password")
        print("==================================================")
        print("Email: admin@admin.com")
        print("Password: admin")
        print("==================================================")

        # Find admin user
        result = await db.execute(select(AppUser).where(AppUser.email == "admin@admin.com"))
        admin_user = result.scalar_one_or_none()

        if not admin_user:
            print("❌ Admin user not found!")
            return
        
        # Update password hash
        new_password_hash = simple_password_hash("admin")
        await db.execute(
            update(AppUser)
            .where(AppUser.email == "admin@admin.com")
            .values(password_hash=new_password_hash)
        )
        await db.commit()
        
        print("✅ Admin user password updated successfully!")
        print(f"   Email: {admin_user.email}")
        print(f"   Password: admin")
        print(f"   ID: {admin_user.id}")
        print(f"   Is Admin: {admin_user.is_admin}")

if __name__ == "__main__":
    try:
        asyncio.run(update_admin_password())
        print("\n🎉 Admin password update complete!")
        print("You can now login with:")
        print("  Email: admin@admin.com")
        print("  Password: admin")
    except Exception as e:
        print(f"\n❌ Failed to update admin password: {e}")
