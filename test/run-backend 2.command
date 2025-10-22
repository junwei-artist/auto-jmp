#!/bin/bash

# run-backend.command
# Creates and checks config file for port, activates venv, checks if port is in use, frees it if needed, and runs the backend service

set -e
# set -x  # Enable debug mode

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

echo "🚀 Backend Service Runner"
echo "========================"

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Check if we're in the right directory or if the script is in the project root
if [ ! -f "backend/main.py" ] && [ ! -f "$SCRIPT_DIR/backend/main.py" ]; then
    print_error "Please run this script from the project root directory"
    print_error "Expected to find: backend/main.py"
    print_error "Current directory: $(pwd)"
    print_error "Script location: $SCRIPT_DIR"
    exit 1
fi

# If we're not in the project root, change to the script directory
if [ ! -f "backend/main.py" ]; then
    print_status "Changing to project root directory: $SCRIPT_DIR"
    cd "$SCRIPT_DIR"
fi

# Configuration file path
CONFIG_FILE="backend/.backend-config"

# Default port
DEFAULT_PORT=4700

# Function to check if port is in use
check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        return 0  # Port is in use
    else
        return 1  # Port is free
    fi
}

# Function to kill process on port
kill_port() {
    local port=$1
    print_warning "Port $port is in use. Attempting to free it..."
    
    # Find and kill the process
    local pid=$(lsof -Pi :$port -sTCP:LISTEN -t 2>/dev/null)
    if [ ! -z "$pid" ]; then
        print_status "Killing process $pid on port $port..."
        kill -9 $pid 2>/dev/null || true
        sleep 2
        
        # Check if port is now free
        if ! check_port $port; then
            print_success "Port $port is now free"
            return 0
        else
            print_error "Failed to free port $port"
            return 1
        fi
    else
        print_error "Could not find process using port $port"
        return 1
    fi
}

# Function to get port from config or user input
get_port() {
    local port=$DEFAULT_PORT
    
    # Check if config file exists
    if [ -f "$CONFIG_FILE" ]; then
        local config_port=$(grep "^BACKEND_PORT=" "$CONFIG_FILE" | cut -d'=' -f2)
        if [ ! -z "$config_port" ]; then
            port=$config_port
        fi
    fi
    
    # Check if port is in use
    if check_port $port; then
        print_warning "Port $port is currently in use" >&2
        print_status "Attempting to free port $port automatically..." >&2
        
        if kill_port $port; then
            print_success "Port $port is now free" >&2
        else
            print_error "Could not free port $port" >&2
            print_status "Trying alternative port 4701..." >&2
            port=4701
            
            if check_port $port; then
                print_error "Port 4701 is also in use" >&2
                print_status "Please manually stop the processes using these ports" >&2
                exit 1
            else
                print_success "Using alternative port $port" >&2
            fi
        fi
    fi
    
    # Save port to config file
    echo "BACKEND_PORT=$port" > "$CONFIG_FILE"
    echo "BACKEND_HOST=0.0.0.0" >> "$CONFIG_FILE"
    echo "BACKEND_RELOAD=true" >> "$CONFIG_FILE"
    
    echo $port
}

# Get the port to use
PORT=$(get_port)

print_status "Starting backend service on port $PORT..."

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
    print_error "Virtual environment not found. Please run './install-backend.command' first"
    exit 1
fi

# Verify virtual environment is using Python 3.11
print_status "Verifying virtual environment Python version..."
VENV_PYTHON_VERSION=$(venv/bin/python --version 2>&1 | cut -d' ' -f2)
VENV_MAJOR=$(echo $VENV_PYTHON_VERSION | cut -d'.' -f1)
VENV_MINOR=$(echo $VENV_PYTHON_VERSION | cut -d'.' -f2)

if [ "$VENV_MAJOR" -eq 3 ] && [ "$VENV_MINOR" -eq 11 ]; then
    print_success "Virtual environment using Python $VENV_PYTHON_VERSION"
else
    print_error "Virtual environment is using Python $VENV_PYTHON_VERSION, but Python 3.11 is required"
    print_status "Please run './install-backend.command' to recreate the virtual environment"
    exit 1
fi

# Check if .env file exists
if [ ! -f ".env" ]; then
    print_warning ".env file not found. Creating from template..."
    if [ -f "env.example" ]; then
        cp env.example .env
        print_warning "Please edit backend/.env with your configuration before running the service"
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

if [ "$ACTIVATED_MAJOR" -eq 3 ] && [ "$ACTIVATED_MINOR" -eq 11 ]; then
    print_success "Activated environment using Python $ACTIVATED_PYTHON_VERSION"
else
    print_error "Activated environment is using Python $ACTIVATED_PYTHON_VERSION, expected Python 3.11"
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

# Check if main.py exists
if [ ! -f "main.py" ]; then
    print_error "main.py not found in backend directory"
    exit 1
fi

# Skip database migrations for now - tables will be created automatically
print_status "Skipping database migrations - tables will be created automatically when the app starts"

# Start the backend service
print_success "Starting FastAPI backend service..."
print_status "Service will be available at: http://localhost:$PORT"
print_status "API documentation: http://localhost:$PORT/docs"
print_status "Press Ctrl+C to stop the service"
echo ""

# Start uvicorn using Python 3.11
print_status "Executing: python -m uvicorn main:app --host 0.0.0.0 --port $PORT --reload"
echo ""

# Ensure we're in the right directory and environment
pwd
echo "Python version: $(python --version)"
echo "Virtual environment: $VIRTUAL_ENV"
echo ""

# Start the service (this should keep running)
exec python -m uvicorn main:app --host 0.0.0.0 --port $PORT --reload
