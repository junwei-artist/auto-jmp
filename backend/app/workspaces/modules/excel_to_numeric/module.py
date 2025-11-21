import pandas as pd
import openpyxl
from typing import Dict, Any, List, Optional
from app.workspaces.engine.node_base import BaseNode, NodeResult, Port, PortType
import io


class ExcelToNumericNode(BaseNode):
    """Uploads an Excel file and converts specified column variables to numbers"""
    
    @property
    def module_type(self) -> str:
        return "excel_to_numeric"
    
    @property
    def display_name(self) -> str:
        return "Excel to Numeric"
    
    @property
    def description(self) -> str:
        return "Upload an Excel file and convert column variables to numbers"
    
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
                description="Pandas DataFrame with converted numeric columns"
            ),
            Port(
                name="converted_columns",
                type=PortType.JSON,
                label="Converted Columns",
                description="List of columns that were converted to numeric"
            )
        ]
    
    async def execute(self, inputs: Dict[str, Any], io_manager) -> NodeResult:
        # Check both inputs and config for file (file can be uploaded and stored in config)
        file_path_or_key = inputs.get("file") or self.config.get("file_key")
        sheet_name = self.config.get("sheet_name")
        columns_to_convert = self.config.get("columns_to_convert", [])
        
        if not file_path_or_key:
            return NodeResult(
                success=False,
                outputs={},
                error="No file provided. Please upload an Excel file."
            )
        
        try:
            # Load file (could be a path or storage key)
            if isinstance(file_path_or_key, str):
                # Try to load from storage if it's a storage key
                if file_path_or_key.startswith("workspaces/") or file_path_or_key.startswith("workflows/") or "/" in file_path_or_key:
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
            
            # Determine which columns to convert
            columns_to_process = []
            if columns_to_convert:
                if isinstance(columns_to_convert, str):
                    # If it's a string, treat as comma-separated list or "all"
                    if columns_to_convert.lower().strip() == "all":
                        columns_to_process = list(df.columns)
                    else:
                        columns_to_process = [col.strip() for col in columns_to_convert.split(",")]
                elif isinstance(columns_to_convert, list):
                    columns_to_process = columns_to_convert
            else:
                # If no columns specified, convert all columns that can be converted
                columns_to_process = list(df.columns)
            
            # Filter to only existing columns
            columns_to_process = [col for col in columns_to_process if col in df.columns]
            
            if not columns_to_process:
                return NodeResult(
                    success=False,
                    outputs={},
                    error="No valid columns found to convert"
                )
            
            # Convert columns to numeric
            converted_columns = []
            conversion_errors = {}
            
            for col in columns_to_process:
                try:
                    # Try to convert to numeric, coercing errors to NaN
                    original_dtype = str(df[col].dtype)
                    df[col] = pd.to_numeric(df[col], errors='coerce')
                    new_dtype = str(df[col].dtype)
                    
                    # Check if conversion was successful (not all NaN)
                    if df[col].notna().any():
                        converted_columns.append({
                            "column": col,
                            "original_dtype": original_dtype,
                            "new_dtype": new_dtype,
                            "non_null_count": int(df[col].notna().sum()),
                            "null_count": int(df[col].isna().sum())
                        })
                    else:
                        conversion_errors[col] = "All values became NaN after conversion"
                except Exception as e:
                    conversion_errors[col] = str(e)
            
            # Prepare metadata
            metadata = {
                "rows": len(df),
                "columns": list(df.columns),
                "column_types": {col: str(dtype) for col, dtype in df.dtypes.items()},
                "sheet_name": sheet_name,
                "conversion_errors": conversion_errors if conversion_errors else None
            }
            
            return NodeResult(
                success=True,
                outputs={
                    "dataframe": df,
                    "converted_columns": converted_columns
                },
                metadata=metadata
            )
        
        except Exception as e:
            return NodeResult(
                success=False,
                outputs={},
                error=f"Failed to process Excel file: {str(e)}"
            )
    
    def get_config_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "sheet_name": {
                    "type": "string",
                    "title": "Sheet Name",
                    "description": "Name of the sheet to load (leave empty for first sheet)"
                },
                "columns_to_convert": {
                    "type": ["string", "array"],
                    "title": "Columns to Convert",
                    "description": "List of column names to convert to numeric, comma-separated string, or 'all' to convert all columns. Leave empty to convert all columns.",
                    "items": {
                        "type": "string"
                    }
                }
            },
            "required": []
        }

