"""
File Processor Module for Excel2BoxplotV1 Plugin

Generates the actual files (CSV + JSL) and provides a ZIP for download.
Handles file generation and packaging.
"""

import pandas as pd
import numpy as np
import zipfile
import tempfile
import os
from typing import Dict, List, Any, Optional, Tuple
from pathlib import Path
import logging

logger = logging.getLogger(__name__)

class FileProcessor:
    """Generates CSV and JSL files from processed data"""
    
    def __init__(self):
        self.csv_content: Optional[str] = None
        self.jsl_content: Optional[str] = None
        self.zip_path: Optional[str] = None
    
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
                    cat_var: str, color_by: Optional[str] = None) -> str:
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
                
                # Generate JSL script for this level
                script_content = f'''
gb = Graph Builder(
\tSize( 1080, 768 ),
\tShow Control Panel( 0 ),
\tVariables( X( :FAI ), Y( :Data ), {group_x}{color_clause} ),
\tElements(
\t\tPoints( X, Y, Legend( 7 ) ),
\t\tBox Plot( X, Y, Legend( 8 ) ),
\t\tCaption Box( X, Y, Legend( 12 ), Summary Statistic( "Mean" ) ),
\t\tCaption Box( X, Y, Legend( 12 ), Summary Statistic( "Min" ) ),
\t\tCaption Box( X, Y, Legend( 12 ), Summary Statistic( "Median" ) ),
\t\tCaption Box( X, Y, Legend( 12 ), Summary Statistic( "Max" ) ),
\t\tCaption Box( X, Y, Legend( 13 ), Summary Statistic( "Std Dev" ) )
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
            
            jsl_content = "\n\n".join(script_rows) if script_rows else "// No charts generated"
            self.jsl_content = jsl_content
            
            logger.info(f"Generated JSL with {len(script_rows)} chart scripts")
            return jsl_content
            
        except Exception as e:
            logger.error(f"Error generating JSL: {str(e)}")
            raise e
    
    def create_zip_file(self, csv_content: str, jsl_content: str, 
                       output_dir: str = "/tmp") -> str:
        """
        Create ZIP file with CSV and JSL content
        
        Args:
            csv_content: CSV content
            jsl_content: JSL content
            output_dir: Output directory for ZIP file
            
        Returns:
            Path to created ZIP file
        """
        try:
            # Create temporary ZIP file
            zip_fd, zip_path = tempfile.mkstemp(suffix='.zip', dir=output_dir)
            os.close(zip_fd)
            
            with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
                # Add CSV file
                zipf.writestr("data.csv", csv_content)
                
                # Add JSL file
                zipf.writestr("script.jsl", jsl_content)
                
                # Add a README file
                readme_content = """# Excel2BoxplotV1 Analysis Files

This ZIP contains the generated files for your Excel analysis:

- `data.csv`: Processed data in long format suitable for JMP analysis
- `script.jsl`: JMP script for generating boxplot charts

## Usage

1. Open JMP
2. Open the `data.csv` file
3. Run the `script.jsl` file to generate boxplot charts

## Data Format

The CSV file contains:
- FAI: The measurement variable names
- Data: The measurement values
- Additional categorical variables for grouping

The JSL script will generate boxplot charts for each main level in your data.
"""
                zipf.writestr("README.txt", readme_content)
            
            self.zip_path = zip_path
            logger.info(f"Created ZIP file: {zip_path}")
            
            return zip_path
            
        except Exception as e:
            logger.error(f"Error creating ZIP file: {str(e)}")
            raise e
    
    def generate_files(self, df_meta: pd.DataFrame, df_data: pd.DataFrame, 
                      boundaries: Dict[str, Dict[str, Any]], cat_var: str, 
                      fai_columns: List[str], color_by: Optional[str] = None,
                      output_dir: str = "/tmp") -> Dict[str, Any]:
        """
        Generate all files (CSV, JSL, ZIP)
        
        Args:
            df_meta: Meta DataFrame
            df_data: Data DataFrame
            boundaries: Calculated boundaries
            cat_var: Categorical variable
            fai_columns: List of FAI columns
            color_by: Optional color variable
            output_dir: Output directory
            
        Returns:
            Dict with file generation results
        """
        try:
            # Generate CSV
            csv_content = self.generate_csv(df_data, cat_var, fai_columns)
            
            # Generate JSL
            jsl_content = self.generate_jsl(df_meta, boundaries, cat_var, color_by)
            
            # Create ZIP file
            zip_path = self.create_zip_file(csv_content, jsl_content, output_dir)
            
            # Get file sizes
            zip_size = os.path.getsize(zip_path)
            
            return {
                "success": True,
                "message": "Files generated successfully",
                "files": {
                    "csv_content": csv_content,
                    "jsl_content": jsl_content,
                    "zip_path": zip_path,
                    "zip_size": zip_size
                },
                "details": {
                    "csv_rows": len(csv_content.split('\n')) - 1,  # Subtract header
                    "jsl_length": len(jsl_content),
                    "zip_size_mb": round(zip_size / (1024 * 1024), 2)
                }
            }
            
        except Exception as e:
            logger.error(f"Error generating files: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }
    
    def cleanup_files(self):
        """Clean up generated files"""
        if self.zip_path and os.path.exists(self.zip_path):
            try:
                os.unlink(self.zip_path)
                logger.info(f"Cleaned up ZIP file: {self.zip_path}")
            except Exception as e:
                logger.warning(f"Could not clean up ZIP file: {str(e)}")
        
        self.csv_content = None
        self.jsl_content = None
        self.zip_path = None
