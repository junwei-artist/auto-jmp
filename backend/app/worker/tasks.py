import asyncio
import os
import sys
import uuid
from datetime import datetime
from typing import Dict, Any

from celery import current_task
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

# Add the backend directory to the Python path
backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, backend_dir)

from app.core.celery import celery_app
from app.core.database import AsyncSessionLocal
from app.core.websocket import publish_run_update
from app.models import Run, RunStatus, Artifact

# Import JMPRunner from the backend directory
try:
    from jmp_runner import JMPRunner
except ImportError as e:
    print(f"Failed to import JMPRunner: {e}")
    print(f"Python path: {sys.path}")
    print(f"Backend dir: {backend_dir}")
    print(f"Files in backend dir: {os.listdir(backend_dir)}")
    raise

@celery_app.task(bind=True, name="run_jmp_boxplot")
def run_jmp_boxplot(self, run_id: str) -> Dict[str, Any]:
    """
    Celery task to run JMP boxplot analysis.
    
    Args:
        run_id: UUID string of the run to process
        
    Returns:
        Dict with task result information
    """
    task_id = self.request.id
    
    async def process_run():
        """Async function to process the run."""
        async with AsyncSessionLocal() as db:
            try:
                # Get the run
                result = await db.execute(select(Run).where(Run.id == uuid.UUID(run_id)))
                run = result.scalar_one_or_none()
                
                if not run:
                    raise ValueError(f"Run {run_id} not found")
                
                # Update status to RUNNING
                await db.execute(
                    update(Run)
                    .where(Run.id == uuid.UUID(run_id))
                    .values(
                        status=RunStatus.RUNNING,
                        started_at=datetime.utcnow(),
                        message="Starting JMP analysis..."
                    )
                )
                await db.commit()
                
                # Publish status update
                await publish_run_update(run_id, {
                    "type": "run_started",
                    "run_id": run_id,
                    "status": "running",
                    "message": "Starting JMP analysis..."
                })
                
                # Get input artifacts
                artifacts_result = await db.execute(
                    select(Artifact).where(
                        Artifact.run_id == uuid.UUID(run_id),
                        Artifact.kind.in_(["input_csv", "input_jsl"])
                    )
                )
                artifacts = artifacts_result.scalars().all()
                
                csv_artifact = None
                jsl_artifact = None
                
                for artifact in artifacts:
                    if artifact.kind == "input_csv":
                        csv_artifact = artifact
                    elif artifact.kind == "input_jsl":
                        jsl_artifact = artifact
                
                if not csv_artifact or not jsl_artifact:
                    raise ValueError("Missing CSV or JSL input files")
                
                # Update progress
                await publish_run_update(run_id, {
                    "type": "run_progress",
                    "run_id": run_id,
                    "status": "running",
                    "message": "Processing files with JMP..."
                })
                
                # Run JMP analysis
                jmp_runner = JMPRunner()
                
                # Get file paths from storage
                csv_path = f"uploads/{csv_artifact.storage_key}"
                jsl_path = f"uploads/{jsl_artifact.storage_key}"
                
                # Run the analysis
                result = jmp_runner.run_csv_jsl(
                    csv_path=csv_path,
                    jsl_path=jsl_path
                )
                
                if result.get("status") == "completed":
                    # Update run status to SUCCEEDED
                    await db.execute(
                        update(Run)
                        .where(Run.id == uuid.UUID(run_id))
                        .values(
                            status=RunStatus.SUCCEEDED,
                            finished_at=datetime.utcnow(),
                            message="Analysis completed successfully",
                            image_count=result.get("image_count", 0),
                            jmp_task_id=result.get("task_id", "")
                        )
                    )
                    
                    # Create output artifacts
                    if result.get("images"):
                        for image_file in result["images"]:
                            # Use the actual task directory path as storage key
                            task_dir = result.get("task_dir", "")
                            actual_image_path = f"{task_dir}/{image_file}" if task_dir else image_file
                            
                            artifact = Artifact(
                                project_id=run.project_id,
                                run_id=run.id,
                                kind="output_image",
                                storage_key=actual_image_path,
                                filename=image_file,
                                mime_type="image/png"
                            )
                            db.add(artifact)
                    
                    await db.commit()
                    
                    # Publish success update
                    await publish_run_update(run_id, {
                        "type": "run_completed",
                        "run_id": run_id,
                        "status": "succeeded",
                        "message": "Analysis completed successfully",
                        "image_count": result.get("image_count", 0)
                    })
                    
                    return {
                        "success": True,
                        "run_id": run_id,
                        "message": "Analysis completed successfully",
                        "image_count": result.get("image_count", 0)
                    }
                else:
                    # Update run status to FAILED
                    await db.execute(
                        update(Run)
                        .where(Run.id == uuid.UUID(run_id))
                        .values(
                            status=RunStatus.FAILED,
                            finished_at=datetime.utcnow(),
                            message=f"Analysis failed: {result.get('error', 'Unknown error')}"
                        )
                    )
                    await db.commit()
                    
                    # Publish failure update
                    await publish_run_update(run_id, {
                        "type": "run_failed",
                        "run_id": run_id,
                        "status": "failed",
                        "message": f"Analysis failed: {result.get('error', 'Unknown error')}"
                    })
                    
                    return {
                        "success": False,
                        "run_id": run_id,
                        "error": result.get("error", "Unknown error")
                    }
                    
            except Exception as e:
                # Update run status to FAILED
                await db.execute(
                    update(Run)
                    .where(Run.id == uuid.UUID(run_id))
                    .values(
                        status=RunStatus.FAILED,
                        finished_at=datetime.utcnow(),
                        message=f"Task failed: {str(e)}"
                    )
                )
                await db.commit()
                
                # Publish failure update
                await publish_run_update(run_id, {
                    "type": "run_failed",
                    "run_id": run_id,
                    "status": "failed",
                    "message": f"Task failed: {str(e)}"
                })
                
                raise e
    
    # Run the async function
    return asyncio.run(process_run())

@celery_app.task(name="health_check")
def health_check():
    """Simple health check task."""
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}