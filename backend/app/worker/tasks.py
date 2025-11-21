import asyncio
import os
import sys
import uuid
import logging
import re
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
from app.core.config import settings, get_jmp_max_wait_time
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
    
    IMPORTANT: This task MUST ONLY be called through Celery (send_task or delay).
    Direct function calls are NOT allowed.
    
    Args:
        run_id: UUID string of the run to process
        
    Returns:
        Dict with task result information
    """
    # CRITICAL: Verify this is being called by Celery, not directly
    if not hasattr(self, 'request') or not self.request:
        error_msg = "CRITICAL ERROR: run_jmp_boxplot called directly, not through Celery!"
        logger.error("="*80)
        logger.error(error_msg)
        logger.error("This task MUST ONLY be called via celery_app.send_task() or .delay()")
        logger.error("="*80)
        return {"status": "failed", "error": error_msg}
    
    task_id = self.request.id
    logger.info("="*80)
    logger.info("[WORKER] Celery task 'run_jmp_boxplot' RECEIVED")
    logger.info(f"[WORKER] Celery task_id: {task_id}")
    logger.info(f"[WORKER] Run ID: {run_id}")
    logger.info(f"[WORKER] Current time: {datetime.utcnow().isoformat()}")
    logger.info(f"[WORKER] Called by Celery: {hasattr(self, 'request')}")
    logger.info("="*80)
    
    async def process_run():
        """Async function to process the run."""
        # Track final state for single database commit at the end
        final_status = None
        final_message = None
        final_image_count = 0
        final_error = None
        
        async with AsyncSessionLocal() as db:
            try:
                # Get the run (read-only, no commit)
                result = await db.execute(select(Run).where(Run.id == uuid.UUID(run_id)))
                run = result.scalar_one_or_none()
                
                if not run:
                    raise ValueError(f"Run {run_id} not found")
                
                # Publish status update (WebSocket only, no database write)
                await publish_run_update(run_id, {
                    "type": "run_started",
                    "run_id": run_id,
                    "status": "running",
                    "message": "Starting JMP analysis..."
                })
                
                # Get input artifacts (read-only, no commit)
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
                
                # CRITICAL: Get jmp_task_id from run record - task folder should already be prepared
                if not run.jmp_task_id:
                    raise ValueError(f"Run {run_id} does not have jmp_task_id - task folder not prepared")
                
                # Construct task folder path
                tasks_root = Path(settings.TASKS_DIRECTORY).expanduser().resolve()
                task_dir = tasks_root / f"task_{run.jmp_task_id}"
                
                logger.info("="*80)
                logger.info("[WORKER] Using task folder (prepared by API)")
                logger.info(f"[WORKER] jmp_task_id: {run.jmp_task_id}")
                logger.info(f"[WORKER] Task directory: {task_dir}")
                logger.info(f"[WORKER] Task directory exists: {task_dir.exists()}")
                logger.info("="*80)
                
                if not task_dir.exists():
                    raise FileNotFoundError(f"Task folder not found: {task_dir}")
                
                # Get CSV and JSL files from task folder (these were copied by API)
                csv_path = None
                jsl_path = None
                
                # Find CSV and JSL files in task folder
                for file_path in task_dir.glob("*"):
                    if file_path.is_file():
                        if file_path.suffix.lower() == '.csv':
                            csv_path = file_path
                        elif file_path.suffix.lower() == '.jsl':
                            jsl_path = file_path
                
                if not csv_path or not jsl_path:
                    # Fallback: use artifact filenames if files match
                    csv_filename = csv_artifact.filename
                    jsl_filename = jsl_artifact.filename
                    csv_path = task_dir / csv_filename
                    jsl_path = task_dir / jsl_filename
                
                logger.info(f"[WORKER] CSV file from task folder: {csv_path}")
                logger.info(f"[WORKER] JSL file from task folder: {jsl_path}")
                logger.info(f"[WORKER] CSV exists: {csv_path.exists() if csv_path else False}")
                logger.info(f"[WORKER] JSL exists: {jsl_path.exists() if jsl_path else False}")
                
                # Verify files exist in task folder
                if csv_path.exists():
                    csv_size = csv_path.stat().st_size
                    logger.info(f"[WORKER] CSV file size: {csv_size} bytes")
                else:
                    logger.error(f"[WORKER] CSV file NOT FOUND in task folder: {csv_path}")
                
                if jsl_path.exists():
                    jsl_size = jsl_path.stat().st_size
                    logger.info(f"[WORKER] JSL file size: {jsl_size} bytes")
                else:
                    logger.error(f"[WORKER] JSL file NOT FOUND in task folder: {jsl_path}")
                
                if not csv_path.exists() or not jsl_path.exists():
                    error_msg = f"Files not found in task folder. CSV: {csv_path.exists()}, JSL: {jsl_path.exists()}"
                    logger.error(f"[WORKER] {error_msg}")
                    raise FileNotFoundError(error_msg)
                
                # Update progress
                await publish_run_update(run_id, {
                    "type": "run_progress",
                    "run_id": run_id,
                    "status": "running",
                    "message": "Processing files with JMP from task folder..."
                })
                
                # Create background monitoring task to check image count every 3 seconds
                monitoring_active = asyncio.Event()
                monitoring_active.set()  # Start active
                
                async def monitor_image_count():
                    """Background task to monitor image count in task folder every 3 seconds."""
                    last_count = -1  # Start at -1 to ensure first update (even if count is 0) is sent
                    while monitoring_active.is_set():
                        try:
                            # Count PNG files in task folder
                            png_files = list(task_dir.glob("*.png"))
                            current_count = len(png_files)
                            
                            # Send update if count changed (including initial update when last_count is -1)
                            if current_count != last_count:
                                last_count = current_count
                                
                                # Check if monitoring is still active
                                if not monitoring_active.is_set():
                                    break
                                
                                # Only send WebSocket update (no database updates to avoid concurrent access)
                                # Database will be updated by the main process when it completes
                                update_data = {
                                    "type": "run_progress",
                                    "run_id": run_id,
                                    "status": "running",
                                    "image_count": current_count
                                }
                                
                                if current_count > 0:
                                    update_data["message"] = f"Generated {current_count} image{'s' if current_count != 1 else ''} so far..."
                                else:
                                    update_data["message"] = "Monitoring task folder for images..."
                                
                                await publish_run_update(run_id, update_data)
                                logger.info(f"[MONITOR] Task folder {task_dir}: {current_count} images found - WebSocket update sent")
                            
                            # Wait 3 seconds before next check (check flag during sleep)
                            for _ in range(30):  # 30 * 0.1 = 3 seconds
                                if not monitoring_active.is_set():
                                    break
                                await asyncio.sleep(0.1)
                            
                        except asyncio.CancelledError:
                            logger.info("[MONITOR] Monitoring task cancelled")
                            raise  # Re-raise to properly cancel the task
                        except Exception as e:
                            logger.error(f"[MONITOR] Error monitoring image count: {e}")
                            if monitoring_active.is_set():
                                await asyncio.sleep(3)  # Continue even on error, but only if still active
                            else:
                                break  # Exit if monitoring is no longer active
                
                # Start background monitoring task
                monitor_task = asyncio.create_task(monitor_image_count())
                logger.info(f"[MONITOR] Started background image count monitoring for task folder: {task_dir}")
                
                # Run JMP analysis - jmp_runner will use the task folder directly
                # Pass the task_id so jmp_runner knows which task folder to use
                # Get timeout from database setting, with fallback to config
                max_wait_time = await get_jmp_max_wait_time(db)
                logger.info(f"[WORKER] Using timeout setting: {max_wait_time} seconds ({max_wait_time / 60:.1f} minutes)")
                jmp_runner = JMPRunner(
                    base_task_dir=settings.TASKS_DIRECTORY,
                    max_wait_time=max_wait_time, 
                    jmp_start_delay=6
                )
                
                # Define callback to notify frontend when task folder is ready and CSV is found
                # Since we're in an async context (process_run), we can schedule tasks directly
                def sync_callback(task_id: str, task_dir: str, csv_filename: str):
                    """Synchronous callback wrapper that schedules async notification."""
                    async def notify_frontend():
                        await publish_run_update(run_id, {
                            "type": "task_ready",
                            "run_id": run_id,
                            "status": "running",
                            "message": f"Task folder created and CSV file found: {csv_filename}",
                            "task_id": task_id,
                            "task_dir": task_dir,
                            "csv_filename": csv_filename
                        })
                    
                    # Schedule the coroutine in the current event loop
                    # Since process_run() is async, the loop should be running
                    try:
                        # Get the running event loop (preferred method for Python 3.7+)
                        loop = asyncio.get_running_loop()
                        # Schedule the coroutine without blocking
                        asyncio.create_task(notify_frontend())
                    except RuntimeError:
                        # No running loop (shouldn't happen, but handle gracefully)
                        # This should not occur since we're inside an async function
                        logger.warning("Could not get running event loop for task_ready notification")
                
                # Define progress callback to notify frontend of detailed progress updates
                def progress_callback(message: str):
                    """Synchronous callback wrapper that schedules async progress notification."""
                    # Extract image count from progress message
                    image_count = None
                    # Look for patterns like "Found X images" or "Generated X images"
                    match = re.search(r'(?:Found|Generated)\s+(\d+)\s+images?', message, re.IGNORECASE)
                    if match:
                        image_count = int(match.group(1))
                    
                    # Only send WebSocket updates (no database updates to avoid concurrent access)
                    # Database will be updated by the main process when it completes
                    async def notify_frontend():
                        update_data = {
                            "type": "run_progress",
                            "run_id": run_id,
                            "status": "running",
                            "message": message
                        }
                        if image_count is not None:
                            update_data["image_count"] = image_count
                            update_data["message"] = f"Generated {image_count} image{'s' if image_count != 1 else ''} so far..."
                        await publish_run_update(run_id, update_data)
                    
                    # Schedule the coroutine in the current event loop
                    try:
                        loop = asyncio.get_running_loop()
                        asyncio.create_task(notify_frontend())
                    except RuntimeError:
                        logger.warning("Could not get running event loop for progress notification")
                
                # Run the analysis with retry on transient 'file not found' failures
                # Pass task_id so jmp_runner uses the task folder directly (files already there)
                try:
                    last_result = None
                    for attempt in range(3):
                        result = jmp_runner.run_csv_jsl(
                            csv_path=str(csv_path),
                            jsl_path=str(jsl_path),
                            task_id=run.jmp_task_id,  # Pass task_id so jmp_runner uses existing task folder
                            on_task_ready=sync_callback,
                            on_progress=progress_callback
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
                finally:
                    # Stop monitoring task when JMP execution completes (success or failure)
                    logger.info("[MONITOR] Stopping background image monitoring task...")
                    monitoring_active.clear()
                    
                    # Give the monitoring task a chance to see the flag and exit gracefully
                    await asyncio.sleep(0.1)
                    
                    # Now cancel the task if it's still running
                    if not monitor_task.done():
                        monitor_task.cancel()
                        try:
                            # Wait for monitoring task to fully complete (no DB operations, so should be quick)
                            await asyncio.wait_for(monitor_task, timeout=1.0)
                        except asyncio.CancelledError:
                            logger.info("[MONITOR] Background image monitoring task cancelled")
                        except asyncio.TimeoutError:
                            logger.warning("[MONITOR] Monitoring task did not stop within timeout")
                        except Exception as e:
                            logger.warning(f"[MONITOR] Error stopping monitoring task: {e}")
                    
                    logger.info("[MONITOR] Monitoring task fully stopped")
                
                # Determine final state based on result (no database writes yet)
                if result.get("status") == "completed":
                    # Get final image count from task folder (more accurate than result)
                    final_png_files = list(task_dir.glob("*.png"))
                    final_image_count = len(final_png_files)
                    
                    # Set final state variables (will be committed at the end)
                    final_status = RunStatus.SUCCEEDED
                    final_message = "Analysis completed successfully"
                    final_image_count = final_image_count
                    
                    # Send WebSocket update immediately (no database write)
                    await publish_run_update(run_id, {
                        "type": "run_completed",
                        "run_id": run_id,
                        "status": "succeeded",
                        "message": "Analysis completed successfully",
                        "image_count": final_image_count
                    })
                
                if result.get("status") == "completed":
                    
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
                            artifact_msg = f"Created artifact for {filename}"
                            logger.info(artifact_msg)
                            
                            # Broadcast artifact creation progress via WebSocket
                            try:
                                await publish_run_update(run_id, {
                                    "type": "run_progress",
                                    "run_id": run_id,
                                    "status": "running",
                                    "message": artifact_msg,
                                    "artifact": filename
                                })
                            except Exception as ws_err:
                                logger.warning(f"Failed to send artifact WebSocket update: {ws_err}")
                    
                    # Process OCR results to create text artifacts
                    if ocr_results:
                        await _process_ocr_results(db, run, ocr_results, result.get("task_dir", ""), run_id)
                    
                    # Note: No database commit here - all commits happen at the end
                else:
                    # Set final state for failure case (no database writes yet)
                    final_status = RunStatus.FAILED
                    final_message = f"Analysis failed: {result.get('error', 'Unknown error')}"
                    final_error = result.get("error", "Unknown error")
                    
                    # If a failure image was generated, register it as an artifact (will be committed at end)
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
                                artifact_msg = f"Registered failure image artifact: {filename}"
                                logger.info(artifact_msg)
                                
                                # Broadcast failure artifact creation via WebSocket
                                try:
                                    await publish_run_update(run_id, {
                                        "type": "run_progress",
                                        "run_id": run_id,
                                        "status": "running",
                                        "message": artifact_msg,
                                        "artifact": filename
                                    })
                                except Exception as ws_err:
                                    logger.warning(f"Failed to send failure artifact WebSocket update: {ws_err}")
                    except Exception as artifact_err:
                        logger.error("Failed to register failure image artifact: %s", artifact_err)
                    
                    # Publish failure update (WebSocket only, no database write)
                    await publish_run_update(run_id, {
                        "type": "run_failed",
                        "run_id": run_id,
                        "status": "failed",
                        "message": final_message
                    })
                
                # CRITICAL: Single final database commit with all final state
                # This happens once at the end, avoiding all intermediate database conflicts
                # Ensure final_status is set (safety check)
                if final_status is None:
                    logger.warning("final_status was not set, defaulting to FAILED")
                    final_status = RunStatus.FAILED
                    final_message = final_message or "Task status unknown"
                
                try:
                    # Prepare update values for final commit
                    # Only commit final summary: status, finished_at, message, image_count
                    update_values = {
                        "status": final_status,
                        "finished_at": datetime.utcnow(),
                        "message": final_message or "Task completed"
                    }
                    
                    # Set started_at if not already set (should be set by API, but ensure it's there)
                    if not run.started_at:
                        update_values["started_at"] = datetime.utcnow()
                    
                    if final_status == RunStatus.SUCCEEDED:
                        update_values["image_count"] = final_image_count
                    elif final_status == RunStatus.FAILED:
                        update_values["jmp_task_id"] = result.get("task_id", "")
                    
                    # Single database update and commit
                    await db.execute(
                        update(Run)
                        .where(Run.id == uuid.UUID(run_id))
                        .values(**update_values)
                    )
                    await db.commit()
                    logger.info(f"✅ Final database commit: Status={final_status}, Images={final_image_count if final_status == RunStatus.SUCCEEDED else 0}")
                except Exception as db_err:
                    logger.error(f"❌ Failed final database commit: {db_err}")
                    # Try rollback and retry once
                    try:
                        await db.rollback()
                        update_values = {
                            "status": final_status,
                            "finished_at": datetime.utcnow(),
                            "message": final_message
                        }
                        if final_status == RunStatus.SUCCEEDED:
                            update_values["image_count"] = final_image_count
                        elif final_status == RunStatus.FAILED:
                            update_values["jmp_task_id"] = result.get("task_id", "")
                        
                        await db.execute(
                            update(Run)
                            .where(Run.id == uuid.UUID(run_id))
                            .values(**update_values)
                        )
                        await db.commit()
                        logger.info(f"✅ Final database commit succeeded after retry")
                    except Exception as retry_err:
                        logger.error(f"❌ Final database commit failed even after retry: {retry_err}")
                        # Continue anyway - WebSocket updates were already sent
                
                # Check if queue mode is enabled and process next queued task
                await asyncio.sleep(1)
                await _process_next_queued_task(db)
                
                # Return final result
                if final_status == RunStatus.SUCCEEDED:
                    return {
                        "success": True,
                        "run_id": run_id,
                        "message": "Analysis completed successfully",
                        "image_count": final_image_count
                    }
                else:
                    return {
                        "success": False,
                        "run_id": run_id,
                        "error": final_error or "Unknown error"
                    }
                    
            except Exception as e:
                # Set final state for exception case
                final_status = RunStatus.FAILED
                final_message = f"Task failed: {str(e)}"
                final_error = str(e)
                
                # Wait for any pending async operations to complete
                await asyncio.sleep(0.5)
                
                # Single final database commit for exception case
                try:
                    await db.execute(
                        update(Run)
                        .where(Run.id == uuid.UUID(run_id))
                        .values(
                            status=RunStatus.FAILED,
                            finished_at=datetime.utcnow(),
                            message=final_message,
                            jmp_task_id=""  # No JMP task ID for exception cases
                        )
                    )
                    await db.commit()
                    logger.info(f"✅ Final database commit (exception): Status=FAILED")
                except Exception as db_err:
                    logger.error(f"❌ Failed final database commit (exception): {db_err}")
                    # Try rollback and retry once
                    try:
                        await db.rollback()
                        await db.execute(
                            update(Run)
                            .where(Run.id == uuid.UUID(run_id))
                            .values(
                                status=RunStatus.FAILED,
                                finished_at=datetime.utcnow(),
                                message=final_message,
                                jmp_task_id=""
                            )
                        )
                        await db.commit()
                        logger.info(f"✅ Final database commit succeeded after retry (exception)")
                    except Exception as retry_err:
                        logger.error(f"❌ Final database commit failed even after retry (exception): {retry_err}")
                
                # Publish failure update (WebSocket only)
                await publish_run_update(run_id, {
                    "type": "run_failed",
                    "run_id": run_id,
                    "status": "failed",
                    "message": final_message
                })
                
                # Check if queue mode is enabled and process next queued task
                await asyncio.sleep(1)
                await _process_next_queued_task(db)
                
                raise e
        
        async def _process_ocr_results(db, run, ocr_results: Dict, task_dir: str, run_id: str):
            """
            Process OCR results and create text artifacts.
            
            Args:
                db: Database session
                run: Run object
                ocr_results: OCR processing results
                task_dir: Task directory path
                run_id: Run ID for WebSocket broadcasts
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
                        
                        artifact_msg = f"Created OCR text artifact for initial.png: {len(initial_text)} characters"
                        logger.info(artifact_msg)
                        
                        # Broadcast OCR artifact creation via WebSocket
                        try:
                            await publish_run_update(run_id, {
                                "type": "run_progress",
                                "run_id": run_id,
                                "status": "running",
                                "message": artifact_msg,
                                "artifact": "initial_ocr.txt"
                            })
                        except Exception as ws_err:
                            logger.warning(f"Failed to send OCR artifact WebSocket update: {ws_err}")
                
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
                        
                        artifact_msg = f"Created OCR text artifact for final.png: {len(final_text)} characters"
                        logger.info(artifact_msg)
                        
                        # Broadcast OCR artifact creation via WebSocket
                        try:
                            await publish_run_update(run_id, {
                                "type": "run_progress",
                                "run_id": run_id,
                                "status": "running",
                                "message": artifact_msg,
                                "artifact": "final_ocr.txt"
                            })
                        except Exception as ws_err:
                            logger.warning(f"Failed to send OCR artifact WebSocket update: {ws_err}")
                
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
                    
                    artifact_msg = "Created OCR summary artifact"
                    logger.info(artifact_msg)
                    
                    # Broadcast OCR summary artifact creation via WebSocket
                    try:
                        await publish_run_update(run_id, {
                            "type": "run_progress",
                            "run_id": run_id,
                            "status": "running",
                            "message": artifact_msg,
                            "artifact": "ocr_summary.json"
                        })
                    except Exception as ws_err:
                        logger.warning(f"Failed to send OCR summary WebSocket update: {ws_err}")
                
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
    return {"status": "ok"}

@celery_app.task(name="send_scheduled_notifications")
def send_scheduled_notifications():
    """Check and send scheduled daily notifications."""
    import asyncio
    from datetime import datetime, timezone
    from app.models import ScheduledNotification, AppUser, NotificationType
    from app.services.notification_service import NotificationService
    
    async def process_scheduled_notifications():
        async with AsyncSessionLocal() as db:
            # Get current time in UTC
            now_utc = datetime.now(timezone.utc)
            current_time_str = now_utc.strftime("%H:%M")
            
            # Get all active scheduled notifications
            result = await db.execute(
                select(ScheduledNotification).where(
                    ScheduledNotification.is_active == True
                )
            )
            scheduled_notifications = result.scalars().all()
            
            sent_count = 0
            for scheduled in scheduled_notifications:
                try:
                    # Check if it's time to send (compare HH:MM)
                    if scheduled.scheduled_time == current_time_str:
                        # Check if we already sent today (compare dates, not times)
                        if scheduled.last_sent_at:
                            last_sent_date = scheduled.last_sent_at.date()
                            today = now_utc.date()
                            if last_sent_date == today:
                                # Already sent today, skip
                                continue
                        
                        # Get all users
                        users_result = await db.execute(select(AppUser))
                        users = users_result.scalars().all()
                        
                        # Send notifications to all users
                        for user in users:
                            try:
                                await NotificationService.create_notification(
                                    db=db,
                                    user_id=user.id,
                                    notification_type=NotificationType.ANNOUNCEMENT,
                                    title=scheduled.title,
                                    message=scheduled.message
                                )
                            except Exception as e:
                                logger.error(f"Failed to create notification for user {user.id}: {e}")
                                continue
                        
                        # Send to webhooks
                        try:
                            from app.api.v1.endpoints.admin import get_webhooks_from_settings, send_to_webhook, ensure_default_webhook
                            await ensure_default_webhook(db)
                            webhooks = await get_webhooks_from_settings(db)
                            
                            for webhook in webhooks:
                                try:
                                    await send_to_webhook(
                                        webhook["url"],
                                        scheduled.title,
                                        scheduled.message,
                                        secret=webhook.get("secret")
                                    )
                                except Exception as e:
                                    logger.error(f"Failed to send to webhook {webhook.get('url')}: {e}")
                                    continue
                        except Exception as e:
                            logger.error(f"Error sending to webhooks: {e}")
                            # Continue even if webhook sending fails
                        
                        # Update last_sent_at
                        scheduled.last_sent_at = now_utc
                        await db.commit()
                        sent_count += 1
                        logger.info(f"Sent scheduled notification: {scheduled.title} at {current_time_str}")
                        
                except Exception as e:
                    logger.error(f"Error processing scheduled notification {scheduled.id}: {e}")
                    continue
            
            return {"sent_count": sent_count, "checked_at": current_time_str}
    
    return asyncio.run(process_scheduled_notifications())