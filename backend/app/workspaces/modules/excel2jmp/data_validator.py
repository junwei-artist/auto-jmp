"""
Data Validator Module for Excel2JMP Module

Validates structure and ensures the Excel matches expectations.
Performs soft checks and returns warnings/errors without blocking progression.
"""

import pandas as pd
import numpy as np
from typing import Dict, List, Any
import logging

logger = logging.getLogger(__name__)


class DataValidator:
    """Validates Excel data structure and content"""

    def __init__(self):
        # Internal required columns (post-mapping)
        self.required_meta_columns = [
            "test_name", "description", "target", "usl", "lsl", "main_level"
        ]
        # External/original column names before mapping
        self.original_required = [
            "Y Variable", "DETAIL", "Target", "USL", "LSL", "Label"
        ]

    def validate_structure(self, df_meta: pd.DataFrame, df_data: pd.DataFrame) -> Dict[str, Any]:
        warnings: List[Dict[str, Any]] = []

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

        # Also record whether the original column names were present prior to mapping
        original_cols = df_meta.attrs.get("original_columns") or []
        missing_original = [col for col in self.original_required if col not in original_cols]
        if missing_original:
            warnings.append({
                "type": "missing_original_meta_columns",
                "message": f"Missing expected original meta columns: {missing_original}",
                "details": {
                    "missing_original": missing_original,
                    "expected_original": self.original_required,
                    "available_original": list(original_cols)
                }
            })

        empty_rows = int(df_meta.isnull().all(axis=1).sum())
        if empty_rows > 0:
            warnings.append({
                "type": "empty_meta_rows",
                "message": f"Found {empty_rows} empty rows in meta sheet",
                "details": {"empty_rows": empty_rows}
            })

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
                "meta_shape": (int(df_meta.shape[0]), int(df_meta.shape[1])),
                "data_shape": (int(df_data.shape[0]), int(df_data.shape[1])),
                "fai_columns_found": len(fai_columns),
                "missing_required_columns": len(missing_columns)
            }
        }

    def validate_metadata_consistency(self, df_meta: pd.DataFrame, df_data: pd.DataFrame) -> Dict[str, Any]:
        warnings: List[Dict[str, Any]] = []

        if "main_level" in df_meta.columns:
            # test_name values expected to refer to FAI columns present in data
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

        # Note: uses 'Label' for group levels originally
        original_cols = df_meta.attrs.get("original_columns") or []
        if "Label" not in original_cols:
            warnings.append({
                "type": "original_label_missing",
                "message": "Original 'Label' column not found in meta",
                "details": {"available_original": list(original_cols)}
            })

        inconsistent_meta: List[Dict[str, Any]] = []
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

        return {
            "valid": True,
            "checkpoint": 2,
            "message": "Metadata validation completed",
            "warnings": warnings,
            "details": {
                "meta_rows": int(len(df_meta)),
                "unique_main_levels": int(df_meta["main_level"].nunique()) if "main_level" in df_meta.columns else 0,
                "inconsistent_columns": len(inconsistent_meta)
            }
        }

    def validate_data_quality(self, df_meta: pd.DataFrame, df_data: pd.DataFrame, cat_var: str) -> Dict[str, Any]:
        warnings: List[Dict[str, Any]] = []

        # Critical meta columns
        critical_columns = ["test_name", "main_level", "usl", "lsl"]
        missing_data = {}
        for col in critical_columns:
            if col in df_meta.columns:
                missing_count = int(df_meta[col].isna().sum())
                if missing_count > 0:
                    missing_data[col] = missing_count
        if missing_data:
            warnings.append({
                "type": "missing_meta_data",
                "message": "Missing data in critical meta columns",
                "details": {
                    "missing_data": missing_data,
                    "total_rows": len(df_meta)
                }
            })

        # Categorical variable preference: 'Stage'
        preferred_cat = "Stage"
        if cat_var not in df_data.columns:
            warnings.append({
                "type": "categorical_var_missing",
                "message": f"Categorical variable '{cat_var}' not found in data",
                "details": {"available_columns": df_data.columns.tolist()}
            })
        else:
            cat_missing = int(df_data[cat_var].isna().sum())
            if cat_missing > 0:
                warnings.append({
                    "type": "categorical_var_missing_values",
                    "message": f"Categorical variable '{cat_var}' has {cat_missing} missing values",
                    "details": {"missing_count": cat_missing}
                })

        if preferred_cat in df_data.columns and cat_var != preferred_cat:
            warnings.append({
                "type": "preferred_categorical_var",
                "message": f"Preferred categorical variable is '{preferred_cat}'; using '{cat_var}'",
                "details": {"preferred": preferred_cat, "selected": cat_var}
            })

        fai_columns = [col for col in df_data.columns if "FAI" in str(col).upper()]
        numeric_issues: List[Dict[str, Any]] = []
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
                "total_data_points": df_data.shape[0] * df_data.shape[1],
                "fai_columns": len(fai_columns),
                "categorical_variable": cat_var,
                "missing_meta_data": int(len(missing_data))
            }
        }

    def validate_categorical_selection(self, df_data: pd.DataFrame, cat_var: str) -> Dict[str, Any]:
        if cat_var not in df_data.columns:
            return {
                "valid": False,
                "error": f"Categorical variable '{cat_var}' not found in data",
                "available_columns": df_data.columns.tolist()
            }
        unique_values = int(df_data[cat_var].nunique())
        total_values = int(len(df_data[cat_var].dropna()))
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
        return {
            "valid": True,
            "message": f"Categorical variable '{cat_var}' validation passed",
            "details": {
                "unique_values": unique_values,
                "total_values": total_values,
                "value_counts": {str(k): int(v) for k, v in df_data[cat_var].value_counts().head(10).to_dict().items()}
            }
        }

    def run_full_validation(self, df_meta: pd.DataFrame, df_data: pd.DataFrame, cat_var: str) -> Dict[str, Any]:
        results = []
        structure_result = self.validate_structure(df_meta, df_data)
        results.append(structure_result)
        metadata_result = self.validate_metadata_consistency(df_meta, df_data)
        results.append(metadata_result)
        quality_result = self.validate_data_quality(df_meta, df_data, cat_var)
        results.append(quality_result)
        categorical_result = self.validate_categorical_selection(df_data, cat_var)
        results.append(categorical_result)

        all_warnings: List[Dict[str, Any]] = []
        for result in results:
            if "warnings" in result:
                all_warnings.extend(result["warnings"])

        all_valid = all(result.get("valid", False) for result in results)
        return {
            "valid": all_valid,
            "success": all_valid,  # Add success for compatibility
            "message": "Full validation completed",
            "checkpoints": results,
            "warnings": all_warnings,
            "summary": {
                "total_checkpoints": len(results),
                "passed_checkpoints": sum(1 for r in results if r.get("valid", False)),
                "total_warnings": len(all_warnings)
            }
        }
