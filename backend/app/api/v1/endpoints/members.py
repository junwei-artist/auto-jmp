from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func
from sqlalchemy.orm import selectinload
from typing import List, Optional
import uuid

from app.core.database import get_db
from app.core.auth import get_current_user_optional
from app.models import AppUser, Project, ProjectMember, RoleEnum, ProjectComment
from app.services.notification_service import NotificationService
from pydantic import BaseModel

router = APIRouter()

# Pydantic models
class ProjectMemberResponse(BaseModel):
    user_id: str
    email: Optional[str]
    role: str
    is_guest: bool

class ProjectMemberCreate(BaseModel):
    user_id: str
    role: str

class ProjectMemberRoleUpdate(BaseModel):
    role: str

class ProjectCommentResponse(BaseModel):
    id: str
    user_id: str
    user_email: Optional[str]
    user_is_guest: bool
    parent_id: Optional[str]
    content: str
    created_at: str
    updated_at: str
    replies: List['ProjectCommentResponse'] = []

class ProjectCommentCreate(BaseModel):
    content: str
    parent_id: Optional[str] = None

class ProjectCommentUpdate(BaseModel):
    content: str

# Helper function to check project access
async def check_project_access(db: AsyncSession, project_id: str, user: Optional[AppUser], required_role: Optional[RoleEnum] = None):
    """Check if user has access to project with optional role requirement."""
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
    
    if not membership:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Check role requirement
    if required_role and membership.role != required_role and membership.role != RoleEnum.OWNER:
        raise HTTPException(status_code=403, detail=f"Role {required_role.value} required")
    
    return project, membership.role

# Helper function to check project access for comments (allows all registered users)
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

# Project Members endpoints
@router.get("/projects/{project_id}/members", response_model=List[ProjectMemberResponse])
async def get_project_members(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Get all members of a project."""
    project, user_role = await check_project_access(db, project_id, current_user, None)
    
    # Get all members from project_member table (including owner)
    members = []
    
    result = await db.execute(
        select(ProjectMember, AppUser).join(AppUser).where(
            ProjectMember.project_id == uuid.UUID(project_id)
        )
    )
    
    for membership, user in result:
        members.append(ProjectMemberResponse(
            user_id=str(user.id),
            email=user.email,
            role=membership.role,
            is_guest=user.is_guest
        ))
    
    return members

@router.post("/projects/{project_id}/members")
async def add_project_member(
    project_id: str,
    member_data: ProjectMemberCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Add a member to a project."""
    print(f"Adding member to project {project_id}, user: {member_data.user_id}, role: {member_data.role}")
    project, user_role = await check_project_access(db, project_id, current_user, RoleEnum.OWNER)
    print(f"Project access check successful, user_role: {user_role}")
    
    # Validate role - accept both lowercase and uppercase inputs
    try:
        # Try the role as-is first
        role = RoleEnum(member_data.role)
        print(f"Role validation successful: {role} = {role.value}")
    except ValueError:
        try:
            # Try uppercase version
            role = RoleEnum(member_data.role.upper())
            print(f"Role validation successful (uppercase): {role} = {role.value}")
        except ValueError as e:
            print(f"Role validation failed: {e}")
            raise HTTPException(status_code=400, detail="Invalid role")
    
    # Check if user exists
    result = await db.execute(select(AppUser).where(AppUser.id == uuid.UUID(member_data.user_id)))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check if user is already a member
    result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == uuid.UUID(project_id),
            ProjectMember.user_id == uuid.UUID(member_data.user_id)
        )
    )
    existing_membership = result.scalar_one_or_none()
    
    if existing_membership:
        raise HTTPException(status_code=400, detail="User is already a member")
    
    # Create membership using raw SQL to handle enum casting
    from sqlalchemy import text
    
    # Map role values to database enum values and role IDs
    role_mapping = {
        "OWNER": ("OWNER", "00000000-0000-0000-0000-000000000001"),
        "MEMBER": ("member", "00000000-0000-0000-0000-000000000002"), 
        "WATCHER": ("watcher", "00000000-0000-0000-0000-000000000003")
    }
    
    db_role, role_id = role_mapping.get(role.value, (role.value, "00000000-0000-0000-0000-000000000002"))
    
    await db.execute(text(f"""
        INSERT INTO project_member (project_id, user_id, role, role_id) 
        VALUES (:project_id, :user_id, '{db_role}'::role, '{role_id}'::uuid)
    """), {
        "project_id": project_id,
        "user_id": member_data.user_id
    })
    await db.commit()
    
    # Send notification to the added user
    await NotificationService.notify_user_added_to_project(
        db=db,
        project_id=uuid.UUID(project_id),
        user_id=uuid.UUID(member_data.user_id),
        added_by_user_id=current_user.id,
        role=role.value
    )
    
    return {"message": "Member added successfully"}

@router.put("/projects/{project_id}/members/{user_id}")
async def update_project_member_role(
    project_id: str,
    user_id: str,
    member_data: ProjectMemberRoleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Update a member's role."""
    project, user_role = await check_project_access(db, project_id, current_user, RoleEnum.OWNER)
    
    # Validate role - accept both lowercase and uppercase inputs
    try:
        # Try the role as-is first
        role = RoleEnum(member_data.role)
    except ValueError:
        try:
            # Try uppercase version
            role = RoleEnum(member_data.role.upper())
        except ValueError as e:
            raise HTTPException(status_code=400, detail="Invalid role")
    
    # Find membership
    result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == uuid.UUID(project_id),
            ProjectMember.user_id == uuid.UUID(user_id)
        )
    )
    membership = result.scalar_one_or_none()
    
    if not membership:
        raise HTTPException(status_code=404, detail="Membership not found")
    
    # Update role using raw SQL to handle enum casting
    from sqlalchemy import text
    
    # Map role values to database enum values and role IDs
    role_mapping = {
        "OWNER": ("OWNER", "00000000-0000-0000-0000-000000000001"),
        "MEMBER": ("member", "00000000-0000-0000-0000-000000000002"), 
        "WATCHER": ("watcher", "00000000-0000-0000-0000-000000000003")
    }
    
    db_role, role_id = role_mapping.get(role.value, (role.value, "00000000-0000-0000-0000-000000000002"))
    
    await db.execute(text(f"""
        UPDATE project_member 
        SET role = '{db_role}'::role, role_id = '{role_id}'::uuid
        WHERE project_id = :project_id AND user_id = :user_id
    """), {
        "project_id": project_id,
        "user_id": user_id
    })
    await db.commit()
    
    return {"message": "Member role updated successfully"}

@router.delete("/projects/{project_id}/members/{user_id}")
async def remove_project_member(
    project_id: str,
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Remove a member from a project."""
    project, user_role = await check_project_access(db, project_id, current_user, RoleEnum.OWNER)
    
    # Can't remove the owner
    if str(project.owner_id) == user_id:
        raise HTTPException(status_code=400, detail="Cannot remove project owner")
    
    # Find membership
    result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == uuid.UUID(project_id),
            ProjectMember.user_id == uuid.UUID(user_id)
        )
    )
    membership = result.scalar_one_or_none()
    
    if not membership:
        raise HTTPException(status_code=404, detail="Membership not found")
    
    # Get user info for history log
    user_result = await db.execute(select(AppUser).where(AppUser.id == uuid.UUID(user_id)))
    removed_user = user_result.scalar_one_or_none()
    
    # Remove membership
    await db.delete(membership)
    await db.commit()
    
    # Create history log
    from app.api.v1.endpoints.projects import create_history_log
    await create_history_log(
        db=db,
        project_id=uuid.UUID(project_id),
        user_id=current_user.id if current_user else None,
        action_type="member_removed",
        description=f"Member {removed_user.email if removed_user else 'Unknown'} removed from project",
        metadata={
            "user_id": user_id,
            "user_email": removed_user.email if removed_user else None
        }
    )
    
    # Send notification to the removed user
    await NotificationService.notify_user_removed_from_project(
        db=db,
        project_id=uuid.UUID(project_id),
        user_id=uuid.UUID(user_id),
        removed_by_user_id=current_user.id
    )
    
    return {"message": "Member removed successfully"}

# Project Comments endpoints
@router.get("/projects/{project_id}/comments", response_model=List[ProjectCommentResponse])
async def get_project_comments(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Get all comments for a project."""
    project, user_role = await check_project_access_for_comments(db, project_id, current_user)
    
    # Get all top-level comments (no parent_id)
    result = await db.execute(
        select(ProjectComment, AppUser).join(AppUser).where(
            and_(
                ProjectComment.project_id == uuid.UUID(project_id),
                ProjectComment.parent_id.is_(None),
                ProjectComment.deleted_at.is_(None)
            )
        ).order_by(ProjectComment.created_at.desc())
    )
    
    comments = []
    for comment, user in result:
        # Get replies for this comment
        replies_result = await db.execute(
            select(ProjectComment, AppUser).join(AppUser).where(
                and_(
                    ProjectComment.parent_id == comment.id,
                    ProjectComment.deleted_at.is_(None)
                )
            ).order_by(ProjectComment.created_at.asc())
        )
        
        replies = []
        for reply, reply_user in replies_result:
            replies.append(ProjectCommentResponse(
                id=str(reply.id),
                user_id=str(reply_user.id),
                user_email=reply_user.email,
                user_is_guest=reply_user.is_guest,
                parent_id=str(reply.parent_id) if reply.parent_id else None,
                content=reply.content,
                created_at=reply.created_at.isoformat(),
                updated_at=reply.updated_at.isoformat(),
                replies=[]
            ))
        
        comments.append(ProjectCommentResponse(
            id=str(comment.id),
            user_id=str(user.id),
            user_email=user.email,
            user_is_guest=user.is_guest,
            parent_id=str(comment.parent_id) if comment.parent_id else None,
            content=comment.content,
            created_at=comment.created_at.isoformat(),
            updated_at=comment.updated_at.isoformat(),
            replies=replies
        ))
    
    return comments

@router.post("/projects/{project_id}/comments")
async def create_project_comment(
    project_id: str,
    comment_data: ProjectCommentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Create a new comment on a project."""
    project, user_role = await check_project_access_for_comments(db, project_id, current_user)
    
    # If replying to a comment, verify parent exists
    if comment_data.parent_id:
        result = await db.execute(
            select(ProjectComment).where(
                and_(
                    ProjectComment.id == uuid.UUID(comment_data.parent_id),
                    ProjectComment.project_id == uuid.UUID(project_id),
                    ProjectComment.deleted_at.is_(None)
                )
            )
        )
        parent_comment = result.scalar_one_or_none()
        
        if not parent_comment:
            raise HTTPException(status_code=404, detail="Parent comment not found")
    
    # Create comment
    comment = ProjectComment(
        project_id=uuid.UUID(project_id),
        user_id=current_user.id,
        parent_id=uuid.UUID(comment_data.parent_id) if comment_data.parent_id else None,
        content=comment_data.content
    )
    
    db.add(comment)
    await db.commit()
    await db.refresh(comment)
    
    # Send notification to project members about new comment
    await NotificationService.notify_comment_added(
        db=db,
        project_id=uuid.UUID(project_id),
        commenter_user_id=current_user.id,
        comment_content=comment_data.content
    )
    
    return {"message": "Comment created successfully", "comment_id": str(comment.id)}

@router.put("/projects/{project_id}/comments/{comment_id}")
async def update_project_comment(
    project_id: str,
    comment_id: str,
    comment_data: ProjectCommentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Update a comment."""
    project, user_role = await check_project_access_for_comments(db, project_id, current_user)
    
    # Find comment
    result = await db.execute(
        select(ProjectComment).where(
            and_(
                ProjectComment.id == uuid.UUID(comment_id),
                ProjectComment.project_id == uuid.UUID(project_id),
                ProjectComment.deleted_at.is_(None)
            )
        )
    )
    comment = result.scalar_one_or_none()
    
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    
    # Check permissions (owner or comment author)
    if comment.user_id != current_user.id and user_role != RoleEnum.OWNER:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    # Update comment
    comment.content = comment_data.content
    await db.commit()
    
    return {"message": "Comment updated successfully"}

@router.delete("/projects/{project_id}/comments/{comment_id}")
async def delete_project_comment(
    project_id: str,
    comment_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Delete a comment."""
    project, user_role = await check_project_access_for_comments(db, project_id, current_user)
    
    # Find comment
    result = await db.execute(
        select(ProjectComment).where(
            and_(
                ProjectComment.id == uuid.UUID(comment_id),
                ProjectComment.project_id == uuid.UUID(project_id),
                ProjectComment.deleted_at.is_(None)
            )
        )
    )
    comment = result.scalar_one_or_none()
    
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    
    # Check permissions (owner or comment author)
    if comment.user_id != current_user.id and user_role != RoleEnum.OWNER:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    # Soft delete comment
    comment.deleted_at = func.now()
    await db.commit()
    
    return {"message": "Comment deleted successfully"}
