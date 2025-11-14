import os
import uuid
from datetime import datetime, timedelta
from typing import Optional
from fastapi import HTTPException
import shutil
from pathlib import Path
from app.core.config import settings

class LocalFileStorage:
    """Simple local file storage implementation."""
    
    def __init__(self, base_path: str = None):
        """Initialize storage root as an absolute path.

        Uses hardcoded UPLOADS_DIR from settings, or falls back to environment variable
        or relative path if not configured.
        """
        # Use hardcoded path from settings first, then env var, then default
        if settings.UPLOADS_DIR:
            configured_base = Path(settings.UPLOADS_DIR)
        else:
            env_base = os.getenv("UPLOADS_DIR")
            if env_base:
                configured_base = Path(env_base)
            else:
                configured_base = Path(base_path) if base_path else Path("uploads")

        # backend/ directory (this file is backend/app/core/storage.py)
        backend_dir = Path(__file__).resolve().parents[2]

        # Anchor relative paths to backend dir; keep absolute as-is
        absolute_base = configured_base if configured_base.is_absolute() else (backend_dir / configured_base)

        self.base_path = absolute_base.resolve()

        # Ensure directories exist
        self.base_path.mkdir(parents=True, exist_ok=True)
        (self.base_path / "projects").mkdir(parents=True, exist_ok=True)
        (self.base_path / "runs").mkdir(parents=True, exist_ok=True)
        (self.base_path / "temp").mkdir(parents=True, exist_ok=True)
        (self.base_path / "workspaces").mkdir(parents=True, exist_ok=True)
        (self.base_path / "workflows").mkdir(parents=True, exist_ok=True)
    
    def get_workspace_path(self, workspace_id: str) -> Path:
        """Get the workspace folder path"""
        return self.base_path / "workspaces" / workspace_id
    
    def get_workflow_path(self, workflow_id: str) -> Path:
        """Get the workflow folder path (top-level, not nested in workspace)"""
        return self.base_path / "workflows" / workflow_id
    
    def get_task_path(self, workflow_id: str, task_id: str) -> Path:
        """Get the task (execution) folder path"""
        return self.get_workflow_path(workflow_id) / "tasks" / task_id
    
    def get_node_path(self, workflow_id: str, task_id: str, node_id: str) -> Path:
        """Get the node folder path with input and output subfolders (for task execution)"""
        node_path = self.get_task_path(workflow_id, task_id) / "nodes" / node_id
        (node_path / "input").mkdir(parents=True, exist_ok=True)
        (node_path / "output").mkdir(parents=True, exist_ok=True)
        return node_path
    
    def get_workflow_node_path(self, workflow_id: str, node_id: str) -> Path:
        """Get the node folder path in workflow (not in task) with input, wip, and output subfolders"""
        node_path = self.get_workflow_path(workflow_id) / "nodes" / node_id
        (node_path / "input").mkdir(parents=True, exist_ok=True)
        (node_path / "wip").mkdir(parents=True, exist_ok=True)
        (node_path / "output").mkdir(parents=True, exist_ok=True)
        return node_path
    
    def ensure_workspace_structure(self, workspace_id: str):
        """Ensure the workspace folder structure exists"""
        workspace_path = self.get_workspace_path(workspace_id)
        workspace_path.mkdir(parents=True, exist_ok=True)
    
    def ensure_workflow_structure(self, workflow_id: str, task_id: str = None, node_id: str = None):
        """Ensure the workflow folder structure exists"""
        workflow_path = self.get_workflow_path(workflow_id)
        workflow_path.mkdir(parents=True, exist_ok=True)
        
        if task_id:
            task_path = self.get_task_path(workflow_id, task_id)
            task_path.mkdir(parents=True, exist_ok=True)
            
            if node_id:
                self.get_node_path(workflow_id, task_id, node_id)
    
    def ensure_workflow_node_structure(self, workflow_id: str, node_id: str):
        """Ensure the workflow node folder structure exists (input, wip, output)"""
        node_path = self.get_workflow_node_path(workflow_id, node_id)
        return node_path
    
    def generate_storage_key(self, filename: str, content_type: str, project_id: str = None) -> str:
        """Generate a unique storage key for a file."""
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        file_id = str(uuid.uuid4())[:8]
        file_extension = filename.split('.')[-1] if '.' in filename else ''
        
        if project_id:
            # For project attachments: projects/{project_id}/{filename}
            return f"projects/{project_id}/{timestamp}_{file_id}_{filename}"
        elif content_type == "text/csv":
            return f"runs/csv_{timestamp}_{file_id}.{file_extension}"
        else:
            return f"runs/jsl_{timestamp}_{file_id}.{file_extension}"
    
    def generate_project_attachment_key(self, project_id: str, filename: str) -> str:
        """Generate storage key specifically for project attachments."""
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        file_id = str(uuid.uuid4())[:8]
        
        # Clean filename for filesystem safety
        safe_filename = "".join(c for c in filename if c.isalnum() or c in (' ', '-', '_', '.')).rstrip()
        
        return f"projects/{project_id}/{timestamp}_{file_id}_{safe_filename}"
    
    def get_file_path(self, storage_key: str) -> Path:
        """Get the full file path for a storage key."""
        key_path = Path(storage_key)
        if key_path.is_absolute():
            return key_path
        return self.base_path / storage_key
    
    def get_file(self, storage_key: str) -> Optional[bytes]:
        """Get file content from storage."""
        file_path = self.get_file_path(storage_key)
        try:
            if file_path.exists():
                with open(file_path, 'rb') as f:
                    return f.read()
            return None
        except Exception:
            return None
    
    def save_file(self, file_content: bytes, storage_key: str) -> str:
        """Save file content to storage."""
        file_path = self.get_file_path(storage_key)
        file_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(file_path, 'wb') as f:
            f.write(file_content)
        
        return str(file_path)
    
    def get_file_url(self, storage_key: str) -> str:
        """Get a URL to access the file."""
        # For local development, return a simple file path
        return f"/uploads/{storage_key}"
    
    def delete_file(self, storage_key: str) -> bool:
        """Delete a file from storage."""
        file_path = self.get_file_path(storage_key)
        try:
            if file_path.exists():
                file_path.unlink()
                return True
            return False
        except Exception:
            return False
    
    def delete_project_folder(self, project_id: str) -> bool:
        """Delete entire project folder and all its contents."""
        project_path = self.base_path / "projects" / project_id
        try:
            if project_path.exists():
                shutil.rmtree(project_path)
                return True
            return False
        except Exception:
            return False
    
    def delete_workflow_node_folder(self, workflow_id: str, node_id: str) -> bool:
        """Delete entire workflow node folder and all its contents (input, wip, output)."""
        node_path = self.get_workflow_path(workflow_id) / "nodes" / node_id
        try:
            if node_path.exists():
                shutil.rmtree(node_path)
                return True
            return False
        except Exception as e:
            print(f"Error deleting node folder {node_path}: {str(e)}")
            return False
    
    def get_project_folder_size(self, project_id: str) -> int:
        """Get total size of all files in project folder."""
        project_path = self.base_path / "projects" / project_id
        total_size = 0
        try:
            if project_path.exists():
                for file_path in project_path.rglob('*'):
                    if file_path.is_file():
                        total_size += file_path.stat().st_size
        except Exception:
            pass
        return total_size
    
    def save_workflow_json(self, workflow_id: str, workflow_data: dict) -> Path:
        """Save workflow data as JSON file in the workflow folder."""
        import json
        workflow_path = self.get_workflow_path(workflow_id)
        workflow_path.mkdir(parents=True, exist_ok=True)
        
        json_file = workflow_path / "workflow.json"
        with open(json_file, 'w', encoding='utf-8') as f:
            json.dump(workflow_data, f, indent=2, ensure_ascii=False)
        
        return json_file
    
    def load_workflow_json(self, workflow_id: str) -> Optional[dict]:
        """Load workflow data from JSON file."""
        import json
        workflow_path = self.get_workflow_path(workflow_id)
        json_file = workflow_path / "workflow.json"
        
        try:
            if json_file.exists():
                with open(json_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
        except Exception:
            pass
        return None
    
    def save_node_config(self, workflow_id: str, node_id: str, config: dict) -> Path:
        """Save node config as JSON file in the node folder."""
        import json
        node_path = self.get_workflow_node_path(workflow_id, node_id)
        node_path.mkdir(parents=True, exist_ok=True)
        
        config_file = node_path / "config.json"
        with open(config_file, 'w', encoding='utf-8') as f:
            json.dump(config, f, indent=2, ensure_ascii=False)
        
        return config_file
    
    def load_node_config(self, workflow_id: str, node_id: str) -> Optional[dict]:
        """Load node config from JSON file in the node folder."""
        import json
        node_path = self.get_workflow_node_path(workflow_id, node_id)
        config_file = node_path / "config.json"
        
        try:
            if config_file.exists():
                with open(config_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
        except Exception:
            pass
        return None
    
    def delete_workflow_files(self, workflow_id: str) -> bool:
        """Delete files in the workflow folder and all subfolders, preserving folder structure and JSON files.
        
        This method:
        - Recursively deletes all non-JSON files in the workflow folder and subfolders
        - Preserves all subfolders (like 'nodes', 'tasks', etc.) - folders remain but are emptied of non-JSON files
        - Preserves all JSON files (like 'workflow.json', 'config.json', etc.) anywhere in the folder structure
        """
        workflow_path = self.get_workflow_path(workflow_id)
        try:
            if not workflow_path.exists():
                return True  # Already deleted or doesn't exist
            
            # Recursively iterate through all files in the workflow folder and subfolders
            for item in workflow_path.rglob('*'):
                if item.is_file():
                    # Only delete non-JSON files
                    if not item.suffix.lower() == '.json':
                        try:
                            item.unlink()
                        except Exception as e:
                            print(f"Error deleting file {item}: {str(e)}")
                # Skip directories - they are preserved (rglob only returns files with '*')
            
            return True
        except Exception as e:
            print(f"Error deleting workflow files for {workflow_id}: {str(e)}")
            return False

# Global storage instance
local_storage = LocalFileStorage()
