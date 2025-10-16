# Excel2CPKV1 Extension

This extension provides Excel to CPK (Process Capability) analysis functionality.

## Features

- **Excel File Processing**: Reads Excel files with 'data' and 'spec'/'meta' sheets
- **Data Validation**: Three-checkpoint validation system:
  1. Excel structure validation
  2. Spec data validation  
  3. Data matching validation
- **CPK Analysis**: Generates JSL scripts for JMP Process Capability analysis
- **CSV Generation**: Converts Excel data to CSV format for JMP
- **Error Handling**: Comprehensive error reporting and file fixing

## Supported Formats

- `.xlsx` - Excel 2007+ format
- `.xls` - Excel 97-2003 format  
- `.xlsm` - Excel with macros

## Required Excel Structure

The Excel file must contain:

1. **'data' sheet**: Contains the measurement data with FAI* columns
2. **'spec' or 'meta' sheet**: Contains specification limits
   - For 'spec' sheet: columns should be `test_name`, `usl`, `lsl`, `target`
   - For 'meta' sheet: columns should be `Y Variable`, `USL`, `LSL`, `Target`

## API Endpoints

- `POST /api/v1/extensions/excel2cpkv1/validate` - Validate Excel file
- `POST /api/v1/extensions/excel2cpkv1/process` - Process Excel file
- `POST /api/v1/extensions/excel2cpkv1/create-project` - Create project and process
- `POST /api/v1/extensions/excel2cpkv1/run-analysis` - Run complete analysis

## Dependencies

- pandas==2.1.4
- openpyxl==3.1.2
- xlrd==2.0.1
- scipy==1.11.4
