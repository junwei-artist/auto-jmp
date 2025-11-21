from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from pydantic import BaseModel
from typing import List, Optional
import uuid
from datetime import datetime, timezone
from pathlib import Path
import re
import logging
import base64
from fastapi.responses import Response

from app.core.database import get_db, AsyncSessionLocal
from app.core.auth import get_current_user, get_current_user_optional
from app.core.celery import celery_app
from app.core.websocket import publish_run_update
from app.core.storage import local_storage
from app.core.config import settings
from app.models import Project, Run, RunStatus, AppUser, Artifact, ProjectMember, AppSetting, RunComment, ProjectAttachment, ProjectHistoryLog
from app.services.notification_service import NotificationService

router = APIRouter()
logger = logging.getLogger(__name__)

class RunCreate(BaseModel):
    project_id: str
    csv_key: str
    jsl_key: str

class RunResponse(BaseModel):
    id: str
    project_id: str
    status: str
    task_name: str
    message: Optional[str]
    image_count: int
    created_at: datetime
    started_at: Optional[datetime]
    finished_at: Optional[datetime]
    started_by: Optional[str]
    started_by_email: Optional[str]
    started_by_is_guest: Optional[bool]

class ArtifactResponse(BaseModel):
    id: str
    kind: str
    filename: str
    size_bytes: Optional[int]
    mime_type: Optional[str]
    created_at: datetime
    download_url: Optional[str] = None

class RunCommentResponse(BaseModel):
    id: str
    user_id: str
    user_email: Optional[str]
    user_is_guest: bool
    parent_id: Optional[str]
    content: str
    created_at: datetime
    updated_at: datetime
    replies: List['RunCommentResponse'] = []

class RunCommentCreate(BaseModel):
    content: str
    parent_id: Optional[str] = None

class RunCommentCountResponse(BaseModel):
    run_id: str
    comment_count: int

class RunArtifactWithCommentsResponse(BaseModel):
    artifact_id: str
    filename: str
    kind: str
    comment_count: int

class RunCommentUpdate(BaseModel):
    content: str

class RunTaskNameUpdate(BaseModel):
    task_name: str

@router.get("/", response_model=List[RunResponse])
async def list_runs(
    current_user: Optional[AppUser] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db)
):
    """List all runs for the current user."""
    if current_user:
        # Get all projects the user has access to
        result = await db.execute(
            select(Project).where(
                (Project.owner_id == current_user.id) |
                (Project.members.any(ProjectMember.user_id == current_user.id))
            )
        )
        user_projects = result.scalars().all()
        project_ids = [str(p.id) for p in user_projects]
        
        if not project_ids:
            return []
        
        # Get all runs for user's projects
        result = await db.execute(
            select(Run).where(Run.project_id.in_(project_ids), Run.deleted_at.is_(None))
            .order_by(Run.created_at.desc())
        )
        runs = result.scalars().all()
    else:
        # Guest user - show all runs (shared access)
        result = await db.execute(
            select(Run).where(Run.deleted_at.is_(None))
            .order_by(Run.created_at.desc())
        )
        runs = result.scalars().all()
    
    return [
        RunResponse(
            id=str(run.id),
            project_id=str(run.project_id),
            status=run.status.value,
            task_name=run.task_name,
            message=run.message,
            image_count=run.image_count,
            created_at=run.created_at,
            started_at=run.started_at,
            finished_at=run.finished_at,
            started_by=str(run.started_by) if run.started_by else None,
            started_by_email=None,
            started_by_is_guest=None
        )
        for run in runs
    ]

async def check_project_access(
    db: AsyncSession, 
    project_id: uuid.UUID, 
    user: Optional[AppUser]
) -> Project:
    """Check if user has access to project."""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Admins have full access to all projects
    if user and user.is_admin:
        return project
    
    # Check if user is owner
    if user and project.owner_id == user.id:
        return project
    
    # Check if user is member
    if user:
        from app.models import ProjectMember
        member_result = await db.execute(
            select(ProjectMember).where(
                ProjectMember.project_id == project_id,
                ProjectMember.user_id == user.id
            )
        )
        member = member_result.scalar_one_or_none()
        if member:
            return project
    
    # Allow guest access to all projects (shared access)
    return project

@router.post("/", response_model=RunResponse)
async def create_run(
    project_id: str = Form(...),
    csv_file: UploadFile = File(...),
    jsl_file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """
    Create a new JMP analysis run from uploaded CSV and JSL files.
    
    Flow:
    1. Create run record and run folder
    2. Save uploaded CSV and JSL to run folder
    3. Create artifacts for uploaded files
    4. Process CSV and JSL files
    5. Generate task folder with processed files
    6. Copy processed files to task folder
    7. Queue Celery task
    """
    stage = "init"
    try:
        project_uuid = uuid.UUID(project_id)
        project = await check_project_access(db, project_uuid, current_user)
        
        # Validate file types
        if not csv_file.filename or not csv_file.filename.lower().endswith('.csv'):
            raise HTTPException(status_code=400, detail="CSV file must have .csv extension")
        if not jsl_file.filename or not jsl_file.filename.lower().endswith('.jsl'):
            raise HTTPException(status_code=400, detail="JSL file must have .jsl extension")
        
        # STEP 1: Create run record and folder FIRST (before processing)
        async with AsyncSessionLocal() as create_db:
            try:
                run = Run(
                    project_id=project_uuid,
                    started_by=current_user.id if current_user else None,
                    status=RunStatus.QUEUED,
                    task_name="jmp_boxplot",
                    message="Run queued"
                )
                create_db.add(run)
                await create_db.commit()
                await create_db.refresh(run)
                
                logger.info(f"[RUNS] Run created: {run.id}")
                
                # STEP 2: Create run folder immediately after run is created
                run_dir_key = f"runs/{str(run.id)}"
                run_dir_path = local_storage.get_file_path(run_dir_key)
                run_dir_path.mkdir(parents=True, exist_ok=True)
                
                logger.info(f"[RUNS] Run folder created: {run_dir_path}")
                
                # STEP 3: Save uploaded CSV and JSL to run folder
                stage = "save_files"
                csv_content = await csv_file.read()
                jsl_content = await jsl_file.read()
                
                # Generate filenames
                ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
                uid = str(uuid.uuid4())[:8]
                csv_filename = f"data_{ts}_{uid}.csv"
                jsl_filename = f"script_{ts}_{uid}.jsl"
                
                csv_storage_key = f"{run_dir_key}/{csv_filename}"
                jsl_storage_key = f"{run_dir_key}/{jsl_filename}"
                csv_storage_path = local_storage.get_file_path(csv_storage_key)
                jsl_storage_path = local_storage.get_file_path(jsl_storage_key)
                
                # Save files to run folder
                csv_storage_path.write_bytes(csv_content)
                jsl_storage_path.write_bytes(jsl_content)
                
                # Set JSL file permissions to prevent macOS auto-opening
                jsl_storage_path.chmod(0o644)
                
                logger.info(f"[RUNS] Saved uploaded files to run folder:")
                logger.info(f"  CSV: {csv_storage_path} (size: {len(csv_content)} bytes)")
                logger.info(f"  JSL: {jsl_storage_path} (size: {len(jsl_content)} bytes)")
                
                # STEP 4: Create artifacts for uploaded files
                stage = "create_artifacts"
                csv_artifact = Artifact(
                    project_id=project_uuid,
                    run_id=run.id,
                    kind="input_csv",
                    storage_key=str(csv_storage_path.resolve()),
                    filename=csv_filename,
                    mime_type="text/csv"
                )
                
                jsl_artifact = Artifact(
                    project_id=project_uuid,
                    run_id=run.id,
                    kind="input_jsl",
                    storage_key=str(jsl_storage_path.resolve()),
                    filename=jsl_filename,
                    mime_type="text/plain"
                )
                
                create_db.add(csv_artifact)
                create_db.add(jsl_artifact)
                await create_db.commit()
                await create_db.refresh(csv_artifact)
                await create_db.refresh(jsl_artifact)
                
                logger.info(f"[RUNS] Artifacts created for uploaded files")
                
                # STEP 5: Process CSV and JSL (validate and prepare)
                stage = "process_files"
                # Read CSV to validate it's valid
                try:
                    csv_text = csv_storage_path.read_text(encoding='utf-8')
                    if not csv_text.strip():
                        raise ValueError("CSV file is empty")
                    # Validate CSV has at least one line
                    lines = csv_text.strip().split('\n')
                    if len(lines) < 1:
                        raise ValueError("CSV file must have at least one line")
                except Exception as e:
                    raise ValueError(f"Invalid CSV file: {str(e)}")
                
                # Read JSL to validate it's valid
                try:
                    jsl_text = jsl_storage_path.read_text(encoding='utf-8')
                    if not jsl_text.strip():
                        raise ValueError("JSL file is empty")
                except Exception as e:
                    raise ValueError(f"Invalid JSL file: {str(e)}")
                
                logger.info(f"[RUNS] CSV and JSL files validated successfully")
                
                # STEP 6: Generate task folder with processed files
                stage = "create_task_folder"
                ts_task = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
                task_uid = str(uuid.uuid4())  # Use full UUID for better uniqueness
                jmp_task_id = f"{ts_task}_{task_uid}"
                
                tasks_root = Path(settings.TASKS_DIRECTORY).expanduser().resolve()
                task_dir = tasks_root / f"task_{jmp_task_id}"
                task_dir.mkdir(parents=True, exist_ok=True)
                
                logger.info(f"[RUNS] Task folder created: {task_dir}")
                
                # STEP 7: Copy processed files to task folder
                stage = "copy_to_task_folder"
                csv_dst = task_dir / csv_filename
                jsl_dst = task_dir / jsl_filename
                
                # Copy CSV file as-is
                csv_dst.write_bytes(csv_content)
                
                # Read JSL file and ensure header Open() points to absolute CSV path in task folder
                absolute_csv_path = str(csv_dst.resolve())
                
                # Create comment lines with metadata
                create_time = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
                jsl_header = f"""// JSL Script generated by Auto-JMP Platform
// Run ID: {str(run.id)}
// Task Folder ID: {jmp_task_id}
// Created: {create_time}
// CSV File: {csv_dst.name}
Open("{absolute_csv_path}");
"""
                
                # Replace existing Open("..."); header and comments if present, otherwise prepend
                pattern = r'(?:^\s*//.*?\n)*\s*Open\(".*?"\);\s*\n?'
                if re.search(pattern, jsl_text, flags=re.MULTILINE):
                    modified_jsl_content = re.sub(pattern, jsl_header, jsl_text, count=1, flags=re.MULTILINE)
                    logger.info("[RUNS] Replaced existing Open() header and comments in JSL")
                else:
                    modified_jsl_content = jsl_header + jsl_text
                    logger.info("[RUNS] Prepended Open() header and comments to JSL")
                
                # Write modified JSL to task folder
                jsl_dst.write_text(modified_jsl_content, encoding='utf-8')
                jsl_dst.chmod(0o644)
                
                logger.info(f"[RUNS] Files copied to task folder:")
                logger.info(f"  CSV: {csv_dst}")
                logger.info(f"  JSL: {jsl_dst}")
                
                # Verify copies
                if not csv_dst.exists() or not jsl_dst.exists():
                    raise RuntimeError(f"Failed to copy files into task folder: {task_dir}")
                
                # STEP 8: Set jmp_task_id on run and commit
                stage = "persist_task_id"
                run.jmp_task_id = jmp_task_id
                await create_db.commit()
                
                logger.info(f"[RUNS] Task ID persisted on run: {jmp_task_id}")
                
                # Notify frontend
                await publish_run_update(str(run.id), {
                    "type": "task_prepared",
                    "run_id": str(run.id),
                    "status": "queued",
                    "message": f"Task folder ready: task_{jmp_task_id}",
                    "task_dir": str(task_dir)
                })
                
                # STEP 9: Queue Celery task (after task folder is prepared)
                stage = "queue_task"
                # Check queue mode setting
                queue_mode_result = await create_db.execute(
                    select(AppSetting).where(AppSetting.k == "queue_mode")
                )
                queue_mode_setting = queue_mode_result.scalar_one_or_none()
                
                queue_mode = False
                if queue_mode_setting:
                    try:
                        import json
                        queue_mode = json.loads(queue_mode_setting.v)
                    except:
                        queue_mode = False
                
                if queue_mode:
                    running_tasks_count = await create_db.scalar(
                        select(func.count(Run.id)).where(Run.status == RunStatus.RUNNING)
                    )
                    
                    if running_tasks_count > 0:
                        run.message = "Run queued - waiting for other tasks to complete"
                        await create_db.commit()
                        
                        await publish_run_update(str(run.id), {
                            "type": "run_queued",
                            "run_id": str(run.id),
                            "status": "queued",
                            "message": "Run queued - waiting for other tasks to complete"
                        })
                    else:
                        celery_app.send_task("run_jmp_boxplot", args=[str(run.id)])
                else:
                    celery_app.send_task("run_jmp_boxplot", args=[str(run.id)])
                
                logger.info(f"[RUNS] Celery task queued for run {run.id}")
                
                # Create history log for run creation
                try:
                    from app.api.v1.endpoints.projects import create_history_log
                    await create_history_log(
                        db=create_db,
                        project_id=run.project_id,
                        user_id=current_user.id if current_user else None,
                        action_type="run_created",
                        description=f"New run created: {run.task_name}",
                        metadata={
                            "run_id": str(run.id),
                            "task_name": run.task_name,
                            "status": run.status.value
                        }
                    )
                except Exception as e:
                    logger.warning(f"Failed to create history log: {e}")
                
                # Publish initial status
                await publish_run_update(str(run.id), {
                    "type": "run_created",
                    "run_id": str(run.id),
                    "status": "queued",
                    "message": "Run queued for processing"
                })
                
                # Return run response
                return RunResponse(
                    id=str(run.id),
                    project_id=str(run.project_id),
                    status=run.status.value,
                    task_name=run.task_name,
                    message=run.message,
                    image_count=run.image_count,
                    created_at=run.created_at,
                    started_at=run.started_at,
                    finished_at=run.finished_at,
                    started_by=str(run.started_by) if run.started_by else None,
                    started_by_email=current_user.email if current_user else None,
                    started_by_is_guest=current_user.is_guest if current_user else None
                )
                
            except Exception as e:
                logger.error(f"[RUNS] Failed to create run: {e}", exc_info=True)
                raise HTTPException(
                    status_code=400,
                    detail=f"Failed to create run: {str(e)} (stage: {stage})"
                )
                
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[RUNS] Unexpected error creating run: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Unexpected error creating run: {str(e)}"
        )

@router.get("/{run_id}", response_model=RunResponse)
async def get_run(
    run_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Get run details."""
    result = await db.execute(select(Run).where(Run.id == uuid.UUID(run_id), Run.deleted_at.is_(None)))
    run = result.scalar_one_or_none()
    
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    
    # Check project access
    await check_project_access(db, run.project_id, current_user)
    
    # Get user information if run was started by a user
    started_by_user = None
    if run.started_by:
        result = await db.execute(select(AppUser).where(AppUser.id == run.started_by))
        started_by_user = result.scalar_one_or_none()
    
    return RunResponse(
        id=str(run.id),
        project_id=str(run.project_id),
        status=run.status.value,
        task_name=run.task_name,
        message=run.message,
        image_count=run.image_count,
        created_at=run.created_at,
        started_at=run.started_at,
        finished_at=run.finished_at,
        started_by=str(run.started_by) if run.started_by else None,
        started_by_email=started_by_user.email if started_by_user else None,
        started_by_is_guest=started_by_user.is_guest if started_by_user else None
    )

@router.get("/{run_id}/artifacts", response_model=List[ArtifactResponse])
async def get_run_artifacts(
    run_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Get artifacts for a run."""
    result = await db.execute(select(Run).where(Run.id == uuid.UUID(run_id), Run.deleted_at.is_(None)))
    run = result.scalar_one_or_none()
    
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    
    # Check project access
    await check_project_access(db, run.project_id, current_user)
    
    # Get artifacts
    artifacts_result = await db.execute(
        select(Artifact).where(Artifact.run_id == uuid.UUID(run_id))
    )
    artifacts = artifacts_result.scalars().all()
    
    artifact_responses = []
    for artifact in artifacts:
        # Generate download URL based on storage key
        if artifact.storage_key:
            # For local storage, create a direct file URL
            if artifact.storage_key.startswith("tasks/"):
                # Task directory images - use a simple endpoint with base64 encoding
                import base64
                encoded_path = base64.b64encode(artifact.storage_key.encode()).decode()
                download_url = f"/api/v1/uploads/file-serve?path={encoded_path}"
            else:
                # Upload directory files - use existing upload system
                download_url = f"/api/v1/uploads/download/{artifact.storage_key}"
        else:
            download_url = None
        
        artifact_responses.append(ArtifactResponse(
            id=str(artifact.id),
            kind=artifact.kind,
            filename=artifact.filename,
            size_bytes=artifact.size_bytes,
            mime_type=artifact.mime_type,
            created_at=artifact.created_at,
            download_url=download_url
        ))
    
    return artifact_responses

@router.get("/{run_id}/task-images")
async def get_run_task_images(
    run_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Get images directly from the run's task folder (not from database artifacts)."""
    result = await db.execute(select(Run).where(Run.id == uuid.UUID(run_id), Run.deleted_at.is_(None)))
    run = result.scalar_one_or_none()
    
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    
    # Check project access
    await check_project_access(db, run.project_id, current_user)
    
    # Check if run has jmp_task_id
    if not run.jmp_task_id:
        return {
            "run_id": run_id,
            "images": [],
            "task_dir": None,
            "message": "Task folder not yet created"
        }
    
    # Construct task folder path
    tasks_root = Path(settings.TASKS_DIRECTORY).expanduser().resolve()
    task_dir = tasks_root / f"task_{run.jmp_task_id}"
    
    images = []
    if task_dir.exists() and task_dir.is_dir():
        # Find all image files in the task folder
        image_extensions = {'.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff'}
        for file_path in sorted(task_dir.glob("*")):
            if file_path.is_file() and file_path.suffix.lower() in image_extensions:
                # Create a URL to serve the image
                relative_path = file_path.relative_to(tasks_root)
                encoded_path = base64.b64encode(str(relative_path).encode()).decode()
                images.append({
                    "filename": file_path.name,
                    "size": file_path.stat().st_size,
                    "modified": file_path.stat().st_mtime,
                    "url": f"/api/v1/runs/{run_id}/task-image/{file_path.name}",
                    "encoded_path": encoded_path
                })
    
    return {
        "run_id": run_id,
        "images": images,
        "task_dir": str(task_dir) if task_dir.exists() else None,
        "count": len(images)
    }

@router.get("/{run_id}/task-image/{filename}")
async def get_run_task_image(
    run_id: str,
    filename: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Serve an image directly from the run's task folder."""
    result = await db.execute(select(Run).where(Run.id == uuid.UUID(run_id), Run.deleted_at.is_(None)))
    run = result.scalar_one_or_none()
    
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    
    # Check project access
    await check_project_access(db, run.project_id, current_user)
    
    if not run.jmp_task_id:
        raise HTTPException(status_code=404, detail="Task folder not found")
    
    # Construct task folder path
    tasks_root = Path(settings.TASKS_DIRECTORY).expanduser().resolve()
    task_dir = tasks_root / f"task_{run.jmp_task_id}"
    image_path = task_dir / filename
    
    if not image_path.exists() or not image_path.is_file():
        raise HTTPException(status_code=404, detail="Image not found")
    
    # Verify the image is actually in the task directory (security check)
    try:
        image_path.resolve().relative_to(task_dir.resolve())
    except ValueError:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Determine content type
    content_type = "image/png"
    if filename.lower().endswith('.jpg') or filename.lower().endswith('.jpeg'):
        content_type = "image/jpeg"
    elif filename.lower().endswith('.gif'):
        content_type = "image/gif"
    elif filename.lower().endswith('.bmp'):
        content_type = "image/bmp"
    elif filename.lower().endswith('.tiff'):
        content_type = "image/tiff"
    
    # Read and return the image
    image_data = image_path.read_bytes()
    return Response(content=image_data, media_type=content_type)

@router.get("/{run_id}/download-zip")
async def get_run_zip_download_url(
    run_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Get ZIP download URL for a run."""
    result = await db.execute(select(Run).where(Run.id == uuid.UUID(run_id), Run.deleted_at.is_(None)))
    run = result.scalar_one_or_none()
    
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    
    # Check project access
    await check_project_access(db, run.project_id, current_user)
    
    # Return ZIP download URL
    return {
        "run_id": run_id,
        "zip_download_url": f"/api/v1/uploads/download-zip/{run_id}",
        "filename": f"run_{run_id}_results.zip"
    }

@router.get("/project/{project_id}/runs", response_model=List[RunResponse])
async def get_project_runs(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Get all runs for a project."""
    project_uuid = uuid.UUID(project_id)
    await check_project_access(db, project_uuid, current_user)
    
    result = await db.execute(
        select(Run).where(Run.project_id == project_uuid, Run.deleted_at.is_(None)).order_by(Run.created_at.desc())
    )
    runs = result.scalars().all()
    
    return [
        RunResponse(
            id=str(run.id),
            project_id=str(run.project_id),
            status=run.status.value,
            task_name=run.task_name,
            message=run.message,
            image_count=run.image_count,
            created_at=run.created_at,
            started_at=run.started_at,
            finished_at=run.finished_at,
            started_by=str(run.started_by) if run.started_by else None,
            started_by_email=None,
            started_by_is_guest=None
        )
        for run in runs
    ]

@router.delete("/{run_id}")
async def delete_run(
    run_id: str,
    current_user: Optional[AppUser] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db)
):
    """Soft delete a run."""
    run_uuid = uuid.UUID(run_id)
    
    # Get the run and check access
    result = await db.execute(select(Run).where(Run.id == run_uuid, Run.deleted_at.is_(None)))
    run = result.scalar_one_or_none()
    
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    
    # Check if user has access to the project
    await check_project_access(db, run.project_id, current_user)
    
    # Soft delete the run by setting deleted_at timestamp
    run.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    
    return {"message": "Run deleted successfully"}

@router.patch("/{run_id}/task-name", response_model=RunResponse)
async def update_run_task_name(
    run_id: str,
    update_data: RunTaskNameUpdate,
    current_user: Optional[AppUser] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db)
):
    """Update the task name of a run."""
    run_uuid = uuid.UUID(run_id)
    
    # Get the run and check access
    result = await db.execute(select(Run).where(Run.id == run_uuid, Run.deleted_at.is_(None)))
    run = result.scalar_one_or_none()
    
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    
    # Check if user has access to the project and is a member (not just watcher)
    project_result = await db.execute(select(Project).where(Project.id == run.project_id))
    project = project_result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Check if user is owner or member (not watcher)
    if current_user:
        is_owner = project.owner_id == current_user.id
        member_result = await db.execute(
            select(ProjectMember).where(
                ProjectMember.project_id == run.project_id,
                ProjectMember.user_id == current_user.id
            )
        )
        member = member_result.scalar_one_or_none()
        is_member = member is not None and member.role in ['member', 'MEMBER', 'OWNER']
        
        if not (is_owner or is_member):
            raise HTTPException(status_code=403, detail="Only project members can edit run task names")
    else:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    # Store old task name for history log
    old_task_name = run.task_name
    
    # Update task name
    run.task_name = update_data.task_name
    await db.commit()
    await db.refresh(run)
    
    # Create history log
    from app.api.v1.endpoints.projects import create_history_log
    await create_history_log(
        db=db,
        project_id=run.project_id,
        user_id=current_user.id if current_user else None,
        action_type="run_task_name_updated",
        description=f"Run task name updated from '{old_task_name}' to '{update_data.task_name}'",
        metadata={
            "run_id": str(run.id),
            "old_task_name": old_task_name,
            "new_task_name": update_data.task_name
        }
    )
    
    # Get user info for response
    started_by_email = None
    started_by_is_guest = None
    if run.started_by:
        user_result = await db.execute(select(AppUser).where(AppUser.id == run.started_by))
        user = user_result.scalar_one_or_none()
        if user:
            started_by_email = user.email
            started_by_is_guest = user.is_guest
    
    return RunResponse(
        id=str(run.id),
        project_id=str(run.project_id),
        status=run.status.value,
        task_name=run.task_name,
        message=run.message,
        image_count=run.image_count,
        created_at=run.created_at,
        started_at=run.started_at,
        finished_at=run.finished_at,
        started_by=str(run.started_by) if run.started_by else None,
        started_by_email=started_by_email,
        started_by_is_guest=started_by_is_guest
    )

# Run Comments endpoints
@router.get("/{run_id}/comments", response_model=List[RunCommentResponse])
async def get_run_comments(
    run_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Get all comments for a run."""
    # Get run and check access
    result = await db.execute(select(Run).where(Run.id == uuid.UUID(run_id), Run.deleted_at.is_(None)))
    run = result.scalar_one_or_none()
    
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    
    # Check project access
    await check_project_access(db, run.project_id, current_user)
    
    # Get all top-level comments (no parent_id)
    result = await db.execute(
        select(RunComment, AppUser).join(AppUser).where(
            and_(
                RunComment.run_id == uuid.UUID(run_id),
                RunComment.parent_id.is_(None),
                RunComment.deleted_at.is_(None)
            )
        ).order_by(RunComment.created_at.desc())
    )
    
    comments = []
    for comment, user in result:
        # Get replies for this comment
        replies_result = await db.execute(
            select(RunComment, AppUser).join(AppUser).where(
                and_(
                    RunComment.parent_id == comment.id,
                    RunComment.deleted_at.is_(None)
                )
            ).order_by(RunComment.created_at.asc())
        )
        
        replies = []
        for reply, reply_user in replies_result:
            replies.append(RunCommentResponse(
                id=str(reply.id),
                user_id=str(reply.user_id),
                user_email=reply_user.email,
                user_is_guest=reply_user.is_guest,
                parent_id=str(reply.parent_id) if reply.parent_id else None,
                content=reply.content,
                created_at=reply.created_at,
                updated_at=reply.updated_at,
                replies=[]
            ))
        
        comments.append(RunCommentResponse(
            id=str(comment.id),
            user_id=str(comment.user_id),
            user_email=user.email,
            user_is_guest=user.is_guest,
            parent_id=str(comment.parent_id) if comment.parent_id else None,
            content=comment.content,
            created_at=comment.created_at,
            updated_at=comment.updated_at,
            replies=replies
        ))
    
    return comments

@router.post("/{run_id}/comments")
async def create_run_comment(
    run_id: str,
    comment_data: RunCommentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Create a new comment on a run."""
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    # Get run and check access
    result = await db.execute(select(Run).where(Run.id == uuid.UUID(run_id), Run.deleted_at.is_(None)))
    run = result.scalar_one_or_none()
    
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    
    # Check project access
    await check_project_access(db, run.project_id, current_user)
    
    # If replying to a comment, verify parent exists
    if comment_data.parent_id:
        result = await db.execute(
            select(RunComment).where(
                and_(
                    RunComment.id == uuid.UUID(comment_data.parent_id),
                    RunComment.run_id == uuid.UUID(run_id),
                    RunComment.deleted_at.is_(None)
                )
            )
        )
        parent_comment = result.scalar_one_or_none()
        
        if not parent_comment:
            raise HTTPException(status_code=404, detail="Parent comment not found")
    
    # Create comment
    comment = RunComment(
        run_id=uuid.UUID(run_id),
        user_id=current_user.id,
        parent_id=uuid.UUID(comment_data.parent_id) if comment_data.parent_id else None,
        content=comment_data.content
    )
    
    db.add(comment)
    await db.commit()
    await db.refresh(comment)
    
    # Send notification to project members about new run comment
    await NotificationService.notify_comment_added(
        db=db,
        project_id=run.project_id,
        commenter_user_id=current_user.id,
        comment_content=comment_data.content
    )
    
    return {"message": "Comment created successfully", "comment_id": str(comment.id)}

@router.put("/{run_id}/comments/{comment_id}")
async def update_run_comment(
    run_id: str,
    comment_id: str,
    comment_data: RunCommentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Update a run comment."""
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    # Get run and check access
    result = await db.execute(select(Run).where(Run.id == uuid.UUID(run_id), Run.deleted_at.is_(None)))
    run = result.scalar_one_or_none()
    
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    
    # Check project access
    await check_project_access(db, run.project_id, current_user)
    
    # Find comment
    result = await db.execute(
        select(RunComment).where(
            and_(
                RunComment.id == uuid.UUID(comment_id),
                RunComment.run_id == uuid.UUID(run_id),
                RunComment.deleted_at.is_(None)
            )
        )
    )
    comment = result.scalar_one_or_none()
    
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    
    # Check permissions (comment author or project owner)
    if comment.user_id != current_user.id:
        # Check if user is project owner
        project_result = await db.execute(
            select(Project).where(Project.id == run.project_id)
        )
        project = project_result.scalar_one_or_none()
        
        if not project or project.owner_id != current_user.id:
            raise HTTPException(status_code=403, detail="Permission denied")
    
    # Update comment
    comment.content = comment_data.content
    await db.commit()
    
    return {"message": "Comment updated successfully"}

@router.delete("/{run_id}/comments/{comment_id}")
async def delete_run_comment(
    run_id: str,
    comment_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Delete a run comment."""
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    # Get run and check access
    result = await db.execute(select(Run).where(Run.id == uuid.UUID(run_id), Run.deleted_at.is_(None)))
    run = result.scalar_one_or_none()
    
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    
    # Check project access
    await check_project_access(db, run.project_id, current_user)
    
    # Find comment
    result = await db.execute(
        select(RunComment).where(
            and_(
                RunComment.id == uuid.UUID(comment_id),
                RunComment.run_id == uuid.UUID(run_id),
                RunComment.deleted_at.is_(None)
            )
        )
    )
    comment = result.scalar_one_or_none()
    
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    
    # Check permissions (comment author or project owner)
    if comment.user_id != current_user.id:
        # Check if user is project owner
        project_result = await db.execute(
            select(Project).where(Project.id == run.project_id)
        )
        project = project_result.scalar_one_or_none()
        
        if not project or project.owner_id != current_user.id:
            raise HTTPException(status_code=403, detail="Permission denied")
    
    # Soft delete comment
    comment.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    
    return {"message": "Comment deleted successfully"}

@router.post("/comment-counts", response_model=List[RunCommentCountResponse])
async def get_run_comment_counts(
    run_ids: List[str],
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Get comment counts for multiple runs."""
    if not run_ids:
        return []
    
    # Convert string IDs to UUIDs
    try:
        run_uuids = [uuid.UUID(rid) for rid in run_ids]
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid run ID format")
    
    # Get runs and check access
    result = await db.execute(
        select(Run).where(Run.id.in_(run_uuids), Run.deleted_at.is_(None))
    )
    runs = result.scalars().all()
    
    if not runs:
        return []
    
    # Check project access for all runs (they should be from the same project)
    project_ids = set(str(run.project_id) for run in runs)
    if len(project_ids) > 1:
        raise HTTPException(status_code=400, detail="All runs must be from the same project")
    
    project_id = list(project_ids)[0]
    await check_project_access(db, project_id, current_user)
    
    # Get comment counts for each run
    result = await db.execute(
        select(
            RunComment.run_id,
            func.count(RunComment.id).label('comment_count')
        ).where(
            and_(
                RunComment.run_id.in_(run_uuids),
                RunComment.deleted_at.is_(None)
            )
        ).group_by(RunComment.run_id)
    )
    
    comment_counts = {str(row.run_id): row.comment_count for row in result}
    
    # Return counts for all requested runs (including those with 0 comments)
    return [
        RunCommentCountResponse(
            run_id=rid,
            comment_count=comment_counts.get(rid, 0)
        )
        for rid in run_ids
    ]

@router.get("/{run_id}/artifacts-with-comments", response_model=List[RunArtifactWithCommentsResponse])
async def get_run_artifacts_with_comments(
    run_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Get artifacts for a run with their comment counts."""
    # Get run and check access
    result = await db.execute(select(Run).where(Run.id == uuid.UUID(run_id), Run.deleted_at.is_(None)))
    run = result.scalar_one_or_none()
    
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    
    # Check project access
    await check_project_access(db, run.project_id, current_user)
    
    # Get artifacts for this run
    artifacts_result = await db.execute(
        select(Artifact).where(Artifact.run_id == uuid.UUID(run_id))
    )
    artifacts = artifacts_result.scalars().all()
    
    if not artifacts:
        return []
    
    # Get artifact IDs
    artifact_ids = [str(artifact.id) for artifact in artifacts]
    
    # Get comment counts for these artifacts
    from app.api.v1.endpoints.artifacts import get_artifact_comment_counts
    comment_counts_response = await get_artifact_comment_counts(artifact_ids, db, current_user)
    
    # Create a map of artifact_id to comment_count
    comment_counts_map = {item.artifact_id: item.comment_count for item in comment_counts_response}
    
    # Build response with artifacts and their comment counts
    result = []
    for artifact in artifacts:
        artifact_id = str(artifact.id)
        comment_count = comment_counts_map.get(artifact_id, 0)
        
        result.append(RunArtifactWithCommentsResponse(
            artifact_id=artifact_id,
            filename=artifact.filename,
            kind=artifact.kind,
            comment_count=comment_count
        ))
    
    return result
