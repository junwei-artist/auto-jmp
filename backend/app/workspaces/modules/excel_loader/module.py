import pandas as pd
import openpyxl
from typing import Dict, Any, List, Optional
from app.workspaces.engine.node_base import BaseNode, NodeResult, Port, PortType
import io


class ExcelLoaderNode(BaseNode):
    """Loads an Excel file and allows selecting a sheet"""
    
    @property
    def module_type(self) -> str:
        return "excel_loader"
    
    @property
    def display_name(self) -> str:
        return "Excel Loader"
    
    @property
    def description(self) -> str:
        return "Upload an Excel file and select a sheet to load"
    
    @property
    def inputs(self) -> List[Port]:
        return [
            Port(
                name="file",
                type=PortType.FILE,
                label="Excel File",
                description="Path to Excel file or storage key",
                required=True
            )
        ]
    
    @property
    def outputs(self) -> List[Port]:
        return [
            Port(
                name="dataframe",
                type=PortType.DATA,
                label="DataFrame",
                description="Pandas DataFrame from selected sheet"
            ),
            Port(
                name="sheet_name",
                type=PortType.STRING,
                label="Sheet Name",
                description="Name of the selected sheet"
            )
        ]
    
    async def execute(self, inputs: Dict[str, Any], io_manager) -> NodeResult:
        file_path_or_key = inputs.get("file")
        sheet_name = self.config.get("sheet_name")
        
        if not file_path_or_key:
            return NodeResult(
                success=False,
                outputs={},
                error="No file provided"
            )
        
        try:
            # Load file (could be a path or storage key)
            if isinstance(file_path_or_key, str):
                # Try to load from storage if it's a storage key
                if file_path_or_key.startswith("workspaces/") or "/" in file_path_or_key:
                    file_content = await io_manager.load_artifact(file_path_or_key)
                    if isinstance(file_content, bytes):
                        excel_file = io.BytesIO(file_content)
                    else:
                        excel_file = file_path_or_key
                else:
                    excel_file = file_path_or_key
            else:
                excel_file = file_path_or_key
            
            # Read Excel file
            if sheet_name:
                df = pd.read_excel(excel_file, sheet_name=sheet_name)
            else:
                # Read first sheet if no sheet specified
                df = pd.read_excel(excel_file, sheet_name=0)
                # Get sheet name
                xl_file = pd.ExcelFile(excel_file)
                sheet_name = xl_file.sheet_names[0]
            
            return NodeResult(
                success=True,
                outputs={
                    "dataframe": df,
                    "sheet_name": sheet_name
                },
                metadata={
                    "rows": len(df),
                    "columns": list(df.columns),
                    "column_types": {col: str(dtype) for col, dtype in df.dtypes.items()}
                }
            )
        
        except Exception as e:
            return NodeResult(
                success=False,
                outputs={},
                error=f"Failed to load Excel file: {str(e)}"
            )
    
    def get_config_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "sheet_name": {
                    "type": "string",
                    "title": "Sheet Name",
                    "description": "Name of the sheet to load (leave empty for first sheet)"
                }
            },
            "required": []
        }

