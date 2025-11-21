"""
File Handler for Excel2JMP Module

Handles Excel file loading and column exploration.
Meta column names mapping:
  Y Variable -> test_name
  DETAIL -> description
  Target -> target
  USL -> usl
  LSL -> lsl
  Label -> main_level
Prefer 'Stage' as the categorical variable in data sheet.
"""

import pandas as pd
from typing import Dict, List, Optional, Any
import logging
import zipfile
import xml.etree.ElementTree as ET
import shutil

logger = logging.getLogger(__name__)

# Internal required columns after mapping
REQUIRED_COLUMNS = ["test_name", "description", "target", "usl", "lsl", "main_level"]

META_COLUMN_MAP = {
    "Y Variable": "test_name",
    "DETAIL": "description",
    "Target": "target",
    "USL": "usl",
    "LSL": "lsl",
    "Label": "main_level",
}


class FileHandler:
    """Handles Excel file loading and column exploration"""

    def __init__(self):
        self.excel_path: Optional[str] = None
        self.df_meta: Optional[pd.DataFrame] = None
        self.df_data_raw: Optional[pd.DataFrame] = None
        self.sheets: List[str] = []
        self.fai_columns: List[str] = []
        self.categorical_columns: List[str] = []
        self.selected_cat_var: Optional[str] = None

    def _rename_meta_columns(self, df_meta: pd.DataFrame) -> pd.DataFrame:
        renamed = df_meta.rename(columns=META_COLUMN_MAP)
        return renamed

    def load_excel_file(self, excel_path: str) -> Dict[str, Any]:
        try:
            self.excel_path = excel_path
            read_path = excel_path

            # Attempt to read sheets; if corrupted window coords, fix file
            try:
                excel_file = pd.ExcelFile(read_path)
                self.sheets = excel_file.sheet_names
            except Exception as e:
                msg = str(e)
                if "expected <class 'int'>" in msg or 'xWindow' in msg or 'yWindow' in msg:
                    fixed_path = self._fix_excel_file(excel_path)
                    if fixed_path:
                        read_path = fixed_path
                        excel_file = pd.ExcelFile(read_path)
                        self.sheets = excel_file.sheet_names
                    else:
                        raise
                else:
                    raise
            logger.info(f"Found sheets: {self.sheets}")

            if "meta" not in self.sheets:
                raise ValueError("Excel file must contain a 'meta' sheet")
            if "data" not in self.sheets:
                raise ValueError("Excel file must contain a 'data' sheet")

            # Load and normalize meta
            raw_meta = pd.read_excel(read_path, sheet_name="meta")
            self.df_meta = self._rename_meta_columns(raw_meta)
            # Attach original columns for validators to inspect naming
            try:
                self.df_meta.attrs["original_columns"] = list(raw_meta.columns)
            except Exception:
                pass
            logger.info(f"Meta sheet loaded: {self.df_meta.shape}")

            # Load data
            self.df_data_raw = pd.read_excel(read_path, sheet_name="data")
            logger.info(f"Data sheet loaded: {self.df_data_raw.shape}")

            self._analyze_columns()

            return {
                "success": True,
                "sheets": self.sheets,
                "meta_shape": self.df_meta.shape,
                "data_shape": self.df_data_raw.shape,
                "meta_columns": self.df_meta.columns.tolist(),
                "data_columns": self.df_data_raw.columns.tolist(),
                "fai_columns": self.fai_columns,
                "categorical_columns": self.categorical_columns,
                "missing_required_columns": self._get_missing_required_columns(),
            }

        except Exception as e:
            logger.error(f"Error loading Excel file: {str(e)}")
            return {"success": False, "error": str(e)}

    def _fix_excel_file(self, file_path: str) -> Optional[str]:
        try:
            fixed_path = file_path.replace('.xlsx', '_fixed.xlsx')
            shutil.copy2(file_path, fixed_path)
            with zipfile.ZipFile(fixed_path, 'r') as zip_read:
                with zipfile.ZipFile(fixed_path + '.tmp', 'w', zipfile.ZIP_DEFLATED) as zip_write:
                    for item in zip_read.infolist():
                        data = zip_read.read(item.filename)
                        if item.filename == 'xl/workbook.xml':
                            root = ET.fromstring(data)
                            for view in root.findall('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}workbookView'):
                                if 'xWindow' in view.attrib:
                                    try:
                                        int(view.attrib['xWindow'])
                                    except Exception:
                                        view.attrib['xWindow'] = '0'
                                if 'yWindow' in view.attrib:
                                    try:
                                        int(view.attrib['yWindow'])
                                    except Exception:
                                        view.attrib['yWindow'] = '0'
                            data = ET.tostring(root, encoding='unicode').encode('utf-8')
                        zip_write.writestr(item, data)
            shutil.move(fixed_path + '.tmp', fixed_path)
            logger.info(f"Fixed Excel file written: {fixed_path}")
            return fixed_path
        except Exception as e:
            logger.error(f"Failed to fix Excel file: {e}")
            return None

    def _analyze_columns(self):
        if self.df_data_raw is None:
            return

        # FAI columns detection
        self.fai_columns = [
            col for col in self.df_data_raw.columns if "FAI" in str(col).upper()
        ]

        # Prefer 'Stage' as categorical if present, else fallback to generic detection
        self.categorical_columns = []
        if "Stage" in self.df_data_raw.columns:
            self.categorical_columns.append("Stage")

        # Include other likely categorical columns (excluding FAI cols)
        for col in self.df_data_raw.columns:
            if col in self.fai_columns or col == "Stage":
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

        if cat_var not in self.df_data_raw.columns:
            return {
                "success": False,
                "error": f"Column '{cat_var}' not found in data sheet",
                "available_columns": self.df_data_raw.columns.tolist(),
            }

        self.selected_cat_var = cat_var
        if not self.fai_columns:
            return {"success": False, "error": "No 'FAI' columns found in data sheet"}

        return {
            "success": True,
            "categorical_variable": cat_var,
            "fai_columns": self.fai_columns,
            "data_shape": self.df_data_raw.shape,
        }

    def get_file_summary(self) -> Dict[str, Any]:
        if self.df_meta is None or self.df_data_raw is None:
            return {"error": "No file loaded"}

        return {
            "file_path": self.excel_path,
            "sheets": self.sheets,
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

