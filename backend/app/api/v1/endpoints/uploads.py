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
    
    # Security check - only allow files in specific directories
    allowed_prefixes = ["tasks/", "uploads/"]
    if not any(storage_key.startswith(prefix) for prefix in allowed_prefixes):
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Construct full file path relative to backend directory
    # Use current working directory (should be backend directory when uvicorn runs)
    backend_dir = Path.cwd()
    full_path = backend_dir / storage_key
    
    # Debug info
    print(f"DEBUG: storage_key = {storage_key}")
    print(f"DEBUG: backend_dir = {backend_dir}")
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
    
    # Construct full file path relative to backend directory
    # Use current working directory (should be backend directory when uvicorn runs)
    backend_dir = Path.cwd()
    full_path = backend_dir / storage_key
    
    # Debug info
    print(f"DEBUG: storage_key = {storage_key}")
    print(f"DEBUG: backend_dir = {backend_dir}")
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
        
        # Find task directory from artifacts
        task_dir = None
        for artifact in artifacts:
            if artifact.storage_key and artifact.storage_key.startswith("tasks/"):
                # Extract task directory from storage key
                # e.g., "tasks/task_20251011_231215/FAI10.png" -> "tasks/task_20251011_231215"
                task_dir = "/".join(artifact.storage_key.split("/")[:2])
                break
        
        if not task_dir:
            raise HTTPException(status_code=404, detail="No task directory found for this run")
        
        # Construct full task directory path
        # Use current working directory (should be backend directory when uvicorn runs)
        backend_dir = Path.cwd()
        full_task_dir = backend_dir / task_dir
        
        if not full_task_dir.exists():
            raise HTTPException(status_code=404, detail="Task directory not found")
        
        # Create temporary ZIP file
        with tempfile.NamedTemporaryFile(delete=False, suffix='.zip') as temp_zip:
            with zipfile.ZipFile(temp_zip.name, 'w', zipfile.ZIP_DEFLATED) as zipf:
                # Add all files from the task directory
                for file_path in full_task_dir.rglob('*'):
                    if file_path.is_file():
                        # Add file to ZIP with relative path
                        arcname = file_path.relative_to(full_task_dir)
                        zipf.write(file_path, arcname)
            
            # Return the ZIP file
            return FileResponse(
                path=temp_zip.name,
                media_type="application/zip",
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
    
    # Construct full file path relative to backend directory
    backend_dir = Path(__file__).parent.parent.parent.parent
    full_path = backend_dir / storage_key
    
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
