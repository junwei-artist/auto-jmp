"""
File Processor Module for DuckDB2JMP Module

Generates the actual files (CSV + JSL) with chunked processing support for large datasets.
Handles file generation with memory-efficient chunked processing.
"""

import pandas as pd
import numpy as np
from typing import Dict, List, Any, Optional, Tuple
from pathlib import Path
import logging
import duckdb

logger = logging.getLogger(__name__)

class FileProcessor:
    """Generates CSV and JSL files from processed data with chunked processing support"""
    
    def __init__(self):
        self.csv_content: Optional[str] = None
        self.jsl_content: Optional[str] = None
    
    def format_excel_number(self, x: Any) -> float:
        """
        Format numbers to preserve their original precision and avoid floating-point artifacts.
        """
        try:
            if pd.isna(x):
                return np.nan
            
            f = float(x)
            if f.is_integer():
                return int(f)
            
            if isinstance(x, str):
                try:
                    f = float(x)
                    return float(f"{f:.10g}")
                except:
                    return f
            
            return float(f"{f:.10g}")
        except Exception:
            return np.nan
    
    def generate_csv_chunked(self, duckdb_path: str, table_name: str, cat_var: str, 
                            fai_columns: List[str], chunk_size: int = 100000) -> str:
        """
        Generate CSV content from DuckDB table using chunked processing
        
        Args:
            duckdb_path: Path to DuckDB file
            table_name: Name of the table
            cat_var: Categorical variable
            fai_columns: List of FAI columns
            chunk_size: Number of rows to process at a time
            
        Returns:
            CSV content as string
        """
        try:
            conn = duckdb.connect(str(duckdb_path), read_only=True)
            
            try:
                # Get total row count
                count_result = conn.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()
                total_rows = count_result[0] if count_result else 0
                
                logger.info(f"Generating CSV from {table_name} with {total_rows} rows (chunk_size={chunk_size})")
                
                # Build CSV header
                csv_lines = []
                header = [cat_var, "FAI", "Data"]
                csv_lines.append(",".join(header))
                
                # Process in chunks
                offset = 0
                rows_processed = 0
                
                while offset < total_rows:
                    # Fetch chunk
                    query = f"""
                    SELECT {cat_var}, {', '.join(fai_columns)}
                    FROM {table_name}
                    LIMIT {chunk_size} OFFSET {offset}
                    """
                    
                    chunk_df = conn.execute(query).df()
                    
                    if chunk_df.empty:
                        break
                    
                    # Convert FAI columns to numeric
                    for col in fai_columns:
                        if col in chunk_df.columns:
                            chunk_df[col] = pd.to_numeric(chunk_df[col], errors='coerce')
                    
                    # Melt the chunk to long format
                    stacked = chunk_df.melt(
                        id_vars=[cat_var], 
                        value_vars=fai_columns, 
                        var_name="FAI", 
                        value_name="Data"
                    )
                    
                    # Remove rows with NaN values
                    stacked = stacked.dropna()
                    
                    # Append to CSV (without header)
                    for _, row in stacked.iterrows():
                        csv_lines.append(f"{row[cat_var]},{row['FAI']},{row['Data']}")
                    
                    rows_processed += len(stacked)
                    offset += chunk_size
                    
                    logger.info(f"Processed chunk: {rows_processed} rows so far (offset={offset}/{total_rows})")
                
                csv_content = "\n".join(csv_lines)
                self.csv_content = csv_content
                logger.info(f"Generated CSV with {rows_processed} rows")
                
                return csv_content
                
            finally:
                conn.close()
                
        except Exception as e:
            logger.error(f"Error generating CSV: {str(e)}")
            raise e
    
    def generate_csv(self, df_data: pd.DataFrame, cat_var: str, fai_columns: List[str]) -> str:
        """
        Generate CSV content from processed data (for small datasets)
        
        Args:
            df_data: Processed data DataFrame
            cat_var: Categorical variable
            fai_columns: List of FAI columns
            
        Returns:
            CSV content as string
        """
        try:
            # Select only the columns we need
            df_csv = df_data[[cat_var] + fai_columns].copy()
            
            # Melt the data to long format
            stacked = df_csv.melt(
                id_vars=[cat_var], 
                value_vars=fai_columns, 
                var_name="FAI", 
                value_name="Data"
            )
            
            # Remove rows with NaN values
            stacked = stacked.dropna()
            
            # Generate CSV content
            csv_content = stacked.to_csv(index=False)
            
            self.csv_content = csv_content
            logger.info(f"Generated CSV with {len(stacked)} rows")
            
            return csv_content
            
        except Exception as e:
            logger.error(f"Error generating CSV: {str(e)}")
            raise e
    
    def generate_jsl(self, df_meta: pd.DataFrame, boundaries: Dict[str, Dict[str, Any]], 
                    cat_var: str, color_by: Optional[str] = None,
                    list_check_values: Optional[List[str]] = None,
                    value_order: Optional[List[str]] = None,
                    caption_box_statistics: Optional[List[str]] = None) -> str:
        """
        Generate JSL script content
        
        Args:
            df_meta: Meta DataFrame
            boundaries: Calculated boundaries for each level
            cat_var: Categorical variable
            color_by: Optional color variable
            list_check_values: Optional list check values
            value_order: Optional value order
            caption_box_statistics: Optional caption box statistics
            
        Returns:
            JSL script content as string
        """
        try:
            script_rows = []
            
            # Add categorical variable settings after Open() header (will be inserted by caller)
            cat_var_settings = []
            if list_check_values or value_order:
                cat_var_settings.append("dt = Current Data Table();")
                cat_var_settings.append("")
                cat_var_settings.append("// 1. Ensure type + modeling are OK")
                cat_var_settings.append(f"Try(")
                cat_var_settings.append(f'    dt:{cat_var} << Set Data Type("Character");')
                cat_var_settings.append(f'    dt:{cat_var} << Set Modeling Type("Ordinal");   // needed for ordered categories')
                cat_var_settings.append(f", );")
                cat_var_settings.append("")
                
                # Add List Check if provided
                if list_check_values:
                    # Format list check values as JSL array
                    list_check_formatted = ", ".join([f'"{v}"' for v in list_check_values])
                    cat_var_settings.append("// 2. Set List Check (this is what the UI calls \"List Check\")")
                    cat_var_settings.append(f"Try(")
                    cat_var_settings.append(f'    dt:{cat_var} << List Check( {{{list_check_formatted}}} );')
                    cat_var_settings.append(f", );")
                    cat_var_settings.append("")
                
                # Add Value Order if provided
                if value_order:
                    # Format value order as JSL array
                    value_order_formatted = ", ".join([f'"{v}"' for v in value_order])
                    cat_var_settings.append("// 3. (Optional but recommended) also set Value Order for reports/graphs")
                    cat_var_settings.append(f"Try(")
                    cat_var_settings.append(f'    dt:{cat_var} << Set Property(')
                    cat_var_settings.append(f'        "Value Order",')
                    cat_var_settings.append(f'        {{{value_order_formatted}}}')
                    cat_var_settings.append(f'    );')
                    cat_var_settings.append(f", );")
                    cat_var_settings.append("")
                
                cat_var_settings.append("Wait(0.2);")
                cat_var_settings.append("")
            
            # Default color_by to cat_var if not provided
            if not color_by:
                color_by = cat_var
            
            # Group by main_level
            by_main = df_meta.groupby("main_level", dropna=True).first().reset_index()
            total_levels = max(len(by_main), 1)
            
            for i, (_, mrow) in enumerate(by_main.iterrows(), start=1):
                label = str(mrow.get("main_level", ""))
                
                if label not in boundaries:
                    logger.warning(f"No boundaries found for level: {label}")
                    continue
                
                params = boundaries[label]
                y_vars = params.get("y_vars", [])
                
                if not y_vars:
                    logger.warning(f"No y_vars found for level: {label}")
                    continue
                
                # Format y_vars for JSL
                y_vars_quoted = ',\n\t\t\t\t'.join([f'"{y}"' for y in y_vars])
                
                # Generate reference lines
                ref_lines = []
                for tag, txt in (("usl", "USL"), ("target", "Target"), ("lsl", "LSL")):
                    v = self.format_excel_number(mrow.get(tag))
                    if not np.isnan(v):
                        ref_lines.append(f'Add Ref Line( {v}, "Solid", "Dark Blue", "{txt} {v}", 1 )')
                
                ref_block = ',\n\t\t\t' + ',\n\t\t\t'.join(ref_lines) if ref_lines else ""
                
                # Generate group and color clauses
                group_x = f"Group X( :{cat_var} )"
                color_clause = f", Color( :{color_by} )" if color_by else ""
                
                # Generate caption box elements based on user selection
                # Default statistics if none provided
                default_stats = ["Mean", "Min", "Median", "Max", "Std Dev", "N"]
                selected_stats = caption_box_statistics if caption_box_statistics else default_stats
                
                # Map statistics to their legend numbers
                legend_map = {
                    "Mean": 12,
                    "Min": 12,
                    "Median": 12,
                    "Max": 12,
                    "Std Dev": 13,
                    "N": 12
                }
                
                # Generate caption box lines
                caption_box_lines = []
                for stat in selected_stats:
                    legend_num = legend_map.get(stat, 12)
                    caption_box_lines.append(f'\t\tCaption Box( X, Y, Legend( {legend_num} ), Summary Statistic( "{stat}" ) )')
                
                caption_box_block = ',\n'.join(caption_box_lines) if caption_box_lines else ''
                
                # Generate JSL script for this level
                script_content = f'''
gb = Graph Builder(
\tSize( 1080, 768 ),
\tShow Control Panel( 0 ),
\tVariables( X( :FAI ), Y( :Data ), {group_x}{color_clause} ),
\tElements(
\t\tPoints( X, Y, Legend( 7 ) ),
\t\tBox Plot( X, Y, Legend( 8 ) ),
{caption_box_block}
\t),
\tLocal Data Filter(
\t\tAdd Filter(
\t\t\tcolumns( :FAI ),
\t\t\tWhere( :FAI == {{ {y_vars_quoted} }} ),
\t\t)
\t),
\tSendToReport(
\t\tDispatch({{}}, "Data", ScaleBox,
\t\t\t{{Format( "Fixed Dec", 12, 4 ),
\t\t\tMin( {params["min"]} ), Max( {params["max"]} ), Inc( {params["inc"]} ), Minor Ticks( {params["tick"]} ){ref_block}
\t\t}}
\t\t),
\t\tDispatch({{}}, "graph title", TextEditBox, {{Set Text( "      {label} vs. Build" )}})
\t)
);
Wait(0.3);
If( Is Scriptable( gb ),
\tgb << Set Control Panel( 0 );
\tWait( 0.2 );
\tgb << Save Picture( "{label}.png", PNG );
\tgb << Close Window;
);
'''.strip()
                
                script_rows.append(script_content)
                logger.info(f"Generated JSL for level: {label}")
            
            # Combine categorical variable settings with chart scripts
            if cat_var_settings:
                jsl_content = "\n".join(cat_var_settings) + "\n\n" + ("\n\n".join(script_rows) if script_rows else "// No charts generated")
            else:
                jsl_content = "\n\n".join(script_rows) if script_rows else "// No charts generated"
            self.jsl_content = jsl_content
            
            logger.info(f"Generated JSL with {len(script_rows)} chart scripts")
            return jsl_content
            
        except Exception as e:
            logger.error(f"Error generating JSL: {str(e)}")
            raise e
    
    def generate_files(self, df_meta: pd.DataFrame, df_data: Optional[pd.DataFrame], 
                      boundaries: Dict[str, Dict[str, Any]], cat_var: str, 
                      fai_columns: List[str], color_by: Optional[str] = None,
                      duckdb_path: Optional[str] = None,
                      table_name: Optional[str] = None,
                      chunk_size: int = 100000,
                      list_check_values: Optional[List[str]] = None,
                      value_order: Optional[List[str]] = None,
                      caption_box_statistics: Optional[List[str]] = None) -> Dict[str, Any]:
        """
        Generate all files (CSV, JSL) with chunked processing support
        
        Args:
            df_meta: Meta DataFrame
            df_data: Data DataFrame (optional, for small datasets)
            boundaries: Calculated boundaries
            cat_var: Categorical variable
            fai_columns: List of FAI columns
            color_by: Optional color variable
            duckdb_path: Path to DuckDB file (for chunked processing)
            table_name: Name of the table (for chunked processing)
            chunk_size: Chunk size for large datasets
            list_check_values: Optional list check values
            value_order: Optional value order
            caption_box_statistics: Optional caption box statistics
            
        Returns:
            Dict with file generation results
        """
        try:
            # Generate CSV (chunked if DuckDB path provided, otherwise from DataFrame)
            if duckdb_path and table_name:
                csv_content = self.generate_csv_chunked(duckdb_path, table_name, cat_var, fai_columns, chunk_size)
            elif df_data is not None:
                csv_content = self.generate_csv(df_data, cat_var, fai_columns)
            else:
                return {
                    "success": False,
                    "error": "Either duckdb_path/table_name or df_data must be provided"
                }
            
            # Generate JSL
            jsl_content = self.generate_jsl(df_meta, boundaries, cat_var, color_by,
                                          list_check_values=list_check_values,
                                          value_order=value_order,
                                          caption_box_statistics=caption_box_statistics)
            
            return {
                "success": True,
                "message": "Files generated successfully",
                "files": {
                    "csv_content": csv_content,
                    "jsl_content": jsl_content
                },
                "details": {
                    "csv_rows": len(csv_content.split('\n')) - 1,  # Subtract header
                    "jsl_length": len(jsl_content),
                    "chunked": duckdb_path is not None
                }
            }
            
        except Exception as e:
            logger.error(f"Error generating files: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }

