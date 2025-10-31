from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Query
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Optional
import uuid
from datetime import datetime, timedelta
import os

from app.core.database import get_db
from app.core.auth import get_current_user_optional
from app.core.config import settings
from app.core.storage import local_storage
from app.models import AppUser

router = APIRouter()

class PresignedUploadRequest(BaseModel):
    filename: str
    content_type: str
    file_size: Optional[int] = None

class PresignedUploadResponse(BaseModel):
    upload_url: str
    storage_key: str
    expires_in: int

@router.post("/presign", response_model=PresignedUploadResponse)
async def get_presigned_upload_url(
    request: PresignedUploadRequest,
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Get a presigned URL for file upload."""
    
    # Validate file type
    if not request.content_type or request.content_type not in settings.ALLOWED_FILE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"File type '{request.content_type}' not allowed. Allowed types: {settings.ALLOWED_FILE_TYPES}"
        )
    
    # Check file size limits (only if file_size is provided)
    if request.file_size is not None:
        max_size = settings.MAX_FILE_SIZE
        if current_user and current_user.is_guest:
            max_size = settings.GUEST_MAX_FILE_SIZE
        
        if request.file_size > max_size:
            raise HTTPException(
                status_code=400,
                detail=f"File size {request.file_size} exceeds limit {max_size}"
            )
    
    # Generate storage key using local storage
    storage_key = local_storage.generate_storage_key(request.filename, request.content_type)
    
    # For local development, we'll use a simple upload endpoint
    upload_url = f"/api/v1/uploads/upload?storage_key={storage_key}"
    
    return PresignedUploadResponse(
        upload_url=upload_url,
        storage_key=storage_key,
        expires_in=3600
    )

@router.post("/upload")
async def upload_file(
    storage_key: str = Query(...),
    file: UploadFile = File(...),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Upload a file to local storage."""
    
    # Validate file type
    if not file.content_type or file.content_type not in settings.ALLOWED_FILE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"File type '{file.content_type}' not allowed. Allowed types: {settings.ALLOWED_FILE_TYPES}"
        )
    
    # Read file content
    content = await file.read()
    
    # Check file size
    max_size = settings.MAX_FILE_SIZE
    if current_user and current_user.is_guest:
        max_size = settings.GUEST_MAX_FILE_SIZE
    
    if len(content) > max_size:
        raise HTTPException(
            status_code=400,
            detail=f"File size {len(content)} exceeds limit {max_size}"
        )
    
    # Save file
    file_path = local_storage.save_file(content, storage_key)
    
    return {
        "message": "File uploaded successfully",
        "storage_key": storage_key,
        "file_path": file_path
    }

@router.get("/download/{storage_key}")
async def get_download_url(
    storage_key: str,
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Get a download URL for a file."""
    
    # Generate download URL
    download_url = local_storage.get_file_url(storage_key)
    
    return {
        "download_url": download_url,
        "expires_in": 3600
    }

@router.get("/test")
async def test_endpoint():
    """Test endpoint."""
    return {"message": "Test endpoint working"}

@router.get("/test-serve")
async def test_serve_endpoint():
    """Test serve endpoint."""
    return {"message": "Test serve endpoint working"}

@router.get("/file-serve")
async def file_serve_query(
    path: Optional[str] = None,
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Serve files directly from storage using query parameter."""
    from pathlib import Path
    import base64
    
    print(f"FILE-SERVE ENDPOINT CALLED with path: {path}")
    
    if not path:
        raise HTTPException(status_code=400, detail="Path parameter is required")
    
    # Decode the base64 encoded path
    try:
        storage_key = base64.b64decode(path.encode()).decode()
        print(f"Decoded storage_key: {storage_key}")
    except Exception as e:
        print(f"Base64 decode error: {e}")
        raise HTTPException(status_code=400, detail="Invalid path parameter")
    
    # Construct full file path using the storage system
    from app.core.storage import local_storage
    full_path = local_storage.get_file_path(storage_key)

    # SECURITY: allow only whitelisted prefixes or absolute paths under backend/tasks
    allowed_prefixes = ["tasks/", "uploads/"]

    def is_within_backend_tasks(p: Path) -> bool:
        try:
            backend_dir = Path(__file__).resolve().parents[3]  # backend/
            tasks_dir = backend_dir / "tasks"
            p = p.resolve()
            return tasks_dir in p.parents or p == tasks_dir
        except Exception:
            return False

    if storage_key.startswith("/"):
        # Absolute path: only allow if it points inside backend/tasks
        if not is_within_backend_tasks(full_path):
            raise HTTPException(status_code=403, detail="Access denied")
    else:
        # Relative key: must start with allowed prefixes
        if not any(storage_key.startswith(prefix) for prefix in allowed_prefixes):
            raise HTTPException(status_code=403, detail="Access denied")
    
    # If relative "tasks/" but not found under uploads, look in backend/tasks directly
    if not full_path.exists() and storage_key.startswith("tasks/"):
        task_path = Path(storage_key)
        # Try to anchor to backend/tasks
        backend_dir = Path(__file__).resolve().parents[3]
        candidate = (backend_dir / task_path).resolve()
        if candidate.exists():
            full_path = candidate
        else:
            # Explicit fallback to user-specified absolute backend path
            fixed_backend = Path("/Users/lytech/Documents/GitHub/auto-jmp/backend")
            fixed_candidate = (fixed_backend / task_path).resolve()
            if fixed_candidate.exists():
                full_path = fixed_candidate
    
    # Debug info
    print(f"DEBUG: storage_key = {storage_key}")
    print(f"DEBUG: full_path = {full_path}")
    print(f"DEBUG: full_path.exists() = {full_path.exists()}")
    print(f"DEBUG: full_path.is_file() = {full_path.is_file() if full_path.exists() else False}")
    
    # Check if file exists
    if not full_path.exists() or not full_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    
    # Determine MIME type based on file extension
    mime_type = "application/octet-stream"
    if str(full_path).endswith('.png'):
        mime_type = "image/png"
    elif str(full_path).endswith('.jpg') or str(full_path).endswith('.jpeg'):
        mime_type = "image/jpeg"
    elif str(full_path).endswith('.csv'):
        mime_type = "text/csv"
    elif str(full_path).endswith('.jsl'):
        mime_type = "text/plain"
    
    return FileResponse(
        path=str(full_path),
        media_type=mime_type,
        filename=full_path.name
    )

@router.get("/serve-file")
async def serve_file_query(
    path: Optional[str] = None,
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Serve files directly from storage using query parameter."""
    from pathlib import Path
    import base64
    
    print(f"SERVE-FILE ENDPOINT CALLED with path: {path}")
    
    if not path:
        raise HTTPException(status_code=400, detail="Path parameter is required")
    
    # Decode the base64 encoded path
    try:
        storage_key = base64.b64decode(path.encode()).decode()
        print(f"Decoded storage_key: {storage_key}")
    except Exception as e:
        print(f"Base64 decode error: {e}")
        raise HTTPException(status_code=400, detail="Invalid path parameter")
    
    # Security check - only allow files in specific directories
    allowed_prefixes = ["tasks/", "uploads/"]
    if not any(storage_key.startswith(prefix) for prefix in allowed_prefixes):
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Construct full file path using the storage system
    from app.core.storage import local_storage
    full_path = local_storage.get_file_path(storage_key)
    
    # If file doesn't exist in uploads, check if it's a task file in the root tasks directory
    if not full_path.exists() and storage_key.startswith("tasks/"):
        # For task files, look in the root tasks directory instead of uploads/tasks
        task_path = Path(storage_key)
        full_path = task_path
    
    # Debug info
    print(f"DEBUG: storage_key = {storage_key}")
    print(f"DEBUG: full_path = {full_path}")
    print(f"DEBUG: full_path.exists() = {full_path.exists()}")
    print(f"DEBUG: full_path.is_file() = {full_path.is_file() if full_path.exists() else False}")
    
    # Check if file exists
    if not full_path.exists() or not full_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    
    # Determine MIME type based on file extension
    mime_type = "application/octet-stream"
    if storage_key.endswith('.png'):
        mime_type = "image/png"
    elif storage_key.endswith('.jpg') or storage_key.endswith('.jpeg'):
        mime_type = "image/jpeg"
    elif storage_key.endswith('.csv'):
        mime_type = "text/csv"
    elif storage_key.endswith('.jsl'):
        mime_type = "text/plain"
    
    return FileResponse(
        path=str(full_path),
        media_type=mime_type,
        filename=full_path.name
    )

@router.get("/download-zip/{run_id}")
async def download_run_zip(
    run_id: str,
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Download a ZIP file containing all files from a run's task directory."""
    from pathlib import Path
    import zipfile
    import tempfile
    import os
    from sqlalchemy.ext.asyncio import AsyncSession
    from sqlalchemy import select
    from app.core.database import AsyncSessionLocal
    from app.models import Run, Artifact
    
    # Get run details to verify access
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Run).where(Run.id == run_id))
        run = result.scalar_one_or_none()
        
        if not run:
            raise HTTPException(status_code=404, detail="Run not found")
        
        # Get artifacts for this run
        artifacts_result = await db.execute(
            select(Artifact).where(Artifact.run_id == run_id)
        )
        artifacts = artifacts_result.scalars().all()
        
        # Find task directory from artifacts (support multiple patterns)
        task_dir_rel: Optional[str] = None
        uploads_run_dir_rel: Optional[str] = None

        # Helper to extract tasks/... directory from any string
        def extract_tasks_dir(s: str) -> Optional[str]:
            if not s:
                return None
            # Normalize separators
            s2 = s.replace('\\', '/')
            idx = s2.find('tasks/')
            if idx >= 0:
                parts = s2[idx:].split('/')
                if len(parts) >= 2:
                    return '/'.join(parts[:2])  # tasks/task_xxx
            return None

        for artifact in artifacts:
            sk = artifact.storage_key or ""
            # Case 1: direct tasks/ prefix
            if sk.startswith("tasks/"):
                task_dir_rel = '/'.join(sk.split('/')[:2])
                break
            # Case 2: absolute path containing backend/tasks
            tasks_dir = extract_tasks_dir(sk)
            if tasks_dir:
                task_dir_rel = tasks_dir
                break
            # Case 3: uploads/runs/{run_id}/...
            s2 = sk.replace('\\', '/')
            marker = f"uploads/runs/{run_id}"
            if marker in s2:
                uploads_run_dir_rel = marker

        # Determine backend_dir (root backend path)
        backend_dir = Path(__file__).resolve().parents[3]
        
        full_task_dir: Optional[Path] = None
        if task_dir_rel:
            # Prefer tasks dir
            candidate = (backend_dir / task_dir_rel).resolve()
            if candidate.exists():
                full_task_dir = candidate
            else:
                # Try under uploads as fallback
                from app.core.storage import local_storage
                candidate2 = (local_storage.base_path / task_dir_rel).resolve()
                if candidate2.exists():
                    full_task_dir = candidate2
                else:
                    # Explicit fallback to user-specified absolute backend path
                    fixed_backend = Path("/Users/lytech/Documents/GitHub/auto-jmp/backend")
                    candidate3 = (fixed_backend / task_dir_rel).resolve()
                    if candidate3.exists():
                        full_task_dir = candidate3
        elif uploads_run_dir_rel:
            # Try uploads/runs/{run_id}
            from app.core.storage import local_storage
            candidate = (local_storage.base_path / f"runs/{run_id}").resolve()
            if candidate.exists():
                full_task_dir = candidate
        
        if not full_task_dir or not full_task_dir.exists():
            raise HTTPException(status_code=404, detail="Task directory not found")
        
        # Create temporary ZIP file
        temp_zip_path = tempfile.mktemp(suffix='.zip')
        try:
            with zipfile.ZipFile(temp_zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
                # Add all files from the directory
                for root, _, files in os.walk(full_task_dir):
                    for file in files:
                        fp = Path(root) / file
                        # Preserve relative structure inside zip
                        arcname = str(fp.relative_to(full_task_dir))
                        zipf.write(str(fp), arcname)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to create ZIP file: {str(e)}")
        
        return FileResponse(
            path=temp_zip_path,
            media_type='application/zip',
            filename=f"run_{run_id}_results.zip"
        )

@router.get("/files/{storage_key}")
async def serve_file_direct(
    storage_key: str,
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Serve files directly from storage."""
    from pathlib import Path
    import logging
    
    logger = logging.getLogger(__name__)
    
    # Security check - only allow files in specific directories
    allowed_prefixes = ["tasks/", "uploads/"]
    if not any(storage_key.startswith(prefix) for prefix in allowed_prefixes):
        logger.warning(f"Access denied for storage_key: {storage_key}")
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Construct full file path using the storage system
    from app.core.storage import local_storage
    full_path = local_storage.get_file_path(storage_key)
    
    # If file doesn't exist in uploads, check if it's a task file in the root tasks directory
    if not full_path.exists() and storage_key.startswith("tasks/"):
        # For task files, look in the root tasks directory instead of uploads/tasks
        task_path = Path(storage_key)
        full_path = task_path
    
    logger.info(f"Serving file: {full_path}")
    
    # Check if file exists
    if not full_path.exists():
        logger.warning(f"File not found: {full_path}")
        raise HTTPException(status_code=404, detail="File not found")
    
    # Check if it's a file (not directory)
    if not full_path.is_file():
        logger.warning(f"Path is not a file: {full_path}")
        raise HTTPException(status_code=404, detail="File not found")
    
    # Determine MIME type based on file extension
    mime_type = "application/octet-stream"
    if storage_key.endswith('.png'):
        mime_type = "image/png"
    elif storage_key.endswith('.jpg') or storage_key.endswith('.jpeg'):
        mime_type = "image/jpeg"
    elif storage_key.endswith('.csv'):
        mime_type = "text/csv"
    elif storage_key.endswith('.jsl'):
        mime_type = "text/plain"
    
    return FileResponse(
        path=str(full_path),
        media_type=mime_type,
        filename=full_path.name
    )
