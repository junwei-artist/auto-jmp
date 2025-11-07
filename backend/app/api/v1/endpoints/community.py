from typing import List, Optional
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, File, UploadFile, Form
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, func
import sqlalchemy as sa

from app.core.database import get_db
from app.core.auth import get_current_user, get_current_user_optional
from app.models import (
    AppUser, CommunityPost, CommunityComment, CommunityAttachment, 
    CommunityPostType, NotificationType, CommunityZone, CommunityPostLike
)
from app.services.notification_service import NotificationService
from app.core.storage import local_storage

router = APIRouter()


# --- Schemas ---
from pydantic import BaseModel, Field


class CommunityZoneCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    display_order: int = 0


class CommunityZoneUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    is_active: Optional[bool] = None
    display_order: Optional[int] = None


class CommunityZoneResponse(BaseModel):
    id: str
    name: str
    description: Optional[str]
    icon: Optional[str]
    color: Optional[str]
    is_active: bool
    display_order: int
    post_count: int = 0
    created_at: str
    updated_at: str


class CommunityPostCreate(BaseModel):
    title: str = Field(..., min_length=3, max_length=200)
    content: str = Field(..., min_length=1)
    type: CommunityPostType
    zone_id: Optional[str] = None
    tags: Optional[List[str]] = None


class CommunityPostUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=3, max_length=200)
    content: Optional[str] = Field(None, min_length=1)
    type: Optional[CommunityPostType] = None
    zone_id: Optional[str] = None
    tags: Optional[List[str]] = None


class CommunityPostResponse(BaseModel):
    id: str
    title: str
    content: str
    type: CommunityPostType
    zone_id: Optional[str]
    zone_name: Optional[str]
    tags: Optional[List[str]]
    author_id: Optional[str]
    author_display_name: Optional[str]
    views: int
    likes_count: int
    is_liked: bool = False
    is_pinned: bool
    is_locked: bool
    attachments: List[dict] = []
    created_at: str
    updated_at: str


class CommunityCommentCreate(BaseModel):
    content: str = Field(..., min_length=1)
    parent_id: Optional[str] = None


class CommunityCommentResponse(BaseModel):
    id: str
    user_id: Optional[str]
    user_display_name: Optional[str]
    parent_id: Optional[str]
    content: str
    created_at: str
    updated_at: str
    replies: List["CommunityCommentResponse"] = []


CommunityCommentResponse.model_rebuild()


# --- Zone Endpoints (Admin Only) ---

@router.get("/zones", response_model=List[CommunityZoneResponse])
async def list_zones(
    active_only: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """List all community zones."""
    query = select(CommunityZone)
    
    if active_only:
        query = query.where(CommunityZone.is_active == True)
    
    query = query.order_by(CommunityZone.display_order, CommunityZone.created_at)
    
    result = await db.execute(query)
    zones = result.scalars().all()
    
    zone_responses = []
    for zone in zones:
        # Get post count
        post_count_result = await db.execute(
            select(func.count(CommunityPost.id)).where(
                and_(
                    CommunityPost.zone_id == zone.id,
                    CommunityPost.deleted_at.is_(None)
                )
            )
        )
        post_count = post_count_result.scalar() or 0
        
        zone_responses.append(CommunityZoneResponse(
            id=str(zone.id),
            name=zone.name,
            description=zone.description,
            icon=zone.icon,
            color=zone.color,
            is_active=zone.is_active,
            display_order=zone.display_order,
            post_count=post_count,
            created_at=zone.created_at.isoformat() if zone.created_at else "",
            updated_at=zone.updated_at.isoformat() if zone.updated_at else "",
        ))
    
    return zone_responses


async def require_admin(current_user: AppUser = Depends(get_current_user)):
    """Require admin access."""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user

@router.post("/zones", response_model=CommunityZoneResponse)
async def create_zone(
    data: CommunityZoneCreate,
    db: AsyncSession = Depends(get_db),
    admin_user: AppUser = Depends(require_admin)
):
    """Create a new community zone (admin only)."""
    zone = CommunityZone(
        name=data.name,
        description=data.description,
        icon=data.icon,
        color=data.color,
        display_order=data.display_order,
        created_by=admin_user.id,
    )
    db.add(zone)
    await db.commit()
    await db.refresh(zone)
    
    return CommunityZoneResponse(
        id=str(zone.id),
        name=zone.name,
        description=zone.description,
        icon=zone.icon,
        color=zone.color,
        is_active=zone.is_active,
        display_order=zone.display_order,
        post_count=0,
        created_at=zone.created_at.isoformat() if zone.created_at else "",
        updated_at=zone.updated_at.isoformat() if zone.updated_at else "",
    )


@router.patch("/zones/{zone_id}", response_model=CommunityZoneResponse)
async def update_zone(
    zone_id: str,
    data: CommunityZoneUpdate,
    db: AsyncSession = Depends(get_db),
    admin_user: AppUser = Depends(require_admin)
):
    """Update a community zone (admin only)."""
    result = await db.execute(select(CommunityZone).where(CommunityZone.id == uuid.UUID(zone_id)))
    zone = result.scalar_one_or_none()
    
    if not zone:
        raise HTTPException(status_code=404, detail="Zone not found")
    
    if data.name is not None:
        zone.name = data.name
    if data.description is not None:
        zone.description = data.description
    if data.icon is not None:
        zone.icon = data.icon
    if data.color is not None:
        zone.color = data.color
    if data.is_active is not None:
        zone.is_active = data.is_active
    if data.display_order is not None:
        zone.display_order = data.display_order
    
    await db.commit()
    await db.refresh(zone)
    
    # Get post count
    post_count_result = await db.execute(
        select(func.count(CommunityPost.id)).where(
            and_(
                CommunityPost.zone_id == zone.id,
                CommunityPost.deleted_at.is_(None)
            )
        )
    )
    post_count = post_count_result.scalar() or 0
    
    return CommunityZoneResponse(
        id=str(zone.id),
        name=zone.name,
        description=zone.description,
        icon=zone.icon,
        color=zone.color,
        is_active=zone.is_active,
        display_order=zone.display_order,
        post_count=post_count,
        created_at=zone.created_at.isoformat() if zone.created_at else "",
        updated_at=zone.updated_at.isoformat() if zone.updated_at else "",
    )


@router.delete("/zones/{zone_id}")
async def delete_zone(
    zone_id: str,
    db: AsyncSession = Depends(get_db),
    admin_user: AppUser = Depends(require_admin)
):
    """Delete a community zone (admin only)."""
    result = await db.execute(select(CommunityZone).where(CommunityZone.id == uuid.UUID(zone_id)))
    zone = result.scalar_one_or_none()
    
    if not zone:
        raise HTTPException(status_code=404, detail="Zone not found")
    
    await db.delete(zone)
    await db.commit()
    
    return {"message": "Zone deleted successfully"}


# --- Post Endpoints ---

@router.get("/posts", response_model=List[CommunityPostResponse])
async def list_posts(
    q: Optional[str] = Query(None),
    zone_id: Optional[str] = Query(None),
    type: Optional[CommunityPostType] = Query(None),
    tag: Optional[str] = Query(None),
    pinned_first: bool = Query(True),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """List community posts."""
    query = select(CommunityPost, AppUser, CommunityZone).join(
        AppUser, CommunityPost.author_id == AppUser.id, isouter=True
    ).join(
        CommunityZone, CommunityPost.zone_id == CommunityZone.id, isouter=True
    ).where(CommunityPost.deleted_at.is_(None))
    
    filters = []
    if q:
        like = f"%{q}%"
        filters.append(or_(CommunityPost.title.ilike(like), CommunityPost.content.ilike(like)))
    if zone_id:
        filters.append(CommunityPost.zone_id == uuid.UUID(zone_id))
    if type:
        filters.append(CommunityPost.type == type)
    if tag:
        filters.append(func.coalesce(CommunityPost.tags, []).contains([tag]))
    
    if filters:
        query = query.where(and_(*filters))
    
    if pinned_first:
        query = query.order_by(CommunityPost.is_pinned.desc(), CommunityPost.created_at.desc())
    else:
        query = query.order_by(CommunityPost.created_at.desc())
    
    query = query.limit(limit).offset(offset)
    
    result = await db.execute(query)
    rows = result.all()
    
    # Get user likes if authenticated
    user_liked_post_ids = set()
    if current_user:
        liked_result = await db.execute(
            select(CommunityPostLike.post_id).where(CommunityPostLike.user_id == current_user.id)
        )
        user_liked_post_ids = {str(post_id) for post_id in liked_result.scalars().all()}
    
    # Get attachments for posts
    post_ids = [str(post.id) for post, _, _ in rows]
    attachments_result = await db.execute(
        select(CommunityAttachment).where(CommunityAttachment.post_id.in_([uuid.UUID(pid) for pid in post_ids]))
    )
    attachments_by_post = {}
    for att in attachments_result.scalars().all():
        if str(att.post_id) not in attachments_by_post:
            attachments_by_post[str(att.post_id)] = []
        attachments_by_post[str(att.post_id)].append({
            "id": str(att.id),
            "filename": att.filename,
            "mime_type": att.mime_type,
            "file_size": att.file_size,
        })
    
    return [
        CommunityPostResponse(
            id=str(post.id),
            title=post.title,
            content=post.content,
            type=post.type,
            zone_id=str(post.zone_id) if post.zone_id else None,
            zone_name=zone.name if zone else None,
            tags=post.tags,
            author_id=str(author.id) if author else None,
            author_display_name=author.display_name if author else None,
            views=post.views or 0,
            likes_count=post.likes_count or 0,
            is_liked=str(post.id) in user_liked_post_ids,
            is_pinned=bool(post.is_pinned),
            is_locked=bool(post.is_locked),
            attachments=attachments_by_post.get(str(post.id), []),
            created_at=post.created_at.isoformat() if post.created_at else "",
            updated_at=post.updated_at.isoformat() if post.updated_at else "",
        )
        for post, author, zone in rows
    ]


@router.post("/posts", response_model=CommunityPostResponse)
async def create_post(
    data: CommunityPostCreate,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user)
):
    """Create a new community post."""
    zone_id = None
    if data.zone_id:
        zone_result = await db.execute(select(CommunityZone).where(CommunityZone.id == uuid.UUID(data.zone_id)))
        zone = zone_result.scalar_one_or_none()
        if not zone:
            raise HTTPException(status_code=404, detail="Zone not found")
        if not zone.is_active:
            raise HTTPException(status_code=400, detail="Zone is not active")
        zone_id = zone.id
    
    post = CommunityPost(
        author_id=current_user.id,
        zone_id=zone_id,
        title=data.title,
        content=data.content,
        type=data.type,
        tags=data.tags or None,
    )
    db.add(post)
    await db.commit()
    await db.refresh(post)
    
    # Get zone info
    zone = None
    if post.zone_id:
        zone_result = await db.execute(select(CommunityZone).where(CommunityZone.id == post.zone_id))
        zone = zone_result.scalar_one_or_none()
    
    # Notify zone followers (if implemented) or all users about new post
    # For now, we'll just notify admins
    # Note: Only notify if the enum values exist in the database
    try:
        admin_result = await db.execute(select(AppUser).where(AppUser.is_admin == True))
        admins = admin_result.scalars().all()
        for admin in admins:
            if admin.id != current_user.id:
                await NotificationService.create_notification(
                    db=db,
                    user_id=admin.id,
                    notification_type=NotificationType.COMMUNITY_POST_CREATED,
                    title=f"New post in {zone.name if zone else 'Community'}",
                    message=f"{current_user.display_name or 'Someone'} posted: {data.title[:100]}"
                )
    except Exception as e:
        # If notification creation fails (e.g., enum value doesn't exist), log but don't fail the post creation
        import logging
        logger = logging.getLogger(__name__)
        logger.warning(f"Failed to create notification for new post: {e}")
    
    return CommunityPostResponse(
        id=str(post.id),
        title=post.title,
        content=post.content,
        type=post.type,
        zone_id=str(post.zone_id) if post.zone_id else None,
        zone_name=zone.name if zone else None,
        tags=post.tags,
        author_id=str(current_user.id),
        author_display_name=current_user.display_name,
        views=post.views or 0,
        likes_count=post.likes_count or 0,
        is_liked=False,
        is_pinned=bool(post.is_pinned),
        is_locked=bool(post.is_locked),
        attachments=[],
        created_at=post.created_at.isoformat() if post.created_at else "",
        updated_at=post.updated_at.isoformat() if post.updated_at else "",
    )


@router.get("/posts/{post_id}", response_model=CommunityPostResponse)
async def get_post(
    post_id: str,
    inc_views: bool = Query(True),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Get a single community post."""
    result = await db.execute(
        select(CommunityPost, AppUser, CommunityZone)
        .join(AppUser, CommunityPost.author_id == AppUser.id, isouter=True)
        .join(CommunityZone, CommunityPost.zone_id == CommunityZone.id, isouter=True)
        .where(and_(CommunityPost.id == uuid.UUID(post_id), CommunityPost.deleted_at.is_(None)))
    )
    row = result.one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Post not found")
    
    post, author, zone = row
    
    if inc_views:
        await db.execute(
            sa.update(CommunityPost).where(CommunityPost.id == post.id).values(views=(post.views or 0) + 1)
        )
        await db.commit()
    
    # Check if user liked this post
    is_liked = False
    if current_user:
        like_result = await db.execute(
            select(CommunityPostLike).where(
                and_(
                    CommunityPostLike.post_id == post.id,
                    CommunityPostLike.user_id == current_user.id
                )
            )
        )
        is_liked = like_result.scalar_one_or_none() is not None
    
    # Get attachments
    attachments_result = await db.execute(
        select(CommunityAttachment).where(CommunityAttachment.post_id == post.id)
    )
    attachments = [
        {
            "id": str(att.id),
            "filename": att.filename,
            "mime_type": att.mime_type,
            "file_size": att.file_size,
        }
        for att in attachments_result.scalars().all()
    ]
    
    return CommunityPostResponse(
        id=str(post.id),
        title=post.title,
        content=post.content,
        type=post.type,
        zone_id=str(post.zone_id) if post.zone_id else None,
        zone_name=zone.name if zone else None,
        tags=post.tags,
        author_id=str(author.id) if author else None,
        author_display_name=author.display_name if author else None,
        views=(post.views or 0) + (1 if inc_views else 0),
        likes_count=post.likes_count or 0,
        is_liked=is_liked,
        is_pinned=bool(post.is_pinned),
        is_locked=bool(post.is_locked),
        attachments=attachments,
        created_at=post.created_at.isoformat() if post.created_at else "",
        updated_at=post.updated_at.isoformat() if post.updated_at else "",
    )


@router.patch("/posts/{post_id}", response_model=CommunityPostResponse)
async def update_post(
    post_id: str,
    data: CommunityPostUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user)
):
    """Update a community post (author or admin only)."""
    result = await db.execute(
        select(CommunityPost).where(
            and_(CommunityPost.id == uuid.UUID(post_id), CommunityPost.deleted_at.is_(None))
        )
    )
    post = result.scalar_one_or_none()
    
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    # Check permissions
    if post.author_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="You can only edit your own posts")
    
    # Update fields
    if data.title is not None:
        post.title = data.title
    if data.content is not None:
        post.content = data.content
    if data.type is not None:
        post.type = data.type
    if data.tags is not None:
        post.tags = data.tags
    if data.zone_id is not None:
        if data.zone_id:
            zone_result = await db.execute(select(CommunityZone).where(CommunityZone.id == uuid.UUID(data.zone_id)))
            zone = zone_result.scalar_one_or_none()
            if not zone:
                raise HTTPException(status_code=404, detail="Zone not found")
            post.zone_id = zone.id
        else:
            post.zone_id = None
    
    await db.commit()
    await db.refresh(post)
    
    # Get author and zone
    author_result = await db.execute(select(AppUser).where(AppUser.id == post.author_id))
    author = author_result.scalar_one_or_none()
    
    zone = None
    if post.zone_id:
        zone_result = await db.execute(select(CommunityZone).where(CommunityZone.id == post.zone_id))
        zone = zone_result.scalar_one_or_none()
    
    # Notify followers about update
    if post.author_id != current_user.id:
        try:
            await NotificationService.create_notification(
                db=db,
                user_id=post.author_id,
                notification_type=NotificationType.COMMUNITY_POST_UPDATED,
                title="Your post was updated",
                message=f"Your post '{post.title[:50]}' was updated by {current_user.display_name or 'an admin'}"
            )
        except Exception:
            # Ignore notification errors (e.g., enum value doesn't exist)
            pass
    
    # Get attachments
    attachments_result = await db.execute(
        select(CommunityAttachment).where(CommunityAttachment.post_id == post.id)
    )
    attachments = [
        {
            "id": str(att.id),
            "filename": att.filename,
            "mime_type": att.mime_type,
            "file_size": att.file_size,
        }
        for att in attachments_result.scalars().all()
    ]
    
    # Check if user liked
    like_result = await db.execute(
        select(CommunityPostLike).where(
            and_(
                CommunityPostLike.post_id == post.id,
                CommunityPostLike.user_id == current_user.id
            )
        )
    )
    is_liked = like_result.scalar_one_or_none() is not None
    
    return CommunityPostResponse(
        id=str(post.id),
        title=post.title,
        content=post.content,
        type=post.type,
        zone_id=str(post.zone_id) if post.zone_id else None,
        zone_name=zone.name if zone else None,
        tags=post.tags,
        author_id=str(author.id) if author else None,
        author_display_name=author.display_name if author else None,
        views=post.views or 0,
        likes_count=post.likes_count or 0,
        is_liked=is_liked,
        is_pinned=bool(post.is_pinned),
        is_locked=bool(post.is_locked),
        attachments=attachments,
        created_at=post.created_at.isoformat() if post.created_at else "",
        updated_at=post.updated_at.isoformat() if post.updated_at else "",
    )


@router.delete("/posts/{post_id}")
async def delete_post(
    post_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user)
):
    """Delete a community post (author or admin only)."""
    result = await db.execute(
        select(CommunityPost).where(
            and_(CommunityPost.id == uuid.UUID(post_id), CommunityPost.deleted_at.is_(None))
        )
    )
    post = result.scalar_one_or_none()
    
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    # Check permissions
    if post.author_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="You can only delete your own posts")
    
    # Soft delete
    post.deleted_at = datetime.utcnow()
    await db.commit()
    
    return {"message": "Post deleted successfully"}


@router.post("/posts/{post_id}/like")
async def toggle_post_like(
    post_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user)
):
    """Like or unlike a post."""
    result = await db.execute(
        select(CommunityPost).where(
            and_(CommunityPost.id == uuid.UUID(post_id), CommunityPost.deleted_at.is_(None))
        )
    )
    post = result.scalar_one_or_none()
    
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    # Check if already liked
    like_result = await db.execute(
        select(CommunityPostLike).where(
            and_(
                CommunityPostLike.post_id == post.id,
                CommunityPostLike.user_id == current_user.id
            )
        )
    )
    existing_like = like_result.scalar_one_or_none()
    
    if existing_like:
        # Unlike
        await db.delete(existing_like)
        post.likes_count = max(0, (post.likes_count or 0) - 1)
        await db.commit()
        return {"liked": False, "likes_count": post.likes_count}
    else:
        # Like
        like = CommunityPostLike(
            post_id=post.id,
            user_id=current_user.id
        )
        db.add(like)
        post.likes_count = (post.likes_count or 0) + 1
        await db.commit()
        
        # Notify post author (excluding self)
        if post.author_id and post.author_id != current_user.id:
            try:
                await NotificationService.create_notification(
                    db=db,
                    user_id=post.author_id,
                    notification_type=NotificationType.COMMUNITY_POST_LIKED,
                    title="Your post was liked",
                    message=f"{current_user.display_name or 'Someone'} liked your post: {post.title[:50]}"
                )
            except Exception:
                # Ignore notification errors (e.g., enum value doesn't exist)
                pass
        
        return {"liked": True, "likes_count": post.likes_count}


@router.post("/posts/{post_id}/attachments")
async def upload_post_attachment(
    post_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user)
):
    """Upload an attachment to a post."""
    result = await db.execute(
        select(CommunityPost).where(
            and_(CommunityPost.id == uuid.UUID(post_id), CommunityPost.deleted_at.is_(None))
        )
    )
    post = result.scalar_one_or_none()
    
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    # Check permissions
    if post.author_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="You can only add attachments to your own posts")
    
    # Validate file type (images only for now)
    if not file.content_type or not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="Only image files are allowed")
    
    # Read file content
    content = await file.read()
    
    # Check file size (10MB max)
    max_size = 10 * 1024 * 1024
    if len(content) > max_size:
        raise HTTPException(status_code=400, detail=f"File size exceeds limit of {max_size} bytes")
    
    # Generate storage key
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    file_id = str(uuid.uuid4())[:8]
    safe_filename = "".join(c for c in file.filename if c.isalnum() or c in (' ', '-', '_', '.')).rstrip()
    storage_key = f"community/posts/{post_id}/{timestamp}_{file_id}_{safe_filename}"
    
    # Save file
    local_storage.save_file(content, storage_key)
    
    # Create attachment record
    attachment = CommunityAttachment(
        post_id=post.id,
        uploaded_by=current_user.id,
        filename=file.filename,
        storage_key=storage_key,
        file_size=len(content),
        mime_type=file.content_type
    )
    db.add(attachment)
    await db.commit()
    await db.refresh(attachment)
    
    return {
        "id": str(attachment.id),
        "filename": attachment.filename,
        "mime_type": attachment.mime_type,
        "file_size": attachment.file_size,
    }


@router.delete("/posts/{post_id}/attachments/{attachment_id}")
async def delete_post_attachment(
    post_id: str,
    attachment_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user)
):
    """Delete an attachment from a post."""
    result = await db.execute(
        select(CommunityAttachment).where(
            and_(
                CommunityAttachment.id == uuid.UUID(attachment_id),
                CommunityAttachment.post_id == uuid.UUID(post_id)
            )
        )
    )
    attachment = result.scalar_one_or_none()
    
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    
    # Check permissions
    post_result = await db.execute(select(CommunityPost).where(CommunityPost.id == attachment.post_id))
    post = post_result.scalar_one_or_none()
    
    if not post or (post.author_id != current_user.id and not current_user.is_admin):
        raise HTTPException(status_code=403, detail="You can only delete attachments from your own posts")
    
    # Delete file
    local_storage.delete_file(attachment.storage_key)
    
    # Delete record
    await db.delete(attachment)
    await db.commit()
    
    return {"message": "Attachment deleted successfully"}


# --- Comment Endpoints ---

@router.get("/posts/{post_id}/comments", response_model=List[CommunityCommentResponse])
async def list_post_comments(
    post_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """List comments for a post."""
    # top-level comments
    result = await db.execute(
        select(CommunityComment, AppUser)
        .join(AppUser, CommunityComment.user_id == AppUser.id, isouter=True)
        .where(and_(CommunityComment.post_id == uuid.UUID(post_id), CommunityComment.parent_id.is_(None), CommunityComment.deleted_at.is_(None)))
        .order_by(CommunityComment.created_at.desc())
    )

    comments = []
    for comment, user in result.all():
        # replies
        replies_result = await db.execute(
            select(CommunityComment, AppUser)
            .join(AppUser, CommunityComment.user_id == AppUser.id, isouter=True)
            .where(and_(CommunityComment.parent_id == comment.id, CommunityComment.deleted_at.is_(None)))
            .order_by(CommunityComment.created_at.asc())
        )

        replies = []
        for reply, reply_user in replies_result.all():
            replies.append(CommunityCommentResponse(
                id=str(reply.id),
                user_id=str(reply_user.id) if reply_user else None,
                user_display_name=reply_user.display_name if reply_user else None,
                parent_id=str(reply.parent_id) if reply.parent_id else None,
                content=reply.content,
                created_at=reply.created_at.isoformat() if reply.created_at else "",
                updated_at=reply.updated_at.isoformat() if reply.updated_at else "",
                replies=[],
            ))

        comments.append(CommunityCommentResponse(
            id=str(comment.id),
            user_id=str(user.id) if user else None,
            user_display_name=user.display_name if user else None,
            parent_id=str(comment.parent_id) if comment.parent_id else None,
            content=comment.content,
            created_at=comment.created_at.isoformat() if comment.created_at else "",
            updated_at=comment.updated_at.isoformat() if comment.updated_at else "",
            replies=replies,
        ))

    return comments


@router.post("/posts/{post_id}/comments")
async def create_post_comment(
    post_id: str,
    data: CommunityCommentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user)
):
    """Create a comment on a post."""
    # ensure post exists
    post_result = await db.execute(select(CommunityPost).where(CommunityPost.id == uuid.UUID(post_id)))
    post = post_result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    parent = None
    if data.parent_id:
        pr = await db.execute(select(CommunityComment).where(and_(CommunityComment.id == uuid.UUID(data.parent_id), CommunityComment.post_id == post.id)))
        parent = pr.scalar_one_or_none()
        if not parent:
            raise HTTPException(status_code=404, detail="Parent comment not found")

    comment = CommunityComment(
        post_id=post.id,
        user_id=current_user.id,
        parent_id=uuid.UUID(data.parent_id) if data.parent_id else None,
        content=data.content,
    )
    db.add(comment)
    await db.commit()
    await db.refresh(comment)

    # Notify post author on new comment (excluding self)
    if post.author_id and post.author_id != current_user.id:
        try:
            await NotificationService.create_notification(
                db=db,
                user_id=post.author_id,
                notification_type=NotificationType.COMMUNITY_POST_COMMENTED,
                title="New comment on your post",
                message=f"{current_user.display_name or 'Someone'} commented: {data.content[:140]}"
            )
        except Exception:
            # Ignore notification errors (e.g., enum value doesn't exist)
            pass

    # Notify parent comment author on reply (excluding self)
    if parent and parent.user_id and parent.user_id not in [current_user.id, post.author_id]:
        try:
            await NotificationService.create_notification(
                db=db,
                user_id=parent.user_id,
                notification_type=NotificationType.COMMUNITY_POST_COMMENTED,
                title="New reply to your comment",
                message=f"{current_user.display_name or 'Someone'} replied: {data.content[:140]}"
            )
        except Exception:
            # Ignore notification errors (e.g., enum value doesn't exist)
            pass

    return {"message": "Comment created", "comment_id": str(comment.id)}


@router.patch("/posts/{post_id}/comments/{comment_id}")
async def update_post_comment(
    post_id: str,
    comment_id: str,
    data: CommunityCommentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user)
):
    """Update a comment (author only)."""
    result = await db.execute(
        select(CommunityComment).where(
            and_(
                CommunityComment.id == uuid.UUID(comment_id),
                CommunityComment.post_id == uuid.UUID(post_id),
                CommunityComment.deleted_at.is_(None)
            )
        )
    )
    comment = result.scalar_one_or_none()
    
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    
    if comment.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only edit your own comments")
    
    comment.content = data.content
    await db.commit()
    
    return {"message": "Comment updated"}


@router.get("/attachments/{attachment_id}/download")
async def download_attachment(
    attachment_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Download a community attachment."""
    result = await db.execute(
        select(CommunityAttachment).where(CommunityAttachment.id == uuid.UUID(attachment_id))
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


@router.delete("/posts/{post_id}/comments/{comment_id}")
async def delete_post_comment(
    post_id: str,
    comment_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user)
):
    """Delete a comment (author or admin only)."""
    result = await db.execute(
        select(CommunityComment).where(
            and_(
                CommunityComment.id == uuid.UUID(comment_id),
                CommunityComment.post_id == uuid.UUID(post_id),
                CommunityComment.deleted_at.is_(None)
            )
        )
    )
    comment = result.scalar_one_or_none()
    
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    
    if comment.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="You can only delete your own comments")
    
    # Soft delete
    comment.deleted_at = datetime.utcnow()
    await db.commit()
    
    return {"message": "Comment deleted"}
