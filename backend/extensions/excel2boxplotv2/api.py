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
        with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as tmp_file:
            content = await file.read()
            tmp_file.write(content)
            tmp_file.flush()
            stage = "load_file"
            load_result = file_handler.load_excel_file(tmp_file.name)
            if not load_result.get("success"):
                os.unlink(tmp_file.name)
                return JSONResponse(status_code=400, content={"success": False, "error": load_result.get("error", "Load failed"), "stage": stage, "details": load_result})
            df_meta = file_handler.df_meta
            df_data = file_handler.df_data_raw
            fai_columns = file_handler.fai_columns
            stage = "process_data"
            process_result = data_processor.process_data(df_meta, df_data, fai_columns, cat_var)
            if not process_result.get("success"):
                os.unlink(tmp_file.name)
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
                os.unlink(tmp_file.name)
                return JSONResponse(status_code=400, content={"success": False, "error": file_result.get("error", "File generation failed"), "stage": stage, "details": file_result})

            stage = "persist_files"
            csv_bytes = file_result["files"]["csv_content"].encode("utf-8")
            jsl_bytes = file_result["files"]["jsl_content"].encode("utf-8")
            csv_key = local_storage.generate_storage_key("data.csv", "text/csv")
            jsl_key = local_storage.generate_storage_key("analysis.jsl", "text/plain")
            local_storage.save_file(csv_bytes, csv_key)
            local_storage.save_file(jsl_bytes, jsl_key)
            
            # Create ZIP file with original Excel, CSV, and JSL
            stage = "create_zip"
            zip_result = ZipFileGenerator.create_analysis_zip(
                excel_content=content,
                excel_filename=file.filename,
                csv_content=file_result["files"]["csv_content"],
                jsl_content=file_result["files"]["jsl_content"],
                analysis_type="boxplot"
            )
            
            if zip_result["success"]:
                # Save ZIP file to storage
                zip_key = local_storage.generate_project_attachment_key(project_id, f"analysis_{file.filename}.zip")
                with open(zip_result["zip_path"], 'rb') as zip_file:
                    zip_content = zip_file.read()
                local_storage.save_file(zip_content, zip_key)
                
                # Clean up temporary ZIP file
                os.unlink(zip_result["zip_path"])
                
                logger.info(f"[V2] Created ZIP file attachment: {zip_key}")
            else:
                logger.error(f"[V2] Failed to create ZIP file: {zip_result.get('error')}")
                zip_key = None

            backend_base = os.getenv("NEXT_PUBLIC_BACKEND_URL", "http://localhost:4700")
            async with httpx.AsyncClient(timeout=30.0) as client:
                stage = "create_run"
                run_json = None
                last_error = None
                for attempt in range(1, 4):
                    try:
                        run_resp = await client.post(
                            f"{backend_base}/api/v1/runs/",
                            json={"project_id": project_id, "csv_key": csv_key, "jsl_key": jsl_key},
                        )
                        run_resp.raise_for_status()
                        run_json = run_resp.json()
                        break
                    except Exception as e:
                        last_error = str(e)
                        logger.warning(f"[V2] Create run attempt {attempt}/3 failed: {e}")
                        if attempt < 3:
                            await asyncio.sleep(3)
                        else:
                            # Cleanup and report failure to frontend after retries exhausted
                            os.unlink(tmp_file.name)
                            return JSONResponse(
                                status_code=400,
                                content={
                                    "success": False,
                                    "error": f"Failed to create run after 3 attempts: {last_error}",
                                    "stage": stage
                                },
                            )
                
                # Add ZIP file as project attachment directly to database
                stage = "add_attachment"
                run_id = run_json.get("id")
                if run_id and zip_key:
                    try:
                        # Create project attachment record directly in database
                        attachment = ProjectAttachment(
                            project_id=uuid.UUID(project_id),
                            uploaded_by=current_user.id if current_user else None,
                            filename=f"analysis_{file.filename}.zip",
                            description=f"Auto generated with {file.filename}",
                            storage_key=zip_key,
                            file_size=zip_result.get("zip_size", 0),
                            mime_type="application/zip"
                        )
                        
                        db.add(attachment)
                        await db.commit()
                        
                        logger.info(f"[V2] Successfully created ZIP attachment for run {run_id}")
                    except Exception as e:
                        logger.error(f"[V2] Error creating ZIP attachment: {str(e)}")
                        await db.rollback()
                else:
                    logger.info(f"[V2] Skipping ZIP attachment creation for run {run_id}")
                
                # Save original Excel into per-run folder for traceability
                try:
                    if run_id:
                        run_dir_key = f"runs/{run_id}"
                        run_dir_path = local_storage.get_file_path(run_dir_key)
                        run_dir_path.mkdir(parents=True, exist_ok=True)
                        original_name = file.filename or "original.xlsx"
                        base = Path(original_name).stem or "original"
                        ext = Path(original_name).suffix or ".xlsx"
                        ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
                        uid = str(uuid.uuid4())[:8]
                        stamped_name = f"{base}_{ts}_{uid}{ext}"
                        dst_excel_path = run_dir_path / stamped_name
                        dst_excel_path.write_bytes(content)
                except Exception:
                    pass
        stage = "cleanup"
        os.unlink(tmp_file.name)
        return {
            "success": True, 
            "message": "Run created and queued", 
            "run": run_json, 
            "storage": {"csv_key": csv_key, "jsl_key": jsl_key, "zip_key": zip_key},
            "zip_info": zip_result if zip_result["success"] else None
        }
    except Exception as e:
        logger.error(f"[V2] Error running analysis: {e}", exc_info=True)
        return JSONResponse(status_code=400, content={"success": False, "error": str(e), "stage": locals().get("stage", "unknown")})


