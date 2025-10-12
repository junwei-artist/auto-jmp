from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import List, Optional
import uuid
from datetime import datetime

from app.core.database import get_db
from app.core.auth import get_current_user, get_current_user_optional
from app.models import Project, ProjectMember, Role, AppUser, Artifact, Run, RunStatus

router = APIRouter()

class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    allow_guest: bool = True

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    allow_guest: Optional[bool] = None

class ProjectResponse(BaseModel):
    id: str
    name: str
    description: Optional[str]
    owner_id: Optional[str]
    allow_guest: bool
    created_at: datetime
    member_count: int
    run_count: int

class ProjectMemberAdd(BaseModel):
    email: str
    role: Role

class ProjectMemberResponse(BaseModel):
    user_id: str
    email: Optional[str]
    role: Role
    is_owner: bool

async def check_project_access(
    db: AsyncSession, 
    project_id: uuid.UUID, 
    user: Optional[AppUser],
    require_owner: bool = False
) -> Project:
    """Check if user has access to project."""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Check if user is owner
    if user and project.owner_id == user.id:
        return project
    
    # Check if user is member
    if user:
        member_result = await db.execute(
            select(ProjectMember).where(
                ProjectMember.project_id == project_id,
                ProjectMember.user_id == user.id
            )
        )
        member = member_result.scalar_one_or_none()
        if member:
            if require_owner:
                raise HTTPException(status_code=403, detail="Owner access required")
            return project
    
    # Check guest access
    if project.allow_guest:
        return project
    
    raise HTTPException(status_code=403, detail="Access denied")

@router.post("/", response_model=ProjectResponse)
async def create_project(
    project_data: ProjectCreate,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user)
):
    """Create a new project."""
    if current_user.is_guest:
        raise HTTPException(status_code=403, detail="Guest users cannot create projects")
    
    project = Project(
        name=project_data.name,
        description=project_data.description,
        owner_id=current_user.id,
        allow_guest=project_data.allow_guest
    )
    
    db.add(project)
    await db.commit()
    await db.refresh(project)
    
    # Add owner as member
    member = ProjectMember(
        project_id=project.id,
        user_id=current_user.id,
        role=Role.OWNER
    )
    db.add(member)
    await db.commit()
    
    return ProjectResponse(
        id=str(project.id),
        name=project.name,
        description=project.description,
        owner_id=str(project.owner_id),
        allow_guest=project.allow_guest,
        created_at=project.created_at,
        member_count=1,
        run_count=0
    )

@router.get("/", response_model=List[ProjectResponse])
async def list_projects(
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """List projects accessible to the current user."""
    if current_user:
        # Get projects where user is owner or member
        result = await db.execute(
            select(Project).join(ProjectMember).where(
                ProjectMember.user_id == current_user.id
            )
        )
        projects = result.scalars().all()
    else:
        # Guest user - only public projects
        result = await db.execute(select(Project).where(Project.allow_guest == True))
        projects = result.scalars().all()
    
    project_responses = []
    for project in projects:
        # Get member count
        member_count_result = await db.execute(
            select(ProjectMember).where(ProjectMember.project_id == project.id)
        )
        member_count = len(member_count_result.scalars().all())
        
        # Get run count
        run_count_result = await db.execute(
            select(Run).where(Run.project_id == project.id)
        )
        run_count = len(run_count_result.scalars().all())
        
        project_responses.append(ProjectResponse(
            id=str(project.id),
            name=project.name,
            description=project.description,
            owner_id=str(project.owner_id),
            allow_guest=project.allow_guest,
            created_at=project.created_at,
            member_count=member_count,
            run_count=run_count
        ))
    
    return project_responses

@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Get project details."""
    project = await check_project_access(db, uuid.UUID(project_id), current_user)
    
    # Get member count
    member_count_result = await db.execute(
        select(ProjectMember).where(ProjectMember.project_id == project.id)
    )
    member_count = len(member_count_result.scalars().all())
    
    # Get run count
    run_count_result = await db.execute(
        select(Run).where(Run.project_id == project.id)
    )
    run_count = len(run_count_result.scalars().all())
    
    return ProjectResponse(
        id=str(project.id),
        name=project.name,
        description=project.description,
        owner_id=str(project.owner_id),
        allow_guest=project.allow_guest,
        created_at=project.created_at,
        member_count=member_count,
        run_count=run_count
    )

@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: str,
    project_data: ProjectUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user)
):
    """Update project details."""
    project = await check_project_access(db, uuid.UUID(project_id), current_user, require_owner=True)
    
    if project_data.name is not None:
        project.name = project_data.name
    if project_data.description is not None:
        project.description = project_data.description
    if project_data.allow_guest is not None:
        project.allow_guest = project_data.allow_guest
    
    await db.commit()
    await db.refresh(project)
    
    # Get member count
    member_count_result = await db.execute(
        select(ProjectMember).where(ProjectMember.project_id == project.id)
    )
    member_count = len(member_count_result.scalars().all())
    
    # Get run count
    run_count_result = await db.execute(
        select(Run).where(Run.project_id == project.id)
    )
    run_count = len(run_count_result.scalars().all())
    
    return ProjectResponse(
        id=str(project.id),
        name=project.name,
        description=project.description,
        owner_id=str(project.owner_id),
        allow_guest=project.allow_guest,
        created_at=project.created_at,
        member_count=member_count,
        run_count=run_count
    )

@router.delete("/{project_id}")
async def delete_project(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user)
):
    """Delete a project."""
    project = await check_project_access(db, uuid.UUID(project_id), current_user, require_owner=True)
    
    await db.delete(project)
    await db.commit()
    
    return {"message": "Project deleted successfully"}

@router.get("/{project_id}/members", response_model=List[ProjectMemberResponse])
async def get_project_members(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Get project members."""
    project = await check_project_access(db, uuid.UUID(project_id), current_user)
    
    result = await db.execute(
        select(ProjectMember, AppUser).join(AppUser).where(
            ProjectMember.project_id == uuid.UUID(project_id)
        )
    )
    
    members = []
    for member, user in result:
        is_owner = project.owner_id == user.id
        members.append(ProjectMemberResponse(
            user_id=str(user.id),
            email=user.email,
            role=member.role,
            is_owner=is_owner
        ))
    
    return members

@router.post("/{project_id}/members")
async def add_project_member(
    project_id: str,
    member_data: ProjectMemberAdd,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user)
):
    """Add a member to the project."""
    project = await check_project_access(db, uuid.UUID(project_id), current_user, require_owner=True)
    
    # Find user by email
    user_result = await db.execute(select(AppUser).where(AppUser.email == member_data.email))
    user = user_result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check if already a member
    existing_member = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == uuid.UUID(project_id),
            ProjectMember.user_id == user.id
        )
    )
    if existing_member.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="User is already a member")
    
    # Add member
    member = ProjectMember(
        project_id=uuid.UUID(project_id),
        user_id=user.id,
        role=member_data.role
    )
    db.add(member)
    await db.commit()
    
    return {"message": "Member added successfully"}

@router.get("/{project_id}/runs")
async def get_project_runs(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Get runs for a project."""
    project = await check_project_access(db, uuid.UUID(project_id), current_user)
    
    result = await db.execute(
        select(Run).where(Run.project_id == uuid.UUID(project_id))
        .order_by(Run.created_at.desc())
    )
    runs = result.scalars().all()
    
    return [
        {
            "id": str(run.id),
            "project_id": str(run.project_id),
            "status": run.status.value,
            "task_name": run.task_name,
            "message": run.message,
            "image_count": run.image_count,
            "created_at": run.created_at.isoformat(),
            "started_at": run.started_at.isoformat() if run.started_at else None,
            "finished_at": run.finished_at.isoformat() if run.finished_at else None,
        }
        for run in runs
    ]

@router.get("/{project_id}/artifacts")
async def get_project_artifacts(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Get artifacts for a project."""
    project = await check_project_access(db, uuid.UUID(project_id), current_user)
    
    result = await db.execute(
        select(Artifact).where(Artifact.project_id == uuid.UUID(project_id))
        .order_by(Artifact.created_at.desc())
    )
    artifacts = result.scalars().all()
    
    return [
        {
            "id": str(artifact.id),
            "project_id": str(artifact.project_id),
            "run_id": str(artifact.run_id) if artifact.run_id else None,
            "kind": artifact.kind,
            "storage_key": artifact.storage_key,
            "filename": artifact.filename,
            "size_bytes": artifact.size_bytes,
            "mime_type": artifact.mime_type,
            "created_at": artifact.created_at.isoformat(),
        }
        for artifact in artifacts
    ]
