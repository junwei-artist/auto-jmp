#!/bin/bash

# create-admin.command
# Creates an admin user in the database using the create_admin.py script

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

echo "🔐 Admin User Creation Script"
echo "============================="

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Check if we're in the right directory or if the script is in the project root
if [ ! -f "backend/create_admin.py" ] && [ ! -f "$SCRIPT_DIR/backend/create_admin.py" ]; then
    print_error "Please run this script from the project root directory"
    print_error "Expected to find: backend/create_admin.py"
    print_error "Current directory: $(pwd)"
    print_error "Script location: $SCRIPT_DIR"
    exit 1
fi

# If we're not in the project root, change to the script directory
if [ ! -f "backend/create_admin.py" ]; then
    print_status "Changing to project root directory: $SCRIPT_DIR"
    cd "$SCRIPT_DIR"
fi

# Navigate to backend directory
print_status "Navigating to backend directory..."
if cd backend; then
    print_status "Current directory: $(pwd)"
else
    print_error "Failed to navigate to backend directory"
    print_error "Current directory: $(pwd)"
    print_error "Expected backend directory not found"
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
    
    if [ "$MAJOR_VERSION" -eq 3 ] && [ "$MINOR_VERSION" -ge 8 ]; then
        print_success "Python $PYTHON_VERSION found (compatible)"
        PYTHON_CMD="python3"
    else
        print_error "Python 3.8+ is required. Found: $PYTHON_VERSION"
        print_status "Please install Python 3.11 or run './install-backend.command' to set it up"
        exit 1
    fi
else
    print_error "Python 3.8+ is not installed"
    print_status "Please install Python 3.11 or run './install-backend.command' to set it up"
    exit 1
fi

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    print_error "Virtual environment not found. Please run './install-backend.command' first"
    exit 1
fi

# Verify virtual environment is using Python 3.11
print_status "Verifying virtual environment Python version..."
VENV_PYTHON_VERSION=$(venv/bin/python --version 2>&1 | cut -d' ' -f2)
VENV_MAJOR=$(echo $VENV_PYTHON_VERSION | cut -d'.' -f1)
VENV_MINOR=$(echo $VENV_PYTHON_VERSION | cut -d'.' -f2)

if [ "$VENV_MAJOR" -eq 3 ] && [ "$VENV_MINOR" -ge 8 ]; then
    print_success "Virtual environment using Python $VENV_PYTHON_VERSION"
else
    print_error "Virtual environment is using Python $VENV_PYTHON_VERSION, but Python 3.8+ is required"
    print_status "Please run './install-backend.command' to recreate the virtual environment"
    exit 1
fi

# Check if .env file exists
if [ ! -f ".env" ]; then
    print_warning ".env file not found. Creating from template..."
    if [ -f "env.example" ]; then
        cp env.example .env
        print_warning "Please edit backend/.env with your configuration before running the script"
    else
        print_error "No .env file or template found"
        exit 1
    fi
fi

# Activate virtual environment using Python 3.11
print_status "Activating virtual environment with Python 3.11..."
source venv/bin/activate

# Verify we're using the correct Python version in the activated environment
ACTIVATED_PYTHON_VERSION=$(python --version 2>&1 | cut -d' ' -f2)
ACTIVATED_MAJOR=$(echo $ACTIVATED_PYTHON_VERSION | cut -d'.' -f1)
ACTIVATED_MINOR=$(echo $ACTIVATED_PYTHON_VERSION | cut -d'.' -f2)

if [ "$ACTIVATED_MAJOR" -eq 3 ] && [ "$ACTIVATED_MINOR" -ge 8 ]; then
    print_success "Activated environment using Python $ACTIVATED_PYTHON_VERSION"
else
    print_error "Activated environment is using Python $ACTIVATED_PYTHON_VERSION, expected Python 3.8+"
    print_status "Please run './install-backend.command' to recreate the virtual environment"
    exit 1
fi

# Verify virtual environment is properly activated
if [ -z "$VIRTUAL_ENV" ]; then
    print_error "Virtual environment is not properly activated"
    print_status "VIRTUAL_ENV is not set. Please check the activation."
    exit 1
else
    print_success "Virtual environment activated: $VIRTUAL_ENV"
fi

# Set Python path
export PYTHONPATH="${PYTHONPATH}:$(pwd)"

# Check if create_admin.py exists
if [ ! -f "create_admin.py" ]; then
    print_error "create_admin.py not found in backend directory"
    exit 1
fi

# Check if PostgreSQL is running
print_status "Checking if PostgreSQL is running..."
if ! pg_isready -q; then
    print_error "PostgreSQL is not running. Please start PostgreSQL first."
    print_status "On macOS with Homebrew: brew services start postgresql@16"
    exit 1
else
    print_success "PostgreSQL is running"
fi

# Run the admin creation script
print_success "Creating admin user..."
print_status "Executing: python create_admin.py"
echo ""

# Execute the admin creation script
python create_admin.py

# Check if the script ran successfully
if [ $? -eq 0 ]; then
    print_success "Admin user creation completed successfully!"
    echo ""
    print_status "You can now:"
    print_status "1. Start the backend: ./run-backend-dev.command"
    print_status "2. Start the frontend: ./run-frontend-dev.command"
    print_status "3. Login at: http://localhost:4800"
    print_status "4. Use admin credentials:"
    print_status "   Email: admin@admin.com"
    print_status "   Password: admin"
else
    print_error "Admin user creation failed!"
    exit 1
fi
