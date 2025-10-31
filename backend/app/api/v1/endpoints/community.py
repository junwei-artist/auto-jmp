from typing import List, Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, func
import sqlalchemy as sa

from app.core.database import get_db
from app.core.auth import get_current_user_optional
from app.models import AppUser, CommunityPost, CommunityComment, CommunityAttachment, CommunityPostType, NotificationType
from app.services.notification_service import NotificationService

router = APIRouter()


# --- Schemas (inline for now) ---
from pydantic import BaseModel, Field


class CommunityPostCreate(BaseModel):
    title: str = Field(..., min_length=3, max_length=200)
    content: str = Field(..., min_length=1)
    type: CommunityPostType
    tags: Optional[List[str]] = None


class CommunityPostResponse(BaseModel):
    id: str
    title: str
    content: str
    type: CommunityPostType
    tags: Optional[List[str]]
    author_id: Optional[str]
    author_display_name: Optional[str]
    views: int
    is_pinned: bool
    is_locked: bool
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


@router.get("/posts", response_model=List[CommunityPostResponse])
async def list_posts(
    q: Optional[str] = Query(None),
    type: Optional[CommunityPostType] = Query(None),
    tag: Optional[str] = Query(None),
    pinned_first: bool = Query(True),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    query = select(CommunityPost, AppUser).join(AppUser, CommunityPost.author_id == AppUser.id, isouter=True)

    filters = []
    if q:
        like = f"%{q}%"
        filters.append(or_(CommunityPost.title.ilike(like), CommunityPost.content.ilike(like)))
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

    return [
        CommunityPostResponse(
            id=str(post.id),
            title=post.title,
            content=post.content,
            type=post.type,
            tags=post.tags,
            author_id=str(author.id) if author else None,
            author_display_name=author.display_name if author else None,
            views=post.views or 0,
            is_pinned=bool(post.is_pinned),
            is_locked=bool(post.is_locked),
            created_at=post.created_at.isoformat() if post.created_at else "",
            updated_at=post.updated_at.isoformat() if post.updated_at else "",
        )
        for post, author in rows
    ]


@router.post("/posts", response_model=CommunityPostResponse)
async def create_post(
    data: CommunityPostCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required")

    post = CommunityPost(
        author_id=current_user.id,
        title=data.title,
        content=data.content,
        type=data.type,
        tags=data.tags or None,
    )
    db.add(post)
    await db.commit()
    await db.refresh(post)

    return CommunityPostResponse(
        id=str(post.id),
        title=post.title,
        content=post.content,
        type=post.type,
        tags=post.tags,
        author_id=str(current_user.id),
        author_display_name=current_user.display_name,
        views=post.views or 0,
        is_pinned=bool(post.is_pinned),
        is_locked=bool(post.is_locked),
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
    result = await db.execute(
        select(CommunityPost, AppUser).join(AppUser, CommunityPost.author_id == AppUser.id, isouter=True).where(CommunityPost.id == uuid.UUID(post_id))
    )
    row = result.one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Post not found")

    post, author = row

    if inc_views:
        await db.execute(
            sa.update(CommunityPost).where(CommunityPost.id == post.id).values(views=(post.views or 0) + 1)
        )
        await db.commit()

    return CommunityPostResponse(
        id=str(post.id),
        title=post.title,
        content=post.content,
        type=post.type,
        tags=post.tags,
        author_id=str(author.id) if author else None,
        author_display_name=author.display_name if author else None,
        views=(post.views or 0) + (1 if inc_views else 0),
        is_pinned=bool(post.is_pinned),
        is_locked=bool(post.is_locked),
        created_at=post.created_at.isoformat() if post.created_at else "",
        updated_at=post.updated_at.isoformat() if post.updated_at else "",
    )


@router.get("/posts/{post_id}/comments", response_model=List[CommunityCommentResponse])
async def list_post_comments(
    post_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
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
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required")

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
        await NotificationService.create_notification(
            db=db,
            user_id=post.author_id,
            notification_type=NotificationType.COMMENT_ADDED,
            title="New comment on your post",
            message=f"{current_user.display_name or 'Someone'} commented: {data.content[:140]}"
        )

    # Notify parent comment author on reply (excluding self)
    if parent and parent.user_id and parent.user_id not in [current_user.id, post.author_id]:
        await NotificationService.create_notification(
            db=db,
            user_id=parent.user_id,
            notification_type=NotificationType.COMMENT_ADDED,
            title="New reply to your comment",
            message=f"{current_user.display_name or 'Someone'} replied: {data.content[:140]}"
        )

    return {"message": "Comment created", "comment_id": str(comment.id)}


