# Register all modules
from app.workspaces.modules.excel_loader.module import ExcelLoaderNode
from app.workspaces.modules.duckdb_convert.module import DuckDBConvertNode
from app.workspaces.modules.boxplot_stats.module import BoxplotStatsNode
from app.workspaces.modules.excel_to_numeric.module import ExcelToNumericNode
from app.workspaces.modules.file_uploader.module import FileUploaderNode
from app.workspaces.modules.excel_viewer.module import ExcelViewerNode
from app.workspaces.modules.outlier_remover.module import OutlierRemoverNode
from app.workspaces.modules.excel2jmp.module import Excel2JMPNode
from app.workspaces.engine.registry import registry

# Register modules
registry.register(ExcelLoaderNode)
registry.register(DuckDBConvertNode)
registry.register(BoxplotStatsNode)
registry.register(ExcelToNumericNode)
registry.register(FileUploaderNode)
registry.register(ExcelViewerNode)
registry.register(OutlierRemoverNode)
registry.register(Excel2JMPNode)

