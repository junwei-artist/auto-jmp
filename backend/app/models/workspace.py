from sqlalchemy import Column, String, Boolean, DateTime, Text, BigInteger, ForeignKey, Enum as SQLEnum, JSON, Integer, Table
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
import enum
from app.core.database import Base


class WorkspaceAccessLevel(str, enum.Enum):
    OWNER = "owner"
    EDIT = "edit"
    VIEW = "view"


class Workspace(Base):
    """A workspace can contain multiple workflows (many-to-many)"""
    __tablename__ = "workspace"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    owner_id = Column(UUID(as_uuid=True), ForeignKey("app_user.id"), nullable=True)
    is_public = Column(Boolean, default=False)
    folder_path = Column(String, nullable=True)  # Path to workspace folder on filesystem
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    deleted_at = Column(DateTime(timezone=True), nullable=True)  # Soft delete
    
    # Relationships
    owner = relationship("AppUser", back_populates="workspaces")
    workflows = relationship("Workflow", secondary="workspace_workflow", back_populates="workspaces")
    artifacts = relationship("WorkflowArtifact", back_populates="workspace", cascade="all, delete-orphan")
    members = relationship("WorkspaceMember", back_populates="workspace", cascade="all, delete-orphan")


class WorkspaceMember(Base):
    """Workspace members with access levels"""
    __tablename__ = "workspace_member"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id = Column(UUID(as_uuid=True), ForeignKey("workspace.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False)
    access_level = Column(SQLEnum(WorkspaceAccessLevel), nullable=False, default=WorkspaceAccessLevel.VIEW)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    workspace = relationship("Workspace", back_populates="members")
    user = relationship("AppUser")
    
    # Unique constraint: one user can only have one membership per workspace
    __table_args__ = (
        {"comment": "Workspace members with access levels"}
    )


# Many-to-many relationship table between workspaces and workflows
workspace_workflow = Table(
    "workspace_workflow",
    Base.metadata,
    Column("workspace_id", UUID(as_uuid=True), ForeignKey("workspace.id", ondelete="CASCADE"), primary_key=True),
    Column("workflow_id", UUID(as_uuid=True), ForeignKey("workflow.id", ondelete="CASCADE"), primary_key=True),
    Column("created_at", DateTime(timezone=True), server_default=func.now()),
)


class WorkflowStatus(str, enum.Enum):
    DRAFT = "draft"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    PAUSED = "paused"


class Workflow(Base):
    """A workflow is a DAG of nodes - can be in multiple workspaces"""
    __tablename__ = "workflow"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    status = Column(SQLEnum(WorkflowStatus), nullable=False, default=WorkflowStatus.DRAFT)
    graph_data = Column(JSON, nullable=True)  # Store node positions, connections, etc.
    folder_path = Column(String, nullable=True)  # Path to workflow folder on filesystem
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    last_run_at = Column(DateTime(timezone=True), nullable=True)
    
    # Relationships
    workspaces = relationship("Workspace", secondary="workspace_workflow", back_populates="workflows")
    nodes = relationship("WorkflowNode", back_populates="workflow", cascade="all, delete-orphan", order_by="WorkflowNode.position_x")
    connections = relationship("WorkflowConnection", back_populates="workflow", cascade="all, delete-orphan")
    executions = relationship("WorkflowExecution", back_populates="workflow", cascade="all, delete-orphan")


class WorkflowNode(Base):
    """A node in a workflow"""
    __tablename__ = "workflow_node"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workflow_id = Column(UUID(as_uuid=True), ForeignKey("workflow.id", ondelete="CASCADE"), nullable=False)
    module_type = Column(String, nullable=False)  # e.g., "excel_loader", "duckdb_convert", "boxplot_stats"
    module_id = Column(String, nullable=False)  # Unique ID within the workflow
    # Note: checkpoint_name is stored in JSON only, not in database
    position_x = Column(Integer, default=0)
    position_y = Column(Integer, default=0)
    config = Column(JSON, nullable=True)  # Module-specific configuration
    state = Column(JSON, nullable=True)  # Runtime state (outputs, errors, etc.)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    workflow = relationship("Workflow", back_populates="nodes")
    input_connections = relationship("WorkflowConnection", foreign_keys="WorkflowConnection.target_node_id", back_populates="target_node", cascade="all, delete-orphan")
    output_connections = relationship("WorkflowConnection", foreign_keys="WorkflowConnection.source_node_id", back_populates="source_node", cascade="all, delete-orphan")


class WorkflowConnection(Base):
    """A connection between two nodes"""
    __tablename__ = "workflow_connection"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workflow_id = Column(UUID(as_uuid=True), ForeignKey("workflow.id", ondelete="CASCADE"), nullable=False)
    source_node_id = Column(UUID(as_uuid=True), ForeignKey("workflow_node.id", ondelete="CASCADE"), nullable=False)
    target_node_id = Column(UUID(as_uuid=True), ForeignKey("workflow_node.id", ondelete="CASCADE"), nullable=False)
    source_port = Column(String, nullable=False)  # Output port name
    target_port = Column(String, nullable=False)  # Input port name
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    workflow = relationship("Workflow", back_populates="connections")
    source_node = relationship("WorkflowNode", foreign_keys=[source_node_id], back_populates="output_connections")
    target_node = relationship("WorkflowNode", foreign_keys=[target_node_id], back_populates="input_connections")


class WorkflowExecutionStatus(str, enum.Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class WorkflowExecution(Base):
    """Execution history for a workflow"""
    __tablename__ = "workflow_execution"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workflow_id = Column(UUID(as_uuid=True), ForeignKey("workflow.id", ondelete="CASCADE"), nullable=False)
    started_by = Column(UUID(as_uuid=True), ForeignKey("app_user.id"), nullable=True)
    status = Column(SQLEnum(WorkflowExecutionStatus), nullable=False, default=WorkflowExecutionStatus.QUEUED)
    message = Column(Text, nullable=True)
    execution_data = Column(JSON, nullable=True)  # Store execution results, node outputs, etc.
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    started_at = Column(DateTime(timezone=True), nullable=True)
    finished_at = Column(DateTime(timezone=True), nullable=True)
    
    # Relationships
    workflow = relationship("Workflow", back_populates="executions")
    started_by_user = relationship("AppUser")


class WorkflowArtifact(Base):
    """Artifacts produced by workflows"""
    __tablename__ = "workflow_artifact"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id = Column(UUID(as_uuid=True), ForeignKey("workspace.id", ondelete="CASCADE"), nullable=False)
    workflow_id = Column(UUID(as_uuid=True), ForeignKey("workflow.id", ondelete="CASCADE"), nullable=True)
    execution_id = Column(UUID(as_uuid=True), ForeignKey("workflow_execution.id", ondelete="CASCADE"), nullable=True)
    node_id = Column(UUID(as_uuid=True), ForeignKey("workflow_node.id", ondelete="SET NULL"), nullable=True)
    kind = Column(String, nullable=False)  # 'duckdb', 'table', 'plot', 'statistics', etc.
    storage_key = Column(String, nullable=False)
    filename = Column(String, nullable=False)
    size_bytes = Column(BigInteger, nullable=True)
    mime_type = Column(String, nullable=True)
    artifact_metadata = Column(JSON, nullable=True)  # Additional metadata (column names, stats, etc.)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    workspace = relationship("Workspace", back_populates="artifacts")
    workflow = relationship("Workflow")
    execution = relationship("WorkflowExecution")
    node = relationship("WorkflowNode")

