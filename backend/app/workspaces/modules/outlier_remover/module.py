import pandas as pd
from typing import Dict, Any, List, Optional
from app.workspaces.engine.node_base import BaseNode, NodeResult, Port, PortType
from pathlib import Path
import numpy as np
from datetime import datetime


class OutlierRemoverNode(BaseNode):
    """Removes outliers from Excel files based on rules and generates summary sheet"""
    
    @property
    def module_type(self) -> str:
        return "outlier_remover"
    
    @property
    def display_name(self) -> str:
        return "Outlier Remover"
    
    @property
    def description(self) -> str:
        return "Remove outliers from Excel files based on rules and generate summary report"
    
    @property
    def inputs(self) -> List[Port]:
        return [
            Port(
                name="file",
                type=PortType.FILE,
                label="Excel File",
                description="Excel file to process",
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
                description="Processed Excel file with outliers removed and summary sheet"
            )
        ]
    
    async def execute(self, inputs: Dict[str, Any], io_manager) -> NodeResult:
        """Execute the outlier remover node"""
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
            selected_columns = self.config.get("selected_columns", {})  # {sheet_name: [column_names]}
            
            # Process Excel file
            from app.core.storage import local_storage
            import tempfile
            
            # Create temporary file to read Excel
            with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as temp_input:
                temp_input.write(file_content)
                temp_input_path = temp_input.name
            
            try:
                # Read Excel file
                excel_file = pd.ExcelFile(temp_input_path, engine='openpyxl')
                
                # Process each sheet
                processed_sheets = {}
                removal_summary = []
                
                for sheet_name in excel_file.sheet_names:
                    df = pd.read_excel(excel_file, sheet_name=sheet_name)
                    original_df = df.copy()
                    
                    # Get columns to process for this sheet
                    sheet_columns = selected_columns.get(sheet_name, [])
                    if not sheet_columns:
                        # If no columns selected, process all columns
                        sheet_columns = list(df.columns)
                    
                    # Apply outlier removal rules to selected columns
                    for rule in outlier_rules:
                        column = rule.get("column")  # Optional: if None, applies to all selected columns
                        condition = rule.get("condition")
                        value = rule.get("value")
                        rule_sheet = rule.get("sheet")  # Optional: rule can be sheet-specific
                        action = rule.get("action", "clear_cell")  # Default to clear_cell if not specified
                        
                        # Skip if rule is for different sheet
                        if rule_sheet and rule_sheet != sheet_name:
                            continue
                        
                        # Determine which columns to apply the rule to
                        columns_to_process = []
                        if column:
                            # Apply to specific column if it's in selected columns
                            if column in sheet_columns and column in df.columns:
                                columns_to_process = [column]
                        else:
                            # Apply to all selected columns
                            columns_to_process = [col for col in sheet_columns if col in df.columns]
                        
                        # Collect all rows to remove (for remove_row action)
                        all_rows_to_remove = set()
                        
                        # Apply rule to each column
                        for col in columns_to_process:
                            try:
                                removed_count = 0
                                rows_to_remove = set()
                                
                                if condition == "greater_than":
                                    try:
                                        num_value = float(value)
                                        mask = df[col] > num_value
                                        removed_count = mask.sum()
                                        if action == "remove_row":
                                            rows_to_remove.update(df[mask].index.tolist())
                                        else:
                                            df.loc[mask, col] = np.nan
                                    except (ValueError, TypeError):
                                        pass
                                
                                elif condition == "less_than":
                                    try:
                                        num_value = float(value)
                                        mask = df[col] < num_value
                                        removed_count = mask.sum()
                                        if action == "remove_row":
                                            rows_to_remove.update(df[mask].index.tolist())
                                        else:
                                            df.loc[mask, col] = np.nan
                                    except (ValueError, TypeError):
                                        pass
                                
                                elif condition == "equals":
                                    mask = df[col] == value
                                    removed_count = mask.sum()
                                    if action == "remove_row":
                                        rows_to_remove.update(df[mask].index.tolist())
                                    else:
                                        df.loc[mask, col] = np.nan
                                
                                elif condition == "contains":
                                    if isinstance(value, str):
                                        mask = df[col].astype(str).str.contains(value, na=False)
                                        removed_count = mask.sum()
                                        if action == "remove_row":
                                            rows_to_remove.update(df[mask].index.tolist())
                                        else:
                                            df.loc[mask, col] = np.nan
                                
                                # Collect rows to remove
                                if action == "remove_row":
                                    all_rows_to_remove.update(rows_to_remove)
                                
                                # Record removal in summary
                                if removed_count > 0:
                                    removal_summary.append({
                                        "sheet": sheet_name,
                                        "column": col,
                                        "condition": condition,
                                        "value": str(value),
                                        "action": action,
                                        "removed_count": int(removed_count),
                                        "timestamp": datetime.now().isoformat()
                                    })
                            
                            except Exception as e:
                                print(f"Error applying rule to column {col} in sheet {sheet_name}: {str(e)}")
                                continue
                        
                        # Remove rows if action is remove_row
                        if action == "remove_row" and all_rows_to_remove:
                            df = df.drop(index=list(all_rows_to_remove))
                            df = df.reset_index(drop=True)
                    
                    processed_sheets[sheet_name] = df
                
                excel_file.close()
                
                # Create summary sheet
                if removal_summary:
                    summary_df = pd.DataFrame(removal_summary)
                    summary_sheet_name = f"Removal_Summary_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
                    processed_sheets[summary_sheet_name] = summary_df
                else:
                    # Create empty summary if no removals
                    summary_df = pd.DataFrame({
                        "sheet": [],
                        "column": [],
                        "condition": [],
                        "value": [],
                        "removed_count": [],
                        "timestamp": []
                    })
                    summary_sheet_name = f"Removal_Summary_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
                    processed_sheets[summary_sheet_name] = summary_df
                
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
                            "summary_sheet": summary_sheet_name,
                            "total_removals": len(removal_summary),
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
                            "sheet": {
                                "type": "string",
                                "title": "Sheet Name (optional)"
                            },
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
                },
                "selected_columns": {
                    "type": "object",
                    "title": "Selected Columns",
                    "description": "Columns to process per sheet",
                    "default": {}
                }
            },
            "required": []
        }

