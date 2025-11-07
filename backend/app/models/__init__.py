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
    run_comments = relationship("RunComment")
    artifact_comments = relationship("ArtifactComment")
    uploaded_attachments = relationship("ProjectAttachment", back_populates="uploader")
    department = relationship("Department", back_populates="users")
    business_group = relationship("BusinessGroup", back_populates="users")
    notifications = relationship("Notification", back_populates="user")
    oauth_clients = relationship("OAuthClient", back_populates="owner")
    authorization_codes = relationship("AuthorizationCode", back_populates="user")

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
    attachments = relationship("ProjectAttachment", back_populates="project")
    drawing_folders = relationship("DrawingFolder", back_populates="project")
    comments = relationship("ProjectComment")
    history_logs = relationship("ProjectHistoryLog", back_populates="project", cascade="all, delete-orphan")

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

class ProjectHistoryLog(Base):
    __tablename__ = "project_history_log"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("project.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("app_user.id", ondelete="SET NULL"), nullable=True)
    action_type = Column(String, nullable=False)  # e.g., 'run_created', 'run_task_name_updated', 'member_added', 'member_removed', 'project_updated', etc.
    description = Column(Text, nullable=False)  # Human-readable description
    extra_data = Column(JSON, nullable=True)  # Additional data like old_value, new_value, run_id, etc.
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    project = relationship("Project", back_populates="history_logs")
    user = relationship("AppUser")

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
    comments = relationship("ArtifactComment", back_populates="artifact")

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
    comments = relationship("RunComment", back_populates="run")

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

class RunComment(Base):
    __tablename__ = "run_comment"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_id = Column(UUID(as_uuid=True), ForeignKey("run.id", ondelete="CASCADE"))
    user_id = Column(UUID(as_uuid=True), ForeignKey("app_user.id"))
    parent_id = Column(UUID(as_uuid=True), ForeignKey("run_comment.id"), nullable=True)  # For replies
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    deleted_at = Column(DateTime(timezone=True), nullable=True)  # Soft delete
    
    # Relationships
    run = relationship("Run", back_populates="comments")
    user = relationship("AppUser", back_populates="run_comments")
    parent = relationship("RunComment", remote_side=[id])
    replies = relationship("RunComment", back_populates="parent")

class ArtifactComment(Base):
    __tablename__ = "artifact_comment"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    artifact_id = Column(UUID(as_uuid=True), ForeignKey("artifact.id", ondelete="CASCADE"))
    user_id = Column(UUID(as_uuid=True), ForeignKey("app_user.id"))
    parent_id = Column(UUID(as_uuid=True), ForeignKey("artifact_comment.id"), nullable=True)  # For replies
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    deleted_at = Column(DateTime(timezone=True), nullable=True)  # Soft delete
    
    # Relationships
    artifact = relationship("Artifact", back_populates="comments")
    user = relationship("AppUser", back_populates="artifact_comments")
    parent = relationship("ArtifactComment", remote_side=[id])
    replies = relationship("ArtifactComment", back_populates="parent")

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
    PROJECT_ADDED = "PROJECT_ADDED"
    PROJECT_UPDATED = "PROJECT_UPDATED"
    PROJECT_DELETED = "PROJECT_DELETED"
    MEMBER_ADDED = "MEMBER_ADDED"
    MEMBER_REMOVED = "MEMBER_REMOVED"
    COMMENT_ADDED = "COMMENT_ADDED"
    ARTIFACT_COMMENT_ADDED = "ARTIFACT_COMMENT_ADDED"
    RUN_COMPLETED = "RUN_COMPLETED"
    RUN_FAILED = "RUN_FAILED"
    COMMUNITY_POST_CREATED = "COMMUNITY_POST_CREATED"
    COMMUNITY_POST_UPDATED = "COMMUNITY_POST_UPDATED"
    COMMUNITY_POST_LIKED = "COMMUNITY_POST_LIKED"
    COMMUNITY_POST_COMMENTED = "COMMUNITY_POST_COMMENTED"

class ProjectAttachment(Base):
    __tablename__ = "project_attachment"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("project.id", ondelete="CASCADE"))
    uploaded_by = Column(UUID(as_uuid=True), ForeignKey("app_user.id", ondelete="CASCADE"))
    filename = Column(String, nullable=False)
    description = Column(Text, nullable=False)  # Required description, defaults to filename
    storage_key = Column(String, nullable=False)
    file_size = Column(BigInteger, nullable=False)
    mime_type = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    project = relationship("Project", back_populates="attachments")
    uploader = relationship("AppUser", back_populates="uploaded_attachments")

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

class OAuthClient(Base):
    """OAuth2 client for external applications"""
    __tablename__ = "oauth_client"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    client_id = Column(String, unique=True, nullable=False)  # Public identifier
    client_secret_hash = Column(String, nullable=False)  # Hashed secret
    client_name = Column(String, nullable=False)  # Application name
    description = Column(Text, nullable=True)
    redirect_uris = Column(JSON)  # List of allowed redirect URIs
    owner_id = Column(UUID(as_uuid=True), ForeignKey("app_user.id", ondelete="CASCADE"))  # User who created it
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_used_at = Column(DateTime(timezone=True), nullable=True)
    
    # Relationships
    owner = relationship("AppUser", back_populates="oauth_clients")
    authorization_codes = relationship("AuthorizationCode", back_populates="client", cascade="all, delete")

class AuthorizationCode(Base):
    """OAuth2 authorization codes (short-lived)"""
    __tablename__ = "authorization_code"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code = Column(String, unique=True, nullable=False)  # Authorization code
    user_id = Column(UUID(as_uuid=True), ForeignKey("app_user.id", ondelete="CASCADE"))
    client_id = Column(UUID(as_uuid=True), ForeignKey("oauth_client.id", ondelete="CASCADE"))
    redirect_uri = Column(String, nullable=False)
    code_challenge = Column(String, nullable=True)  # For PKCE
    code_challenge_method = Column(String, nullable=True)  # 'plain' or 'S256'
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    used = Column(Boolean, default=False)  # One-time use only
    
    # Relationships
    user = relationship("AppUser", back_populates="authorization_codes")
    client = relationship("OAuthClient", back_populates="authorization_codes")

class CommunityPostType(str, enum.Enum):
    QUESTION = "question"
    TUTORIAL = "tutorial"
    MANUAL = "manual"
    SHARING = "sharing"
    TIP = "tip"
    OTHER = "other"

class CommunityZone(Base):
    __tablename__ = "community_zone"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    icon = Column(String(50), nullable=True)  # Icon name or emoji
    color = Column(String(20), nullable=True)  # Hex color code
    is_active = Column(Boolean, default=True, nullable=False)
    display_order = Column(BigInteger, default=0, nullable=False)
    created_by = Column(UUID(as_uuid=True), ForeignKey("app_user.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    creator = relationship("AppUser")
    posts = relationship("CommunityPost", back_populates="zone")

class CommunityPost(Base):
    __tablename__ = "community_post"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    author_id = Column(UUID(as_uuid=True), ForeignKey("app_user.id", ondelete="SET NULL"))
    zone_id = Column(UUID(as_uuid=True), ForeignKey("community_zone.id", ondelete="SET NULL"), nullable=True)
    title = Column(String, nullable=False)
    content = Column(Text, nullable=False)  # markdown or rich text JSON
    type = Column(SQLEnum(CommunityPostType), nullable=False, default=CommunityPostType.SHARING)
    tags = Column(JSON, nullable=True)  # optional list of tags
    views = Column(BigInteger, default=0)
    likes_count = Column(BigInteger, default=0, nullable=False)
    is_pinned = Column(Boolean, default=False)
    is_locked = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    deleted_at = Column(DateTime(timezone=True), nullable=True)
    
    # Relationships
    author = relationship("AppUser")
    zone = relationship("CommunityZone", back_populates="posts")
    likes = relationship("CommunityPostLike", back_populates="post", cascade="all, delete-orphan")
    attachments = relationship("CommunityAttachment", back_populates="post", cascade="all, delete-orphan")

class CommunityPostLike(Base):
    __tablename__ = "community_post_like"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    post_id = Column(UUID(as_uuid=True), ForeignKey("community_post.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    post = relationship("CommunityPost", back_populates="likes")
    user = relationship("AppUser")

class CommunityComment(Base):
    __tablename__ = "community_comment"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    post_id = Column(UUID(as_uuid=True), ForeignKey("community_post.id", ondelete="CASCADE"))
    user_id = Column(UUID(as_uuid=True), ForeignKey("app_user.id", ondelete="SET NULL"))
    parent_id = Column(UUID(as_uuid=True), ForeignKey("community_comment.id"), nullable=True)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    deleted_at = Column(DateTime(timezone=True), nullable=True)
    
    # Relationships
    post = relationship("CommunityPost")
    user = relationship("AppUser")

class CommunityAttachment(Base):
    __tablename__ = "community_attachment"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    post_id = Column(UUID(as_uuid=True), ForeignKey("community_post.id", ondelete="CASCADE"), nullable=True)
    comment_id = Column(UUID(as_uuid=True), ForeignKey("community_comment.id", ondelete="CASCADE"), nullable=True)
    uploaded_by = Column(UUID(as_uuid=True), ForeignKey("app_user.id", ondelete="SET NULL"))
    filename = Column(String, nullable=False)
    storage_key = Column(String, nullable=False)
    file_size = Column(BigInteger, nullable=False)
    mime_type = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    uploader = relationship("AppUser")
    post = relationship("CommunityPost", back_populates="attachments")

class DrawingFolder(Base):
    __tablename__ = "drawing_folder"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("project.id", ondelete="CASCADE"), nullable=False)
    created_by = Column(UUID(as_uuid=True), ForeignKey("app_user.id", ondelete="SET NULL"))
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    project = relationship("Project", back_populates="drawing_folders")
    creator = relationship("AppUser")
    images = relationship("DrawingImage", back_populates="folder", cascade="all, delete-orphan")

class DrawingImage(Base):
    __tablename__ = "drawing_image"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    folder_id = Column(UUID(as_uuid=True), ForeignKey("drawing_folder.id", ondelete="CASCADE"), nullable=False)
    uploaded_by = Column(UUID(as_uuid=True), ForeignKey("app_user.id", ondelete="SET NULL"))
    filename = Column(String, nullable=False)
    storage_key = Column(String, nullable=False)
    file_size = Column(BigInteger, nullable=False)
    mime_type = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    folder = relationship("DrawingFolder", back_populates="images")
    uploader = relationship("AppUser")
