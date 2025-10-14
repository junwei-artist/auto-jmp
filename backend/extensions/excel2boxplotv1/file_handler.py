"""
File Handler Module for Excel2BoxplotV1 Plugin

Handles file loading, sheet detection, and preliminary exploration of columns.
Allows user to select categorical variable for analysis.
"""

import pandas as pd
import numpy as np
from typing import Dict, List, Tuple, Optional, Any
from pathlib import Path
import logging

logger = logging.getLogger(__name__)

# Required columns for meta sheet
REQUIRED_COLUMNS = ["test_name", "description", "target", "usl", "lsl", "main_level"]

class FileHandler:
    """Handles Excel file loading and column exploration"""
    
    def __init__(self):
        self.excel_path: Optional[str] = None
        self.df_meta: Optional[pd.DataFrame] = None
        self.df_data_raw: Optional[pd.DataFrame] = None
        self.sheets: List[str] = []
        self.fai_columns: List[str] = []
        self.categorical_columns: List[str] = []
        self.selected_cat_var: Optional[str] = None
        
    def load_excel_file(self, excel_path: str) -> Dict[str, Any]:
        """
        Load Excel file and detect sheets and columns
        
        Args:
            excel_path: Path to Excel file
            
        Returns:
            Dict with file information and available columns
        """
        try:
            self.excel_path = excel_path
            
            # Read Excel file to get sheet names
            excel_file = pd.ExcelFile(excel_path)
            self.sheets = excel_file.sheet_names
            
            logger.info(f"Found sheets: {self.sheets}")
            
            # Check for required sheets
            if "meta" not in self.sheets:
                raise ValueError("Excel file must contain a 'meta' sheet")
            if "data" not in self.sheets:
                raise ValueError("Excel file must contain a 'data' sheet")
            
            # Load meta sheet
            self.df_meta = pd.read_excel(excel_path, sheet_name="meta")
            logger.info(f"Meta sheet loaded: {self.df_meta.shape}")
            
            # Load data sheet
            self.df_data_raw = pd.read_excel(excel_path, sheet_name="data")
            logger.info(f"Data sheet loaded: {self.df_data_raw.shape}")
            
            # Analyze columns
            self._analyze_columns()
            
            return {
                "success": True,
                "sheets": self.sheets,
                "meta_shape": self.df_meta.shape,
                "data_shape": self.df_data_raw.shape,
                "meta_columns": self.df_meta.columns.tolist(),
                "data_columns": self.df_data_raw.columns.tolist(),
                "fai_columns": self.fai_columns,
                "categorical_columns": self.categorical_columns,
                "missing_required_columns": self._get_missing_required_columns()
            }
            
        except Exception as e:
            logger.error(f"Error loading Excel file: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }
    
    def _analyze_columns(self):
        """Analyze columns in data sheet to identify FAI and categorical columns"""
        if self.df_data_raw is None:
            return
            
        # Find FAI columns (columns containing "FAI" in their name)
        self.fai_columns = [
            col for col in self.df_data_raw.columns 
            if "FAI" in str(col).upper()
        ]
        
        # Find categorical columns (non-numeric columns that could be grouping variables)
        self.categorical_columns = []
        for col in self.df_data_raw.columns:
            if col not in self.fai_columns:
                # Check if column contains mostly text/categorical data
                sample_values = self.df_data_raw[col].dropna().head(10)
                if len(sample_values) > 0:
                    # If most values are strings or have limited unique values, consider categorical
                    unique_ratio = len(sample_values.unique()) / len(sample_values)
                    if unique_ratio < 0.8 or sample_values.dtype == 'object':
                        self.categorical_columns.append(col)
        
        logger.info(f"Found FAI columns: {self.fai_columns}")
        logger.info(f"Found categorical columns: {self.categorical_columns}")
    
    def _get_missing_required_columns(self) -> List[str]:
        """Get list of missing required columns from meta sheet"""
        if self.df_meta is None:
            return REQUIRED_COLUMNS
        return [col for col in REQUIRED_COLUMNS if col not in self.df_meta.columns]
    
    def set_categorical_variable(self, cat_var: str) -> Dict[str, Any]:
        """
        Set the categorical variable for analysis
        
        Args:
            cat_var: Name of categorical variable to use for grouping
            
        Returns:
            Dict with validation result
        """
        if self.df_data_raw is None:
            return {"success": False, "error": "No data loaded"}
        
        if cat_var not in self.df_data_raw.columns:
            return {
                "success": False, 
                "error": f"Column '{cat_var}' not found in data sheet",
                "available_columns": self.df_data_raw.columns.tolist()
            }
        
        self.selected_cat_var = cat_var
        
        # Validate that we have FAI columns
        if not self.fai_columns:
            return {
                "success": False,
                "error": "No 'FAI' columns found in data sheet"
            }
        
        return {
            "success": True,
            "categorical_variable": cat_var,
            "fai_columns": self.fai_columns,
            "data_shape": self.df_data_raw.shape
        }
    
    def get_file_summary(self) -> Dict[str, Any]:
        """Get summary of loaded file"""
        if self.df_meta is None or self.df_data_raw is None:
            return {"error": "No file loaded"}
        
        return {
            "file_path": self.excel_path,
            "sheets": self.sheets,
            "meta_info": {
                "shape": self.df_meta.shape,
                "columns": self.df_meta.columns.tolist(),
                "missing_required": self._get_missing_required_columns()
            },
            "data_info": {
                "shape": self.df_data_raw.shape,
                "columns": self.df_data_raw.columns.tolist(),
                "fai_columns": self.fai_columns,
                "categorical_columns": self.categorical_columns
            },
            "selected_cat_var": self.selected_cat_var
        }
    
    def get_data_preview(self, n_rows: int = 5) -> Dict[str, Any]:
        """Get preview of data for user review"""
        if self.df_data_raw is None:
            return {"error": "No data loaded"}
        
        preview_data = self.df_data_raw.head(n_rows).to_dict('records')
        
        return {
            "preview": preview_data,
            "columns": self.df_data_raw.columns.tolist(),
            "shape": self.df_data_raw.shape,
            "fai_columns": self.fai_columns,
            "categorical_columns": self.categorical_columns
        }
