# Excel2Commonality Plugin

## Overview

The Excel2Commonality plugin provides automated analysis of Excel files containing commonality data. It automatically detects sheets with required columns and generates CSV and JSL files for multi-variable visualization in JMP.

## Features

- **Automatic Sheet Detection**: Finds sheets containing all required columns
- **FAI Column Detection**: Automatically identifies columns containing 'FAI' for analysis
- **Multi-variable Visualization**: Generates JSL scripts for comprehensive analysis
- **Multiple Format Support**: Supports .xlsx, .xls, .xlsm, and .xlsb files
- **Required Columns Validation**: Ensures data integrity before processing

## Required Columns

The plugin looks for Excel sheets containing these specific columns:
- 测试时间 (Test Time)
- EGL铆接治具号 (EGL Riveting Fixture Number)
- EGL焊接治具号 (EGL Welding Fixture Number)
- 镍片放料工位 (Nickel Sheet Feeding Station)
- AFMT治具 (AFMT Fixture)

## API Endpoints

- `POST /api/v1/extensions/excel2commonality/validate` - Validate Excel file structure
- `POST /api/v1/extensions/excel2commonality/process` - Process Excel file and generate outputs
- `POST /api/v1/extensions/excel2commonality/analyze` - Analyze Excel file content
- `GET /api/v1/extensions/excel2commonality/info` - Get plugin information

## Usage

### Backend Processing

```python
from extensions.excel2commonality.analyzer import CommonalityAnalyzer

analyzer = CommonalityAnalyzer()
result = analyzer.analyze_excel_file('path/to/file.xlsx')
```

### Frontend Integration

```typescript
import { useCommonalityAnalysis } from '@/plugins/excel2commonality/hooks/useCommonalityAnalysis'

const { processFile, validateFile, isLoading, error } = useCommonalityAnalysis()
```

## Generated Outputs

1. **CSV File**: Processed data ready for analysis
2. **JSL Script**: JMP script for multi-variable visualization
3. **Analysis Report**: Detailed information about the analysis process

## JSL Script Features

The generated JSL script creates:
- Multi-variable scatter plots
- Smoother curves
- Box plots for each variable combination
- Automatic PNG export for each FAI variable

## Dependencies

- pandas >= 2.1.4
- openpyxl >= 3.1.2
- xlrd >= 2.0.1
- pyxlsb >= 1.0.10

## Architecture

The plugin follows the standard plugin architecture:
- `extension.py` - Plugin registration and metadata
- `analyzer.py` - Core analysis logic
- `processor.py` - Main processing orchestrator
- `api.py` - FastAPI endpoints
- Frontend components for user interface

## Validation Process

1. **Structure Validation**: Checks file format and finds data sheet
2. **Content Validation**: Verifies required columns and FAI columns exist
3. **Processing**: Generates CSV and JSL outputs

## Error Handling

The plugin includes comprehensive error handling for:
- Unsupported file formats
- Missing required columns
- Corrupted Excel files
- Dependency issues

## Example Workflow

1. Upload Excel file with required columns
2. Plugin automatically detects the data sheet
3. Validates file structure and content
4. Generates CSV and JSL files
5. Download files for JMP analysis
6. Run JSL script in JMP for visualization
