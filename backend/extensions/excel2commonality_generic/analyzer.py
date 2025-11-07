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
    
    def generate_jsl(self, fai_columns: List[str], categorical_columns: List[str], csv_filename: str,
                    color_by_variable: Optional[str] = None,
                    caption_boxes_enabled: Optional[Dict[str, bool]] = None,
                    graph_width: int = 1280,
                    graph_height: int = 720) -> str:
        """
        Generate JSL script for all FAI columns with user-selected categorical columns.
        
        Args:
            fai_columns: List of FAI column names
            categorical_columns: List of user-selected categorical column names
            csv_filename: Name of the CSV file to open
            color_by_variable: Optional variable name to use for coloring
            caption_boxes_enabled: Optional dict mapping variable names to boolean (enable caption boxes)
        """
        blocks = []
        
        # Generate X variables string from categorical columns
        x_vars = ",\n        ".join([f"X( :{col} )" for col in categorical_columns])
        
        # Generate color variable string if color_by_variable is set
        color_var_str = ""
        if color_by_variable and color_by_variable in categorical_columns:
            color_var_str = f",\n        Color( :{color_by_variable} )"
            logger.info(f"[Commonality-Generic] Using color by variable: {color_by_variable}")
        
        # Helper function to generate caption boxes string
        def generate_caption_boxes() -> str:
            """Generate caption boxes JSL code with Location and X Position"""
            return """        Caption Box(
            X,
            Y,
            Legend( 12 ),
            Summary Statistic( "Mean" ),
            Location( "Graph per factor" ),
            X Position( "Left" )
        ),
        Caption Box(
            X,
            Y,
            Legend( 12 ),
            Summary Statistic( "Min" ),
            Location( "Graph per factor" ),
            X Position( "Left" )
        ),
        Caption Box(
            X,
            Y,
            Legend( 12 ),
            Summary Statistic( "Median" ),
            Location( "Graph per factor" ),
            X Position( "Left" )
        ),
        Caption Box(
            X,
            Y,
            Legend( 12 ),
            Summary Statistic( "Max" ),
            Location( "Graph per factor" ),
            X Position( "Left" )
        ),
        Caption Box(
            X,
            Y,
            Legend( 13 ),
            Summary Statistic( "Std Dev" ),
            Location( "Graph per factor" ),
            X Position( "Left" )
        )"""
        
        for fai in fai_columns:
            # Calculate number of positions based on categorical columns
            num_positions = len(categorical_columns)
            
            # Generate Elements blocks for each categorical variable
            elements_blocks = []
            for pos_idx, cat_col in enumerate(categorical_columns, start=1):
                has_caption_boxes = caption_boxes_enabled and caption_boxes_enabled.get(cat_col, False)
                
                if pos_idx == 1:
                    # First position: points, optionally with caption boxes
                    if has_caption_boxes:
                        elements_blocks.append(f"""    Elements(
        Position( {pos_idx}, 1 ),
        Points( X, Y, Legend( 64 ) ),
{generate_caption_boxes()}
    )""")
                    else:
                        elements_blocks.append(f"""    Elements( Position( {pos_idx}, 1 ), Points( X, Y, Legend( 64 ) ) )""")
                elif pos_idx == num_positions:
                    # Last position: points, smoother, box plot, and optionally caption boxes
                    if has_caption_boxes:
                        elements_blocks.append(f"""    Elements(
        Position( {pos_idx}, 1 ),
        Points( X, Y, Legend( 61 ) ),
        Smoother( X, Y, Legend( 62 ) ),
        Box Plot( X, Y, Legend( 63 ) ),
{generate_caption_boxes()}
    )""")
                    else:
                        elements_blocks.append(f"""    Elements(
        Position( {pos_idx}, 1 ),
        Points( X, Y, Legend( 61 ) ),
        Smoother( X, Y, Legend( 62 ) ),
        Box Plot( X, Y, Legend( 63 ) )
    )""")
                else:
                    # Middle positions: points, smoother, box plot, and optionally caption boxes
                    legend_base = 30 + (pos_idx - 1) * 5
                    if has_caption_boxes:
                        elements_blocks.append(f"""    Elements(
        Position( {pos_idx}, 1 ),
        Points( X, Y, Legend( {legend_base + 2} ) ),
        Smoother( X, Y, Legend( {legend_base + 3} ) ),
        Box Plot( X, Y, Legend( {legend_base + 4} ) ),
{generate_caption_boxes()}
    )""")
                    else:
                        elements_blocks.append(f"""    Elements(
        Position( {pos_idx}, 1 ),
        Points( X, Y, Legend( {legend_base + 2} ) ),
        Smoother( X, Y, Legend( {legend_base + 3} ) ),
        Box Plot( X, Y, Legend( {legend_base + 4} ) )
    )""")
            
            elements_str = ",\n".join(elements_blocks)
            
            block = f"""//!  Start of {fai}                           // auto-run flag
gb = Graph Builder(
    Size( {graph_width}, {graph_height} ),
    Show Control Panel( 0 ),
    Variables(
        {x_vars},
        Y( :{fai} ){color_var_str}
    ),
    {elements_str}
);
Wait(0.1);
If( Is Scriptable( gb ),
    gb << Set Control Panel( 0 );
    Wait( 0.1 );
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
    
    def _generate_data_type_header(self, csv_filename: str, variable_data_types: Dict[str, str]) -> str:
        """
        Generate JSL header with data type and modeling type settings for multiple variables.
        
        Args:
            csv_filename: Name of the CSV file
            variable_data_types: Dict mapping variable names to their data types ('character-nominal' or 'numeric-continuous')
            
        Returns:
            JSL header string with data type settings
        """
        header_lines = [
            "//! Auto-run flag",
            "",
            "// Open your current data file",
            f'dt = Open("{csv_filename}");',
            "",
            "// Double-check the file opened successfully",
            f'If( Is Empty( dt ),',
            f'    Throw( "❌ Failed to open data table: {csv_filename}" )',
            ");",
            "",
            "// Define data/modeling types"
        ]
        
        # Add Try statements for each variable
        for var_name, data_type_str in variable_data_types.items():
            if data_type_str == 'none':
                continue
                
            if data_type_str == 'character-nominal':
                data_type = 'Character'
                modeling_type = 'Nominal'
            elif data_type_str == 'numeric-continuous':
                data_type = 'Numeric'
                modeling_type = 'Continuous'
            else:
                continue
            
            header_lines.append(f'Try( dt:{var_name} << Set Data Type("{data_type}"); dt:{var_name} << Set Modeling Type("{modeling_type}");, );')
        
        return "\n".join(header_lines)
    
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
                          output_dir: str = "/tmp/", sheet_name: Optional[str] = None,
                          ref_line_config: Optional[Dict[str, Any]] = None,
                          variable_data_types: Optional[Dict[str, str]] = None,
                          color_by_variable: Optional[str] = None,
                          caption_boxes_enabled: Optional[Dict[str, bool]] = None,
                          graph_width: int = 1280,
                          graph_height: int = 720) -> Dict[str, Any]:
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
            
            # 8) Ensure output directory exists
            output_dir_path = Path(output_dir)
            output_dir_path.mkdir(parents=True, exist_ok=True)
            
            # 9) Generate UUID and filenames
            uid = str(uuid.uuid4())[:8]
            csv_filename = f"commonality_data_{uid}.csv"
            jsl_filename = f"commonality_graphs_{uid}.jsl"
            
            csv_path = str(output_dir_path / csv_filename)
            jsl_path = str(output_dir_path / jsl_filename)
            
            # 10) Save CSV with selected columns
            df_selected.to_csv(csv_path, index=False, encoding="utf-8-sig")
            
            # 11) Generate JSL based on whether meta sheet exists
            if has_meta_sheet:
                logger.info("Using MetaAnalyzer for JSL generation with specifications")
                meta_analyzer = MetaAnalyzer()
                meta_result = meta_analyzer.analyze_with_meta_generic(
                    file_path, data_sheet, engine, categorical_columns, 
                    ref_line_config=ref_line_config, color_by_variable=color_by_variable,
                    caption_boxes_enabled=caption_boxes_enabled,
                    graph_width=graph_width, graph_height=graph_height
                )
                jsl_content = meta_result["jsl_content"]
                analysis_mode = "meta"
            else:
                logger.info("Using standard analyzer for JSL generation")
                jsl_content = self.generate_jsl(fai_cols, categorical_columns, csv_filename, 
                                                color_by_variable=color_by_variable,
                                                caption_boxes_enabled=caption_boxes_enabled,
                                                graph_width=graph_width, graph_height=graph_height)
                analysis_mode = "standard"
            
            # 12) Add data type/modeling type header if needed
            if variable_data_types and any(variable_data_types.values()):
                jsl_header = self._generate_data_type_header(csv_filename, variable_data_types)
                jsl_content = jsl_header + "\n\n" + jsl_content
                logger.info(f"[Commonality-Generic] Added data type header for variables: {list(variable_data_types.keys())}")
            
            # 13) Save JSL
            with open(jsl_path, "w", encoding="utf-8") as f:
                f.write(jsl_content)
            
            logger.info(f"Generated files:")
            logger.info(f"  CSV: {csv_path} (exists: {os.path.exists(csv_path)})")
            logger.info(f"  JSL: {jsl_path} (exists: {os.path.exists(jsl_path)})")
            
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