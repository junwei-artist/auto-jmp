import pandas as pd
import numpy as np
from typing import Dict, Any, List
from ..base.analyzer import BaseAnalyzer

class BoxplotAnalyzer(BaseAnalyzer):
    """Boxplot-specific analyzer"""
    
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
        """Validate data for boxplot analysis"""
        required = self.required_columns.get(chart_type, [])
        missing = [col for col in required if col not in df.columns]
        
        if missing:
            return {
                'valid': False,
                'missing_columns': missing,
                'message': f"Missing required columns: {', '.join(missing)}"
            }
        
        # Check for numeric data
        numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
        if not numeric_cols:
            return {
                'valid': False,
                'message': "No numeric columns found for boxplot analysis"
            }
        
        return {
            'valid': True,
            'numeric_columns': numeric_cols,
            'message': "Data is valid for boxplot analysis"
        }
    
    def preprocess_data(self, df: pd.DataFrame, chart_type: str) -> pd.DataFrame:
        """Preprocess data for boxplot analysis"""
        # Remove rows with missing values in required columns
        required = self.required_columns.get(chart_type, [])
        df_clean = df.dropna(subset=required)
        
        # Convert numeric columns
        numeric_cols = df_clean.select_dtypes(include=[np.number]).columns
        for col in numeric_cols:
            df_clean[col] = pd.to_numeric(df_clean[col], errors='coerce')
        
        return df_clean.dropna()
    
    def generate_jsl_template(self, df: pd.DataFrame, chart_type: str) -> str:
        """Generate JSL template for boxplot"""
        template_path = Path(__file__).parent / 'templates' / f'{chart_type}.jsl'
        
        if not template_path.exists():
            # Fallback to basic boxplot template
            template_path = Path(__file__).parent / 'templates' / 'boxplot.jsl'
        
        with open(template_path, 'r') as f:
            template = f.read()
        
        # Replace placeholders
        numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
        template = template.replace('{{VALUE_COLUMN}}', numeric_cols[0])
        
        if 'group' in chart_type and len(df.columns) > 1:
            categorical_cols = df.select_dtypes(include=['object', 'category']).columns.tolist()
            if categorical_cols:
                template = template.replace('{{GROUP_COLUMN}}', categorical_cols[0])
        
        return template
    
    def _calculate_confidence(self, df: pd.DataFrame, chart_type: str) -> float:
        """Calculate confidence for boxplot suggestions"""
        numeric_cols = df.select_dtypes(include=[np.number]).columns
        categorical_cols = df.select_dtypes(include=['object', 'category']).columns
        
        if chart_type == 'single_boxplot':
            return 0.9 if len(numeric_cols) >= 1 else 0.0
        elif chart_type in ['grouped_boxplot', 'side_by_side_boxplot']:
            return 0.8 if len(numeric_cols) >= 1 and len(categorical_cols) >= 1 else 0.0
        else:
            return 0.7
