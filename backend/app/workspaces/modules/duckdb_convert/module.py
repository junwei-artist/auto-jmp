import pandas as pd
import duckdb
from typing import Dict, Any, List, Optional
from app.workspaces.engine.node_base import BaseNode, NodeResult, Port, PortType
from pathlib import Path
from datetime import datetime
import re
import tempfile
import os


class DuckDBConvertNode(BaseNode):
    """Converts Excel files to DuckDB database with all sheets as tables"""
    
    @property
    def module_type(self) -> str:
        return "duckdb_convert"
    
    @property
    def display_name(self) -> str:
        return "DuckDB Converter"
    
    @property
    def description(self) -> str:
        return "Convert Excel files to DuckDB database. Each sheet becomes a separate table."
    
    @property
    def inputs(self) -> List[Port]:
        return [
            Port(
                name="file",
                type=PortType.FILE,
                label="Excel File",
                description="Excel file to convert (all sheets will be converted to tables)",
                required=False
            )
        ]
    
    @property
    def outputs(self) -> List[Port]:
        return [
            Port(
                name="duckdb_path",
                type=PortType.FILE,
                label="DuckDB Database",
                description="Path to DuckDB database file"
            ),
            Port(
                name="table_names",
                type=PortType.JSON,
                label="Table Names",
                description="List of table names created in DuckDB"
            )
        ]
    
    def _sanitize_table_name(self, sheet_name: str) -> str:
        """Convert sheet name to valid SQL table name"""
        # Convert to lowercase and replace invalid characters
        table_name = sheet_name.lower()
        # Replace spaces, hyphens, dots with underscores
        table_name = re.sub(r'[^a-z0-9_]', '_', table_name)
        # Remove multiple consecutive underscores
        table_name = re.sub(r'_+', '_', table_name)
        # Remove leading/trailing underscores
        table_name = table_name.strip('_')
        # Ensure it starts with a letter or underscore
        if table_name and not table_name[0].isalpha() and table_name[0] != '_':
            table_name = '_' + table_name
        # Ensure it's not empty
        if not table_name:
            table_name = 'sheet'
        return table_name
    
    async def execute(self, inputs: Dict[str, Any], io_manager) -> NodeResult:
        """Execute the DuckDB converter node"""
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
            
            # Get workflow and node paths from io_manager
            from app.core.storage import local_storage
            
            # Extract workflow_id and node_id from file_key or use graph_context
            # file_key format: workflows/{workflow_id}/nodes/{node_id}/input/{filename}
            workflow_id = None
            node_id = self.node_id
            
            if 'workflows/' in file_key:
                parts = file_key.split('/')
                if len(parts) >= 4:
                    workflow_id = parts[1]
            
            if not workflow_id:
                # Try to get from graph_context or config
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
            
            # Create timestamped DuckDB filename
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            db_filename = f"excel2duckdb_{timestamp}.duckdb"
            db_path = output_path / db_filename
            
            # Create temporary file to read Excel
            with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as temp_input:
                temp_input.write(file_content)
                temp_input_path = temp_input.name
            
            try:
                # Connect to DuckDB
                conn = duckdb.connect(str(db_path))
                
                # Read Excel file (all sheets)
                excel_file = pd.ExcelFile(temp_input_path, engine='openpyxl')
                sheet_names = excel_file.sheet_names
                
                converted_tables = []
                table_names = []
                
                for sheet_name in sheet_names:
                    try:
                        # Read sheet
                        df = excel_file.parse(sheet_name)
                        
                        # Skip empty DataFrames
                        if df.empty:
                            print(f"Skipping empty sheet '{sheet_name}'")
                            continue
                        
                        # Convert sheet name to valid SQL table name
                        table_name = self._sanitize_table_name(sheet_name)
                        
                        # Ensure unique table name
                        original_table_name = table_name
                        counter = 1
                        while table_name in table_names:
                            table_name = f"{original_table_name}_{counter}"
                            counter += 1
                        
                        # Register DataFrame with DuckDB and create table
                        # DuckDB can work with pandas DataFrames directly
                        conn.register('temp_df', df)
                        conn.execute(f"CREATE OR REPLACE TABLE {table_name} AS SELECT * FROM temp_df")
                        conn.unregister('temp_df')
                        
                        converted_tables.append({
                            "sheet_name": sheet_name,
                            "table_name": table_name,
                            "rows": len(df),
                            "columns": list(df.columns)
                        })
                        table_names.append(table_name)
                        
                    except Exception as e:
                        # Log error but continue with other sheets
                        print(f"Error processing sheet '{sheet_name}': {str(e)}")
                        continue
                
                conn.close()
                
                # Clean up temp file
                os.unlink(temp_input_path)
                
                # Get relative path for storage key
                storage_key = f"workflows/{workflow_id}/nodes/{node_id}/output/{db_filename}"
                
                return NodeResult(
                    success=True,
                    outputs={
                        "duckdb_path": storage_key,
                        "table_names": table_names
                    },
                    metadata={
                        "db_path": str(db_path),
                        "tables_created": len(converted_tables),
                        "sheets_processed": len(sheet_names),
                        "converted_tables": converted_tables
                    }
                )
                
            except Exception as e:
                # Clean up temp file on error
                if os.path.exists(temp_input_path):
                    os.unlink(temp_input_path)
                raise
        
        except Exception as e:
            return NodeResult(
                success=False,
                outputs={},
                error=f"Failed to convert to DuckDB: {str(e)}"
            )
    
    def get_config_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "file_key": {
                    "type": "string",
                    "title": "File Key",
                    "description": "Storage key of the Excel file to convert"
                }
            },
            "required": []
        }

