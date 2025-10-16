"""
CPK Analyzer Module for Excel2CPKV1 Plugin

Implements process capability analysis based on the cpk.py logic.
Handles Excel validation, normalization, and JSL generation for CPK analysis.
"""

import pandas as pd
import numpy as np
import re
from datetime import datetime
from typing import Dict, List, Any, Tuple, Optional
import logging

logger = logging.getLogger(__name__)

class CPKAnalyzer:
    """Analyzer for CPK (Process Capability) analysis"""
    
    def __init__(self):
        self.required_spec_columns = ["test_name", "usl", "lsl", "target"]
        self.required_data_sheets = ["data"]
        self.required_spec_sheets = ["spec", "meta"]  # Either spec or meta is required
    
    def ts(self) -> str:
        """Timestamp formatted as yyyymmddhhmmss."""
        return datetime.now().strftime("%Y%m%d%H%M%S")
    
    def load_excel(self, excel_path: str) -> Tuple[pd.DataFrame, pd.DataFrame, str]:
        """
        Load Excel and return (spec_df, data_df, route_used).
        - If 'spec' exists: use it
        - Else if 'meta' exists: use it (will be normalized)
        - Else: error
        """
        try:
            xls = pd.ExcelFile(excel_path)
        except Exception as e:
            raise RuntimeError(f"Failed to read Excel: {e}")

        sheets = {s.lower(): s for s in xls.sheet_names}  # map lowercase->actual

        if "data" not in sheets:
            raise ValueError("Missing required sheet: 'data'")

        route = None
        if "spec" in sheets:
            spec_df = pd.read_excel(excel_path, sheet_name=sheets["spec"])
            route = "spec"
        elif "meta" in sheets:
            spec_df = pd.read_excel(excel_path, sheet_name=sheets["meta"])
            route = "meta"
        else:
            raise ValueError("Missing spec/meta: Need either 'spec' or 'meta' sheet")

        data_df = pd.read_excel(excel_path, sheet_name=sheets["data"])
        return spec_df, data_df, route
    
    def normalize_spec_columns(self, spec_df: pd.DataFrame, route: str) -> pd.DataFrame:
        """
        Normalize columns to: test_name, usl, lsl, target
        - For route 'meta' map: 'Y Variable'→test_name, 'USL'→usl, 'LSL'→lsl, 'Target'→target
        - For route 'spec' accept lowercase aliases if present
        """
        df = spec_df.copy()
        # Standardize: strip spaces, lower-case column names
        original_cols = df.columns.tolist()
        lower_map = {c: c.strip().lower() for c in original_cols}
        df.columns = [lower_map[c] for c in original_cols]

        # Accepted aliases
        name_aliases = ["test_name", "y variable", "y_variable", "yvariable"]
        usl_aliases = ["usl"]
        lsl_aliases = ["lsl"]
        target_aliases = ["target"]

        def pick(colnames: List[str], aliases: List[str]) -> str:
            for a in aliases:
                if a in colnames:
                    return a
            return ""

        # Determine source columns
        cols = set(df.columns)
        name_col = pick(list(cols), name_aliases)
        usl_col = pick(list(cols), usl_aliases)
        lsl_col = pick(list(cols), lsl_aliases)
        target_col = pick(list(cols), target_aliases)

        # Create normalized columns (even if missing, fill with NaN)
        out = pd.DataFrame()
        if name_col:
            out["test_name"] = df[name_col]
        else:
            out["test_name"] = np.nan

        if usl_col:
            out["usl"] = df[usl_col]
        else:
            out["usl"] = np.nan

        if lsl_col:
            out["lsl"] = df[lsl_col]
        else:
            out["lsl"] = np.nan

        if target_col:
            out["target"] = df[target_col]
        else:
            out["target"] = np.nan

        # Preserve any other columns (optional; comment out if not needed)
        for c in df.columns:
            if c not in [name_col, usl_col, lsl_col, target_col]:
                out[c] = df[c]

        return out
    
    def coerce_numeric(self, series: pd.Series) -> pd.Series:
        """Convert to numeric; non-convertible → NaN."""
        return pd.to_numeric(series, errors="coerce")
    
    def validate_spec(self, spec_df: pd.DataFrame) -> Dict[str, pd.DataFrame]:
        """
        Run validation rules and return dict of result DataFrames:
        - 'Required Columns'
        - 'Row Errors'
        - 'Row Warnings'
        """
        results: Dict[str, pd.DataFrame] = {}

        required = ["test_name", "usl", "lsl", "target"]
        missing = [c for c in required if c not in spec_df.columns]
        if missing:
            results["Error_Missing Columns"] = pd.DataFrame({"missing_column": missing})
            # Even if missing, continue to produce as much info as possible
            for c in required:
                if c not in spec_df.columns:
                    spec_df[c] = np.nan
        else:
            results["Validation_Required Columns"] = pd.DataFrame(
                {"column": required, "status": ["OK"] * len(required)}
            )

        # Coerce numeric for validation
        usl_num = self.coerce_numeric(spec_df["usl"])
        lsl_num = self.coerce_numeric(spec_df["lsl"])
        tgt_num = self.coerce_numeric(spec_df["target"])
        name_series = spec_df["test_name"].astype(str).str.strip()

        row_errors = []
        row_warnings = []

        name_pattern = re.compile(r"^[A-Za-z0-9_]+$")

        for idx, (name, usl, lsl, tgt) in enumerate(zip(name_series, usl_num, lsl_num, tgt_num)):
            # Skip fully empty rows (name and limits absent)
            if (name == "" or name.lower() == "nan") and pd.isna(usl) and pd.isna(lsl) and pd.isna(tgt):
                continue

            # Name format
            if not (isinstance(name, str) and name_pattern.match(name)):
                row_errors.append(
                    {"row": idx + 2, "issue": "Invalid test_name format", "test_name": name}
                )

            # At least one limit present
            if pd.isna(usl) and pd.isna(lsl):
                row_errors.append(
                    {"row": idx + 2, "issue": "Both usl and lsl are empty", "test_name": name}
                )

            # USL != LSL (only if both present)
            if not pd.isna(usl) and not pd.isna(lsl) and float(usl) == float(lsl):
                row_errors.append(
                    {"row": idx + 2, "issue": "usl equals lsl", "test_name": name, "usl": usl, "lsl": lsl}
                )

            # Target conflicts (warning only)
            if not pd.isna(tgt) and not pd.isna(usl) and float(tgt) == float(usl):
                row_warnings.append(
                    {"row": idx + 2, "issue": "target equals usl", "test_name": name, "target": tgt, "usl": usl}
                )
            if not pd.isna(tgt) and not pd.isna(lsl) and float(tgt) == float(lsl):
                row_warnings.append(
                    {"row": idx + 2, "issue": "target equals lsl", "test_name": name, "target": tgt, "lsl": lsl}
                )

        if row_errors:
            results["Error_Row Checks"] = pd.DataFrame(row_errors)
        else:
            results["Validation_Row Checks"] = pd.DataFrame([{"status": "All rows valid"}])

        if row_warnings:
            results["Warning_Row Checks"] = pd.DataFrame(row_warnings)
        else:
            results["Validation_No Warnings"] = pd.DataFrame([{"status": "No warnings"}])

        return results
    
    def find_fai_columns(self, data_df: pd.DataFrame) -> List[str]:
        """Return all column names containing 'FAI' (case-sensitive to match JMP naming style)."""
        return [c for c in data_df.columns if "FAI" in str(c)]
    
    def match_spec_to_data(self, spec_df: pd.DataFrame, fai_cols: List[str]) -> Tuple[pd.DataFrame, pd.DataFrame]:
        """Split spec into matched vs missing (by test_name ∈ fai_cols)."""
        names = spec_df["test_name"].astype(str).str.strip()
        matched_mask = names.isin(fai_cols)
        matched = spec_df.loc[matched_mask].copy()
        missing = spec_df.loc[~matched_mask, ["test_name"]].copy()
        missing.rename(columns={"test_name": "missing_in_data"}, inplace=True)
        return matched, missing
    
    def make_jsl_block(self, test_name: str, usl: float, lsl: float, target: float, imgdir: str) -> str:
        """
        Construct a JSL block for one variable, including only present spec entries.
        """
        entries = []
        if not pd.isna(lsl):
            entries.append(f"LSL({lsl})")
        if not pd.isna(usl):
            entries.append(f"USL({usl})")
        if not pd.isna(target):
            entries.append(f"Target({target})")

        spec_line = ", ".join(entries)

        # Guarantee trailing slash on imgdir
        if imgdir and not imgdir.endswith("/"):
            imgdir += "/"

        return f"""// Start for {test_name}
Column("{test_name}") << Set Property(
    "Spec Limits",
    {{{spec_line}}}
);
gb = Process Capability(
    Process Variables( :{test_name} ),
    Moving Range Method( Average of Moving Ranges ),
    Individual Detail Reports( 1 ),
    Capability Box Plots( 0 ),
    Goal Plot( 0 ),
    Capability Index Plot( 0 ),
    Process Performance Plot( 0 )
);
Wait(0.5);
If( Is Scriptable( gb ),
    gb << Set Control Panel( 0 );
    Wait( 0.3 );
    gb << Save Picture( "{imgdir}{test_name}_spec.png", png );
    gb << Close Window;
);
// End for {test_name}
"""
    
    def generate_jsl(self, matched_spec: pd.DataFrame, imgdir: str) -> str:
        """
        Build the full JSL content by concatenating blocks for rows that have at least one limit.
        """
        blocks = []
        # Ensure numeric for limits
        usl_num = self.coerce_numeric(matched_spec["usl"])
        lsl_num = self.coerce_numeric(matched_spec["lsl"])
        tgt_num = self.coerce_numeric(matched_spec["target"])
        names = matched_spec["test_name"].astype(str).str.strip()

        for name, usl, lsl, tgt in zip(names, usl_num, lsl_num, tgt_num):
            # Skip if both limits missing
            if pd.isna(usl) and pd.isna(lsl):
                continue
            blocks.append(self.make_jsl_block(name, usl, lsl, tgt, imgdir))

        return "\n\n".join(blocks)
    
    def analyze_excel_file(self, file_path: str, imgdir: str = "/tmp/") -> Dict[str, Any]:
        """
        Main analysis function that processes Excel file and generates CSV + JSL
        
        Args:
            file_path: Path to Excel file
            imgdir: Directory for saving images (used in JSL)
            
        Returns:
            Dict with analysis results
        """
        try:
            # 1) Load sheets and detect route
            spec_raw, data_df, route = self.load_excel(file_path)

            # 2) Normalize columns to (test_name, usl, lsl, target)
            spec_norm = self.normalize_spec_columns(spec_raw, route=route)

            # 3) Validate spec logical rules
            validations = self.validate_spec(spec_norm)

            # 4) Find FAI columns from data and match test_name
            fai_cols = self.find_fai_columns(data_df)
            matched_spec, missing_in_data = self.match_spec_to_data(spec_norm, fai_cols)

            # 5) Generate outputs (CSV + JSL)
            timestamp = self.ts()
            csv_content = data_df.to_csv(index=False)
            jsl_content = self.generate_jsl(matched_spec, imgdir=imgdir)

            # Check for validation errors
            has_errors = any(k.startswith("Error_") for k in validations.keys())
            
            return {
                "success": True,
                "message": "CPK analysis completed successfully",
                "route_used": route,
                "fai_columns_found": len(fai_cols),
                "matched_spec_rows": len(matched_spec),
                "csv_content": csv_content,
                "jsl_content": jsl_content,
                "validations": validations,
                "missing_in_data": missing_in_data,
                "has_errors": has_errors,
                "timestamp": timestamp
            }
            
        except Exception as e:
            logger.error(f"CPK analysis failed: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "message": f"CPK analysis failed: {str(e)}"
            }
