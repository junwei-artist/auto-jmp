from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Form
from fastapi.responses import JSONResponse
from typing import Dict, Any, List
import pandas as pd
import tempfile
import os
from pathlib import Path
import logging
from .processor import ExcelToCSVJSLProcessor
from .file_handler import FileHandler
from .data_validator import DataValidator
from .data_process import DataProcessor
from .file_processor import FileProcessor
from .analysis_runner import AnalysisRunner
import httpx
import os
import asyncio
from app.core.storage import local_storage
from datetime import datetime
import uuid

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/excel2boxplotv1", tags=["excel2boxplotv1"])

# Initialize processors
try:
    processor = ExcelToCSVJSLProcessor()
    file_handler = FileHandler()
    validator = DataValidator()
    data_processor = DataProcessor()
    file_processor = FileProcessor()
    analysis_runner = AnalysisRunner()
    logger.info("All processors initialized successfully")
except Exception as e:
    logger.error(f"Failed to initialize processors: {e}")
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
            "required_columns": processor.required_meta_columns,
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

@router.post("/test-file-upload")
async def test_file_upload(file: UploadFile = File(...)):
    """Test file upload functionality"""
    try:
        # Save uploaded file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as tmp_file:
            content = await file.read()
            tmp_file.write(content)
            tmp_file.flush()
            
            result = {
                "filename": file.filename,
                "content_type": file.content_type,
                "file_size": len(content),
                "temp_file": tmp_file.name,
                "status": "ok"
            }
            
            # Clean up
            os.unlink(tmp_file.name)
            return result
            
    except Exception as e:
        import traceback
        return {
            "error": str(e),
            "traceback": traceback.format_exc(),
            "status": "error"
        }

@router.post("/test-validation-step1")
async def test_validation_step1(file: UploadFile = File(...)):
    """Test just the first validation step"""
    try:
        # Save uploaded file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as tmp_file:
            content = await file.read()
            tmp_file.write(content)
            tmp_file.flush()
            
            # Run only checkpoint 1
            logger.info("Running checkpoint 1: Excel structure validation")
            checkpoint1 = processor.validate_excel_structure(tmp_file.name)
            logger.info(f"Checkpoint 1 result: {checkpoint1}")
            
            result = {
                "filename": file.filename,
                "checkpoint1": checkpoint1,
                "status": "ok"
            }
            
            # Clean up
            os.unlink(tmp_file.name)
            if checkpoint1.get("fix_applied", False):
                os.unlink(checkpoint1["fixed_file"])
            
            return result
            
    except Exception as e:
        import traceback
        return {
            "error": str(e),
            "traceback": traceback.format_exc(),
            "status": "error"
        }

@router.post("/test-validation-step2")
async def test_validation_step2(file: UploadFile = File(...)):
    """Test the second validation step"""
    try:
        # Save uploaded file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as tmp_file:
            content = await file.read()
            tmp_file.write(content)
            tmp_file.flush()
            
            # Run checkpoint 1 first
            checkpoint1 = processor.validate_excel_structure(tmp_file.name)
            
            # Use fixed file if available
            file_to_validate = tmp_file.name
            if checkpoint1.get("fix_applied", False):
                file_to_validate = checkpoint1["fixed_file"]
            
            # Run checkpoint 2
            logger.info("Running checkpoint 2: Metadata validation")
            checkpoint2 = processor.validate_meta_data(file_to_validate)
            logger.info(f"Checkpoint 2 result: {checkpoint2}")
            
            result = {
                "filename": file.filename,
                "checkpoint1": checkpoint1,
                "checkpoint2": checkpoint2,
                "status": "ok"
            }
            
            # Clean up
            os.unlink(tmp_file.name)
            if checkpoint1.get("fix_applied", False):
                os.unlink(file_to_validate)
            
            return result
            
    except Exception as e:
        import traceback
        return {
            "error": str(e),
            "traceback": traceback.format_exc(),
            "status": "error"
        }

@router.post("/test-validation-step3")
async def test_validation_step3(file: UploadFile = File(...)):
    """Test the third validation step"""
    try:
        # Save uploaded file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as tmp_file:
            content = await file.read()
            tmp_file.write(content)
            tmp_file.flush()
            
            # Run checkpoint 1 first
            checkpoint1 = processor.validate_excel_structure(tmp_file.name)
            
            # Use fixed file if available
            file_to_validate = tmp_file.name
            if checkpoint1.get("fix_applied", False):
                file_to_validate = checkpoint1["fixed_file"]
            
            # Run checkpoint 2
            checkpoint2 = processor.validate_meta_data(file_to_validate)
            
            # Run checkpoint 3
            logger.info("Running checkpoint 3: Data quality validation")
            checkpoint3 = processor.validate_data_quality(file_to_validate)
            logger.info(f"Checkpoint 3 result: {checkpoint3}")
            
            result = {
                "filename": file.filename,
                "checkpoint1": checkpoint1,
                "checkpoint2": checkpoint2,
                "checkpoint3": checkpoint3,
                "status": "ok"
            }
            
            # Clean up
            os.unlink(tmp_file.name)
            if checkpoint1.get("fix_applied", False):
                os.unlink(file_to_validate)
            
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
        logger.info(f"Starting validation for file: {file.filename}")
        
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
            
            logger.info("Running checkpoint 2: Metadata validation")
            checkpoint2 = processor.validate_meta_data(file_to_validate)
            logger.info(f"Checkpoint 2 result: {checkpoint2}")
            
            logger.info("Running checkpoint 3: Data quality validation")
            checkpoint3 = processor.validate_data_quality(file_to_validate)
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
                # Only include warnings, not full details
                if "details" in checkpoint and "warnings" in checkpoint["details"]:
                    simplified["warnings"] = checkpoint["details"]["warnings"]
                simplified_checkpoints.append(simplified)
            
            response = {
                "valid": True,
                "message": "All validation checkpoints completed",
                "checkpoints": simplified_checkpoints
            }
            
            # Include fix information if file was fixed
            if checkpoint1.get("fix_applied", False):
                response["fix_applied"] = True
                response["fix_message"] = checkpoint1["fix_message"]
            
            logger.info("Validation completed successfully")
            return response
            
    except Exception as e:
        logger.error(f"Validation failed: {str(e)}", exc_info=True)
        import traceback
        logger.error(f"Full traceback: {traceback.format_exc()}")
        # Return the error details instead of raising HTTPException
        return JSONResponse(
            status_code=400,
            content={
                "error": f"Validation failed: {str(e)}",
                "traceback": traceback.format_exc(),
                "path": "/api/v1/extensions/excel2boxplotv1/validate"
            }
        )

@router.post("/calculate-boundaries")
async def calculate_boundaries(file: UploadFile = File(...)):
    """Calculate boundary values (min, max, inc, tick) for Excel file"""
    logger.info(f"Calculating boundaries for Excel file: {file.filename}")
    try:
        # Save uploaded file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as tmp_file:
            content = await file.read()
            tmp_file.write(content)
            tmp_file.flush()
            logger.info(f"Saved temporary file: {tmp_file.name}")
            
            # Read Excel file
            meta = pd.read_excel(tmp_file.name, sheet_name="meta")
            data = pd.read_excel(tmp_file.name, sheet_name="data")
            
            # Calculate boundaries
            meta_with_boundaries = processor.calculate_boundaries(meta, data)
            
            # Clean up temp file
            os.unlink(tmp_file.name)
            
            # Return boundary calculation results
            boundary_info = []
            for _, row in meta_with_boundaries.iterrows():
                boundary_info.append({
                    "label": row['Label'],
                    "y_variable": row['Y Variable'],
                    "min": row['min'],
                    "max": row['max'],
                    "inc": row['inc'],
                    "tick": row['tick'],
                    "usl": row['USL'],
                    "lsl": row['LSL']
                })
            
            logger.info("Boundary calculation completed successfully")
            return {
                "success": True,
                "message": "Boundary calculation completed",
                "boundaries": boundary_info
            }
            
    except Exception as e:
        logger.error(f"Exception in calculate_boundaries: {str(e)}", exc_info=True)
        raise HTTPException(status_code=400, detail=f"Boundary calculation failed: {str(e)}")

@router.post("/process")
async def process_excel_file(
    file: UploadFile = File(...),
    project_id: str = Form(None),
    image_path: str = Form("/tmp/")
):
    """Process Excel file and generate CSV and JSL for an existing project"""
    logger.info(f"Processing Excel file: {file.filename}, project_id: {project_id}")
    try:
        # Save uploaded file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as tmp_file:
            content = await file.read()
            tmp_file.write(content)
            tmp_file.flush()
            logger.info(f"Saved temporary file: {tmp_file.name}")
            
            # Process the file
            logger.info("Starting Excel processing...")
            result = processor.process_excel_file(tmp_file.name, image_path)
            logger.info(f"Processing result: {result}")
            
            # Clean up temp file
            os.unlink(tmp_file.name)
            
            if not result["valid"]:
                error_msg = result.get("error", "Processing failed")
                logger.error(f"Processing failed: {error_msg}")
                raise HTTPException(status_code=400, detail=error_msg)
            
            # TODO: Upload CSV and JSL files to the project and trigger JMP runner
            # This would involve:
            # 1. Upload CSV file as artifact to project
            # 2. Upload JSL file as artifact to project  
            # 3. Create a run with these artifacts
            # 4. Trigger JMP runner
            
            logger.info("Processing completed successfully")
            return {
                "success": True,
                "message": "Excel file processed successfully",
                "project_id": project_id,
                "csv_file": result["details"]["csv_file"],
                "jsl_file": result["details"]["jsl_file"],
                "run_id": "placeholder_run_id"  # This would be the actual run ID
            }
            
    except Exception as e:
        logger.error(f"Exception in process_excel_file: {str(e)}", exc_info=True)
        raise HTTPException(status_code=400, detail=f"Processing failed: {str(e)}")

@router.post("/create-project")
async def create_project_with_excel(
    file: UploadFile = File(...),
    project_name: str = None,
    project_description: str = None
):
    """Create a project and process Excel file in one step"""
    try:
        # Save uploaded file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as tmp_file:
            content = await file.read()
            tmp_file.write(content)
            tmp_file.flush()
            
            # Process the file
            result = processor.process_excel_file(tmp_file.name)
            
            # Clean up temp file
            os.unlink(tmp_file.name)
            
            if not result["valid"]:
                raise HTTPException(status_code=400, detail=result["error"])
            
            # Return the processed files for project creation
            return {
                "success": True,
                "message": "Excel file processed successfully",
                "csv_file": result["details"]["csv_file"],
                "jsl_file": result["details"]["jsl_file"],
                "project_name": project_name or f"Excel Analysis {result['details']['timestamp']}",
                "project_description": project_description or "Auto-generated from Excel file"
            }
            
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Project creation failed: {str(e)}")

# New Modular Endpoints

@router.post("/load-file")
async def load_excel_file(file: UploadFile = File(...)):
    """Load Excel file and analyze structure"""
    try:
        logger.info(f"Loading Excel file: {file.filename}")
        
        # Save uploaded file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as tmp_file:
            content = await file.read()
            tmp_file.write(content)
            tmp_file.flush()
            
            # Load file using file handler
            result = file_handler.load_excel_file(tmp_file.name)
            
            # Clean up temp file
            os.unlink(tmp_file.name)
            
            return result
            
    except Exception as e:
        logger.error(f"Error loading Excel file: {str(e)}", exc_info=True)
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
    cat_var: str = Form(...)
):
    """Set categorical variable for analysis"""
    try:
        logger.info(f"Setting categorical variable: {cat_var}")
        
        # Save uploaded file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as tmp_file:
            content = await file.read()
            tmp_file.write(content)
            tmp_file.flush()
            
            # Load file first
            load_result = file_handler.load_excel_file(tmp_file.name)
            if not load_result["success"]:
                return load_result
            
            # Set categorical variable
            result = file_handler.set_categorical_variable(cat_var)
            
            # Clean up temp file
            os.unlink(tmp_file.name)
            
            return result
            
    except Exception as e:
        logger.error(f"Error setting categorical variable: {str(e)}", exc_info=True)
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
    cat_var: str = Form(...)
):
    """Validate data using modular approach"""
    tmp_file_path = None
    request_file_handler = None
    try:
        logger.info(f"Validating data with categorical variable: {cat_var}")
        logger.info(f"Received file: {file.filename}, content_type: {file.content_type}")
        
        # Validate file
        if not file.filename:
            raise ValueError("No file provided")
        
        # Save uploaded file temporarily
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as tmp_file:
                content = await file.read()
                if not content:
                    raise ValueError("Uploaded file is empty")
                tmp_file.write(content)
                tmp_file.flush()
                tmp_file_path = tmp_file.name
                logger.info(f"Saved temporary file: {tmp_file_path}, size: {len(content)} bytes")
        except Exception as file_error:
            logger.error(f"Error saving uploaded file: {str(file_error)}", exc_info=True)
            raise ValueError(f"Failed to save uploaded file: {str(file_error)}")
        
        # Create a new file handler instance for this request (thread-safe)
        try:
            request_file_handler = FileHandler()
            load_result = request_file_handler.load_excel_file(tmp_file_path)
        except Exception as load_error:
            logger.error(f"Error creating FileHandler or loading file: {str(load_error)}", exc_info=True)
            # Clean up temp file
            if tmp_file_path and os.path.exists(tmp_file_path):
                try:
                    os.unlink(tmp_file_path)
                except Exception:
                    pass
            raise ValueError(f"Failed to load Excel file: {str(load_error)}")
        
        if not load_result.get("success", False):
            # Clean up temp file
            if tmp_file_path and os.path.exists(tmp_file_path):
                try:
                    os.unlink(tmp_file_path)
                except Exception as cleanup_error:
                    logger.warning(f"Error cleaning up temp file: {cleanup_error}")
            error_msg = load_result.get("error", "Unknown error loading file")
            logger.warning(f"File loading failed: {error_msg}")
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "error": error_msg
                }
            )
        
        # Get data - ensure they are not None
        df_meta = request_file_handler.df_meta
        df_data = request_file_handler.df_data_raw
        
        if df_meta is None or df_data is None:
            error_msg = "Failed to load data from Excel file"
            if df_meta is None:
                error_msg += ": meta sheet is None"
            if df_data is None:
                error_msg += ": data sheet is None"
            logger.error(error_msg)
            raise ValueError(error_msg)
        
        # Create a new validator instance for this request (thread-safe)
        try:
            request_validator = DataValidator()
            result = request_validator.run_full_validation(df_meta, df_data, cat_var)
        except Exception as validation_error:
            logger.error(f"Error during validation: {str(validation_error)}", exc_info=True)
            raise ValueError(f"Validation failed: {str(validation_error)}")
        
        # Clean up temp file and standardized file if created
        if tmp_file_path and os.path.exists(tmp_file_path):
            try:
                os.unlink(tmp_file_path)
            except Exception as cleanup_error:
                logger.warning(f"Error cleaning up temp file: {cleanup_error}")
        
        if request_file_handler and request_file_handler.was_standardized and request_file_handler.standardized_file_path:
            try:
                request_file_handler.cleanup()
            except Exception as cleanup_error:
                logger.warning(f"Error cleaning up standardized file: {cleanup_error}")
        
        logger.info("Validation completed successfully")
        return result
            
    except ValueError as ve:
        # Handle validation errors with 400 status
        logger.error(f"Validation error: {str(ve)}", exc_info=True)
        
        # Clean up temp file if it exists
        if tmp_file_path and os.path.exists(tmp_file_path):
            try:
                os.unlink(tmp_file_path)
            except Exception:
                pass
        
        # Clean up standardized file if it exists
        if request_file_handler and request_file_handler.was_standardized and request_file_handler.standardized_file_path:
            try:
                request_file_handler.cleanup()
            except Exception:
                pass
        
        return JSONResponse(
            status_code=400,
            content={
                "success": False,
                "error": str(ve)
            }
        )
    except Exception as e:
        # Handle all other errors with 500 status
        logger.error(f"Unexpected error validating data: {str(e)}", exc_info=True)
        
        # Clean up temp file if it exists
        if tmp_file_path and os.path.exists(tmp_file_path):
            try:
                os.unlink(tmp_file_path)
            except Exception:
                pass
        
        # Clean up standardized file if it exists
        if request_file_handler and request_file_handler.was_standardized and request_file_handler.standardized_file_path:
            try:
                request_file_handler.cleanup()
            except Exception:
                pass
        
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": f"Internal server error: {str(e)}"
            }
        )


@router.post("/process-data")
async def process_data_modular(
    file: UploadFile = File(...),
    cat_var: str = Form(...)
):
    """Process data using modular approach"""
    try:
        logger.info(f"Processing data with categorical variable: {cat_var}")
        
        # Save uploaded file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as tmp_file:
            content = await file.read()
            tmp_file.write(content)
            tmp_file.flush()
            
            # Load file
            load_result = file_handler.load_excel_file(tmp_file.name)
            if not load_result["success"]:
                return load_result
            
            # Get data
            df_meta = file_handler.df_meta
            df_data = file_handler.df_data_raw
            fai_columns = file_handler.fai_columns
            
            # Process data
            result = data_processor.process_data(df_meta, df_data, fai_columns, cat_var)

            # Ensure response is JSON-serializable (DataFrame is not)
            if result.get("success"):
                # Remove raw DataFrame from response to avoid serialization errors
                if "processed_data" in result:
                    result.pop("processed_data", None)

            # Clean up temp file
            os.unlink(tmp_file.name)

            return result
            
    except Exception as e:
        logger.error(f"Error processing data: {str(e)}", exc_info=True)
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
    cat_var: str = Form(...),
    color_by: str = Form(None)
):
    """Generate CSV and JSL files using modular approach"""
    try:
        logger.info(f"Generating files with categorical variable: {cat_var}")
        
        # Save uploaded file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as tmp_file:
            content = await file.read()
            tmp_file.write(content)
            tmp_file.flush()
            
            # Load file
            load_result = file_handler.load_excel_file(tmp_file.name)
            if not load_result["success"]:
                return load_result
            
            # Get data
            df_meta = file_handler.df_meta
            df_data = file_handler.df_data_raw
            fai_columns = file_handler.fai_columns
            
            # Process data
            process_result = data_processor.process_data(df_meta, df_data, fai_columns, cat_var)
            if not process_result["success"]:
                return process_result
            
            # Generate files
            result = file_processor.generate_files(
                df_meta,
                process_result["processed_data"],
                process_result["boundaries"],
                cat_var,
                fai_columns,
                color_by
            )
            
            # Clean up temp file
            os.unlink(tmp_file.name)
            
            return result
            
    except Exception as e:
        logger.error(f"Error generating files: {str(e)}", exc_info=True)
        return JSONResponse(
            status_code=400,
            content={
                "success": False,
                "error": str(e)
            }
        )

@router.post("/run-analysis")
async def run_analysis_modular(
    file: UploadFile = File(...),
    cat_var: str = Form(...),
    project_id: str = Form(...),
    project_name: str = Form(...),
    project_description: str = Form(""),
    color_by: str = Form(None)
):
    """Run complete analysis using modular approach"""
    try:
        logger.info(f"Running analysis with categorical variable: {cat_var}")
        stage = "init"
        
        # Save uploaded file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as tmp_file:
            content = await file.read()
            tmp_file.write(content)
            tmp_file.flush()
            
            # Load file
            stage = "load_file"
            load_result = file_handler.load_excel_file(tmp_file.name)
            if not load_result["success"]:
                os.unlink(tmp_file.name)
                return JSONResponse(status_code=400, content={"success": False, "error": load_result.get("error", "Load failed"), "stage": stage, "details": load_result})
            
            # Get data
            df_meta = file_handler.df_meta
            df_data = file_handler.df_data_raw
            fai_columns = file_handler.fai_columns
            
            # Process data
            stage = "process_data"
            process_result = data_processor.process_data(df_meta, df_data, fai_columns, cat_var)
            if not process_result["success"]:
                os.unlink(tmp_file.name)
                return JSONResponse(status_code=400, content={"success": False, "error": process_result.get("error", "Process failed"), "stage": stage, "details": process_result})
            
            # Generate files
            stage = "generate_files"
            file_result = file_processor.generate_files(
                df_meta,
                process_result["processed_data"],
                process_result["boundaries"],
                cat_var,
                fai_columns,
                color_by
            )
            if not file_result["success"]:
                os.unlink(tmp_file.name)
                return JSONResponse(status_code=400, content={"success": False, "error": file_result.get("error", "File generation failed"), "stage": stage, "details": file_result})
            
            # Persist files to storage and create a run via standard API
            stage = "persist_files"
            csv_bytes = file_result["files"]["csv_content"].encode("utf-8")
            jsl_bytes = file_result["files"]["jsl_content"].encode("utf-8")

            csv_key = local_storage.generate_storage_key("data.csv", "text/csv")
            jsl_key = local_storage.generate_storage_key("analysis.jsl", "text/plain")

            local_storage.save_file(csv_bytes, csv_key)
            local_storage.save_file(jsl_bytes, jsl_key)

            # Use direct Celery call instead of HTTP to ensure proper queueing
            stage = "create_run"
            from app.core.celery import celery_app
            from app.core.database import AsyncSessionLocal
            from app.core.websocket import publish_run_update
            from app.models import Run, RunStatus, Artifact
            
            run_json = None
            last_error = None
            
            # STEP 1: Create run record FIRST
            async with AsyncSessionLocal() as create_db:
                try:
                    run = Run(
                        project_id=uuid.UUID(project_id),
                        started_by=None,  # Note: current_user not available in this endpoint signature
                        status=RunStatus.QUEUED,
                        task_name="jmp_boxplot",
                        message="Run queued"
                    )
                    create_db.add(run)
                    await create_db.commit()
                    await create_db.refresh(run)
                    
                    logger.info(f"[V1] Run created: {run.id}")
                    
                    # STEP 2: Create run folder immediately after run is created
                    run_dir_key = f"runs/{str(run.id)}"
                    run_dir_path = local_storage.get_file_path(run_dir_key)
                    run_dir_path.mkdir(parents=True, exist_ok=True)
                    
                    logger.info(f"[V1] Run folder created: {run_dir_path}")
                    
                    # STEP 3: Save submitted files directly to run folder (not temp location)
                    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
                    short_uid = str(uuid.uuid4())[:8]
                    dst_csv_filename = f"data_{ts}_{short_uid}.csv"
                    dst_jsl_filename = f"analysis_{ts}_{short_uid}.jsl"
                    dst_csv_rel_key = f"{run_dir_key}/{dst_csv_filename}"
                    dst_jsl_rel_key = f"{run_dir_key}/{dst_jsl_filename}"
                    dst_csv_path = local_storage.get_file_path(dst_csv_rel_key)
                    dst_jsl_path = local_storage.get_file_path(dst_jsl_rel_key)
                    
                    dst_csv_path.parent.mkdir(parents=True, exist_ok=True)
                    
                    # Determine source file paths from temp/upload location
                    src_csv_path = local_storage.get_file_path(csv_key)
                    src_jsl_path = local_storage.get_file_path(jsl_key)
                    
                    logger.info(f"[V1] Copying submitted files to run folder:")
                    logger.info(f"  CSV source: {src_csv_path}")
                    logger.info(f"  CSV destination: {dst_csv_path}")
                    logger.info(f"  JSL source: {src_jsl_path}")
                    logger.info(f"  JSL destination: {dst_jsl_path}")
                    
                    # Copy files from temp/upload location to run folder
                    if not src_csv_path.exists():
                        raise ValueError(f"CSV source file not found: {src_csv_path}")
                    if not src_jsl_path.exists():
                        raise ValueError(f"JSL source file not found: {src_jsl_path}")
                    
                    # Copy bytes into run folder
                    dst_csv_path.write_bytes(src_csv_path.read_bytes())
                    dst_jsl_path.write_bytes(src_jsl_path.read_bytes())
                    
                    # CRITICAL: Set JSL file permissions to prevent macOS auto-opening
                    dst_jsl_path.chmod(0o644)  # rw-r--r--
                    
                    logger.info(f"[V1] Files copied to run folder:")
                    logger.info(f"  CSV: {dst_csv_path} (size: {dst_csv_path.stat().st_size} bytes)")
                    logger.info(f"  JSL: {dst_jsl_path} (size: {dst_jsl_path.stat().st_size} bytes)")

                    # CRITICAL: Verify files are written to run folder before proceeding
                    if not dst_csv_path.exists():
                        raise ValueError(f"CSV file not found in run folder after copy: {dst_csv_path}")
                    if not dst_jsl_path.exists():
                        raise ValueError(f"JSL file not found in run folder after copy: {dst_jsl_path}")
                    
                    # STEP 4: Create artifact records pointing directly to run folder paths
                    csv_artifact = Artifact(
                        project_id=uuid.UUID(project_id),
                        run_id=run.id,
                        kind="input_csv",
                        storage_key=str(dst_csv_path.resolve()),
                        filename=dst_csv_filename,
                        mime_type="text/csv"
                    )
                    
                    jsl_artifact = Artifact(
                        project_id=uuid.UUID(project_id),
                        run_id=run.id,
                        kind="input_jsl",
                        storage_key=str(dst_jsl_path.resolve()),
                        filename=dst_jsl_filename,
                        mime_type="text/plain"
                    )
                    
                    create_db.add(csv_artifact)
                    create_db.add(jsl_artifact)
                    await create_db.commit()
                    await create_db.refresh(csv_artifact)
                    await create_db.refresh(jsl_artifact)
                    
                    logger.info(f"[V1] Artifacts created with run folder paths:")
                    logger.info(f"  CSV artifact storage_key: {csv_artifact.storage_key}")
                    logger.info(f"  JSL artifact storage_key: {jsl_artifact.storage_key}")
                    
                    # Clean up original temp/upload files
                    try:
                        if src_csv_path.exists() and src_csv_path != dst_csv_path:
                            src_csv_path.unlink()
                            logger.info(f"[V1] Removed original CSV file: {src_csv_path}")
                        if src_jsl_path.exists() and src_jsl_path != dst_jsl_path:
                            src_jsl_path.unlink()
                            logger.info(f"[V1] Removed original JSL file: {src_jsl_path}")
                    except Exception as e:
                        logger.warning(f"[V1] Failed to remove original temp files: {e}")
                    
                    # CRITICAL: Final verification - ensure files exist in run folder before queuing Celery
                    final_csv_path = local_storage.get_file_path(csv_artifact.storage_key)
                    final_jsl_path = local_storage.get_file_path(jsl_artifact.storage_key)
                    
                    if not final_csv_path.exists():
                        raise ValueError(f"CSV file not found in run folder before queuing Celery: {final_csv_path}")
                    if not final_jsl_path.exists():
                        raise ValueError(f"JSL file not found in run folder before queuing Celery: {final_jsl_path}")
                    
                    logger.info(f"[V1] Final verification passed - files ready in run folder before queuing Celery:")
                    logger.info(f"  CSV: {final_csv_path} (size: {final_csv_path.stat().st_size} bytes)")
                    logger.info(f"  JSL: {final_jsl_path} (size: {final_jsl_path.stat().st_size} bytes)")
                    
                    # STEP 5: Prepare task folder and task id BEFORE enqueuing Celery
                    from pathlib import Path
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
                    csv_dst = task_dir / final_csv_path.name
                    jsl_dst = task_dir / final_jsl_path.name
                    
                    # Copy CSV file as-is
                    csv_dst.write_bytes(final_csv_path.read_bytes())
                    
                    # Read JSL file and ensure header Open() points to absolute CSV path in task folder
                    jsl_content = final_jsl_path.read_text(encoding='utf-8')
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
                        logger.info("[V1] Replaced existing Open() header and comments in JSL")
                    else:
                        modified_jsl_content = jsl_header + jsl_content
                        logger.info("[V1] Prepended Open() header and comments to JSL")
                    
                    # Write modified JSL to task folder
                    jsl_dst.write_text(modified_jsl_content, encoding='utf-8')
                    
                    logger.info(f"[V1] Added JSL header with metadata:")
                    logger.info(f"[V1]   Run ID: {str(run.id)}")
                    logger.info(f"[V1]   Task Folder ID: {jmp_task_id}")
                    logger.info(f"[V1]   Created: {create_time}")

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
                    
                    # STEP 6: Queue Celery task directly (only after task folder is prepared)
                    logger.info(f"[V1] Queuing Celery task 'run_jmp_boxplot' for run {run.id}")
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
                    logger.error(f"[V1] Failed to create run directly: {e}", exc_info=True)
                    if tmp_file and os.path.exists(tmp_file.name):
                        os.unlink(tmp_file.name)
                    return JSONResponse(
                        status_code=400,
                        content={
                            "success": False,
                            "error": f"Failed to create run: {last_error}",
                            "stage": stage
                        },
                    )

            # Save original Excel into the per-run folder for traceability
            try:
                if run_json and run_json.get("id"):
                    run_id = run_json["id"]
                    run_dir_key = f"runs/{run_id}"
                    run_dir_path = local_storage.get_file_path(run_dir_key)
                    run_dir_path.mkdir(parents=True, exist_ok=True)
                    # Timestamp+UUID filename
                    original_name = file.filename or "original.xlsx"
                    base = Path(original_name).stem or "original"
                    ext = Path(original_name).suffix or ".xlsx"
                    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
                    uid = str(uuid.uuid4())[:8]
                    stamped_name = f"{base}_{ts}_{uid}{ext}"
                    dst_excel_path = run_dir_path / stamped_name
                    # 'content' holds the uploaded bytes
                    dst_excel_path.write_bytes(content)
            except Exception:
                pass

            # Clean up temp file
            stage = "cleanup"
            os.unlink(tmp_file.name)

            return {
                "success": True,
                "message": "Run created and queued",
                "run": run_json,
                "storage": {"csv_key": csv_key, "jsl_key": jsl_key}
            }
            
    except Exception as e:
        logger.error(f"Error running analysis: {str(e)}", exc_info=True)
        return JSONResponse(
            status_code=400,
            content={
                "success": False,
                "error": str(e),
                "stage": locals().get("stage", "unknown")
            }
        )
