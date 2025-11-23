import pandas as pd
from typing import Dict, Any, List, Optional
from app.workspaces.engine.node_base import BaseNode, NodeResult, Port, PortType
from pathlib import Path
import numpy as np
from datetime import datetime
import duckdb


class OutlierRemoverDuckDBNode(BaseNode):
    """Removes outliers from DuckDB files based on rules and generates summary table"""
    
    @property
    def module_type(self) -> str:
        return "outlier_remover_duckdb"
    
    @property
    def display_name(self) -> str:
        return "Outlier Remover (DuckDB)"
    
    @property
    def description(self) -> str:
        return "Remove outliers from DuckDB files based on rules. Handles large datasets efficiently."
    
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
                label="Processed DuckDB File",
                description="Processed DuckDB file with outliers removed and summary table"
            )
        ]
    
    async def execute(self, inputs: Dict[str, Any], io_manager) -> NodeResult:
        """Execute the outlier remover DuckDB node"""
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
            outlier_rules = self.config.get("outlier_rules", [])
            
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
                
                # Get list of tables (equivalent to sheets in Excel)
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
                removal_summary = []
                processed_tables = {}
                
                # Process each table
                for table_name in table_names:
                    # Read table into pandas DataFrame for processing
                    df = conn.execute(f"SELECT * FROM {table_name}").df()
                    original_row_count = len(df)
                    
                    # Apply outlier removal rules in sequence order
                    # Sort rules by sequence (if present) to ensure correct application order
                    sorted_rules = sorted(
                        outlier_rules,
                        key=lambda r: r.get("sequence", 999)  # Rules without sequence go last
                    )
                    
                    for rule in sorted_rules:
                        condition = rule.get("condition")
                        value = rule.get("value")
                        action = rule.get("action", "clear_cell")  # Default to clear_cell if not specified
                        
                        # Support new format (sheets/columns arrays) and legacy format (sheet/column)
                        rule_sheets = rule.get("sheets")  # New format: array of sheet names
                        rule_columns = rule.get("columns")  # New format: {sheetName: [columnNames]}
                        rule_table = rule.get("sheet")  # Legacy format: single sheet
                        column = rule.get("column")  # Legacy format: single column
                        
                        # Determine if this rule applies to the current table
                        should_apply = False
                        if rule_sheets:
                            # New format: check if current table is in sheets array
                            if table_name in rule_sheets:
                                should_apply = True
                        elif rule_table:
                            # Legacy format: check if matches current table
                            if rule_table == table_name:
                                should_apply = True
                        else:
                            # No sheet specified = applies to all tables
                            should_apply = True
                        
                        if not should_apply:
                            continue
                        
                        # Determine which columns to apply the rule to
                        columns_to_process = []
                        if rule_sheets and rule_columns and table_name in rule_columns:
                            # New format: specific columns for this sheet
                            selected_columns = rule_columns.get(table_name, [])
                            if selected_columns:
                                # Only process selected columns that exist in the table
                                columns_to_process = [col for col in selected_columns if col in df.columns]
                            else:
                                # No columns specified for this sheet = all columns
                                columns_to_process = list(df.columns)
                        elif rule_sheets:
                            # New format: all columns for this sheet
                            columns_to_process = list(df.columns)
                        elif column:
                            # Legacy format: specific column
                            if column in df.columns:
                                columns_to_process = [column]
                        else:
                            # No column specified = all columns in the table
                            columns_to_process = list(df.columns)
                        
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
                                    try:
                                        # Try numeric comparison first
                                        num_value = float(value)
                                        if pd.api.types.is_numeric_dtype(df[col]):
                                            mask = (df[col] == num_value) & df[col].notna()
                                        else:
                                            mask = (df[col].astype(str) == str(value)) & df[col].notna()
                                    except (ValueError, TypeError):
                                        mask = (df[col].astype(str) == str(value)) & df[col].notna()
                                    
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
                                
                                elif condition == "iqr":
                                    # IQR-based outlier detection
                                    try:
                                        multiplier = float(value) if value else 1.5
                                        # Get numeric values only (exclude NaN)
                                        numeric_values = pd.to_numeric(df[col], errors='coerce')
                                        numeric_values_clean = numeric_values.dropna()
                                        
                                        if len(numeric_values_clean) > 0:
                                            q1 = numeric_values_clean.quantile(0.25)
                                            q3 = numeric_values_clean.quantile(0.75)
                                            iqr = q3 - q1
                                            
                                            lower_bound = q1 - multiplier * iqr
                                            upper_bound = q3 + multiplier * iqr
                                            
                                            # Mark values outside bounds as outliers
                                            mask = (numeric_values < lower_bound) | (numeric_values > upper_bound)
                                            removed_count = mask.sum()
                                            
                                            if action == "remove_row":
                                                rows_to_remove.update(df[mask].index.tolist())
                                            else:
                                                df.loc[mask, col] = np.nan
                                    except (ValueError, TypeError) as e:
                                        print(f"Error in IQR calculation for column {col}: {e}")
                                        pass
                                
                                elif condition == "sigma":
                                    # Sigma (standard deviation) based outlier detection
                                    try:
                                        multiplier = float(value) if value else 3.0
                                        # Get numeric values only (exclude NaN)
                                        numeric_values = pd.to_numeric(df[col], errors='coerce')
                                        numeric_values_clean = numeric_values.dropna()
                                        
                                        if len(numeric_values_clean) > 0:
                                            mean_val = numeric_values_clean.mean()
                                            std_val = numeric_values_clean.std()
                                            
                                            if std_val > 0:  # Avoid division by zero
                                                lower_bound = mean_val - multiplier * std_val
                                                upper_bound = mean_val + multiplier * std_val
                                                
                                                # Mark values outside bounds as outliers
                                                mask = (numeric_values < lower_bound) | (numeric_values > upper_bound)
                                                removed_count = mask.sum()
                                                
                                                if action == "remove_row":
                                                    rows_to_remove.update(df[mask].index.tolist())
                                                else:
                                                    df.loc[mask, col] = np.nan
                                    except (ValueError, TypeError) as e:
                                        print(f"Error in sigma calculation for column {col}: {e}")
                                        pass
                                
                                elif condition == "standardized_to_nominal":
                                    # Standardize to nominal: calculate mean and replace each value with (value - mean)
                                    try:
                                        # Get numeric values only (exclude NaN)
                                        numeric_values = pd.to_numeric(df[col], errors='coerce')
                                        numeric_values_clean = numeric_values.dropna()
                                        
                                        if len(numeric_values_clean) > 0:
                                            mean_val = numeric_values_clean.mean()
                                            # Replace each value with (value - mean)
                                            df[col] = numeric_values - mean_val
                                            removed_count = len(numeric_values_clean)  # Count of standardized values
                                    except (ValueError, TypeError) as e:
                                        print(f"Error in standardization for column {col}: {e}")
                                        pass
                                
                                # Collect rows to remove (not applicable for standardized_to_nominal)
                                if condition != "standardized_to_nominal" and action == "remove_row":
                                    all_rows_to_remove.update(rows_to_remove)
                                
                                # Record removal in summary
                                if removed_count > 0:
                                    removal_summary.append({
                                        "table": table_name,
                                        "column": col,
                                        "condition": condition,
                                        "value": str(value) if condition != "standardized_to_nominal" else "N/A",
                                        "action": action if condition != "standardized_to_nominal" else "standardize",
                                        "removed_count": int(removed_count),
                                        "timestamp": datetime.now().isoformat()
                                    })
                            
                            except Exception as e:
                                print(f"Error applying rule to column {col} in table {table_name}: {str(e)}")
                                continue
                        
                        # Remove rows if action is remove_row (not applicable for standardized_to_nominal)
                        if condition != "standardized_to_nominal" and action == "remove_row" and all_rows_to_remove:
                            df = df.drop(index=list(all_rows_to_remove))
                            df = df.reset_index(drop=True)
                    
                    # Write processed table to output database
                    # Register DataFrame and create table
                    output_conn.register('temp_df', df)
                    output_conn.execute(f"CREATE TABLE {table_name} AS SELECT * FROM temp_df")
                    output_conn.unregister('temp_df')
                    processed_tables[table_name] = df
                
                # Create summary table
                if removal_summary:
                    summary_df = pd.DataFrame(removal_summary)
                    summary_table_name = f"Removal_Summary_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
                else:
                    # Create empty summary if no removals
                    summary_df = pd.DataFrame({
                        "table": [],
                        "column": [],
                        "condition": [],
                        "value": [],
                        "removed_count": [],
                        "timestamp": []
                    })
                    summary_table_name = f"Removal_Summary_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
                
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
                error=f"Failed to process DuckDB file: {str(e)}"
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
                                "title": "Table Name (optional)"
                            },
                            "column": {
                                "type": "string",
                                "title": "Column Name (optional)"
                            },
                            "condition": {
                                "type": "string",
                                "enum": ["greater_than", "less_than", "equals", "contains", "iqr", "sigma", "standardized_to_nominal"],
                                "title": "Condition"
                            },
                            "value": {
                                "type": "string",
                                "title": "Value"
                            },
                            "action": {
                                "type": "string",
                                "enum": ["clear_cell", "remove_row"],
                                "title": "Action",
                                "default": "clear_cell"
                            }
                        },
                        "required": ["condition"]
                    },
                    "default": []
                }
            },
            "required": []
        }

