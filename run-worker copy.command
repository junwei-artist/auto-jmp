#!/bin/bash

# Celery Worker Startup Script for Data Analysis Platform
# This script starts a Celery worker to process JMP analysis tasks

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
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

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"

# Change to project root if not already there
if [ "$(pwd)" != "$PROJECT_ROOT" ]; then
    print_status "Changing to project root: $PROJECT_ROOT"
    cd "$PROJECT_ROOT"
fi

print_status "Starting Celery Worker for JMP Analysis"
print_status "======================================"

# Check if we're in the right directory
if [ ! -f "backend/app/core/celery.py" ]; then
    print_error "Celery configuration not found. Please run this script from the project root."
    exit 1
fi

# Navigate to backend directory
print_status "Navigating to backend directory..."
cd backend

# Check for Python 3.11
print_status "Checking for Python 3.11..."
if ! command -v python3.11 &> /dev/null; then
    print_error "Python 3.11 not found. Please install Python 3.11 first."
    exit 1
fi
print_success "Python 3.11 found: $(python3.11 --version)"

# Check for virtual environment
print_status "Checking for virtual environment..."
if [ ! -d "venv" ]; then
    print_error "Virtual environment not found. Please run install-backend.command first."
    exit 1
fi
print_success "Virtual environment found"

# Activate virtual environment
print_status "Activating virtual environment..."
source venv/bin/activate
print_success "Virtual environment activated"

# Force JMP application path (hardcoded as requested)
export JMP_APP_PATH="/Applications/JMP Pro 17.app"
print_status "Using JMP app: $JMP_APP_PATH"

# Force using this project's Python and Celery module
PY_BIN="$PROJECT_ROOT/backend/venv/bin/python"
CELERY_BIN="$PROJECT_ROOT/backend/venv/bin/celery"
CELERY_RUN=("$PY_BIN" -m celery)

# Check for Redis
print_status "Checking for Redis..."
if ! command -v redis-server &> /dev/null; then
    print_warning "Redis not found. Installing Redis..."
    if command -v brew &> /dev/null; then
        brew install redis
        brew services start redis
        print_success "Redis installed and started"
    else
        print_error "Please install Redis manually"
        exit 1
    fi
else
    print_success "Redis found"
fi

# Check if Redis is running
print_status "Checking if Redis is running..."
if ! redis-cli ping &> /dev/null; then
    print_warning "Redis is not running. Starting Redis..."
    if command -v brew &> /dev/null; then
        brew services start redis
        sleep 2
        if redis-cli ping &> /dev/null; then
            print_success "Redis started successfully"
        else
            print_error "Failed to start Redis"
            exit 1
        fi
    else
        print_error "Please start Redis manually"
        exit 1
    fi
else
    print_success "Redis is running"
fi

# Check for Celery
print_status "Checking for Celery..."
if ! python -c "import celery" &> /dev/null; then
    print_error "Celery not found. Please run install-backend.command first."
    exit 1
fi
print_success "Celery found"

# Clean up stale Celery workers and PID files
print_status "Checking for stale Celery workers from other repos..."
# Try to stop any existing celery workers for this app to avoid wrong CWD/venv usage
pkill -f 'celery.*app.core.celery' || true
sleep 1

# Remove possible stale PID/log files
rm -f /tmp/celery-service.pid 2>/dev/null || true

# Verify celery binary path (should be from this venv)
print_status "Celery binary (PATH): $(which celery)"
print_status "Python executable (forced): $PY_BIN"
print_status "Celery module path (forced runtime): $($PY_BIN -c 'import celery,sys; print(celery.__file__)')"
print_status "Sys.executable (forced runtime): $($PY_BIN -c 'import sys; print(sys.executable)')"

# Purge any queued tasks to avoid old tasks stuck in old workers
print_status "Purging any queued Celery tasks..."
PYTHONPATH="" PYTHONNOUSERSITE=1 "${CELERY_RUN[@]}" -A app.core.celery purge -f || true
print_success "Queue purge complete"

# Create output directory
print_status "Creating output directory..."
mkdir -p uploads/outputs
print_success "Output directory created"

# Start Celery worker
print_success "Starting Celery worker..."
print_status "Worker will process JMP analysis tasks"
print_status "Press Ctrl+C to stop the worker"
echo ""

# Start the Celery worker
PYTHONPATH="" PYTHONNOUSERSITE=1 exec "${CELERY_RUN[@]}" --workdir "$PROJECT_ROOT/backend" \
  -A app.core.celery worker \
  -n service@%h \
  -E --loglevel=debug --queues=jmp --concurrency=1
