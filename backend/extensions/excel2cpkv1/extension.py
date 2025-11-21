from ..base.extension import BaseExtension
from .analyzer import CPKAnalyzer
from typing import List, Dict, Any

class Excel2CPKV1Extension(BaseExtension):
    """Excel to CPK analysis extension"""
    
    def __init__(self):
        super().__init__()
        self.analyzer = CPKAnalyzer()
    
    def get_name(self) -> str:
        return "excel2cpkv1"
    
    def get_version(self) -> str:
        return "1.0.0"
    
    def get_description(self) -> str:
        return "Excel to CPK (Process Capability) analysis with statistical insights"
    
    def get_supported_formats(self) -> List[str]:
        return ['.xlsx', '.xls', '.xlsm']
    
    def get_api_routes(self) -> List[Dict[str, Any]]:
        return [
            {
                'router': 'excel2cpkv1_router',
                'prefix': '/excel2cpkv1',
                'tags': ['excel2cpkv1']
            }
        ]
    
    def get_celery_tasks(self) -> List[Dict[str, Any]]:
        return [
            {
                'name': 'run_excel_cpk_analysis',
                'function': 'run_excel_cpk_analysis'
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
