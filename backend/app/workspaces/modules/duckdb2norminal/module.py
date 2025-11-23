import pandas as pd
from typing import Dict, Any, List, Optional
from app.workspaces.engine.node_base import BaseNode, NodeResult, Port, PortType
from pathlib import Path
import numpy as np
from datetime import datetime
import duckdb


class DuckDB2NorminalNode(BaseNode):
    """Normalizes DuckDB columns by subtracting mean from each value"""
    
    @property
    def module_type(self) -> str:
        return "duckdb2norminal"
    
    @property
    def display_name(self) -> str:
        return "DuckDB to Normalized"
    
    @property
    def description(self) -> str:
        return "Normalize DuckDB columns by subtracting mean from each value (standardization)"
    
    @property
    def inputs(self) -> List[Port]:
        return [
            Port(
                name="file",
                type=PortType.FILE,
                label="DuckDB File",
                description="DuckDB database file to process",
                required=False
            )
        ]
    
    @property
    def outputs(self) -> List[Port]:
        return [
            Port(
                name="file",
                type=PortType.FILE,
                label="Normalized DuckDB File",
                description="Processed DuckDB file with normalized columns"
            )
        ]
    
    async def execute(self, inputs: Dict[str, Any], io_manager) -> NodeResult:
        """Execute the DuckDB normalization node"""
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
            
            # Get processing config
            selected_columns = self.config.get("selected_columns", {})  # {table_name: [column_names]}
            table_name = self.config.get("table_name")  # Optional: specific table
            
            # Process DuckDB file
            from app.core.storage import local_storage
            import tempfile
            
            # Create temporary file to read DuckDB
            with tempfile.NamedTemporaryFile(delete=False, suffix='.duckdb') as temp_input:
                temp_input.write(file_content)
                temp_input_path = temp_input.name
            
            try:
                # Connect to DuckDB database
                conn = duckdb.connect(temp_input_path, read_only=True)
                
                # Get list of tables
                tables_result = conn.execute("SHOW TABLES").fetchall()
                table_names = [row[0] for row in tables_result]
                
                if not table_names:
                    conn.close()
                    return NodeResult(
                        success=False,
                        outputs={},
                        error="No tables found in DuckDB file"
                    )
                
                # Create output DuckDB database
                with tempfile.NamedTemporaryFile(delete=False, suffix='.duckdb') as temp_output:
                    temp_output_path = temp_output.name
                
                output_conn = duckdb.connect(temp_output_path)
                normalization_summary = []
                processed_tables = {}
                
                # Process each table
                for tbl_name in table_names:
                    # If table_name is specified, only process that table
                    if table_name and tbl_name != table_name:
                        # Copy table as-is to output
                        df_copy = conn.execute(f"SELECT * FROM {tbl_name}").df()
                        output_conn.register('temp_df_copy', df_copy)
                        output_conn.execute(f"CREATE TABLE {tbl_name} AS SELECT * FROM temp_df_copy")
                        output_conn.unregister('temp_df_copy')
                        processed_tables[tbl_name] = df_copy
                        continue
                    
                    # Read table into pandas DataFrame for processing
                    df = conn.execute(f"SELECT * FROM {tbl_name}").df()
                    
                    # Get columns to normalize for this table
                    columns_to_normalize = selected_columns.get(tbl_name, [])
                    
                    # If no columns specified, skip normalization but still copy table
                    if not columns_to_normalize:
                        # Copy table as-is
                        output_conn.register('temp_df', df)
                        output_conn.execute(f"CREATE TABLE {tbl_name} AS SELECT * FROM temp_df")
                        output_conn.unregister('temp_df')
                        processed_tables[tbl_name] = df
                        continue
                    
                    # Normalize each selected column
                    for col in columns_to_normalize:
                        if col not in df.columns:
                            continue
                        
                        try:
                            # Convert to numeric, coercing errors to NaN
                            numeric_values = pd.to_numeric(df[col], errors='coerce')
                            
                            # Calculate mean (excluding NaN values)
                            mean_val = numeric_values.mean()
                            
                            # Skip if all values are NaN or mean is NaN
                            if pd.isna(mean_val):
                                continue
                            
                            # Normalize: subtract mean from each value
                            df[col] = numeric_values - mean_val
                            
                            # Record normalization in summary
                            normalization_summary.append({
                                "table": tbl_name,
                                "column": col,
                                "mean": float(mean_val),
                                "timestamp": datetime.now().isoformat()
                            })
                        
                        except Exception as e:
                            print(f"Error normalizing column {col} in table {tbl_name}: {str(e)}")
                            continue
                    
                    # Write processed table to output database
                    output_conn.register('temp_df', df)
                    output_conn.execute(f"CREATE TABLE {tbl_name} AS SELECT * FROM temp_df")
                    output_conn.unregister('temp_df')
                    processed_tables[tbl_name] = df
                
                # Create summary table
                if normalization_summary:
                    summary_df = pd.DataFrame(normalization_summary)
                    summary_table_name = f"Normalization_Summary_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
                else:
                    # Create empty summary if no normalizations
                    summary_df = pd.DataFrame({
                        "table": [],
                        "column": [],
                        "mean": [],
                        "timestamp": []
                    })
                    summary_table_name = f"Normalization_Summary_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
                
                output_conn.register('temp_summary_df', summary_df)
                output_conn.execute(f"CREATE TABLE {summary_table_name} AS SELECT * FROM temp_summary_df")
                output_conn.unregister('temp_summary_df')
                processed_tables[summary_table_name] = summary_df
                
                # Close connections
                output_conn.close()
                conn.close()
                
                # Save processed DuckDB to output folder
                # Extract workflow_id and node_id from file_key
                parts = file_key.split('/')
                if len(parts) >= 5 and parts[0] == 'workflows' and parts[2] == 'nodes':
                    workflow_id = parts[1]
                    node_id = parts[3]
                    
                    # Extract input filename from file_key (last part after /)
                    input_filename = parts[-1] if len(parts) > 0 else "input.duckdb"
                    
                    # Remove "processed_" prefix if input file is already processed
                    input_filename_base = input_filename
                    if input_filename_base.startswith("processed_"):
                        input_filename_base = input_filename_base[len("processed_"):]
                    
                    # Ensure it ends with .duckdb
                    if not input_filename_base.endswith('.duckdb'):
                        input_filename_base = f"{input_filename_base}.duckdb"
                    
                    # Generate output filename with "processed_" prefix
                    output_filename = f"processed_{input_filename_base}"
                    
                    # Construct output storage key
                    output_key = f"workflows/{workflow_id}/nodes/{node_id}/output/{output_filename}"
                    
                    # Remove existing processed file if it exists (to replace it)
                    output_file_path = local_storage.get_file_path(output_key)
                    if output_file_path.exists():
                        output_file_path.unlink()
                        # Also remove associated metadata file if it exists
                        metadata_file_path = output_file_path.parent / f"{output_file_path.stem}_metadata.json"
                        if metadata_file_path.exists():
                            metadata_file_path.unlink()
                    
                    # Read processed file and save to storage
                    with open(temp_output_path, 'rb') as f:
                        processed_content = f.read()
                    
                    local_storage.save_file(processed_content, output_key)
                    
                    # Clean up temp files
                    Path(temp_input_path).unlink(missing_ok=True)
                    Path(temp_output_path).unlink(missing_ok=True)
                    
                    return NodeResult(
                        success=True,
                        outputs={
                            "file": output_key
                        },
                        metadata={
                            "filename": output_filename,
                            "tables_processed": list(processed_tables.keys()),
                            "summary_table": summary_table_name,
                            "total_normalizations": len(normalization_summary),
                            "original_file": file_key
                        }
                    )
                else:
                    return NodeResult(
                        success=False,
                        outputs={},
                        error=f"Could not determine output path from file_key: {file_key}"
                    )
            
            except Exception as e:
                # Clean up temp file
                Path(temp_input_path).unlink(missing_ok=True)
                raise e
        
        except Exception as e:
            return NodeResult(
                success=False,
                outputs={},
                error=f"Failed to process DuckDB file: {str(e)}"
            )
    
    def get_config_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "selected_columns": {
                    "type": "object",
                    "title": "Selected Columns",
                    "description": "Columns to normalize per table: {table_name: [column_names]}",
                    "default": {}
                },
                "table_name": {
                    "type": "string",
                    "title": "Table Name (optional)",
                    "description": "Specific table to process (if not specified, all tables are processed)"
                }
            },
            "required": []
        }

