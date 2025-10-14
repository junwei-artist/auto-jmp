from ..base.extension import BaseExtension
from .analyzer import BoxplotAnalyzer
from typing import List, Dict, Any

class Excel2BoxplotV1Extension(BaseExtension):
    """Excel to Boxplot analysis extension"""
    
    def __init__(self):
        super().__init__()
        self.analyzer = BoxplotAnalyzer()
    
    def get_name(self) -> str:
        return "excel2boxplotv1"
    
    def get_version(self) -> str:
        return "1.0.0"
    
    def get_description(self) -> str:
        return "Excel to Boxplot analysis with statistical insights"
    
    def get_supported_formats(self) -> List[str]:
        return ['.xlsx', '.xls', '.xlsm']
    
    def get_api_routes(self) -> List[Dict[str, Any]]:
        return [
            {
                'router': 'excel2boxplotv1_router',
                'prefix': '/excel2boxplotv1',
                'tags': ['excel2boxplotv1']
            }
        ]
    
    def get_celery_tasks(self) -> List[Dict[str, Any]]:
        return [
            {
                'name': 'run_excel_boxplot_analysis',
                'function': 'run_excel_boxplot_analysis'
            }
        ]
    
    def get_dependencies(self) -> List[str]:
        return [
            'pandas==2.1.4',
            'openpyxl==3.1.2',
            'xlrd==2.0.1',
            'scipy==1.11.4'
        ]
    
    def initialize(self) -> bool:
        """Initialize Excel extension"""
        try:
            import pandas
            import openpyxl
            return True
        except ImportError:
            return False
