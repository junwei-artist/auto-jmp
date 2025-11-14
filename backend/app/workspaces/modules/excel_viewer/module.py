import pandas as pd
from typing import Dict, Any, List, Optional
from app.workspaces.engine.node_base import BaseNode, NodeResult, Port, PortType
from pathlib import Path
import numpy as np


class ExcelViewerNode(BaseNode):
    """Views Excel files, allows outlier removal, and saves processed Excel"""
    
    @property
    def module_type(self) -> str:
        return "excel_viewer"
    
    @property
    def display_name(self) -> str:
        return "Excel Viewer"
    
    @property
    def description(self) -> str:
        return "View Excel files, remove outliers based on conditions, and save processed Excel"
    
    @property
    def inputs(self) -> List[Port]:
        return [
            Port(
                name="file",
                type=PortType.FILE,
                label="Excel File",
                description="Excel file to view and process",
                required=False
            )
        ]
    
    @property
    def outputs(self) -> List[Port]:
        return [
            Port(
                name="file",
                type=PortType.FILE,
                label="Processed Excel File",
                description="Processed Excel file with outliers removed"
            )
        ]
    
    async def execute(self, inputs: Dict[str, Any], io_manager) -> NodeResult:
        """Execute the Excel viewer node - process Excel file based on config"""
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
            
            # Get processing config
            outlier_rules = self.config.get("outlier_rules", [])
            
            # Process Excel file
            from app.core.storage import local_storage
            import tempfile
            import shutil
            
            # Create temporary file to read Excel
            with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as temp_input:
                temp_input.write(file_content)
                temp_input_path = temp_input.name
            
            try:
                # Read Excel file
                excel_file = pd.ExcelFile(temp_input_path, engine='openpyxl')
                
                # Process each sheet
                processed_sheets = {}
                for sheet_name in excel_file.sheet_names:
                    df = pd.read_excel(excel_file, sheet_name=sheet_name)
                    
                    # Apply outlier removal rules
                    if outlier_rules:
                        df = self._apply_outlier_rules(df, outlier_rules)
                    
                    processed_sheets[sheet_name] = df
                
                excel_file.close()
                
                # Save processed Excel to output folder
                # Extract workflow_id and node_id from file_key
                parts = file_key.split('/')
                if len(parts) >= 5 and parts[0] == 'workflows' and parts[2] == 'nodes':
                    workflow_id = parts[1]
                    node_id = parts[3]
                    filename = self.config.get("filename", "processed_excel.xlsx")
                    
                    # Construct output storage key
                    output_key = f"workflows/{workflow_id}/nodes/{node_id}/output/{filename}"
                    
                    # Save processed Excel to temporary file first
                    with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as temp_output:
                        temp_output_path = temp_output.name
                    
                    # Write processed Excel
                    with pd.ExcelWriter(temp_output_path, engine='openpyxl') as writer:
                        for sheet_name, df in processed_sheets.items():
                            df.to_excel(writer, sheet_name=sheet_name, index=False)
                    
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
                            "filename": filename,
                            "sheets_processed": list(processed_sheets.keys()),
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
                error=f"Failed to process Excel file: {str(e)}"
            )
    
    def _apply_outlier_rules(self, df: pd.DataFrame, rules: List[Dict[str, Any]]) -> pd.DataFrame:
        """Apply outlier removal rules to DataFrame"""
        df = df.copy()
        
        for rule in rules:
            column = rule.get("column")
            condition = rule.get("condition")  # "greater_than", "less_than", "equals", "contains"
            value = rule.get("value")
            
            if not column or column not in df.columns:
                continue
            
            try:
                if condition == "greater_than":
                    # Convert value to numeric if possible
                    try:
                        num_value = float(value)
                        df.loc[df[column] > num_value, column] = np.nan
                    except (ValueError, TypeError):
                        # If not numeric, skip
                        pass
                
                elif condition == "less_than":
                    try:
                        num_value = float(value)
                        df.loc[df[column] < num_value, column] = np.nan
                    except (ValueError, TypeError):
                        pass
                
                elif condition == "equals":
                    df.loc[df[column] == value, column] = np.nan
                
                elif condition == "contains":
                    if isinstance(value, str):
                        df.loc[df[column].astype(str).str.contains(value, na=False), column] = np.nan
                
            except Exception as e:
                # Continue with next rule if this one fails
                print(f"Error applying rule to column {column}: {str(e)}")
                continue
        
        return df
    
    def get_config_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "outlier_rules": {
                    "type": "array",
                    "title": "Outlier Removal Rules",
                    "description": "Rules to remove outliers by making values empty",
                    "items": {
                        "type": "object",
                        "properties": {
                            "column": {
                                "type": "string",
                                "title": "Column Name"
                            },
                            "condition": {
                                "type": "string",
                                "enum": ["greater_than", "less_than", "equals", "contains"],
                                "title": "Condition"
                            },
                            "value": {
                                "type": "string",
                                "title": "Value"
                            }
                        },
                        "required": ["column", "condition", "value"]
                    },
                    "default": []
                }
            },
            "required": []
        }

