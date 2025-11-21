from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, and_
from typing import List, Optional
import uuid

from app.core.database import get_db
from app.core.auth import get_current_user_optional
from app.models import Department, BusinessGroup, AppUser, Notification, NotificationType
from pydantic import BaseModel

router = APIRouter()

# Pydantic models
class DepartmentResponse(BaseModel):
    id: str
    name: str
    description: Optional[str]
    created_at: str
    user_count: int

class DepartmentCreate(BaseModel):
    name: str
    description: Optional[str] = None

class BusinessGroupResponse(BaseModel):
    id: str
    name: str
    description: Optional[str]
    created_at: str
    user_count: int

class BusinessGroupCreate(BaseModel):
    name: str
    description: Optional[str] = None

class UserSearchResponse(BaseModel):
    id: str
    email: Optional[str]
    display_name: Optional[str]
    department_name: Optional[str]
    business_group_name: Optional[str]
    is_admin: bool
    is_guest: bool

class NotificationResponse(BaseModel):
    id: str
    type: str
    title: str
    message: str
    project_id: Optional[str]
    is_read: bool
    created_at: str

# Department endpoints
@router.get("/departments", response_model=List[DepartmentResponse])
async def get_departments(
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Get all departments with user counts."""
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    result = await db.execute(select(Department).order_by(Department.name))
    departments = result.scalars().all()
    
    department_responses = []
    for dept in departments:
        # Count users in this department
        user_count_result = await db.execute(
            select(AppUser).where(AppUser.department_id == dept.id)
        )
        user_count = len(user_count_result.scalars().all())
        
        department_responses.append(DepartmentResponse(
            id=str(dept.id),
            name=dept.name,
            description=dept.description,
            created_at=dept.created_at.isoformat(),
            user_count=user_count
        ))
    
    return department_responses

@router.post("/departments", response_model=DepartmentResponse)
async def create_department(
    department_data: DepartmentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Create a new department."""
    if not current_user or not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Check if department already exists
    result = await db.execute(select(Department).where(Department.name == department_data.name))
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="Department already exists")
    
    department = Department(
        name=department_data.name,
        description=department_data.description
    )
    
    db.add(department)
    await db.commit()
    await db.refresh(department)
    
    return DepartmentResponse(
        id=str(department.id),
        name=department.name,
        description=department.description,
        created_at=department.created_at.isoformat(),
        user_count=0
    )

# Business Group endpoints
@router.get("/business-groups", response_model=List[BusinessGroupResponse])
async def get_business_groups(
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Get all business groups with user counts."""
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    result = await db.execute(select(BusinessGroup).order_by(BusinessGroup.name))
    business_groups = result.scalars().all()
    
    group_responses = []
    for group in business_groups:
        # Count users in this business group
        user_count_result = await db.execute(
            select(AppUser).where(AppUser.business_group_id == group.id)
        )
        user_count = len(user_count_result.scalars().all())
        
        group_responses.append(BusinessGroupResponse(
            id=str(group.id),
            name=group.name,
            description=group.description,
            created_at=group.created_at.isoformat(),
            user_count=user_count
        ))
    
    return group_responses

@router.post("/business-groups", response_model=BusinessGroupResponse)
async def create_business_group(
    group_data: BusinessGroupCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Create a new business group."""
    if not current_user or not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Check if business group already exists
    result = await db.execute(select(BusinessGroup).where(BusinessGroup.name == group_data.name))
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="Business group already exists")
    
    business_group = BusinessGroup(
        name=group_data.name,
        description=group_data.description
    )
    
    db.add(business_group)
    await db.commit()
    await db.refresh(business_group)
    
    return BusinessGroupResponse(
        id=str(business_group.id),
        name=business_group.name,
        description=business_group.description,
        created_at=business_group.created_at.isoformat(),
        user_count=0
    )

# User search endpoints
@router.get("/users/search", response_model=List[UserSearchResponse])
async def search_users(
    q: Optional[str] = Query(None, description="Search query (email, display name, or keyword)"),
    department_id: Optional[str] = Query(None, description="Filter by department ID"),
    business_group_id: Optional[str] = Query(None, description="Filter by business group ID"),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Search users by keyword, email, department, or business group."""
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    query = select(AppUser).where(AppUser.is_guest == False)  # Exclude guest users
    
    # Apply search filters
    if q:
        search_term = f"%{q}%"
        query = query.where(
            or_(
                AppUser.email.ilike(search_term),
                AppUser.display_name.ilike(search_term)
            )
        )
    
    if department_id:
        query = query.where(AppUser.department_id == uuid.UUID(department_id))
    
    if business_group_id:
        query = query.where(AppUser.business_group_id == uuid.UUID(business_group_id))
    
    query = query.order_by(AppUser.display_name, AppUser.email)
    
    result = await db.execute(query)
    users = result.scalars().all()
    
    user_responses = []
    for user in users:
        # Get department and business group names
        department_name = None
        business_group_name = None
        
        if user.department_id:
            dept_result = await db.execute(select(Department).where(Department.id == user.department_id))
            dept = dept_result.scalar_one_or_none()
            department_name = dept.name if dept else None
        
        if user.business_group_id:
            group_result = await db.execute(select(BusinessGroup).where(BusinessGroup.id == user.business_group_id))
            group = group_result.scalar_one_or_none()
            business_group_name = group.name if group else None
        
        user_responses.append(UserSearchResponse(
            id=str(user.id),
            email=user.email,
            display_name=user.display_name,
            department_name=department_name,
            business_group_name=business_group_name,
            is_admin=user.is_admin,
            is_guest=user.is_guest
        ))
    
    return user_responses

# Notification endpoints
@router.get("/notifications", response_model=List[NotificationResponse])
async def get_notifications(
    unread_only: bool = Query(False, description="Only return unread notifications"),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Get user's notifications."""
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    query = select(Notification).where(Notification.user_id == current_user.id)
    
    if unread_only:
        query = query.where(Notification.is_read == False)
    
    query = query.order_by(Notification.created_at.desc())
    
    result = await db.execute(query)
    notifications = result.scalars().all()
    
    return [
        NotificationResponse(
            id=str(notification.id),
            type=notification.type.value,
            title=notification.title,
            message=notification.message,
            project_id=str(notification.project_id) if notification.project_id else None,
            is_read=notification.is_read,
            created_at=notification.created_at.isoformat()
        )
        for notification in notifications
    ]

@router.put("/notifications/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Mark a notification as read."""
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    result = await db.execute(
        select(Notification).where(
            Notification.id == uuid.UUID(notification_id),
            Notification.user_id == current_user.id
        )
    )
    notification = result.scalar_one_or_none()
    
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    notification.is_read = True
    await db.commit()
    
    return {"message": "Notification marked as read"}

@router.put("/notifications/mark-all-read")
async def mark_all_notifications_read(
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Mark all notifications as read."""
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    result = await db.execute(
        select(Notification).where(
            Notification.user_id == current_user.id,
            Notification.is_read == False
        )
    )
    notifications = result.scalars().all()
    
    for notification in notifications:
        notification.is_read = True
    
    await db.commit()
    
    return {"message": f"Marked {len(notifications)} notifications as read"}
