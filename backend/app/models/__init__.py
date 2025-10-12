from sqlalchemy import Column, String, Boolean, DateTime, Text, BigInteger, ForeignKey, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
import enum
from app.core.database import Base

class Role(str, enum.Enum):
    OWNER = "owner"
    EDITOR = "editor"
    VIEWER = "viewer"

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
    is_admin = Column(Boolean, default=False)
    is_guest = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_login = Column(DateTime(timezone=True))
    
    # Relationships
    owned_projects = relationship("Project", back_populates="owner")
    project_memberships = relationship("ProjectMember", back_populates="user")
    runs = relationship("Run", back_populates="started_by_user")
    created_shares = relationship("ShareLink", back_populates="created_by_user")

class Project(Base):
    __tablename__ = "project"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    description = Column(Text)
    owner_id = Column(UUID(as_uuid=True), ForeignKey("app_user.id"), nullable=True)
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

class ProjectMember(Base):
    __tablename__ = "project_member"
    
    project_id = Column(UUID(as_uuid=True), ForeignKey("project.id", ondelete="CASCADE"), primary_key=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("app_user.id", ondelete="CASCADE"), primary_key=True)
    role = Column(SQLEnum(Role), nullable=False)
    
    # Relationships
    project = relationship("Project", back_populates="members")
    user = relationship("AppUser", back_populates="project_memberships")

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
