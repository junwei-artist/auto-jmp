from ..base.extension import BaseExtension
from .analyzer import CommonalityAnalyzer
from typing import List, Dict, Any

class Excel2CommonalityExtension(BaseExtension):
    """Excel to Commonality analysis extension"""
    
    def __init__(self):
        super().__init__()
        self.analyzer = CommonalityAnalyzer()
    
    def get_name(self) -> str:
        return "excel2commonality"
    
    def get_version(self) -> str:
        return "1.0.0"
    
    def get_description(self) -> str:
        return "Excel to Commonality analysis with multi-variable visualization"
    
    def get_supported_formats(self) -> List[str]:
        return ['.xlsx', '.xls', '.xlsm', '.xlsb']
    
    def get_api_routes(self) -> List[Dict[str, Any]]:
        return [
            {
                'router': 'excel2commonality_router',
                'prefix': '/excel2commonality',
                'tags': ['excel2commonality']
            }
        ]
    
    def get_celery_tasks(self) -> List[Dict[str, Any]]:
        return [
            {
                'name': 'run_excel_commonality_analysis',
                'function': 'run_excel_commonality_analysis'
            }
        ]
    
    def get_dependencies(self) -> List[str]:
        return [
            'pandas==2.1.4',
            'openpyxl==3.1.2',
            'xlrd==2.0.1',
            'pyxlsb==1.0.10'
        ]
    
    def initialize(self) -> bool:
        """Initialize Excel extension"""
        try:
            import pandas
            import openpyxl
            return True
        except ImportError:
            return False
