from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, EmailStr
from typing import Optional
import uuid
from datetime import datetime

from app.core.database import get_db
from app.core.auth import (
    get_current_user,
    verify_password,
    get_password_hash
)
from app.models import AppUser

router = APIRouter()

class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str

class ProfileUpdateRequest(BaseModel):
    email: Optional[EmailStr] = None

class PasswordChangeResponse(BaseModel):
    message: str

class ProfileUpdateResponse(BaseModel):
    message: str
    user: dict

@router.put("/password", response_model=PasswordChangeResponse)
async def change_password(
    password_data: PasswordChangeRequest,
    current_user: AppUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Change user password."""
    # Check if user is a guest (guests don't have passwords)
    if current_user.is_guest:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Guest users cannot change passwords"
        )
    
    # Verify current password
    if not verify_password(password_data.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect"
        )
    
    # Validate new password
    if len(password_data.new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be at least 8 characters long"
        )
    
    # Hash new password and update user
    current_user.password_hash = get_password_hash(password_data.new_password)
    await db.commit()
    
    return PasswordChangeResponse(message="Password changed successfully")

@router.put("/profile", response_model=ProfileUpdateResponse)
async def update_profile(
    profile_data: ProfileUpdateRequest,
    current_user: AppUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update user profile information."""
    # Check if user is a guest (guests don't have emails)
    if current_user.is_guest:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Guest users cannot update profile information"
        )
    
    # Check if email is being changed
    if profile_data.email and profile_data.email != current_user.email:
        # Check if new email already exists
        existing_user = await db.execute(
            select(AppUser).where(AppUser.email == profile_data.email)
        )
        if existing_user.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered"
            )
        
        current_user.email = profile_data.email
    
    await db.commit()
    await db.refresh(current_user)
    
    return ProfileUpdateResponse(
        message="Profile updated successfully",
        user={
            "id": str(current_user.id),
            "email": current_user.email,
            "is_admin": current_user.is_admin,
            "is_guest": current_user.is_guest,
            "created_at": current_user.created_at.isoformat() if current_user.created_at else None,
            "last_login": current_user.last_login.isoformat() if current_user.last_login else None
        }
    )

@router.get("/profile")
async def get_profile(
    current_user: AppUser = Depends(get_current_user)
):
    """Get current user profile information."""
    return {
        "id": str(current_user.id),
        "email": current_user.email,
        "is_admin": current_user.is_admin,
        "is_guest": current_user.is_guest,
        "created_at": current_user.created_at.isoformat() if current_user.created_at else None,
        "last_login": current_user.last_login.isoformat() if current_user.last_login else None
    }

@router.delete("/account")
async def delete_account(
    current_user: AppUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete user account."""
    # Prevent admin users from deleting their own accounts
    if current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Admin accounts cannot be deleted"
        )
    
    # Delete user (this will cascade to related records)
    await db.delete(current_user)
    await db.commit()
    
    return {"message": "Account deleted successfully"}
