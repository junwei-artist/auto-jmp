"""
File Processor Module for Excel2JMP Module

Generates the actual files (CSV + JSL).
Handles file generation.
"""

import pandas as pd
import numpy as np
from typing import Dict, List, Any, Optional, Tuple
from pathlib import Path
import logging

logger = logging.getLogger(__name__)

class FileProcessor:
    """Generates CSV and JSL files from processed data"""
    
    def __init__(self):
        self.csv_content: Optional[str] = None
        self.jsl_content: Optional[str] = None
    
    def format_excel_number(self, x: Any) -> float:
        """
        Format Excel numbers to preserve their original precision and avoid floating-point artifacts.
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
    
    def generate_csv(self, df_data: pd.DataFrame, cat_var: str, fai_columns: List[str]) -> str:
        """
        Generate CSV content from processed data
        
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
    
    def generate_files(self, df_meta: pd.DataFrame, df_data: pd.DataFrame, 
                      boundaries: Dict[str, Dict[str, Any]], cat_var: str, 
                      fai_columns: List[str], color_by: Optional[str] = None,
                      list_check_values: Optional[List[str]] = None,
                      value_order: Optional[List[str]] = None,
                      caption_box_statistics: Optional[List[str]] = None) -> Dict[str, Any]:
        """
        Generate all files (CSV, JSL)
        
        Args:
            df_meta: Meta DataFrame
            df_data: Data DataFrame
            boundaries: Calculated boundaries
            cat_var: Categorical variable
            fai_columns: List of FAI columns
            color_by: Optional color variable
            
        Returns:
            Dict with file generation results
        """
        try:
            # Generate CSV
            csv_content = self.generate_csv(df_data, cat_var, fai_columns)
            
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
                    "jsl_length": len(jsl_content)
                }
            }
            
        except Exception as e:
            logger.error(f"Error generating files: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }

