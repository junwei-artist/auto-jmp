from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func
from sqlalchemy.orm import selectinload
from typing import List, Optional, Dict
import uuid
from datetime import datetime

from app.core.database import get_db
from app.core.auth import get_current_user_optional
from app.models import (
    Artifact, ArtifactComment, AppUser, Project, ProjectMember, RoleEnum
)
from app.services.notification_service import NotificationService
from pydantic import BaseModel

router = APIRouter()

# Pydantic models for artifact comments
class ArtifactCommentResponse(BaseModel):
    id: str
    user_id: str
    user_email: Optional[str]
    user_is_guest: bool
    parent_id: Optional[str]
    content: str
    created_at: datetime
    updated_at: datetime
    replies: List['ArtifactCommentResponse'] = []

class ArtifactCommentCreate(BaseModel):
    content: str
    parent_id: Optional[str] = None

class ArtifactCommentUpdate(BaseModel):
    content: str

class ArtifactCommentCountResponse(BaseModel):
    artifact_id: str
    comment_count: int

# Helper function to check project access for comments
async def check_project_access_for_comments(db: AsyncSession, project_id: str, user: Optional[AppUser]):
    """Check if user has access to project for commenting (allows all registered users)."""
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    # Get project
    result = await db.execute(
        select(Project).where(Project.id == uuid.UUID(project_id), Project.deleted_at.is_(None))
    )
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Check if user is owner
    if project.owner_id == user.id:
        return project, RoleEnum.OWNER
    
    # Check if user is a member
    result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == uuid.UUID(project_id),
            ProjectMember.user_id == user.id
        )
    )
    membership = result.scalar_one_or_none()
    
    if membership:
        return project, membership.role
    else:
        # Allow all registered users to comment (default to watcher role)
        return project, RoleEnum.WATCHER

# Helper function to check project access
async def check_project_access(db: AsyncSession, project_id: str, user: Optional[AppUser], required_role: Optional[RoleEnum] = None):
    """Check if user has access to project with optional role requirement."""
    if not user:
        # Check if project allows guests
        result = await db.execute(
            select(Project).where(
                and_(
                    Project.id == uuid.UUID(project_id),
                    Project.allow_guest == True,
                    Project.deleted_at.is_(None)
                )
            )
        )
        project = result.scalar_one_or_none()
        if not project:
            raise HTTPException(status_code=401, detail="Authentication required")
        return project, "guest"
    
    # Check if user is project owner
    result = await db.execute(
        select(Project).where(
            and_(
                Project.id == uuid.UUID(project_id),
                Project.owner_id == user.id,
                Project.deleted_at.is_(None)
            )
        )
    )
    project = result.scalar_one_or_none()
    if project:
        return project, "owner"
    
    # Check if user is project member
    result = await db.execute(
        select(ProjectMember, Project).join(Project).where(
            and_(
                ProjectMember.project_id == uuid.UUID(project_id),
                ProjectMember.user_id == user.id,
                Project.deleted_at.is_(None)
            )
        )
    )
    membership = result.first()
    if membership:
        member, project = membership
        if required_role and member.role != required_role:
            raise HTTPException(status_code=403, detail=f"Role {required_role.value} required")
        return project, member.role.value
    
    # Check if project is public
    result = await db.execute(
        select(Project).where(
            and_(
                Project.id == uuid.UUID(project_id),
                Project.is_public == True,
                Project.deleted_at.is_(None)
            )
        )
    )
    project = result.scalar_one_or_none()
    if project:
        return project, "public"
    
    raise HTTPException(status_code=403, detail="Access denied")

# Artifact Comments endpoints
@router.get("/{artifact_id}/comments", response_model=List[ArtifactCommentResponse])
async def get_artifact_comments(
    artifact_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Get all comments for an artifact."""
    # Get artifact and check access
    result = await db.execute(
        select(Artifact).where(Artifact.id == uuid.UUID(artifact_id))
    )
    artifact = result.scalar_one_or_none()
    
    if not artifact:
        raise HTTPException(status_code=404, detail="Artifact not found")
    
    # Check project access
    project, user_role = await check_project_access_for_comments(db, str(artifact.project_id), current_user)
    
    # Get all top-level comments (no parent_id)
    result = await db.execute(
        select(ArtifactComment, AppUser).join(AppUser).where(
            and_(
                ArtifactComment.artifact_id == uuid.UUID(artifact_id),
                ArtifactComment.parent_id.is_(None),
                ArtifactComment.deleted_at.is_(None)
            )
        ).order_by(ArtifactComment.created_at.desc())
    )
    
    comments = []
    for comment, user in result:
        # Get replies for this comment
        replies_result = await db.execute(
            select(ArtifactComment, AppUser).join(AppUser).where(
                and_(
                    ArtifactComment.parent_id == comment.id,
                    ArtifactComment.deleted_at.is_(None)
                )
            ).order_by(ArtifactComment.created_at.asc())
        )
        
        replies = []
        for reply, reply_user in replies_result:
            replies.append(ArtifactCommentResponse(
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
        
        comments.append(ArtifactCommentResponse(
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

@router.post("/{artifact_id}/comments")
async def create_artifact_comment(
    artifact_id: str,
    comment_data: ArtifactCommentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Create a new comment on an artifact."""
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    # Get artifact and check access
    result = await db.execute(
        select(Artifact).where(Artifact.id == uuid.UUID(artifact_id))
    )
    artifact = result.scalar_one_or_none()
    
    if not artifact:
        raise HTTPException(status_code=404, detail="Artifact not found")
    
    # Check project access
    project, user_role = await check_project_access_for_comments(db, str(artifact.project_id), current_user)
    
    # If replying to a comment, verify parent exists
    if comment_data.parent_id:
        result = await db.execute(
            select(ArtifactComment).where(
                and_(
                    ArtifactComment.id == uuid.UUID(comment_data.parent_id),
                    ArtifactComment.artifact_id == uuid.UUID(artifact_id),
                    ArtifactComment.deleted_at.is_(None)
                )
            )
        )
        parent_comment = result.scalar_one_or_none()
        
        if not parent_comment:
            raise HTTPException(status_code=404, detail="Parent comment not found")
    
    # Create comment
    comment = ArtifactComment(
        artifact_id=uuid.UUID(artifact_id),
        user_id=current_user.id,
        parent_id=uuid.UUID(comment_data.parent_id) if comment_data.parent_id else None,
        content=comment_data.content
    )
    
    db.add(comment)
    await db.commit()
    await db.refresh(comment)
    
    # Send notification to project members about new artifact comment
    await NotificationService.notify_artifact_comment_added(
        db=db,
        project_id=artifact.project_id,
        artifact_id=uuid.UUID(artifact_id),
        commenter_user_id=current_user.id,
        comment_content=comment_data.content,
        artifact_filename=artifact.filename
    )
    
    return {"message": "Comment created successfully", "comment_id": str(comment.id)}

@router.put("/{artifact_id}/comments/{comment_id}")
async def update_artifact_comment(
    artifact_id: str,
    comment_id: str,
    comment_data: ArtifactCommentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Update an artifact comment."""
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    # Get artifact and check access
    result = await db.execute(
        select(Artifact).where(Artifact.id == uuid.UUID(artifact_id))
    )
    artifact = result.scalar_one_or_none()
    
    if not artifact:
        raise HTTPException(status_code=404, detail="Artifact not found")
    
    # Check project access
    project, user_role = await check_project_access_for_comments(db, str(artifact.project_id), current_user)
    
    # Find comment
    result = await db.execute(
        select(ArtifactComment).where(
            and_(
                ArtifactComment.id == uuid.UUID(comment_id),
                ArtifactComment.artifact_id == uuid.UUID(artifact_id),
                ArtifactComment.deleted_at.is_(None)
            )
        )
    )
    comment = result.scalar_one_or_none()
    
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    
    # Check permissions (comment author or project owner)
    if comment.user_id != current_user.id and user_role != RoleEnum.OWNER:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    # Update comment
    comment.content = comment_data.content
    await db.commit()
    
    return {"message": "Comment updated successfully"}

@router.delete("/{artifact_id}/comments/{comment_id}")
async def delete_artifact_comment(
    artifact_id: str,
    comment_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Delete an artifact comment (soft delete)."""
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    # Get artifact and check access
    result = await db.execute(
        select(Artifact).where(Artifact.id == uuid.UUID(artifact_id))
    )
    artifact = result.scalar_one_or_none()
    
    if not artifact:
        raise HTTPException(status_code=404, detail="Artifact not found")
    
    # Check project access
    project, user_role = await check_project_access_for_comments(db, str(artifact.project_id), current_user)
    
    # Find comment
    result = await db.execute(
        select(ArtifactComment).where(
            and_(
                ArtifactComment.id == uuid.UUID(comment_id),
                ArtifactComment.artifact_id == uuid.UUID(artifact_id),
                ArtifactComment.deleted_at.is_(None)
            )
        )
    )
    comment = result.scalar_one_or_none()
    
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    
    # Check permissions (comment author or project owner)
    if comment.user_id != current_user.id and user_role != RoleEnum.OWNER:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    # Soft delete comment
    comment.deleted_at = datetime.utcnow()
    await db.commit()
    
    return {"message": "Comment deleted successfully"}

@router.post("/comment-counts", response_model=List[ArtifactCommentCountResponse])
async def get_artifact_comment_counts(
    artifact_ids: List[str],
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Get comment counts for multiple artifacts."""
    if not artifact_ids:
        return []
    
    # Convert string IDs to UUIDs
    try:
        artifact_uuids = [uuid.UUID(aid) for aid in artifact_ids]
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid artifact ID format")
    
    # Get artifacts and check access
    result = await db.execute(
        select(Artifact).where(Artifact.id.in_(artifact_uuids))
    )
    artifacts = result.scalars().all()
    
    if not artifacts:
        return []
    
    # Check project access for all artifacts (they should be from the same project)
    project_ids = set(str(artifact.project_id) for artifact in artifacts)
    if len(project_ids) > 1:
        raise HTTPException(status_code=400, detail="All artifacts must be from the same project")
    
    project_id = list(project_ids)[0]
    project, user_role = await check_project_access_for_comments(db, project_id, current_user)
    
    # Get comment counts for each artifact
    result = await db.execute(
        select(
            ArtifactComment.artifact_id,
            func.count(ArtifactComment.id).label('comment_count')
        ).where(
            and_(
                ArtifactComment.artifact_id.in_(artifact_uuids),
                ArtifactComment.deleted_at.is_(None)
            )
        ).group_by(ArtifactComment.artifact_id)
    )
    
    comment_counts = {str(row.artifact_id): row.comment_count for row in result}
    
    # Return counts for all requested artifacts (including those with 0 comments)
    return [
        ArtifactCommentCountResponse(
            artifact_id=aid,
            comment_count=comment_counts.get(aid, 0)
        )
        for aid in artifact_ids
    ]

@router.post("/public/comment-counts", response_model=List[ArtifactCommentCountResponse])
async def get_public_artifact_comment_counts(
    artifact_ids: List[str],
    db: AsyncSession = Depends(get_db)
):
    """Get comment counts for multiple artifacts (public access)."""
    if not artifact_ids:
        return []
    
    # Convert string IDs to UUIDs
    try:
        artifact_uuids = [uuid.UUID(aid) for aid in artifact_ids]
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid artifact ID format")
    
    # Get artifacts and check they're from public projects
    result = await db.execute(
        select(Artifact, Project).join(Project).where(
            and_(
                Artifact.id.in_(artifact_uuids),
                Project.deleted_at.is_(None)
            )
        )
    )
    artifacts_with_projects = result.all()
    
    if not artifacts_with_projects:
        return []
    
    # Check that all projects are public
    for artifact, project in artifacts_with_projects:
        if not (hasattr(project, 'is_public') and project.is_public):
            raise HTTPException(status_code=403, detail="Project is not public")
    
    # Get comment counts for each artifact
    result = await db.execute(
        select(
            ArtifactComment.artifact_id,
            func.count(ArtifactComment.id).label('comment_count')
        ).where(
            and_(
                ArtifactComment.artifact_id.in_(artifact_uuids),
                ArtifactComment.deleted_at.is_(None)
            )
        ).group_by(ArtifactComment.artifact_id)
    )
    
    comment_counts = {str(row.artifact_id): row.comment_count for row in result}
    
    # Return counts for all requested artifacts (including those with 0 comments)
    return [
        ArtifactCommentCountResponse(
            artifact_id=aid,
            comment_count=comment_counts.get(aid, 0)
        )
        for aid in artifact_ids
    ]
