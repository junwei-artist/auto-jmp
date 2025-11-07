# Register all modules
from app.workspaces.modules.excel_loader.module import ExcelLoaderNode
from app.workspaces.modules.duckdb_convert.module import DuckDBConvertNode
from app.workspaces.modules.boxplot_stats.module import BoxplotStatsNode
from app.workspaces.engine.registry import registry

# Register modules
registry.register(ExcelLoaderNode)
registry.register(DuckDBConvertNode)
registry.register(BoxplotStatsNode)

