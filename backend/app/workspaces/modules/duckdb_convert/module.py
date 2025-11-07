import pandas as pd
import duckdb
from typing import Dict, Any, List, Optional
from app.workspaces.engine.node_base import BaseNode, NodeResult, Port, PortType
import os
import uuid


class DuckDBConvertNode(BaseNode):
    """Converts a DataFrame to DuckDB table"""
    
    @property
    def module_type(self) -> str:
        return "duckdb_convert"
    
    @property
    def display_name(self) -> str:
        return "DuckDB Converter"
    
    @property
    def description(self) -> str:
        return "Convert DataFrame to DuckDB table and save it"
    
    @property
    def inputs(self) -> List[Port]:
        return [
            Port(
                name="dataframe",
                type=PortType.DATA,
                label="DataFrame",
                description="Pandas DataFrame to convert",
                required=True
            )
        ]
    
    @property
    def outputs(self) -> List[Port]:
        return [
            Port(
                name="duckdb_path",
                type=PortType.FILE,
                label="DuckDB Path",
                description="Path to DuckDB database file"
            ),
            Port(
                name="table_name",
                type=PortType.STRING,
                label="Table Name",
                description="Name of the table in DuckDB"
            )
        ]
    
    async def execute(self, inputs: Dict[str, Any], io_manager) -> NodeResult:
        dataframe = inputs.get("dataframe")
        
        if dataframe is None:
            return NodeResult(
                success=False,
                outputs={},
                error="No DataFrame provided"
            )
        
        if not isinstance(dataframe, pd.DataFrame):
            return NodeResult(
                success=False,
                outputs={},
                error="Input is not a DataFrame"
            )
        
        try:
            # Get table name from config or generate one
            table_name = self.config.get("table_name", f"table_{uuid.uuid4().hex[:8]}")
            
            # Get workspace path for DuckDB file
            workspace_id = self.config.get("workspace_id")
            if not workspace_id:
                return NodeResult(
                    success=False,
                    outputs={},
                    error="Workspace ID not provided"
                )
            
            workspace_path = await io_manager.get_workspace_path(workspace_id)
            db_filename = f"{table_name}.duckdb"
            db_path = os.path.join(workspace_path, db_filename)
            
            # Create DuckDB connection and save DataFrame
            conn = duckdb.connect(db_path)
            conn.execute(f"CREATE TABLE IF NOT EXISTS {table_name} AS SELECT * FROM dataframe")
            conn.close()
            
            return NodeResult(
                success=True,
                outputs={
                    "duckdb_path": db_path,
                    "table_name": table_name
                },
                metadata={
                    "rows": len(dataframe),
                    "columns": list(dataframe.columns),
                    "db_path": db_path
                }
            )
        
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
                "table_name": {
                    "type": "string",
                    "title": "Table Name",
                    "description": "Name for the DuckDB table",
                    "default": "data"
                }
            },
            "required": []
        }

