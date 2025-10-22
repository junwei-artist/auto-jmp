from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from pydantic import BaseModel
from typing import List, Optional
import uuid
from datetime import datetime, timezone

from app.core.database import get_db
from app.core.auth import get_current_user, get_current_user_optional
from app.core.celery import celery_app
from app.core.websocket import publish_run_update
from app.core.storage import local_storage
from app.models import Project, Run, RunStatus, AppUser, Artifact, ProjectMember, AppSetting, RunComment, ProjectAttachment
from app.services.notification_service import NotificationService

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
    
    # Create project attachments for input files
    run_id_str = str(run.id)
    
    # Create CSV attachment
    csv_attachment = ProjectAttachment(
        project_id=project_id,
        uploaded_by=current_user.id if current_user else None,
        filename=f"data_{run_id_str[:8]}.csv",
        description=f"Uploaded for generating run {run_id_str}",
        storage_key=run_data.csv_key,
        file_size=0,  # We'll update this if needed
        mime_type="text/csv"
    )
    
    # Create JSL attachment
    jsl_attachment = ProjectAttachment(
        project_id=project_id,
        uploaded_by=current_user.id if current_user else None,
        filename=f"script_{run_id_str[:8]}.jsl",
        description=f"Uploaded for generating run {run_id_str}",
        storage_key=run_data.jsl_key,
        file_size=0,  # We'll update this if needed
        mime_type="text/plain"
    )
    
    db.add(csv_attachment)
    db.add(jsl_attachment)
    await db.commit()
    
    # Check queue mode setting
    queue_mode_result = await db.execute(
        select(AppSetting).where(AppSetting.k == "queue_mode")
    )
    queue_mode_setting = queue_mode_result.scalar_one_or_none()
    
    # Default to parallel mode (False) if not set
    queue_mode = False
    if queue_mode_setting:
        try:
            import json
            queue_mode = json.loads(queue_mode_setting.v)
        except:
            queue_mode = False
    
    # Check if there are any running tasks when queue mode is enabled
    if queue_mode:
        running_tasks_count = await db.scalar(
            select(func.count(Run.id)).where(Run.status == RunStatus.RUNNING)
        )
        
        if running_tasks_count > 0:
            # There's already a running task, keep this one queued
            run.message = "Run queued - waiting for other tasks to complete"
            await db.commit()
            
            # Publish queued status
            await publish_run_update(str(run.id), {
                "type": "run_queued",
                "run_id": str(run.id),
                "status": "queued",
                "message": "Run queued - waiting for other tasks to complete"
            })
        else:
            # No running tasks, start this one immediately
            task = celery_app.send_task("run_jmp_boxplot", args=[str(run.id)])
    else:
        # Parallel mode - start immediately
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
        finished_at=run.finished_at,
        started_by=str(run.started_by) if run.started_by else None,
        started_by_email=current_user.email if current_user else None,
        started_by_is_guest=current_user.is_guest if current_user else None
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
