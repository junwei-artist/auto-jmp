import asyncio
import os
import sys
import uuid
import logging
from datetime import datetime
from typing import Dict, Any
from pathlib import Path

from celery import current_task
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, func

# Add the backend directory to the Python path
backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, backend_dir)

from app.core.celery import celery_app
from app.core.database import AsyncSessionLocal
from app.core.websocket import publish_run_update
from app.core.storage import local_storage
from app.models import Run, RunStatus, Artifact, AppSetting

logger = logging.getLogger(__name__)

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
    logger.info("[Worker] run_jmp_boxplot received: task_id=%s run_id=%s", task_id, run_id)
    
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
                
                # Run JMP analysis with reasonable timeout
                jmp_runner = JMPRunner(max_wait_time=300, jmp_start_delay=6)  # allow JMP window to focus
                
                # Get file paths from storage using the storage system
                csv_path = local_storage.get_file_path(csv_artifact.storage_key)
                jsl_path = local_storage.get_file_path(jsl_artifact.storage_key)

                # Guard against legacy absolute paths from older runs
                legacy_prefix = "/Users/lytech/Documents/GitHub/auto-jmp/backend/uploads/"
                if str(csv_path).startswith(legacy_prefix):
                    csv_path = local_storage.get_file_path(csv_artifact.storage_key)
                if str(jsl_path).startswith(legacy_prefix):
                    jsl_path = local_storage.get_file_path(jsl_artifact.storage_key)
                
                # Debug logging
                print(f"Celery worker - CSV path: {csv_path}")
                print(f"Celery worker - JSL path: {jsl_path}")
                print(f"Celery worker - CSV exists: {os.path.exists(csv_path)}")
                print(f"Celery worker - JSL exists: {os.path.exists(jsl_path)}")
                print(f"Celery worker - Current working directory: {os.getcwd()}")
                
                # Ensure files exist with simple retry (3 attempts, 3s interval)
                for attempt in range(3):
                    csv_exists = os.path.exists(csv_path)
                    jsl_exists = os.path.exists(jsl_path)
                    if csv_exists and jsl_exists:
                        break
                    if attempt < 2:
                        print(f"Retry {attempt+1}/3: waiting for files to be available...")
                        await asyncio.sleep(3)
                
                # Run the analysis with retry on transient 'file not found' failures
                last_result = None
                for attempt in range(3):
                    result = jmp_runner.run_csv_jsl(
                        csv_path=str(csv_path),
                        jsl_path=str(jsl_path)
                    )
                    last_result = result
                    err = (result or {}).get("error", "")
                    # If success or non-file-not-found error, stop retrying
                    if (result or {}).get("status") == "completed":
                        break
                    if "file not found" not in err.lower():
                        break
                    if attempt < 2:
                        print(f"Retry {attempt+1}/3: file not found, retrying in 3s...")
                        await asyncio.sleep(3)
                result = last_result or {"status": "failed", "error": "Unknown error"}
                
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
                    
                    # Process OCR results first to determine which images to save
                    ocr_results = result.get("ocr_results", {})
                    
                    # Create output artifacts - only for images that passed OCR or don't need OCR
                    if result.get("images"):
                        for image_file in result["images"]:
                            # Check if this is initial.png or final.png that needs OCR validation
                            needs_ocr = image_file in ["initial.png", "final.png"]
                            
                            # Skip creating artifact if OCR failed for this image
                            if needs_ocr and ocr_results:
                                if image_file == "initial.png" and not ocr_results.get("initial", {}).get("success", False):
                                    logger.info(f"Skipping artifact creation for {image_file} - OCR failed")
                                    continue
                                elif image_file == "final.png" and not ocr_results.get("final", {}).get("success", False):
                                    logger.info(f"Skipping artifact creation for {image_file} - OCR failed")
                                    continue
                            
                            # Use the actual task directory path as storage key
                            task_dir = result.get("task_dir", "")
                            filename = os.path.basename(image_file)
                            # Normalize task_dir by stripping absolute path parts if present
                            if os.path.isabs(task_dir):
                                # Remove root up to 'tasks/'
                                tasks_index = task_dir.find('tasks')
                                if tasks_index >= 0:
                                    task_dir = task_dir[tasks_index:]
                                else:
                                    # fallback to just the last part
                                    task_dir = os.path.basename(task_dir)
                            storage_key = f"{task_dir}/{filename}" if task_dir else filename
                            storage_key = storage_key.lstrip('/') # no leading slash
                            artifact = Artifact(
                                project_id=run.project_id,
                                run_id=run.id,
                                kind="output_image",
                                storage_key=storage_key,
                                filename=filename,
                                mime_type="image/png"
                            )
                            db.add(artifact)
                            logger.info(f"Created artifact for {image_file}")
                    
                    # Process OCR results to create text artifacts
                    if ocr_results:
                        await _process_ocr_results(db, run, ocr_results, result.get("task_dir", ""))
                    
                    await db.commit()
                    
                    # Publish success update
                    await publish_run_update(run_id, {
                        "type": "run_completed",
                        "run_id": run_id,
                        "status": "succeeded",
                        "message": "Analysis completed successfully",
                        "image_count": result.get("image_count", 0)
                    })
                    
                    # Check if queue mode is enabled and process next queued task
                    # Small delay to ensure all I/O and logging completes before starting next
                    await asyncio.sleep(1)
                    await _process_next_queued_task(db)
                    
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
                            message=f"Analysis failed: {result.get('error', 'Unknown error')}",
                            jmp_task_id=result.get("task_id", "")
                        )
                    )
                    # If a failure image was generated, register it as an artifact
                    try:
                        images = result.get("images", []) or []
                        task_dir = result.get("task_dir", "")
                        for image_file in images:
                            # Only register the explicit failure image
                            if image_file.endswith("failure_error.png"):
                                # Determine actual path and filename
                                if "/" in image_file or "\\" in image_file:
                                    actual_image_path = image_file
                                    filename = Path(image_file).name
                                else:
                                    actual_image_path = f"{task_dir}/{image_file}" if task_dir else image_file
                                    filename = image_file
                                failure_artifact = Artifact(
                                    project_id=run.project_id,
                                    run_id=run.id,
                                    kind="output_image",
                                    storage_key=actual_image_path,
                                    filename=filename,
                                    mime_type="image/png"
                                )
                                db.add(failure_artifact)
                                logger.info("Registered failure image artifact: %s", filename)
                    except Exception as artifact_err:
                        logger.error("Failed to register failure image artifact: %s", artifact_err)
                    await db.commit()
                    
                    # Publish failure update
                    await publish_run_update(run_id, {
                        "type": "run_failed",
                        "run_id": run_id,
                        "status": "failed",
                        "message": f"Analysis failed: {result.get('error', 'Unknown error')}"
                    })
                    
                    # Check if queue mode is enabled and process next queued task
                    await asyncio.sleep(1)
                    await _process_next_queued_task(db)
                    
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
                        message=f"Task failed: {str(e)}",
                        jmp_task_id=""  # No JMP task ID for exception cases
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
                
                # Check if queue mode is enabled and process next queued task
                await asyncio.sleep(1)
                await _process_next_queued_task(db)
                
                raise e
        
        async def _process_ocr_results(db, run, ocr_results: Dict, task_dir: str):
            """
            Process OCR results and create text artifacts.
            
            Args:
                db: Database session
                run: Run object
                ocr_results: OCR processing results
                task_dir: Task directory path
            """
            try:
                from app.models import Artifact
                
                # Process initial.png OCR results
                initial_results = ocr_results.get("initial", {})
                if initial_results.get("success", False):
                    initial_text = initial_results.get("text", "")
                    if initial_text:
                        # Create text artifact for initial.png OCR
                        initial_artifact = Artifact(
                            project_id=run.project_id,
                            run_id=run.id,
                            kind="ocr_text",
                            storage_key=f"{task_dir}/initial_ocr.txt",
                            filename="initial_ocr.txt",
                            mime_type="text/plain",
                            metadata={
                                "source_image": "initial.png",
                                "confidence": initial_results.get("confidence", 0.0),
                                "text_length": len(initial_text)
                            }
                        )
                        db.add(initial_artifact)
                        
                        # Save OCR text to file
                        ocr_text_path = Path(task_dir) / "initial_ocr.txt"
                        ocr_text_path.write_text(initial_text, encoding="utf-8")
                        
                        logger.info(f"Created OCR text artifact for initial.png: {len(initial_text)} characters")
                
                # Process final.png OCR results
                final_results = ocr_results.get("final", {})
                if final_results.get("success", False):
                    final_text = final_results.get("text", "")
                    if final_text:
                        # Create text artifact for final.png OCR
                        final_artifact = Artifact(
                            project_id=run.project_id,
                            run_id=run.id,
                            kind="ocr_text",
                            storage_key=f"{task_dir}/final_ocr.txt",
                            filename="final_ocr.txt",
                            mime_type="text/plain",
                            metadata={
                                "source_image": "final.png",
                                "confidence": final_results.get("confidence", 0.0),
                                "text_length": len(final_text)
                            }
                        )
                        db.add(final_artifact)
                        
                        # Save OCR text to file
                        ocr_text_path = Path(task_dir) / "final_ocr.txt"
                        ocr_text_path.write_text(final_text, encoding="utf-8")
                        
                        logger.info(f"Created OCR text artifact for final.png: {len(final_text)} characters")
                
                # Create OCR results summary artifact
                if ocr_results.get("success", False):
                    ocr_summary = {
                        "initial_success": initial_results.get("success", False),
                        "final_success": final_results.get("success", False),
                        "initial_confidence": initial_results.get("confidence", 0.0),
                        "final_confidence": final_results.get("confidence", 0.0),
                        "initial_text_length": len(initial_results.get("text", "")),
                        "final_text_length": len(final_results.get("text", ""))
                    }
                    
                    summary_artifact = Artifact(
                        project_id=run.project_id,
                        run_id=run.id,
                        kind="ocr_summary",
                        storage_key=f"{task_dir}/ocr_summary.json",
                        filename="ocr_summary.json",
                        mime_type="application/json",
                        metadata=ocr_summary
                    )
                    db.add(summary_artifact)
                    
                    # Save OCR summary to file
                    import json
                    summary_path = Path(task_dir) / "ocr_summary.json"
                    summary_path.write_text(json.dumps(ocr_summary, indent=2), encoding="utf-8")
                    
                    logger.info("Created OCR summary artifact")
                
            except Exception as e:
                logger.error(f"Error processing OCR results: {e}")
                # Don't raise the exception to avoid failing the entire task
    
    # Run the async function
    return asyncio.run(process_run())

async def _process_next_queued_task(db: AsyncSession):
    """Process the next queued task if queue mode is enabled."""
    try:
        # Use a separate database session to avoid transaction conflicts
        from app.core.database import AsyncSessionLocal
        async with AsyncSessionLocal() as new_db:
            # Check queue mode setting
            queue_mode_result = await new_db.execute(
                select(AppSetting).where(AppSetting.k == "queue_mode")
            )
            queue_mode_setting = queue_mode_result.scalar_one_or_none()
            
            # Default to parallel mode (False) if not set
            queue_mode = False
            if queue_mode_setting:
                try:
                    import json
                    queue_mode = json.loads(queue_mode_setting.v)
                except:
                    queue_mode = False
            
            if not queue_mode:
                # Queue mode is disabled, nothing to do
                logger.info("Queue mode is disabled, skipping next task processing")
                return
            
            # Check if there are any running tasks
            running_tasks_count = await new_db.scalar(
                select(func.count(Run.id)).where(Run.status == RunStatus.RUNNING)
            )
            
            if running_tasks_count > 0:
                # There's still a running task, don't start another one
                logger.info(f"Found {running_tasks_count} running tasks, skipping next task processing")
                return
            
            # Find the next queued task
            next_task_result = await new_db.execute(
                select(Run)
                .where(Run.status == RunStatus.QUEUED)
                .order_by(Run.created_at.asc())
                .limit(1)
            )
            next_task = next_task_result.scalar_one_or_none()
            
            if next_task:
                # Start the next queued task after a short delay to avoid race conditions
                from app.core.celery import celery_app
                try:
                    # Small pre-delay before scheduling, give DB and filesystem time to settle
                    await asyncio.sleep(2)
                    # Schedule with additional countdown to avoid immediate overlap
                    celery_app.send_task("run_jmp_boxplot", args=[str(next_task.id)], countdown=5)
                    logger.info(f"Scheduled next queued task in 5s: {next_task.id}")
                except Exception as e:
                    logger.error(f"Failed to schedule next queued task {next_task.id}: {e}")
            else:
                logger.info("No queued tasks found to process")
            
    except Exception as e:
        logger.error(f"Error processing next queued task: {e}")
        # Don't raise the exception to avoid failing the current task

@celery_app.task(name="health_check")
def health_check():
    """Simple health check task."""
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}