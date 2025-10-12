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
exec celery -A app.core.celery worker --loglevel=info --queues=jmp --concurrency=1
