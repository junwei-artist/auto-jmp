"""
Commonality Analyzer Module for Excel2Commonality Plugin

Implements commonality analysis based on the commonality.py logic.
Handles Excel validation, sheet detection, and JSL generation for commonality analysis.
"""

import pandas as pd
import numpy as np
import uuid
import os
from datetime import datetime
from typing import Dict, List, Any, Tuple, Optional
from pathlib import Path
import logging

logger = logging.getLogger(__name__)

class CommonalityAnalyzer:
    """Analyzer for Commonality analysis"""
    
    def __init__(self):
        self.required_columns = ["测试时间", "EGL铆接治具号", "EGL焊接治具号", "镍片放料工位", "AFMT治具"]
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
    
    def find_data_sheet(self, file_path: str, engine: str) -> str:
        """Return sheet name that contains all required columns."""
        xls = pd.ExcelFile(file_path, engine=engine)
        for sheet in xls.sheet_names:
            df = pd.read_excel(file_path, sheet_name=sheet, nrows=5, engine=engine)
            if all(col in df.columns for col in self.required_columns):
                return sheet
        raise ValueError(f"No sheet contains all required columns: {self.required_columns}")
    
    def find_fai_columns(self, df: pd.DataFrame) -> List[str]:
        """Return all columns containing 'FAI' (case-insensitive)."""
        return [c for c in df.columns if "FAI" in str(c).upper()]
    
    def generate_jsl(self, fai_columns: List[str], csv_filename: str) -> str:
        """Generate JSL script for all FAI columns."""
        blocks = []
        for fai in fai_columns:
            block = f"""//!  Start of {fai}                           // auto-run flag
// Open("{csv_filename}");
gb = Graph Builder(
    Size( 1080, 768 ),
    Show Control Panel( 0 ),
    Variables(
        X( :测试时间 ),
        X( :EGL铆接治具号 ),
        X( :EGL焊接治具号 ),
        X( :镍片放料工位 ),
        X( :AFMT治具 ),
        Y( :{fai} )
    ),
    Elements( Position( 1, 1 ), Points( X, Y, Legend( 64 ) ) ),
    Elements(
        Position( 2, 1 ),
        Points( X, Y, Legend( 32 ) ),
        Smoother( X, Y, Legend( 33 ) ),
        Box Plot( X, Y, Legend( 34 ) )
    ),
    Elements(
        Position( 3, 1 ),
        Points( X, Y, Legend( 37 ) ),
        Smoother( X, Y, Legend( 38 ) ),
        Box Plot( X, Y, Legend( 39 ) )
    ),
    Elements(
        Position( 4, 1 ),
        Points( X, Y, Legend( 48 ) ),
        Smoother( X, Y, Legend( 49 ) ),
        Box Plot( X, Y, Legend( 50 ) )
    ),
    Elements(
        Position( 5, 1 ),
        Points( X, Y, Legend( 61 ) ),
        Smoother( X, Y, Legend( 62 ) ),
        Box Plot( X, Y, Legend( 63 ) )
    )
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
    
    def validate_excel_structure(self, file_path: str) -> Dict[str, Any]:
        """
        Validate Excel file structure and find data sheet
        
        Args:
            file_path: Path to Excel file
            
        Returns:
            Dict with validation results
        """
        try:
            # Check dependencies and determine engine
            self.check_dependencies(file_path)
            engine = self.get_excel_engine(file_path)
            file_format = Path(file_path).suffix.lower()
            
            # Find data sheet
            data_sheet = self.find_data_sheet(file_path, engine)
            
            return {
                "valid": True,
                "checkpoint": 1,
                "message": f"Excel file structure validated successfully. Found data sheet: {data_sheet}",
                "details": {
                    "file_format": file_format,
                    "engine": engine,
                    "data_sheet": data_sheet,
                    "required_columns": self.required_columns
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
    
    def validate_data_content(self, file_path: str) -> Dict[str, Any]:
        """
        Validate data content and find FAI columns
        
        Args:
            file_path: Path to Excel file
            
        Returns:
            Dict with validation results
        """
        try:
            engine = self.get_excel_engine(file_path)
            data_sheet = self.find_data_sheet(file_path, engine)
            
            # Load the full data sheet
            df = pd.read_excel(file_path, sheet_name=data_sheet, engine=engine)
            
            # Find FAI columns
            fai_cols = self.find_fai_columns(df)
            if not fai_cols:
                return {
                    "valid": False,
                    "checkpoint": 2,
                    "message": "No columns containing 'FAI' found in the data sheet",
                    "error": "No FAI columns found"
                }
            
            return {
                "valid": True,
                "checkpoint": 2,
                "message": f"Data content validated successfully. Found {len(fai_cols)} FAI columns",
                "details": {
                    "data_sheet": data_sheet,
                    "total_rows": len(df),
                    "total_columns": len(df.columns),
                    "fai_columns": fai_cols,
                    "fai_count": len(fai_cols)
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
    
    def analyze_excel_file(self, file_path: str, output_dir: str = "/tmp/") -> Dict[str, Any]:
        """
        Main analysis function that processes Excel file and generates CSV + JSL
        
        Args:
            file_path: Path to Excel file
            output_dir: Directory for saving output files
            
        Returns:
            Dict with analysis results
        """
        try:
            # 1) Check dependencies and determine engine
            self.check_dependencies(file_path)
            engine = self.get_excel_engine(file_path)
            file_format = Path(file_path).suffix.lower()
            
            # 2) Find data sheet
            data_sheet = self.find_data_sheet(file_path, engine)
            
            # 3) Load the full data sheet
            df = pd.read_excel(file_path, sheet_name=data_sheet, engine=engine)
            
            # 4) Find FAI columns
            fai_cols = self.find_fai_columns(df)
            if not fai_cols:
                raise ValueError("No columns containing 'FAI' found.")
            
            # 5) Generate UUID and filenames
            uid = str(uuid.uuid4())[:8]
            csv_filename = f"commonality_data_{uid}.csv"
            jsl_filename = f"commonality_graphs_{uid}.jsl"
            
            csv_path = os.path.join(output_dir, csv_filename)
            jsl_path = os.path.join(output_dir, jsl_filename)
            
            # 6) Save CSV
            df.to_csv(csv_path, index=False, encoding="utf-8-sig")
            
            # 7) Generate and save JSL
            jsl_content = self.generate_jsl(fai_cols, csv_filename)
            with open(jsl_path, "w", encoding="utf-8") as f:
                f.write(jsl_content)
            
            return {
                "success": True,
                "message": "Commonality analysis completed successfully",
                "file_format": file_format,
                "data_sheet": data_sheet,
                "fai_columns_found": len(fai_cols),
                "fai_columns": fai_cols,
                "csv_content": df.to_csv(index=False, encoding="utf-8-sig"),
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
