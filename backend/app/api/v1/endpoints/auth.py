from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, EmailStr
from typing import Optional
import uuid
from datetime import datetime

from app.core.database import get_db
from app.core.auth import (
    authenticate_user, 
    create_access_token, 
    create_refresh_token,
    create_guest_user,
    create_guest_token,
    get_password_hash,
    get_current_user,
    security
)
from app.core.config import settings
from app.models import AppUser

router = APIRouter()

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserRegister(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user_id: str
    is_guest: bool = False
    is_admin: bool = False

class GuestTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    is_guest: bool = True
    expires_in: int = 86400  # 24 hours

@router.post("/login", response_model=TokenResponse)
async def login(
    user_credentials: UserLogin,
    db: AsyncSession = Depends(get_db)
):
    """Authenticate user and return JWT tokens."""
    user = await authenticate_user(db, user_credentials.email, user_credentials.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Update last login
    user.last_login = datetime.utcnow()
    await db.commit()
    
    access_token = create_access_token(data={"sub": str(user.id), "is_guest": user.is_guest, "is_admin": user.is_admin})
    refresh_token = create_refresh_token(data={"sub": str(user.id), "is_guest": user.is_guest, "is_admin": user.is_admin})
    
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user_id=str(user.id),
        is_guest=user.is_guest,
        is_admin=user.is_admin
    )

@router.post("/register", response_model=TokenResponse)
async def register(
    user_data: UserRegister,
    db: AsyncSession = Depends(get_db)
):
    """Register a new user."""
    # Check if user already exists
    existing_user = await db.execute(select(AppUser).where(AppUser.email == user_data.email))
    if existing_user.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Create new user
    hashed_password = get_password_hash(user_data.password)
    user = AppUser(
        email=user_data.email,
        password_hash=hashed_password,
        is_guest=False,
        is_admin=False
    )
    
    db.add(user)
    await db.commit()
    await db.refresh(user)
    
    access_token = create_access_token(data={"sub": str(user.id), "is_guest": False, "is_admin": False})
    refresh_token = create_refresh_token(data={"sub": str(user.id), "is_guest": False, "is_admin": False})
    
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user_id=str(user.id),
        is_guest=False,
        is_admin=False
    )

@router.post("/guest", response_model=GuestTokenResponse)
async def create_guest_session(
    db: AsyncSession = Depends(get_db)
):
    """Create a guest session for anonymous users."""
    if not settings.ALLOW_GUEST_ACCESS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Guest access is disabled"
        )
    
    # Create guest user
    guest_user = await create_guest_user(db)
    
    # Create guest token
    access_token = create_guest_token(guest_user.id)
    
    return GuestTokenResponse(
        access_token=access_token,
        user_id=str(guest_user.id),
        is_guest=True
    )

@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db)
):
    """Refresh access token using refresh token."""
    from jose import JWTError, jwt
    
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        payload = jwt.decode(credentials.credentials, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id: str = payload.get("sub")
        token_type: str = payload.get("type")
        
        if user_id is None or token_type != "refresh":
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    user = await db.execute(select(AppUser).where(AppUser.id == uuid.UUID(user_id)))
    user = user.scalar_one_or_none()
    if user is None:
        raise credentials_exception
    
    # Create new tokens
    access_token = create_access_token(data={"sub": str(user.id), "is_guest": user.is_guest})
    refresh_token = create_refresh_token(data={"sub": str(user.id), "is_guest": user.is_guest})
    
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user_id=str(user.id),
        is_guest=user.is_guest
    )

@router.get("/me")
async def get_current_user_info(
    current_user: AppUser = Depends(get_current_user)
):
    """Get current user information."""
    return {
        "id": str(current_user.id),
        "email": current_user.email,
        "is_admin": current_user.is_admin,
        "is_guest": current_user.is_guest,
        "created_at": current_user.created_at.isoformat() if current_user.created_at else None,
        "last_login": current_user.last_login.isoformat() if current_user.last_login else None
    }
