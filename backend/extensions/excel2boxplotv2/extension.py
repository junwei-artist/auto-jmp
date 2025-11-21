from ..base.extension import BaseExtension
from typing import List, Dict, Any


class Excel2BoxplotV2Extension(BaseExtension):
    """Excel to Boxplot V2 analysis extension"""

    def __init__(self):
        super().__init__()

    def get_name(self) -> str:
        return "excel2boxplotv2"

    def get_version(self) -> str:
        return "1.0.0"

    def get_description(self) -> str:
        return "Excel to Boxplot (V2) with alternate column naming"

    def get_supported_formats(self) -> List[str]:
        return ['.xlsx', '.xls', '.xlsm']

    def get_api_routes(self) -> List[Dict[str, Any]]:
        return [
            {
                'router': 'excel2boxplotv2_router',
                'prefix': '/excel2boxplotv2',
                'tags': ['excel2boxplotv2']
            }
        ]

    def get_celery_tasks(self) -> List[Dict[str, Any]]:
        return []

    def get_dependencies(self) -> List[str]:
        return [
            'pandas==2.1.4',
            'openpyxl==3.1.2',
            'xlrd==2.0.1',
            'scipy==1.11.4'
        ]

    def initialize(self) -> bool:
        try:
            import pandas  # noqa: F401
            import openpyxl  # noqa: F401
            return True
        except ImportError:
            return False


