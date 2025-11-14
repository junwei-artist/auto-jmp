"""
Data Process Module for Excel2JMP Module

Converts numeric data, computes plotting boundaries, and prepares clean metadata.
Handles data transformation and boundary calculations.
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
        Format Excel numbers to preserve their original precision and avoid floating-point artifacts.
        This function tries to maintain the exact representation as it appears in Excel.
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
            # Convert to string and back to avoid floating-point artifacts
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
                          fai_cols: List[str], main_level: str) -> Dict[str, Any]:
        """
        Compute axis parameters for plotting
        
        Args:
            df_meta: Meta DataFrame
            df_data_num: Numeric data DataFrame
            fai_cols: List of FAI columns
            main_level: Main level to compute parameters for
            
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
        
        # Get USL and LSL for this level
        lvl_meta = df_meta[df_meta["main_level"] == main_level]
        usl = self.to_num_series(lvl_meta.get("usl", pd.Series([np.nan]))).max(skipna=True)
        lsl = self.to_num_series(lvl_meta.get("lsl", pd.Series([np.nan]))).min(skipna=True)
        
        # Calculate final min/max
        final_max = np.nanmax([group_max, usl]) if not np.isnan(usl) else group_max
        final_min = np.nanmin([group_min, lsl]) if not np.isnan(lsl) else group_min
        
        # Handle edge cases
        if np.isnan(final_min) and np.isnan(final_max):
            final_min, final_max = 0.0, 1.0
        if np.isnan(final_min):
            final_min = final_max - 1.0
        if np.isnan(final_max):
            final_max = final_min + 1.0
        
        # Calculate span and margins
        span_ref = (abs(usl - lsl) if (not np.isnan(usl) and not np.isnan(lsl) and usl != lsl)
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
    
    def calculate_boundaries(self, df_meta: pd.DataFrame, df_data: pd.DataFrame, 
                           fai_columns: List[str]) -> Dict[str, Dict[str, Any]]:
        """
        Calculate boundaries for all main levels
        
        Args:
            df_meta: Meta DataFrame
            df_data: Data DataFrame
            fai_columns: List of FAI columns
            
        Returns:
            Dict with boundaries for each main level
        """
        # Convert data to numeric
        df_data_num = self.convert_to_numeric(df_data, fai_columns)
        
        # Get unique main levels
        if "main_level" not in df_meta.columns:
            logger.warning("No 'main_level' column found in meta sheet")
            return {}
        
        main_levels = df_meta["main_level"].dropna().unique()
        boundaries = {}
        
        for main_level in main_levels:
            try:
                params = self.compute_axis_params(df_meta, df_data_num, fai_columns, str(main_level))
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
                    fai_columns: List[str], cat_var: str) -> Dict[str, Any]:
        """
        Process data for analysis
        
        Args:
            df_meta: Meta DataFrame
            df_data: Data DataFrame
            fai_columns: List of FAI columns
            cat_var: Categorical variable
            
        Returns:
            Dict with processing results
        """
        try:
            # Prepare metadata
            meta_clean = self.prepare_metadata(df_meta)
            
            # Calculate boundaries
            boundaries = self.calculate_boundaries(meta_clean, df_data, fai_columns)
            
            # Prepare data for CSV generation
            df_processed = df_data[[cat_var] + fai_columns].copy()
            
            # Convert FAI columns to numeric
            df_processed = self.convert_to_numeric(df_processed, fai_columns)
            
            self.processed_data = df_processed
            
            return {
                "success": True,
                "message": "Data processing completed",
                "details": {
                    "processed_shape": df_processed.shape,
                    "boundaries_calculated": len(boundaries),
                    "fai_columns": fai_columns,
                    "categorical_variable": cat_var
                },
                "boundaries": boundaries,
                "processed_data": df_processed
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
