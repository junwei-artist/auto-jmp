from fastapi import APIRouter, UploadFile, File, HTTPException, Form
from fastapi.responses import JSONResponse
from typing import Dict, Any
import tempfile
import os
import logging
import httpx
import pandas as pd

from .file_handler import FileHandlerV2
from .data_validator import DataValidator
from .data_process import DataProcessor
from .file_processor import FileProcessor
from .analysis_runner import AnalysisRunner
from app.core.storage import local_storage


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
            file_result = file_processor.generate_files(
                df_meta,
                process_result["processed_data"],
                process_result["boundaries"],
                cat_var,
                fai_columns,
                color_by,
            )
            if not file_result.get("success"):
                return file_result

            csv_bytes = file_result["files"]["csv_content"].encode("utf-8")
            jsl_bytes = file_result["files"]["jsl_content"].encode("utf-8")
            csv_key = local_storage.generate_storage_key("data.csv", "text/csv")
            jsl_key = local_storage.generate_storage_key("analysis.jsl", "text/plain")
            local_storage.save_file(csv_bytes, csv_key)
            local_storage.save_file(jsl_bytes, jsl_key)

            backend_base = os.getenv("NEXT_PUBLIC_BACKEND_URL", "http://localhost:4700")
            async with httpx.AsyncClient(timeout=30.0) as client:
                run_resp = await client.post(
                    f"{backend_base}/api/v1/runs/",
                    json={"project_id": project_id, "csv_key": csv_key, "jsl_key": jsl_key},
                )
                run_resp.raise_for_status()
                run_json = run_resp.json()
        os.unlink(tmp_file.name)
        return {"success": True, "message": "Run created and queued", "run": run_json, "storage": {"csv_key": csv_key, "jsl_key": jsl_key}}
    except Exception as e:
        logger.error(f"[V2] Error running analysis: {e}", exc_info=True)
        return JSONResponse(status_code=400, content={"success": False, "error": str(e)})


