"""
Main Processor Module for Excel2CPKV1 Plugin

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

from .analyzer import CPKAnalyzer

logger = logging.getLogger(__name__)

class ExcelToCPKProcessor:
    """Main processor that orchestrates CPK analysis"""
    
    def __init__(self):
        self.analyzer = CPKAnalyzer()
    
    def _create_failed_rows_summary(self, row_errors, row_warnings):
        """Create a summary of failed rows grouped by row number"""
        failed_rows_summary = {}
        
        # Process errors
        for error in row_errors:
            row_num = error.get("row", "unknown")
            if row_num not in failed_rows_summary:
                failed_rows_summary[row_num] = {
                    "row": row_num,
                    "test_name": error.get("test_name", "unknown"),
                    "errors": [],
                    "warnings": []
                }
            failed_rows_summary[row_num]["errors"].append({
                "issue": error.get("issue"),
                "details": error.get("details", ""),
                "values": {k: v for k, v in error.items() if k in ["usl", "lsl", "target"]}
            })
        
        # Process warnings
        for warning in row_warnings:
            row_num = warning.get("row", "unknown")
            if row_num not in failed_rows_summary:
                failed_rows_summary[row_num] = {
                    "row": row_num,
                    "test_name": warning.get("test_name", "unknown"),
                    "errors": [],
                    "warnings": []
                }
            failed_rows_summary[row_num]["warnings"].append({
                "issue": warning.get("issue"),
                "details": warning.get("details", ""),
                "values": {k: v for k, v in warning.items() if k in ["usl", "lsl", "target"]}
            })
        
        return list(failed_rows_summary.values())
    
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
                spec_df, data_df, route = self.analyzer.load_excel(file_path)
            except Exception as e:
                error_msg = str(e)
                if "expected <class 'int'>" in error_msg or "xWindow" in error_msg or "yWindow" in error_msg:
                    # Try to fix the file
                    fix_result = self.fix_excel_file(file_path)
                    if fix_result["success"]:
                        # Try reading the fixed file
                        try:
                            spec_df, data_df, route = self.analyzer.load_excel(fix_result["fixed_file"])
                            
                            return {
                                "valid": True,
                                "checkpoint": 1,
                                "message": "Excel file structure validated successfully",
                                "fix_applied": True,
                                "fix_message": fix_result["message"],
                                "fixed_file": fix_result["fixed_file"],
                                "route": route
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
            
            # Check for required sheets
            fai_columns = self.analyzer.find_fai_columns(data_df)
            
            # Run enhanced row-level validation
            spec_norm = self.analyzer.normalize_spec_columns(spec_df, route)
            enhanced_validation = self.analyzer.validate_checkpoint1_enhanced(spec_norm)
            
            # Create failed rows summary
            failed_rows_summary = self._create_failed_rows_summary(
                enhanced_validation["row_errors"], 
                enhanced_validation["row_warnings"]
            )
            
            return {
                "valid": True,
                "checkpoint": 1,
                "message": "Excel file structure validated successfully",
                "route": route,
                "details": {
                    "spec_shape": spec_df.shape,
                    "data_shape": data_df.shape,
                    "fai_columns_found": len(fai_columns),
                    "enhanced_validation": enhanced_validation["details"],
                    "failed_rows": failed_rows_summary,
                    "failed_rows_count": len(set(error.get("row", "unknown") for error in enhanced_validation["row_errors"] + enhanced_validation["row_warnings"])),
                    "total_errors": len(enhanced_validation["row_errors"]),
                    "total_warnings": len(enhanced_validation["row_warnings"])
                },
                "enhanced_validation": {
                    "valid": enhanced_validation["valid"],
                    "message": enhanced_validation["message"],
                    "row_errors": enhanced_validation["row_errors"],
                    "row_warnings": enhanced_validation["row_warnings"],
                    "total_errors": len(enhanced_validation["row_errors"]),
                    "total_warnings": len(enhanced_validation["row_warnings"])
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
    
    def validate_spec_data(self, file_path: str) -> Dict[str, Any]:
        """
        Validate spec data (Checkpoint 2)
        
        Args:
            file_path: Path to Excel file
            
        Returns:
            Dict with validation results
        """
        try:
            spec_df, data_df, route = self.analyzer.load_excel(file_path)
            spec_norm = self.analyzer.normalize_spec_columns(spec_df, route)
            validations = self.analyzer.validate_spec(spec_norm)
            
            # Check for errors
            has_errors = any(k.startswith("Error_") for k in validations.keys())
            has_warnings = any(k.startswith("Warning_") for k in validations.keys())
            
            return {
                "valid": not has_errors,
                "checkpoint": 2,
                "message": "Spec data validation completed",
                "has_errors": has_errors,
                "has_warnings": has_warnings,
                "validations": validations
            }
            
        except Exception as e:
            logger.error(f"Error in validate_spec_data: {str(e)}")
            return {
                "valid": False,
                "checkpoint": 2,
                "message": f"Spec data validation failed: {str(e)}",
                "error": str(e)
            }
    
    def validate_data_matching(self, file_path: str) -> Dict[str, Any]:
        """
        Validate data matching (Checkpoint 3)
        
        Args:
            file_path: Path to Excel file
            
        Returns:
            Dict with validation results
        """
        try:
            spec_df, data_df, route = self.analyzer.load_excel(file_path)
            spec_norm = self.analyzer.normalize_spec_columns(spec_df, route)
            fai_cols = self.analyzer.find_fai_columns(data_df)
            matched_spec, missing_in_data = self.analyzer.match_spec_to_data(spec_norm, fai_cols)
            
            return {
                "valid": True,
                "checkpoint": 3,
                "message": "Data matching validation completed",
                "details": {
                    "fai_columns_found": len(fai_cols),
                    "matched_spec_rows": len(matched_spec),
                    "missing_in_data_rows": len(missing_in_data),
                    "fai_columns": fai_cols
                },
                "missing_in_data": missing_in_data
            }
            
        except Exception as e:
            logger.error(f"Error in validate_data_matching: {str(e)}")
            return {
                "valid": False,
                "checkpoint": 3,
                "message": f"Data matching validation failed: {str(e)}",
                "error": str(e)
            }
    
    def process_excel_file(self, file_path: str, project_name: str, 
                          project_description: str = "", imgdir: str = "/tmp/") -> Dict[str, Any]:
        """
        Process Excel file and generate CSV + JSL
        
        Args:
            file_path: Path to Excel file
            project_name: Name of the project
            project_description: Description of the project
            imgdir: Directory for saving images
            
        Returns:
            Dict with processing results
        """
        try:
            # Run the complete analysis
            result = self.analyzer.analyze_excel_file(file_path, imgdir)
            
            if not result["success"]:
                return result
            
            # Generate file names with timestamp
            timestamp = result["timestamp"]
            csv_filename = f"data_for_jmp_{timestamp}.csv"
            jsl_filename = f"generated_capability_{timestamp}.jsl"
            
            return {
                "success": True,
                "message": "Excel file processed successfully",
                "project_name": project_name,
                "project_description": project_description,
                "files": {
                    "csv_content": result["csv_content"],
                    "jsl_content": result["jsl_content"],
                    "csv_filename": csv_filename,
                    "jsl_filename": jsl_filename
                },
                "details": {
                    "route_used": result["route_used"],
                    "fai_columns_found": result["fai_columns_found"],
                    "matched_spec_rows": result["matched_spec_rows"],
                    "has_errors": result["has_errors"],
                    "timestamp": timestamp
                },
                "validations": result["validations"],
                "missing_in_data": result["missing_in_data"]
            }
            
        except Exception as e:
            logger.error(f"Error processing Excel file: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }
