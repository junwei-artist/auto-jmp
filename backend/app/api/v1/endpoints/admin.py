from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel
from typing import List, Optional
import uuid

from app.core.database import get_db
from app.core.auth import get_current_user
from app.models import AppUser, Project, Run, Artifact, AuditLog, ProjectMember, AppSetting
from app.core.extensions import ExtensionManager

router = APIRouter()

class AdminStats(BaseModel):
    total_users: int
    total_projects: int
    total_runs: int
    total_artifacts: int
    active_runs: int

class UserResponse(BaseModel):
    id: str
    email: Optional[str]
    is_admin: bool
    is_guest: bool
    created_at: str
    last_login: Optional[str]

class ProjectAdminResponse(BaseModel):
    id: str
    name: str
    description: str
    owner_id: str
    created_at: str
    run_count: int

class RunAdminResponse(BaseModel):
    id: str
    project_id: str
    status: str
    task_name: str
    message: Optional[str]
    image_count: int
    created_at: str
    started_at: Optional[str]
    finished_at: Optional[str]

class ExtensionInfo(BaseModel):
    name: str
    version: str
    description: str
    supported_formats: List[str]
    dependencies: List[str]
    status: str

# Initialize extension manager
extension_manager = ExtensionManager()

async def require_admin(current_user: AppUser = Depends(get_current_user)):
    """Require admin access."""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return current_user

@router.get("/stats", response_model=AdminStats)
async def get_admin_stats(
    db: AsyncSession = Depends(get_db),
    admin_user: AppUser = Depends(require_admin)
):
    """Get platform statistics."""
    
    # Get counts
    users_count = await db.scalar(select(func.count(AppUser.id)))
    projects_count = await db.scalar(select(func.count(Project.id)))
    runs_count = await db.scalar(select(func.count(Run.id)))
    artifacts_count = await db.scalar(select(func.count(Artifact.id)))
    
    # Active runs (running or queued)
    active_runs_count = await db.scalar(
        select(func.count(Run.id)).where(
            Run.status.in_(["running", "queued"])
        )
    )
    
    return AdminStats(
        total_users=users_count,
        total_projects=projects_count,
        total_runs=runs_count,
        total_artifacts=artifacts_count,
        active_runs=active_runs_count
    )

@router.get("/users", response_model=List[UserResponse])
async def list_users(
    db: AsyncSession = Depends(get_db),
    admin_user: AppUser = Depends(require_admin)
):
    """List all users."""
    result = await db.execute(select(AppUser).order_by(AppUser.created_at.desc()))
    users = result.scalars().all()
    
    return [
        UserResponse(
            id=str(user.id),
            email=user.email,
            is_admin=user.is_admin,
            is_guest=user.is_guest,
            created_at=user.created_at.isoformat(),
            last_login=user.last_login.isoformat() if user.last_login else None
        )
        for user in users
    ]

@router.get("/projects", response_model=List[ProjectAdminResponse])
async def list_projects_admin(
    db: AsyncSession = Depends(get_db),
    admin_user: AppUser = Depends(require_admin)
):
    """List all projects with admin details."""
    result = await db.execute(
        select(Project).order_by(Project.created_at.desc())
    )
    
    projects = []
    for project in result.scalars().all():
        # Get run count
        run_count = await db.scalar(
            select(func.count(Run.id)).where(Run.project_id == project.id)
        )
        
        projects.append(ProjectAdminResponse(
            id=str(project.id),
            name=project.name,
            description=project.description or "",
            owner_id=str(project.owner_id),
            created_at=project.created_at.isoformat(),
            run_count=run_count or 0
        ))
    
    return projects

@router.get("/runs", response_model=List[RunAdminResponse])
async def list_runs_admin(
    db: AsyncSession = Depends(get_db),
    admin_user: AppUser = Depends(require_admin)
):
    """List all runs with admin details."""
    result = await db.execute(
        select(Run).order_by(Run.created_at.desc())
    )
    
    runs = []
    for run in result.scalars().all():
        runs.append(RunAdminResponse(
            id=str(run.id),
            project_id=str(run.project_id),
            status=run.status.value,
            task_name=run.task_name,
            message=run.message,
            image_count=run.image_count,
            created_at=run.created_at.isoformat(),
            started_at=run.started_at.isoformat() if run.started_at else None,
            finished_at=run.finished_at.isoformat() if run.finished_at else None
        ))
    
    return runs

@router.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    admin_user: AppUser = Depends(require_admin)
):
    """Delete a user and all their data."""
    user_uuid = uuid.UUID(user_id)
    
    # Don't allow deleting self
    if user_uuid == admin_user.id:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete your own account"
        )
    
    # Get user
    result = await db.execute(select(AppUser).where(AppUser.id == user_uuid))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Delete user (cascade will handle related data)
    await db.delete(user)
    await db.commit()
    
    # Log the action
    audit_log = AuditLog(
        user_id=admin_user.id,
        action="delete_user",
        target=f"user:{user_id}",
        meta=f'{{"deleted_user_email": "{user.email}"}}'
    )
    db.add(audit_log)
    await db.commit()
    
    return {"message": "User deleted successfully"}

@router.delete("/projects/{project_id}")
async def delete_project_admin(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    admin_user: AppUser = Depends(require_admin)
):
    """Delete a project (admin override)."""
    project_uuid = uuid.UUID(project_id)
    
    result = await db.execute(select(Project).where(Project.id == project_uuid))
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Delete project (cascade will handle related data)
    await db.delete(project)
    await db.commit()
    
    # Log the action
    audit_log = AuditLog(
        user_id=admin_user.id,
        action="delete_project_admin",
        target=f"project:{project_id}",
        meta=f'{{"project_name": "{project.name}"}}'
    )
    db.add(audit_log)
    await db.commit()
    
    return {"message": "Project deleted successfully"}

@router.post("/runs/{run_id}/cancel")
async def cancel_run_admin(
    run_id: str,
    db: AsyncSession = Depends(get_db),
    admin_user: AppUser = Depends(require_admin)
):
    """Cancel a run (admin override)."""
    run_uuid = uuid.UUID(run_id)
    
    result = await db.execute(select(Run).where(Run.id == run_uuid))
    run = result.scalar_one_or_none()
    
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    
    if run.status in ["succeeded", "failed", "canceled"]:
        raise HTTPException(status_code=400, detail="Run is already finished")
    
    # Update run status
    run.status = "canceled"
    run.message = "Canceled by admin"
    await db.commit()
    
    # Log the action
    audit_log = AuditLog(
        user_id=admin_user.id,
        action="cancel_run_admin",
        target=f"run:{run_id}",
        meta=f'{{"project_id": "{run.project_id}"}}'
    )
    db.add(audit_log)
    await db.commit()
    
    return {"message": "Run canceled successfully"}

@router.get("/audit-logs")
async def get_audit_logs(
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    admin_user: AppUser = Depends(require_admin)
):
    """Get audit logs."""
    result = await db.execute(
        select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit)
    )
    logs = result.scalars().all()
    
    return [
        {
            "id": log.id,
            "user_id": str(log.user_id) if log.user_id else None,
            "action": log.action,
            "target": log.target,
            "meta": log.meta,
            "created_at": log.created_at.isoformat()
        }
        for log in logs
    ]

# Queue Mode Settings
class QueueModeSetting(BaseModel):
    queue_mode: bool  # True = single task queue, False = parallel tasks

class QueueModeResponse(BaseModel):
    queue_mode: bool
    message: str

@router.get("/queue-mode", response_model=QueueModeResponse)
async def get_queue_mode(
    db: AsyncSession = Depends(get_db),
    admin_user: AppUser = Depends(require_admin)
):
    """Get current queue mode setting."""
    result = await db.execute(
        select(AppSetting).where(AppSetting.k == "queue_mode")
    )
    setting = result.scalar_one_or_none()
    
    # Default to parallel mode (False) if not set
    queue_mode = False
    if setting:
        try:
            import json
            queue_mode = json.loads(setting.v)
        except:
            queue_mode = False
    
    return QueueModeResponse(
        queue_mode=queue_mode,
        message="Queue mode retrieved successfully"
    )

@router.post("/queue-mode", response_model=QueueModeResponse)
async def update_queue_mode(
    setting: QueueModeSetting,
    db: AsyncSession = Depends(get_db),
    admin_user: AppUser = Depends(require_admin)
):
    """Update queue mode setting."""
    import json
    
    # Check if setting exists
    result = await db.execute(
        select(AppSetting).where(AppSetting.k == "queue_mode")
    )
    existing_setting = result.scalar_one_or_none()
    
    if existing_setting:
        # Update existing setting
        existing_setting.v = json.dumps(setting.queue_mode)
    else:
        # Create new setting
        new_setting = AppSetting(
            k="queue_mode",
            v=json.dumps(setting.queue_mode)
        )
        db.add(new_setting)
    
    await db.commit()
    
    # Log the action
    audit_log = AuditLog(
        user_id=admin_user.id,
        action="update_queue_mode",
        target="system_settings",
        meta=f'{{"queue_mode": {setting.queue_mode}}}'
    )
    db.add(audit_log)
    await db.commit()
    
    return QueueModeResponse(
        queue_mode=setting.queue_mode,
        message=f"Queue mode {'enabled' if setting.queue_mode else 'disabled'} successfully"
    )

# Extension Management Endpoints

@router.get("/extensions", response_model=List[ExtensionInfo])
async def get_extensions(
    current_user: AppUser = Depends(require_admin)
):
    """Get all loaded extensions."""
    extension_info = extension_manager.get_extension_info()
    return [ExtensionInfo(**info) for info in extension_info]

@router.post("/extensions/{extension_name}/reload")
async def reload_extension(
    extension_name: str,
    current_user: AppUser = Depends(require_admin)
):
    """Reload a specific extension."""
    try:
        success = extension_manager.load_extension(extension_name)
        if success:
            return {"message": f"Extension {extension_name} reloaded successfully"}
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Failed to reload extension {extension_name}"
            )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error reloading extension: {str(e)}"
        )

@router.get("/extensions/{extension_name}/status")
async def get_extension_status(
    extension_name: str,
    current_user: AppUser = Depends(require_admin)
):
    """Get status of a specific extension."""
    extension = extension_manager.get_extension(extension_name)
    if extension:
        return {
            "name": extension_name,
            "status": "loaded",
            "version": extension.version,
            "description": extension.description
        }
    else:
        return {
            "name": extension_name,
            "status": "not_loaded",
            "version": None,
            "description": None
        }
