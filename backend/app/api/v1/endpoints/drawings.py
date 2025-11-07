from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Body, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone

from app.core.database import get_db
from app.core.auth import get_current_user, get_current_user_optional
from app.models import Project, DrawingFolder, DrawingImage, AppUser
from app.core.storage import local_storage
from app.core.config import settings
from app.services.pdf_processor import process_pdf, generate_output_images
from pathlib import Path
import json
import re
import shutil

router = APIRouter()

# In-memory websocket subscribers for progress updates
progress_subscribers: Dict[str, list] = {}

async def progress_broadcast(folder_id: str, message: Dict[str, Any]):
    subscribers = progress_subscribers.get(folder_id, [])
    to_remove = []
    for ws in subscribers:
        try:
            await ws.send_json(message)
        except Exception:
            to_remove.append(ws)
    if to_remove:
        for ws in to_remove:
            try:
                subscribers.remove(ws)
            except ValueError:
                pass
        progress_subscribers[folder_id] = subscribers

@router.websocket("/{project_id}/drawing-folders/{folder_id}/process-progress")
async def ws_process_progress(websocket: WebSocket, project_id: str, folder_id: str):
    await websocket.accept()
    # register
    progress_subscribers.setdefault(folder_id, []).append(websocket)
    try:
        # keep the connection alive; client may send pings or nothing
        while True:
            try:
                await websocket.receive_text()
            except WebSocketDisconnect:
                break
            except Exception:
                # ignore non-text frames
                pass
    finally:
        # unregister
        subs = progress_subscribers.get(folder_id, [])
        if websocket in subs:
            subs.remove(websocket)
            progress_subscribers[folder_id] = subs

class DrawingFolderResponse(BaseModel):
    id: str
    project_id: str
    description: Optional[str]
    created_by: str
    creator_email: Optional[str]
    creator_display_name: Optional[str]
    created_at: str
    updated_at: str
    image_count: int = 0

class DrawingFolderCreate(BaseModel):
    description: Optional[str] = None

class DrawingFolderUpdate(BaseModel):
    description: Optional[str] = None

class DrawingImageResponse(BaseModel):
    id: str
    folder_id: str
    filename: str
    file_size: int
    mime_type: Optional[str]
    uploaded_by: str
    uploader_email: Optional[str]
    uploader_display_name: Optional[str]
    created_at: str
    url: str

async def check_project_access_for_drawing(
    db: AsyncSession, 
    project_id: uuid.UUID, 
    user: Optional[AppUser],
    require_owner: bool = False
) -> Project:
    """Check if user has access to project for drawing operations."""
    # Get project
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Check if user is authenticated
    if not user:
        if project.allow_guest:
            return project
        raise HTTPException(status_code=403, detail="Authentication required")
    
    # Check if owner is required
    if require_owner:
        if project.owner_id != user.id:
            raise HTTPException(status_code=403, detail="Only project owner can perform this action")
    
    return project

@router.post("/{project_id}/drawing-folders", response_model=DrawingFolderResponse)
async def create_drawing_folder(
    project_id: str,
    description: str = Form(None),
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user)
):
    """Create a new drawing folder for a project. Only project owner can create."""
    
    # Validate project access (owner only)
    project = await check_project_access_for_drawing(db, uuid.UUID(project_id), current_user, require_owner=True)
    
    # Create drawing folder
    folder = DrawingFolder(
        project_id=uuid.UUID(project_id),
        created_by=current_user.id,
        description=description
    )
    
    db.add(folder)
    await db.commit()
    await db.refresh(folder)
    
    # Get creator info
    creator_result = await db.execute(select(AppUser).where(AppUser.id == current_user.id))
    creator = creator_result.scalar_one()
    
    return DrawingFolderResponse(
        id=str(folder.id),
        project_id=str(folder.project_id),
        description=folder.description,
        created_by=str(folder.created_by),
        creator_email=creator.email,
        creator_display_name=creator.display_name,
        created_at=folder.created_at.isoformat(),
        updated_at=folder.updated_at.isoformat(),
        image_count=0
    )

@router.get("/{project_id}/drawing-folders", response_model=List[DrawingFolderResponse])
async def list_drawing_folders(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """List all drawing folders for a project."""
    
    # Validate project access
    project = await check_project_access_for_drawing(db, uuid.UUID(project_id), current_user)
    
    # Get drawing folders with creator info and image counts
    result = await db.execute(
        select(DrawingFolder, AppUser)
        .join(AppUser, DrawingFolder.created_by == AppUser.id)
        .where(DrawingFolder.project_id == uuid.UUID(project_id))
        .order_by(DrawingFolder.created_at.desc())
    )
    
    folders = []
    for folder, creator in result:
        # Count images in folder
        image_count_result = await db.execute(
            select(DrawingImage).where(DrawingImage.folder_id == folder.id)
        )
        image_count = len(image_count_result.scalars().all())
        
        folders.append(DrawingFolderResponse(
            id=str(folder.id),
            project_id=str(folder.project_id),
            description=folder.description,
            created_by=str(folder.created_by),
            creator_email=creator.email,
            creator_display_name=creator.display_name,
            created_at=folder.created_at.isoformat(),
            updated_at=folder.updated_at.isoformat(),
            image_count=image_count
        ))
    
    return folders

@router.get("/{project_id}/drawing-folders/{folder_id}", response_model=DrawingFolderResponse)
async def get_drawing_folder(
    project_id: str,
    folder_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Get a specific drawing folder."""
    
    # Validate project access
    project = await check_project_access_for_drawing(db, uuid.UUID(project_id), current_user)
    
    # Get folder
    result = await db.execute(
        select(DrawingFolder, AppUser)
        .join(AppUser, DrawingFolder.created_by == AppUser.id)
        .where(
            DrawingFolder.id == uuid.UUID(folder_id),
            DrawingFolder.project_id == uuid.UUID(project_id)
        )
    )
    
    folder_data = result.first()
    if not folder_data:
        raise HTTPException(status_code=404, detail="Drawing folder not found")
    
    folder, creator = folder_data
    
    # Count images
    image_count_result = await db.execute(
        select(DrawingImage).where(DrawingImage.folder_id == folder.id)
    )
    image_count = len(image_count_result.scalars().all())
    
    return DrawingFolderResponse(
        id=str(folder.id),
        project_id=str(folder.project_id),
        description=folder.description,
        created_by=str(folder.created_by),
        creator_email=creator.email,
        creator_display_name=creator.display_name,
        created_at=folder.created_at.isoformat(),
        updated_at=folder.updated_at.isoformat(),
        image_count=image_count
    )

@router.patch("/{project_id}/drawing-folders/{folder_id}", response_model=DrawingFolderResponse)
async def update_drawing_folder(
    project_id: str,
    folder_id: str,
    description: str = Form(None),
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user)
):
    """Update a drawing folder description. Only project owner can update."""
    
    # Validate project access (owner only)
    project = await check_project_access_for_drawing(db, uuid.UUID(project_id), current_user, require_owner=True)
    
    # Get folder
    result = await db.execute(
        select(DrawingFolder).where(
            DrawingFolder.id == uuid.UUID(folder_id),
            DrawingFolder.project_id == uuid.UUID(project_id)
        )
    )
    folder = result.scalar_one_or_none()
    
    if not folder:
        raise HTTPException(status_code=404, detail="Drawing folder not found")
    
    # Update description
    if description is not None:
        folder.description = description
    
    await db.commit()
    await db.refresh(folder)
    
    # Get creator info
    creator_result = await db.execute(select(AppUser).where(AppUser.id == folder.created_by))
    creator = creator_result.scalar_one()
    
    # Count images
    image_count_result = await db.execute(
        select(DrawingImage).where(DrawingImage.folder_id == folder.id)
    )
    image_count = len(image_count_result.scalars().all())
    
    return DrawingFolderResponse(
        id=str(folder.id),
        project_id=str(folder.project_id),
        description=folder.description,
        created_by=str(folder.created_by),
        creator_email=creator.email,
        creator_display_name=creator.display_name,
        created_at=folder.created_at.isoformat(),
        updated_at=folder.updated_at.isoformat(),
        image_count=image_count
    )

@router.delete("/{project_id}/drawing-folders/{folder_id}")
async def delete_drawing_folder(
    project_id: str,
    folder_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user)
):
    """Delete a drawing folder and all its images. Only project owner can delete."""
    
    # Validate project access (owner only)
    project = await check_project_access_for_drawing(db, uuid.UUID(project_id), current_user, require_owner=True)
    
    # Get folder
    result = await db.execute(
        select(DrawingFolder).where(
            DrawingFolder.id == uuid.UUID(folder_id),
            DrawingFolder.project_id == uuid.UUID(project_id)
        )
    )
    folder = result.scalar_one_or_none()
    
    if not folder:
        raise HTTPException(status_code=404, detail="Drawing folder not found")
    
    # Get all images in folder
    images_result = await db.execute(
        select(DrawingImage).where(DrawingImage.folder_id == folder.id)
    )
    images = images_result.scalars().all()
    
    # Delete image files from storage
    for image in images:
        local_storage.delete_file(image.storage_key)
    
    # Delete images from database
    await db.execute(
        delete(DrawingImage).where(DrawingImage.folder_id == folder.id)
    )
    
    # Delete folder
    await db.execute(
        delete(DrawingFolder).where(DrawingFolder.id == uuid.UUID(folder_id))
    )
    
    await db.commit()
    
    return {"message": "Drawing folder deleted successfully"}

@router.post("/{project_id}/drawing-folders/{folder_id}/images", response_model=DrawingImageResponse)
async def upload_drawing_image(
    project_id: str,
    folder_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user)
):
    """Upload an image to a drawing folder."""
    
    # Validate project access
    project = await check_project_access_for_drawing(db, uuid.UUID(project_id), current_user)
    
    # Get folder
    folder_result = await db.execute(
        select(DrawingFolder).where(
            DrawingFolder.id == uuid.UUID(folder_id),
            DrawingFolder.project_id == uuid.UUID(project_id)
        )
    )
    folder = folder_result.scalar_one_or_none()
    
    if not folder:
        raise HTTPException(status_code=404, detail="Drawing folder not found")
    
    # Validate file type (only images)
    if not file.content_type or not file.content_type.startswith('image/'):
        raise HTTPException(
            status_code=400,
            detail="Only image files are allowed"
        )
    
    # Read file content
    content = await file.read()
    
    # Check file size (50MB max for images)
    max_size = 50 * 1024 * 1024  # 50MB
    if len(content) > max_size:
        raise HTTPException(
            status_code=400,
            detail=f"File size {len(content)} exceeds limit {max_size}"
        )
    
    # Generate storage key
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    file_id = str(uuid.uuid4())[:8]
    safe_filename = "".join(c for c in file.filename if c.isalnum() or c in (' ', '-', '_', '.')).rstrip()
    storage_key = f"projects/{project_id}/drawings/{folder_id}/{timestamp}_{file_id}_{safe_filename}"
    
    # Save file
    file_path = local_storage.save_file(content, storage_key)
    
    # Create image record
    image = DrawingImage(
        folder_id=uuid.UUID(folder_id),
        uploaded_by=current_user.id,
        filename=file.filename,
        storage_key=storage_key,
        file_size=len(content),
        mime_type=file.content_type
    )
    
    db.add(image)
    await db.commit()
    await db.refresh(image)
    
    # Get uploader info
    uploader_result = await db.execute(select(AppUser).where(AppUser.id == current_user.id))
    uploader = uploader_result.scalar_one()
    
    return DrawingImageResponse(
        id=str(image.id),
        folder_id=str(image.folder_id),
        filename=image.filename,
        file_size=image.file_size,
        mime_type=image.mime_type,
        uploaded_by=str(image.uploaded_by),
        uploader_email=uploader.email,
        uploader_display_name=uploader.display_name,
        created_at=image.created_at.isoformat(),
        url=f"/api/v1/projects/{project_id}/drawing-folders/{folder_id}/images/{image.id}/view"
    )

@router.get("/{project_id}/drawing-folders/{folder_id}/images", response_model=List[DrawingImageResponse])
async def list_drawing_images(
    project_id: str,
    folder_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """List all images in a drawing folder."""
    
    # Validate project access
    project = await check_project_access_for_drawing(db, uuid.UUID(project_id), current_user)
    
    # Get folder
    folder_result = await db.execute(
        select(DrawingFolder).where(
            DrawingFolder.id == uuid.UUID(folder_id),
            DrawingFolder.project_id == uuid.UUID(project_id)
        )
    )
    folder = folder_result.scalar_one_or_none()
    
    if not folder:
        raise HTTPException(status_code=404, detail="Drawing folder not found")
    
    # Get images with uploader info
    result = await db.execute(
        select(DrawingImage, AppUser)
        .join(AppUser, DrawingImage.uploaded_by == AppUser.id)
        .where(DrawingImage.folder_id == uuid.UUID(folder_id))
        .order_by(DrawingImage.created_at.desc())
    )
    
    images = []
    for image, uploader in result:
        images.append(DrawingImageResponse(
            id=str(image.id),
            folder_id=str(image.folder_id),
            filename=image.filename,
            file_size=image.file_size,
            mime_type=image.mime_type,
            uploaded_by=str(image.uploaded_by),
            uploader_email=uploader.email,
            uploader_display_name=uploader.display_name,
            created_at=image.created_at.isoformat(),
            url=f"/api/v1/projects/{project_id}/drawing-folders/{folder_id}/images/{image.id}/view"
        ))
    
    return images

@router.get("/{project_id}/drawing-folders/{folder_id}/images/{image_id}/view")
async def view_drawing_image(
    project_id: str,
    folder_id: str,
    image_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """View/download a drawing image."""
    from fastapi.responses import FileResponse
    
    # Validate project access
    project = await check_project_access_for_drawing(db, uuid.UUID(project_id), current_user)
    
    # Get image
    result = await db.execute(
        select(DrawingImage).where(
            DrawingImage.id == uuid.UUID(image_id),
            DrawingImage.folder_id == uuid.UUID(folder_id)
        )
    )
    image = result.scalar_one_or_none()
    
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    
    # Get file path
    file_path = local_storage.get_file_path(image.storage_key)
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    return FileResponse(
        path=str(file_path),
        media_type=image.mime_type or "image/jpeg",
        filename=image.filename
    )

@router.delete("/{project_id}/drawing-folders/{folder_id}/images/{image_id}")
async def delete_drawing_image(
    project_id: str,
    folder_id: str,
    image_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user)
):
    """Delete a drawing image. Only project owner or uploader can delete."""
    
    # Validate project access
    project = await check_project_access_for_drawing(db, uuid.UUID(project_id), current_user)
    
    # Get image
    result = await db.execute(
        select(DrawingImage).where(
            DrawingImage.id == uuid.UUID(image_id),
            DrawingImage.folder_id == uuid.UUID(folder_id)
        )
    )
    image = result.scalar_one_or_none()
    
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    
    # Check if user can delete (uploader or project owner)
    can_delete = (
        image.uploaded_by == current_user.id or  # Uploader
        project.owner_id == current_user.id  # Project owner
    )
    
    if not can_delete:
        raise HTTPException(status_code=403, detail="Only the uploader or project owner can delete images")
    
    # Delete file from storage
    local_storage.delete_file(image.storage_key)
    
    # Delete image record
    await db.execute(
        delete(DrawingImage).where(DrawingImage.id == uuid.UUID(image_id))
    )
    await db.commit()
    
    return {"message": "Image deleted successfully"}


@router.get("/{project_id}/drawing-folders/{folder_id}/original-image/{image_name:path}")
async def get_original_image(
    project_id: str,
    folder_id: str,
    image_name: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Get an original image from the drawing folder (for PDF-created folders)."""
    from fastapi.responses import FileResponse
    
    # Validate project access
    project = await check_project_access_for_drawing(db, uuid.UUID(project_id), current_user)
    
    # Get folder
    folder_result = await db.execute(
        select(DrawingFolder).where(
            DrawingFolder.id == uuid.UUID(folder_id),
            DrawingFolder.project_id == uuid.UUID(project_id)
        )
    )
    folder = folder_result.scalar_one_or_none()
    
    if not folder:
        raise HTTPException(status_code=404, detail="Drawing folder not found")
    
    # Get metadata to find original_image folder
    folder_storage_key = f"projects/{project_id}/drawings/{folder_id}"
    folder_path = local_storage.get_file_path(folder_storage_key)
    metadata_path = folder_path / "metadata.json"
    
    if not metadata_path.exists():
        raise HTTPException(status_code=404, detail="This folder does not have original images")
    
    with open(metadata_path, 'r') as f:
        metadata = json.load(f)
    
    # Construct image path
    original_image_folder = Path(metadata["original_image_folder"])
    image_path = original_image_folder / image_name
    
    if not image_path.exists():
        raise HTTPException(status_code=404, detail="Image not found")
    
    # Determine MIME type
    mime_type = "image/png"
    if image_name.lower().endswith('.jpg') or image_name.lower().endswith('.jpeg'):
        mime_type = "image/jpeg"
    
    return FileResponse(
        path=str(image_path),
        media_type=mime_type,
        filename=image_name
    )


@router.post("/{project_id}/drawing-folders/from-pdf", response_model=DrawingFolderResponse)
async def create_drawing_folder_from_pdf(
    project_id: str,
    pdf_file: UploadFile = File(...),
    description: str = Form(None),
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user)
):
    """Create a new drawing folder from PDF with FAI detection and annotation extraction."""
    
    # Validate project access (owner only)
    project = await check_project_access_for_drawing(db, uuid.UUID(project_id), current_user, require_owner=True)
    
    # Validate file type (PDF only)
    if not pdf_file.content_type or pdf_file.content_type != 'application/pdf':
        raise HTTPException(
            status_code=400,
            detail="Only PDF files are allowed"
        )
    
    # Read PDF content
    pdf_content = await pdf_file.read()
    
    # Check file size (100MB max for PDFs)
    max_size = 100 * 1024 * 1024  # 100MB
    if len(pdf_content) > max_size:
        raise HTTPException(
            status_code=400,
            detail=f"File size {len(pdf_content)} exceeds limit {max_size}"
        )
    
    # Create drawing folder
    folder = DrawingFolder(
        project_id=uuid.UUID(project_id),
        created_by=current_user.id,
        description=description or f"From PDF: {pdf_file.filename}"
    )
    
    db.add(folder)
    await db.commit()
    await db.refresh(folder)
    
    # Get folder storage path
    folder_storage_key = f"projects/{project_id}/drawings/{folder.id}"
    folder_path = local_storage.get_file_path(folder_storage_key)
    folder_path.mkdir(parents=True, exist_ok=True)
    
    # Process PDF
    try:
        print(f"Starting PDF processing for file: {pdf_file.filename}")
        print(f"PDF content size: {len(pdf_content)} bytes")
        
        # Wrap progress callback to broadcast via websocket
        import asyncio
        def progress_cb(event: Dict[str, Any]):
            asyncio.create_task(progress_broadcast(str(folder.id), event))

        result = process_pdf(
            pdf_content=pdf_content,
            pdf_filename=pdf_file.filename,
            output_folder=str(folder_path.parent),
            folder_id=str(folder.id),
            progress_cb=progress_cb
        )
        
        print(f"PDF processing completed. Result keys: {result.keys()}")
        print(f"Total pages: {result.get('total_pages', 0)}")
        print(f"Total annotations: {len(result.get('annotations', []))}")
        print(f"Per-page counts: {result.get('per_page_counts', {})}")
        
        # Save annotations JSON path to folder (we'll store it in a metadata file)
        metadata_path = folder_path / "metadata.json"
        metadata = {
            "annotations_json_path": result["annotations_json_path"],
            "image_annotations_json_path": result["image_annotations_json_path"],
            "original_image_folder": result["original_image_folder"],
            "pdf_filename": pdf_file.filename,
            "base_name": result.get("base_name", Path(pdf_file.filename).stem),
            "total_pages": result.get("total_pages", 0),
            "per_page_counts": result.get("per_page_counts", {})
        }
        with open(str(metadata_path), 'w') as f:
            json.dump(metadata, f, indent=2)
        
        print(f"Metadata saved to: {metadata_path}")
        
    except Exception as e:
        print(f"ERROR in PDF processing: {e}")
        import traceback
        traceback.print_exc()
        
        # Delete folder if processing failed
        await db.execute(delete(DrawingFolder).where(DrawingFolder.id == folder.id))
        await db.commit()
        raise HTTPException(status_code=500, detail=f"PDF processing failed: {str(e)}")
    
    # Get creator info
    creator_result = await db.execute(select(AppUser).where(AppUser.id == current_user.id))
    creator = creator_result.scalar_one()
    
    # Count images (we won't store them in DB yet, they're in the original_image folder)
    image_count = result.get("image_count", 0)
    
    return DrawingFolderResponse(
        id=str(folder.id),
        project_id=str(folder.project_id),
        description=folder.description,
        created_by=str(folder.created_by),
        creator_email=creator.email,
        creator_display_name=creator.display_name,
        created_at=folder.created_at.isoformat(),
        updated_at=folder.updated_at.isoformat(),
        image_count=image_count
    )


@router.get("/{project_id}/drawing-folders/{folder_id}/annotations")
async def get_drawing_annotations(
    project_id: str,
    folder_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Get annotations for a drawing folder."""
    
    # Validate project access
    project = await check_project_access_for_drawing(db, uuid.UUID(project_id), current_user)
    
    # Get folder
    folder_result = await db.execute(
        select(DrawingFolder).where(
            DrawingFolder.id == uuid.UUID(folder_id),
            DrawingFolder.project_id == uuid.UUID(project_id)
        )
    )
    folder = folder_result.scalar_one_or_none()
    
    if not folder:
        raise HTTPException(status_code=404, detail="Drawing folder not found")
    
    # Get metadata
    folder_storage_key = f"projects/{project_id}/drawings/{folder_id}"
    folder_path = local_storage.get_file_path(folder_storage_key)
    metadata_path = folder_path / "metadata.json"
    
    if not metadata_path.exists():
        raise HTTPException(status_code=404, detail="Annotations not found. This folder may not have been created from PDF.")
    
    with open(metadata_path, 'r') as f:
        metadata = json.load(f)
    
    # Try to load from page-specific annotation files first
    original_image_folder = Path(metadata["original_image_folder"])
    base_name = metadata.get("base_name") or metadata.get("pdf_filename", "document").replace(".pdf", "")
    
    # Look for page-specific annotation files
    page_pattern = f"{base_name}_page_*_annotations.json"
    print(f"Looking for annotation files matching pattern: {page_pattern} in {original_image_folder}")
    page_annotation_files = sorted(original_image_folder.glob(page_pattern))
    
    all_annotations = []
    if page_annotation_files:
        # Load from individual page files
        print(f"Found {len(page_annotation_files)} page annotation files")
        for page_file in page_annotation_files:
            try:
                file_size = page_file.stat().st_size
                print(f"  Processing {page_file.name} (size: {file_size} bytes)")
                with open(str(page_file), 'r') as f:
                    page_annotations = json.load(f)
                    print(f"    Loaded {len(page_annotations)} annotations from {page_file.name}")
                    if len(page_annotations) > 0:
                        print(f"    First annotation: {page_annotations[0]}")
                    all_annotations.extend(page_annotations)
            except json.JSONDecodeError as e:
                print(f"  ERROR: Failed to parse JSON in {page_file.name}: {e}")
            except Exception as e:
                print(f"  ERROR: Failed to load {page_file.name}: {e}")
    else:
        # Fallback to combined image_annotations.json file
        annotations_json_path = Path(metadata["image_annotations_json_path"])
        if not annotations_json_path.exists():
            raise HTTPException(status_code=404, detail="Annotations file not found")
        
        with open(annotations_json_path, 'r') as f:
            all_annotations = json.load(f)
        print(f"Loaded {len(all_annotations)} annotations from combined file")
    
    if not all_annotations:
        raise HTTPException(status_code=404, detail="No annotations found")
    
    return {
        "annotations": all_annotations,
        "metadata": metadata,
        "image_base_url": f"/api/v1/projects/{project_id}/drawing-folders/{folder_id}/original-image"
    }


@router.patch("/{project_id}/drawing-folders/{folder_id}/annotations")
async def update_drawing_annotations(
    project_id: str,
    folder_id: str,
    annotations: List[Dict[str, Any]] = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user)
):
    """Update annotations (add second annotation layer - region)."""
    
    # Validate project access
    project = await check_project_access_for_drawing(db, uuid.UUID(project_id), current_user)
    
    # Get folder
    folder_result = await db.execute(
        select(DrawingFolder).where(
            DrawingFolder.id == uuid.UUID(folder_id),
            DrawingFolder.project_id == uuid.UUID(project_id)
        )
    )
    folder = folder_result.scalar_one_or_none()
    
    if not folder:
        raise HTTPException(status_code=404, detail="Drawing folder not found")
    
    # Get metadata
    folder_storage_key = f"projects/{project_id}/drawings/{folder_id}"
    folder_path = local_storage.get_file_path(folder_storage_key)
    metadata_path = folder_path / "metadata.json"
    
    if not metadata_path.exists():
        raise HTTPException(status_code=404, detail="Annotations not found. This folder may not have been created from PDF.")
    
    with open(metadata_path, 'r') as f:
        metadata = json.load(f)
    
    # Try to update page-specific files first, fallback to combined file
    original_image_folder = Path(metadata["original_image_folder"])
    base_name = metadata.get("base_name") or metadata.get("pdf_filename", "document").replace(".pdf", "")
    
    # Group annotations by page/image
    annotations_by_page = {}
    for ann in annotations:
        image_name = ann.get("image", "")
        # Extract page number from image name (e.g., "doc_page_1.png" -> 1)
        page_match = re.search(r'_page_(\d+)\.', image_name)
        if page_match:
            page_num = int(page_match.group(1))
            if page_num not in annotations_by_page:
                annotations_by_page[page_num] = []
            annotations_by_page[page_num].append(ann)
    
    # Load existing annotations (from page files or combined file)
    all_existing_annotations = []
    page_annotation_files = sorted(original_image_folder.glob(f"{base_name}_page_*_annotations.json"))
    
    if page_annotation_files:
        # Load from page-specific files
        for page_file in page_annotation_files:
            try:
                with open(str(page_file), 'r') as f:
                    page_annotations = json.load(f)
                    all_existing_annotations.extend(page_annotations)
            except Exception as e:
                print(f"Warning: Failed to load {page_file.name}: {e}")
    else:
        # Fallback to combined file
        annotations_json_path = Path(metadata["image_annotations_json_path"])
        if annotations_json_path.exists():
            with open(annotations_json_path, 'r') as f:
                all_existing_annotations = json.load(f)
    
    # Create a mapping of existing annotations by image+label for quick lookup
    existing_annotations_map: Dict[str, Dict[str, Any]] = {}
    for ann in all_existing_annotations:
        key = f"{ann['image']}_{ann['label']}"
        existing_annotations_map[key] = ann
    
    # Process incoming annotations: update existing ones or add new ones
    processed_annotations = []
    for incoming in annotations:
        image_name = incoming.get('image')
        label = incoming.get('label')
        key = f"{image_name}_{label}"
        
        # Try to find existing annotation by key
        target = existing_annotations_map.get(key)
        
        if target:
            # Update existing annotation
            # Preserve class_id and yolo if they exist and bbox hasn't changed significantly
            if 'class_id' in target:
                incoming['class_id'] = target['class_id']
            if 'yolo' in target and isinstance(target.get('yolo'), list) and len(target['yolo']) == 5:
                # Only recompute YOLO if bbox changed significantly
                bbox = incoming.get('bbox')
                existing_bbox = target.get('bbox')
                if isinstance(bbox, list) and len(bbox) == 4:
                    if isinstance(existing_bbox, list) and len(existing_bbox) == 4:
                        # Check if bbox changed significantly (more than 1 pixel)
                        if (abs(bbox[0] - existing_bbox[0]) > 1 or 
                            abs(bbox[1] - existing_bbox[1]) > 1 or
                            abs(bbox[2] - existing_bbox[2]) > 1 or
                            abs(bbox[3] - existing_bbox[3]) > 1):
                            # Recompute YOLO
                            try:
                                from PIL import Image as PILImage
                                img_path = Path(metadata["original_image_folder"]) / image_name
                                if img_path.exists():
                                    class_id = target['yolo'][0]
                                    x1, y1, x2, y2 = bbox
                                    with PILImage.open(str(img_path)) as im:
                                        w_img, h_img = im.size
                                    cx = ((x1 + x2) / 2) / w_img
                                    cy = ((y1 + y2) / 2) / h_img
                                    w = abs(x2 - x1) / w_img
                                    h = abs(y2 - y1) / h_img
                                    incoming['yolo'] = [class_id, cx, cy, w, h]
                                else:
                                    incoming['yolo'] = target['yolo']
                            except Exception as e:
                                print(f"Warning: failed to recompute YOLO for {image_name}: {e}")
                                incoming['yolo'] = target['yolo']
                        else:
                            # Bbox unchanged, keep existing YOLO
                            incoming['yolo'] = target['yolo']
                    else:
                        # No existing bbox, recompute YOLO
                        try:
                            from PIL import Image as PILImage
                            img_path = Path(metadata["original_image_folder"]) / image_name
                            if img_path.exists():
                                class_id = target['yolo'][0]
                                x1, y1, x2, y2 = bbox
                                with PILImage.open(str(img_path)) as im:
                                    w_img, h_img = im.size
                                cx = ((x1 + x2) / 2) / w_img
                                cy = ((y1 + y2) / 2) / h_img
                                w = abs(x2 - x1) / w_img
                                h = abs(y2 - y1) / h_img
                                incoming['yolo'] = [class_id, cx, cy, w, h]
                            else:
                                incoming['yolo'] = target['yolo']
                        except Exception as e:
                            print(f"Warning: failed to recompute YOLO for {image_name}: {e}")
                            incoming['yolo'] = target['yolo']
                else:
                    incoming['yolo'] = target['yolo']
            else:
                # No existing YOLO, compute it if bbox is available
                bbox = incoming.get('bbox')
                if isinstance(bbox, list) and len(bbox) == 4:
                    try:
                        from PIL import Image as PILImage
                        img_path = Path(metadata["original_image_folder"]) / image_name
                        if img_path.exists():
                            class_id = incoming.get('class_id', 0)
                            x1, y1, x2, y2 = bbox
                            with PILImage.open(str(img_path)) as im:
                                w_img, h_img = im.size
                            cx = ((x1 + x2) / 2) / w_img
                            cy = ((y1 + y2) / 2) / h_img
                            w = abs(x2 - x1) / w_img
                            h = abs(y2 - y1) / h_img
                            incoming['yolo'] = [class_id, cx, cy, w, h]
                    except Exception as e:
                        print(f"Warning: failed to compute YOLO for {image_name}: {e}")
        else:
            # New annotation - compute YOLO if bbox is available
            bbox = incoming.get('bbox')
            if isinstance(bbox, list) and len(bbox) == 4:
                try:
                    from PIL import Image as PILImage
                    img_path = Path(metadata["original_image_folder"]) / image_name
                    if img_path.exists():
                        class_id = incoming.get('class_id', 0)
                        x1, y1, x2, y2 = bbox
                        with PILImage.open(str(img_path)) as im:
                            w_img, h_img = im.size
                        cx = ((x1 + x2) / 2) / w_img
                        cy = ((y1 + y2) / 2) / h_img
                        w = abs(x2 - x1) / w_img
                        h = abs(y2 - y1) / h_img
                        incoming['yolo'] = [class_id, cx, cy, w, h]
                except Exception as e:
                    print(f"Warning: failed to compute YOLO for new annotation {image_name}: {e}")
        
        processed_annotations.append(incoming)
    
    # Use the processed annotations as the source of truth (supports additions and deletions)
    all_updated_annotations = processed_annotations
    
    # Save to page-specific files
    if page_annotation_files or annotations_by_page:
        # Group updated annotations by page
        updated_by_page = {}
        for ann in all_updated_annotations:
            image_name = ann.get("image", "")
            page_match = re.search(r'_page_(\d+)\.', image_name)
            if page_match:
                page_num = int(page_match.group(1))
                if page_num not in updated_by_page:
                    updated_by_page[page_num] = []
                updated_by_page[page_num].append(ann)
        
        # Save each page file
        for page_num, page_annotations in updated_by_page.items():
            page_file = original_image_folder / f"{base_name}_page_{page_num}_annotations.json"
            with open(str(page_file), 'w') as f:
                json.dump(page_annotations, f, indent=2)
        
        # Also update the combined file for backward compatibility
        image_annotations_json_path = Path(metadata["image_annotations_json_path"])
        with open(str(image_annotations_json_path), 'w') as f:
            json.dump(all_updated_annotations, f, indent=2)
    else:
        # Fallback: save to combined file only
        annotations_json_path = Path(metadata["image_annotations_json_path"])
        with open(str(annotations_json_path), 'w') as f:
            json.dump(all_updated_annotations, f, indent=2)
    
    return {
        "message": "Annotations updated successfully",
        "updated_count": len(annotations),
        "total_annotations": len(all_updated_annotations)
    }


@router.post("/{project_id}/drawing-folders/{folder_id}/generate-output")
async def generate_drawing_output(
    project_id: str,
    folder_id: str,
    draw_yolo: bool = Form(False),
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user)
):
    """Generate output images from annotations.
    
    For each annotation with both FAI (bbox) and Region:
    1. Draw FAI annotation on the image
    2. Crop to the region annotation
    3. Save to temp folder
    4. Upload to storage
    5. Create or update DrawingImage records
    
    If regenerating, updates existing images' storage_keys.
    """
    # Validate project access
    project = await check_project_access_for_drawing(db, uuid.UUID(project_id), current_user)
    
    # Get folder
    folder_result = await db.execute(
        select(DrawingFolder).where(
            DrawingFolder.id == uuid.UUID(folder_id),
            DrawingFolder.project_id == uuid.UUID(project_id)
        )
    )
    folder = folder_result.scalar_one_or_none()
    
    if not folder:
        raise HTTPException(status_code=404, detail="Drawing folder not found")
    
    # Get metadata
    folder_storage_key = f"projects/{project_id}/drawings/{folder_id}"
    folder_path = local_storage.get_file_path(folder_storage_key)
    metadata_path = folder_path / "metadata.json"
    
    if not metadata_path.exists():
        raise HTTPException(status_code=404, detail="Annotations not found. This folder may not have been created from PDF.")
    
    with open(metadata_path, 'r') as f:
        metadata = json.load(f)
    
    # Create temp folder for generated images
    temp_folder = folder_path / "temp"
    temp_folder.mkdir(exist_ok=True)
    
    # Generate output images to temp folder
    try:
        generated_images = generate_output_images(
            annotations_json_path=metadata["image_annotations_json_path"],
            original_image_folder=metadata["original_image_folder"],
            output_folder=str(temp_folder),
            draw_yolo=draw_yolo
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate output images: {str(e)}")
    
    # Upload images to storage and create/update DrawingImage records
    uploaded_count = 0
    updated_count = 0
    created_count = 0
    
    for img_info in generated_images:
        filename = img_info["filename"]
        file_path = Path(img_info["file_path"])
        label = img_info["label"]
        
        if not file_path.exists():
            continue
        
        # Read file content
        with open(file_path, 'rb') as f:
            content = f.read()
        
        # Generate storage key
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        file_id = str(uuid.uuid4())[:8]
        storage_key = f"projects/{project_id}/drawings/{folder_id}/{timestamp}_{file_id}_{filename}"
        
        # Check if DrawingImage already exists for this filename in this folder
        existing_image_result = await db.execute(
            select(DrawingImage).where(
                DrawingImage.folder_id == uuid.UUID(folder_id),
                DrawingImage.filename == filename
            )
        )
        existing_image = existing_image_result.scalar_one_or_none()
        
        if existing_image:
            # Update existing image
            # Delete old file if storage_key is different
            if existing_image.storage_key != storage_key:
                try:
                    local_storage.delete_file(existing_image.storage_key)
                except:
                    pass  # Ignore deletion errors
            
            # Save new file
            local_storage.save_file(content, storage_key)
            
            # Update database record
            existing_image.storage_key = storage_key
            existing_image.file_size = len(content)
            existing_image.mime_type = "image/png"
            # Keep existing uploaded_by and created_at
            updated_count += 1
        else:
            # Create new image record
            # Save file
            local_storage.save_file(content, storage_key)
            
            # Create database record
            image = DrawingImage(
                folder_id=uuid.UUID(folder_id),
                uploaded_by=current_user.id,
                filename=filename,
                storage_key=storage_key,
                file_size=len(content),
                mime_type="image/png"
            )
            
            db.add(image)
            created_count += 1
        
        uploaded_count += 1
    
    # Commit database changes
    await db.commit()
    
    # Clean up temp folder (optional - could keep for debugging)
    try:
        shutil.rmtree(temp_folder)
    except:
        pass  # Ignore cleanup errors
    
    return {
        "message": "Output images generated and uploaded successfully",
        "generated_count": len(generated_images),
        "uploaded_count": uploaded_count,
        "created_count": created_count,
        "updated_count": updated_count
    }

@router.get("/{project_id}/drawing-folders/{folder_id}/download-zip")
async def download_drawing_folder_zip(
    project_id: str,
    folder_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Download a ZIP file containing all images from a drawing folder.
    
    Available to project owners and members.
    """
    from fastapi.responses import FileResponse
    import zipfile
    import tempfile
    import os
    
    # Validate project access (allows members)
    project = await check_project_access_for_drawing(db, uuid.UUID(project_id), current_user)
    
    # Get folder
    folder_result = await db.execute(
        select(DrawingFolder).where(
            DrawingFolder.id == uuid.UUID(folder_id),
            DrawingFolder.project_id == uuid.UUID(project_id)
        )
    )
    folder = folder_result.scalar_one_or_none()
    
    if not folder:
        raise HTTPException(status_code=404, detail="Drawing folder not found")
    
    # Get all images in folder
    images_result = await db.execute(
        select(DrawingImage).where(DrawingImage.folder_id == uuid.UUID(folder_id))
        .order_by(DrawingImage.created_at)
    )
    images = images_result.scalars().all()
    
    if not images:
        raise HTTPException(status_code=404, detail="No images found in this folder")
    
    # Create temporary ZIP file
    temp_zip_path = tempfile.mktemp(suffix='.zip')
    try:
        with zipfile.ZipFile(temp_zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for image in images:
                # Get file path
                file_path = local_storage.get_file_path(image.storage_key)
                
                if file_path.exists():
                    # Use original filename in ZIP
                    zipf.write(str(file_path), image.filename)
                else:
                    print(f"Warning: File not found for image {image.id}: {image.storage_key}")
        
        # Generate a safe filename from folder description or ID
        folder_id_str = str(folder.id)
        folder_name = folder.description or f"folder_{folder_id_str[:8]}"
        # Remove invalid characters from filename
        safe_folder_name = "".join(c for c in folder_name if c.isalnum() or c in (' ', '-', '_')).strip()
        safe_folder_name = safe_folder_name.replace(' ', '_')[:50]  # Limit length
        if not safe_folder_name:
            safe_folder_name = f"folder_{folder_id_str[:8]}"
        
        zip_filename = f"{safe_folder_name}_{folder_id_str[:8]}.zip"
        
        return FileResponse(
            path=temp_zip_path,
            media_type='application/zip',
            filename=zip_filename
        )
    except Exception as e:
        # Clean up temp file on error
        if os.path.exists(temp_zip_path):
            try:
                os.remove(temp_zip_path)
            except:
                pass
        raise HTTPException(status_code=500, detail=f"Failed to create ZIP file: {str(e)}")
