"""
File Handler for DuckDB2JMP Module

Handles DuckDB file loading and table exploration.
Each table in DuckDB is treated as a "sheet" (similar to Excel sheets).
Meta column names mapping:
  Y Variable -> test_name
  DETAIL -> description
  Target -> target
  USL -> usl
  LSL -> lsl
  Label -> main_level
Prefer 'Stage' as the categorical variable in data tables.
"""

import duckdb
import pandas as pd
from typing import Dict, List, Optional, Any
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

# Internal required columns after mapping
REQUIRED_COLUMNS = ["test_name", "description", "target", "usl", "lsl", "main_level"]

META_COLUMN_MAP = {
    "Y Variable": "test_name",
    "DETAIL": "description",
    "Target": "target",
    "USL": "usl",
    "LSL": "lsl",
    "TOL+": "tol_upper",
    "TOL-": "tol_lower",
    "Label": "main_level",
}


class FileHandler:
    """Handles DuckDB file loading and table exploration"""

    def __init__(self):
        self.duckdb_path: Optional[str] = None
        self.conn: Optional[duckdb.DuckDBPyConnection] = None
        self.tables: List[str] = []
        self.df_meta: Optional[pd.DataFrame] = None
        self.df_data_raw: Optional[pd.DataFrame] = None
        self.current_table: Optional[str] = None
        self.fai_columns: List[str] = []
        self.categorical_columns: List[str] = []
        self.selected_cat_var: Optional[str] = None

    def _rename_meta_columns(self, df_meta: pd.DataFrame) -> pd.DataFrame:
        renamed = df_meta.rename(columns=META_COLUMN_MAP)
        return renamed

    def load_duckdb_file(self, duckdb_path: str) -> Dict[str, Any]:
        """
        Load DuckDB file and list all tables
        
        Args:
            duckdb_path: Path to DuckDB file
            
        Returns:
            Dict with success status and table information
        """
        try:
            self.duckdb_path = duckdb_path
            
            # Connect to DuckDB (read-only for safety)
            self.conn = duckdb.connect(str(duckdb_path), read_only=True)
            
            # Get all tables
            tables_result = self.conn.execute("SHOW TABLES").fetchall()
            self.tables = [row[0] for row in tables_result if row]
            
            logger.info(f"Found tables: {self.tables}")
            
            if not self.tables:
                return {
                    "success": False,
                    "error": "No tables found in DuckDB file"
                }
            
            return {
                "success": True,
                "tables": self.tables,
                "table_count": len(self.tables)
            }
            
        except Exception as e:
            logger.error(f"Error loading DuckDB file: {str(e)}")
            return {"success": False, "error": str(e)}
        finally:
            if self.conn:
                self.conn.close()
                self.conn = None

    def load_table(self, table_name: str, chunk_size: Optional[int] = None) -> Dict[str, Any]:
        """
        Load a specific table from DuckDB
        
        Args:
            table_name: Name of the table to load
            chunk_size: Optional chunk size for large tables (None = load all)
            
        Returns:
            Dict with success status and table information
        """
        try:
            if not self.duckdb_path:
                return {"success": False, "error": "No DuckDB file loaded"}
            
            # Reconnect if needed
            if not self.conn:
                self.conn = duckdb.connect(str(self.duckdb_path), read_only=True)
            
            # Check if table exists
            if table_name not in self.tables:
                return {
                    "success": False,
                    "error": f"Table '{table_name}' not found",
                    "available_tables": self.tables
                }
            
            self.current_table = table_name
            
            # Get table info
            count_result = self.conn.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()
            row_count = count_result[0] if count_result else 0
            
            # Get column info
            columns_result = self.conn.execute(f"DESCRIBE {table_name}").fetchall()
            columns = [col[0] for col in columns_result]
            
            # Load data (with optional chunking)
            if chunk_size and row_count > chunk_size:
                # Load first chunk for analysis
                query = f"SELECT * FROM {table_name} LIMIT {chunk_size}"
                self.df_data_raw = self.conn.execute(query).df()
                logger.info(f"Loaded first chunk of {chunk_size} rows from {table_name}")
            else:
                # Load all data
                self.df_data_raw = self.conn.execute(f"SELECT * FROM {table_name}").df()
                logger.info(f"Loaded all {row_count} rows from {table_name}")
            
            # Analyze columns
            self._analyze_columns()
            
            return {
                "success": True,
                "table_name": table_name,
                "row_count": row_count,
                "columns": columns,
                "data_shape": self.df_data_raw.shape,
                "fai_columns": self.fai_columns,
                "categorical_columns": self.categorical_columns,
                "is_chunked": chunk_size is not None and row_count > chunk_size
            }
            
        except Exception as e:
            logger.error(f"Error loading table {table_name}: {str(e)}")
            return {"success": False, "error": str(e)}

    def load_meta_table(self, table_name: str) -> Dict[str, Any]:
        """
        Load meta table (expected to have meta columns)
        
        Args:
            table_name: Name of the meta table
            
        Returns:
            Dict with success status
        """
        try:
            if not self.duckdb_path:
                return {"success": False, "error": "No DuckDB file loaded"}
            
            # Reconnect if needed
            if not self.conn:
                self.conn = duckdb.connect(str(self.duckdb_path), read_only=True)
            
            # Load meta table
            raw_meta = self.conn.execute(f"SELECT * FROM {table_name}").df()
            self.df_meta = self._rename_meta_columns(raw_meta)
            
            # Attach original columns for validators
            try:
                self.df_meta.attrs["original_columns"] = list(raw_meta.columns)
            except Exception:
                pass
            
            logger.info(f"Meta table loaded: {self.df_meta.shape}")
            
            return {
                "success": True,
                "meta_shape": self.df_meta.shape,
                "meta_columns": self.df_meta.columns.tolist(),
                "missing_required_columns": self._get_missing_required_columns()
            }
            
        except Exception as e:
            logger.error(f"Error loading meta table: {str(e)}")
            return {"success": False, "error": str(e)}

    def _analyze_columns(self):
        """Analyze columns in the current data table"""
        if self.df_data_raw is None:
            return

        # FAI columns detection
        self.fai_columns = [
            col for col in self.df_data_raw.columns if "FAI" in str(col).upper()
        ]

        # Prefer 'Stage' as categorical if present (case-insensitive), else fallback to generic detection
        self.categorical_columns = []
        stage_column = None
        for col in self.df_data_raw.columns:
            if str(col).lower() == "stage":
                stage_column = col
                self.categorical_columns.append(col)
                break

        # Include other likely categorical columns (excluding FAI cols)
        for col in self.df_data_raw.columns:
            if col in self.fai_columns or (stage_column and col == stage_column):
                continue
            sample_values = self.df_data_raw[col].dropna().head(10)
            if len(sample_values) > 0:
                unique_ratio = len(sample_values.unique()) / len(sample_values)
                if unique_ratio < 0.8 or sample_values.dtype == "object":
                    self.categorical_columns.append(col)

        logger.info(f"FAI columns: {self.fai_columns}")
        logger.info(f"Categorical columns: {self.categorical_columns}")

    def _get_missing_required_columns(self) -> List[str]:
        if self.df_meta is None:
            return REQUIRED_COLUMNS
        return [col for col in REQUIRED_COLUMNS if col not in self.df_meta.columns]

    def set_categorical_variable(self, cat_var: str) -> Dict[str, Any]:
        if self.df_data_raw is None:
            return {"success": False, "error": "No data loaded"}

        # Case-insensitive lookup for categorical variable
        actual_cat_var = None
        for col in self.df_data_raw.columns:
            if str(col).lower() == cat_var.lower():
                actual_cat_var = col
                break
        
        if actual_cat_var is None:
            return {
                "success": False,
                "error": f"Column '{cat_var}' not found in data table (case-insensitive search)",
                "available_columns": self.df_data_raw.columns.tolist(),
            }

        self.selected_cat_var = actual_cat_var
        if not self.fai_columns:
            return {"success": False, "error": "No 'FAI' columns found in data table"}

        return {
            "success": True,
            "categorical_variable": actual_cat_var,
            "fai_columns": self.fai_columns,
            "data_shape": self.df_data_raw.shape,
        }

    def get_table_summary(self) -> Dict[str, Any]:
        """Get summary of current table"""
        if self.df_meta is None or self.df_data_raw is None:
            return {"error": "No table loaded"}

        return {
            "duckdb_path": self.duckdb_path,
            "current_table": self.current_table,
            "tables": self.tables,
            "meta_info": {
                "shape": self.df_meta.shape,
                "columns": self.df_meta.columns.tolist(),
                "missing_required": self._get_missing_required_columns(),
            },
            "data_info": {
                "shape": self.df_data_raw.shape,
                "columns": self.df_data_raw.columns.tolist(),
                "fai_columns": self.fai_columns,
                "categorical_columns": self.categorical_columns,
            },
            "selected_cat_var": self.selected_cat_var,
        }

    def get_table_chunk(self, table_name: str, limit: int, offset: int = 0) -> pd.DataFrame:
        """
        Get a chunk of data from a table (for large data processing)
        
        Args:
            table_name: Name of the table
            limit: Number of rows to fetch
            offset: Starting offset
            
        Returns:
            DataFrame with the chunk
        """
        if not self.conn:
            self.conn = duckdb.connect(str(self.duckdb_path), read_only=True)
        
        query = f"SELECT * FROM {table_name} LIMIT {limit} OFFSET {offset}"
        return self.conn.execute(query).df()

    def get_table_row_count(self, table_name: str) -> int:
        """Get total row count for a table"""
        if not self.conn:
            self.conn = duckdb.connect(str(self.duckdb_path), read_only=True)
        
        result = self.conn.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()
        return result[0] if result else 0

    def close(self):
        """Close DuckDB connection"""
        if self.conn:
            self.conn.close()
            self.conn = None

