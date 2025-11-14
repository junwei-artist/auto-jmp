import pandas as pd
from typing import Dict, Any, List, Optional
from app.workspaces.engine.node_base import BaseNode, NodeResult, Port, PortType
from pathlib import Path
from datetime import datetime
import uuid
import json
import logging

# Import processors from local module files
from .file_handler import FileHandler
from .data_validator import DataValidator
from .data_process import DataProcessor
from .file_processor import FileProcessor

logger = logging.getLogger(__name__)


class Excel2JMPNode(BaseNode):
    """Converts Excel files to JSL/CSV pairs for JMP analysis"""
    
    @property
    def module_type(self) -> str:
        return "excel2jmp"
    
    @property
    def display_name(self) -> str:
        return "Excel to JMP"
    
    @property
    def description(self) -> str:
        return "Convert Excel files to JSL/CSV pairs for JMP analysis. Each conversion creates a pair of files."
    
    @property
    def inputs(self) -> List[Port]:
        return [
            Port(
                name="file",
                type=PortType.FILE,
                label="Excel File",
                description="Excel file to convert (must have 'meta' and 'data' sheets)",
                required=False
            )
        ]
    
    @property
    def outputs(self) -> List[Port]:
        return [
            Port(
                name="jsl_csv_pairs",
                type=PortType.JSON,
                label="JSL/CSV Pairs",
                description="List of generated JSL/CSV pairs"
            )
        ]
    
    async def execute(self, inputs: Dict[str, Any], io_manager) -> NodeResult:
        """Execute the Excel to JMP converter node"""
        # Get file from inputs or config
        file_key = inputs.get("file") or self.config.get("file_key")
        
        if not file_key:
            return NodeResult(
                success=False,
                outputs={},
                error="No Excel file provided"
            )
        
        try:
            # Load the file from storage
            file_content = await io_manager.load_artifact(file_key)
            
            if not isinstance(file_content, bytes):
                return NodeResult(
                    success=False,
                    outputs={},
                    error="Failed to load file content"
                )
            
            # Get workflow and node paths
            from app.core.storage import local_storage
            
            # Extract workflow_id and node_id from file_key or use graph_context
            workflow_id = None
            node_id = self.node_id
            
            if 'workflows/' in file_key:
                parts = file_key.split('/')
                if len(parts) >= 4:
                    workflow_id = parts[1]
            
            if not workflow_id:
                workflow_id = self.config.get("workflow_id")
            
            if not workflow_id:
                return NodeResult(
                    success=False,
                    outputs={},
                    error="Could not determine workflow ID"
                )
            
            # Get output path
            output_path = local_storage.get_workflow_node_path(workflow_id, node_id) / "output"
            output_path.mkdir(parents=True, exist_ok=True)
            
            # Create temporary file to process Excel
            import tempfile
            with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as temp_input:
                temp_input.write(file_content)
                temp_input_path = temp_input.name
            
            try:
                # Initialize processors
                file_handler = FileHandler()
                validator = DataValidator()
                data_processor = DataProcessor()
                file_processor = FileProcessor()
                
                # Load Excel file
                load_result = file_handler.load_excel_file(temp_input_path)
                if not load_result.get("success"):
                    return NodeResult(
                        success=False,
                        outputs={},
                        error=f"Failed to load Excel file: {load_result.get('error', 'Unknown error')}"
                    )
                
                # Get configuration
                cat_var = self.config.get("cat_var") or "Stage"
                color_by = self.config.get("color_by")
                
                # Set categorical variable
                set_cat_result = file_handler.set_categorical_variable(cat_var)
                if not set_cat_result.get("success"):
                    return NodeResult(
                        success=False,
                        outputs={},
                        error=f"Failed to set categorical variable: {set_cat_result.get('error', 'Unknown error')}"
                    )
                
                # Validate data
                df_meta = file_handler.df_meta
                df_data = file_handler.df_data_raw
                fai_columns = file_handler.fai_columns
                
                validation_result = validator.run_full_validation(df_meta, df_data, cat_var)
                if not validation_result.get("success"):
                    return NodeResult(
                        success=False,
                        outputs={},
                        error=f"Data validation failed: {validation_result.get('error', 'Unknown error')}"
                    )
                
                # Process data
                process_result = data_processor.process_data(df_meta, df_data, fai_columns, cat_var)
                if not process_result.get("success"):
                    return NodeResult(
                        success=False,
                        outputs={},
                        error=f"Data processing failed: {process_result.get('error', 'Unknown error')}"
                    )
                
                # Generate files
                file_result = file_processor.generate_files(
                    df_meta,
                    process_result["processed_data"],
                    process_result["boundaries"],
                    cat_var,
                    fai_columns,
                    color_by,
                )
                
                if not file_result.get("success"):
                    return NodeResult(
                        success=False,
                        outputs={},
                        error=f"File generation failed: {file_result.get('error', 'Unknown error')}"
                    )
                
                # Create timestamped pair folder
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                pair_id = str(uuid.uuid4())[:8]
                pair_folder = output_path / f"pair_{timestamp}_{pair_id}"
                pair_folder.mkdir(parents=True, exist_ok=True)
                
                # Save CSV and JSL files
                csv_content = file_result["files"]["csv_content"]
                jsl_content = file_result["files"]["jsl_content"]
                
                csv_filename = f"data_{timestamp}_{pair_id}.csv"
                jsl_filename = f"script_{timestamp}_{pair_id}.jsl"
                
                csv_path = pair_folder / csv_filename
                jsl_path = pair_folder / jsl_filename
                
                csv_path.write_text(csv_content, encoding='utf-8')
                jsl_path.write_text(jsl_content, encoding='utf-8')
                
                # Set JSL file permissions
                jsl_path.chmod(0o644)
                
                # Create metadata JSON
                metadata = {
                    "pair_id": pair_id,
                    "timestamp": timestamp,
                    "csv_filename": csv_filename,
                    "jsl_filename": jsl_filename,
                    "cat_var": cat_var,
                    "color_by": color_by,
                    "fai_columns": fai_columns,
                    "created_at": datetime.now().isoformat()
                }
                
                metadata_path = pair_folder / "metadata.json"
                metadata_path.write_text(json.dumps(metadata, indent=2), encoding='utf-8')
                
                # Get relative paths for storage keys
                csv_storage_key = f"workflows/{workflow_id}/nodes/{node_id}/output/{pair_folder.name}/{csv_filename}"
                jsl_storage_key = f"workflows/{workflow_id}/nodes/{node_id}/output/{pair_folder.name}/{jsl_filename}"
                
                pair_info = {
                    "pair_id": pair_id,
                    "pair_folder": pair_folder.name,
                    "csv_path": csv_storage_key,
                    "jsl_path": jsl_storage_key,
                    "csv_filename": csv_filename,
                    "jsl_filename": jsl_filename,
                    "metadata": metadata
                }
                
                # Clean up temp file
                import os
                os.unlink(temp_input_path)
                
                return NodeResult(
                    success=True,
                    outputs={
                        "jsl_csv_pairs": [pair_info]
                    },
                    metadata={
                        "pair_info": pair_info,
                        "csv_size": csv_path.stat().st_size,
                        "jsl_size": jsl_path.stat().st_size
                    }
                )
                
            except Exception as e:
                # Clean up temp file on error
                import os
                if os.path.exists(temp_input_path):
                    os.unlink(temp_input_path)
                raise
        
        except Exception as e:
            logger.error(f"Failed to convert Excel to JMP: {str(e)}", exc_info=True)
            return NodeResult(
                success=False,
                outputs={},
                error=f"Failed to convert to JMP: {str(e)}"
            )
    
    def get_config_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "file_key": {
                    "type": "string",
                    "title": "File Key",
                    "description": "Storage key of the Excel file to convert"
                },
                "cat_var": {
                    "type": "string",
                    "title": "Categorical Variable",
                    "description": "Categorical variable name (default: 'Stage')",
                    "default": "Stage"
                },
                "color_by": {
                    "type": "string",
                    "title": "Color By",
                    "description": "Optional variable to color by in graphs"
                }
            },
            "required": []
        }

