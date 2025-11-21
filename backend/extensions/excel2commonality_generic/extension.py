from ..base.extension import BaseExtension
from .analyzer import CommonalityGenericAnalyzer
from typing import List, Dict, Any

class Excel2CommonalityGenericExtension(BaseExtension):
    """Excel to Commonality-Generic analysis extension"""
    
    def __init__(self):
        super().__init__()
        self.analyzer = CommonalityGenericAnalyzer()
    
    def get_name(self) -> str:
        return "excel2commonality-generic"
    
    def get_version(self) -> str:
        return "1.0.0"
    
    def get_description(self) -> str:
        return "Excel to Commonality analysis with user-selected categorical variables"
    
    def get_supported_formats(self) -> List[str]:
        return ['.xlsx', '.xls', '.xlsm', '.xlsb']
    
    def get_api_routes(self) -> List[Dict[str, Any]]:
        return [
            {
                'router': 'excel2commonality_generic_router',
                'prefix': '/excel2commonality-generic',
                'tags': ['excel2commonality-generic']
            }
        ]
    
    def get_celery_tasks(self) -> List[Dict[str, Any]]:
        return [
            {
                'name': 'run_excel_commonality_generic_analysis',
                'function': 'run_excel_commonality_generic_analysis'
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