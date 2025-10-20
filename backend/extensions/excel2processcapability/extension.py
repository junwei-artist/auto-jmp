from ..base.extension import BaseExtension
from .analyzer import ProcessCapabilityAnalyzer
from typing import List, Dict, Any

class Excel2ProcessCapabilityExtension(BaseExtension):
    """Excel to Process Capability analysis extension"""
    
    def __init__(self, language: str = 'en'):
        super().__init__()
        self.analyzer = ProcessCapabilityAnalyzer(language=language)
        self.language = language
    
    def get_name(self) -> str:
        return "excel2processcapability"
    
    def get_version(self) -> str:
        return "1.0.0"
    
    def get_description(self) -> str:
        return "Excel to Process Capability analysis (Cp, Cpk, Pp, Ppk)"
    
    def get_chinese_description(self) -> str:
        return "将Excel数据转换为过程能力分析（Cp、Cpk、Pp、Ppk）"
    
    def get_supported_formats(self) -> List[str]:
        return ['.xlsx', '.xls', '.xlsm']
    
    def get_api_routes(self) -> List[Dict[str, Any]]:
        return [
            {
                'router': 'excel2processcapability_router',
                'prefix': '/excel2processcapability',
                'tags': ['excel2processcapability']
            }
        ]
    
    def get_celery_tasks(self) -> List[Dict[str, Any]]:
        return [
            {
                'name': 'run_excel_process_capability_analysis',
                'function': 'run_excel_process_capability_analysis'
            }
        ]
    
    def get_dependencies(self) -> List[str]:
        return [
            'pandas==2.1.4',
            'openpyxl==3.1.2',
            'xlrd==2.0.1',
            'scipy==1.11.4',
            'statsmodels==0.14.0'
        ]
    
    def initialize(self) -> bool:
        """Initialize Excel extension"""
        try:
            import pandas
            import openpyxl
            return True
        except ImportError:
            return False
