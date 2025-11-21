from fastapi import APIRouter, UploadFile, File, HTTPException, Form, Depends
from fastapi.responses import JSONResponse
from typing import Dict, Any, Optional
import tempfile
import os
import logging
import httpx
import pandas as pd
import uuid
import asyncio
from datetime import datetime
from pathlib import Path

from .file_handler import FileHandlerV2
from .data_validator import DataValidator
from .data_process import DataProcessor
from .file_processor import FileProcessor
from .analysis_runner import AnalysisRunner
from app.core.storage import local_storage
from ..base.zip_utils import ZipFileGenerator
from app.core.database import get_db
from app.core.auth import get_current_user_optional
from app.models import ProjectAttachment, AppUser
from sqlalchemy.ext.asyncio import AsyncSession


logger = logging.getLogger(__name__)

router = APIRouter(prefix="/excel2boxplotv2", tags=["excel2boxplotv2"])

# Initialize processors
try:
    file_handler = FileHandlerV2()
    validator = DataValidator()
    data_processor = DataProcessor()
    file_processor = FileProcessor()
    analysis_runner = AnalysisRunner()
    logger.info("[V2] Processors initialized successfully")
except Exception as e:
    logger.error(f"[V2] Failed to initialize processors: {e}")
    raise e


@router.post("/load-file")
async def load_excel_file(file: UploadFile = File(...)):
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as tmp_file:
            content = await file.read()
            tmp_file.write(content)
            tmp_file.flush()
            result = file_handler.load_excel_file(tmp_file.name)
        os.unlink(tmp_file.name)
        return result
    except Exception as e:
        logger.error(f"[V2] Error loading Excel: {e}", exc_info=True)
        return JSONResponse(status_code=400, content={"success": False, "error": str(e)})


@router.post("/set-categorical")
async def set_categorical_variable(file: UploadFile = File(...), cat_var: str = Form(...)):
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as tmp_file:
            content = await file.read()
            tmp_file.write(content)
            tmp_file.flush()
            load_result = file_handler.load_excel_file(tmp_file.name)
            if not load_result.get("success"):
                return load_result
            result = file_handler.set_categorical_variable(cat_var)
        os.unlink(tmp_file.name)
        return result
    except Exception as e:
        logger.error(f"[V2] Error setting categorical: {e}", exc_info=True)
        return JSONResponse(status_code=400, content={"success": False, "error": str(e)})


@router.post("/validate-data")
async def validate_data_modular(file: UploadFile = File(...), cat_var: str = Form(...)):
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as tmp_file:
            content = await file.read()
            tmp_file.write(content)
            tmp_file.flush()
            load_result = file_handler.load_excel_file(tmp_file.name)
            if not load_result.get("success"):
                return load_result
            df_meta = file_handler.df_meta
            df_data = file_handler.df_data_raw
            result = validator.run_full_validation(df_meta, df_data, cat_var)
        os.unlink(tmp_file.name)
        return result
    except Exception as e:
        logger.error(f"[V2] Error validating data: {e}", exc_info=True)
        return JSONResponse(status_code=400, content={"success": False, "error": str(e)})


@router.post("/process-data")
async def process_data_modular(file: UploadFile = File(...), cat_var: str = Form(...)):
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as tmp_file:
            content = await file.read()
            tmp_file.write(content)
            tmp_file.flush()
            load_result = file_handler.load_excel_file(tmp_file.name)
            if not load_result.get("success"):
                return load_result
            df_meta = file_handler.df_meta
            df_data = file_handler.df_data_raw
            fai_columns = file_handler.fai_columns
            result = data_processor.process_data(df_meta, df_data, fai_columns, cat_var)
            if result.get("success"):
                result.pop("processed_data", None)
        os.unlink(tmp_file.name)
        return result
    except Exception as e:
        logger.error(f"[V2] Error processing data: {e}", exc_info=True)
        return JSONResponse(status_code=400, content={"success": False, "error": str(e)})


@router.post("/generate-files")
async def generate_files_modular(
    file: UploadFile = File(...),
    cat_var: str = Form(...),
    color_by: str = Form(None),
):
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as tmp_file:
            content = await file.read()
            tmp_file.write(content)
            tmp_file.flush()
            load_result = file_handler.load_excel_file(tmp_file.name)
            if not load_result.get("success"):
                return load_result
            df_meta = file_handler.df_meta
            df_data = file_handler.df_data_raw
            fai_columns = file_handler.fai_columns
            process_result = data_processor.process_data(df_meta, df_data, fai_columns, cat_var)
            if not process_result.get("success"):
                return process_result
            result = file_processor.generate_files(
                df_meta,
                process_result["processed_data"],
                process_result["boundaries"],
                cat_var,
                fai_columns,
                color_by,
            )
        os.unlink(tmp_file.name)
        return result
    except Exception as e:
        logger.error(f"[V2] Error generating files: {e}", exc_info=True)
        return JSONResponse(status_code=400, content={"success": False, "error": str(e)})


@router.post("/run-analysis")
async def run_analysis_modular(
    file: UploadFile = File(...),
    cat_var: str = Form(...),
    project_id: str = Form(...),
    project_name: str = Form(...),
    project_description: str = Form(""),
    color_by: str = Form(None),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    try:
        stage = "init"
        
        # Read uploaded file content
        content = await file.read()
        
        # Use direct Celery call instead of HTTP to ensure proper queueing
        stage = "create_run"
        from app.core.celery import celery_app
        from app.core.database import AsyncSessionLocal
        from app.core.websocket import publish_run_update
        from app.models import Run, RunStatus, Artifact, ProjectAttachment
        from sqlalchemy import select
        
        run_json = None
        last_error = None
        tmp_file_path = None
        zip_key = None
        zip_info = None
        csv_storage_key = None
        jsl_storage_key = None
        
        # STEP 1: Create run record and folder FIRST (before processing)
        async with AsyncSessionLocal() as create_db:
            try:
                run = Run(
                    project_id=uuid.UUID(project_id),
                    started_by=current_user.id if current_user else None,
                    status=RunStatus.QUEUED,
                    task_name="jmp_boxplot",
                    message="Run queued"
                )
                create_db.add(run)
                await create_db.commit()
                await create_db.refresh(run)
                
                logger.info(f"[V2] Run created: {run.id}")
                
                # STEP 2: Create run folder immediately after run is created
                run_dir_key = f"runs/{str(run.id)}"
                run_dir_path = local_storage.get_file_path(run_dir_key)
                run_dir_path.mkdir(parents=True, exist_ok=True)
                
                logger.info(f"[V2] Run folder created: {run_dir_path}")
                
                # STEP 3: Save uploaded Excel to run folder
                original_filename = file.filename or "original.xlsx"
                base = Path(original_filename).stem or "original"
                ext = Path(original_filename).suffix or ".xlsx"
                ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
                uid = str(uuid.uuid4())[:8]
                excel_filename = f"original_{ts}_{uid}{ext}"
                excel_storage_key = f"{run_dir_key}/{excel_filename}"
                excel_storage_path = local_storage.get_file_path(excel_storage_key)
                
                excel_storage_path.write_bytes(content)
                logger.info(f"[V2] Saved uploaded Excel to run folder: {excel_storage_path}")
                
                # Create artifact for original Excel file
                excel_artifact = Artifact(
                    project_id=uuid.UUID(project_id),
                    run_id=run.id,
                    kind="input_excel",
                    storage_key=str(excel_storage_path.resolve()),
                    filename=excel_filename,
                    mime_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                )
                create_db.add(excel_artifact)
                await create_db.commit()
                
                # STEP 4: Process Excel file from run folder
                stage = "load_file"
                load_result = file_handler.load_excel_file(str(excel_storage_path))
                if not load_result.get("success"):
                    return JSONResponse(status_code=400, content={"success": False, "error": load_result.get("error", "Load failed"), "stage": stage, "details": load_result})
                
                df_meta = file_handler.df_meta
                df_data = file_handler.df_data_raw
                fai_columns = file_handler.fai_columns
                
                stage = "process_data"
                process_result = data_processor.process_data(df_meta, df_data, fai_columns, cat_var)
                if not process_result.get("success"):
                    return JSONResponse(status_code=400, content={"success": False, "error": process_result.get("error", "Process failed"), "stage": stage, "details": process_result})
                
                stage = "generate_files"
                file_result = file_processor.generate_files(
                    df_meta,
                    process_result["processed_data"],
                    process_result["boundaries"],
                    cat_var,
                    fai_columns,
                    color_by,
                )
                if not file_result.get("success"):
                    return JSONResponse(status_code=400, content={"success": False, "error": file_result.get("error", "File generation failed"), "stage": stage, "details": file_result})
                
                # STEP 5: Save processed files (CSV, JSL) directly to run folder
                stage = "persist_files"
                csv_bytes = file_result["files"]["csv_content"].encode("utf-8")
                jsl_bytes = file_result["files"]["jsl_content"].encode("utf-8")
                
                ts_files = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
                short_uid = str(uuid.uuid4())[:8]
                csv_filename = f"data_{ts_files}_{short_uid}.csv"
                jsl_filename = f"analysis_{ts_files}_{short_uid}.jsl"
                
                csv_storage_key = f"{run_dir_key}/{csv_filename}"
                jsl_storage_key = f"{run_dir_key}/{jsl_filename}"
                csv_storage_path = local_storage.get_file_path(csv_storage_key)
                jsl_storage_path = local_storage.get_file_path(jsl_storage_key)
                
                csv_storage_path.write_bytes(csv_bytes)
                jsl_storage_path.write_bytes(jsl_bytes)
                
                # CRITICAL: Set JSL file permissions to prevent macOS auto-opening
                jsl_storage_path.chmod(0o644)  # rw-r--r--
                
                logger.info(f"[V2] Saved processed files to run folder:")
                logger.info(f"  CSV: {csv_storage_path} (size: {csv_storage_path.stat().st_size} bytes)")
                logger.info(f"  JSL: {jsl_storage_path} (size: {jsl_storage_path.stat().st_size} bytes)")
                
                # Create ZIP file with original Excel, CSV, and JSL
                stage = "create_zip"
                zip_result = ZipFileGenerator.create_analysis_zip(
                    excel_content=content,
                    excel_filename=file.filename,
                    csv_content=file_result["files"]["csv_content"],
                    jsl_content=file_result["files"]["jsl_content"],
                    analysis_type="boxplot"
                )
                
                zip_key = None
                zip_info = None
                if zip_result and zip_result.get("success"):
                    # Save ZIP file to storage
                    zip_key = local_storage.generate_project_attachment_key(project_id, f"analysis_{file.filename}.zip")
                    with open(zip_result["zip_path"], 'rb') as zip_file:
                        zip_content = zip_file.read()
                    local_storage.save_file(zip_content, zip_key)
                    
                    # Clean up temporary ZIP file
                    os.unlink(zip_result["zip_path"])
                    
                    logger.info(f"[V2] Created ZIP file attachment: {zip_key}")
                    zip_info = zip_result
                else:
                    error_msg = zip_result.get('error', 'Unknown error') if zip_result else 'Zip creation failed'
                    logger.error(f"[V2] Failed to create ZIP file: {error_msg}")
                    zip_info = None
                
                # STEP 6: Create artifact records for CSV and JSL
                csv_artifact = Artifact(
                    project_id=uuid.UUID(project_id),
                    run_id=run.id,
                    kind="input_csv",
                    storage_key=str(csv_storage_path.resolve()),
                    filename=csv_filename,
                    mime_type="text/csv"
                )
                
                jsl_artifact = Artifact(
                    project_id=uuid.UUID(project_id),
                    run_id=run.id,
                    kind="input_jsl",
                    storage_key=str(jsl_storage_path.resolve()),
                    filename=jsl_filename,
                    mime_type="text/plain"
                )
                
                create_db.add(csv_artifact)
                create_db.add(jsl_artifact)
                await create_db.commit()
                await create_db.refresh(csv_artifact)
                await create_db.refresh(jsl_artifact)
                
                logger.info(f"[V2] Artifacts created for all files in run folder:")
                logger.info(f"  Excel artifact storage_key: {excel_artifact.storage_key}")
                logger.info(f"  CSV artifact storage_key: {csv_artifact.storage_key}")
                logger.info(f"  JSL artifact storage_key: {jsl_artifact.storage_key}")
                
                # STEP 7: Prepare task folder and task id BEFORE enqueuing Celery
                from datetime import timezone
                ts_task = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
                task_uid = str(uuid.uuid4())[:8]
                jmp_task_id = f"{ts_task}_{task_uid}"
                # Use settings.TASKS_DIRECTORY to match Celery worker and jmp_runner
                from app.core.config import settings
                tasks_root = Path(settings.TASKS_DIRECTORY).expanduser().resolve()
                task_dir = tasks_root / f"task_{jmp_task_id}"
                task_dir.mkdir(parents=True, exist_ok=True)

                # Copy files from run folder to task folder
                csv_dst = task_dir / csv_storage_path.name
                jsl_dst = task_dir / jsl_storage_path.name
                
                # Copy CSV file as-is
                csv_dst.write_bytes(csv_storage_path.read_bytes())
                
                # Read JSL file and ensure header Open() points to absolute CSV path in task folder
                jsl_content = jsl_storage_path.read_text(encoding='utf-8')
                absolute_csv_path = str(csv_dst.resolve())
                
                # Create comment lines with metadata
                create_time = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
                jsl_header = f"""// JSL Script generated by Auto-JMP Platform
// Run ID: {str(run.id)}
// Task Folder ID: {jmp_task_id}
// Created: {create_time}
// CSV File: {csv_dst.name}
Open("{absolute_csv_path}");
"""
                
                # Replace existing Open("..."); header and comments if present, otherwise prepend
                import re
                # Pattern to match comment lines at the start, followed by Open() statement
                pattern = r'(?:^\s*//.*?\n)*\s*Open\(".*?"\);\s*\n?'
                if re.search(pattern, jsl_content, flags=re.MULTILINE):
                    modified_jsl_content = re.sub(pattern, jsl_header, jsl_content, count=1, flags=re.MULTILINE)
                    logger.info("[V2] Replaced existing Open() header and comments in JSL")
                else:
                    modified_jsl_content = jsl_header + jsl_content
                    logger.info("[V2] Prepended Open() header and comments to JSL")
                
                # Write modified JSL to task folder
                jsl_dst.write_text(modified_jsl_content, encoding='utf-8')
                
                logger.info(f"[V2] Added JSL header with metadata:")
                logger.info(f"[V2]   Run ID: {str(run.id)}")
                logger.info(f"[V2]   Task Folder ID: {jmp_task_id}")
                logger.info(f"[V2]   Created: {create_time}")

                # Verify copies
                if not csv_dst.exists() or not jsl_dst.exists():
                    raise RuntimeError(f"Failed to copy files into task folder: {task_dir}")

                # Persist task id on run
                run.jmp_task_id = jmp_task_id
                await create_db.commit()

                # Notify frontend
                await publish_run_update(str(run.id), {
                    "type": "task_prepared",
                    "run_id": str(run.id),
                    "status": "queued",
                    "message": f"Task folder ready: task_{jmp_task_id}",
                    "task_dir": str(task_dir)
                })
                
                # STEP 8: Queue Celery task directly (only after task folder is prepared)
                logger.info(f"[V2] Queuing Celery task 'run_jmp_boxplot' for run {run.id}")
                celery_app.send_task("run_jmp_boxplot", args=[str(run.id)])
                
                # Publish initial status
                await publish_run_update(str(run.id), {
                    "type": "run_created",
                    "run_id": str(run.id),
                    "status": "queued",
                    "message": "Run queued for processing"
                })
                
                run_json = {
                    "id": str(run.id),
                    "project_id": str(run.project_id),
                    "status": run.status.value,
                    "task_name": run.task_name,
                    "message": run.message,
                    "image_count": run.image_count,
                    "created_at": run.created_at.isoformat() if run.created_at else None,
                    "started_at": run.started_at.isoformat() if run.started_at else None,
                    "finished_at": run.finished_at.isoformat() if run.finished_at else None,
                    "jmp_task_id": run.jmp_task_id
                }
                
            except Exception as e:
                last_error = str(e)
                logger.error(f"[V2] Failed to create run directly: {e}", exc_info=True)
                return JSONResponse(
                    status_code=400,
                    content={
                        "success": False,
                        "error": f"Failed to create run: {last_error}",
                        "stage": stage
                    },
                )
            
            # Add ZIP file as project attachment directly to database (using create_db session)
            stage = "add_attachment"
            run_id = run_json.get("id") if run_json else None
            if run_id and zip_key and zip_result:
                try:
                    # Create project attachment record directly in database
                    attachment = ProjectAttachment(
                        project_id=uuid.UUID(project_id),
                        uploaded_by=current_user.id if current_user else None,
                        filename=f"analysis_{file.filename}.zip",
                        description=f"Auto generated with {file.filename}",
                        storage_key=zip_key,
                        file_size=zip_result.get("zip_size", 0) if zip_result else 0,
                        mime_type="application/zip"
                    )
                    
                    create_db.add(attachment)
                    await create_db.commit()
                    
                    logger.info(f"[V2] Successfully created ZIP attachment for run {run_id}")
                except Exception as e:
                    logger.error(f"[V2] Error creating ZIP attachment: {str(e)}")
                    await create_db.rollback()
            else:
                logger.info(f"[V2] Skipping ZIP attachment creation for run {run_id}")
        
        return {
            "success": True, 
            "message": "Run created and queued", 
            "run": run_json, 
            "storage": {"csv_key": csv_storage_key, "jsl_key": jsl_storage_key, "zip_key": zip_key},
            "zip_info": zip_info
        }
    except Exception as e:
        logger.error(f"[V2] Error running analysis: {e}", exc_info=True)
        return JSONResponse(status_code=400, content={"success": False, "error": str(e), "stage": locals().get("stage", "unknown")})


