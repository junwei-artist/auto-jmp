"""
Commonality Analyzer Module for Excel2Commonality-Generic Plugin

Generic version that allows user to select categorical columns instead of requiring fixed columns.
Detects non-FAI columns and lets user choose which ones to use as categorical variables.
"""

import pandas as pd
import numpy as np
import uuid
import os
from datetime import datetime
from typing import Dict, List, Any, Tuple, Optional
from pathlib import Path
import logging
from .analyzer_meta import MetaAnalyzer

logger = logging.getLogger(__name__)

class CommonalityGenericAnalyzer:
    """Generic Analyzer for Commonality analysis with user-selected categorical columns"""
    
    def __init__(self):
        self.supported_formats = ['.xls', '.xlsx', '.xlsm', '.xlsb']
    
    def get_excel_engine(self, file_path: str) -> str:
        """Determine the appropriate pandas engine for Excel file format."""
        file_ext = Path(file_path).suffix.lower()
        
        if file_ext == '.xls':
            return 'xlrd'
        elif file_ext in ['.xlsx', '.xlsm']:
            return 'openpyxl'
        elif file_ext == '.xlsb':
            return 'pyxlsb'
        else:
            raise ValueError(f"Unsupported Excel file format: {file_ext}. "
                           f"Supported formats: {', '.join(self.supported_formats)}")
    
    def check_dependencies(self, file_path: str) -> None:
        """Check if required dependencies are installed for the file format."""
        file_ext = Path(file_path).suffix.lower()
        
        if file_ext == '.xls':
            try:
                import xlrd
            except ImportError:
                raise ImportError("Missing dependency 'xlrd'. Install with: pip install xlrd")
        elif file_ext in ['.xlsx', '.xlsm']:
            try:
                import openpyxl
            except ImportError:
                raise ImportError("Missing dependency 'openpyxl'. Install with: pip install openpyxl")
        elif file_ext == '.xlsb':
            try:
                import pyxlsb
            except ImportError:
                raise ImportError("Missing dependency 'pyxlsb'. Install with: pip install pyxlsb")
    
    def find_data_sheet(self, file_path: str, engine: str, sheet_name: Optional[str] = None) -> str:
        """
        Find data sheet - use first non-meta sheet or specified sheet.
        
        Args:
            file_path: Path to Excel file
            engine: Pandas engine to use
            sheet_name: Optional specific sheet name to use
            
        Returns:
            Sheet name to use for data
        """
        xls = pd.ExcelFile(file_path, engine=engine)
        
        if sheet_name:
            if sheet_name in xls.sheet_names:
                return sheet_name
            else:
                raise ValueError(f"Specified sheet '{sheet_name}' not found in Excel file")
        
        # Find first non-meta sheet with data
        for sheet in xls.sheet_names:
            if sheet.lower() == "meta":
                continue
            df = pd.read_excel(file_path, sheet_name=sheet, nrows=1, engine=engine)
            if len(df.columns) > 0:
                return sheet
        
        # Fallback to first sheet
        if len(xls.sheet_names) > 0:
            return xls.sheet_names[0]
        
        raise ValueError("No data sheets found in Excel file")
    
    def find_fai_columns(self, df: pd.DataFrame) -> List[str]:
        """Return all columns containing 'FAI' (case-insensitive)."""
        return [c for c in df.columns if "FAI" in str(c).upper()]
    
    def find_non_fai_columns(self, df: pd.DataFrame) -> List[str]:
        """Return all columns that do NOT contain 'FAI' (case-insensitive)."""
        return [c for c in df.columns if "FAI" not in str(c).upper()]
    
    def check_meta_sheet(self, file_path: str, engine: str) -> bool:
        """
        Check if Excel file has a 'meta' sheet with required columns.
        
        Args:
            file_path: Path to Excel file
            engine: Pandas engine to use for reading Excel
            
        Returns:
            True if meta sheet exists with required columns, False otherwise
        """
        try:
            xls = pd.ExcelFile(file_path, engine=engine)
            if "meta" not in xls.sheet_names:
                return False
            
            # Check if meta sheet has required columns
            meta_df = pd.read_excel(file_path, sheet_name="meta", nrows=5, engine=engine)
            required_meta_cols = {"test_name", "target", "usl", "lsl"}
            
            if required_meta_cols.issubset(meta_df.columns):
                logger.info("Meta sheet detected with required columns: test_name, target, usl, lsl")
                return True
            else:
                logger.info("Meta sheet exists but missing required columns")
                return False
                
        except Exception as e:
            logger.warning(f"Error checking meta sheet: {str(e)}")
            return False
    
    def generate_jsl(self, fai_columns: List[str], categorical_columns: List[str], csv_filename: str) -> str:
        """
        Generate JSL script for all FAI columns with user-selected categorical columns.
        
        Args:
            fai_columns: List of FAI column names
            categorical_columns: List of user-selected categorical column names
            csv_filename: Name of the CSV file to open
        """
        blocks = []
        
        # Generate X variables string from categorical columns
        x_vars = ",\n        ".join([f"X( :{col} )" for col in categorical_columns])
        
        for fai in fai_columns:
            # Calculate number of positions based on categorical columns
            num_positions = len(categorical_columns)
            
            # Generate Elements blocks for each categorical variable
            elements_blocks = []
            for pos_idx, cat_col in enumerate(categorical_columns, start=1):
                if pos_idx == 1:
                    # First position: just points
                    elements_blocks.append(f"""    Elements( Position( {pos_idx}, 1 ), Points( X, Y, Legend( 64 ) ) )""")
                elif pos_idx == num_positions:
                    # Last position: points, smoother, box plot, and caption boxes
                    elements_blocks.append(f"""    Elements(
        Position( {pos_idx}, 1 ),
        Points( X, Y, Legend( 61 ) ),
        Smoother( X, Y, Legend( 62 ) ),
        Box Plot( X, Y, Legend( 63 ) ),
        Caption Box( X, Y, Legend( 12 ), Summary Statistic( "Mean" ) ),
        Caption Box( X, Y, Legend( 12 ), Summary Statistic( "Min" ) ),
        Caption Box( X, Y, Legend( 12 ), Summary Statistic( "Median" ) ),
        Caption Box( X, Y, Legend( 12 ), Summary Statistic( "Max" ) ),
        Caption Box( X, Y, Legend( 13 ), Summary Statistic( "Std Dev" ) )
    )""")
                else:
                    # Middle positions: points, smoother, box plot
                    legend_base = 30 + (pos_idx - 1) * 5
                    elements_blocks.append(f"""    Elements(
        Position( {pos_idx}, 1 ),
        Points( X, Y, Legend( {legend_base + 2} ) ),
        Smoother( X, Y, Legend( {legend_base + 3} ) ),
        Box Plot( X, Y, Legend( {legend_base + 4} ) )
    )""")
            
            elements_str = ",\n".join(elements_blocks)
            
            block = f"""//!  Start of {fai}                           // auto-run flag
// Open("{csv_filename}");
gb = Graph Builder(
    Size( 1080, 768 ),
    Show Control Panel( 0 ),
    Variables(
        {x_vars},
        Y( :{fai} )
    ),
    {elements_str}
);
Wait(0.3);
If( Is Scriptable( gb ),
    gb << Set Control Panel( 0 );
    Wait( 0.2 );
    gb << Save Picture( "{fai}.png", PNG  );
    gb << Close Window;
);
//!  End of {fai}
"""
            blocks.append(block)
        return "\n\n".join(blocks)
    
    def validate_excel_structure(self, file_path: str, sheet_name: Optional[str] = None) -> Dict[str, Any]:
        """
        Validate Excel file structure and find data sheet
        
        Args:
            file_path: Path to Excel file
            sheet_name: Optional specific sheet name to use
            
        Returns:
            Dict with validation results
        """
        try:
            # Check dependencies and determine engine
            self.check_dependencies(file_path)
            engine = self.get_excel_engine(file_path)
            file_format = Path(file_path).suffix.lower()
            
            # Find data sheet
            data_sheet = self.find_data_sheet(file_path, engine, sheet_name)
            
            # Load sheet to get column info
            df = pd.read_excel(file_path, sheet_name=data_sheet, nrows=5, engine=engine)
            
            return {
                "valid": True,
                "checkpoint": 1,
                "message": f"Excel file structure validated successfully. Found data sheet: {data_sheet}",
                "details": {
                    "file_format": file_format,
                    "engine": engine,
                    "data_sheet": data_sheet,
                    "all_columns": list(df.columns),
                    "total_columns": len(df.columns)
                }
            }
            
        except Exception as e:
            logger.error(f"Error in validate_excel_structure: {str(e)}")
            return {
                "valid": False,
                "checkpoint": 1,
                "message": f"Excel file structure validation failed: {str(e)}",
                "error": str(e)
            }
    
    def validate_data_content(self, file_path: str, sheet_name: Optional[str] = None) -> Dict[str, Any]:
        """
        Validate data content and find FAI and non-FAI columns
        
        Args:
            file_path: Path to Excel file
            sheet_name: Optional specific sheet name to use
            
        Returns:
            Dict with validation results
        """
        try:
            engine = self.get_excel_engine(file_path)
            data_sheet = self.find_data_sheet(file_path, engine, sheet_name)
            
            # Load the full data sheet
            df = pd.read_excel(file_path, sheet_name=data_sheet, engine=engine)
            
            # Find FAI and non-FAI columns
            fai_cols = self.find_fai_columns(df)
            non_fai_cols = self.find_non_fai_columns(df)
            
            if not fai_cols:
                return {
                    "valid": False,
                    "checkpoint": 2,
                    "message": "No columns containing 'FAI' found in the data sheet",
                    "error": "No FAI columns found"
                }
            
            if not non_fai_cols:
                return {
                    "valid": False,
                    "checkpoint": 2,
                    "message": "No non-FAI columns found. Need at least one categorical column.",
                    "error": "No categorical columns found"
                }
            
            return {
                "valid": True,
                "checkpoint": 2,
                "message": f"Data content validated successfully. Found {len(fai_cols)} FAI columns and {len(non_fai_cols)} potential categorical columns",
                "details": {
                    "data_sheet": data_sheet,
                    "total_rows": len(df),
                    "total_columns": len(df.columns),
                    "fai_columns": fai_cols,
                    "fai_count": len(fai_cols),
                    "non_fai_columns": non_fai_cols,
                    "non_fai_count": len(non_fai_cols)
                }
            }
            
        except Exception as e:
            logger.error(f"Error in validate_data_content: {str(e)}")
            return {
                "valid": False,
                "checkpoint": 2,
                "message": f"Data content validation failed: {str(e)}",
                "error": str(e)
            }
    
    def analyze_excel_file(self, file_path: str, categorical_columns: List[str], 
                          output_dir: str = "/tmp/", sheet_name: Optional[str] = None) -> Dict[str, Any]:
        """
        Main analysis function that processes Excel file and generates CSV + JSL
        
        Args:
            file_path: Path to Excel file
            categorical_columns: List of column names selected by user as categorical variables
            output_dir: Directory for saving output files
            sheet_name: Optional specific sheet name to use
            
        Returns:
            Dict with analysis results
        """
        try:
            # 1) Check dependencies and determine engine
            self.check_dependencies(file_path)
            engine = self.get_excel_engine(file_path)
            file_format = Path(file_path).suffix.lower()
            
            # 2) Find data sheet
            data_sheet = self.find_data_sheet(file_path, engine, sheet_name)
            
            # 3) Check if meta sheet exists with required columns
            has_meta_sheet = self.check_meta_sheet(file_path, engine)
            
            # 4) Load the full data sheet
            df = pd.read_excel(file_path, sheet_name=data_sheet, engine=engine)
            
            # 5) Validate categorical columns
            non_fai_cols = self.find_non_fai_columns(df)
            invalid_cols = [col for col in categorical_columns if col not in non_fai_cols]
            if invalid_cols:
                raise ValueError(f"Invalid categorical columns selected: {invalid_cols}. Must be from non-FAI columns: {non_fai_cols}")
            
            # 6) Find FAI columns
            fai_cols = self.find_fai_columns(df)
            if not fai_cols:
                raise ValueError("No columns containing 'FAI' found.")
            
            # 7) Select only the categorical columns and FAI columns for CSV
            selected_cols = categorical_columns + fai_cols
            df_selected = df[selected_cols].copy()
            
            # 8) Generate UUID and filenames
            uid = str(uuid.uuid4())[:8]
            csv_filename = f"commonality_data_{uid}.csv"
            jsl_filename = f"commonality_graphs_{uid}.jsl"
            
            csv_path = os.path.join(output_dir, csv_filename)
            jsl_path = os.path.join(output_dir, jsl_filename)
            
            # 9) Save CSV with selected columns
            df_selected.to_csv(csv_path, index=False, encoding="utf-8-sig")
            
            # 10) Generate JSL based on whether meta sheet exists
            if has_meta_sheet:
                logger.info("Using MetaAnalyzer for JSL generation with specifications")
                meta_analyzer = MetaAnalyzer()
                meta_result = meta_analyzer.analyze_with_meta_generic(
                    file_path, data_sheet, engine, categorical_columns
                )
                jsl_content = meta_result["jsl_content"]
                analysis_mode = "meta"
            else:
                logger.info("Using standard analyzer for JSL generation")
                jsl_content = self.generate_jsl(fai_cols, categorical_columns, csv_filename)
                analysis_mode = "standard"
            
            # 11) Save JSL
            with open(jsl_path, "w", encoding="utf-8") as f:
                f.write(jsl_content)
            
            return {
                "success": True,
                "message": f"Commonality analysis completed successfully using {analysis_mode} mode",
                "file_format": file_format,
                "data_sheet": data_sheet,
                "has_meta_sheet": has_meta_sheet,
                "analysis_mode": analysis_mode,
                "fai_columns_found": len(fai_cols),
                "fai_columns": fai_cols,
                "categorical_columns": categorical_columns,
                "categorical_count": len(categorical_columns),
                "csv_content": df_selected.to_csv(index=False, encoding="utf-8-sig"),
                "jsl_content": jsl_content,
                "csv_filename": csv_filename,
                "jsl_filename": jsl_filename,
                "csv_path": csv_path,
                "jsl_path": jsl_path,
                "timestamp": datetime.now().strftime("%Y%m%d%H%M%S")
            }
            
        except Exception as e:
            logger.error(f"Commonality analysis failed: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "message": f"Commonality analysis failed: {str(e)}"
            }