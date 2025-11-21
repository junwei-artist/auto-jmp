from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from pydantic import BaseModel
from typing import List, Optional
import uuid
from datetime import datetime, timezone

from app.core.database import get_db
from app.core.auth import get_current_user, get_current_user_optional
from app.models import Project, ProjectAttachment, AppUser
from app.core.storage import local_storage
from app.core.config import settings

router = APIRouter()

class ProjectAttachmentResponse(BaseModel):
    id: str
    filename: str
    description: str
    file_size: int
    mime_type: Optional[str]
    uploaded_by: str
    uploader_email: str
    uploader_display_name: Optional[str]
    created_at: str
    download_url: str

class ProjectAttachmentUpload(BaseModel):
    description: str

async def check_project_access_for_attachment(
    db: AsyncSession, 
    project_id: uuid.UUID, 
    user: Optional[AppUser]
) -> Project:
    """Check if user has access to project for attachment operations."""
    # Get project
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # NEW POLICY: Any authenticated user can access attachments of private projects
    if user:
        return project
    
    # Unauthenticated: only if guests allowed
    if project.allow_guest:
        return project
    
    raise HTTPException(status_code=403, detail="Authentication required")

@router.post("/{project_id}/attachments", response_model=ProjectAttachmentResponse)
async def upload_project_attachment(
    project_id: str,
    file: UploadFile = File(...),
    description: str = Form(...),
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user)
):
    """Upload an attachment to a project."""
    
    # Validate project access
    project = await check_project_access_for_attachment(db, uuid.UUID(project_id), current_user)
    
    # Validate file type
    if not file.content_type or file.content_type not in settings.ALLOWED_ATTACHMENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"File type '{file.content_type}' not allowed. Allowed types: {settings.ALLOWED_ATTACHMENT_TYPES}"
        )
    
    # Read file content
    content = await file.read()
    
    # Check file size (200MB max for attachments)
    if len(content) > settings.MAX_ATTACHMENT_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File size {len(content)} exceeds limit {settings.MAX_ATTACHMENT_SIZE}"
        )
    
    # Generate storage key using project-based structure
    storage_key = local_storage.generate_project_attachment_key(project_id, file.filename)
    
    # Save file
    file_path = local_storage.save_file(content, storage_key)
    
    # Create attachment record
    attachment = ProjectAttachment(
        project_id=uuid.UUID(project_id),
        uploaded_by=current_user.id,
        filename=file.filename,
        description=description or file.filename,  # Use filename as default if no description
        storage_key=storage_key,
        file_size=len(content),
        mime_type=file.content_type
    )
    
    db.add(attachment)
    await db.commit()
    await db.refresh(attachment)
    
    # Get uploader info
    uploader_result = await db.execute(select(AppUser).where(AppUser.id == current_user.id))
    uploader = uploader_result.scalar_one()
    
    return ProjectAttachmentResponse(
        id=str(attachment.id),
        filename=attachment.filename,
        description=attachment.description,
        file_size=attachment.file_size,
        mime_type=attachment.mime_type,
        uploaded_by=str(attachment.uploaded_by),
        uploader_email=uploader.email,
        uploader_display_name=uploader.display_name,
        created_at=attachment.created_at.isoformat(),
        download_url=f"/api/v1/projects/{project_id}/attachments/{attachment.id}/download"
    )

@router.get("/{project_id}/attachments", response_model=List[ProjectAttachmentResponse])
async def list_project_attachments(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """List all attachments for a project."""
    
    # Validate project access
    project = await check_project_access_for_attachment(db, uuid.UUID(project_id), current_user)
    
    # Get attachments with uploader info
    result = await db.execute(
        select(ProjectAttachment, AppUser)
        .join(AppUser, ProjectAttachment.uploaded_by == AppUser.id)
        .where(ProjectAttachment.project_id == uuid.UUID(project_id))
        .order_by(ProjectAttachment.created_at.desc())
    )
    
    attachments = []
    for attachment, uploader in result:
        attachments.append(ProjectAttachmentResponse(
            id=str(attachment.id),
            filename=attachment.filename,
            description=attachment.description,
            file_size=attachment.file_size,
            mime_type=attachment.mime_type,
            uploaded_by=str(attachment.uploaded_by),
            uploader_email=uploader.email,
            uploader_display_name=uploader.display_name,
            created_at=attachment.created_at.isoformat(),
            download_url=f"/api/v1/projects/{project_id}/attachments/{attachment.id}/download"
        ))
    
    return attachments

@router.delete("/{project_id}/attachments/{attachment_id}")
async def delete_project_attachment(
    project_id: str,
    attachment_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user)
):
    """Delete a project attachment. Only the uploader or project owner can delete."""
    
    # Validate project access
    project = await check_project_access_for_attachment(db, uuid.UUID(project_id), current_user)
    
    # Get attachment
    result = await db.execute(
        select(ProjectAttachment).where(
            ProjectAttachment.id == uuid.UUID(attachment_id),
            ProjectAttachment.project_id == uuid.UUID(project_id)
        )
    )
    attachment = result.scalar_one_or_none()
    
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    
    # Check if user can delete (uploader or project owner)
    can_delete = (
        attachment.uploaded_by == current_user.id or  # Uploader
        project.owner_id == current_user.id  # Project owner
    )
    
    if not can_delete:
        raise HTTPException(status_code=403, detail="Only the uploader or project owner can delete attachments")
    
    # Delete file from storage
    local_storage.delete_file(attachment.storage_key)
    
    # Delete attachment record
    await db.execute(
        delete(ProjectAttachment).where(ProjectAttachment.id == uuid.UUID(attachment_id))
    )
    await db.commit()
    
    return {"message": "Attachment deleted successfully"}

@router.get("/{project_id}/attachments/{attachment_id}/download")
async def download_project_attachment(
    project_id: str,
    attachment_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Download a project attachment."""
    from fastapi.responses import FileResponse
    from app.core.config import settings
    
    # If ALLOW_PUBLIC_MEDIA_ACCESS is enabled, skip auth checks for attachments
    if settings.ALLOW_PUBLIC_MEDIA_ACCESS:
        # Still validate project exists but skip auth
        result = await db.execute(select(Project).where(Project.id == uuid.UUID(project_id)))
        project = result.scalar_one_or_none()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
    else:
        # Validate project access with normal auth
        project = await check_project_access_for_attachment(db, uuid.UUID(project_id), current_user)
    
    # Get attachment
    result = await db.execute(
        select(ProjectAttachment).where(
            ProjectAttachment.id == uuid.UUID(attachment_id),
            ProjectAttachment.project_id == uuid.UUID(project_id)
        )
    )
    attachment = result.scalar_one_or_none()
    
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    
    # Get file path
    file_path = local_storage.get_file_path(attachment.storage_key)
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    return FileResponse(
        path=str(file_path),
        media_type=attachment.mime_type or "application/octet-stream",
        filename=attachment.filename
    )
