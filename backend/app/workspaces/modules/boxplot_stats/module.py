import duckdb
import pandas as pd
import matplotlib.pyplot as plt
import numpy as np
from typing import Dict, Any, List, Optional
from app.workspaces.engine.node_base import BaseNode, NodeResult, Port, PortType
import io
import base64
import json
import uuid


class BoxplotStatsNode(BaseNode):
    """Loads DuckDB table, selects a column, and generates box plot with statistics"""
    
    @property
    def module_type(self) -> str:
        return "boxplot_stats"
    
    @property
    def display_name(self) -> str:
        return "Box Plot & Statistics"
    
    @property
    def description(self) -> str:
        return "Load DuckDB table, select column, and generate box plot with statistics"
    
    @property
    def inputs(self) -> List[Port]:
        return [
            Port(
                name="duckdb_path",
                type=PortType.FILE,
                label="DuckDB Path",
                description="Path to DuckDB database file",
                required=True
            ),
            Port(
                name="table_name",
                type=PortType.STRING,
                label="Table Name",
                description="Name of the table in DuckDB",
                required=True
            )
        ]
    
    @property
    def outputs(self) -> List[Port]:
        return [
            Port(
                name="plot_image",
                type=PortType.FILE,
                label="Box Plot Image",
                description="Path to generated box plot image"
            ),
            Port(
                name="statistics",
                type=PortType.JSON,
                label="Statistics",
                description="Statistical summary of the column"
            )
        ]
    
    async def execute(self, inputs: Dict[str, Any], io_manager) -> NodeResult:
        duckdb_path = inputs.get("duckdb_path")
        table_name = inputs.get("table_name")
        column_name = self.config.get("column_name")
        
        if not duckdb_path or not table_name:
            return NodeResult(
                success=False,
                outputs={},
                error="DuckDB path and table name are required"
            )
        
        if not column_name:
            return NodeResult(
                success=False,
                outputs={},
                error="Column name must be specified in config"
            )
        
        try:
            # Connect to DuckDB
            conn = duckdb.connect(duckdb_path)
            
            # Load column data
            query = f"SELECT {column_name} FROM {table_name} WHERE {column_name} IS NOT NULL"
            df = conn.execute(query).df()
            
            if df.empty:
                conn.close()
                return NodeResult(
                    success=False,
                    outputs={},
                    error=f"Column '{column_name}' is empty or doesn't exist"
                )
            
            data = df[column_name].values
            
            # Calculate statistics
            stats = {
                "count": len(data),
                "mean": float(np.mean(data)),
                "median": float(np.median(data)),
                "std": float(np.std(data)),
                "min": float(np.min(data)),
                "max": float(np.max(data)),
                "q25": float(np.percentile(data, 25)),
                "q75": float(np.percentile(data, 75)),
                "iqr": float(np.percentile(data, 75) - np.percentile(data, 25))
            }
            
            # Generate box plot
            fig, ax = plt.subplots(figsize=(8, 6))
            ax.boxplot(data, vert=True)
            ax.set_ylabel(column_name)
            ax.set_title(f"Box Plot: {column_name}")
            ax.grid(True, alpha=0.3)
            
            # Save plot to bytes
            plot_buffer = io.BytesIO()
            plt.savefig(plot_buffer, format='png', dpi=100, bbox_inches='tight')
            plt.close()
            plot_buffer.seek(0)
            
            # Save plot as artifact
            workspace_id = self.config.get("workspace_id")
            workflow_id = self.config.get("workflow_id")
            execution_id = self.config.get("execution_id")
            node_id = self.config.get("node_id")
            
            if all([workspace_id, workflow_id, execution_id, node_id]):
                plot_filename = f"boxplot_{column_name}_{uuid.uuid4().hex[:8]}.png"
                plot_storage_key = await io_manager.save_artifact(
                    workspace_id=workspace_id,
                    workflow_id=workflow_id,
                    execution_id=execution_id,
                    node_id=node_id,
                    kind="plot",
                    data=plot_buffer.getvalue(),
                    filename=plot_filename,
                    metadata={"column": column_name, "statistics": stats}
                )
            else:
                # Fallback: save to temp location
                import tempfile
                import os
                temp_dir = tempfile.gettempdir()
                plot_filename = f"boxplot_{column_name}_{uuid.uuid4().hex[:8]}.png"
                plot_path = os.path.join(temp_dir, plot_filename)
                with open(plot_path, 'wb') as f:
                    f.write(plot_buffer.getvalue())
                plot_storage_key = plot_path
            
            conn.close()
            
            return NodeResult(
                success=True,
                outputs={
                    "plot_image": plot_storage_key,
                    "statistics": stats
                },
                metadata={
                    "column": column_name,
                    "plot_filename": plot_filename
                }
            )
        
        except Exception as e:
            return NodeResult(
                success=False,
                outputs={},
                error=f"Failed to generate box plot: {str(e)}"
            )
    
    def get_config_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "column_name": {
                    "type": "string",
                    "title": "Column Name",
                    "description": "Name of the column to analyze"
                }
            },
            "required": ["column_name"]
        }

