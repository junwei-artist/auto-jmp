from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from pydantic import BaseModel
from typing import List, Optional
import uuid
from datetime import datetime, timezone

from app.core.database import get_db
from app.core.auth import get_current_user, get_current_user_optional
from app.core.storage import local_storage
from app.models import Project, ProjectMember, AppUser, Artifact, Run, RunStatus, ProjectAttachment

router = APIRouter()

class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    allow_guest: bool = True
    is_public: bool = False
    plugin_name: Optional[str] = None

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    allow_guest: Optional[bool] = None
    is_public: Optional[bool] = None
    plugin_name: Optional[str] = None

class ProjectResponse(BaseModel):
    id: str
    name: str
    description: Optional[str]
    owner_id: Optional[str]
    owner_email: Optional[str]
    owner_display_name: Optional[str]
    allow_guest: bool
    is_public: bool
    created_at: datetime
    member_count: int
    run_count: int
    plugin_name: Optional[str] = None

class ProjectMemberAdd(BaseModel):
    email: str
    role: str

class ProjectMemberResponse(BaseModel):
    user_id: str
    email: Optional[str]
    role: str
    is_owner: bool

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
@router.post("", response_model=ProjectResponse)
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
        is_public=getattr(project_data, 'is_public', False),
        plugin_name=getattr(project_data, 'plugin_name', None)
    )
    
    db.add(project)
    await db.commit()
    await db.refresh(project)
    
    # Add owner as member using raw SQL to handle enum casting
    from sqlalchemy import text
    await db.execute(text("""
        INSERT INTO project_member (project_id, user_id, role, role_id) 
        VALUES (:project_id, :user_id, 'OWNER'::role, '00000000-0000-0000-0000-000000000001'::uuid)
    """), {
        "project_id": str(project.id),
        "user_id": str(current_user.id)
    })
    
    # Add admin@admin.com as a member to every new project (if admin exists and is not the owner)
    admin_result = await db.execute(select(AppUser).where(AppUser.email == "admin@admin.com"))
    admin_user = admin_result.scalar_one_or_none()
    
    if admin_user and admin_user.id != current_user.id:
        # Check if admin is already a member (shouldn't happen, but safety check)
        existing_admin_member = await db.execute(text("""
            SELECT 1 FROM project_member 
            WHERE project_id = :project_id AND user_id = :user_id
        """), {
            "project_id": str(project.id),
            "user_id": str(admin_user.id)
        })
        
        if not existing_admin_member.fetchone():
            # Add admin as MEMBER role
            await db.execute(text("""
                INSERT INTO project_member (project_id, user_id, role, role_id) 
                VALUES (:project_id, :user_id, 'member'::role, '00000000-0000-0000-0000-000000000002'::uuid)
            """), {
                "project_id": str(project.id),
                "user_id": str(admin_user.id)
            })
    
    await db.commit()
    
    # Calculate member count (owner + admin if added)
    member_count = 1  # Owner is always added
    if admin_user and admin_user.id != current_user.id:
        member_count = 2  # Owner + admin
    
    return ProjectResponse(
        id=str(project.id),
        name=project.name,
        description=project.description,
        owner_id=str(project.owner_id),
        owner_email=current_user.email,
        owner_display_name=current_user.display_name,
        allow_guest=project.allow_guest,
        is_public=project.is_public,
        created_at=project.created_at,
        member_count=member_count,
        run_count=0,
        plugin_name=getattr(project, 'plugin_name', None)
    )

@router.get("/", response_model=List[ProjectResponse])
@router.get("", response_model=List[ProjectResponse])
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
        
        # Get owner details
        owner_email = None
        owner_display_name = None
        if project.owner_id:
            owner_result = await db.execute(
                select(AppUser).where(AppUser.id == project.owner_id)
            )
            owner = owner_result.scalar_one_or_none()
            if owner:
                owner_email = owner.email
                owner_display_name = owner.display_name
        
        project_responses.append(ProjectResponse(
            id=str(project.id),
            name=project.name,
            description=project.description,
            owner_id=str(project.owner_id),
            owner_email=owner_email,
            owner_display_name=owner_display_name,
            allow_guest=project.allow_guest,
            is_public=is_public_value,
            created_at=project.created_at,
            member_count=member_count,
            run_count=run_count,
            plugin_name=getattr(project, 'plugin_name', None)
        ))
    
    return project_responses

@router.get("/owned", response_model=List[ProjectResponse])
async def list_owned_projects(
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """List projects owned by the current user."""
    if not current_user:
        return []
    
    # Get projects where user is the owner
    result = await db.execute(
        select(Project).where(
            Project.owner_id == current_user.id,
            Project.deleted_at.is_(None)
        )
    )
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
        
        # Get owner details
        owner_email = None
        owner_display_name = None
        if project.owner_id:
            owner_result = await db.execute(
                select(AppUser).where(AppUser.id == project.owner_id)
            )
            owner = owner_result.scalar_one_or_none()
            if owner:
                owner_email = owner.email
                owner_display_name = owner.display_name
        
        project_responses.append(ProjectResponse(
            id=str(project.id),
            name=project.name,
            description=project.description,
            owner_id=str(project.owner_id),
            owner_email=owner_email,
            owner_display_name=owner_display_name,
            allow_guest=project.allow_guest,
            is_public=is_public_value,
            created_at=project.created_at,
            member_count=member_count,
            run_count=run_count,
            plugin_name=getattr(project, 'plugin_name', None)
        ))
    
    return project_responses

@router.get("/member", response_model=List[ProjectResponse])
async def list_member_projects(
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """List projects where the current user is a member (not owner)."""
    if not current_user:
        return []
    
    # Get projects where user is a member but not the owner
    result = await db.execute(
        select(Project).join(ProjectMember).where(
            ProjectMember.user_id == current_user.id,
            Project.owner_id != current_user.id,
            Project.deleted_at.is_(None)
        )
    )
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
        
        # Get owner details
        owner_email = None
        owner_display_name = None
        if project.owner_id:
            owner_result = await db.execute(
                select(AppUser).where(AppUser.id == project.owner_id)
            )
            owner = owner_result.scalar_one_or_none()
            if owner:
                owner_email = owner.email
                owner_display_name = owner.display_name
        
        project_responses.append(ProjectResponse(
            id=str(project.id),
            name=project.name,
            description=project.description,
            owner_id=str(project.owner_id),
            owner_email=owner_email,
            owner_display_name=owner_display_name,
            allow_guest=project.allow_guest,
            is_public=is_public_value,
            created_at=project.created_at,
            member_count=member_count,
            run_count=run_count,
            plugin_name=getattr(project, 'plugin_name', None)
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
    
    # Get owner details
    owner_email = None
    owner_display_name = None
    if project.owner_id:
        owner_result = await db.execute(
            select(AppUser).where(AppUser.id == project.owner_id)
        )
        owner = owner_result.scalar_one_or_none()
        if owner:
            owner_email = owner.email
            owner_display_name = owner.display_name
    
    return ProjectResponse(
        id=str(project.id),
        name=project.name,
        description=project.description,
        owner_id=str(project.owner_id),
        owner_email=owner_email,
        owner_display_name=owner_display_name,
        allow_guest=project.allow_guest,
        is_public=is_public_value,
        created_at=project.created_at,
        member_count=member_count,
        run_count=run_count,
        plugin_name=getattr(project, 'plugin_name', None)
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
    
    # Check if user is trying to update name or description - only owners can do this
    if (project_data.name is not None or project_data.description is not None) and project.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only project owners can update project name and description"
        )
    
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
    
    # Get owner details
    owner_email = None
    owner_display_name = None
    if project.owner_id:
        owner_result = await db.execute(
            select(AppUser).where(AppUser.id == project.owner_id)
        )
        owner = owner_result.scalar_one_or_none()
        if owner:
            owner_email = owner.email
            owner_display_name = owner.display_name
    
    return ProjectResponse(
        id=str(project.id),
        name=project.name,
        description=project.description,
        owner_id=str(project.owner_id),
        owner_email=owner_email,
        owner_display_name=owner_display_name,
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
    
    # Get owner details
    owner_email = None
    owner_display_name = None
    if project.owner_id:
        owner_result = await db.execute(
            select(AppUser).where(AppUser.id == project.owner_id)
        )
        owner = owner_result.scalar_one_or_none()
        if owner:
            owner_email = owner.email
            owner_display_name = owner.display_name
    
    return ProjectResponse(
        id=str(project.id),
        name=project.name,
        description=project.description,
        owner_id=str(project.owner_id),
        owner_email=owner_email,
        owner_display_name=owner_display_name,
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

@router.get("/public/{project_id}/runs/{run_id}/download")
async def download_public_run_zip(
    project_id: str,
    run_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Download a ZIP file containing all files from a public project run."""
    from fastapi.responses import FileResponse
    from pathlib import Path
    import zipfile
    import tempfile
    import os
    
    # Check if project is public
    result = await db.execute(select(Project).where(Project.id == uuid.UUID(project_id), Project.deleted_at.is_(None)))
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    if not (hasattr(project, "is_public") and project.is_public):
        raise HTTPException(status_code=403, detail="Project is not public")
    
    # Get run details
    result = await db.execute(select(Run).where(
        Run.id == uuid.UUID(run_id),
        Run.project_id == uuid.UUID(project_id),
        Run.deleted_at.is_(None)
    ))
    run = result.scalar_one_or_none()
    
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    
    # Get artifacts for this run
    artifacts_result = await db.execute(
        select(Artifact).where(Artifact.run_id == uuid.UUID(run_id))
    )
    artifacts = artifacts_result.scalars().all()
    
    if not artifacts:
        raise HTTPException(status_code=404, detail="No files found for this run")
    
    # Find task directory from artifacts
    task_dir = None
    for artifact in artifacts:
        if artifact.storage_key and artifact.storage_key.startswith("tasks/"):
            # Extract task directory from storage key
            # e.g., "tasks/task_20251011_231215/FAI10.png" -> "tasks/task_20251011_231215"
            task_dir = "/".join(artifact.storage_key.split("/")[:2])
            break
    
    if not task_dir:
        raise HTTPException(status_code=404, detail="No task directory found for this run")
    
    # Construct full task directory path
    backend_dir = Path.cwd()
    full_task_dir = backend_dir / task_dir
    
    if not full_task_dir.exists():
        raise HTTPException(status_code=404, detail="Task directory not found")
    
    # Create temporary ZIP file
    with tempfile.NamedTemporaryFile(delete=False, suffix='.zip') as temp_zip:
        with zipfile.ZipFile(temp_zip.name, 'w', zipfile.ZIP_DEFLATED) as zipf:
            # Add all files from the task directory
            for file_path in full_task_dir.rglob('*'):
                if file_path.is_file():
                    # Add file to zip with relative path
                    arcname = file_path.relative_to(full_task_dir)
                    zipf.write(file_path, arcname)
        
        # Return the ZIP file
        return FileResponse(
            path=temp_zip.name,
            filename=f"run_{run_id}_{run.task_name.replace(' ', '_')}.zip",
            media_type="application/zip"
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
    
    # Delete all project attachments and their files
    attachments_result = await db.execute(
        select(ProjectAttachment).where(ProjectAttachment.project_id == project_uuid)
    )
    attachments = attachments_result.scalars().all()
    
    # Delete attachment files from storage
    for attachment in attachments:
        local_storage.delete_file(attachment.storage_key)
    
    # Delete attachment records from database
    await db.execute(delete(ProjectAttachment).where(ProjectAttachment.project_id == project_uuid))
    
    # Delete project folder from storage
    local_storage.delete_project_folder(project_id)
    
    # Delete all artifacts associated with runs in this project
    await db.execute(delete(Artifact).where(Artifact.project_id == project_uuid))
    
    # Delete all runs in this project
    await db.execute(delete(Run).where(Run.project_id == project_uuid))
    
    # Finally delete the project itself
    await db.execute(delete(Project).where(Project.id == project_uuid))
    
    await db.commit()
    
    return {"message": "Project deleted successfully"}
