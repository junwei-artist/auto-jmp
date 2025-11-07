from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Form
from fastapi.responses import JSONResponse
from typing import Dict, Any, List, Optional
import pandas as pd
import tempfile
import os
from pathlib import Path
import logging
from .processor import ExcelToCommonalityGenericProcessor
import json
from app.core.storage import local_storage
from ..base.zip_utils import ZipFileGenerator
from app.core.database import get_db
from app.core.auth import get_current_user_optional
from app.models import ProjectAttachment, AppUser
from sqlalchemy.ext.asyncio import AsyncSession
import uuid
from datetime import datetime

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/excel2commonality-generic", tags=["excel2commonality-generic"])

# Initialize processor
try:
    processor = ExcelToCommonalityGenericProcessor()
    logger.info("Commonality-Generic processor initialized successfully")
except Exception as e:
    logger.error(f"Failed to initialize Commonality-Generic processor: {e}")
    raise e

@router.get("/test")
async def test_endpoint():
    """Test endpoint to debug processor initialization"""
    try:
        return {"status": "ok", "processor": str(type(processor))}
    except Exception as e:
        return {"status": "error", "error": str(e)}

@router.post("/load-file")
async def load_file(
    file: UploadFile = File(...),
    sheet_name: Optional[str] = Form(None)
):
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
            result = processor.validate_excel_structure(tmp_file.name, sheet_name)
            
            # Clean up
            os.unlink(tmp_file.name)
            
            # Add wizard-specific fields
            if result.get("valid", False):
                details = result.get("details", {})
                
                checkpoint1 = {
                    "valid": True,
                    "checkpoint": 1,
                    "message": "Excel file structure validated successfully",
                    "details": details
                }
                
                return {
                    "valid": True,
                    "message": "File loaded successfully. Ready to select categorical columns.",
                    "checkpoints": [checkpoint1],
                    "data_sheet": details.get("data_sheet", ""),
                    "all_columns": details.get("all_columns", []),
                    "total_columns": details.get("total_columns", 0),
                    "summary": {
                        "total_checkpoints": 1,
                        "passed_checkpoints": 1,
                        "fix_applied": False
                    }
                }
            else:
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
    sheet_name: Optional[str] = Form(None)
):
    """Process data to find FAI and non-FAI columns (for wizard compatibility)"""
    try:
        logger.info(f"Processing data for wizard: {file.filename}")
        
        # Get the original file extension
        file_ext = Path(file.filename).suffix.lower()
        if not file_ext:
            file_ext = '.xlsx'  # Default fallback
        
        # Save uploaded file temporarily with correct extension
        with tempfile.NamedTemporaryFile(delete=False, suffix=file_ext) as tmp_file:
            content = await file.read()
            tmp_file.write(content)
            tmp_file.flush()
            
            # Get engine for meta sheet check
            engine = processor.analyzer.get_excel_engine(tmp_file.name)
            
            # Check if meta sheet exists before cleanup
            has_meta = processor.analyzer.check_meta_sheet(tmp_file.name, engine)
            
            # Run data content validation
            result = processor.validate_data_content(tmp_file.name, sheet_name)
            
            # Extract meta specs if meta sheet exists
            meta_specs = None
            if has_meta:
                try:
                    import pandas as pd
                    meta_df = pd.read_excel(tmp_file.name, sheet_name="meta", engine=engine, nrows=1)
                    if not meta_df.empty and {"test_name", "target", "usl", "lsl"}.issubset(meta_df.columns):
                        meta_specs = {
                            "target": float(meta_df["target"].values[0]) if pd.notna(meta_df["target"].values[0]) else None,
                            "usl": float(meta_df["usl"].values[0]) if pd.notna(meta_df["usl"].values[0]) else None,
                            "lsl": float(meta_df["lsl"].values[0]) if pd.notna(meta_df["lsl"].values[0]) else None
                        }
                except Exception as e:
                    logger.warning(f"Failed to extract meta specs: {e}")
            
            # Clean up
            os.unlink(tmp_file.name)
            
            # Add wizard-specific fields
            if result.get("valid", False):
                details = result.get("details", {})
                
                checkpoint1 = {
                    "valid": True,
                    "checkpoint": 1,
                    "message": "Excel file structure validated successfully",
                    "details": {
                        "file_format": details.get("file_format", ""),
                        "engine": details.get("engine", ""),
                        "data_sheet": details.get("data_sheet", "")
                    }
                }
                
                checkpoint2 = {
                    "valid": True,
                    "checkpoint": 2,
                    "message": f"Data content validated. Found {details.get('fai_count', 0)} FAI columns and {details.get('non_fai_count', 0)} potential categorical columns",
                    "details": {
                        "data_sheet": details.get("data_sheet", ""),
                        "total_rows": details.get("total_rows", 0),
                        "total_columns": details.get("total_columns", 0),
                        "fai_columns": details.get("fai_columns", []),
                        "fai_count": details.get("fai_count", 0),
                        "non_fai_columns": details.get("non_fai_columns", []),
                        "non_fai_count": details.get("non_fai_count", 0)
                    }
                }
                
                return {
                    "valid": True,
                    "message": f"Data processed successfully. Found {details.get('fai_count', 0)} FAI columns and {details.get('non_fai_count', 0)} categorical columns.",
                    "checkpoints": [checkpoint1, checkpoint2],
                    "data_sheet": details.get("data_sheet", ""),
                    "fai_columns": details.get("fai_columns", []),
                    "non_fai_columns": details.get("non_fai_columns", []),
                    "data_shape": [details.get("total_rows", 0), details.get("total_columns", 0)],
                    "has_meta_sheet": has_meta,
                    "meta_specs": meta_specs,
                    "summary": {
                        "total_checkpoints": 2,
                        "passed_checkpoints": 2,
                        "fix_applied": False
                    }
                }
            else:
                error_checkpoint = {
                    "valid": False,
                    "checkpoint": 2,
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
    categorical_columns: str = Form(...),  # JSON string of selected categorical columns
    project_name: str = Form("Commonality Analysis"),
    project_description: str = Form(""),
    sheet_name: Optional[str] = Form(None)
):
    """Generate CSV and JSL files with user-selected categorical columns (for wizard compatibility)"""
    try:
        logger.info(f"Generating files for wizard: {file.filename}")
        
        # Parse categorical columns from JSON string
        try:
            cat_cols = json.loads(categorical_columns)
            if not isinstance(cat_cols, list):
                raise ValueError("categorical_columns must be a JSON array")
        except json.JSONDecodeError as e:
            return JSONResponse(
                status_code=400,
                content={"error": f"Invalid JSON for categorical_columns: {str(e)}"}
            )
        
        if not cat_cols:
            return JSONResponse(
                status_code=400,
                content={"error": "At least one categorical column must be selected"}
            )
        
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
                cat_cols,
                project_name,
                project_description,
                sheet_name
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
    categorical_columns: str = Form(...),  # JSON string of selected categorical columns
    project_name: str = Form("Commonality Analysis"),
    project_description: str = Form(""),
    sheet_name: Optional[str] = Form(None),
    ref_line_config: Optional[str] = Form(None),  # JSON string of reference line configuration
    variable_data_types: Optional[str] = Form(None),  # JSON string of variable data type configuration
    color_by_variable: Optional[str] = Form(None),  # Variable name to use for coloring
    caption_boxes_enabled: Optional[str] = Form(None),  # JSON string of caption boxes configuration
    graph_width: int = Form(1280),  # Graph width in pixels
    graph_height: int = Form(720),  # Graph height in pixels
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Run complete commonality analysis using JMP runner with user-selected categorical columns"""
    try:
        logger.info(f"Running commonality-generic analysis for project: {project_name}")
        stage = "init"
        
        # Parse categorical columns from JSON string
        try:
            cat_cols = json.loads(categorical_columns)
            if not isinstance(cat_cols, list):
                raise ValueError("categorical_columns must be a JSON array")
        except json.JSONDecodeError as e:
            return JSONResponse(
                status_code=400,
                content={"error": f"Invalid JSON for categorical_columns: {str(e)}"}
            )
        
        if not cat_cols:
            return JSONResponse(
                status_code=400,
                content={"error": "At least one categorical column must be selected"}
            )
        
        # Get the original file extension
        filename = file.filename or "file.xlsx"
        file_ext = Path(filename).suffix.lower()
        if not file_ext or file_ext not in ['.xlsx', '.xls', '.xlsm', '.xlsb']:
            file_ext = '.xlsx'  # Default fallback
        
        # Save uploaded file temporarily with correct extension
        tmp_file_path = None
        with tempfile.NamedTemporaryFile(delete=False, suffix=file_ext) as tmp_file:
            tmp_file_path = tmp_file.name
            content = await file.read()
            tmp_file.write(content)
            tmp_file.flush()
        
        try:
            # Parse reference line configuration if provided
            ref_line_config_dict = None
            if ref_line_config:
                try:
                    ref_line_config_dict = json.loads(ref_line_config)
                    logger.info(f"[Commonality-Generic] Reference line configuration: {ref_line_config_dict}")
                except json.JSONDecodeError as e:
                    logger.warning(f"[Commonality-Generic] Invalid JSON for ref_line_config: {str(e)}")
            
            # Parse variable data types if provided
            variable_data_types_dict = None
            if variable_data_types:
                try:
                    variable_data_types_dict = json.loads(variable_data_types)
                    logger.info(f"[Commonality-Generic] Variable data types configuration: {variable_data_types_dict}")
                except json.JSONDecodeError as e:
                    logger.warning(f"[Commonality-Generic] Invalid JSON for variable_data_types: {str(e)}")
            
            # Parse caption boxes configuration if provided
            caption_boxes_enabled_dict = None
            if caption_boxes_enabled:
                try:
                    caption_boxes_enabled_dict = json.loads(caption_boxes_enabled)
                    logger.info(f"[Commonality-Generic] Caption boxes enabled: {caption_boxes_enabled_dict}")
                except json.JSONDecodeError as e:
                    logger.warning(f"[Commonality-Generic] Invalid JSON for caption_boxes_enabled: {str(e)}")
            
            # Run analysis to generate CSV and JSL
            stage = "analyze_excel"
            logger.info(f"[Commonality-Generic] Running analysis with {len(cat_cols)} categorical columns: {cat_cols}")
            if color_by_variable:
                logger.info(f"[Commonality-Generic] Color by variable: {color_by_variable}")
            logger.info(f"[Commonality-Generic] Graph size: {graph_width}x{graph_height}")
            result = processor.analyzer.analyze_excel_file(
                tmp_file_path, cat_cols, sheet_name=sheet_name, 
                ref_line_config=ref_line_config_dict, variable_data_types=variable_data_types_dict,
                color_by_variable=color_by_variable, caption_boxes_enabled=caption_boxes_enabled_dict,
                graph_width=graph_width, graph_height=graph_height
            )
            
            if not result["success"]:
                # Clean up temp file
                if tmp_file_path and os.path.exists(tmp_file_path):
                    os.unlink(tmp_file_path)
                return JSONResponse(
                    status_code=400,
                    content={
                        "success": False,
                        "error": result.get("error", "Analysis failed"),
                        "stage": stage,
                        "details": result
                    }
                )
            
            # Read generated files
            csv_path = result.get("csv_path")
            jsl_path = result.get("jsl_path")
            
            if not csv_path or not os.path.exists(csv_path):
                raise ValueError(f"CSV file not found: {csv_path}")
            if not jsl_path or not os.path.exists(jsl_path):
                raise ValueError(f"JSL file not found: {jsl_path}")
            
            logger.info(f"[Commonality-Generic] Reading generated files:")
            logger.info(f"  CSV path: {csv_path}")
            logger.info(f"  JSL path: {jsl_path}")
            
            with open(csv_path, 'rb') as f:
                csv_bytes = f.read()
            with open(jsl_path, 'rb') as f:
                jsl_bytes = f.read()
            
            # Update JSL content to use correct CSV filename (will be updated again when run is created)
            # Store original JSL content for now
            jsl_content_original = result.get("jsl_content", jsl_bytes.decode('utf-8'))
            
            logger.info(f"[Commonality-Generic] Files read successfully:")
            logger.info(f"  CSV size: {len(csv_bytes)} bytes")
            logger.info(f"  JSL size: {len(jsl_bytes)} bytes")
            
            # Generate storage keys
            stage = "persist_files"
            csv_key = local_storage.generate_storage_key("data.csv", "text/csv")
            jsl_key = local_storage.generate_storage_key("analysis.jsl", "text/plain")
            
            # Save files to storage
            local_storage.save_file(csv_bytes, csv_key)
            local_storage.save_file(jsl_bytes, jsl_key)
            
            # Create ZIP file with original Excel, CSV, and JSL
            stage = "create_zip"
            excel_filename = file.filename or filename
            zip_result = ZipFileGenerator.create_analysis_zip(
                excel_content=content,
                excel_filename=excel_filename,
                csv_content=result["csv_content"],
                jsl_content=result["jsl_content"],
                analysis_type="commonality-generic"
            )
            
            if zip_result["success"]:
                # Save ZIP file to storage
                zip_key = local_storage.generate_project_attachment_key(project_id, f"analysis_{excel_filename}.zip")
                with open(zip_result["zip_path"], 'rb') as zip_file:
                    zip_content = zip_file.read()
                local_storage.save_file(zip_content, zip_key)
                
                # Clean up temporary ZIP file
                os.unlink(zip_result["zip_path"])
                
                logger.info(f"Created ZIP file attachment: {zip_key}")
            else:
                logger.error(f"Failed to create ZIP file: {zip_result.get('error')}")
                zip_key = None
            
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
                        started_by=current_user.id if current_user else None,
                        status=RunStatus.QUEUED,
                        task_name="jmp_boxplot",
                        message="Run queued"
                    )
                    create_db.add(run)
                    await create_db.commit()
                    await create_db.refresh(run)
                    
                    logger.info(f"[Commonality-Generic] Run created: {run.id}")
                    
                    # Generate the final CSV filename that will be used in run folder
                    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
                    short_uid = str(uuid.uuid4())[:8]
                    final_csv_filename = f"data_{ts}_{short_uid}.csv"
                    
                    # STEP 2: Create run folder immediately after run is created
                    run_dir_key = f"runs/{str(run.id)}"
                    run_dir_path = local_storage.get_file_path(run_dir_key)
                    run_dir_path.mkdir(parents=True, exist_ok=True)
                    
                    logger.info(f"[Commonality-Generic] Run folder created: {run_dir_path}")
                    
                    # STEP 3: Save submitted files directly to run folder
                    dst_csv_filename = final_csv_filename
                    dst_jsl_filename = f"analysis_{ts}_{short_uid}.jsl"
                    dst_csv_rel_key = f"{run_dir_key}/{dst_csv_filename}"
                    dst_jsl_rel_key = f"{run_dir_key}/{dst_jsl_filename}"
                    dst_csv_path = local_storage.get_file_path(dst_csv_rel_key)
                    dst_jsl_path = local_storage.get_file_path(dst_jsl_rel_key)
                    
                    dst_csv_path.parent.mkdir(parents=True, exist_ok=True)
                    
                    # Determine source file paths from temp/upload location
                    src_csv_path = local_storage.get_file_path(csv_key)
                    src_jsl_path = local_storage.get_file_path(jsl_key)
                    
                    logger.info(f"[Commonality-Generic] Copying submitted files to run folder:")
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
                    
                    # Update JSL content with correct CSV filename before writing
                    # Read the current JSL content and replace filename
                    jsl_content_to_write = src_jsl_path.read_bytes().decode('utf-8')
                    # Replace CSV filename references in the JSL with the final filename
                    import re
                    # Pattern to match commonality_data_*.csv filenames
                    old_pattern = r'commonality_data_[a-f0-9]{8}\.csv'
                    jsl_content_to_write = re.sub(old_pattern, final_csv_filename, jsl_content_to_write)
                    # Also replace Open() statements that reference CSV files specifically
                    csv_open_pattern = r'Open\("commonality_data_[a-f0-9]{8}\.csv"\)'
                    jsl_content_to_write = re.sub(csv_open_pattern, f'Open("{final_csv_filename}")', jsl_content_to_write)
                    dst_jsl_path.write_bytes(jsl_content_to_write.encode('utf-8'))
                    
                    # Also update result["jsl_content"] for consistency
                    result["jsl_content"] = jsl_content_to_write
                    
                    # CRITICAL: Set JSL file permissions to prevent macOS auto-opening
                    dst_jsl_path.chmod(0o644)  # rw-r--r--
                    
                    logger.info(f"[Commonality-Generic] Files copied to run folder:")
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
                    
                    logger.info(f"[Commonality-Generic] Artifacts created with run folder paths:")
                    logger.info(f"  CSV artifact storage_key: {csv_artifact.storage_key}")
                    logger.info(f"  JSL artifact storage_key: {jsl_artifact.storage_key}")
                    
                    # Clean up original temp/upload files
                    try:
                        if src_csv_path.exists() and src_csv_path != dst_csv_path:
                            src_csv_path.unlink()
                            logger.info(f"[Commonality-Generic] Removed original CSV file: {src_csv_path}")
                        if src_jsl_path.exists() and src_jsl_path != dst_jsl_path:
                            src_jsl_path.unlink()
                            logger.info(f"[Commonality-Generic] Removed original JSL file: {src_jsl_path}")
                    except Exception as e:
                        logger.warning(f"[Commonality-Generic] Failed to remove original temp files: {e}")
                    
                    # CRITICAL: Final verification - ensure files exist in run folder before queuing Celery
                    final_csv_path = local_storage.get_file_path(csv_artifact.storage_key)
                    final_jsl_path = local_storage.get_file_path(jsl_artifact.storage_key)
                    
                    if not final_csv_path.exists():
                        raise ValueError(f"CSV file not found in run folder before queuing Celery: {final_csv_path}")
                    if not final_jsl_path.exists():
                        raise ValueError(f"JSL file not found in run folder before queuing Celery: {final_jsl_path}")
                    
                    logger.info(f"[Commonality-Generic] Final verification passed - files ready in run folder before queuing Celery:")
                    logger.info(f"  CSV: {final_csv_path} (size: {final_csv_path.stat().st_size} bytes)")
                    logger.info(f"  JSL: {final_jsl_path} (size: {final_jsl_path.stat().st_size} bytes)")
                    
                    # STEP 5: Prepare task folder and task id BEFORE enqueuing Celery
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
                        logger.info("[Commonality-Generic] Replaced existing Open() header and comments in JSL")
                    else:
                        modified_jsl_content = jsl_header + jsl_content
                        logger.info("[Commonality-Generic] Prepended Open() header and comments to JSL")
                    
                    # Write modified JSL to task folder
                    jsl_dst.write_text(modified_jsl_content, encoding='utf-8')
                    
                    logger.info(f"[Commonality-Generic] Added JSL header with metadata:")
                    logger.info(f"[Commonality-Generic]   Run ID: {str(run.id)}")
                    logger.info(f"[Commonality-Generic]   Task Folder ID: {jmp_task_id}")
                    logger.info(f"[Commonality-Generic]   Created: {create_time}")

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
                    logger.info(f"[Commonality-Generic] Queuing Celery task 'run_jmp_boxplot' for run {run.id}")
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
                    logger.error(f"[Commonality-Generic] Failed to create run directly: {e}", exc_info=True)
                    if csv_path and os.path.exists(csv_path):
                        os.unlink(csv_path)
                    if jsl_path and os.path.exists(jsl_path):
                        os.unlink(jsl_path)
                    return JSONResponse(
                        status_code=400,
                        content={
                            "success": False,
                            "error": f"Failed to create run: {last_error}",
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
                            filename=f"analysis_{excel_filename}.zip",
                            description=f"Auto generated with {excel_filename}",
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

                # Save original Excel into per-run folder for traceability
                try:
                    if run_id:
                        run_dir_key = f"runs/{run_id}"
                        run_dir_path = local_storage.get_file_path(run_dir_key)
                        run_dir_path.mkdir(parents=True, exist_ok=True)
                        original_name = file.filename or f"original{file_ext}"
                        base = Path(original_name).stem or "original"
                        ext = Path(original_name).suffix or file_ext or ".xlsx"
                        ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
                        uid = str(uuid.uuid4())[:8]
                        stamped_name = f"{base}_{ts}_{uid}{ext}"
                        dst_excel_path = run_dir_path / stamped_name
                        dst_excel_path.write_bytes(content)
                except Exception:
                    pass
            
            # Clean up generated files (they're now in run folder)
            try:
                if csv_path and os.path.exists(csv_path):
                    os.unlink(csv_path)
                if jsl_path and os.path.exists(jsl_path):
                    os.unlink(jsl_path)
            except Exception as cleanup_error:
                logger.warning(f"[Commonality-Generic] Failed to clean up temp files: {cleanup_error}")
            
            # Clean up temp uploaded file
            try:
                if tmp_file_path and os.path.exists(tmp_file_path):
                    os.unlink(tmp_file_path)
            except Exception as cleanup_error:
                logger.warning(f"[Commonality-Generic] Failed to clean up temp uploaded file: {cleanup_error}")
            
            stage = "cleanup"
            return {
                "success": True,
                "message": "Run created and queued",
                "run": run_json,
                "storage": {"csv_key": csv_key, "jsl_key": jsl_key, "zip_key": zip_key},
                "zip_info": zip_result if zip_result["success"] else None
            }
            
        except Exception as e:
            # Clean up temp file on error
            if tmp_file_path and os.path.exists(tmp_file_path):
                try:
                    os.unlink(tmp_file_path)
                except:
                    pass
            raise
            
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        logger.error(f"Error running commonality-generic analysis: {str(e)}")
        logger.error(f"Traceback: {error_trace}")
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": f"Analysis failed: {str(e)}",
                "stage": locals().get("stage", "unknown"),
                "traceback": error_trace
            }
        )

@router.get("/info")
async def get_plugin_info():
    """Get plugin information"""
    return {
        "name": "Excel2Commonality-Generic",
        "version": "1.0.0",
        "description": "Excel to Commonality analysis with user-selected categorical variables",
        "supported_formats": ['.xlsx', '.xls', '.xlsm', '.xlsb'],
        "features": [
            "Automatic sheet detection",
            "FAI column detection",
            "Non-FAI column detection for categorical variables",
            "User-selected categorical columns",
            "Multi-variable visualization",
            "JSL script generation",
            "CSV export"
        ]
    }