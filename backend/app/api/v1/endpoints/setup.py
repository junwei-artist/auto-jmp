from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel, EmailStr
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
import subprocess
import os
import asyncio
from typing import Optional
import hashlib
import uuid
from datetime import datetime

from app.core.database import AsyncSessionLocal, engine
from app.models import AppUser, Base
from app.core.config import settings

router = APIRouter()

class SetupRequest(BaseModel):
    postgres_username: str
    postgres_password: str
    admin_email: EmailStr
    admin_password: str
    admin_name: str

class SetupResponse(BaseModel):
    success: bool
    message: str
    admin_user_id: Optional[str] = None

def simple_password_hash(password: str) -> str:
    """Simple password hashing for admin creation."""
    salt = "data_analysis_salt_2024"
    return hashlib.sha256((password + salt).encode()).hexdigest()

async def test_postgres_connection(username: str, password: str) -> bool:
    """Test PostgreSQL connection with given credentials."""
    try:
        # Test connection using psql
        env = os.environ.copy()
        env['PGPASSWORD'] = password
        
        result = subprocess.run([
            'psql', '-U', username, '-h', 'localhost', '-c', 'SELECT 1;'
        ], env=env, capture_output=True, text=True, timeout=10)
        
        return result.returncode == 0
    except Exception as e:
        print(f"PostgreSQL connection test failed: {e}")
        return False

async def create_database_and_user(username: str, password: str) -> bool:
    """Create database and user for the application."""
    try:
        env = os.environ.copy()
        env['PGPASSWORD'] = password
        
        # Create user (drop if exists first)
        drop_user_cmd = [
            'psql', '-U', username, '-h', 'localhost', '-c',
            "DROP USER IF EXISTS data_analysis_user;"
        ]
        
        result = subprocess.run(drop_user_cmd, env=env, capture_output=True, text=True, timeout=10)
        
        create_user_cmd = [
            'psql', '-U', username, '-h', 'localhost', '-c',
            f"CREATE USER data_analysis_user WITH PASSWORD '{password}';"
        ]
        
        result = subprocess.run(create_user_cmd, env=env, capture_output=True, text=True, timeout=10)
        if result.returncode != 0 and "already exists" not in result.stderr:
            print(f"Failed to create user: {result.stderr}")
            return False
        
        # Create database (drop if exists first)
        drop_db_cmd = [
            'psql', '-U', username, '-h', 'localhost', '-c',
            "DROP DATABASE IF EXISTS data_analysis_platform;"
        ]
        
        result = subprocess.run(drop_db_cmd, env=env, capture_output=True, text=True, timeout=10)
        
        create_db_cmd = [
            'psql', '-U', username, '-h', 'localhost', '-c',
            "CREATE DATABASE data_analysis_platform OWNER data_analysis_user;"
        ]
        
        result = subprocess.run(create_db_cmd, env=env, capture_output=True, text=True, timeout=10)
        if result.returncode != 0 and "already exists" not in result.stderr:
            print(f"Failed to create database: {result.stderr}")
            return False
        
        # Grant privileges
        grant_cmd = [
            'psql', '-U', username, '-h', 'localhost', '-d', 'data_analysis_platform', '-c',
            "GRANT ALL PRIVILEGES ON DATABASE data_analysis_platform TO data_analysis_user;"
        ]
        
        result = subprocess.run(grant_cmd, env=env, capture_output=True, text=True, timeout=10)
        if result.returncode != 0:
            print(f"Failed to grant privileges: {result.stderr}")
            return False
        
        return True
    except Exception as e:
        print(f"Database creation failed: {e}")
        return False

@router.post("/setup", response_model=SetupResponse)
async def setup_application(request: SetupRequest):
    """
    Initial setup of the application.
    Creates database, user, and admin account.
    """
    try:
        # Test PostgreSQL connection
        if not await test_postgres_connection(request.postgres_username, request.postgres_password):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to connect to PostgreSQL with provided credentials"
            )
        
        # Create database and user
        if not await create_database_and_user(request.postgres_username, request.postgres_password):
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create database and user"
            )
        
        # Update environment variables
        new_database_url = f"postgresql+asyncpg://data_analysis_user:{request.postgres_password}@localhost:5432/data_analysis_platform"
        
        # Create database tables
        from sqlalchemy.ext.asyncio import create_async_engine
        new_engine = create_async_engine(new_database_url)
        async with new_engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        
        # Create admin user
        from sqlalchemy.ext.asyncio import async_sessionmaker
        new_session_factory = async_sessionmaker(new_engine, expire_on_commit=False)
        
        async with new_session_factory() as db:
            # Check if admin user already exists
            existing_admin = await db.execute(
                text("SELECT id FROM app_user WHERE email = :email"),
                {"email": request.admin_email}
            )
            if existing_admin.fetchone():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Admin user already exists"
                )
            
            # Create admin user
            admin_user = AppUser(
                id=uuid.uuid4(),
                email=request.admin_email,
                password_hash=simple_password_hash(request.admin_password),
                is_admin=True,
                is_guest=False,
                created_at=datetime.utcnow()
            )
            
            db.add(admin_user)
            await db.commit()
            await db.refresh(admin_user)
            
            return SetupResponse(
                success=True,
                message="Application setup completed successfully",
                admin_user_id=str(admin_user.id)
            )
    
    except HTTPException:
        raise
    except Exception as e:
        print(f"Setup failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Setup failed: {str(e)}"
        )

@router.get("/setup/status")
async def get_setup_status():
    """Check if the application has been set up."""
    try:
        # Try to connect to database and check if tables exist
        async with AsyncSessionLocal() as db:
            result = await db.execute(text("SELECT COUNT(*) FROM app_user WHERE is_admin = true"))
            admin_count = result.scalar()
            
            return {
                "is_setup": admin_count > 0,
                "admin_count": admin_count
            }
    except Exception:
        return {
            "is_setup": False,
            "admin_count": 0
        }
