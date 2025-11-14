"""
Data Validator Module for Excel2BoxplotV1 Plugin

Validates structure and ensures the Excel matches expectations.
Performs soft checks and returns warnings/errors without blocking progression.
"""

import pandas as pd
import numpy as np
from typing import Dict, List, Any, Optional
import logging

logger = logging.getLogger(__name__)

def convert_to_native_types(obj: Any) -> Any:
    """
    Recursively convert numpy/pandas types to native Python types for JSON serialization.
    
    Args:
        obj: Object that may contain numpy/pandas types
        
    Returns:
        Object with all numpy/pandas types converted to native Python types
    """
    if isinstance(obj, (np.integer, np.int64, np.int32, np.int16, np.int8)):
        return int(obj)
    elif isinstance(obj, (np.floating, np.float64, np.float32, np.float16)):
        return float(obj)
    elif isinstance(obj, np.bool_):
        return bool(obj)
    elif isinstance(obj, np.ndarray):
        return obj.tolist()
    elif isinstance(obj, pd.Series):
        return obj.tolist()
    elif isinstance(obj, pd.DataFrame):
        return obj.to_dict('records')
    elif isinstance(obj, dict):
        return {convert_to_native_types(k): convert_to_native_types(v) for k, v in obj.items()}
    elif isinstance(obj, (list, tuple)):
        return [convert_to_native_types(item) for item in obj]
    elif isinstance(obj, set):
        return [convert_to_native_types(item) for item in obj]
    else:
        return obj

class DataValidator:
    """Validates Excel data structure and content"""
    
    def __init__(self):
        self.required_meta_columns = [
            "test_name", "description", "target", "usl", "lsl", "main_level"
        ]
    
    def validate_structure(self, df_meta: pd.DataFrame, df_data: pd.DataFrame) -> Dict[str, Any]:
        """
        Validate basic structure of meta and data sheets
        
        Args:
            df_meta: Meta sheet DataFrame
            df_data: Data sheet DataFrame
            
        Returns:
            Dict with validation results and warnings
        """
        warnings = []
        
        # Check required columns in meta
        missing_columns = [col for col in self.required_meta_columns if col not in df_meta.columns]
        if missing_columns:
            warnings.append({
                "type": "missing_meta_columns",
                "message": f"Missing required columns in meta sheet: {missing_columns}",
                "details": {
                    "missing_columns": missing_columns,
                    "required_columns": self.required_meta_columns,
                    "available_columns": df_meta.columns.tolist()
                }
            })
        
        # Check for empty rows in meta
        empty_rows = df_meta.isnull().all(axis=1).sum()
        if empty_rows > 0:
            warnings.append({
                "type": "empty_meta_rows",
                "message": f"Found {empty_rows} empty rows in meta sheet",
                "details": {"empty_rows": empty_rows}
            })
        
        # Check for FAI columns in data
        fai_columns = [col for col in df_data.columns if "FAI" in str(col).upper()]
        if not fai_columns:
            warnings.append({
                "type": "no_fai_columns",
                "message": "No 'FAI' columns found in data sheet",
                "details": {"available_columns": df_data.columns.tolist()}
            })
        
        return {
            "valid": True,
            "checkpoint": 1,
            "message": "Structure validation completed",
            "warnings": warnings,
            "details": {
                "meta_shape": [int(df_meta.shape[0]), int(df_meta.shape[1])],  # Convert numpy.int64 to int
                "data_shape": [int(df_data.shape[0]), int(df_data.shape[1])],  # Convert numpy.int64 to int
                "fai_columns_found": len(fai_columns),
                "missing_required_columns": len(missing_columns)
            }
        }
    
    def validate_metadata_consistency(self, df_meta: pd.DataFrame, df_data: pd.DataFrame) -> Dict[str, Any]:
        """
        Validate metadata consistency between meta and data sheets
        
        Args:
            df_meta: Meta sheet DataFrame
            df_data: Data sheet DataFrame
            
        Returns:
            Dict with validation results and warnings
        """
        warnings = []
        
        # Check main_level consistency
        if "main_level" in df_meta.columns:
            meta_levels = set(df_meta["main_level"].dropna().astype(str))
            data_columns = set(df_data.columns.astype(str))
            
            # Check if test_name values exist in data columns
            if "test_name" in df_meta.columns:
                meta_test_names = set(df_meta["test_name"].dropna().astype(str))
                fai_columns = [col for col in df_data.columns if "FAI" in str(col).upper()]
                
                missing_in_data = meta_test_names - set(fai_columns)
                extra_in_data = set(fai_columns) - meta_test_names
                
                if missing_in_data or extra_in_data:
                    warnings.append({
                        "type": "test_name_mismatch",
                        "message": "Test name mismatch between meta and data sheets",
                        "details": {
                            "missing_in_data": list(missing_in_data),
                            "extra_in_data": list(extra_in_data)
                        }
                    })
        
        # Check for inconsistent metadata values
        inconsistent_meta = []
        meta_cols = [col for col in df_meta.columns if col not in ["test_name", "main_level"]]
        
        for col in meta_cols:
            if col in df_meta.columns:
                grouped = df_meta.groupby('main_level')[col].apply(lambda x: x.nunique())
                inconsistent_labels = grouped[grouped > 1].index.tolist()
                if inconsistent_labels:
                    inconsistent_meta.append({
                        "column": col,
                        "labels": inconsistent_labels
                    })
        
        if inconsistent_meta:
            warnings.append({
                "type": "inconsistent_metadata",
                "message": "Inconsistent metadata found",
                "details": {"inconsistent_columns": inconsistent_meta}
            })
        
        unique_main_levels = df_meta["main_level"].nunique() if "main_level" in df_meta.columns else 0
        return {
            "valid": True,
            "checkpoint": 2,
            "message": "Metadata validation completed",
            "warnings": warnings,
            "details": {
                "meta_rows": len(df_meta),
                "unique_main_levels": int(unique_main_levels),  # Convert numpy.int64 to int
                "inconsistent_columns": len(inconsistent_meta)
            }
        }
    
    def validate_data_quality(self, df_meta: pd.DataFrame, df_data: pd.DataFrame, cat_var: str) -> Dict[str, Any]:
        """
        Validate data quality and completeness
        
        Args:
            df_meta: Meta sheet DataFrame
            df_data: Data sheet DataFrame
            cat_var: Selected categorical variable
            
        Returns:
            Dict with validation results and warnings
        """
        warnings = []
        
        # Check for missing values in critical columns
        critical_columns = ["test_name", "main_level", "usl", "lsl"]
        missing_data = {}
        
        for col in critical_columns:
            if col in df_meta.columns:
                missing_count = df_meta[col].isna().sum()
                if missing_count > 0:
                    missing_data[col] = int(missing_count)  # Convert numpy.int64 to int
        
        if missing_data:
            warnings.append({
                "type": "missing_meta_data",
                "message": "Missing data in critical meta columns",
                "details": {
                    "missing_data": missing_data,
                    "total_rows": len(df_meta)
                }
            })
        
        # Check categorical variable
        if cat_var not in df_data.columns:
            warnings.append({
                "type": "categorical_var_missing",
                "message": f"Categorical variable '{cat_var}' not found in data",
                "details": {"available_columns": df_data.columns.tolist()}
            })
        else:
            # Check for missing values in categorical variable
            cat_missing = df_data[cat_var].isna().sum()
            if cat_missing > 0:
                warnings.append({
                    "type": "categorical_var_missing_values",
                    "message": f"Categorical variable '{cat_var}' has {int(cat_missing)} missing values",
                    "details": {"missing_count": int(cat_missing)}  # Convert numpy.int64 to int
                })
        
        # Check FAI columns for numeric issues
        fai_columns = [col for col in df_data.columns if "FAI" in str(col).upper()]
        numeric_issues = []
        
        for fai_col in fai_columns:
            try:
                pd.to_numeric(df_data[fai_col], errors='raise')
            except (ValueError, TypeError):
                numeric_issues.append({
                    "column": fai_col,
                    "issue": "Non-numeric data found"
                })
        
        if numeric_issues:
            warnings.append({
                "type": "numeric_issues",
                "message": "Data quality issues found in FAI columns",
                "details": {"numeric_issues": numeric_issues}
            })
        
        return {
            "valid": True,
            "checkpoint": 3,
            "message": "Data quality validation completed",
            "warnings": warnings,
            "details": {
                "total_data_points": int(df_data.shape[0] * df_data.shape[1]),  # Convert numpy.int64 to int
                "fai_columns": len(fai_columns),
                "categorical_variable": cat_var,
                "missing_meta_data": len(missing_data)
            }
        }
    
    def validate_categorical_selection(self, df_data: pd.DataFrame, cat_var: str) -> Dict[str, Any]:
        """
        Validate the selected categorical variable
        
        Args:
            df_data: Data sheet DataFrame
            cat_var: Selected categorical variable
            
        Returns:
            Dict with validation results
        """
        if cat_var not in df_data.columns:
            return {
                "valid": False,
                "error": f"Categorical variable '{cat_var}' not found in data",
                "available_columns": df_data.columns.tolist()
            }
        
        # Check if categorical variable has sufficient variation
        unique_values = df_data[cat_var].nunique()
        total_values = len(df_data[cat_var].dropna())
        
        if unique_values < 2:
            return {
                "valid": False,
                "error": f"Categorical variable '{cat_var}' has only {unique_values} unique value(s). Need at least 2 for grouping."
            }
        
        if total_values < 10:
            return {
                "valid": False,
                "error": f"Categorical variable '{cat_var}' has only {total_values} non-null values. Need at least 10 for meaningful analysis."
            }
        
        # Convert value_counts to native types
        value_counts_dict = df_data[cat_var].value_counts().head(10).to_dict()
        # Convert keys and values to native types
        value_counts_native = {}
        for k, v in value_counts_dict.items():
            # Convert key (might be numpy type) and value (numpy.int64) to native types
            key = convert_to_native_types(k)
            value = convert_to_native_types(v)
            value_counts_native[key] = value
        
        return {
            "valid": True,
            "message": f"Categorical variable '{cat_var}' validation passed",
            "details": {
                "unique_values": convert_to_native_types(unique_values),
                "total_values": convert_to_native_types(total_values),
                "value_counts": value_counts_native
            }
        }
    
    def run_full_validation(self, df_meta: pd.DataFrame, df_data: pd.DataFrame, cat_var: str) -> Dict[str, Any]:
        """
        Run all validation checks
        
        Args:
            df_meta: Meta sheet DataFrame
            df_data: Data sheet DataFrame
            cat_var: Selected categorical variable
            
        Returns:
            Dict with all validation results
        """
        results = []
        
        # Run all validation checks
        structure_result = self.validate_structure(df_meta, df_data)
        results.append(structure_result)
        
        metadata_result = self.validate_metadata_consistency(df_meta, df_data)
        results.append(metadata_result)
        
        quality_result = self.validate_data_quality(df_meta, df_data, cat_var)
        results.append(quality_result)
        
        categorical_result = self.validate_categorical_selection(df_data, cat_var)
        results.append(categorical_result)
        
        # Collect all warnings
        all_warnings = []
        for result in results:
            if "warnings" in result:
                all_warnings.extend(result["warnings"])
        
        # Overall validation status
        all_valid = all(result.get("valid", False) for result in results)
        
        # Convert all results to native types for JSON serialization
        return convert_to_native_types({
            "valid": all_valid,
            "message": "Full validation completed",
            "checkpoints": results,
            "warnings": all_warnings,
            "summary": {
                "total_checkpoints": len(results),
                "passed_checkpoints": sum(1 for r in results if r.get("valid", False)),
                "total_warnings": len(all_warnings)
            }
        })
