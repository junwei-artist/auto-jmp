from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update
from pydantic import BaseModel
from typing import List, Optional
import uuid
import json
import httpx
import time
import hmac
import hashlib
import base64
import urllib.parse

from app.core.database import get_db
from app.core.auth import get_current_user, get_password_hash
from app.models import AppUser, Project, Run, Artifact, AuditLog, ProjectMember, AppSetting, NotificationType, ScheduledNotification
from app.core.extensions import ExtensionManager
from app.services.notification_service import NotificationService

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
    owner_email: Optional[str] = None
    owner_display_name: Optional[str] = None
    created_at: str
    run_count: int

class RunAdminResponse(BaseModel):
    id: str
    project_id: str
    project_name: Optional[str] = None
    project_owner_email: Optional[str] = None
    project_owner_display_name: Optional[str] = None
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

class PluginDescriptionUpdate(BaseModel):
    plugin_id: str
    language: str  # 'en' or 'zh'
    name: str
    description: str
    features: List[str]

class PluginInfo(BaseModel):
    id: str
    name: str
    version: str
    description: str
    icon: str
    category: str
    supported_formats: List[str]
    status: str
    installed: bool
    english_name: str
    english_description: str
    chinese_name: str
    chinese_description: str
    english_features: List[str]
    chinese_features: List[str]

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
        
        projects.append(ProjectAdminResponse(
            id=str(project.id),
            name=project.name,
            description=project.description or "",
            owner_id=str(project.owner_id) if project.owner_id else "",
            owner_email=owner_email,
            owner_display_name=owner_display_name,
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
        # Get project name and owner information
        project_name = None
        project_owner_email = None
        project_owner_display_name = None
        if run.project_id:
            project_result = await db.execute(
                select(Project).where(Project.id == run.project_id)
            )
            project = project_result.scalar_one_or_none()
            if project:
                project_name = project.name
                # Get owner details
                if project.owner_id:
                    owner_result = await db.execute(
                        select(AppUser).where(AppUser.id == project.owner_id)
                    )
                    owner = owner_result.scalar_one_or_none()
                    if owner:
                        project_owner_email = owner.email
                        project_owner_display_name = owner.display_name
        
        runs.append(RunAdminResponse(
            id=str(run.id),
            project_id=str(run.project_id),
            project_name=project_name,
            project_owner_email=project_owner_email,
            project_owner_display_name=project_owner_display_name,
            status=run.status.value,
            task_name=run.task_name,
            message=run.message,
            image_count=run.image_count,
            created_at=run.created_at.isoformat(),
            started_at=run.started_at.isoformat() if run.started_at else None,
            finished_at=run.finished_at.isoformat() if run.finished_at else None
        ))
    
    return runs

class PasswordResetRequest(BaseModel):
    user_id: str
    new_password: Optional[str] = "123456"  # Default to 123456

class PasswordResetResponse(BaseModel):
    message: str
    user_id: str
    email: Optional[str]

@router.post("/users/reset-password", response_model=PasswordResetResponse)
async def reset_user_password(
    request: PasswordResetRequest,
    db: AsyncSession = Depends(get_db),
    admin_user: AppUser = Depends(require_admin)
):
    """Reset any user's password. Defaults to '123456' if not specified."""
    try:
        user_uuid = uuid.UUID(request.user_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid user ID"
        )
    
    result = await db.execute(select(AppUser).where(AppUser.id == user_uuid))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Hash the new password
    hashed_password = get_password_hash(request.new_password)
    
    # Update user password
    await db.execute(
        update(AppUser)
        .where(AppUser.id == user_uuid)
        .values(password_hash=hashed_password)
    )
    await db.commit()
    
    # Log the action
    audit_log = AuditLog(
        user_id=admin_user.id,
        action="admin_password_reset",
        target=f"user:{user.id}",
        meta=f'{{"target_email": "{user.email}", "reset_by": "{admin_user.email}"}}'
    )
    db.add(audit_log)
    await db.commit()
    
    return PasswordResetResponse(
        message=f"Password reset successfully. New password: {request.new_password}",
        user_id=request.user_id,
        email=user.email
    )

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

class TimeoutSetting(BaseModel):
    timeout: int

class TimeoutResponse(BaseModel):
    timeout: int
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

@router.get("/timeout", response_model=TimeoutResponse)
async def get_timeout(
    db: AsyncSession = Depends(get_db),
    admin_user: AppUser = Depends(require_admin)
):
    """Get current timeout setting."""
    from app.core.config import settings
    
    result = await db.execute(
        select(AppSetting).where(AppSetting.k == "jmp_max_wait_time")
    )
    setting = result.scalar_one_or_none()
    
    # Default to config value if not set
    timeout = settings.JMP_MAX_WAIT_TIME
    if setting:
        try:
            import json
            timeout = int(json.loads(setting.v))
        except:
            timeout = settings.JMP_MAX_WAIT_TIME
    
    return TimeoutResponse(
        timeout=timeout,
        message="Timeout retrieved successfully"
    )

@router.post("/timeout", response_model=TimeoutResponse)
async def update_timeout(
    setting: TimeoutSetting,
    db: AsyncSession = Depends(get_db),
    admin_user: AppUser = Depends(require_admin)
):
    """Update timeout setting."""
    import json
    
    # Validate timeout value (must be positive)
    if setting.timeout <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Timeout must be a positive integer"
        )
    
    # Check if setting exists
    result = await db.execute(
        select(AppSetting).where(AppSetting.k == "jmp_max_wait_time")
    )
    existing_setting = result.scalar_one_or_none()
    
    if existing_setting:
        # Update existing setting
        existing_setting.v = json.dumps(setting.timeout)
    else:
        # Create new setting
        new_setting = AppSetting(
            k="jmp_max_wait_time",
            v=json.dumps(setting.timeout)
        )
        db.add(new_setting)
    
    await db.commit()
    
    # Log the action
    audit_log = AuditLog(
        user_id=admin_user.id,
        action="update_timeout",
        target="system_settings",
        meta=f'{{"timeout": {setting.timeout}}}'
    )
    db.add(audit_log)
    await db.commit()
    
    return TimeoutResponse(
        timeout=setting.timeout,
        message=f"Timeout updated to {setting.timeout} seconds successfully"
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

# Plugin Management Endpoints

@router.get("/plugins", response_model=List[PluginInfo])
async def get_plugins(
    current_user: AppUser = Depends(require_admin)
):
    """Get all plugins with their installation status and descriptions."""
    import os
    from pathlib import Path
    
    # Get installed extensions
    installed_extensions = extension_manager.get_all_extensions()
    
    # Define available plugins
    available_plugins = [
        {
            "id": "excel2boxplotv1",
            "name": "Excel to Boxplot V1",
            "version": "1.0.0",
            "description": "Convert Excel files to CSV and JSL scripts with three-checkpoint validation system",
            "icon": "📊",
            "category": "analysis",
            "supported_formats": [".xlsx", ".xls", ".xlsm"],
            "english_name": "Excel to Boxplot V1",
            "english_description": "Convert Excel files to CSV and JSL scripts with three-checkpoint validation system",
            "chinese_name": "Excel转箱线图 V1",
            "chinese_description": "将Excel文件转换为CSV和JSL脚本，具有三点验证系统",
            "english_features": [
                "Three-checkpoint validation system",
                "Automatic file fixing for corrupted Excel files",
                "Boundary calculation (min, max, inc, tick)",
                "CSV and JSL generation",
                "Boxplot visualization"
            ],
            "chinese_features": [
                "三点验证系统",
                "自动修复损坏的Excel文件",
                "边界计算（最小值、最大值、步长、刻度）",
                "CSV和JSL生成",
                "箱线图可视化"
            ]
        },
        {
            "id": "excel2boxplotv2",
            "name": "Excel to Boxplot V2",
            "version": "1.0.0",
            "description": "Excel to CSV/JSL with V2 column mapping",
            "icon": "📊",
            "category": "analysis",
            "supported_formats": [".xlsx", ".xls", ".xlsm"],
            "english_name": "Excel to Boxplot V2",
            "english_description": "Excel to CSV/JSL with V2 column mapping",
            "chinese_name": "Excel转箱线图 V2",
            "chinese_description": "Excel转CSV/JSL，使用V2列映射",
            "english_features": [
                "V2 meta column mapping (Y Variable/DETAIL/Target/USL/LSL/Label)",
                "Prefers Stage as categorical variable",
                "Three-checkpoint validation (informational)",
                "Boundary calculation (min, max, inc, tick)",
                "CSV and JSL generation"
            ],
            "chinese_features": [
                "V2元列映射（Y变量/DETAIL/目标/USL/LSL/标签）",
                "优先使用Stage作为分类变量",
                "三点验证（信息性）",
                "边界计算（最小值、最大值、步长、刻度）",
                "CSV和JSL生成"
            ]
        },
        {
            "id": "excel2processcapability",
            "name": "Excel to Process Capability",
            "version": "1.0.0",
            "description": "Convert Excel data to process capability analysis (Cp, Cpk, Pp, Ppk)",
            "icon": "📈",
            "category": "statistics",
            "supported_formats": [".xlsx", ".xls", ".xlsm"],
            "english_name": "Excel to Process Capability",
            "english_description": "Convert Excel data to process capability analysis (Cp, Cpk, Pp, Ppk)",
            "chinese_name": "Excel转过程能力分析",
            "chinese_description": "将Excel数据转换为过程能力分析（Cp、Cpk、Pp、Ppk）",
            "english_features": [
                "Process capability analysis",
                "Statistical process control",
                "Capability indices calculation",
                "Control charts generation"
            ],
            "chinese_features": [
                "过程能力分析",
                "统计过程控制",
                "能力指数计算",
                "控制图生成"
            ]
        },
        {
            "id": "excel2cpkv1",
            "name": "Excel to CPK V1",
            "version": "1.0.0",
            "description": "Convert Excel files to CSV and JSL scripts for Process Capability (CPK) analysis with three-checkpoint validation system",
            "icon": "📈",
            "category": "analysis",
            "supported_formats": [".xlsx", ".xls", ".xlsm"],
            "english_name": "Excel to CPK V1",
            "english_description": "Convert Excel files to CSV and JSL scripts for Process Capability (CPK) analysis with three-checkpoint validation system",
            "chinese_name": "Excel转CPK V1",
            "chinese_description": "将Excel文件转换为CSV和JSL脚本，用于过程能力（CPK）分析，具有三点验证系统",
            "english_features": [
                "Three-checkpoint validation system",
                "Process Capability (CPK) analysis",
                "Spec data validation and normalization",
                "FAI column matching",
                "CSV and JSL generation for JMP"
            ],
            "chinese_features": [
                "三点验证系统",
                "过程能力（CPK）分析",
                "规格数据验证和标准化",
                "FAI列匹配",
                "为JMP生成CSV和JSL"
            ]
        },
        {
            "id": "excel2commonality",
            "name": "Excel to Commonality",
            "version": "1.0.0",
            "description": "Convert Excel files to CSV and JSL scripts for commonality analysis with multi-variable visualization",
            "icon": "🔗",
            "category": "analysis",
            "supported_formats": [".xlsx", ".xls", ".xlsm", ".xlsb"],
            "english_name": "Excel to Commonality",
            "english_description": "Convert Excel files to CSV and JSL scripts for commonality analysis with multi-variable visualization",
            "chinese_name": "Excel转共性分析",
            "chinese_description": "将Excel文件转换为CSV和JSL脚本，用于多变量可视化的共性分析",
            "english_features": [
                "Automatic sheet detection",
                "FAI column detection",
                "Multi-variable visualization",
                "JSL script generation",
                "CSV export",
                "Required columns validation"
            ],
            "chinese_features": [
                "自动工作表检测",
                "FAI列检测",
                "多变量可视化",
                "JSL脚本生成",
                "CSV导出",
                "必需列验证"
            ]
        },
        {
            "id": "excel2commonality-generic",
            "name": "Excel to Commonality (Generic)",
            "version": "1.0.0",
            "description": "Convert Excel files to CSV and JSL scripts for commonality analysis with user-selected categorical variables",
            "icon": "🔗",
            "category": "analysis",
            "supported_formats": [".xlsx", ".xls", ".xlsm", ".xlsb"],
            "english_name": "Excel to Commonality (Generic)",
            "english_description": "Convert Excel files to CSV and JSL scripts for commonality analysis with user-selected categorical variables",
            "chinese_name": "Excel转共性分析（通用版）",
            "chinese_description": "将Excel文件转换为CSV和JSL脚本，用于共性分析，支持用户选择分类变量",
            "english_features": [
                "Automatic sheet detection",
                "FAI column detection",
                "Non-FAI column detection",
                "User-selected categorical variables",
                "Multi-variable visualization",
                "JSL script generation",
                "CSV export",
                "Custom wizard interface"
            ],
            "chinese_features": [
                "自动工作表检测",
                "FAI列检测",
                "非FAI列检测",
                "用户选择分类变量",
                "多变量可视化",
                "JSL脚本生成",
                "CSV导出",
                "自定义向导界面"
            ]
        }
    ]
    
    plugins = []
    for plugin in available_plugins:
        installed = plugin["id"] in installed_extensions
        status = "installed" if installed else "available"
        
        plugins.append(PluginInfo(
            id=plugin["id"],
            name=plugin["name"],
            version=plugin["version"],
            description=plugin["description"],
            icon=plugin["icon"],
            category=plugin["category"],
            supported_formats=plugin["supported_formats"],
            status=status,
            installed=installed,
            english_name=plugin["english_name"],
            english_description=plugin["english_description"],
            chinese_name=plugin["chinese_name"],
            chinese_description=plugin["chinese_description"],
            english_features=plugin["english_features"],
            chinese_features=plugin["chinese_features"]
        ))
    
    return plugins

@router.post("/plugins/{plugin_id}/install")
async def install_plugin(
    plugin_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_admin)
):
    """Install a plugin."""
    try:
        success = extension_manager.load_extension(plugin_id)
        if success:
            # Log the action
            audit_log = AuditLog(
                user_id=current_user.id,
                action="install_plugin",
                target=f"plugin:{plugin_id}",
                meta=f'{{"plugin_id": "{plugin_id}"}}'
            )
            db.add(audit_log)
            await db.commit()
            
            return {"message": f"Plugin {plugin_id} installed successfully"}
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Failed to install plugin {plugin_id}"
            )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error installing plugin: {str(e)}"
        )

@router.post("/plugins/{plugin_id}/uninstall")
async def uninstall_plugin(
    plugin_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_admin)
):
    """Uninstall a plugin."""
    try:
        if plugin_id in extension_manager.extensions:
            del extension_manager.extensions[plugin_id]
            
            # Log the action
            audit_log = AuditLog(
                user_id=current_user.id,
                action="uninstall_plugin",
                target=f"plugin:{plugin_id}",
                meta=f'{{"plugin_id": "{plugin_id}"}}'
            )
            db.add(audit_log)
            await db.commit()
            
            return {"message": f"Plugin {plugin_id} uninstalled successfully"}
        else:
            raise HTTPException(
                status_code=404,
                detail=f"Plugin {plugin_id} is not installed"
            )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error uninstalling plugin: {str(e)}"
        )

@router.get("/plugins/descriptions")
async def get_plugin_descriptions(
    db: AsyncSession = Depends(get_db)
):
    """Get all plugin descriptions for both languages."""
    import json
    
    # Get all plugin description settings
    result = await db.execute(
        select(AppSetting).where(AppSetting.k.like("plugin_%_%"))
    )
    settings = result.scalars().all()
    
    descriptions = {}
    
    for setting in settings:
        try:
            # Parse setting key: plugin_{plugin_id}_{language}
            key_parts = setting.k.split('_')
            if len(key_parts) >= 3:
                plugin_id = '_'.join(key_parts[1:-1])  # Handle plugin IDs with underscores
                language = key_parts[-1]
                
                if plugin_id not in descriptions:
                    descriptions[plugin_id] = {}
                
                descriptions[plugin_id][language] = json.loads(setting.v)
        except (json.JSONDecodeError, IndexError) as e:
            print(f"Error parsing setting {setting.k}: {e}")
            continue
    
    return descriptions

@router.post("/plugins/descriptions")
async def update_plugin_descriptions(
    description_update: PluginDescriptionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_admin)
):
    """Update plugin descriptions for a specific language."""
    # For now, we'll store this in the database as settings
    # In a real implementation, you might want a dedicated table for plugin descriptions
    
    setting_key = f"plugin_{description_update.plugin_id}_{description_update.language}"
    
    # Check if setting exists
    result = await db.execute(
        select(AppSetting).where(AppSetting.k == setting_key)
    )
    existing_setting = result.scalar_one_or_none()
    
    import json
    setting_value = json.dumps({
        "name": description_update.name,
        "description": description_update.description,
        "features": description_update.features
    })
    
    if existing_setting:
        # Update existing setting
        existing_setting.v = setting_value
    else:
        # Create new setting
        new_setting = AppSetting(
            k=setting_key,
            v=setting_value
        )
        db.add(new_setting)
    
    await db.commit()
    
    # Log the action
    audit_log = AuditLog(
        user_id=current_user.id,
        action="update_plugin_descriptions",
        target=f"plugin:{description_update.plugin_id}",
        meta=f'{{"plugin_id": "{description_update.plugin_id}", "language": "{description_update.language}"}}'
    )
    db.add(audit_log)
    await db.commit()
    
    return {"message": f"Plugin descriptions updated for {description_update.plugin_id} in {description_update.language}"}

# Broadcast Announcements and Webhook Management

class BroadcastAnnouncementRequest(BaseModel):
    title: str
    message: str

class WebhookResult(BaseModel):
    url: str
    name: Optional[str] = None
    success: bool
    status_code: Optional[int] = None
    response: Optional[dict] = None
    error: Optional[str] = None

class BroadcastAnnouncementResponse(BaseModel):
    message: str
    users_notified: int
    webhooks_notified: int
    webhook_results: List[WebhookResult] = []

class WebhookRequest(BaseModel):
    url: str
    name: Optional[str] = None
    secret: Optional[str] = None  # For DingTalk webhook signing

class WebhookResponse(BaseModel):
    id: str
    url: str
    name: Optional[str]
    has_secret: bool = False  # Indicate if secret is set (don't expose the actual secret)
    created_at: str

class WebhookListResponse(BaseModel):
    webhooks: List[WebhookResponse]

def get_dingtalk_sign_and_timestamp(secret: str) -> tuple:
    """
    Generate DingTalk webhook signature and timestamp.
    
    DingTalk signing process:
    1. Use timestamp and secret as signature string (timestamp\nsecret)
    2. Calculate signature using HmacSHA256 algorithm
    3. Base64 encode the signature
    4. URL encode the signature (using UTF-8 charset)
    
    This matches the exact implementation from DingTalk documentation.
    """
    timestamp = str(round(time.time() * 1000))
    # Step 1: Create signature string: timestamp\nsecret
    string_to_sign = f"{timestamp}\n{secret}"
    
    # Step 2: Calculate HMAC-SHA256 signature
    hmac_code = hmac.new(
        secret.encode('utf-8'),
        string_to_sign.encode('utf-8'),
        digestmod=hashlib.sha256
    ).digest()
    
    # Step 3: Base64 encode (returns bytes)
    # Step 4: URL encode - quote_plus can accept bytes directly
    # This exactly matches: urllib.parse.quote_plus(base64.b64encode(hmac_code))
    sign = urllib.parse.quote_plus(base64.b64encode(hmac_code))
    
    return sign, timestamp

async def send_to_webhook(webhook_url: str, title: str, message: str, secret: Optional[str] = None) -> dict:
    """Send message to a webhook (DingTalk format with optional signing). Returns response info."""
    try:
        # DingTalk webhook format
        payload = {
            "msgtype": "text",
            "text": {
                "content": f"{title}\n\n{message}"
            },
            "at": {
                "isAtAll": False
            }
        }
        
        # If secret is provided, add signature and timestamp to URL
        final_url = webhook_url
        if secret:
            sign, timestamp = get_dingtalk_sign_and_timestamp(secret)
            # Add timestamp and sign parameters to the URL
            # Use simple string concatenation to match DingTalk's expected format
            # Format: original_url&timestamp=xxx&sign=xxx
            separator = '&' if '?' in webhook_url else '?'
            final_url = f"{webhook_url}{separator}timestamp={timestamp}&sign={sign}"
        
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(final_url, json=payload, headers={"Content-Type": "application/json"})
            response.raise_for_status()
            
            # Get response data
            try:
                response_data = response.json()
            except:
                response_data = {"text": response.text, "status_code": response.status_code}
            
            return {
                "success": True,
                "status_code": response.status_code,
                "response": response_data,
                "url": webhook_url
            }
    except Exception as e:
        error_info = {
            "success": False,
            "error": str(e),
            "url": webhook_url
        }
        # Try to get response if available
        if hasattr(e, 'response') and e.response is not None:
            try:
                error_info["status_code"] = e.response.status_code
                error_info["response"] = e.response.json() if e.response.headers.get("content-type", "").startswith("application/json") else e.response.text
            except:
                pass
        print(f"Failed to send to webhook {webhook_url}: {e}")
        return error_info

async def get_webhooks_from_settings(db: AsyncSession) -> List[dict]:
    """Get all webhooks from AppSetting."""
    result = await db.execute(
        select(AppSetting).where(AppSetting.k.like("webhook_%"))
    )
    settings = result.scalars().all()
    
    webhooks = []
    for setting in settings:
        try:
            # Parse setting key: webhook_{id}
            webhook_id = setting.k.replace("webhook_", "")
            webhook_data = json.loads(setting.v)
            webhooks.append({
                "id": webhook_id,
                "url": webhook_data.get("url"),
                "name": webhook_data.get("name"),
                "secret": webhook_data.get("secret"),  # Include secret for sending
                "has_secret": bool(webhook_data.get("secret")),  # For display
                "created_at": webhook_data.get("created_at", "")
            })
        except (json.JSONDecodeError, KeyError) as e:
            print(f"Error parsing webhook setting {setting.k}: {e}")
            continue
    
    return webhooks

async def ensure_default_webhook(db: AsyncSession):
    """Ensure the default DingTalk webhook exists in the database."""
    import datetime
    
    DEFAULT_WEBHOOK_URL = "https://oapi.dingtalk.com/robot/send?access_token=993d0001ebc2a6e4013eaf76136e058571e8b73f94e9366c11d9ed989a8cf8ea"
    DEFAULT_WEBHOOK_SECRET = "SEC8d905dbb955c7a0ec5cba6b39dc59649981d1546179028a98444eb3a082fb0f1"
    DEFAULT_WEBHOOK_NAME = "DingTalk Default Webhook"
    DEFAULT_WEBHOOK_ID = "default-dingtalk-webhook"
    
    # Check if default webhook already exists
    setting_key = f"webhook_{DEFAULT_WEBHOOK_ID}"
    result = await db.execute(
        select(AppSetting).where(AppSetting.k == setting_key)
    )
    existing_setting = result.scalar_one_or_none()
    
    if existing_setting:
        # Check if it needs to be updated
        try:
            webhook_data = json.loads(existing_setting.v)
            if webhook_data.get("url") != DEFAULT_WEBHOOK_URL or webhook_data.get("secret") != DEFAULT_WEBHOOK_SECRET:
                # Update existing webhook
                webhook_data.update({
                    "url": DEFAULT_WEBHOOK_URL,
                    "name": DEFAULT_WEBHOOK_NAME,
                    "secret": DEFAULT_WEBHOOK_SECRET,
                    "updated_at": datetime.datetime.now().isoformat()
                })
                existing_setting.v = json.dumps(webhook_data)
                await db.commit()
                print(f"Updated default webhook: {DEFAULT_WEBHOOK_ID}")
        except:
            pass
        return
    
    # Check if URL already exists in another webhook
    all_webhooks = await get_webhooks_from_settings(db)
    for wh in all_webhooks:
        if wh.get("url") == DEFAULT_WEBHOOK_URL:
            # URL already exists, don't create duplicate
            return
    
    # Create default webhook
    webhook_data = {
        "url": DEFAULT_WEBHOOK_URL,
        "name": DEFAULT_WEBHOOK_NAME,
        "secret": DEFAULT_WEBHOOK_SECRET,
        "created_at": datetime.datetime.now().isoformat(),
        "is_default": True
    }
    
    new_setting = AppSetting(
        k=setting_key,
        v=json.dumps(webhook_data)
    )
    db.add(new_setting)
    await db.commit()
    print(f"Created default webhook: {DEFAULT_WEBHOOK_ID}")

@router.post("/broadcast-announcement", response_model=BroadcastAnnouncementResponse)
async def broadcast_announcement(
    request: BroadcastAnnouncementRequest,
    db: AsyncSession = Depends(get_db),
    admin_user: AppUser = Depends(require_admin)
):
    """Broadcast an important announcement to all users and webhooks."""
    # Get all users
    result = await db.execute(select(AppUser))
    users = result.scalars().all()
    
    # Create notifications for all users
    notifications_created = 0
    enum_error_occurred = False
    
    for user in users:
        try:
            await NotificationService.create_notification(
                db=db,
                user_id=user.id,
                notification_type=NotificationType.ANNOUNCEMENT,
                title=request.title,
                message=request.message
            )
            notifications_created += 1
        except Exception as e:
            error_str = str(e)
            # Check if it's an enum error
            if "ANNOUNCEMENT" in error_str or "invalid input value for enum" in error_str or "InvalidTextRepresentationError" in error_str:
                await db.rollback()
                enum_error_occurred = True
                break  # Stop trying - all will fail with same error
            else:
                # For other errors, rollback and continue with next user
                await db.rollback()
                print(f"Failed to create notification for user {user.id}: {e}")
                continue
    
    # If enum error occurred, return helpful error message
    if enum_error_occurred:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="ANNOUNCEMENT enum value not found in database. Please run: alembic upgrade head, or execute the SQL in backend/add_announcement_enum.sql"
        )
    
    # Ensure default webhook exists before broadcasting
    await ensure_default_webhook(db)
    
    # Get all webhooks and send to them
    webhooks = await get_webhooks_from_settings(db)
    webhooks_notified = 0
    webhook_results = []
    
    for webhook in webhooks:
        result = await send_to_webhook(
            webhook["url"], 
            request.title, 
            request.message,
            secret=webhook.get("secret")
        )
        if result.get("success"):
            webhooks_notified += 1
        
        webhook_results.append(WebhookResult(
            url=webhook["url"],
            name=webhook.get("name"),
            success=result.get("success", False),
            status_code=result.get("status_code"),
            response=result.get("response"),
            error=result.get("error")
        ))
    
    # Log the action
    audit_log = AuditLog(
        user_id=admin_user.id,
        action="broadcast_announcement",
        target="all_users",
        meta=json.dumps({
            "title": request.title,
            "users_notified": notifications_created,
            "webhooks_notified": webhooks_notified
        })
    )
    db.add(audit_log)
    await db.commit()
    
    return BroadcastAnnouncementResponse(
        message="Announcement broadcast successfully",
        users_notified=notifications_created,
        webhooks_notified=webhooks_notified,
        webhook_results=webhook_results
    )

@router.get("/webhooks", response_model=WebhookListResponse)
async def get_webhooks(
    db: AsyncSession = Depends(get_db),
    admin_user: AppUser = Depends(require_admin)
):
    """Get all configured webhooks."""
    # Ensure default webhook exists
    await ensure_default_webhook(db)
    
    webhooks = await get_webhooks_from_settings(db)
    
    return WebhookListResponse(
        webhooks=[
            WebhookResponse(
                id=wh["id"],
                url=wh["url"],
                name=wh.get("name"),
                has_secret=wh.get("has_secret", False),
                created_at=wh.get("created_at", "")
            )
            for wh in webhooks
        ]
    )

@router.post("/webhooks", response_model=WebhookResponse)
async def add_webhook(
    request: WebhookRequest,
    db: AsyncSession = Depends(get_db),
    admin_user: AppUser = Depends(require_admin)
):
    """Add a new webhook."""
    import datetime
    
    # Generate webhook ID
    webhook_id = str(uuid.uuid4())
    setting_key = f"webhook_{webhook_id}"
    
    # Check if URL already exists
    existing_webhooks = await get_webhooks_from_settings(db)
    for wh in existing_webhooks:
        if wh["url"] == request.url:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Webhook URL already exists"
            )
    
    # Create webhook setting
    webhook_data = {
        "url": request.url,
        "name": request.name,
        "secret": request.secret,  # Store secret if provided
        "created_at": datetime.datetime.now().isoformat()
    }
    
    new_setting = AppSetting(
        k=setting_key,
        v=json.dumps(webhook_data)
    )
    db.add(new_setting)
    await db.commit()
    
    # Log the action
    audit_log = AuditLog(
        user_id=admin_user.id,
        action="add_webhook",
        target=f"webhook:{webhook_id}",
        meta=json.dumps({"url": request.url, "name": request.name})
    )
    db.add(audit_log)
    await db.commit()
    
    return WebhookResponse(
        id=webhook_id,
        url=request.url,
        name=request.name,
        has_secret=bool(request.secret),
        created_at=webhook_data["created_at"]
    )

@router.delete("/webhooks/{webhook_id}")
async def delete_webhook(
    webhook_id: str,
    db: AsyncSession = Depends(get_db),
    admin_user: AppUser = Depends(require_admin)
):
    """Delete a webhook."""
    setting_key = f"webhook_{webhook_id}"
    
    result = await db.execute(
        select(AppSetting).where(AppSetting.k == setting_key)
    )
    setting = result.scalar_one_or_none()
    
    if not setting:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Webhook not found"
        )
    
    # Get webhook data for logging
    try:
        webhook_data = json.loads(setting.v)
        webhook_url = webhook_data.get("url", "")
    except:
        webhook_url = ""
    
    # Delete setting
    await db.delete(setting)
    await db.commit()
    
    # Log the action
    audit_log = AuditLog(
        user_id=admin_user.id,
        action="delete_webhook",
        target=f"webhook:{webhook_id}",
        meta=json.dumps({"url": webhook_url})
    )
    db.add(audit_log)
    await db.commit()
    
    return {"message": "Webhook deleted successfully"}

# Scheduled Daily Notifications

class ScheduledNotificationCreate(BaseModel):
    title: str
    message: str
    scheduled_time: str  # Format: "HH:MM" (e.g., "09:00")
    timezone: Optional[str] = "UTC"
    is_active: bool = True

class ScheduledNotificationUpdate(BaseModel):
    title: Optional[str] = None
    message: Optional[str] = None
    scheduled_time: Optional[str] = None
    timezone: Optional[str] = None
    is_active: Optional[bool] = None

class ScheduledNotificationResponse(BaseModel):
    id: str
    title: str
    message: str
    scheduled_time: str
    timezone: str
    is_active: bool
    created_by: str
    created_at: str
    updated_at: str
    last_sent_at: Optional[str] = None

@router.get("/scheduled-notifications", response_model=List[ScheduledNotificationResponse])
async def get_scheduled_notifications(
    db: AsyncSession = Depends(get_db),
    admin_user: AppUser = Depends(require_admin)
):
    """Get all scheduled notifications."""
    result = await db.execute(
        select(ScheduledNotification).order_by(ScheduledNotification.created_at.desc())
    )
    notifications = result.scalars().all()
    
    return [
        ScheduledNotificationResponse(
            id=str(n.id),
            title=n.title,
            message=n.message,
            scheduled_time=n.scheduled_time,
            timezone=n.timezone,
            is_active=n.is_active,
            created_by=str(n.created_by),
            created_at=n.created_at.isoformat(),
            updated_at=n.updated_at.isoformat() if n.updated_at else "",
            last_sent_at=n.last_sent_at.isoformat() if n.last_sent_at else None
        )
        for n in notifications
    ]

@router.post("/scheduled-notifications", response_model=ScheduledNotificationResponse)
async def create_scheduled_notification(
    request: ScheduledNotificationCreate,
    db: AsyncSession = Depends(get_db),
    admin_user: AppUser = Depends(require_admin)
):
    """Create a new scheduled notification."""
    # Validate time format (HH:MM)
    import re
    if not re.match(r'^([0-1][0-9]|2[0-3]):[0-5][0-9]$', request.scheduled_time):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="scheduled_time must be in HH:MM format (24-hour)"
        )
    
    notification = ScheduledNotification(
        title=request.title,
        message=request.message,
        scheduled_time=request.scheduled_time,
        timezone=request.timezone,
        is_active=request.is_active,
        created_by=admin_user.id
    )
    
    db.add(notification)
    await db.commit()
    await db.refresh(notification)
    
    # Log the action
    audit_log = AuditLog(
        user_id=admin_user.id,
        action="create_scheduled_notification",
        target=f"scheduled_notification:{notification.id}",
        meta=json.dumps({
            "title": request.title,
            "scheduled_time": request.scheduled_time,
            "timezone": request.timezone
        })
    )
    db.add(audit_log)
    await db.commit()
    
    return ScheduledNotificationResponse(
        id=str(notification.id),
        title=notification.title,
        message=notification.message,
        scheduled_time=notification.scheduled_time,
        timezone=notification.timezone,
        is_active=notification.is_active,
        created_by=str(notification.created_by),
        created_at=notification.created_at.isoformat(),
        updated_at=notification.updated_at.isoformat() if notification.updated_at else "",
        last_sent_at=notification.last_sent_at.isoformat() if notification.last_sent_at else None
    )

@router.put("/scheduled-notifications/{notification_id}", response_model=ScheduledNotificationResponse)
async def update_scheduled_notification(
    notification_id: str,
    request: ScheduledNotificationUpdate,
    db: AsyncSession = Depends(get_db),
    admin_user: AppUser = Depends(require_admin)
):
    """Update a scheduled notification."""
    notification_uuid = uuid.UUID(notification_id)
    
    result = await db.execute(
        select(ScheduledNotification).where(ScheduledNotification.id == notification_uuid)
    )
    notification = result.scalar_one_or_none()
    
    if not notification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scheduled notification not found"
        )
    
    # Validate time format if provided
    if request.scheduled_time:
        import re
        if not re.match(r'^([0-1][0-9]|2[0-3]):[0-5][0-9]$', request.scheduled_time):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="scheduled_time must be in HH:MM format (24-hour)"
            )
    
    # Update fields
    if request.title is not None:
        notification.title = request.title
    if request.message is not None:
        notification.message = request.message
    if request.scheduled_time is not None:
        notification.scheduled_time = request.scheduled_time
    if request.timezone is not None:
        notification.timezone = request.timezone
    if request.is_active is not None:
        notification.is_active = request.is_active
    
    await db.commit()
    await db.refresh(notification)
    
    # Log the action
    audit_log = AuditLog(
        user_id=admin_user.id,
        action="update_scheduled_notification",
        target=f"scheduled_notification:{notification_id}",
        meta=json.dumps({
            "title": notification.title,
            "scheduled_time": notification.scheduled_time
        })
    )
    db.add(audit_log)
    await db.commit()
    
    return ScheduledNotificationResponse(
        id=str(notification.id),
        title=notification.title,
        message=notification.message,
        scheduled_time=notification.scheduled_time,
        timezone=notification.timezone,
        is_active=notification.is_active,
        created_by=str(notification.created_by),
        created_at=notification.created_at.isoformat(),
        updated_at=notification.updated_at.isoformat() if notification.updated_at else "",
        last_sent_at=notification.last_sent_at.isoformat() if notification.last_sent_at else None
    )

@router.delete("/scheduled-notifications/{notification_id}")
async def delete_scheduled_notification(
    notification_id: str,
    db: AsyncSession = Depends(get_db),
    admin_user: AppUser = Depends(require_admin)
):
    """Delete a scheduled notification."""
    notification_uuid = uuid.UUID(notification_id)
    
    result = await db.execute(
        select(ScheduledNotification).where(ScheduledNotification.id == notification_uuid)
    )
    notification = result.scalar_one_or_none()
    
    if not notification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scheduled notification not found"
        )
    
    # Log the action
    audit_log = AuditLog(
        user_id=admin_user.id,
        action="delete_scheduled_notification",
        target=f"scheduled_notification:{notification_id}",
        meta=json.dumps({"title": notification.title})
    )
    db.add(audit_log)
    
    await db.delete(notification)
    await db.commit()
    
    return {"message": "Scheduled notification deleted successfully"}
