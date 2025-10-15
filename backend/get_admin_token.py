#!/usr/bin/env python3
"""
Script to get a JWT token for the admin user.
Usage: python get_admin_token.py
"""

import asyncio
import sys
import os
import hashlib
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timedelta
from jose import jwt

# Add the backend directory to the Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.core.database import AsyncSessionLocal
from app.models import AppUser
from app.core.config import settings

def simple_password_hash(password: str) -> str:
    """Simple password hashing for admin creation."""
    # Use SHA-256 with salt for simplicity
    salt = "admin_salt_2024"
    return hashlib.sha256((password + salt).encode()).hexdigest()

def create_access_token(data: dict, expires_delta: timedelta = None) -> str:
    """Create a JWT access token."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

async def get_admin_token():
    """Get a JWT token for the admin user."""
    
    async with AsyncSessionLocal() as db:
        try:
            # Get admin user
            result = await db.execute(select(AppUser).where(AppUser.email == "admin@admin.com"))
            admin_user = result.scalar_one_or_none()
            
            if not admin_user:
                print("❌ Admin user not found!")
                return None
            
            if not admin_user.is_admin:
                print("❌ User is not an admin!")
                return None
            
            # Create JWT token
            access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
            access_token = create_access_token(
                data={"sub": str(admin_user.id)}, expires_delta=access_token_expires
            )
            
            print("✅ Admin token generated successfully!")
            print(f"   Email: {admin_user.email}")
            print(f"   ID: {admin_user.id}")
            print(f"   Token: {access_token}")
            print(f"   Expires in: {settings.ACCESS_TOKEN_EXPIRE_MINUTES} minutes")
            
            return access_token
            
        except Exception as e:
            print(f"❌ Error getting admin token: {e}")
            raise

async def main():
    """Main function."""
    print("🔐 Getting Admin Token")
    print("=" * 50)
    
    try:
        token = await get_admin_token()
        if token:
            print(f"\n🎉 Use this token for API calls:")
            print(f"Authorization: Bearer {token}")
        
    except Exception as e:
        print(f"\n❌ Failed to get admin token: {e}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())
