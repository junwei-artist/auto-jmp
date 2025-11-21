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


class DuckDB2JMPNode(BaseNode):
    """Converts DuckDB files to JSL/CSV pairs for JMP analysis. Each table is treated as a sheet."""
    
    @property
    def module_type(self) -> str:
        return "duckdb2jmp"
    
    @property
    def display_name(self) -> str:
        return "DuckDB to JMP"
    
    @property
    def description(self) -> str:
        return "Convert DuckDB files to JSL/CSV pairs for JMP analysis. Each table is treated as a sheet. Supports extremely large datasets with chunked processing."
    
    @property
    def inputs(self) -> List[Port]:
        return [
            Port(
                name="file",
                type=PortType.FILE,
                label="DuckDB File",
                description="DuckDB file to convert (each table will be processed separately)",
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
                description="List of generated JSL/CSV pairs (one per table)"
            )
        ]
    
    async def execute(self, inputs: Dict[str, Any], io_manager) -> NodeResult:
        """Execute the DuckDB to JMP converter node"""
        # Get file from inputs or config
        file_key = inputs.get("file") or self.config.get("file_key")
        
        if not file_key:
            return NodeResult(
                success=False,
                outputs={},
                error="No DuckDB file provided"
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
            
            # Get input and output paths
            node_path = local_storage.get_workflow_node_path(workflow_id, node_id)
            input_path = node_path / "input"
            output_path = node_path / "output"
            input_path.mkdir(parents=True, exist_ok=True)
            output_path.mkdir(parents=True, exist_ok=True)
            
            # Save DuckDB file to input folder if not already there
            duckdb_filename = file_key.split('/')[-1] if '/' in file_key else f"input_{uuid.uuid4()}.duckdb"
            if not duckdb_filename.endswith('.duckdb'):
                duckdb_filename = f"{duckdb_filename}.duckdb"
            
            duckdb_path = input_path / duckdb_filename
            duckdb_path.write_bytes(file_content)
            
            try:
                # Initialize processors
                file_handler = FileHandler()
                validator = DataValidator()
                data_processor = DataProcessor()
                file_processor = FileProcessor()
                
                # Load DuckDB file
                load_result = file_handler.load_duckdb_file(str(duckdb_path))
                if not load_result.get("success"):
                    return NodeResult(
                        success=False,
                        outputs={},
                        error=f"Failed to load DuckDB file: {load_result.get('error', 'Unknown error')}"
                    )
                
                tables = load_result.get("tables", [])
                if not tables:
                    return NodeResult(
                        success=False,
                        outputs={},
                        error="No tables found in DuckDB file"
                    )
                
                # Get configuration
                cat_var = self.config.get("cat_var") or "Stage"
                color_by = self.config.get("color_by")
                selected_tables = self.config.get("selected_tables") or tables  # Process all tables by default
                chunk_size = self.config.get("chunk_size", 100000)  # Default chunk size
                
                # Find meta table (look for table with 'meta' in name or first table)
                meta_table = None
                for table in tables:
                    if "meta" in table.lower():
                        meta_table = table
                        break
                
                if not meta_table and len(tables) > 0:
                    # Use first table as meta if no explicit meta table found
                    meta_table = tables[0]
                
                # Load meta table
                meta_result = file_handler.load_meta_table(meta_table)
                if not meta_result.get("success"):
                    return NodeResult(
                        success=False,
                        outputs={},
                        error=f"Failed to load meta table: {meta_result.get('error', 'Unknown error')}"
                    )
                
                df_meta = file_handler.df_meta
                
                # Process each selected table
                all_pairs = []
                
                for table_name in selected_tables:
                    if table_name == meta_table:
                        continue  # Skip meta table
                    
                    logger.info(f"Processing table: {table_name}")
                    
                    # Load table (with chunking for large tables)
                    table_result = file_handler.load_table(table_name, chunk_size=chunk_size)
                    if not table_result.get("success"):
                        logger.warning(f"Failed to load table {table_name}: {table_result.get('error')}")
                        continue
                    
                    df_data = file_handler.df_data_raw
                    fai_columns = file_handler.fai_columns
                    
                    # Set categorical variable
                    set_cat_result = file_handler.set_categorical_variable(cat_var)
                    if not set_cat_result.get("success"):
                        logger.warning(f"Failed to set categorical variable for {table_name}: {set_cat_result.get('error')}")
                        continue
                    
                    # Validate data (using sample if chunked)
                    validation_result = validator.run_full_validation(df_meta, df_data, cat_var)
                    if not validation_result.get("success"):
                        logger.warning(f"Data validation failed for {table_name}: {validation_result.get('error')}")
                        continue
                    
                    # Process data (using all data from DuckDB for boundaries calculation)
                    is_large = table_result.get("is_chunked", False)
                    if is_large:
                        # For large tables, calculate boundaries from all data in DuckDB
                        process_result = data_processor.process_data(
                            df_meta, 
                            df_data,  # Sample for validation only
                            fai_columns, 
                            cat_var,
                            duckdb_path=str(duckdb_path),
                            table_name=table_name
                        )
                    else:
                        # For small tables, use the loaded data
                        process_result = data_processor.process_data(df_meta, df_data, fai_columns, cat_var)
                    
                    if not process_result.get("success"):
                        logger.warning(f"Data processing failed for {table_name}: {process_result.get('error')}")
                        continue
                    
                    # Generate files (with chunked processing if needed)
                    file_result = file_processor.generate_files(
                        df_meta,
                        df_data if not is_large else None,  # Only pass df_data for small tables
                        process_result["boundaries"],
                        cat_var,
                        fai_columns,
                        color_by,
                        duckdb_path=str(duckdb_path) if is_large else None,
                        table_name=table_name if is_large else None,
                        chunk_size=chunk_size if is_large else None
                    )
                    
                    if not file_result.get("success"):
                        logger.warning(f"File generation failed for {table_name}: {file_result.get('error')}")
                        continue
                    
                    # Create timestamped pair folder for this table
                    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                    pair_id = str(uuid.uuid4())[:8]
                    pair_folder = output_path / f"pair_{table_name}_{timestamp}_{pair_id}"
                    pair_folder.mkdir(parents=True, exist_ok=True)
                    
                    # Save CSV and JSL files
                    csv_content = file_result["files"]["csv_content"]
                    jsl_content = file_result["files"]["jsl_content"]
                    
                    csv_filename = f"data_{table_name}_{timestamp}_{pair_id}.csv"
                    jsl_filename = f"script_{table_name}_{timestamp}_{pair_id}.jsl"
                    
                    csv_path = pair_folder / csv_filename
                    jsl_path = pair_folder / jsl_filename
                    
                    csv_path.write_text(csv_content, encoding='utf-8')
                    jsl_path.write_text(jsl_content, encoding='utf-8')
                    
                    # Set JSL file permissions
                    jsl_path.chmod(0o644)
                    
                    # Create metadata JSON
                    metadata = {
                        "pair_id": pair_id,
                        "table_name": table_name,
                        "timestamp": timestamp,
                        "csv_filename": csv_filename,
                        "jsl_filename": jsl_filename,
                        "cat_var": cat_var,
                        "color_by": color_by,
                        "fai_columns": fai_columns,
                        "chunked": is_large,
                        "created_at": datetime.now().isoformat()
                    }
                    
                    metadata_path = pair_folder / "metadata.json"
                    metadata_path.write_text(json.dumps(metadata, indent=2), encoding='utf-8')
                    
                    # Get relative paths for storage keys
                    csv_storage_key = f"workflows/{workflow_id}/nodes/{node_id}/output/{pair_folder.name}/{csv_filename}"
                    jsl_storage_key = f"workflows/{workflow_id}/nodes/{node_id}/output/{pair_folder.name}/{jsl_filename}"
                    
                    pair_info = {
                        "pair_id": pair_id,
                        "table_name": table_name,
                        "pair_folder": pair_folder.name,
                        "csv_path": csv_storage_key,
                        "jsl_path": jsl_storage_key,
                        "csv_filename": csv_filename,
                        "jsl_filename": jsl_filename,
                        "metadata": metadata
                    }
                    
                    all_pairs.append(pair_info)
                    logger.info(f"Successfully processed table {table_name}: {pair_folder.name}")
                
                if not all_pairs:
                    return NodeResult(
                        success=False,
                        outputs={},
                        error="No tables were successfully processed"
                    )
                
                return NodeResult(
                    success=True,
                    outputs={
                        "jsl_csv_pairs": all_pairs
                    },
                    metadata={
                        "pairs_created": len(all_pairs),
                        "tables_processed": len(selected_tables),
                        "total_tables": len(tables)
                    }
                )
                
            except Exception as e:
                logger.error(f"Error processing DuckDB file: {str(e)}", exc_info=True)
                raise
        
        except Exception as e:
            logger.error(f"Failed to convert DuckDB to JMP: {str(e)}", exc_info=True)
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
                    "description": "Storage key of the DuckDB file to convert"
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
                },
                "selected_tables": {
                    "type": "array",
                    "items": {"type": "string"},
                    "title": "Selected Tables",
                    "description": "List of table names to process (empty = all tables)"
                },
                "chunk_size": {
                    "type": "integer",
                    "title": "Chunk Size",
                    "description": "Number of rows to process at a time for large datasets (default: 100000)",
                    "default": 100000
                }
            },
            "required": []
        }

