import pandas as pd
import numpy as np
from typing import Dict, Any, List
from ..base.analyzer import BaseAnalyzer


class BoxplotAnalyzer(BaseAnalyzer):
    """Boxplot-specific analyzer (V2)"""

    def get_analysis_type(self) -> str:
        return "boxplot"

    def get_supported_charts(self) -> List[str]:
        return [
            'single_boxplot',
            'grouped_boxplot',
            'side_by_side_boxplot',
            'boxplot_with_outliers',
            'boxplot_with_statistics'
        ]

    def get_required_columns(self) -> Dict[str, List[str]]:
        return {
            'single_boxplot': ['value'],
            'grouped_boxplot': ['value', 'group'],
            'side_by_side_boxplot': ['value', 'group1', 'group2'],
            'boxplot_with_outliers': ['value'],
            'boxplot_with_statistics': ['value']
        }

    def validate_data(self, df: pd.DataFrame, chart_type: str) -> Dict[str, Any]:
        required = self.required_columns.get(chart_type, [])
        missing = [col for col in required if col not in df.columns]
        if missing:
            return {
                'valid': False,
                'missing_columns': missing,
                'message': f"Missing required columns: {', '.join(missing)}"
            }
        numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
        if not numeric_cols:
            return {'valid': False, 'message': "No numeric columns found for boxplot analysis"}
        return {'valid': True, 'numeric_columns': numeric_cols, 'message': "Data is valid for boxplot analysis"}

    def preprocess_data(self, df: pd.DataFrame, chart_type: str) -> pd.DataFrame:
        required = self.required_columns.get(chart_type, [])
        df_clean = df.dropna(subset=required)
        numeric_cols = df_clean.select_dtypes(include=[np.number]).columns
        for col in numeric_cols:
            df_clean[col] = pd.to_numeric(df_clean[col], errors='coerce')
        return df_clean.dropna()


