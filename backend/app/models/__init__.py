from sqlalchemy import Column, String, Boolean, DateTime, Text, BigInteger, ForeignKey, Enum as SQLEnum, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
import enum
from app.core.database import Base

class Role(Base):
    __tablename__ = "project_role"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, unique=True, nullable=False)
    display_name = Column(String, nullable=False)
    description = Column(Text)
    permissions = Column(JSON)  # Store permissions as JSON
    is_system_role = Column(Boolean, default=False)  # System roles like OWNER
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    project_members = relationship("ProjectMember", back_populates="role_obj")

class RoleEnum(str, enum.Enum):
    OWNER = "OWNER"
    EDITOR = "EDITOR"
    VIEWER = "VIEWER"
    MEMBER = "member"  # Can initiate runs and edit
    WATCHER = "watcher"  # Can only view

class RunStatus(str, enum.Enum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELED = "canceled"

class AppUser(Base):
    __tablename__ = "app_user"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String, unique=True, nullable=True)
    password_hash = Column(String, nullable=True)  # null for guest users
    display_name = Column(String, nullable=True)  # User's display name
    department_id = Column(UUID(as_uuid=True), ForeignKey("department.id"), nullable=True)
    business_group_id = Column(UUID(as_uuid=True), ForeignKey("business_group.id"), nullable=True)
    is_admin = Column(Boolean, default=False)
    is_guest = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_login = Column(DateTime(timezone=True))
    
    # Relationships
    owned_projects = relationship("Project", back_populates="owner")
    project_memberships = relationship("ProjectMember", back_populates="user")
    runs = relationship("Run", back_populates="started_by_user")
    created_shares = relationship("ShareLink", back_populates="created_by_user")
    comments = relationship("ProjectComment")
    department = relationship("Department", back_populates="users")
    business_group = relationship("BusinessGroup", back_populates="users")
    notifications = relationship("Notification", back_populates="user")

class Project(Base):
    __tablename__ = "project"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    description = Column(Text)
    owner_id = Column(UUID(as_uuid=True), ForeignKey("app_user.id"), nullable=True)
    plugin_name = Column(String, nullable=True)  # Plugin used to create this project
    allow_guest = Column(Boolean, default=True)
    is_public = Column(Boolean, default=False)  # Public projects can be accessed via URL
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    deleted_at = Column(DateTime(timezone=True), nullable=True)  # Soft delete timestamp
    
    # Relationships
    owner = relationship("AppUser", back_populates="owned_projects")
    members = relationship("ProjectMember", back_populates="project")
    artifacts = relationship("Artifact", back_populates="project")
    runs = relationship("Run", back_populates="project")
    share_links = relationship("ShareLink", back_populates="project")
    comments = relationship("ProjectComment")

class ProjectMember(Base):
    __tablename__ = "project_member"
    
    project_id = Column(UUID(as_uuid=True), ForeignKey("project.id", ondelete="CASCADE"), primary_key=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("app_user.id", ondelete="CASCADE"), primary_key=True)
    role_id = Column(UUID(as_uuid=True), ForeignKey("project_role.id"), nullable=False)
    role = Column(String, nullable=False)  # Keep for backward compatibility
    
    # Relationships
    project = relationship("Project", back_populates="members")
    user = relationship("AppUser", back_populates="project_memberships")
    role_obj = relationship("Role", back_populates="project_members")

class Artifact(Base):
    __tablename__ = "artifact"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("project.id", ondelete="CASCADE"))
    run_id = Column(UUID(as_uuid=True), ForeignKey("run.id", ondelete="CASCADE"), nullable=True)
    kind = Column(String, nullable=False)  # 'input_csv', 'input_jsl', 'output_png', 'results_zip', 'log'
    storage_key = Column(String, nullable=False)
    filename = Column(String, nullable=False)
    size_bytes = Column(BigInteger)
    mime_type = Column(String)
    sha256 = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    project = relationship("Project", back_populates="artifacts")
    run = relationship("Run", back_populates="artifacts")

class Run(Base):
    __tablename__ = "run"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("project.id", ondelete="CASCADE"))
    started_by = Column(UUID(as_uuid=True), ForeignKey("app_user.id"))
    status = Column(SQLEnum(RunStatus), nullable=False, default=RunStatus.QUEUED)
    task_name = Column(String, default="jmp_boxplot")
    jmp_task_id = Column(String)  # external task reference
    message = Column(Text)
    image_count = Column(BigInteger, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    started_at = Column(DateTime(timezone=True))
    finished_at = Column(DateTime(timezone=True))
    deleted_at = Column(DateTime(timezone=True), nullable=True)  # Soft delete timestamp
    
    # Relationships
    project = relationship("Project", back_populates="runs")
    started_by_user = relationship("AppUser", back_populates="runs")
    artifacts = relationship("Artifact", back_populates="run")

class ShareLink(Base):
    __tablename__ = "share_link"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("project.id", ondelete="CASCADE"))
    created_by = Column(UUID(as_uuid=True), ForeignKey("app_user.id"))
    can_download = Column(Boolean, default=True)
    expires_at = Column(DateTime(timezone=True))
    token = Column(String, unique=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    project = relationship("Project", back_populates="share_links")
    created_by_user = relationship("AppUser", back_populates="created_shares")

class AuditLog(Base):
    __tablename__ = "audit_log"
    
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("app_user.id"), nullable=True)
    action = Column(String, nullable=False)
    target = Column(String)
    meta = Column(Text)  # JSON as text
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class AppSetting(Base):
    __tablename__ = "app_setting"
    
    k = Column(String, primary_key=True)
    v = Column(Text)  # JSON as text

class ProjectComment(Base):
    __tablename__ = "project_comment"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("project.id", ondelete="CASCADE"))
    user_id = Column(UUID(as_uuid=True), ForeignKey("app_user.id"))
    parent_id = Column(UUID(as_uuid=True), ForeignKey("project_comment.id"), nullable=True)  # For replies
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    deleted_at = Column(DateTime(timezone=True), nullable=True)  # Soft delete
    
    # Relationships
    project = relationship("Project", overlaps="comments")
    user = relationship("AppUser", overlaps="comments")
    parent = relationship("ProjectComment", remote_side=[id])
    replies = relationship("ProjectComment", back_populates="parent")

class Department(Base):
    __tablename__ = "department"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False, unique=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    users = relationship("AppUser", back_populates="department")

class BusinessGroup(Base):
    __tablename__ = "business_group"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False, unique=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    users = relationship("AppUser", back_populates="business_group")

class NotificationType(str, enum.Enum):
    PROJECT_ADDED = "project_added"
    PROJECT_UPDATED = "project_updated"
    PROJECT_DELETED = "project_deleted"
    MEMBER_ADDED = "member_added"
    MEMBER_REMOVED = "member_removed"
    COMMENT_ADDED = "comment_added"
    RUN_COMPLETED = "run_completed"
    RUN_FAILED = "run_failed"

class Notification(Base):
    __tablename__ = "notification"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("app_user.id", ondelete="CASCADE"))
    type = Column(SQLEnum(NotificationType), nullable=False)
    title = Column(String, nullable=False)
    message = Column(Text, nullable=False)
    project_id = Column(UUID(as_uuid=True), ForeignKey("project.id", ondelete="CASCADE"), nullable=True)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    user = relationship("AppUser", back_populates="notifications")
    project = relationship("Project")
