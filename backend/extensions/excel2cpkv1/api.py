from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Form
from fastapi.responses import JSONResponse
from typing import Dict, Any, List, Optional
import pandas as pd
import numpy as np
import tempfile
import os
from pathlib import Path
import logging
from .processor import ExcelToCPKProcessor
import httpx
import os
import asyncio
from app.core.storage import local_storage
from ..base.zip_utils import ZipFileGenerator
from app.core.database import get_db
from app.core.auth import get_current_user_optional
from app.models import ProjectAttachment, AppUser
from sqlalchemy.ext.asyncio import AsyncSession
import uuid
from datetime import datetime

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/excel2cpkv1", tags=["excel2cpkv1"])

def _create_failed_rows_summary(row_errors, row_warnings):
    """Create a summary of failed rows grouped by row number"""
    failed_rows_summary = {}
    
    # Process errors
    for error in row_errors:
        row_num = error.get("row", "unknown")
        if row_num not in failed_rows_summary:
            failed_rows_summary[row_num] = {
                "row": row_num,
                "test_name": error.get("test_name", "unknown"),
                "errors": [],
                "warnings": []
            }
        failed_rows_summary[row_num]["errors"].append({
            "issue": error.get("issue"),
            "details": error.get("details", ""),
            "values": {k: v for k, v in error.items() if k in ["usl", "lsl", "target"]}
        })
    
    # Process warnings
    for warning in row_warnings:
        row_num = warning.get("row", "unknown")
        if row_num not in failed_rows_summary:
            failed_rows_summary[row_num] = {
                "row": row_num,
                "test_name": warning.get("test_name", "unknown"),
                "errors": [],
                "warnings": []
            }
        failed_rows_summary[row_num]["warnings"].append({
            "issue": warning.get("issue"),
            "details": warning.get("details", ""),
            "values": {k: v for k, v in warning.items() if k in ["usl", "lsl", "target"]}
        })
    
    return list(failed_rows_summary.values())

# Initialize processor
try:
    processor = ExcelToCPKProcessor()
    logger.info("CPK processor initialized successfully")
except Exception as e:
    logger.error(f"Failed to initialize CPK processor: {e}")
    raise e

@router.get("/test")
async def test_endpoint():
    """Test endpoint to debug processor initialization"""
    try:
        return {"status": "ok", "processor": str(type(processor))}
    except Exception as e:
        return {"status": "error", "error": str(e)}

@router.post("/test-processor")
async def test_processor():
    """Test processor functionality"""
    try:
        # Test processor methods
        result = {
            "processor_type": str(type(processor)),
            "analyzer_type": str(type(processor.analyzer)),
            "status": "ok"
        }
        return result
    except Exception as e:
        import traceback
        return {
            "error": str(e),
            "traceback": traceback.format_exc(),
            "status": "error"
        }

@router.post("/validate")
async def validate_excel_file(file: UploadFile = File(...)):
    """Validate Excel file structure and metadata"""
    try:
        logger.info(f"Starting CPK validation for file: {file.filename}")
        
        # Save uploaded file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as tmp_file:
            content = await file.read()
            tmp_file.write(content)
            tmp_file.flush()
            logger.info(f"Saved temporary file: {tmp_file.name}")
            
            # Run validation checkpoints
            logger.info("Running checkpoint 1: Excel structure validation")
            checkpoint1 = processor.validate_excel_structure(tmp_file.name)
            logger.info(f"Checkpoint 1 result: {checkpoint1}")
            
            # If file was fixed, use the fixed file for subsequent validations
            file_to_validate = tmp_file.name
            if checkpoint1.get("fix_applied", False):
                file_to_validate = checkpoint1["fixed_file"]
                logger.info(f"Using fixed file: {file_to_validate}")
            
            # Run enhanced row-level validation for checkpoint 1
            logger.info("Running enhanced checkpoint 1: Row-level validation")
            spec_df, data_df, route = processor.analyzer.load_excel(file_to_validate)
            spec_norm = processor.analyzer.normalize_spec_columns(spec_df, route)
            enhanced_checkpoint1 = processor.analyzer.validate_checkpoint1_enhanced(spec_norm)
            logger.info(f"Enhanced checkpoint 1 result: {enhanced_checkpoint1}")
            
            # Merge enhanced validation results into checkpoint1
            checkpoint1["enhanced_validation"] = {
                "valid": enhanced_checkpoint1["valid"],
                "message": enhanced_checkpoint1["message"],
                "row_errors": enhanced_checkpoint1["row_errors"],
                "row_warnings": enhanced_checkpoint1["row_warnings"],
                "total_errors": len(enhanced_checkpoint1["row_errors"]),
                "total_warnings": len(enhanced_checkpoint1["row_warnings"])
            }
            
            # Update checkpoint1 details with enhanced validation info
            if "details" not in checkpoint1:
                checkpoint1["details"] = {}
            checkpoint1["details"].update({
                "enhanced_validation": enhanced_checkpoint1["details"],
                "failed_rows": _create_failed_rows_summary(enhanced_checkpoint1["row_errors"], enhanced_checkpoint1["row_warnings"]),
                "failed_rows_count": len(set(error.get("row", "unknown") for error in enhanced_checkpoint1["row_errors"] + enhanced_checkpoint1["row_warnings"]))
            })
            
            logger.info("Running checkpoint 2: Spec data validation")
            checkpoint2 = processor.validate_spec_data(file_to_validate)
            logger.info(f"Checkpoint 2 result: {checkpoint2}")
            
            logger.info("Running checkpoint 3: Data matching validation")
            checkpoint3 = processor.validate_data_matching(file_to_validate)
            logger.info(f"Checkpoint 3 result: {checkpoint3}")
            
            # Clean up temp files
            os.unlink(tmp_file.name)
            if checkpoint1.get("fix_applied", False):
                os.unlink(file_to_validate)
            
            # Prepare response - simplify checkpoint details to avoid large responses
            simplified_checkpoints = []
            for checkpoint in [checkpoint1, checkpoint2, checkpoint3]:
                simplified = {
                    "valid": checkpoint["valid"],
                    "checkpoint": checkpoint["checkpoint"],
                    "message": checkpoint["message"]
                }
                # Include additional details for each checkpoint
                if "details" in checkpoint:
                    simplified["details"] = checkpoint["details"]
                if "has_errors" in checkpoint:
                    simplified["has_errors"] = checkpoint["has_errors"]
                if "has_warnings" in checkpoint:
                    simplified["has_warnings"] = checkpoint["has_warnings"]
                simplified_checkpoints.append(simplified)
            
            response = {
                "valid": all(cp["valid"] for cp in simplified_checkpoints),
                "message": "All CPK validation checkpoints completed",
                "checkpoints": simplified_checkpoints
            }
            
            # Include fix information if file was fixed
            if checkpoint1.get("fix_applied", False):
                response["fix_applied"] = True
                response["fix_message"] = checkpoint1["fix_message"]
            
            logger.info("CPK validation completed successfully")
            return response
            
    except Exception as e:
        logger.error(f"CPK validation failed: {str(e)}", exc_info=True)
        import traceback
        logger.error(f"Full traceback: {traceback.format_exc()}")
        # Return the error details instead of raising HTTPException
        return JSONResponse(
            status_code=400,
            content={
                "error": f"CPK validation failed: {str(e)}",
                "traceback": traceback.format_exc(),
                "path": "/api/v1/extensions/excel2cpkv1/validate"
            }
        )

@router.post("/process")
async def process_excel_file(
    file: UploadFile = File(...),
    project_name: str = Form(...),
    project_description: str = Form(""),
    imgdir: str = Form("/tmp/")
):
    """Process Excel file and generate CSV and JSL for CPK analysis"""
    logger.info(f"Processing CPK Excel file: {file.filename}, project: {project_name}")
    try:
        # Save uploaded file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as tmp_file:
            content = await file.read()
            tmp_file.write(content)
            tmp_file.flush()
            logger.info(f"Saved temporary file: {tmp_file.name}")
            
            # Process the file
            logger.info("Starting CPK Excel processing...")
            result = processor.process_excel_file(
                tmp_file.name, 
                project_name, 
                project_description,
                imgdir
            )
            logger.info(f"Processing result: {result}")
            
            # Clean up temp file
            os.unlink(tmp_file.name)
            
            if not result["success"]:
                error_msg = result.get("error", "Processing failed")
                logger.error(f"CPK processing failed: {error_msg}")
                raise HTTPException(status_code=400, detail=error_msg)
            
            logger.info("CPK processing completed successfully")
            return {
                "success": True,
                "message": "CPK Excel file processed successfully",
                "project_name": project_name,
                "project_description": project_description,
                "files": result["files"],
                "details": result["details"],
                "validations": result["validations"],
                "missing_in_data": result["missing_in_data"]
            }
            
    except Exception as e:
        logger.error(f"Exception in process_excel_file: {str(e)}", exc_info=True)
        raise HTTPException(status_code=400, detail=f"CPK processing failed: {str(e)}")

@router.post("/create-project")
async def create_project_with_excel(
    file: UploadFile = File(...),
    project_name: str = Form(...),
    project_description: str = Form(""),
    imgdir: str = Form("/tmp/")
):
    """Create a project and process Excel file in one step"""
    try:
        # Save uploaded file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as tmp_file:
            content = await file.read()
            tmp_file.write(content)
            tmp_file.flush()
            
            # Process the file
            result = processor.process_excel_file(
                tmp_file.name, 
                project_name, 
                project_description,
                imgdir
            )
            
            # Clean up temp file
            os.unlink(tmp_file.name)
            
            if not result["success"]:
                raise HTTPException(status_code=400, detail=result["error"])
            
            # Return the processed files for project creation
            return {
                "success": True,
                "message": "CPK Excel file processed successfully",
                "project_name": project_name,
                "project_description": project_description,
                "files": result["files"],
                "details": result["details"],
                "validations": result["validations"],
                "missing_in_data": result["missing_in_data"]
            }
            
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"CPK project creation failed: {str(e)}")

@router.post("/run-analysis")
async def run_analysis_modular(
    file: UploadFile = File(...),
    project_id: str = Form(...),
    project_name: str = Form(...),
    project_description: str = Form(""),
    imgdir: str = Form("/tmp/"),
    cat_var: str = Form(None),  # Accept but ignore categorical variable for CPK
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Run complete CPK analysis using modular approach"""
    try:
        logger.info(f"Running CPK analysis for project: {project_name}")
        stage = "init"
        
        # Read uploaded file content
        content = await file.read()
        
        # Use direct Celery call instead of HTTP to ensure proper queueing
        stage = "create_run"
        from app.core.celery import celery_app
        from app.core.database import AsyncSessionLocal
        from app.core.websocket import publish_run_update
        from app.models import Run, RunStatus, Artifact
        
        run_json = None
        last_error = None
        
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
                
                logger.info(f"[CPK] Run created: {run.id}")
                
                # STEP 2: Create run folder immediately after run is created
                run_dir_key = f"runs/{str(run.id)}"
                run_dir_path = local_storage.get_file_path(run_dir_key)
                run_dir_path.mkdir(parents=True, exist_ok=True)
                
                logger.info(f"[CPK] Run folder created: {run_dir_path}")
                
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
                logger.info(f"[CPK] Saved uploaded Excel to run folder: {excel_storage_path}")
                
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
                stage = "process_excel"
                result = processor.process_excel_file(
                    str(excel_storage_path), 
                    project_name, 
                    project_description,
                    imgdir
                )
                
                if not result["success"]:
                    return JSONResponse(
                        status_code=400,
                        content={
                            "success": False,
                            "error": result.get("error", "Processing failed"),
                            "stage": stage,
                            "details": result
                        }
                    )
                
                # STEP 5: Save processed files (CSV, JSL) directly to run folder
                stage = "persist_files"
                csv_bytes = result["files"]["csv_content"].encode("utf-8")
                jsl_bytes = result["files"]["jsl_content"].encode("utf-8")
                
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
                
                logger.info(f"[CPK] Saved processed files to run folder:")
                logger.info(f"  CSV: {csv_storage_path} (size: {csv_storage_path.stat().st_size} bytes)")
                logger.info(f"  JSL: {jsl_storage_path} (size: {jsl_storage_path.stat().st_size} bytes)")
                
                # Create ZIP file with original Excel, CSV, and JSL
                stage = "create_zip"
                zip_result = ZipFileGenerator.create_analysis_zip(
                    excel_content=content,
                    excel_filename=file.filename,
                    csv_content=result["files"]["csv_content"],
                    jsl_content=result["files"]["jsl_content"],
                    analysis_type="cpk"
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
                    
                    logger.info(f"[CPK] Created ZIP file attachment: {zip_key}")
                    zip_info = zip_result
                else:
                    error_msg = zip_result.get('error', 'Unknown error') if zip_result else 'Zip creation failed'
                    logger.error(f"[CPK] Failed to create ZIP file: {error_msg}")
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
                
                logger.info(f"[CPK] Artifacts created for all files in run folder:")
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
                    logger.info("[CPK] Replaced existing Open() header and comments in JSL")
                else:
                    modified_jsl_content = jsl_header + jsl_content
                    logger.info("[CPK] Prepended Open() header and comments to JSL")
                
                # Write modified JSL to task folder
                jsl_dst.write_text(modified_jsl_content, encoding='utf-8')
                
                logger.info(f"[CPK] Added JSL header with metadata:")
                logger.info(f"[CPK]   Run ID: {str(run.id)}")
                logger.info(f"[CPK]   Task Folder ID: {jmp_task_id}")
                logger.info(f"[CPK]   Created: {create_time}")

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
                logger.info(f"[CPK] Queuing Celery task 'run_jmp_boxplot' for run {run.id}")
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
                logger.error(f"[CPK] Failed to create run directly: {e}", exc_info=True)
                return JSONResponse(
                    status_code=400,
                    content={
                        "success": False,
                        "error": f"Failed to create run: {last_error}",
                        "stage": stage
                    },
                )
        
        return {
            "success": True, 
            "message": "Run created and queued", 
            "run": run_json, 
            "storage": {"csv_key": csv_storage_key, "jsl_key": jsl_storage_key, "zip_key": zip_key},
            "zip_info": zip_info
        }
    except Exception as e:
        logger.error(f"[CPK] Error running analysis: {e}", exc_info=True)
        return JSONResponse(status_code=400, content={"success": False, "error": str(e), "stage": locals().get("stage", "unknown")})

@router.post("/load-file")
async def load_excel_file(file: UploadFile = File(...)):
    """Load Excel file and analyze structure"""
    try:
        logger.info(f"Loading CPK Excel file: {file.filename}")
        
        # Save uploaded file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as tmp_file:
            content = await file.read()
            tmp_file.write(content)
            tmp_file.flush()
            
            # Load file using analyzer
            spec_df, data_df, route = processor.analyzer.load_excel(tmp_file.name)
            fai_columns = processor.analyzer.find_fai_columns(data_df)
            
            # Clean up temp file
            os.unlink(tmp_file.name)
            
            return {
                "success": True,
                "message": "Excel file loaded successfully",
                "route": route,
                "spec_shape": spec_df.shape,
                "data_shape": data_df.shape,
                "fai_columns": fai_columns,
                "fai_columns_count": len(fai_columns),
                "sheets": ["spec", "data"],  # CPK uses spec/data sheets
                "meta_shape": spec_df.shape,
                "data_shape": data_df.shape,
                "meta_columns": spec_df.columns.tolist(),
                "data_columns": data_df.columns.tolist(),
                "categorical_columns": ["CPK_Analysis"],  # Dummy categorical variable for CPK
                "missing_required_columns": []  # No missing columns for CPK
            }
            
    except Exception as e:
        logger.error(f"Error loading CPK Excel file: {str(e)}", exc_info=True)
        return JSONResponse(
            status_code=400,
            content={
                "success": False,
                "error": str(e)
            }
        )

@router.post("/set-categorical")
async def set_categorical_variable(
    file: UploadFile = File(...),
    cat_var: str = Form("dummy")
):
    """Set categorical variable for analysis - CPK doesn't require categorical grouping"""
    try:
        logger.info(f"Setting categorical variable for CPK: {cat_var}")
        
        # Save uploaded file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as tmp_file:
            content = await file.read()
            tmp_file.write(content)
            tmp_file.flush()
            
            # Load file first
            spec_df, data_df, route = processor.analyzer.load_excel(tmp_file.name)
            
            # For CPK analysis, we don't actually need categorical grouping
            # Just return success with dummy values
            # Clean up temp file
            os.unlink(tmp_file.name)
            
            return {
                "success": True,
                "message": "CPK analysis doesn't require categorical grouping - proceeding with process capability analysis",
                "categorical_variable": "CPK_Analysis",
                "unique_values": 1,
                "total_values": len(data_df),
                "note": "Process Capability analysis works on individual variables without grouping",
                "available_categorical_columns": ["CPK_Analysis"]
            }
            
    except Exception as e:
        logger.error(f"Error setting categorical variable for CPK: {str(e)}", exc_info=True)
        return JSONResponse(
            status_code=400,
            content={
                "success": False,
                "error": str(e)
            }
        )

@router.post("/validate-data")
async def validate_data_modular(
    file: UploadFile = File(...),
    cat_var: str = Form("dummy")
):
    """Validate data using modular approach - CPK validation logic"""
    try:
        logger.info(f"Validating CPK data (categorical variable not required)")
        
        # Save uploaded file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as tmp_file:
            content = await file.read()
            tmp_file.write(content)
            tmp_file.flush()
            
            # Load file and perform CPK-specific validation
            spec_df, data_df, route = processor.analyzer.load_excel(tmp_file.name)
            
            # Convert column names to lowercase
            spec_df.columns = spec_df.columns.str.lower()
            
            # Handle column name mappings as per CPK logic
            if "y variable" in spec_df.columns:
                spec_df["test_name"] = spec_df["y variable"]
            if "usl" in spec_df.columns:
                spec_df["usl"] = spec_df["usl"]
            if "lsl" in spec_df.columns:
                spec_df["lsl"] = spec_df["lsl"]
            if "target" in spec_df.columns:
                spec_df["target"] = spec_df["target"]
            
            # Perform additional validations
            spec_norm = processor.analyzer.normalize_spec_columns(spec_df, route)
            fai_cols = processor.analyzer.find_fai_columns(data_df)
            matched_spec, missing_in_data = processor.analyzer.match_spec_to_data(spec_norm, fai_cols)
            
            # Clean up temp file
            os.unlink(tmp_file.name)
            
            # Prepare validation results in the format expected by frontend
            checkpoints = []
            
            # Checkpoint 1: Enhanced validation with row-level checks
            checkpoint1_result = processor.analyzer.validate_checkpoint1_enhanced(spec_norm)
            checkpoints.append({
                "valid": checkpoint1_result["valid"],
                "checkpoint": 1,
                "message": checkpoint1_result["message"],
                "details": checkpoint1_result["details"],
                "row_errors": checkpoint1_result["row_errors"],
                "row_warnings": checkpoint1_result["row_warnings"]
            })
            
            # Checkpoint 2: Column mappings validation
            column_mappings = {
                "y_variable_mapped": "y variable" in spec_df.columns,
                "usl_mapped": "usl" in spec_df.columns,
                "lsl_mapped": "lsl" in spec_df.columns,
                "target_mapped": "target" in spec_df.columns
            }
            checkpoint2_valid = all(column_mappings.values())
            checkpoint2_message = "All column mappings successful" if checkpoint2_valid else "Some column mappings failed"
            checkpoints.append({
                "valid": checkpoint2_valid,
                "checkpoint": 2,
                "message": checkpoint2_message,
                "details": {
                    "column_mappings": column_mappings,
                    "route": route,
                    "sheets": ["spec", "data"] if route == "spec" else ["meta", "data"]
                }
            })
            
            # Checkpoint 3: FAI columns and data matching validation
            checkpoint3_valid = len(fai_cols) > 0 and len(missing_in_data) == 0
            checkpoint3_message = f"Found {len(fai_cols)} FAI columns, {len(matched_spec)} spec rows matched" if checkpoint3_valid else f"FAI columns: {len(fai_cols)}, Missing in data: {len(missing_in_data)}"
            checkpoints.append({
                "valid": checkpoint3_valid,
                "checkpoint": 3,
                "message": checkpoint3_message,
                "details": {
                    "fai_columns_found": len(fai_cols),
                    "matched_spec_rows": len(matched_spec),
                    "missing_in_data_rows": len(missing_in_data),
                    "fai_columns": fai_cols,
                    "data_columns": data_df.columns.tolist()
                }
            })
            
            # Overall validation result
            overall_valid = all(checkpoint["valid"] for checkpoint in checkpoints)
            
            # Get additional validations for compatibility
            validations = processor.analyzer.validate_spec(spec_norm)
            
            # Convert validations DataFrames to JSON-serializable format
            serializable_validations = {}
            for key, df in validations.items():
                if isinstance(df, pd.DataFrame):
                    # Convert DataFrame to list of dictionaries, handling numpy types
                    serializable_validations[key] = df.replace({np.nan: None}).to_dict('records')
                else:
                    serializable_validations[key] = df
            
            # Convert missing_in_data DataFrame to JSON-serializable format
            serializable_missing_in_data = missing_in_data.replace({np.nan: None}).to_dict('records') if len(missing_in_data) > 0 else []
            
            # Count total errors and warnings from all checkpoints
            total_errors = sum(len(cp.get("row_errors", [])) for cp in checkpoints)
            total_warnings = sum(len(cp.get("row_warnings", [])) for cp in checkpoints)
            
            # Collect all failed rows from all checkpoints
            all_failed_rows = []
            all_warning_rows = []
            
            for checkpoint in checkpoints:
                # Add errors from this checkpoint
                for error in checkpoint.get("row_errors", []):
                    error["checkpoint"] = checkpoint["checkpoint"]
                    all_failed_rows.append(error)
                
                # Add warnings from this checkpoint
                for warning in checkpoint.get("row_warnings", []):
                    warning["checkpoint"] = checkpoint["checkpoint"]
                    all_warning_rows.append(warning)
            
            # Sort failed rows by row number for better readability
            all_failed_rows.sort(key=lambda x: x.get("row", 0))
            all_warning_rows.sort(key=lambda x: x.get("row", 0))
            
            # Create summary of failed rows by row number
            failed_rows_summary = {}
            for error in all_failed_rows:
                row_num = error.get("row", "unknown")
                if row_num not in failed_rows_summary:
                    failed_rows_summary[row_num] = {
                        "row": row_num,
                        "test_name": error.get("test_name", "unknown"),
                        "errors": [],
                        "warnings": []
                    }
                failed_rows_summary[row_num]["errors"].append({
                    "checkpoint": error.get("checkpoint"),
                    "issue": error.get("issue"),
                    "details": error.get("details", ""),
                    "values": {k: v for k, v in error.items() if k in ["usl", "lsl", "target"]}
                })
            
            # Add warnings to the summary
            for warning in all_warning_rows:
                row_num = warning.get("row", "unknown")
                if row_num not in failed_rows_summary:
                    failed_rows_summary[row_num] = {
                        "row": row_num,
                        "test_name": warning.get("test_name", "unknown"),
                        "errors": [],
                        "warnings": []
                    }
                failed_rows_summary[row_num]["warnings"].append({
                    "checkpoint": warning.get("checkpoint"),
                    "issue": warning.get("issue"),
                    "details": warning.get("details", ""),
                    "values": {k: v for k, v in warning.items() if k in ["usl", "lsl", "target"]}
                })
            
            validation_results = {
                "valid": overall_valid,
                "message": "CPK data validation completed" if overall_valid else "CPK validation completed with issues",
                "checkpoints": checkpoints,
                "route": route,
                "sheets": ["spec", "data"] if route == "spec" else ["meta", "data"],
                "spec_columns": spec_df.columns.tolist(),
                "data_columns": data_df.columns.tolist(),
                "required_columns": ["test_name", "usl", "lsl", "target"],
                "missing_required_columns": checkpoint1_result["details"].get("missing_columns", []),
                "column_mappings": column_mappings,
                "fai_columns_found": len(fai_cols),
                "matched_spec_rows": len(matched_spec),
                "missing_in_data_rows": len(missing_in_data),
                "missing_in_data": serializable_missing_in_data,
                "validations": serializable_validations,
                "has_errors": not overall_valid or total_errors > 0,
                "has_warnings": total_warnings > 0 or any(k.startswith("Warning_") for k in validations.keys()),
                "total_errors": total_errors,
                "total_warnings": total_warnings,
                "failed_rows": list(failed_rows_summary.values()),
                "failed_rows_count": len(failed_rows_summary),
                "all_errors": all_failed_rows,
                "all_warnings": all_warning_rows
            }
            
            return validation_results
            
    except Exception as e:
        logger.error(f"Error validating CPK data: {str(e)}", exc_info=True)
        return JSONResponse(
            status_code=400,
            content={
                "success": False,
                "error": str(e)
            }
        )

@router.post("/process-data")
async def process_data_modular(
    file: UploadFile = File(...),
    cat_var: str = Form("dummy")
):
    """Process data using modular approach - CPK doesn't require categorical grouping"""
    try:
        logger.info(f"Processing CPK data (categorical variable not required)")
        
        # Save uploaded file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as tmp_file:
            content = await file.read()
            tmp_file.write(content)
            tmp_file.flush()
            
            # Load file
            spec_df, data_df, route = processor.analyzer.load_excel(tmp_file.name)
            spec_norm = processor.analyzer.normalize_spec_columns(spec_df, route)
            fai_cols = processor.analyzer.find_fai_columns(data_df)
            matched_spec, missing_in_data = processor.analyzer.match_spec_to_data(spec_norm, fai_cols)
            
            # Clean up temp file
            os.unlink(tmp_file.name)
            
            return {
                "success": True,
                "message": "CPK data processing completed (no categorical grouping required)",
                "route": route,
                "fai_columns_found": len(fai_cols),
                "matched_spec_rows": len(matched_spec),
                "missing_in_data_rows": len(missing_in_data),
                "fai_columns": fai_cols,
                "missing_in_data": missing_in_data.to_dict() if not missing_in_data.empty else {},
                "note": "Process Capability analysis processes individual variables without grouping"
            }
            
    except Exception as e:
        logger.error(f"Error processing CPK data: {str(e)}", exc_info=True)
        return JSONResponse(
            status_code=400,
            content={
                "success": False,
                "error": str(e)
            }
        )

@router.post("/generate-files")
async def generate_files_modular(
    file: UploadFile = File(...),
    cat_var: str = Form("dummy"),
    imgdir: str = Form("/tmp/")
):
    """Generate CSV and JSL files using modular approach - CPK doesn't require categorical grouping"""
    try:
        logger.info(f"Generating CPK files (categorical variable not required)")
        
        # Save uploaded file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as tmp_file:
            content = await file.read()
            tmp_file.write(content)
            tmp_file.flush()
            
            # Process the file
            result = processor.process_excel_file(tmp_file.name, "CPK Analysis", "", imgdir)
            
            # Clean up temp file
            os.unlink(tmp_file.name)
            
            if not result["success"]:
                return JSONResponse(
                    status_code=400,
                    content={
                        "success": False,
                        "error": result["error"]
                    }
                )
            
            return {
                "success": True,
                "message": "CPK files generated successfully (no categorical grouping required)",
                "files": result["files"],
                "details": result["details"],
                "note": "Process Capability analysis generates files for individual variables without grouping"
            }
            
    except Exception as e:
        logger.error(f"Error generating CPK files: {str(e)}", exc_info=True)
        return JSONResponse(
            status_code=400,
            content={
                "success": False,
                "error": str(e)
            }
        )
