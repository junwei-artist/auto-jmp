from celery import Celery
from celery.signals import worker_ready, worker_shutdown
import os
import sys
from pathlib import Path

# Add the project root to Python path
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models import Run, RunStatus, Artifact
from app.core.websocket import publish_run_update
from jmp_runner import JMPRunner
import boto3
import tempfile
import shutil
from datetime import datetime
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create Celery app
celery_app = Celery(
    "data_analysis_worker",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=["app.worker.tasks"]
)

# Celery configuration
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=1800,  # 30 minutes
    task_soft_time_limit=1500,  # 25 minutes
    worker_prefetch_multiplier=1,  # Process one task at a time for JMP
    task_acks_late=True,
    worker_disable_rate_limits=True,
)

# S3 client for file operations
def get_s3_client():
    """Get S3 client configured for the storage backend."""
    if settings.S3_ENDPOINT_URL:
        return boto3.client(
            's3',
            endpoint_url=settings.S3_ENDPOINT_URL,
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            region_name=settings.AWS_REGION
        )
    else:
        return boto3.client(
            's3',
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            region_name=settings.AWS_REGION
        )

@worker_ready.connect
def worker_ready_handler(sender=None, **kwargs):
    """Called when worker is ready."""
    logger.info("JMP Worker is ready and waiting for tasks")

@worker_shutdown.connect
def worker_shutdown_handler(sender=None, **kwargs):
    """Called when worker is shutting down."""
    logger.info("JMP Worker is shutting down")

# Task definition moved to app.worker.tasks

async def get_run_data(run_id: str):
    """Get run data from database."""
    async with AsyncSessionLocal() as db:
        from sqlalchemy import select
        result = await db.execute(select(Run).where(Run.id == run_id))
        run = result.scalar_one_or_none()
        return run

async def update_run_status(run_id: str, status: RunStatus, message: str, image_count: int = 0):
    """Update run status in database."""
    async with AsyncSessionLocal() as db:
        from sqlalchemy import select
        result = await db.execute(select(Run).where(Run.id == run_id))
        run = result.scalar_one_or_none()
        
        if run:
            run.status = status
            run.message = message
            if image_count > 0:
                run.image_count = image_count
            
            if status == RunStatus.RUNNING and not run.started_at:
                run.started_at = datetime.utcnow()
            elif status in [RunStatus.SUCCEEDED, RunStatus.FAILED, RunStatus.CANCELED]:
                run.finished_at = datetime.utcnow()
            
            await db.commit()

async def download_input_files(run_id: str, temp_dir: Path):
    """Download CSV and JSL files from storage."""
    async with AsyncSessionLocal() as db:
        from sqlalchemy import select
        result = await db.execute(
            select(Artifact).where(
                Artifact.run_id == run_id,
                Artifact.kind.in_(["input_csv", "input_jsl"])
            )
        )
        artifacts = result.scalars().all()
        
        csv_path = None
        jsl_path = None
        
        s3_client = get_s3_client()
        
        for artifact in artifacts:
            local_path = temp_dir / artifact.filename
            
            try:
                s3_client.download_file(
                    settings.S3_BUCKET,
                    artifact.storage_key,
                    str(local_path)
                )
                
                if artifact.kind == "input_csv":
                    csv_path = local_path
                elif artifact.kind == "input_jsl":
                    jsl_path = local_path
                    
            except Exception as e:
                logger.error(f"Failed to download {artifact.filename}: {e}")
                raise
        
        if not csv_path or not jsl_path:
            raise Exception("Failed to download required input files")
        
        return csv_path, jsl_path

async def upload_output_files(run_id: str, temp_dir: Path, image_files: list):
    """Upload generated images to storage."""
    async with AsyncSessionLocal() as db:
        s3_client = get_s3_client()
        uploaded_count = 0
        
        for image_file in image_files:
            image_path = temp_dir / image_file
            
            if image_path.exists():
                # Generate storage key
                storage_key = f"projects/{run_id}/outputs/images/{image_file}"
                
                try:
                    # Upload to S3
                    s3_client.upload_file(
                        str(image_path),
                        settings.S3_BUCKET,
                        storage_key
                    )
                    
                    # Create artifact record
                    artifact = Artifact(
                        project_id=run_id,  # This should be the project_id, not run_id
                        run_id=run_id,
                        kind="output_png",
                        storage_key=storage_key,
                        filename=image_file,
                        size_bytes=image_path.stat().st_size,
                        mime_type="image/png"
                    )
                    db.add(artifact)
                    uploaded_count += 1
                    
                except Exception as e:
                    logger.error(f"Failed to upload {image_file}: {e}")
        
        await db.commit()
        return uploaded_count

if __name__ == "__main__":
    celery_app.start()
