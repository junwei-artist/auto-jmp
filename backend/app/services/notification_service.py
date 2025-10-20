from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
import uuid

from app.models import Notification, NotificationType, AppUser, Project, ProjectMember

class NotificationService:
    """Service for creating and managing notifications."""
    
    @staticmethod
    async def create_notification(
        db: AsyncSession,
        user_id: uuid.UUID,
        notification_type: NotificationType,
        title: str,
        message: str,
        project_id: Optional[uuid.UUID] = None
    ) -> Notification:
        """Create a new notification for a user."""
        notification = Notification(
            user_id=user_id,
            type=notification_type,
            title=title,
            message=message,
            project_id=project_id
        )
        
        db.add(notification)
        await db.commit()
        await db.refresh(notification)
        
        return notification
    
    @staticmethod
    async def notify_project_members(
        db: AsyncSession,
        project_id: uuid.UUID,
        notification_type: NotificationType,
        title: str,
        message: str,
        exclude_user_id: Optional[uuid.UUID] = None
    ) -> List[Notification]:
        """Send notification to all project members."""
        # Get all project members
        result = await db.execute(
            select(ProjectMember).where(ProjectMember.project_id == project_id)
        )
        members = result.scalars().all()
        
        notifications = []
        for member in members:
            if exclude_user_id and member.user_id == exclude_user_id:
                continue
                
            notification = await NotificationService.create_notification(
                db=db,
                user_id=member.user_id,
                notification_type=notification_type,
                title=title,
                message=message,
                project_id=project_id
            )
            notifications.append(notification)
        
        return notifications
    
    @staticmethod
    async def notify_project_owner(
        db: AsyncSession,
        project_id: uuid.UUID,
        notification_type: NotificationType,
        title: str,
        message: str
    ) -> Optional[Notification]:
        """Send notification to project owner."""
        # Get project owner
        result = await db.execute(
            select(Project).where(Project.id == project_id)
        )
        project = result.scalar_one_or_none()
        
        if not project:
            return None
        
        return await NotificationService.create_notification(
            db=db,
            user_id=project.owner_id,
            notification_type=notification_type,
            title=title,
            message=message,
            project_id=project_id
        )
    
    @staticmethod
    async def notify_user_added_to_project(
        db: AsyncSession,
        project_id: uuid.UUID,
        user_id: uuid.UUID,
        added_by_user_id: uuid.UUID,
        role: str
    ) -> Optional[Notification]:
        """Notify user they were added to a project."""
        # Get project details
        result = await db.execute(
            select(Project).where(Project.id == project_id)
        )
        project = result.scalar_one_or_none()
        
        if not project:
            return None
        
        # Get added by user details
        result = await db.execute(
            select(AppUser).where(AppUser.id == added_by_user_id)
        )
        added_by_user = result.scalar_one_or_none()
        
        added_by_name = added_by_user.display_name or added_by_user.email if added_by_user else "Unknown"
        
        return await NotificationService.create_notification(
            db=db,
            user_id=user_id,
            notification_type=NotificationType.MEMBER_ADDED,
            title=f"Added to project: {project.name}",
            message=f"You have been added to the project '{project.name}' as a {role} by {added_by_name}.",
            project_id=project_id
        )
    
    @staticmethod
    async def notify_user_removed_from_project(
        db: AsyncSession,
        project_id: uuid.UUID,
        user_id: uuid.UUID,
        removed_by_user_id: uuid.UUID
    ) -> Optional[Notification]:
        """Notify user they were removed from a project."""
        # Get project details
        result = await db.execute(
            select(Project).where(Project.id == project_id)
        )
        project = result.scalar_one_or_none()
        
        if not project:
            return None
        
        # Get removed by user details
        result = await db.execute(
            select(AppUser).where(AppUser.id == removed_by_user_id)
        )
        removed_by_user = result.scalar_one_or_none()
        
        removed_by_name = removed_by_user.display_name or removed_by_user.email if removed_by_user else "Unknown"
        
        return await NotificationService.create_notification(
            db=db,
            user_id=user_id,
            notification_type=NotificationType.MEMBER_REMOVED,
            title=f"Removed from project: {project.name}",
            message=f"You have been removed from the project '{project.name}' by {removed_by_name}.",
            project_id=project_id
        )
    
    @staticmethod
    async def notify_comment_added(
        db: AsyncSession,
        project_id: uuid.UUID,
        commenter_user_id: uuid.UUID,
        comment_content: str
    ) -> List[Notification]:
        """Notify project members about a new comment."""
        # Get project details
        result = await db.execute(
            select(Project).where(Project.id == project_id)
        )
        project = result.scalar_one_or_none()
        
        if not project:
            return []
        
        # Get commenter details
        result = await db.execute(
            select(AppUser).where(AppUser.id == commenter_user_id)
        )
        commenter_user = result.scalar_one_or_none()
        
        commenter_name = commenter_user.display_name or commenter_user.email if commenter_user else "Unknown"
        
        # Truncate comment content for notification
        truncated_content = comment_content[:100] + "..." if len(comment_content) > 100 else comment_content
        
        return await NotificationService.notify_project_members(
            db=db,
            project_id=project_id,
            notification_type=NotificationType.COMMENT_ADDED,
            title=f"New comment on {project.name}",
            message=f"{commenter_name} commented: \"{truncated_content}\"",
            exclude_user_id=commenter_user_id
        )
    
    @staticmethod
    async def notify_run_completed(
        db: AsyncSession,
        project_id: uuid.UUID,
        run_id: uuid.UUID,
        task_name: str,
        status: str
    ) -> List[Notification]:
        """Notify project members about run completion."""
        # Get project details
        result = await db.execute(
            select(Project).where(Project.id == project_id)
        )
        project = result.scalar_one_or_none()
        
        if not project:
            return []
        
        notification_type = NotificationType.RUN_COMPLETED if status == "succeeded" else NotificationType.RUN_FAILED
        
        return await NotificationService.notify_project_members(
            db=db,
            project_id=project_id,
            notification_type=notification_type,
            title=f"Run {'completed' if status == 'succeeded' else 'failed'}: {task_name}",
            message=f"Run '{task_name}' in project '{project.name}' has {'completed successfully' if status == 'succeeded' else 'failed'}.",
            exclude_user_id=None
        )
    
    @staticmethod
    async def notify_artifact_comment_added(
        db: AsyncSession,
        project_id: uuid.UUID,
        artifact_id: uuid.UUID,
        commenter_user_id: uuid.UUID,
        comment_content: str,
        artifact_filename: str
    ) -> List[Notification]:
        """Notify project members about a new artifact comment."""
        # Get project details
        result = await db.execute(
            select(Project).where(Project.id == project_id)
        )
        project = result.scalar_one_or_none()
        
        if not project:
            return []
        
        # Get commenter details
        result = await db.execute(
            select(AppUser).where(AppUser.id == commenter_user_id)
        )
        commenter_user = result.scalar_one_or_none()
        
        commenter_name = commenter_user.display_name or commenter_user.email if commenter_user else "Unknown"
        
        # Truncate comment content for notification
        truncated_content = comment_content[:100] + "..." if len(comment_content) > 100 else comment_content
        
        return await NotificationService.notify_project_members(
            db=db,
            project_id=project_id,
            notification_type=NotificationType.ARTIFACT_COMMENT_ADDED,
            title=f"New comment on artifact in {project.name}",
            message=f"{commenter_name} commented on '{artifact_filename}': \"{truncated_content}\"",
            exclude_user_id=commenter_user_id
        )