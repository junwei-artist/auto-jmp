from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Form
from fastapi.responses import JSONResponse
from typing import Dict, Any, List
import pandas as pd
import numpy as np
import tempfile
import os
from pathlib import Path
import logging
from .processor import ExcelToCPKProcessor
import httpx
import os
from app.core.storage import local_storage

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/excel2cpkv1", tags=["excel2cpkv1"])

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
    imgdir: str = Form("/tmp/")
):
    """Run complete CPK analysis using modular approach"""
    try:
        logger.info(f"Running CPK analysis for project: {project_name}")
        
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
            
            if not result["success"]:
                return JSONResponse(
                    status_code=400,
                    content={
                        "success": False,
                        "error": result["error"]
                    }
                )
            
            # Persist files to storage and create a run via standard API
            csv_bytes = result["files"]["csv_content"].encode("utf-8")
            jsl_bytes = result["files"]["jsl_content"].encode("utf-8")

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
                "message": "CPK run created and queued",
                "run": run_json,
                "storage": {"csv_key": csv_key, "jsl_key": jsl_key},
                "details": result["details"],
                "validations": result["validations"],
                "missing_in_data": result["missing_in_data"]
            }
            
    except Exception as e:
        logger.error(f"Error running CPK analysis: {str(e)}", exc_info=True)
        return JSONResponse(
            status_code=400,
            content={
                "success": False,
                "error": str(e)
            }
        )

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
            
            # Check for required columns
            required = ["test_name", "usl", "lsl", "target"]
            missing = [col for col in required if col not in spec_df.columns]
            
            # Perform additional validations
            spec_norm = processor.analyzer.normalize_spec_columns(spec_df, route)
            validations = processor.analyzer.validate_spec(spec_norm)
            fai_cols = processor.analyzer.find_fai_columns(data_df)
            matched_spec, missing_in_data = processor.analyzer.match_spec_to_data(spec_norm, fai_cols)
            
            # Clean up temp file
            os.unlink(tmp_file.name)
            
            # Prepare validation results in the format expected by frontend
            checkpoints = []
            
            # Checkpoint 1: Required columns validation
            checkpoint1_valid = len(missing) == 0
            checkpoint1_message = "All required columns present" if checkpoint1_valid else f"Missing required columns: {missing}"
            checkpoints.append({
                "valid": checkpoint1_valid,
                "checkpoint": 1,
                "message": checkpoint1_message,
                "details": {
                    "required_columns": required,
                    "missing_columns": missing,
                    "spec_columns": spec_df.columns.tolist()
                }
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
            
            validation_results = {
                "valid": overall_valid,
                "message": "CPK data validation completed" if overall_valid else "CPK validation completed with issues",
                "checkpoints": checkpoints,
                "route": route,
                "sheets": ["spec", "data"] if route == "spec" else ["meta", "data"],
                "spec_columns": spec_df.columns.tolist(),
                "data_columns": data_df.columns.tolist(),
                "required_columns": required,
                "missing_required_columns": missing,
                "column_mappings": column_mappings,
                "fai_columns_found": len(fai_cols),
                "matched_spec_rows": len(matched_spec),
                "missing_in_data_rows": len(missing_in_data),
                "missing_in_data": serializable_missing_in_data,
                "validations": serializable_validations,
                "has_errors": not overall_valid,
                "has_warnings": any(k.startswith("Warning_") for k in validations.keys())
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
