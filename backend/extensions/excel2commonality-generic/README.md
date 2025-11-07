# Excel2Commonality-Generic Plugin

## Overview

The Excel2Commonality-Generic plugin provides automated analysis of Excel files containing commonality data. Unlike the standard Excel2Commonality plugin, this version allows users to select which categorical columns to use instead of requiring fixed Chinese columns.

## Features

- **Automatic Sheet Detection**: Finds data sheets automatically
- **FAI Column Detection**: Automatically identifies columns containing 'FAI' for analysis
- **Non-FAI Column Detection**: Detects all columns that do NOT contain 'FAI' as potential categorical variables
- **User-Selected Categorical Variables**: Users can choose which non-FAI columns to use as categorical variables
- **Multi-variable Visualization**: Generates JSL scripts for comprehensive analysis
- **Multiple Format Support**: Supports .xlsx, .xls, .xlsm, and .xlsb files
- **Custom Wizard**: Has its own wizard interface for column selection

## Key Differences from Excel2Commonality

- **No Required Columns**: Does not look for fixed Chinese columns (测试时间, EGL铆接治具号, etc.)
- **User Selection**: Users must select which columns to use as categorical variables
- **Flexible**: Works with any Excel file structure as long as it has FAI columns
- **Custom Wizard**: Has its own wizard flow to handle column selection

## Workflow

1. **Load File**: Upload Excel file and detect available sheets
2. **Detect Columns**: System automatically detects:
   - FAI columns (columns containing "FAI")
   - Non-FAI columns (potential categorical variables)
3. **Select Categorical Columns**: User selects which non-FAI columns to use as categorical variables
4. **Generate Files**: System generates CSV and JSL files with selected categorical columns
5. **Run Analysis**: Execute JMP analysis with generated files

## API Endpoints

- `POST /api/v1/extensions/excel2commonality-generic/load-file` - Load Excel file and get column information
- `POST /api/v1/extensions/excel2commonality-generic/process-data` - Process data and detect FAI/non-FAI columns
- `POST /api/v1/extensions/excel2commonality-generic/generate-files` - Generate CSV and JSL with selected categorical columns
- `POST /api/v1/extensions/excel2commonality-generic/run-analysis` - Run complete analysis
- `GET /api/v1/extensions/excel2commonality-generic/info` - Get plugin information

## Usage

### Backend Processing

```python
from extensions.excel2commonality_generic.analyzer import CommonalityGenericAnalyzer

analyzer = CommonalityGenericAnalyzer()

# First, detect columns
result = analyzer.validate_data_content('path/to/file.xlsx')
non_fai_columns = result['details']['non_fai_columns']
fai_columns = result['details']['fai_columns']

# User selects categorical columns (e.g., ['Time', 'Location', 'Batch'])
selected_categorical = ['Time', 'Location', 'Batch']

# Generate analysis
result = analyzer.analyze_excel_file(
    'path/to/file.xlsx',
    categorical_columns=selected_categorical
)
```

### Frontend Integration

```typescript
// Use the custom wizard for column selection
// The wizard will:
// 1. Load file and show available columns
// 2. Display FAI and non-FAI columns
// 3. Allow user to select categorical columns
// 4. Generate and run analysis
```

## Generated Outputs

1. **CSV File**: Processed data with selected categorical columns and all FAI columns
2. **JSL Script**: JMP script for multi-variable visualization using selected categorical variables
3. **Analysis Report**: Detailed information about the analysis process

## JSL Script Features

The generated JSL script creates:
- Multi-variable scatter plots with user-selected categorical variables
- Smoother curves
- Box plots for each variable combination
- Automatic PNG export for each FAI variable
- Dynamic X-axis variables based on user selection

## Dependencies

- pandas >= 2.1.4
- openpyxl >= 3.1.2
- xlrd >= 2.0.1
- pyxlsb >= 1.0.10

## Architecture

The plugin follows the standard plugin architecture:
- `extension.py` - Plugin registration and metadata
- `analyzer.py` - Core analysis logic with user-selected categorical columns
- `analyzer_meta.py` - Meta sheet support with user-selected categorical columns
- `processor.py` - Main processing orchestrator
- `api.py` - FastAPI endpoints
- Frontend wizard components for user interface

## Validation Process

1. **Structure Validation**: Checks file format and finds data sheet
2. **Content Validation**: Verifies FAI columns exist and detects non-FAI columns
3. **Column Selection**: User selects categorical columns (via wizard)
4. **Processing**: Generates CSV and JSL outputs with selected columns

## Error Handling

The plugin includes comprehensive error handling for:
- Unsupported file formats
- Missing FAI columns
- No non-FAI columns available
- Invalid categorical column selections
- Corrupted Excel files
- Dependency issues

## Example Workflow

1. Upload Excel file
2. System detects data sheet and all columns
3. System identifies FAI columns (e.g., "FAI_001", "FAI_002")
4. System identifies non-FAI columns (e.g., "Date", "Location", "Batch", "Operator")
5. User selects categorical columns (e.g., selects "Date", "Location", "Batch")
6. System generates CSV with selected categorical columns + FAI columns
7. System generates JSL script with selected categorical variables on X-axis
8. Download files for JMP analysis or run directly
9. Run JSL script in JMP for visualization

## Meta Sheet Support

If the Excel file contains a "meta" sheet with specifications (test_name, target, usl, lsl), the plugin will:
- Use specifications for axis scaling
- Add reference lines (LSL, USL, Target) to graphs
- Calculate appropriate axis ranges with margins

## Notes

- The plugin requires at least one FAI column to be present
- The plugin requires at least one non-FAI column to use as categorical variable
- Users must select at least one categorical column before generating files
- The selected categorical columns must exist in the non-FAI columns list