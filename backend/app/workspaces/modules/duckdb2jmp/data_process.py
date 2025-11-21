"""
Data Process Module for DuckDB2JMP Module

Converts numeric data, computes plotting boundaries, and prepares clean metadata.
Handles data transformation and boundary calculations.
Supports chunked processing for large datasets.
"""

import pandas as pd
import numpy as np
from typing import Dict, List, Any, Optional, Tuple
import logging

logger = logging.getLogger(__name__)

class DataProcessor:
    """Processes and transforms data for analysis"""
    
    def __init__(self):
        self.processed_data: Optional[pd.DataFrame] = None
        self.boundaries: Dict[str, Dict[str, float]] = {}
        self.metadata: Optional[pd.DataFrame] = None
    
    def to_num_series(self, s: pd.Series) -> pd.Series:
        """Convert series to numeric, coercing errors to NaN"""
        return pd.to_numeric(s, errors="coerce")
    
    def safe_float(self, x: Any) -> float:
        """Safely convert value to float"""
        try:
            return float(x)
        except Exception:
            return np.nan
    
    def format_excel_number(self, x: Any) -> float:
        """
        Format numbers to preserve their original precision and avoid floating-point artifacts.
        This function tries to maintain the exact representation.
        """
        try:
            if pd.isna(x):
                return np.nan
            
            # Convert to float first
            f = float(x)
            
            # If it's an integer or has very few decimal places, format it cleanly
            if f.is_integer():
                return int(f)
            
            # For decimal numbers, try to preserve the original precision
            str_val = str(x)
            
            # If the original was a string representation, try to preserve it
            if isinstance(x, str):
                # Try to convert to float and format it cleanly
                try:
                    f = float(x)
                    # Use g format to remove unnecessary trailing zeros
                    return float(f"{f:.10g}")
                except:
                    return f
            
            # For other types, format cleanly
            return float(f"{f:.10g}")
        except Exception:
            return np.nan
    
    def convert_to_numeric(self, df_data: pd.DataFrame, fai_columns: List[str]) -> pd.DataFrame:
        """
        Convert FAI columns to numeric format
        
        Args:
            df_data: Data DataFrame
            fai_columns: List of FAI column names
            
        Returns:
            DataFrame with numeric FAI columns
        """
        df_numeric = df_data.copy()
        
        for col in fai_columns:
            if col in df_numeric.columns:
                df_numeric[col] = self.to_num_series(df_numeric[col])
                logger.info(f"Converted {col} to numeric")
        
        return df_numeric
    
    def compute_axis_params(self, df_meta: pd.DataFrame, df_data_num: pd.DataFrame, 
                          fai_cols: List[str], main_level: str,
                          add_usl: bool = True, add_target: bool = True, add_lsl: bool = True,
                          add_tol_upper: bool = False, add_tol_lower: bool = False) -> Dict[str, Any]:
        """
        Compute axis parameters for plotting
        
        Args:
            df_meta: Meta DataFrame
            df_data_num: Numeric data DataFrame
            fai_cols: List of FAI columns
            main_level: Main level to compute parameters for
            add_usl: Whether to include USL in boundary calculation (default: True)
            add_target: Whether to include Target in boundary calculation (default: True)
            add_lsl: Whether to include LSL in boundary calculation (default: True)
            
        Returns:
            Dict with axis parameters
        """
        # Get y variables for this main level
        y_candidates = (df_meta.loc[df_meta["main_level"] == main_level, "test_name"]
                       .dropna().astype(str).unique().tolist())
        y_vars = [y for y in y_candidates if y in fai_cols]
        
        if y_vars:
            g = df_data_num[y_vars]
            group_min = np.nanmin(g.values) if g.size else np.nan
            group_max = np.nanmax(g.values) if g.size else np.nan
        else:
            group_min = group_max = np.nan
        
        # Get USL, Target, LSL, TOL+, and TOL- for this level
        lvl_meta = df_meta[df_meta["main_level"] == main_level]
        usl = self.to_num_series(lvl_meta.get("usl", pd.Series([np.nan]))).max(skipna=True) if add_usl else np.nan
        target = self.to_num_series(lvl_meta.get("target", pd.Series([np.nan]))).max(skipna=True) if add_target else np.nan
        lsl = self.to_num_series(lvl_meta.get("lsl", pd.Series([np.nan]))).min(skipna=True) if add_lsl else np.nan
        tol_upper = self.to_num_series(lvl_meta.get("tol_upper", pd.Series([np.nan]))).max(skipna=True) if add_tol_upper else np.nan
        tol_lower = self.to_num_series(lvl_meta.get("tol_lower", pd.Series([np.nan]))).min(skipna=True) if add_tol_lower else np.nan
        
        # Calculate final min/max including only enabled reference lines
        values_for_max = [group_max]
        values_for_min = [group_min]
        
        if add_usl and not np.isnan(usl):
            values_for_max.append(usl)
        if add_target and not np.isnan(target):
            values_for_max.append(target)
            values_for_min.append(target)
        if add_lsl and not np.isnan(lsl):
            values_for_min.append(lsl)
        if add_tol_upper and not np.isnan(tol_upper):
            values_for_max.append(tol_upper)
        if add_tol_lower and not np.isnan(tol_lower):
            values_for_min.append(tol_lower)
        
        final_max = np.nanmax(values_for_max) if values_for_max else group_max
        final_min = np.nanmin(values_for_min) if values_for_min else group_min
        
        # Handle edge cases
        if np.isnan(final_min) and np.isnan(final_max):
            final_min, final_max = 0.0, 1.0
        if np.isnan(final_min):
            final_min = final_max - 1.0
        if np.isnan(final_max):
            final_max = final_min + 1.0
        
        # Calculate span and margins (only use USL-LSL span if both are enabled)
        span_ref = (abs(usl - lsl) if (add_usl and add_lsl and not np.isnan(usl) and not np.isnan(lsl) and usl != lsl)
                   else abs(final_max - final_min))
        if not span_ref or np.isnan(span_ref):
            span_ref = 1.0
        
        margin = 0.1 * span_ref
        new_min, new_max = final_min - margin, final_max + margin
        if new_min > new_max:
            new_min, new_max = new_max, new_min
        
        # Calculate increment
        axis_span = new_max - new_min
        if axis_span <= 0 or np.isnan(axis_span):
            axis_span = 1.0
            new_max = new_min + axis_span
        
        inc = axis_span / 10.0
        if inc > 0:
            exp = int(np.floor(np.log10(inc)))
            base = inc / (10 ** exp)
            nice = 1 if base <= 1 else 2 if base <= 2 else 5 if base <= 5 else 10
            inc = nice * (10 ** exp)
        
        return {
            "min": float(new_min),
            "max": float(new_max),
            "inc": float(inc),
            "tick": 4,
            "y_vars": y_vars,
            "usl": float(usl) if not np.isnan(usl) else None,
            "lsl": float(lsl) if not np.isnan(lsl) else None
        }
    
    def calculate_boundaries_from_duckdb(self, df_meta: pd.DataFrame, duckdb_path: str, 
                                         table_name: str, fai_columns: List[str], 
                                         cat_var: str,
                                         add_usl: bool = True, add_target: bool = True, add_lsl: bool = True,
                                         add_tol_upper: bool = False, add_tol_lower: bool = False) -> Dict[str, Dict[str, Any]]:
        """
        Calculate boundaries for all main levels using all data from DuckDB
        
        Args:
            df_meta: Meta DataFrame
            duckdb_path: Path to DuckDB file
            table_name: Name of the table
            fai_columns: List of FAI columns
            cat_var: Categorical variable name
            add_usl: Whether to include USL in boundary calculation (default: True)
            add_target: Whether to include Target in boundary calculation (default: True)
            add_lsl: Whether to include LSL in boundary calculation (default: True)
            
        Returns:
            Dict with boundaries for each main level
        """
        import duckdb
        
        # Get unique main levels
        if "main_level" not in df_meta.columns:
            logger.warning("No 'main_level' column found in meta table")
            return {}
        
        main_levels = df_meta["main_level"].dropna().unique()
        boundaries = {}
        
        # Connect to DuckDB
        conn = duckdb.connect(str(duckdb_path), read_only=True)
        
        try:
            for main_level in main_levels:
                try:
                    # Get y variables for this main level
                    y_candidates = (df_meta.loc[df_meta["main_level"] == main_level, "test_name"]
                                   .dropna().astype(str).unique().tolist())
                    y_vars = [y for y in y_candidates if y in fai_columns]
                    
                    if not y_vars:
                        logger.warning(f"No y_vars found for level: {main_level}")
                        continue
                    
                    # Query min/max for all FAI columns from the entire table
                    # DuckDB approach: get min/max for each column, then find overall min/max
                    min_values = []
                    max_values = []
                    
                    for col in y_vars:
                        try:
                            # Get min and max for this column
                            col_query = f'SELECT MIN("{col}") as col_min, MAX("{col}") as col_max FROM {table_name} WHERE "{col}" IS NOT NULL'
                            col_result = conn.execute(col_query).fetchone()
                            if col_result and col_result[0] is not None and col_result[1] is not None:
                                min_values.append(float(col_result[0]))
                                max_values.append(float(col_result[1]))
                        except Exception as e:
                            logger.warning(f"Error getting min/max for column {col}: {str(e)}")
                            continue
                    
                    # Calculate overall min and max from all columns
                    if min_values:
                        group_min = min(min_values)
                        group_max = max(max_values)
                    else:
                        group_min = group_max = np.nan
                    
                    logger.info(f"Calculated min/max from all data for {main_level}: min={group_min}, max={group_max}")
                    
                    # Get USL, Target, LSL, TOL+, and TOL- for this level
                    lvl_meta = df_meta[df_meta["main_level"] == main_level]
                    usl = self.to_num_series(lvl_meta.get("usl", pd.Series([np.nan]))).max(skipna=True) if add_usl else np.nan
                    target = self.to_num_series(lvl_meta.get("target", pd.Series([np.nan]))).max(skipna=True) if add_target else np.nan
                    lsl = self.to_num_series(lvl_meta.get("lsl", pd.Series([np.nan]))).min(skipna=True) if add_lsl else np.nan
                    tol_upper = self.to_num_series(lvl_meta.get("tol_upper", pd.Series([np.nan]))).max(skipna=True) if add_tol_upper else np.nan
                    tol_lower = self.to_num_series(lvl_meta.get("tol_lower", pd.Series([np.nan]))).min(skipna=True) if add_tol_lower else np.nan
                    
                    # Calculate final min/max including only enabled reference lines
                    values_for_max = [group_max]
                    values_for_min = [group_min]
                    
                    if add_usl and not np.isnan(usl):
                        values_for_max.append(usl)
                    if add_target and not np.isnan(target):
                        values_for_max.append(target)
                        values_for_min.append(target)
                    if add_lsl and not np.isnan(lsl):
                        values_for_min.append(lsl)
                    if add_tol_upper and not np.isnan(tol_upper):
                        values_for_max.append(tol_upper)
                    if add_tol_lower and not np.isnan(tol_lower):
                        values_for_min.append(tol_lower)
                    
                    final_max = np.nanmax(values_for_max) if values_for_max else group_max
                    final_min = np.nanmin(values_for_min) if values_for_min else group_min
                    
                    # Handle edge cases
                    if np.isnan(final_min) and np.isnan(final_max):
                        final_min, final_max = 0.0, 1.0
                    if np.isnan(final_min):
                        final_min = final_max - 1.0
                    if np.isnan(final_max):
                        final_max = final_min + 1.0
                    
                    # Calculate span and margins (only use USL-LSL span if both are enabled)
                    span_ref = (abs(usl - lsl) if (add_usl and add_lsl and not np.isnan(usl) and not np.isnan(lsl) and usl != lsl)
                               else abs(final_max - final_min))
                    if not span_ref or np.isnan(span_ref):
                        span_ref = 1.0
                    
                    margin = 0.1 * span_ref
                    new_min, new_max = final_min - margin, final_max + margin
                    if new_min > new_max:
                        new_min, new_max = new_max, new_min
                    
                    # Calculate increment
                    axis_span = new_max - new_min
                    if axis_span <= 0 or np.isnan(axis_span):
                        axis_span = 1.0
                        new_max = new_min + axis_span
                    
                    inc = axis_span / 10.0
                    if inc > 0:
                        exp = int(np.floor(np.log10(inc)))
                        base = inc / (10 ** exp)
                        nice = 1 if base <= 1 else 2 if base <= 2 else 5 if base <= 5 else 10
                        inc = nice * (10 ** exp)
                    
                    params = {
                        "min": float(new_min),
                        "max": float(new_max),
                        "inc": float(inc),
                        "tick": 4,
                        "y_vars": y_vars,
                        "usl": float(usl) if not np.isnan(usl) else None,
                        "lsl": float(lsl) if not np.isnan(lsl) else None
                    }
                    
                    boundaries[str(main_level)] = params
                    logger.info(f"Calculated boundaries for {main_level} (from all data): {params}")
                    
                except Exception as e:
                    logger.error(f"Error calculating boundaries for {main_level}: {str(e)}")
                    boundaries[str(main_level)] = {
                        "min": 0.0,
                        "max": 1.0,
                        "inc": 0.1,
                        "tick": 4,
                        "y_vars": [],
                        "error": str(e)
                    }
        finally:
            conn.close()
        
        self.boundaries = boundaries
        return boundaries
    
    def calculate_boundaries(self, df_meta: pd.DataFrame, df_data: pd.DataFrame, 
                           fai_columns: List[str],
                           add_usl: bool = True, add_target: bool = True, add_lsl: bool = True,
                           add_tol_upper: bool = False, add_tol_lower: bool = False) -> Dict[str, Dict[str, Any]]:
        """
        Calculate boundaries for all main levels
        
        Args:
            df_meta: Meta DataFrame
            df_data: Data DataFrame (can be a sample for large datasets)
            fai_columns: List of FAI columns
            add_usl: Whether to include USL in boundary calculation (default: True)
            add_target: Whether to include Target in boundary calculation (default: True)
            add_lsl: Whether to include LSL in boundary calculation (default: True)
            
        Returns:
            Dict with boundaries for each main level
        """
        # Convert data to numeric
        df_data_num = self.convert_to_numeric(df_data, fai_columns)
        
        # Get unique main levels
        if "main_level" not in df_meta.columns:
            logger.warning("No 'main_level' column found in meta table")
            return {}
        
        main_levels = df_meta["main_level"].dropna().unique()
        boundaries = {}
        
        for main_level in main_levels:
            try:
                params = self.compute_axis_params(df_meta, df_data_num, fai_columns, str(main_level),
                                                add_usl=add_usl, add_target=add_target, add_lsl=add_lsl,
                                                add_tol_upper=add_tol_upper, add_tol_lower=add_tol_lower)
                boundaries[str(main_level)] = params
                logger.info(f"Calculated boundaries for {main_level}: {params}")
            except Exception as e:
                logger.error(f"Error calculating boundaries for {main_level}: {str(e)}")
                boundaries[str(main_level)] = {
                    "min": 0.0,
                    "max": 1.0,
                    "inc": 0.1,
                    "tick": 4,
                    "y_vars": [],
                    "error": str(e)
                }
        
        self.boundaries = boundaries
        return boundaries
    
    def prepare_metadata(self, df_meta: pd.DataFrame) -> pd.DataFrame:
        """
        Prepare and clean metadata
        
        Args:
            df_meta: Raw meta DataFrame
            
        Returns:
            Cleaned meta DataFrame
        """
        meta_clean = df_meta.copy()
        
        # Format numeric columns
        numeric_columns = ["target", "usl", "lsl"]
        for col in numeric_columns:
            if col in meta_clean.columns:
                meta_clean[col] = meta_clean[col].apply(self.format_excel_number)
        
        # Ensure required columns exist
        for col in ["test_name", "main_level"]:
            if col not in meta_clean.columns:
                meta_clean[col] = ""
        
        self.metadata = meta_clean
        return meta_clean
    
    def process_data(self, df_meta: pd.DataFrame, df_data: pd.DataFrame, 
                    fai_columns: List[str], cat_var: str,
                    duckdb_path: Optional[str] = None,
                    table_name: Optional[str] = None,
                    add_usl: bool = True, add_target: bool = True, add_lsl: bool = True,
                    add_tol_upper: bool = False, add_tol_lower: bool = False) -> Dict[str, Any]:
        """
        Process data for analysis
        
        Args:
            df_meta: Meta DataFrame
            df_data: Data DataFrame (can be a sample for large datasets)
            fai_columns: List of FAI columns
            cat_var: Categorical variable
            duckdb_path: Optional path to DuckDB file (for large datasets)
            table_name: Optional table name (for large datasets)
            add_usl: Whether to include USL in boundary calculation (default: True)
            add_target: Whether to include Target in boundary calculation (default: True)
            add_lsl: Whether to include LSL in boundary calculation (default: True)
            
        Returns:
            Dict with processing results
        """
        try:
            # Prepare metadata
            meta_clean = self.prepare_metadata(df_meta)
            
            # Calculate boundaries (using sample data if provided, or all data from DuckDB)
            if duckdb_path and table_name:
                # For large datasets, calculate boundaries from all data in DuckDB
                boundaries = self.calculate_boundaries_from_duckdb(
                    meta_clean, duckdb_path, table_name, fai_columns, cat_var,
                    add_usl=add_usl, add_target=add_target, add_lsl=add_lsl,
                    add_tol_upper=add_tol_upper, add_tol_lower=add_tol_lower
                )
            else:
                # For small datasets, use the loaded data
                boundaries = self.calculate_boundaries(meta_clean, df_data, fai_columns,
                                                       add_usl=add_usl, add_target=add_target, add_lsl=add_lsl,
                                                       add_tol_upper=add_tol_upper, add_tol_lower=add_tol_lower)
            
            # Note: For large datasets, we don't store all processed data in memory
            # The file processor will handle chunked processing
            
            return {
                "success": True,
                "message": "Data processing completed",
                "details": {
                    "data_shape": df_data.shape,
                    "boundaries_calculated": len(boundaries),
                    "fai_columns": fai_columns,
                    "categorical_variable": cat_var
                },
                "boundaries": boundaries
            }
            
        except Exception as e:
            logger.error(f"Error processing data: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }
    
    def get_boundary_summary(self) -> Dict[str, Any]:
        """Get summary of calculated boundaries"""
        if not self.boundaries:
            return {"message": "No boundaries calculated"}
        
        summary = {}
        for level, params in self.boundaries.items():
            summary[level] = {
                "min": params.get("min"),
                "max": params.get("max"),
                "inc": params.get("inc"),
                "y_vars_count": len(params.get("y_vars", [])),
                "has_usl": params.get("usl") is not None,
                "has_lsl": params.get("lsl") is not None
            }
        
        return {
            "total_levels": len(self.boundaries),
            "boundaries": summary
        }

