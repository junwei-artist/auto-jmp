from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional
from pathlib import Path
import pandas as pd

class BaseAnalyzer(ABC):
    """Base class for analysis-specific processors"""
    
    def __init__(self):
        self.analysis_type = self.get_analysis_type()
        self.supported_charts = self.get_supported_charts()
        self.required_columns = self.get_required_columns()
    
    @abstractmethod
    def get_analysis_type(self) -> str:
        """Return analysis type identifier"""
        pass
    
    @abstractmethod
    def get_supported_charts(self) -> List[str]:
        """Return list of supported chart types"""
        pass
    
    @abstractmethod
    def get_required_columns(self) -> Dict[str, List[str]]:
        """Return required columns for each chart type"""
        pass
    
    @abstractmethod
    def validate_data(self, df: pd.DataFrame, chart_type: str) -> Dict[str, Any]:
        """Validate data for specific analysis"""
        pass
    
    @abstractmethod
    def preprocess_data(self, df: pd.DataFrame, chart_type: str) -> pd.DataFrame:
        """Preprocess data for analysis"""
        pass
    
    @abstractmethod
    def generate_jsl_template(self, df: pd.DataFrame, chart_type: str) -> str:
        """Generate JSL template for specific analysis"""
        pass
    
    def analyze_data_structure(self, df: pd.DataFrame) -> Dict[str, Any]:
        """Analyze data structure and suggest chart types"""
        suggestions = []
        
        for chart_type in self.supported_charts:
            required = self.required_columns.get(chart_type, [])
            if all(col in df.columns for col in required):
                suggestions.append({
                    'chart_type': chart_type,
                    'confidence': self._calculate_confidence(df, chart_type),
                    'missing_columns': []
                })
            else:
                missing = [col for col in required if col not in df.columns]
                suggestions.append({
                    'chart_type': chart_type,
                    'confidence': 0,
                    'missing_columns': missing
                })
        
        return {
            'analysis_type': self.analysis_type,
            'suggestions': suggestions,
            'data_info': {
                'rows': len(df),
                'columns': len(df.columns),
                'column_types': df.dtypes.to_dict()
            }
        }
    
    def _calculate_confidence(self, df: pd.DataFrame, chart_type: str) -> float:
        """Calculate confidence score for chart type suggestion"""
        # Override in subclasses for specific logic
        return 0.8
