#!/usr/bin/env python3
"""
Script to get a JWT token for any user by email.
Usage: python get_user_token.py <email>
"""

import asyncio
import sys
import os
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import timedelta
from jose import jwt
from datetime import datetime

# Add the backend directory to the Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.core.database import AsyncSessionLocal
from app.models import AppUser
from app.core.config import settings

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

async def get_user_token(email: str):
    """Get a JWT token for any user by email."""
    
    async with AsyncSessionLocal() as db:
        try:
            # Get user
            result = await db.execute(select(AppUser).where(AppUser.email == email))
            user = result.scalar_one_or_none()
            
            if not user:
                print(f"❌ User with email '{email}' not found!")
                return None
            
            # Create JWT token
            access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
            access_token = create_access_token(
                data={"sub": str(user.id)}, expires_delta=access_token_expires
            )
            
            print(f"✅ Token generated successfully!")
            print(f"   Email: {user.email}")
            print(f"   ID: {user.id}")
            print(f"   Token: {access_token}")
            print(f"   Expires in: {settings.ACCESS_TOKEN_EXPIRE_MINUTES} minutes")
            
            return access_token
            
        except Exception as e:
            print(f"❌ Error getting user token: {e}")
            raise

async def main():
    """Main function."""
    if len(sys.argv) != 2:
        print("Usage: python get_user_token.py <email>")
        sys.exit(1)
    
    email = sys.argv[1]
    print(f"🔐 Getting Token for {email}")
    print("=" * 50)
    
    try:
        token = await get_user_token(email)
        if token:
            print(f"\n🎉 Use this token for API calls:")
            print(f"Authorization: Bearer {token}")
        
    except Exception as e:
        print(f"\n❌ Failed to get user token: {e}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())
