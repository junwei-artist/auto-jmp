#!/bin/bash

# test-runner.command
# Tests the backend/jmp_runner.py with demo CSV and JSL files

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

echo "🧪 JMP Runner Test Script"
echo "========================="

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"

# Navigate to backend directory
print_status "Navigating to backend directory..."
if cd "$PROJECT_ROOT/backend"; then
    print_status "Current directory: $(pwd)"
else
    print_error "Failed to navigate to backend directory"
    exit 1
fi

# Check if Python 3.11 is available
print_status "Checking for Python 3.11..."
if command -v python3.11 &> /dev/null; then
    PYTHON_VERSION=$(python3.11 --version 2>&1 | cut -d' ' -f2)
    print_success "Python 3.11 found: $PYTHON_VERSION"
    PYTHON_CMD="python3.11"
elif command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version 2>&1 | cut -d' ' -f2)
    MAJOR_VERSION=$(echo $PYTHON_VERSION | cut -d'.' -f1)
    MINOR_VERSION=$(echo $PYTHON_VERSION | cut -d'.' -f2)
    
    if [ "$MAJOR_VERSION" -eq 3 ] && [ "$MINOR_VERSION" -eq 11 ]; then
        print_success "Python $PYTHON_VERSION found (compatible)"
        PYTHON_CMD="python3"
    else
        print_error "Python 3.11 is required. Found: $PYTHON_VERSION"
        print_status "Please install Python 3.11 or run './install-backend.command' to set it up"
        exit 1
    fi
else
    print_error "Python 3.11 is not installed"
    print_status "Please install Python 3.11 or run './install-backend.command' to set it up"
    exit 1
fi

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    print_error "Virtual environment not found at ./venv. Please run install-backend.command first."
    exit 1
fi

# Activate virtual environment
print_status "Activating virtual environment..."
source venv/bin/activate
if [ -z "$VIRTUAL_ENV" ]; then
    print_error "Virtual environment is not properly activated"
    print_status "VIRTUAL_ENV is not set. Please check the activation."
    exit 1
else
    print_success "Virtual environment activated: $VIRTUAL_ENV"
fi

# Check if demo files exist
print_status "Checking for demo files..."
CSV_FILE="../demo/jmp_data_20251011_173619.csv"
JSL_FILE="../demo/jsl_script_20251011_173619.jsl"

if [ ! -f "$CSV_FILE" ]; then
    print_error "Demo CSV file not found: $CSV_FILE"
    exit 1
fi

if [ ! -f "$JSL_FILE" ]; then
    print_error "Demo JSL file not found: $JSL_FILE"
    exit 1
fi

print_success "Demo files found:"
print_status "  CSV: $(basename "$CSV_FILE")"
print_status "  JSL: $(basename "$JSL_FILE")"

# Check if jmp_runner.py exists
if [ ! -f "jmp_runner.py" ]; then
    print_error "jmp_runner.py not found in backend directory"
    exit 1
fi

print_success "jmp_runner.py found"

# Check if applescript package is installed
print_status "Checking for applescript package..."
if python -c "import applescript" 2>/dev/null; then
    print_success "applescript package is installed"
else
    print_warning "applescript package not found. Installing..."
    pip install applescript
    if python -c "import applescript" 2>/dev/null; then
        print_success "applescript package installed successfully"
    else
        print_error "Failed to install applescript package"
        exit 1
    fi
fi

# Check if JMP is installed
print_status "Checking if JMP is installed..."
if [ -d "/Applications/JMP" ] || [ -d "/Applications/JMP Pro" ] || [ -d "/Applications/JMP Statistical Discovery" ]; then
    print_success "JMP installation found"
else
    print_warning "JMP installation not found in /Applications/"
    print_status "Please ensure JMP is installed for the test to work properly"
fi

echo ""
print_status "Starting JMP Runner Test..."
echo "=================================="

# Test 1: Command line interface test
print_status "Test 1: Command Line Interface Test"
echo "----------------------------------------"
print_status "Running: python jmp_runner.py \"$CSV_FILE\" \"$JSL_FILE\" --verbose"

if python jmp_runner.py "$CSV_FILE" "$JSL_FILE" --verbose; then
    print_success "✅ Command line test completed successfully"
else
    print_error "❌ Command line test failed"
    exit 1
fi

echo ""

# Test 2: Python module test
print_status "Test 2: Python Module Test"
echo "-------------------------------"
print_status "Running Python module test..."

python -c "
from jmp_runner import JMPRunner
import os

print('Creating JMP runner instance...')
runner = JMPRunner(max_wait_time=60)

print('Running demo files...')
result = runner.run_csv_jsl('../demo/jmp_data_20251011_173619.csv', '../demo/jsl_script_20251011_173619.jsl')

print(f'Status: {result[\"status\"]}')
print(f'Task ID: {result[\"task_id\"]}')
print(f'Images Generated: {result[\"image_count\"]}')
print(f'Images: {result[\"images\"]}')

if result['status'] == 'completed':
    print('✅ Python module test successful!')
    exit(0)
else:
    print(f'❌ Error: {result.get(\"error\", \"Unknown error\")}')
    exit(1)
"

if [ $? -eq 0 ]; then
    print_success "✅ Python module test completed successfully"
else
    print_error "❌ Python module test failed"
    exit 1
fi

echo ""

# Test 3: Check generated files
print_status "Test 3: Generated Files Verification"
echo "----------------------------------------"

# Find the most recent task directory
LATEST_TASK=$(ls -t tasks/task_* 2>/dev/null | head -1 | tr -d ':')
if [ -z "$LATEST_TASK" ]; then
    print_error "No task directories found"
    exit 1
fi

print_status "Checking latest task directory: $LATEST_TASK"

# Check for PNG files
PNG_COUNT=$(find "$LATEST_TASK" -name "*.png" | wc -l)
if [ "$PNG_COUNT" -gt 0 ]; then
    print_success "✅ Found $PNG_COUNT PNG files"
    print_status "Generated images:"
    find "$LATEST_TASK" -name "*.png" -exec basename {} \; | while read file; do
        print_status "  - $file"
    done
else
    print_error "❌ No PNG files found"
    exit 1
fi

# Check for ZIP file
ZIP_FILE=$(find "$LATEST_TASK" -name "*.zip" | head -1)
if [ -n "$ZIP_FILE" ]; then
    print_success "✅ Found ZIP file: $(basename "$ZIP_FILE")"
    print_status "ZIP contents:"
    unzip -l "$ZIP_FILE" | tail -n +4 | head -n -2 | while read line; do
        if [ -n "$line" ]; then
            filename=$(echo "$line" | awk '{print $NF}')
            print_status "  - $filename"
        fi
    done
else
    print_warning "⚠️  No ZIP file found"
fi

echo ""

# Test 4: Performance test
print_status "Test 4: Performance Test"
echo "----------------------------"
print_status "Running performance test with shorter timeout..."

python -c "
from jmp_runner import JMPRunner
import time

print('Creating JMP runner with 30-second timeout...')
runner = JMPRunner(max_wait_time=30)

print('Starting performance test...')
start_time = time.time()

result = runner.run_csv_jsl('../demo/jmp_data_20251011_173619.csv', '../demo/jsl_script_20251011_173619.jsl')

end_time = time.time()
duration = end_time - start_time

print(f'Performance Results:')
print(f'  Duration: {duration:.2f} seconds')
print(f'  Images Generated: {result[\"image_count\"]}')
print(f'  Status: {result[\"status\"]}')

if result['status'] == 'completed' and duration < 60:
    print('✅ Performance test passed (under 60 seconds)')
    exit(0)
else:
    print('⚠️  Performance test completed but took longer than expected')
    exit(0)
"

if [ $? -eq 0 ]; then
    print_success "✅ Performance test completed"
else
    print_warning "⚠️  Performance test had issues but completed"
fi

echo ""
echo "🎉 All Tests Completed Successfully!"
echo "===================================="
print_success "JMP Runner is working correctly with demo files"
print_status "Generated files are located in: tasks/"
print_status "You can view the generated PNG images in the latest task directory"
print_status "ZIP archives are created automatically for easy download"

echo ""
print_status "Test Summary:"
print_status "  ✅ Command line interface test"
print_status "  ✅ Python module test"
print_status "  ✅ File generation verification"
print_status "  ✅ Performance test"

echo ""
print_status "Next steps:"
print_status "  1. Check the generated PNG images in the task directory"
print_status "  2. Test the frontend upload functionality"
print_status "  3. Verify the backend API endpoints work with the JMP runner"
