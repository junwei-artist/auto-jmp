"""
Main Processor Module for Excel2BoxplotV1 Plugin

Orchestrates all processing modules to provide a unified interface.
This serves as the main entry point for the plugin.
"""

import pandas as pd
import numpy as np
import tempfile
import os
import zipfile
from typing import Dict, List, Any, Optional
from pathlib import Path
import logging

from .file_handler import FileHandler
from .data_validator import DataValidator
from .data_process import DataProcessor
from .file_processor import FileProcessor
from .analysis_runner import AnalysisRunner

logger = logging.getLogger(__name__)

class ExcelToCSVJSLProcessor:
    """Main processor that orchestrates all processing modules"""
    
    def __init__(self):
        self.file_handler = FileHandler()
        self.validator = DataValidator()
        self.data_processor = DataProcessor()
        self.file_processor = FileProcessor()
        self.analysis_runner = AnalysisRunner()
        
        # Legacy attributes for backward compatibility
        self.required_meta_columns = [
            "test_name", "description", "target", "usl", "lsl", "main_level"
        ]
    
    def fix_excel_file(self, file_path: str) -> Dict[str, Any]:
        """
        Fix corrupted Excel file by repairing window position settings
        
        Args:
            file_path: Path to Excel file
            
        Returns:
            Dict with fix results
        """
        try:
            import zipfile
            import xml.etree.ElementTree as ET
            
            # Create fixed file path
            fixed_path = file_path.replace('.xlsx', '_fixed.xlsx')
            
            # Copy original file
            import shutil
            shutil.copy2(file_path, fixed_path)
            
            # Open as ZIP and fix workbook.xml
            with zipfile.ZipFile(fixed_path, 'r') as zip_read:
                with zipfile.ZipFile(fixed_path + '.tmp', 'w', zipfile.ZIP_DEFLATED) as zip_write:
                    for item in zip_read.infolist():
                        data = zip_read.read(item.filename)
                        if item.filename == 'xl/workbook.xml':
                            # Parse and fix XML
                            root = ET.fromstring(data)
                            for view in root.findall('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}workbookView'):
                                # Fix xWindow and yWindow attributes
                                if 'xWindow' in view.attrib:
                                    try:
                                        int(view.attrib['xWindow'])
                                    except ValueError:
                                        view.attrib['xWindow'] = '0'
                                if 'yWindow' in view.attrib:
                                    try:
                                        int(view.attrib['yWindow'])
                                    except ValueError:
                                        view.attrib['yWindow'] = '0'
                            data = ET.tostring(root, encoding='unicode').encode('utf-8')
                        zip_write.writestr(item, data)
            
            # Replace original with fixed version
            os.replace(fixed_path + '.tmp', fixed_path)
            
            logger.info(f"Fixed Excel file: {fixed_path}")
            
            return {
                "success": True,
                "fixed_file": fixed_path,
                "message": "Fixed corrupted window position settings (xWindow/yWindow attributes)"
            }
            
        except Exception as e:
            logger.error(f"Error fixing Excel file: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }
    
    def validate_excel_structure(self, file_path: str) -> Dict[str, Any]:
        """
        Validate Excel file structure (Checkpoint 1)
        
        Args:
            file_path: Path to Excel file
            
        Returns:
            Dict with validation results
        """
        try:
            # Try to read the Excel file
            try:
                df_meta = pd.read_excel(file_path, sheet_name="meta")
                df_data = pd.read_excel(file_path, sheet_name="data")
            except Exception as e:
                error_msg = str(e)
                if "expected <class 'int'>" in error_msg or "xWindow" in error_msg or "yWindow" in error_msg:
                    # Try to fix the file
                    fix_result = self.fix_excel_file(file_path)
                    if fix_result["success"]:
                        # Try reading the fixed file
                        try:
                            df_meta = pd.read_excel(fix_result["fixed_file"], sheet_name="meta")
                            df_data = pd.read_excel(fix_result["fixed_file"], sheet_name="data")
                            
                            return {
                                "valid": True,
                                "checkpoint": 1,
                                "message": "Excel file structure validated successfully",
                                "fix_applied": True,
                                "fix_message": fix_result["message"],
                                "fixed_file": fix_result["fixed_file"]
                            }
                        except Exception as e2:
                            return {
                                "valid": False,
                                "checkpoint": 1,
                                "message": f"Excel file is corrupted and could not be fixed: {str(e2)}",
                                "error": str(e2)
                            }
                    else:
                        return {
                            "valid": False,
                            "checkpoint": 1,
                            "message": f"Excel file is corrupted and fix failed: {fix_result['error']}",
                            "error": fix_result["error"]
                        }
                else:
                    return {
                        "valid": False,
                        "checkpoint": 1,
                        "message": f"Excel file structure validation failed: {error_msg}",
                        "error": error_msg
                    }
            
            # Validate structure using the validator
            result = self.validator.validate_structure(df_meta, df_data)
            
            return {
                "valid": True,
                "checkpoint": 1,
                "message": "Excel file structure validated successfully",
                "details": result["details"]
            }
            
        except Exception as e:
            logger.error(f"Error in validate_excel_structure: {str(e)}")
            return {
                "valid": False,
                "checkpoint": 1,
                "message": f"Excel file structure validation failed: {str(e)}",
                "error": str(e)
            }
    
    def validate_meta_data(self, file_path: str) -> Dict[str, Any]:
        """
        Validate metadata (Checkpoint 2)
        
        Args:
            file_path: Path to Excel file
            
        Returns:
            Dict with validation results
        """
        try:
            df_meta = pd.read_excel(file_path, sheet_name="meta")
            df_data = pd.read_excel(file_path, sheet_name="data")
            
            result = self.validator.validate_metadata_consistency(df_meta, df_data)
            return result
            
        except Exception as e:
            logger.error(f"Error in validate_meta_data: {str(e)}")
            return {
                "valid": True,
                "checkpoint": 2,
                "message": "Metadata validation completed",
                "warnings": [{
                    "type": "validation_error",
                    "message": f"Metadata validation error: {str(e)}"
                }]
            }
    
    def validate_data_quality(self, file_path: str) -> Dict[str, Any]:
        """
        Validate data quality (Checkpoint 3)
        
        Args:
            file_path: Path to Excel file
            
        Returns:
            Dict with validation results
        """
        try:
            df_meta = pd.read_excel(file_path, sheet_name="meta")
            df_data = pd.read_excel(file_path, sheet_name="data")
            
            # For now, use a default categorical variable
            # In the new workflow, this will be set by the user
            cat_var = "Stage"  # Default categorical variable
            
            result = self.validator.validate_data_quality(df_meta, df_data, cat_var)
            return result
            
        except Exception as e:
            logger.error(f"Error in validate_data_quality: {str(e)}")
            return {
                "valid": True,
                "checkpoint": 3,
                "message": "Data quality validation completed",
                "warnings": [{
                    "type": "validation_error",
                    "message": f"Data quality validation error: {str(e)}"
                }]
            }
    
    def calculate_boundaries(self, df_meta: pd.DataFrame, df_data: pd.DataFrame) -> pd.DataFrame:
        """
        Calculate boundaries for plotting
        
        Args:
            df_meta: Meta DataFrame
            df_data: Data DataFrame
            
        Returns:
            Meta DataFrame with calculated boundaries
        """
        try:
            # Find FAI columns
            fai_columns = [col for col in df_data.columns if "FAI" in str(col).upper()]
            
            # Calculate boundaries
            boundaries = self.data_processor.calculate_boundaries(df_meta, df_data, fai_columns)
            
            # Update meta DataFrame with boundary values
            meta_with_boundaries = df_meta.copy()
            
            for level, params in boundaries.items():
                mask = meta_with_boundaries["main_level"] == level
                meta_with_boundaries.loc[mask, "min"] = params["min"]
                meta_with_boundaries.loc[mask, "max"] = params["max"]
                meta_with_boundaries.loc[mask, "inc"] = params["inc"]
                meta_with_boundaries.loc[mask, "tick"] = params["tick"]
            
            return meta_with_boundaries
            
        except Exception as e:
            logger.error(f"Error calculating boundaries: {str(e)}")
            return df_meta
    
    def process_excel_file(self, file_path: str, project_name: str, 
                          project_description: str = "", cat_var: str = "Stage",
                          color_by: Optional[str] = None) -> Dict[str, Any]:
        """
        Process Excel file and generate CSV + JSL
        
        Args:
            file_path: Path to Excel file
            project_name: Name of the project
            project_description: Description of the project
            cat_var: Categorical variable for grouping
            color_by: Optional color variable
            
        Returns:
            Dict with processing results
        """
        try:
            # Load Excel file
            load_result = self.file_handler.load_excel_file(file_path)
            if not load_result["success"]:
                return load_result
            
            # Set categorical variable
            cat_result = self.file_handler.set_categorical_variable(cat_var)
            if not cat_result["success"]:
                return cat_result
            
            # Get data
            df_meta = self.file_handler.df_meta
            df_data = self.file_handler.df_data_raw
            fai_columns = self.file_handler.fai_columns
            
            # Process data
            process_result = self.data_processor.process_data(
                df_meta, df_data, fai_columns, cat_var
            )
            if not process_result["success"]:
                return process_result
            
            # Generate files
            file_result = self.file_processor.generate_files(
                df_meta, 
                process_result["processed_data"], 
                process_result["boundaries"],
                cat_var,
                fai_columns,
                color_by
            )
            if not file_result["success"]:
                return file_result
            
            # Run analysis
            analysis_result = self.analysis_runner.create_project_and_run(
                file_result["files"]["csv_content"],
                file_result["files"]["jsl_content"],
                project_name,
                project_description
            )
            
            return {
                "success": True,
                "message": "Excel file processed successfully",
                "project_id": analysis_result.get("project_id"),
                "run_id": analysis_result.get("run_id"),
                "files": file_result["files"],
                "details": {
                    "csv_rows": file_result["details"]["csv_rows"],
                    "jsl_length": file_result["details"]["jsl_length"],
                    "zip_size_mb": file_result["details"]["zip_size_mb"]
                }
            }
            
        except Exception as e:
            logger.error(f"Error processing Excel file: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }
    
    def generate_csv(self, df_data: pd.DataFrame, cat_var: str, fai_columns: List[str]) -> str:
        """Generate CSV content (legacy method)"""
        return self.file_processor.generate_csv(df_data, cat_var, fai_columns)
    
    def generate_jsl(self, df_meta: pd.DataFrame, boundaries: Dict[str, Dict[str, Any]], 
                    cat_var: str, color_by: Optional[str] = None) -> str:
        """Generate JSL content (legacy method)"""
        return self.file_processor.generate_jsl(df_meta, boundaries, cat_var, color_by)