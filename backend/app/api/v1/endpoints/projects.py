from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from pydantic import BaseModel
from typing import List, Optional
import uuid
from datetime import datetime, timezone

from app.core.database import get_db
from app.core.auth import get_current_user, get_current_user_optional
from app.models import Project, ProjectMember, Role, AppUser, Artifact, Run, RunStatus

router = APIRouter()

class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    allow_guest: bool = True
    is_public: bool = False

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    allow_guest: Optional[bool] = None
    is_public: Optional[bool] = None

class ProjectResponse(BaseModel):
    id: str
    name: str
    description: Optional[str]
    owner_id: Optional[str]
    owner: Optional[dict] = None  # Include owner info
    allow_guest: bool
    is_public: bool
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

async def get_owner_info(db: AsyncSession, owner_id: Optional[uuid.UUID]) -> Optional[dict]:
    """Get owner information for a project."""
    if not owner_id:
        return None
    
    result = await db.execute(select(AppUser).where(AppUser.id == owner_id))
    owner = result.scalar_one_or_none()
    
    if not owner:
        return None
    
    return {
        "email": owner.email,
        "id": str(owner.id)
    }

async def check_project_access(
    db: AsyncSession, 
    project_id: uuid.UUID, 
    user: Optional[AppUser],
    require_owner: bool = False
) -> Project:
    """Check if user has access to project."""
    result = await db.execute(select(Project).where(Project.id == project_id, Project.deleted_at.is_(None)))
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
    
    # Allow guest access to all projects (shared access)
    return project

@router.post("/", response_model=ProjectResponse)
async def create_project(
    project_data: ProjectCreate,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user)
):
    """Create a new project."""
    # Allow guest users to create projects
    
    project = Project(
        name=project_data.name,
        description=project_data.description,
        owner_id=current_user.id,
        allow_guest=project_data.allow_guest,
        is_public=getattr(project_data, 'is_public', False)
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
    
    # Get owner information
    owner_info = await get_owner_info(db, project.owner_id)
    
    return ProjectResponse(
        id=str(project.id),
        name=project.name,
        description=project.description,
        owner_id=str(project.owner_id),
        owner=owner_info,
        allow_guest=project.allow_guest,
        is_public=project.is_public,
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
                ProjectMember.user_id == current_user.id,
                Project.deleted_at.is_(None)
            )
        )
        projects = result.scalars().all()
    else:
        # Guest user - show all projects (shared access)
        result = await db.execute(select(Project).where(Project.deleted_at.is_(None)))
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
            select(Run).where(Run.project_id == project.id, Run.deleted_at.is_(None))
        )
        run_count = len(run_count_result.scalars().all())
        
        # Handle is_public field safely - existing projects may not have this field
        is_public_value = False
        if hasattr(project, 'is_public') and project.is_public is not None:
            is_public_value = project.is_public
        
        # Get owner information
        owner_info = await get_owner_info(db, project.owner_id)
        
        project_responses.append(ProjectResponse(
            id=str(project.id),
            name=project.name,
            description=project.description,
            owner_id=str(project.owner_id),
            owner=owner_info,
            allow_guest=project.allow_guest,
            is_public=is_public_value,
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
        select(Run).where(Run.project_id == project.id, Run.deleted_at.is_(None))
    )
    run_count = len(run_count_result.scalars().all())
    
    # Handle is_public field safely - existing projects may not have this field
    is_public_value = False
    if hasattr(project, 'is_public') and project.is_public is not None:
        is_public_value = project.is_public
    
    # Get owner information
    owner_info = await get_owner_info(db, project.owner_id)
    
    return ProjectResponse(
        id=str(project.id),
        name=project.name,
        description=project.description,
        owner_id=str(project.owner_id),
        owner=owner_info,
        allow_guest=project.allow_guest,
        is_public=is_public_value,
        created_at=project.created_at,
        member_count=member_count,
        run_count=run_count
    )

@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: str,
    project_data: ProjectUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Update project details."""
    project = await check_project_access(db, uuid.UUID(project_id), current_user, require_owner=False)
    
    if project_data.name is not None:
        project.name = project_data.name
    if project_data.description is not None:
        project.description = project_data.description
    if project_data.allow_guest is not None:
        project.allow_guest = project_data.allow_guest
    if hasattr(project_data, 'is_public') and project_data.is_public is not None:
        project.is_public = project_data.is_public
    
    await db.commit()
    await db.refresh(project)
    
    # Get member count
    member_count_result = await db.execute(
        select(ProjectMember).where(ProjectMember.project_id == project.id)
    )
    member_count = len(member_count_result.scalars().all())
    
    # Get run count
    run_count_result = await db.execute(
        select(Run).where(Run.project_id == project.id, Run.deleted_at.is_(None))
    )
    run_count = len(run_count_result.scalars().all())
    
    # Handle is_public field safely - existing projects may not have this field
    is_public_value = False
    if hasattr(project, 'is_public') and project.is_public is not None:
        is_public_value = project.is_public
    
    # Get owner information
    owner_info = await get_owner_info(db, project.owner_id)
    
    return ProjectResponse(
        id=str(project.id),
        name=project.name,
        description=project.description,
        owner_id=str(project.owner_id),
        owner=owner_info,
        allow_guest=project.allow_guest,
        is_public=is_public_value,
        created_at=project.created_at,
        member_count=member_count,
        run_count=run_count
    )


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
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Add a member to the project."""
    project = await check_project_access(db, uuid.UUID(project_id), current_user, require_owner=False)
    
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
        select(Run).where(Run.project_id == uuid.UUID(project_id), Run.deleted_at.is_(None))
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

@router.get("/public/{project_id}", response_model=ProjectResponse)
async def get_public_project(
    project_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Get public project details without authentication."""
    result = await db.execute(select(Project).where(Project.id == uuid.UUID(project_id), Project.deleted_at.is_(None)))
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    if not (hasattr(project, 'is_public') and project.is_public):
        raise HTTPException(status_code=403, detail="Project is not public")
    
    # Get member count
    member_count_result = await db.execute(
        select(ProjectMember).where(ProjectMember.project_id == project.id)
    )
    member_count = len(member_count_result.scalars().all())
    
    # Get run count
    run_count_result = await db.execute(
        select(Run).where(Run.project_id == project.id, Run.deleted_at.is_(None))
    )
    run_count = len(run_count_result.scalars().all())
    
    # Handle is_public field safely - existing projects may not have this field
    is_public_value = False
    if hasattr(project, 'is_public') and project.is_public is not None:
        is_public_value = project.is_public
    
    # Get owner information
    owner_info = await get_owner_info(db, project.owner_id)
    
    return ProjectResponse(
        id=str(project.id),
        name=project.name,
        description=project.description,
        owner_id=str(project.owner_id),
        owner=owner_info,
        allow_guest=project.allow_guest,
        is_public=is_public_value,
        created_at=project.created_at,
        member_count=member_count,
        run_count=run_count
    )

@router.get("/public/{project_id}/runs")
async def get_public_project_runs(
    project_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Get runs for a public project without authentication."""
    result = await db.execute(select(Project).where(Project.id == uuid.UUID(project_id), Project.deleted_at.is_(None)))
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    if not (hasattr(project, 'is_public') and project.is_public):
        raise HTTPException(status_code=403, detail="Project is not public")
    
    result = await db.execute(
        select(Run).where(Run.project_id == uuid.UUID(project_id), Run.deleted_at.is_(None))
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

@router.get("/public/{project_id}/artifacts")
async def get_public_project_artifacts(
    project_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Get artifacts for a public project without authentication."""
    result = await db.execute(select(Project).where(Project.id == uuid.UUID(project_id), Project.deleted_at.is_(None)))
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    if not (hasattr(project, 'is_public') and project.is_public):
        raise HTTPException(status_code=403, detail="Project is not public")
    
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


@router.get("/public/{project_id}/artifacts/{artifact_id}/download")
async def download_public_artifact(
    project_id: str,
    artifact_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Download an artifact from a public project without authentication."""
    from fastapi.responses import FileResponse
    from pathlib import Path
    import base64
    
    # Check if project is public
    result = await db.execute(select(Project).where(Project.id == uuid.UUID(project_id), Project.deleted_at.is_(None)))
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    if not (hasattr(project, "is_public") and project.is_public):
        raise HTTPException(status_code=403, detail="Project is not public")
    
    # Get the artifact
    result = await db.execute(select(Artifact).where(
        Artifact.id == uuid.UUID(artifact_id),
        Artifact.project_id == uuid.UUID(project_id)
    ))
    artifact = result.scalar_one_or_none()
    
    if not artifact:
        raise HTTPException(status_code=404, detail="Artifact not found")
    
    # Security check - only allow files in specific directories
    allowed_prefixes = ["tasks/", "uploads/"]
    if not any(artifact.storage_key.startswith(prefix) for prefix in allowed_prefixes):
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Construct full file path
    backend_dir = Path.cwd()
    full_path = backend_dir / artifact.storage_key
    
    if not full_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    # Return the file
    return FileResponse(
        path=str(full_path),
        filename=artifact.filename,
        media_type=artifact.mime_type or "application/octet-stream"
    )

@router.delete("/{project_id}")
async def delete_project(
    project_id: str,
    current_user: Optional[AppUser] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db)
):
    """Hard delete a project and all related data."""
    project_uuid = uuid.UUID(project_id)
    
    # Get project directly
    result = await db.execute(select(Project).where(Project.id == project_uuid, Project.deleted_at.is_(None)))
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Check if user is owner (allow guests to delete any project)
    if current_user and project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only project owner can delete")
    
    # Delete all project members first
    await db.execute(delete(ProjectMember).where(ProjectMember.project_id == project_uuid))
    
    # Delete all artifacts associated with runs in this project
    await db.execute(delete(Artifact).where(Artifact.project_id == project_uuid))
    
    # Delete all runs in this project
    await db.execute(delete(Run).where(Run.project_id == project_uuid))
    
    # Finally delete the project itself
    await db.execute(delete(Project).where(Project.id == project_uuid))
    
    await db.commit()
    
    return {"message": "Project deleted successfully"}
