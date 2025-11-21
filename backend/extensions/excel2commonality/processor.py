"""
Main Processor Module for Excel2Commonality Plugin

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

from .analyzer import CommonalityAnalyzer

logger = logging.getLogger(__name__)

class ExcelToCommonalityProcessor:
    """Main processor that orchestrates all processing modules"""
    
    def __init__(self):
        self.analyzer = CommonalityAnalyzer()
    
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
                result = self.analyzer.validate_excel_structure(file_path)
                return result
            except Exception as e:
                error_msg = str(e)
                if "expected <class 'int'>" in error_msg or "xWindow" in error_msg or "yWindow" in error_msg:
                    # Try to fix the file
                    fix_result = self.fix_excel_file(file_path)
                    if fix_result["success"]:
                        # Try reading the fixed file
                        try:
                            result = self.analyzer.validate_excel_structure(fix_result["fixed_file"])
                            result["fix_applied"] = True
                            result["fix_message"] = fix_result["message"]
                            result["fixed_file"] = fix_result["fixed_file"]
                            return result
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
        Validate data content (Checkpoint 2)
        
        Args:
            file_path: Path to Excel file
            
        Returns:
            Dict with validation results
        """
        try:
            result = self.analyzer.validate_data_content(file_path)
            return result
            
        except Exception as e:
            logger.error(f"Error in validate_data_content: {str(e)}")
            return {
                "valid": False,
                "checkpoint": 2,
                "message": f"Data content validation failed: {str(e)}",
                "error": str(e)
            }
    
    def process_excel_file(self, file_path: str, project_name: str, 
                          project_description: str = "") -> Dict[str, Any]:
        """
        Process Excel file and generate CSV + JSL
        
        Args:
            file_path: Path to Excel file
            project_name: Name of the project
            project_description: Description of the project
            
        Returns:
            Dict with processing results
        """
        try:
            # Run analysis
            analysis_result = self.analyzer.analyze_excel_file(file_path)
            
            if not analysis_result["success"]:
                return analysis_result
            
            return {
                "success": True,
                "message": "Excel file processed successfully for commonality analysis",
                "project_name": project_name,
                "project_description": project_description,
                "files": {
                    "csv_content": analysis_result["csv_content"],
                    "jsl_content": analysis_result["jsl_content"],
                    "csv_filename": analysis_result["csv_filename"],
                    "jsl_filename": analysis_result["jsl_filename"]
                },
                "details": {
                    "file_format": analysis_result["file_format"],
                    "data_sheet": analysis_result["data_sheet"],
                    "fai_columns_found": analysis_result["fai_columns_found"],
                    "fai_columns": analysis_result["fai_columns"],
                    "timestamp": analysis_result["timestamp"]
                }
            }
            
        except Exception as e:
            logger.error(f"Error processing Excel file: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }
