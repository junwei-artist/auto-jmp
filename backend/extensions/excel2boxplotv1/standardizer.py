"""
Standardizer Module for Excel2BoxplotV1 Plugin

Handles format conversion and standardization of Excel files to ensure compatibility
with the plugin's expected format.
"""

import pandas as pd
import numpy as np
from typing import Dict, List, Tuple, Optional, Any
import tempfile
import shutil
import os
import logging

logger = logging.getLogger(__name__)

# Required columns for meta sheet
REQUIRED_COLUMNS = ["test_name", "description", "target", "usl", "lsl", "main_level"]

# Column mapping for old format to new format
META_COLUMN_MAPPING = {
    "Y Variable": "test_name",
    "DETAIL": "description", 
    "Target": "target",
    "USL": "usl",
    "LSL": "lsl",
    "Label": "main_level"
}

class ExcelStandardizer:
    """Handles Excel file format standardization"""
    
    def __init__(self):
        self.was_standardized = False
        self.standardized_file_path = None
        self.original_file_path = None
        self.changes_applied = []
        
    def standardize_file(self, excel_path: str) -> Dict[str, Any]:
        """
        Standardize Excel file format to match expected structure
        
        Args:
            excel_path: Path to Excel file to standardize
            
        Returns:
            Dict with standardization result and path to standardized file
        """
        try:
            self.original_file_path = excel_path
            self.changes_applied = []
            
            # Read Excel file to get sheet names
            excel_file = pd.ExcelFile(excel_path)
            sheets = excel_file.sheet_names
            logger.info(f"Found sheets: {sheets}")
            
            # Check if standardization is needed
            needs_standardization = self._check_if_standardization_needed(sheets, excel_path)
            
            if not needs_standardization:
                logger.info("File already in standard format, no changes needed")
                return {
                    "success": True,
                    "standardized_file_path": excel_path,
                    "was_standardized": False,
                    "changes_applied": []
                }
            
            # Create standardized file
            standardized_path = self._create_standardized_file(excel_path, sheets)
            
            self.was_standardized = True
            self.standardized_file_path = standardized_path
            
            logger.info(f"File standardized successfully: {standardized_path}")
            logger.info(f"Changes applied: {self.changes_applied}")
            
            return {
                "success": True,
                "standardized_file_path": standardized_path,
                "was_standardized": True,
                "changes_applied": self.changes_applied
            }
            
        except Exception as e:
            logger.error(f"Error standardizing file: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }
    
    def _check_if_standardization_needed(self, sheets: List[str], excel_path: str) -> bool:
        """Check if file needs standardization"""
        
        # Check if meta sheet exists and has required columns
        if "meta" in sheets:
            meta_df = pd.read_excel(excel_path, sheet_name="meta")
            missing_columns = [col for col in REQUIRED_COLUMNS if col not in meta_df.columns]
            
            # If all required columns exist, check if we have old format columns
            if not missing_columns:
                old_format_columns = [col for col in META_COLUMN_MAPPING.keys() if col in meta_df.columns]
                if old_format_columns:
                    logger.info(f"Found old format columns: {old_format_columns}")
                    return True
                return False
            else:
                logger.info(f"Missing required columns: {missing_columns}")
                return True
        
        # Check if spec sheet exists (fallback)
        elif "spec" in sheets:
            logger.info("Meta sheet not found, but spec sheet exists - standardization needed")
            return True
        
        # No meta or spec sheet
        else:
            logger.error("Neither meta nor spec sheet found")
            return False
    
    def _create_standardized_file(self, excel_path: str, sheets: List[str]) -> str:
        """Create standardized Excel file"""
        
        # Create temporary file for standardized version
        temp_fd, temp_path = tempfile.mkstemp(suffix='.xlsx')
        os.close(temp_fd)
        
        try:
            with pd.ExcelWriter(temp_path, engine='openpyxl') as writer:
                
                # Handle meta/spec sheet
                meta_sheet_name = "meta"
                if "meta" in sheets:
                    meta_df = pd.read_excel(excel_path, sheet_name="meta")
                    meta_sheet_name = "meta"
                elif "spec" in sheets:
                    meta_df = pd.read_excel(excel_path, sheet_name="spec")
                    meta_sheet_name = "spec"
                    self.changes_applied.append("Renamed 'spec' sheet to 'meta'")
                
                # Standardize meta sheet columns
                standardized_meta_df = self._standardize_meta_columns(meta_df)
                
                # Write standardized meta sheet
                standardized_meta_df.to_excel(writer, sheet_name="meta", index=False)
                
                # Handle data sheet
                if "data" in sheets:
                    data_df = pd.read_excel(excel_path, sheet_name="data")
                    
                    # Standardize data sheet columns
                    standardized_data_df = self._standardize_data_columns(data_df)
                    
                    # Write standardized data sheet
                    standardized_data_df.to_excel(writer, sheet_name="data", index=False)
                else:
                    raise ValueError("Data sheet not found")
                
                # Copy other sheets as-is
                for sheet_name in sheets:
                    if sheet_name not in ["meta", "spec", "data"]:
                        other_df = pd.read_excel(excel_path, sheet_name=sheet_name)
                        other_df.to_excel(writer, sheet_name=sheet_name, index=False)
            
            return temp_path
            
        except Exception as e:
            # Clean up temp file on error
            if os.path.exists(temp_path):
                os.unlink(temp_path)
            raise e
    
    def _standardize_meta_columns(self, meta_df: pd.DataFrame) -> pd.DataFrame:
        """Standardize meta sheet column names"""
        
        # Check if we have old format columns
        old_format_columns = [col for col in META_COLUMN_MAPPING.keys() if col in meta_df.columns]
        
        if old_format_columns:
            logger.info(f"Standardizing meta columns: {old_format_columns}")
            
            # Create a copy to avoid modifying original
            standardized_df = meta_df.copy()
            
            # Apply column mapping
            for old_col, new_col in META_COLUMN_MAPPING.items():
                if old_col in meta_df.columns:
                    standardized_df = standardized_df.rename(columns={old_col: new_col})
                    self.changes_applied.append(f"Renamed meta column '{old_col}' to '{new_col}'")
            
            return standardized_df
        
        return meta_df
    
    def _standardize_data_columns(self, data_df: pd.DataFrame) -> pd.DataFrame:
        """Standardize data sheet column names by adding category_ prefix to non-FAI columns"""
        
        # Check if we need to add category_ prefix
        non_fai_columns = [col for col in data_df.columns if "FAI" not in str(col).upper()]
        
        if non_fai_columns:
            logger.info(f"Adding category_ prefix to non-FAI columns: {non_fai_columns}")
            
            # Create a copy to avoid modifying original
            standardized_df = data_df.copy()
            
            # Add category_ prefix to non-FAI columns
            column_mapping = {}
            for col in non_fai_columns:
                new_col_name = f"category_{col}"
                column_mapping[col] = new_col_name
                self.changes_applied.append(f"Renamed data column '{col}' to '{new_col_name}'")
            
            standardized_df = standardized_df.rename(columns=column_mapping)
            
            return standardized_df
        
        return data_df
    
    def cleanup(self):
        """Clean up standardized file if it was created"""
        if self.was_standardized and self.standardized_file_path and os.path.exists(self.standardized_file_path):
            try:
                os.unlink(self.standardized_file_path)
                logger.info(f"Cleaned up standardized file: {self.standardized_file_path}")
            except Exception as e:
                logger.warning(f"Could not clean up standardized file: {str(e)}")
        
        self.was_standardized = False
        self.standardized_file_path = None
        self.original_file_path = None
        self.changes_applied = []
