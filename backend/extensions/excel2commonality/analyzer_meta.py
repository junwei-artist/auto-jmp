"""
Meta Analyzer Module for Excel2Commonality Extensions
Enhanced version — supports "meta" sheet handling for FAI-based JSL generation.
"""

import pandas as pd
import numpy as np
import os
from typing import Dict, List, Any
import logging

logger = logging.getLogger(__name__)


class MetaAnalyzer:
    """Analyze Excel files with meta sheet and generate JSL scripts with specifications"""

    def __init__(self):
        self.jsl_blocks: List[str] = []
        self.meta_df: pd.DataFrame | None = None
        self.data_df: pd.DataFrame | None = None

    def analyze_with_meta(self, file_path: str, data_sheet: str, engine: str) -> Dict[str, Any]:
        """
        Process Excel file with meta sheet and generate JSL blocks with specifications.
        
        Args:
            file_path: Path to Excel file
            data_sheet: Name of the data sheet
            engine: Pandas engine to use for reading Excel
            
        Returns:
            Dict with JSL content and metadata
        """
        try:
            # Load data sheet
            self.data_df = pd.read_excel(file_path, sheet_name=data_sheet, engine=engine)
            
            # Load meta sheet
            df_meta = pd.read_excel(file_path, sheet_name="meta", engine=engine)
            required_cols = {"test_name", "target", "usl", "lsl"}
            
            if not required_cols.issubset(df_meta.columns):
                raise ValueError(f"Meta sheet missing required columns: {required_cols}")
            
            self.meta_df = df_meta
            logger.info("Meta sheet detected. Running spec-aware logic.")
            
            return self._process_with_meta()
            
        except Exception as e:
            logger.error(f"Error in analyze_with_meta: {str(e)}")
            raise

    # ------------------------------------------------------------------
    def _process_with_meta(self) -> Dict[str, Any]:
        """
        Generate JSL with limits and reference lines using meta specs.
        """
        df_data = self.data_df.copy()
        df_meta = self.meta_df.copy()
        fai_cols = [c for c in df_data.columns if "FAI" in str(c)]

        all_jsl_blocks = []
        df_meta[["data_min", "data_max", "final_min", "final_max"]] = np.nan

        for fai in fai_cols:
            # Check if this FAI has meta specifications
            row = df_meta[df_meta["test_name"] == fai]
            has_meta_specs = not row.empty
            
            # Get data for scaling
            g = pd.to_numeric(df_data[fai], errors="coerce").dropna()
            if g.empty:
                continue

            # 1️⃣ Data range
            group_min = np.nanmin(g.values)
            group_max = np.nanmax(g.values)

            if has_meta_specs:
                try:
                    target = float(row["target"].values[0])
                    usl = float(row["usl"].values[0])
                    lsl = float(row["lsl"].values[0])
                    
                    # 2️⃣ Combine data/spec ranges
                    final_min = min(group_min, lsl)
                    final_max = max(group_max, usl)
                    
                    # 3️⃣ Add 10% margin
                    span_ref = abs(usl - lsl) if np.isfinite(usl) and np.isfinite(lsl) else abs(group_max - group_min)
                    if span_ref <= 0 or np.isnan(span_ref):
                        span_ref = 1.0
                    margin = 0.1 * span_ref
                    new_min = final_min - margin
                    new_max = final_max + margin
                    
                    # Update meta table
                    df_meta.loc[df_meta["test_name"] == fai, ["data_min", "data_max", "final_min", "final_max"]] = [
                        group_min, group_max, new_min, new_max
                    ]
                    
                    # Generate JSL with reference lines
                    ref_lines = f"""            Add Ref Line( {lsl:.4f}, "Solid", "Dark Blue", "LSL {lsl:.4f}", 1 ),
            Add Ref Line( {usl:.4f}, "Solid", "Dark Blue", "USL {usl:.4f}", 1 ),
            Add Ref Line( {target:.4f}, "Solid", "Dark Blue", "Target {target:.4f}", 1 )"""
                    
                except Exception:
                    # If meta parsing fails, treat as no meta specs
                    has_meta_specs = False
                    new_min = group_min - 0.1 * abs(group_max - group_min)
                    new_max = group_max + 0.1 * abs(group_max - group_min)
                    ref_lines = ""
            else:
                # No meta specs - use data range with margin
                margin = 0.1 * abs(group_max - group_min)
                new_min = group_min - margin
                new_max = group_max + margin
                ref_lines = ""

            # 4️⃣ JSL generation block
            jsl = f"""// Block for {fai}
gb = Graph Builder(
    Size( 1151, 832 ),
    Show Control Panel( 0 ),
    Variables(
        X( :测试时间 ),
        X( :EGL铆接治具号 ),
        X( :EGL焊接治具号 ),
        X( :镍片放料工位 ),
        X( :AFMT治具 ),
        Y( :{fai} )
    ),
    Elements( Position( 1, 1 ), Points( X, Y, Legend( 64 ) ) ),
    Elements(
        Position( 2, 1 ),
        Points( X, Y, Legend( 32 ) ),
        Smoother( X, Y, Legend( 33 ) ),
        Box Plot( X, Y, Legend( 34 ) )
    ),
    Elements(
        Position( 3, 1 ),
        Points( X, Y, Legend( 37 ) ),
        Smoother( X, Y, Legend( 38 ) ),
        Box Plot( X, Y, Legend( 39 ) )
    ),
    Elements(
        Position( 4, 1 ),
        Points( X, Y, Legend( 48 ) ),
        Smoother( X, Y, Legend( 49 ) ),
        Box Plot( X, Y, Legend( 50 ) )
    ),
    Elements(
        Position( 5, 1 ),
        Points( X, Y, Legend( 61 ) ),
        Smoother( X, Y, Legend( 62 ) ),
        Box Plot( X, Y, Legend( 63 ) ),
        Caption Box( X, Y, Legend( 12 ), Summary Statistic( "Mean" ) ),
        Caption Box( X, Y, Legend( 12 ), Summary Statistic( "Min" ) ),
        Caption Box( X, Y, Legend( 12 ), Summary Statistic( "Median" ) ),
        Caption Box( X, Y, Legend( 12 ), Summary Statistic( "Max" ) ),
        Caption Box( X, Y, Legend( 13 ), Summary Statistic( "Std Dev" ) )
    ),
    SendToReport(
        Dispatch(
            {{}}, "{fai}", ScaleBox,
            {{Format( "Fixed Dec", 12, 4 ),
            Min( {new_min:.4f} ), Max( {new_max:.4f} ){"," + ref_lines if ref_lines else ""}
            }}
        ),
    )
);
Wait(0.3);
If( Is Scriptable( gb ),
    gb << Set Control Panel( 0 );
    Wait( 0.2 );
    gb << Save Picture( "{fai}.png", PNG  );
    gb << Close Window;
);
"""
            all_jsl_blocks.append(jsl)

        # Return JSL content and metadata
        jsl_content = "\n\n".join(all_jsl_blocks)
        
        return {
            "jsl_content": jsl_content,
            "meta_df": df_meta,
            "fai_columns": fai_cols,
            "mode": "meta"
        }

# Convenience function for external use
def generate_jsl_with_meta(file_path: str, data_sheet: str, engine: str) -> Dict[str, Any]:
    """
    Convenience function to generate JSL with meta specifications.
    
    Args:
        file_path: Path to Excel file
        data_sheet: Name of the data sheet
        engine: Pandas engine to use for reading Excel
        
    Returns:
        Dict with JSL content and metadata
    """
    analyzer = MetaAnalyzer()
    return analyzer.analyze_with_meta(file_path, data_sheet, engine)
