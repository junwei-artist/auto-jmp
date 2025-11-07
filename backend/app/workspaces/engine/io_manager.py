import os
import json
from typing import Dict, Any, Optional
from pathlib import Path
from app.workspaces.engine.node_base import IOManager
from app.core.storage import LocalFileStorage
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.workspace import WorkflowArtifact
import uuid


class WorkflowIOManager(IOManager):
    """IOManager implementation for workflow artifacts"""
    
    def __init__(self, db: AsyncSession, storage: LocalFileStorage):
        self.db = db
        self.storage = storage
    
    async def get_workspace_path(self, workspace_id: str) -> str:
        """Get the file system path for a workspace"""
        workspace_dir = self.storage.base_path / "workspaces" / workspace_id
        workspace_dir.mkdir(parents=True, exist_ok=True)
        return str(workspace_dir)
    
    async def save_artifact(
        self,
        workspace_id: str,
        workflow_id: str,
        execution_id: str,
        node_id: str,
        kind: str,
        data: Any,
        filename: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> str:
        """Save an artifact and return storage key"""
        # Generate storage key
        storage_key = f"workspaces/{workspace_id}/{workflow_id}/{execution_id}/{node_id}/{filename}"
        
        # Convert data to bytes if needed
        if isinstance(data, str):
            content = data.encode('utf-8')
        elif isinstance(data, (dict, list)):
            content = json.dumps(data).encode('utf-8')
        elif isinstance(data, bytes):
            content = data
        else:
            content = str(data).encode('utf-8')
        
        # Save file
        file_path = self.storage.save_file(content, storage_key)
        
        # Create artifact record
        artifact = WorkflowArtifact(
            workspace_id=uuid.UUID(workspace_id),
            workflow_id=uuid.UUID(workflow_id) if workflow_id else None,
            execution_id=uuid.UUID(execution_id) if execution_id else None,
            node_id=uuid.UUID(node_id) if node_id else None,
            kind=kind,
            storage_key=storage_key,
            filename=filename,
            size_bytes=len(content),
            artifact_metadata=metadata
        )
        
        self.db.add(artifact)
        await self.db.commit()
        await self.db.refresh(artifact)
        
        return storage_key
    
    async def load_artifact(self, storage_key: str) -> Any:
        """Load an artifact by storage key"""
        # Load from storage
        file_path = self.storage.base_path / storage_key
        
        if not file_path.exists():
            raise FileNotFoundError(f"Artifact not found: {storage_key}")
        
        # Read file
        with open(file_path, 'rb') as f:
            content = f.read()
        
        # Try to parse as JSON if it looks like JSON
        try:
            return json.loads(content.decode('utf-8'))
        except (json.JSONDecodeError, UnicodeDecodeError):
            return content

