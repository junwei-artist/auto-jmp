from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Form
from fastapi.responses import JSONResponse
from typing import Dict, Any, List, Optional
import pandas as pd
import tempfile
import os
from pathlib import Path
import logging
from .processor import ExcelToCommonalityProcessor
import httpx
import os
from app.core.storage import local_storage
from ..base.zip_utils import ZipFileGenerator
from app.core.database import get_db
from app.core.auth import get_current_user_optional
from app.models import ProjectAttachment, AppUser
from sqlalchemy.ext.asyncio import AsyncSession
import uuid

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/excel2commonality", tags=["excel2commonality"])

# Initialize processor
try:
    processor = ExcelToCommonalityProcessor()
    logger.info("Commonality processor initialized successfully")
except Exception as e:
    logger.error(f"Failed to initialize Commonality processor: {e}")
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
    """Validate Excel file structure and data content"""
    try:
        logger.info(f"Starting Commonality validation for file: {file.filename}")
        
        # Save uploaded file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix=Path(file.filename).suffix) as tmp_file:
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
            
            logger.info("Running checkpoint 2: Data content validation")
            checkpoint2 = processor.validate_data_content(file_to_validate)
            logger.info(f"Checkpoint 2 result: {checkpoint2}")
            
            # Clean up temp files
            os.unlink(tmp_file.name)
            if checkpoint1.get("fix_applied", False):
                os.unlink(file_to_validate)
            
            # Prepare response - simplify checkpoint details to avoid large responses
            simplified_checkpoints = []
            for checkpoint in [checkpoint1, checkpoint2]:
                simplified = {
                    "valid": checkpoint["valid"],
                    "checkpoint": checkpoint["checkpoint"],
                    "message": checkpoint["message"]
                }
                # Include additional details for each checkpoint
                if "details" in checkpoint:
                    simplified["details"] = checkpoint["details"]
                # Include fix information if applied
                if "fix_applied" in checkpoint:
                    simplified["fix_applied"] = checkpoint["fix_applied"]
                    simplified["fix_message"] = checkpoint["fix_message"]
                simplified_checkpoints.append(simplified)
            
            # Overall validation status
            all_valid = all(checkpoint["valid"] for checkpoint in [checkpoint1, checkpoint2])
            
            return {
                "valid": all_valid,
                "message": "Commonality validation completed",
                "checkpoints": simplified_checkpoints,
                "summary": {
                    "total_checkpoints": len(simplified_checkpoints),
                    "passed_checkpoints": sum(1 for c in simplified_checkpoints if c["valid"]),
                    "fix_applied": checkpoint1.get("fix_applied", False)
                }
            }
            
    except Exception as e:
        logger.error(f"Error in validate_excel_file: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"error": f"Validation failed: {str(e)}"}
        )

@router.post("/validate-data")
async def validate_data_modular(
    file: UploadFile = File(...),
    cat_var: str = Form("dummy")  # Dummy parameter for compatibility
):
    """Validate data for commonality analysis (modular approach)"""
    try:
        logger.info(f"Starting modular Commonality validation for file: {file.filename}")
        
        # Save uploaded file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix=Path(file.filename).suffix) as tmp_file:
            content = await file.read()
            tmp_file.write(content)
            tmp_file.flush()
            
            # Run full validation
            result = processor.validate_excel_structure(tmp_file.name)
            
            # Clean up
            os.unlink(tmp_file.name)
            
            # Convert to wizard-compatible checkpoint format
            if result.get("valid", False):
                # Create checkpoint structure for wizard compatibility
                checkpoint1 = {
                    "valid": True,
                    "checkpoint": 1,
                    "message": "Excel file structure validated successfully",
                    "details": result.get("details", {})
                }
                
                checkpoint2 = {
                    "valid": True,
                    "checkpoint": 2,
                    "message": "Required columns validation passed",
                    "details": {
                        "required_columns": result.get("details", {}).get("required_columns", []),
                        "data_sheet": result.get("details", {}).get("data_sheet", "data")
                    }
                }
                
                # Return wizard-compatible response
                wizard_response = {
                    "valid": True,
                    "message": "Commonality validation completed successfully",
                    "checkpoints": [checkpoint1, checkpoint2],
                    "categorical_columns": ["Go to Commonality Analysis"],
                    "sheets": [result.get("details", {}).get("data_sheet", "data")],
                    "data_shape": [0, 0],  # Will be updated in next step
                    "fai_columns": [],  # Will be populated in next step
                    "summary": {
                        "total_checkpoints": 2,
                        "passed_checkpoints": 2,
                        "fix_applied": False
                    }
                }
                
                return wizard_response
            else:
                # Return error in wizard-compatible format
                error_checkpoint = {
                    "valid": False,
                    "checkpoint": 1,
                    "message": result.get("message", "Validation failed"),
                    "details": result.get("details", {})
                }
                
                return {
                    "valid": False,
                    "message": "Commonality validation failed",
                    "checkpoints": [error_checkpoint],
                    "error": result.get("error", "Unknown error")
                }
            
    except Exception as e:
        logger.error(f"Error in validate_data_modular: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"error": f"Data validation failed: {str(e)}"}
        )

@router.post("/process")
async def process_excel_file(
    file: UploadFile = File(...),
    project_name: str = Form(...),
    project_description: str = Form("")
):
    """Process Excel file for commonality analysis"""
    try:
        logger.info(f"Starting Commonality processing for file: {file.filename}")
        
        # Save uploaded file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix=Path(file.filename).suffix) as tmp_file:
            content = await file.read()
            tmp_file.write(content)
            tmp_file.flush()
            
            # Process the file
            result = processor.process_excel_file(
                tmp_file.name,
                project_name,
                project_description
            )
            
            # Clean up
            os.unlink(tmp_file.name)
            
            if result["success"]:
                return result
            else:
                return JSONResponse(
                    status_code=400,
                    content={"error": result.get("error", "Processing failed")}
                )
            
    except Exception as e:
        logger.error(f"Error in process_excel_file: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"error": f"Processing failed: {str(e)}"}
        )

@router.post("/analyze")
async def analyze_excel_file(file: UploadFile = File(...)):
    """Analyze Excel file and return results"""
    try:
        logger.info(f"Starting Commonality analysis for file: {file.filename}")
        
        # Save uploaded file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix=Path(file.filename).suffix) as tmp_file:
            content = await file.read()
            tmp_file.write(content)
            tmp_file.flush()
            
            # Run analysis
            result = processor.analyzer.analyze_excel_file(tmp_file.name)
            
            # Clean up
            os.unlink(tmp_file.name)
            
            if result["success"]:
                return result
            else:
                return JSONResponse(
                    status_code=400,
                    content={"error": result.get("error", "Analysis failed")}
                )
            
    except Exception as e:
        logger.error(f"Error in analyze_excel_file: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"error": f"Analysis failed: {str(e)}"}
        )

@router.post("/load-file")
async def load_file(file: UploadFile = File(...)):
    """Load Excel file and analyze structure (for wizard compatibility)"""
    try:
        logger.info(f"Loading file for wizard: {file.filename}")
        
        # Get the original file extension
        file_ext = Path(file.filename).suffix.lower()
        if not file_ext:
            file_ext = '.xlsx'  # Default fallback
        
        # Save uploaded file temporarily with correct extension
        with tempfile.NamedTemporaryFile(delete=False, suffix=file_ext) as tmp_file:
            content = await file.read()
            tmp_file.write(content)
            tmp_file.flush()
            
            # Run structure validation
            result = processor.validate_excel_structure(tmp_file.name)
            
            # Clean up
            os.unlink(tmp_file.name)
            
            # Add wizard-specific fields for commonality analysis
            if result.get("valid", False):
                # Create checkpoint structure for wizard compatibility
                checkpoint1 = {
                    "valid": True,
                    "checkpoint": 1,
                    "message": "Excel file structure validated successfully",
                    "details": result.get("details", {})
                }
                
                checkpoint2 = {
                    "valid": True,
                    "checkpoint": 2,
                    "message": "Required columns validation passed",
                    "details": {
                        "required_columns": result.get("details", {}).get("required_columns", []),
                        "data_sheet": result.get("details", {}).get("data_sheet", "data")
                    }
                }
                
                # Return wizard-compatible response
                wizard_response = {
                    "valid": True,
                    "message": "File loaded successfully. Ready for commonality analysis.",
                    "checkpoints": [checkpoint1, checkpoint2],
                    "categorical_columns": ["Go to Commonality Analysis"],
                    "sheets": [result.get("details", {}).get("data_sheet", "data")],
                    "data_shape": [0, 0],  # Will be updated in next step
                    "fai_columns": [],  # Will be populated in next step
                    "summary": {
                        "total_checkpoints": 2,
                        "passed_checkpoints": 2,
                        "fix_applied": False
                    }
                }
                
                return wizard_response
            else:
                # Return error in wizard-compatible format
                error_checkpoint = {
                    "valid": False,
                    "checkpoint": 1,
                    "message": result.get("message", "Validation failed"),
                    "details": result.get("details", {})
                }
                
                return {
                    "valid": False,
                    "message": "File validation failed",
                    "checkpoints": [error_checkpoint],
                    "error": result.get("error", "Unknown error")
                }
            
    except Exception as e:
        logger.error(f"Error in load_file: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"error": f"File loading failed: {str(e)}"}
        )

@router.post("/process-data")
async def process_data(
    file: UploadFile = File(...),
    cat_var: str = Form("dummy")  # Dummy parameter for compatibility
):
    """Process data for commonality analysis (for wizard compatibility)"""
    try:
        logger.info(f"Processing data for wizard: {file.filename}, cat_var: {cat_var}")
        
        # Get the original file extension
        file_ext = Path(file.filename).suffix.lower()
        if not file_ext:
            file_ext = '.xlsx'  # Default fallback
        
        # Save uploaded file temporarily with correct extension
        with tempfile.NamedTemporaryFile(delete=False, suffix=file_ext) as tmp_file:
            content = await file.read()
            tmp_file.write(content)
            tmp_file.flush()
            
            # Run data content validation
            result = processor.validate_data_content(tmp_file.name)
            
            # Clean up
            os.unlink(tmp_file.name)
            
            # Add wizard-specific fields for commonality analysis
            if result.get("valid", False):
                # Get details from result
                details = result.get("details", {})
                
                # Create checkpoint structure for wizard compatibility
                checkpoint1 = {
                    "valid": True,
                    "checkpoint": 1,
                    "message": "Excel file structure validated successfully",
                    "details": {
                        "file_format": details.get("file_format", ""),
                        "engine": details.get("engine", ""),
                        "data_sheet": details.get("data_sheet", "data")
                    }
                }
                
                checkpoint2 = {
                    "valid": True,
                    "checkpoint": 2,
                    "message": "Required columns validation passed",
                    "details": {
                        "required_columns": details.get("required_columns", []),
                        "data_sheet": details.get("data_sheet", "data")
                    }
                }
                
                checkpoint3 = {
                    "valid": True,
                    "checkpoint": 3,
                    "message": f"Data content validated successfully. Found {details.get('fai_count', 0)} FAI columns",
                    "details": {
                        "total_rows": details.get("total_rows", 0),
                        "total_columns": details.get("total_columns", 0),
                        "fai_columns": details.get("fai_columns", []),
                        "fai_count": details.get("fai_count", 0)
                    }
                }
                
                # Return wizard-compatible response
                wizard_response = {
                    "valid": True,
                    "message": f"Data processed successfully. Found {details.get('fai_count', 0)} FAI columns for analysis.",
                    "checkpoints": [checkpoint1, checkpoint2, checkpoint3],
                    "categorical_columns": ["Go to Commonality Analysis"],
                    "sheets": [details.get("data_sheet", "data")],
                    "data_shape": [details.get("total_rows", 0), details.get("total_columns", 0)],
                    "fai_columns": details.get("fai_columns", []),
                    "summary": {
                        "total_checkpoints": 3,
                        "passed_checkpoints": 3,
                        "fix_applied": False
                    }
                }
                
                return wizard_response
            else:
                # Return error in wizard-compatible format
                error_checkpoint = {
                    "valid": False,
                    "checkpoint": 1,
                    "message": result.get("message", "Validation failed"),
                    "details": result.get("details", {})
                }
                
                return {
                    "valid": False,
                    "message": "Data processing failed",
                    "checkpoints": [error_checkpoint],
                    "error": result.get("error", "Unknown error")
                }
            
    except Exception as e:
        logger.error(f"Error in process_data: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"error": f"Data processing failed: {str(e)}"}
        )

@router.post("/generate-files")
async def generate_files(
    file: UploadFile = File(...),
    project_name: str = Form("Commonality Analysis"),
    project_description: str = Form("")
):
    """Generate CSV and JSL files (for wizard compatibility)"""
    try:
        logger.info(f"Generating files for wizard: {file.filename}")
        
        # Get the original file extension
        file_ext = Path(file.filename).suffix.lower()
        if not file_ext:
            file_ext = '.xlsx'  # Default fallback
        
        # Save uploaded file temporarily with correct extension
        with tempfile.NamedTemporaryFile(delete=False, suffix=file_ext) as tmp_file:
            content = await file.read()
            tmp_file.write(content)
            tmp_file.flush()
            
            # Process the file
            result = processor.process_excel_file(
                tmp_file.name,
                project_name,
                project_description
            )
            
            # Clean up
            os.unlink(tmp_file.name)
            
            if result["success"]:
                return result
            else:
                return JSONResponse(
                    status_code=400,
                    content={"error": result.get("error", "File generation failed")}
                )
            
    except Exception as e:
        logger.error(f"Error in generate_files: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"error": f"File generation failed: {str(e)}"}
        )

@router.post("/run-analysis")
async def run_analysis(
    file: UploadFile = File(...),
    project_id: str = Form(...),
    project_name: str = Form("Commonality Analysis"),
    project_description: str = Form(""),
    cat_var: str = Form(None),  # Accept but ignore categorical variable for commonality
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Run complete commonality analysis using JMP runner"""
    try:
        logger.info(f"Running commonality analysis for project: {project_name}")
        
        # Get the original file extension
        file_ext = Path(file.filename).suffix.lower()
        if not file_ext:
            file_ext = '.xlsx'  # Default fallback
        
        # Save uploaded file temporarily with correct extension
        with tempfile.NamedTemporaryFile(delete=False, suffix=file_ext) as tmp_file:
            content = await file.read()
            tmp_file.write(content)
            tmp_file.flush()
            
            # Run analysis to generate CSV and JSL
            result = processor.analyzer.analyze_excel_file(tmp_file.name)
            
            # Clean up temp file
            os.unlink(tmp_file.name)
            
            if not result["success"]:
                return JSONResponse(
                    status_code=400,
                    content={
                        "success": False,
                        "error": result.get("error", "Analysis failed")
                    }
                )
            
            # Read generated files
            csv_path = result["csv_path"]
            jsl_path = result["jsl_path"]
            
            with open(csv_path, 'rb') as f:
                csv_bytes = f.read()
            with open(jsl_path, 'rb') as f:
                jsl_bytes = f.read()
            
            # Generate storage keys
            csv_key = local_storage.generate_storage_key("data.csv", "text/csv")
            jsl_key = local_storage.generate_storage_key("analysis.jsl", "text/plain")
            
            # Save files to storage
            local_storage.save_file(csv_bytes, csv_key)
            local_storage.save_file(jsl_bytes, jsl_key)
            
            # Create ZIP file with original Excel, CSV, and JSL
            zip_result = ZipFileGenerator.create_analysis_zip(
                excel_content=content,
                excel_filename=file.filename,
                csv_content=result["csv_content"],
                jsl_content=result["jsl_content"],
                analysis_type="commonality"
            )
            
            if zip_result["success"]:
                # Save ZIP file to storage
                zip_key = local_storage.generate_project_attachment_key(project_id, f"analysis_{file.filename}.zip")
                with open(zip_result["zip_path"], 'rb') as zip_file:
                    zip_content = zip_file.read()
                local_storage.save_file(zip_content, zip_key)
                
                # Clean up temporary ZIP file
                os.unlink(zip_result["zip_path"])
                
                logger.info(f"Created ZIP file attachment: {zip_key}")
            else:
                logger.error(f"Failed to create ZIP file: {zip_result.get('error')}")
                zip_key = None
            
            # Create run via standard API
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
                
                # Add ZIP file as project attachment directly to database
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
                        
                        logger.info(f"Successfully created ZIP attachment for run {run_id}")
                    except Exception as e:
                        logger.error(f"Error creating ZIP attachment: {str(e)}")
                        await db.rollback()
                else:
                    logger.info(f"Skipping ZIP attachment creation for run {run_id}")
            
            # Clean up generated files
            os.unlink(csv_path)
            os.unlink(jsl_path)
            
            return {
                "success": True,
                "message": "Run created and queued",
                "run": run_json,
                "storage": {"csv_key": csv_key, "jsl_key": jsl_key, "zip_key": zip_key},
                "zip_info": zip_result if zip_result["success"] else None
            }
            
    except Exception as e:
        logger.error(f"Error running commonality analysis: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": f"Analysis failed: {str(e)}"
            }
        )

@router.get("/info")
async def get_plugin_info():
    """Get plugin information"""
    return {
        "name": "Excel2Commonality",
        "version": "1.0.0",
        "description": "Excel to Commonality analysis with multi-variable visualization",
        "supported_formats": ['.xlsx', '.xls', '.xlsm', '.xlsb'],
        "required_columns": ["测试时间", "EGL铆接治具号", "EGL焊接治具号", "镍片放料工位", "AFMT治具"],
        "features": [
            "Automatic sheet detection",
            "FAI column detection",
            "Multi-variable visualization",
            "JSL script generation",
            "CSV export"
        ]
    }
