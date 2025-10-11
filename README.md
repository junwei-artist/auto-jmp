# JMP Runner Module

A modular Python script for running JMP (JMP Statistical Software) with CSV and JSL files to generate images. This module extracts the core functionality from the original `jmp_server_module.py` for standalone use without requiring a Flask web server.

## Features

- **Process CSV and JSL files**: Automatically opens CSV data in JMP and executes JSL scripts
- **Generate images**: Captures visualizations created by JSL scripts using `Save Picture()` statements
- **Monitor completion**: Waits for JMP to finish processing and monitors generated files
- **Screenshot capture**: Optional capture of JMP window screenshots
- **Safe mode**: OCR processing of screenshots to extract text while protecting sensitive visual data
- **Batch processing**: Process multiple CSV/JSL pairs
- **Error handling**: Comprehensive error handling and logging
- **Results packaging**: Create ZIP files with all generated results

## Prerequisites

- **JMP Software**: JMP Statistical Software must be installed on macOS
- **Python 3.7+**: Required for running the module
- **macOS**: Currently only supports macOS due to AppleScript dependency

## Installation

1. **Install core requirements**:
   ```bash
   pip install psutil
   ```

2. **Install optional requirements for full functionality**:
   ```bash
   # For JMP automation
   pip install applescript
   
   # For screenshot processing and OCR
   pip install Pillow pytesseract
   ```

3. **Install Tesseract OCR** (for safe mode):
   ```bash
   # macOS
   brew install tesseract
   
   # Linux
   sudo apt-get install tesseract-ocr
   
   # Windows
   # Download from https://github.com/UB-Mannheim/tesseract/wiki
   ```

## Quick Start

### Basic Usage

```python
from jmp_runner import JMPRunner

# Create runner instance
runner = JMPRunner()

# Run JMP with CSV and JSL files
result = runner.run_csv_jsl("data.csv", "script.jsl")

# Check results
print(f"Status: {result['status']}")
print(f"Images generated: {result['image_count']}")
for img in result['images']:
    print(f"  - {img}")
```

### Advanced Usage

```python
from jmp_runner import JMPRunner

# Create runner with advanced features
runner = JMPRunner(
    base_task_dir="./my_tasks",
    max_wait_time=300,  # 5 minutes
    capture_screenshots=True,
    safe_mode=True
)

# Run with custom options
result = runner.run_csv_jsl(
    "data.csv", 
    "script.jsl",
    task_id="my_analysis",
    capture_initial=True,
    capture_final=True
)

# Create ZIP file with results
zip_path = runner.create_results_zip(Path(result['task_dir']), result['task_id'])
```

### Command Line Usage

```bash
# Basic usage
python jmp_runner.py data.csv script.jsl

# With options
python jmp_runner.py data.csv script.jsl --screenshots --safe-mode --verbose
```

## JSL Script Requirements

Your JSL script should include `Save Picture()` statements to generate images:

```jsl
// Example JSL script
Distribution(
    Y( :Age ),
    Horizontal Layout( 1 ),
    Vertical( 0 )
);

// Save the plot - path will be automatically converted
Save Picture( "age_distribution.png", PNG );

// Create scatter plot
Scatter Plot(
    Y( :Salary ),
    X( :Age ),
    Fit Line( 1 )
);

Save Picture( "salary_vs_age.png", PNG );
```

**Note**: The module automatically:
- Prepends `Open("your_csv_file.csv");` to your JSL script
- Converts hardcoded paths in `Save Picture()` statements to use the task directory
- Adds the `//!` auto-run flag

## API Reference

### JMPRunner Class

#### Constructor Parameters

- `base_task_dir` (str|Path, optional): Directory for task files (default: "./tasks")
- `max_wait_time` (int): Maximum wait time for JMP completion in seconds (default: 300)
- `jmp_start_delay` (int): Delay after opening JMP before running script (default: 4)
- `safe_mode` (bool): Enable OCR processing of screenshots (default: False)
- `capture_screenshots` (bool): Capture JMP window screenshots (default: False)

#### Methods

##### `run_csv_jsl(csv_path, jsl_path, task_id=None, capture_initial=False, capture_final=False)`

Run the complete JMP pipeline with CSV and JSL files.

**Parameters:**
- `csv_path` (str|Path): Path to CSV file
- `jsl_path` (str|Path): Path to JSL file
- `task_id` (str, optional): Custom task ID (default: timestamp)
- `capture_initial` (bool): Capture initial screenshots
- `capture_final` (bool): Capture final screenshots

**Returns:**
Dictionary with results:
```python
{
    "status": "completed" | "failed",
    "task_id": "task_identifier",
    "task_dir": "/path/to/task/directory",
    "csv_file": "data.csv",
    "jsl_file": "script.jsl",
    "run_status": "execution status message",
    "images": ["image1.png", "image2.png"],
    "image_count": 2,
    "initial_screenshots": ["initial_screenshot.png"],
    "final_screenshots": ["final_screenshot.png"],
    "created_at": "2024-01-01T12:00:00",
    "error": "error message if failed"
}
```

##### `create_results_zip(task_dir, task_id)`

Create a ZIP file with all results from a task.

**Parameters:**
- `task_dir` (Path): Task directory containing results
- `task_id` (str): Task ID for naming the ZIP file

**Returns:**
Path to created ZIP file or None if failed

## Examples

See `example_usage.py` for comprehensive examples including:
- Basic usage
- Advanced features
- Batch processing
- Error handling

Run examples:
```bash
python example_usage.py
```

## Configuration

### Safe Mode

When `safe_mode=True`, screenshots are processed with OCR:
1. Extract text from original screenshots using Tesseract OCR
2. Replace screenshots with blank white images containing the extracted text
3. This ensures sensitive visual data is not stored while preserving text content

### Task Directory Structure

```
tasks/
├── task_20240101_120000/
│   ├── data.csv
│   ├── script.jsl
│   ├── image1.png
│   ├── image2.png
│   ├── initial_screenshot.png
│   ├── final_screenshot.png
│   └── results_20240101_120000.zip
└── task_20240101_120500/
    └── ...
```

## Error Handling

The module includes comprehensive error handling:
- File validation (CSV and JSL files must exist)
- JMP process management (automatic cleanup)
- Timeout handling (configurable max wait time)
- AppleScript error handling
- OCR processing error handling

## Troubleshooting

### Common Issues

1. **"AppleScript not available"**
   - Install: `pip install applescript`
   - Ensure you're running on macOS

2. **"JMP not found"**
   - Ensure JMP is installed and accessible
   - Check that JMP can be opened from command line: `open -a JMP`

3. **"OCR processing failed"**
   - Install Tesseract OCR: `brew install tesseract`
   - Install Python packages: `pip install Pillow pytesseract`

4. **"Timeout waiting for JMP completion"**
   - Increase `max_wait_time` parameter
   - Check that JSL script is valid and will complete
   - Ensure JMP is not stuck waiting for user input

### Debugging

Enable verbose logging:
```python
import logging
logging.getLogger().setLevel(logging.DEBUG)
```

Or use command line:
```bash
python jmp_runner.py data.csv script.jsl --verbose
```

## License

This module is part of the auto-jmp project. See LICENSE file for details.

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.
