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
        self.base_path = Path(base_path)
        self.base_path.mkdir(exist_ok=True)
    
    def generate_storage_key(self, filename: str, content_type: str) -> str:
        """Generate a unique storage key for a file."""
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        file_id = str(uuid.uuid4())[:8]
        file_extension = filename.split('.')[-1] if '.' in filename else ''
        
        if content_type == "text/csv":
            return f"csv_{timestamp}_{file_id}.{file_extension}"
        else:
            return f"jsl_{timestamp}_{file_id}.{file_extension}"
    
    def get_file_path(self, storage_key: str) -> Path:
        """Get the full file path for a storage key."""
        return self.base_path / storage_key
    
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

# Global storage instance
local_storage = LocalFileStorage()
