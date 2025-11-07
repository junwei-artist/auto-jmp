from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update
from pydantic import BaseModel
from typing import List, Optional
import uuid

from app.core.database import get_db
from app.core.auth import get_current_user, get_password_hash
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
