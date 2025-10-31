import os
import uuid
from datetime import datetime, timedelta
from typing import Optional
from fastapi import HTTPException
import shutil
from pathlib import Path

class LocalFileStorage:
    """Simple local file storage implementation."""
    
    def __init__(self, base_path: str = "uploads"):
        """Initialize storage root as an absolute path.

        If ``base_path`` is relative, anchor it to the backend directory
        so storage never depends on the process working directory.
        Optionally respect the UPLOADS_DIR environment variable.
        """
        # Determine base path source: env var has precedence
        env_base = os.getenv("UPLOADS_DIR")
        configured_base = Path(env_base) if env_base else Path(base_path)

        # backend/ directory (this file is backend/app/core/storage.py)
        backend_dir = Path(__file__).resolve().parents[2]

        # Anchor relative paths to backend dir; keep absolute as-is
        absolute_base = configured_base if configured_base.is_absolute() else (backend_dir / configured_base)

        # If no explicit env override, prefer the external service backend uploads path
        # requested by deployment: /Users/lytech/Documents/service/auto-jmp/backend/uploads
        if not env_base:
            external_backend_uploads = Path("/Users/lytech/Documents/service/auto-jmp/backend/uploads")
            try:
                # Use the external path if it exists or if its parent exists (we will create it)
                if external_backend_uploads.parent.exists():
                    absolute_base = external_backend_uploads
            except Exception:
                # Fall back to computed absolute_base on any exception
                pass

        self.base_path = absolute_base.resolve()

        # Ensure directories exist
        self.base_path.mkdir(parents=True, exist_ok=True)
        (self.base_path / "projects").mkdir(parents=True, exist_ok=True)
        (self.base_path / "runs").mkdir(parents=True, exist_ok=True)
        (self.base_path / "temp").mkdir(parents=True, exist_ok=True)
    
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

# Global storage instance
local_storage = LocalFileStorage()
