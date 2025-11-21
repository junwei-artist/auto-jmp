from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
import uuid

from app.core.database import get_db
from app.core.auth import get_current_user_optional
from app.models import Role, AppUser
from pydantic import BaseModel

router = APIRouter()

class RoleResponse(BaseModel):
    id: str
    name: str
    display_name: str
    description: Optional[str]
    permissions: Optional[dict]
    is_system_role: bool

@router.get("/roles", response_model=List[RoleResponse])
async def get_roles(
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Get all available roles."""
    result = await db.execute(select(Role).order_by(Role.name))
    roles = result.scalars().all()
    
    return [
        RoleResponse(
            id=str(role.id),
            name=role.name,
            display_name=role.display_name,
            description=role.description,
            permissions=role.permissions,
            is_system_role=role.is_system_role
        )
        for role in roles
    ]

@router.get("/roles/{role_id}", response_model=RoleResponse)
async def get_role(
    role_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Get a specific role by ID."""
    result = await db.execute(select(Role).where(Role.id == uuid.UUID(role_id)))
    role = result.scalar_one_or_none()
    
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    
    return RoleResponse(
        id=str(role.id),
        name=role.name,
        display_name=role.display_name,
        description=role.description,
        permissions=role.permissions,
        is_system_role=role.is_system_role
    )
