"""
Meta Analyzer Module for Excel2Commonality-Generic Extensions
Enhanced version — supports "meta" sheet handling for FAI-based JSL generation with user-selected categorical columns.
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

    def analyze_with_meta_generic(self, file_path: str, data_sheet: str, engine: str, 
                                   categorical_columns: List[str]) -> Dict[str, Any]:
        """
        Process Excel file with meta sheet and generate JSL blocks with specifications.
        Uses user-selected categorical columns instead of hardcoded ones.
        
        Args:
            file_path: Path to Excel file
            data_sheet: Name of the data sheet
            engine: Pandas engine to use for reading Excel
            categorical_columns: List of user-selected categorical column names
            
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
            
            return self._process_with_meta_generic(categorical_columns)
            
        except Exception as e:
            logger.error(f"Error in analyze_with_meta_generic: {str(e)}")
            raise

    # ------------------------------------------------------------------
    def _process_with_meta_generic(self, categorical_columns: List[str]) -> Dict[str, Any]:
        """
        Generate JSL with limits and reference lines using meta specs.
        Uses user-selected categorical columns.
        
        Args:
            categorical_columns: List of user-selected categorical column names
        """
        df_data = self.data_df.copy()
        df_meta = self.meta_df.copy()
        fai_cols = [c for c in df_data.columns if "FAI" in str(c)]

        all_jsl_blocks = []
        df_meta[["data_min", "data_max", "final_min", "final_max"]] = np.nan

        # Generate X variables string from categorical columns
        x_vars = ",\n        ".join([f"X( :{col} )" for col in categorical_columns])
        num_positions = len(categorical_columns)

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

            # Generate Elements blocks for each categorical variable
            elements_blocks = []
            for pos_idx, cat_col in enumerate(categorical_columns, start=1):
                if pos_idx == 1:
                    # First position: just points
                    elements_blocks.append(f"""    Elements( Position( {pos_idx}, 1 ), Points( X, Y, Legend( 64 ) ) )""")
                elif pos_idx == num_positions:
                    # Last position: points, smoother, box plot, and caption boxes
                    elements_blocks.append(f"""    Elements(
        Position( {pos_idx}, 1 ),
        Points( X, Y, Legend( 61 ) ),
        Smoother( X, Y, Legend( 62 ) ),
        Box Plot( X, Y, Legend( 63 ) ),
        Caption Box( X, Y, Legend( 12 ), Summary Statistic( "Mean" ) ),
        Caption Box( X, Y, Legend( 12 ), Summary Statistic( "Min" ) ),
        Caption Box( X, Y, Legend( 12 ), Summary Statistic( "Median" ) ),
        Caption Box( X, Y, Legend( 12 ), Summary Statistic( "Max" ) ),
        Caption Box( X, Y, Legend( 13 ), Summary Statistic( "Std Dev" ) )
    )""")
                else:
                    # Middle positions: points, smoother, box plot
                    legend_base = 30 + (pos_idx - 1) * 5
                    elements_blocks.append(f"""    Elements(
        Position( {pos_idx}, 1 ),
        Points( X, Y, Legend( {legend_base + 2} ) ),
        Smoother( X, Y, Legend( {legend_base + 3} ) ),
        Box Plot( X, Y, Legend( {legend_base + 4} ) )
    )""")
            
            elements_str = ",\n".join(elements_blocks)

            # 4️⃣ JSL generation block
            jsl = f"""// Block for {fai}
gb = Graph Builder(
    Size( 1151, 832 ),
    Show Control Panel( 0 ),
    Variables(
        {x_vars},
        Y( :{fai} )
    ),
    {elements_str},
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
def generate_jsl_with_meta_generic(file_path: str, data_sheet: str, engine: str, 
                                   categorical_columns: List[str]) -> Dict[str, Any]:
    """
    Convenience function to generate JSL with meta specifications and user-selected categorical columns.
    
    Args:
        file_path: Path to Excel file
        data_sheet: Name of the data sheet
        engine: Pandas engine to use for reading Excel
        categorical_columns: List of user-selected categorical column names
        
    Returns:
        Dict with JSL content and metadata
    """
    analyzer = MetaAnalyzer()
    return analyzer.analyze_with_meta_generic(file_path, data_sheet, engine, categorical_columns)