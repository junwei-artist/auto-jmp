# Excel2BoxplotV1 Plugin - Modular Architecture

## Overview

The Excel2BoxplotV1 plugin has been restructured into a modular architecture that provides clear separation of concerns and follows a standard template for plugins. This architecture allows users to upload Excel files and select categorical variables for analysis.

## Architecture Components

### 1. File Handler (`file_handler.py`)
**Purpose**: Handle file loading, sheet detection, and preliminary exploration of columns.

**Key Features**:
- Loads Excel files and detects available sheets
- Analyzes columns to identify FAI columns and categorical columns
- Allows user to select categorical variable for analysis
- Provides file preview and summary information

**Main Class**: `FileHandler`

**Key Methods**:
- `load_excel_file(excel_path)`: Load Excel file and analyze structure
- `set_categorical_variable(cat_var)`: Set categorical variable for analysis
- `get_file_summary()`: Get summary of loaded file
- `get_data_preview(n_rows)`: Get preview of data for user review

### 2. Data Validator (`data_validator.py`)
**Purpose**: Validate structure and ensure Excel matches expectations. Performs soft checks and returns warnings/errors without blocking progression.

**Key Features**:
- Validates Excel file structure (meta and data sheets)
- Checks metadata consistency between sheets
- Validates data quality and completeness
- Validates categorical variable selection
- Returns warnings instead of failures to allow progression

**Main Class**: `DataValidator`

**Key Methods**:
- `validate_structure(df_meta, df_data)`: Validate basic structure
- `validate_metadata_consistency(df_meta, df_data)`: Validate metadata consistency
- `validate_data_quality(df_meta, df_data, cat_var)`: Validate data quality
- `validate_categorical_selection(df_data, cat_var)`: Validate categorical variable
- `run_full_validation(df_meta, df_data, cat_var)`: Run all validation checks

### 3. Data Processor (`data_process.py`)
**Purpose**: Convert numeric data, compute plotting boundaries, and prepare clean metadata.

**Key Features**:
- Converts FAI columns to numeric format
- Computes axis parameters for plotting (min, max, inc, tick)
- Calculates boundaries for all main levels
- Prepares and cleans metadata
- Handles data transformation

**Main Class**: `DataProcessor`

**Key Methods**:
- `convert_to_numeric(df_data, fai_columns)`: Convert FAI columns to numeric
- `compute_axis_params(df_meta, df_data_num, fai_cols, main_level)`: Compute axis parameters
- `calculate_boundaries(df_meta, df_data, fai_columns)`: Calculate boundaries for all levels
- `prepare_metadata(df_meta)`: Prepare and clean metadata
- `process_data(df_meta, df_data, fai_columns, cat_var)`: Process data for analysis

### 4. File Processor (`file_processor.py`)
**Purpose**: Generate the actual files (CSV + JSL) and provide a ZIP for download.

**Key Features**:
- Generates CSV content from processed data
- Generates JSL script content for JMP
- Creates ZIP file with CSV, JSL, and README
- Handles file generation and packaging

**Main Class**: `FileProcessor`

**Key Methods**:
- `generate_csv(df_data, cat_var, fai_columns)`: Generate CSV content
- `generate_jsl(df_meta, boundaries, cat_var, color_by)`: Generate JSL script
- `create_zip_file(csv_content, jsl_content, output_dir)`: Create ZIP file
- `generate_files(...)`: Generate all files (CSV, JSL, ZIP)
- `cleanup_files()`: Clean up generated files

### 5. Analysis Runner (`analysis_runner.py`)
**Purpose**: Send the CSV and JSL to jmp_runner to the main function as a run of the project.

**Key Features**:
- Prepares files for JMP runner
- Submits files to JMP runner system
- Creates projects and runs analysis
- Monitors run status and retrieves results

**Main Class**: `AnalysisRunner`

**Key Methods**:
- `prepare_run_files(csv_content, jsl_content, project_name)`: Prepare files for JMP runner
- `submit_to_jmp_runner(csv_path, jsl_path, project_name)`: Submit files to JMP runner
- `check_run_status(run_id)`: Check run status
- `get_run_results(run_id)`: Get run results
- `create_project_and_run(...)`: Create project and run analysis

### 6. Main Processor (`processor.py`)
**Purpose**: Orchestrates all processing modules to provide a unified interface.

**Key Features**:
- Provides backward compatibility with existing API
- Orchestrates all processing modules
- Handles Excel file fixing for corrupted files
- Provides unified interface for the plugin

**Main Class**: `ExcelToCSVJSLProcessor`

**Key Methods**:
- `fix_excel_file(file_path)`: Fix corrupted Excel files
- `validate_excel_structure(file_path)`: Validate Excel structure (Checkpoint 1)
- `validate_meta_data(file_path)`: Validate metadata (Checkpoint 2)
- `validate_data_quality(file_path)`: Validate data quality (Checkpoint 3)
- `process_excel_file(file_path, project_name, ...)`: Process Excel file end-to-end

## API Endpoints

### Legacy Endpoints (Backward Compatibility)
- `POST /validate`: Validate Excel file structure and metadata
- `POST /process`: Process Excel file and generate CSV and JSL
- `POST /create-project`: Create project and process Excel file
- `POST /calculate-boundaries`: Calculate boundary values

### New Modular Endpoints
- `POST /load-file`: Load Excel file and analyze structure
- `POST /set-categorical`: Set categorical variable for analysis
- `POST /validate-data`: Validate data using modular approach
- `POST /process-data`: Process data using modular approach
- `POST /generate-files`: Generate CSV and JSL files using modular approach
- `POST /run-analysis`: Run complete analysis using modular approach

## Workflow

### Standard Plugin Workflow
1. **File Upload**: User uploads Excel file
2. **File Analysis**: System analyzes file structure and identifies columns
3. **Categorical Selection**: User selects categorical variable for grouping
4. **Data Validation**: System validates data structure and quality
5. **Data Processing**: System processes data and calculates boundaries
6. **File Generation**: System generates CSV and JSL files
7. **Analysis Execution**: System runs analysis using JMP runner

### Required Columns
The plugin expects the following columns in the meta sheet:
- `test_name`: Name of the test/measurement
- `description`: Description of the test
- `target`: Target value
- `usl`: Upper specification limit
- `lsl`: Lower specification limit
- `main_level`: Main level for grouping

### Data Format
- **Meta Sheet**: Contains metadata about tests and specifications
- **Data Sheet**: Contains actual measurement data with FAI columns and categorical variables
- **FAI Columns**: Columns containing "FAI" in their name (e.g., FAI1, FAI2, FAI3)
- **Categorical Variables**: Non-numeric columns used for grouping (e.g., Stage, Build, etc.)

## Benefits of Modular Architecture

1. **Separation of Concerns**: Each module has a specific responsibility
2. **Reusability**: Modules can be reused in other plugins
3. **Testability**: Each module can be tested independently
4. **Maintainability**: Easier to maintain and update individual components
5. **Flexibility**: Easy to modify or extend specific functionality
6. **Standard Template**: Provides a standard template for other plugins

## Error Handling

The modular architecture includes comprehensive error handling:
- **Soft Validation**: Returns warnings instead of failures to allow progression
- **Automatic File Fixing**: Automatically fixes corrupted Excel files
- **Detailed Error Messages**: Provides specific error messages for debugging
- **Graceful Degradation**: Continues processing even with minor issues

## Future Enhancements

The modular architecture allows for easy enhancements:
- Additional validation rules
- New file formats support
- Enhanced boundary calculation algorithms
- Integration with other analysis tools
- Custom visualization options
