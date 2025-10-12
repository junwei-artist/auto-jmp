from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import List, Optional
import uuid
from datetime import datetime

from app.core.database import get_db
from app.core.auth import get_current_user, get_current_user_optional
from app.core.celery import celery_app
from app.core.websocket import publish_run_update
from app.models import Project, Run, RunStatus, AppUser, Artifact

router = APIRouter()

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

class ArtifactResponse(BaseModel):
    id: str
    kind: str
    filename: str
    size_bytes: Optional[int]
    mime_type: Optional[str]
    created_at: datetime
    download_url: Optional[str] = None

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
    
    # Check guest access
    if project.allow_guest:
        return project
    
    raise HTTPException(status_code=403, detail="Access denied")

@router.post("/", response_model=RunResponse)
async def create_run(
    run_data: RunCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Create a new JMP analysis run."""
    project_id = uuid.UUID(run_data.project_id)
    project = await check_project_access(db, project_id, current_user)
    
    # Create run record
    run = Run(
        project_id=project_id,
        started_by=current_user.id if current_user else None,
        status=RunStatus.QUEUED,
        task_name="jmp_boxplot",
        message="Run queued"
    )
    
    db.add(run)
    await db.commit()
    await db.refresh(run)
    
    # Create artifact records for input files
    csv_artifact = Artifact(
        project_id=project_id,
        run_id=run.id,
        kind="input_csv",
        storage_key=run_data.csv_key,
        filename="data.csv",
        mime_type="text/csv"
    )
    
    jsl_artifact = Artifact(
        project_id=project_id,
        run_id=run.id,
        kind="input_jsl",
        storage_key=run_data.jsl_key,
        filename="script.jsl",
        mime_type="text/plain"
    )
    
    db.add(csv_artifact)
    db.add(jsl_artifact)
    await db.commit()
    
    # Enqueue Celery task
    task = celery_app.send_task("run_jmp_boxplot", args=[str(run.id)])
    
    # Publish initial status
    await publish_run_update(str(run.id), {
        "type": "run_created",
        "run_id": str(run.id),
        "status": "queued",
        "message": "Run queued for processing"
    })
    
    return RunResponse(
        id=str(run.id),
        project_id=str(run.project_id),
        status=run.status.value,
        task_name=run.task_name,
        message=run.message,
        image_count=run.image_count,
        created_at=run.created_at,
        started_at=run.started_at,
        finished_at=run.finished_at
    )

@router.get("/{run_id}", response_model=RunResponse)
async def get_run(
    run_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Get run details."""
    result = await db.execute(select(Run).where(Run.id == uuid.UUID(run_id)))
    run = result.scalar_one_or_none()
    
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    
    # Check project access
    await check_project_access(db, run.project_id, current_user)
    
    return RunResponse(
        id=str(run.id),
        project_id=str(run.project_id),
        status=run.status.value,
        task_name=run.task_name,
        message=run.message,
        image_count=run.image_count,
        created_at=run.created_at,
        started_at=run.started_at,
        finished_at=run.finished_at
    )

@router.get("/{run_id}/artifacts", response_model=List[ArtifactResponse])
async def get_run_artifacts(
    run_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Get artifacts for a run."""
    result = await db.execute(select(Run).where(Run.id == uuid.UUID(run_id)))
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

@router.get("/{run_id}/download-zip")
async def get_run_zip_download_url(
    run_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Get ZIP download URL for a run."""
    result = await db.execute(select(Run).where(Run.id == uuid.UUID(run_id)))
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
        select(Run).where(Run.project_id == project_uuid).order_by(Run.created_at.desc())
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
            finished_at=run.finished_at
        )
        for run in runs
    ]
