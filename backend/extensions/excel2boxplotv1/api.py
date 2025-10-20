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
from app.core.storage import local_storage

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
    try:
        logger.info(f"Validating data with categorical variable: {cat_var}")
        
        # Save uploaded file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as tmp_file:
            content = await file.read()
            tmp_file.write(content)
            tmp_file.flush()
            
            # Create a new file handler instance for this request (thread-safe)
            request_file_handler = FileHandler()
            load_result = request_file_handler.load_excel_file(tmp_file.name)
            if not load_result["success"]:
                os.unlink(tmp_file.name)
                return load_result
            
            # Get data
            df_meta = request_file_handler.df_meta
            df_data = request_file_handler.df_data_raw
            
            # Create a new validator instance for this request (thread-safe)
            request_validator = DataValidator()
            result = request_validator.run_full_validation(df_meta, df_data, cat_var)
            
            # Clean up temp file and standardized file if created
            os.unlink(tmp_file.name)
            if request_file_handler.was_standardized and request_file_handler.standardized_file_path:
                request_file_handler.cleanup()
            
            return result
            
    except Exception as e:
        logger.error(f"Error validating data: {str(e)}", exc_info=True)
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
            file_result = file_processor.generate_files(
                df_meta,
                process_result["processed_data"],
                process_result["boundaries"],
                cat_var,
                fai_columns,
                color_by
            )
            if not file_result["success"]:
                return file_result
            
            # Persist files to storage and create a run via standard API
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
                    json={
                        "project_id": project_id,
                        "csv_key": csv_key,
                        "jsl_key": jsl_key
                    }
                )
                run_resp.raise_for_status()
                run_json = run_resp.json()

            # Clean up temp file
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
                "error": str(e)
            }
        )
