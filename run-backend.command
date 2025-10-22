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

# Function to verify port is truly available
verify_port_availability() {
    local port=$1
    local max_checks=5
    local check=1
    
    print_status "Verifying port $port is available..."
    
    while [ $check -le $max_checks ]; do
        if ! check_port $port; then
            print_success "Port $port is confirmed available"
            return 0
        else
            print_warning "Port $port still appears to be in use (check $check/$max_checks)"
            sleep 1
        fi
        check=$((check + 1))
    done
    
    print_error "Port $port verification failed - still appears to be in use"
    return 1
}

# Function to find next available port
find_available_port() {
    local start_port=$1
    local max_attempts=10
    local port=$start_port
    local attempt=1
    
    print_status "Searching for available port starting from $start_port..."
    
    while [ $attempt -le $max_attempts ]; do
        if ! check_port $port; then
            print_success "Found available port: $port"
            return 0
        else
            print_status "Port $port is in use, trying $((port + 1))..."
            port=$((port + 1))
        fi
        attempt=$((attempt + 1))
    done
    
    print_error "No available ports found in range $start_port-$port"
    return 1
}

# Function to kill process on port with retry logic
kill_port() {
    local port=$1
    local max_attempts=3
    local attempt=1
    
    print_warning "Port $port is in use. Attempting to free it..."
    
    while [ $attempt -le $max_attempts ]; do
        print_status "Attempt $attempt/$max_attempts to free port $port..."
        
        # Find and kill the process
        local pid=$(lsof -Pi :$port -sTCP:LISTEN -t 2>/dev/null)
        if [ ! -z "$pid" ]; then
            print_status "Found process $pid on port $port, attempting to terminate..."
            
            # Try graceful termination first
            kill -TERM $pid 2>/dev/null || true
            sleep 3
            
            # Check if process is still running
            if kill -0 $pid 2>/dev/null; then
                print_warning "Process $pid still running, using force kill..."
                kill -9 $pid 2>/dev/null || true
                sleep 2
            fi
            
            # Check if port is now free
            if ! check_port $port; then
                print_success "Port $port is now free after attempt $attempt"
                return 0
            else
                print_warning "Port $port still in use after attempt $attempt"
            fi
        else
            print_status "No process found using port $port"
            # Double-check if port is actually free
            if ! check_port $port; then
                print_success "Port $port is now free"
                return 0
            fi
        fi
        
        attempt=$((attempt + 1))
        if [ $attempt -le $max_attempts ]; then
            print_status "Waiting 2 seconds before retry..."
            sleep 2
        fi
    done
    
    print_error "Failed to free port $port after $max_attempts attempts"
    return 1
}

# Function to get port from config or user input with retry logic
get_port() {
    local port=$DEFAULT_PORT
    local port_source="default"
    local max_fallback_attempts=5
    local fallback_port=4701
    
    # First check .env file for BACKEND_PORT
    if [ -f "backend/.env" ]; then
        local env_port=$(grep "^BACKEND_PORT=" backend/.env | cut -d'=' -f2 | sed 's/ *#.*$//')
        if [ ! -z "$env_port" ] && [ "$env_port" -gt 0 ] 2>/dev/null; then
            port=$env_port
            port_source=".env file"
            echo "Using port from .env file: $port" >&2
        fi
    fi
    
    # Then check config file exists (but don't override .env)
    if [ "$port_source" = "default" ] && [ -f "$CONFIG_FILE" ]; then
        local config_port=$(grep "^BACKEND_PORT=" "$CONFIG_FILE" | cut -d'=' -f2)
        if [ ! -z "$config_port" ] && [ "$config_port" -gt 0 ] 2>/dev/null; then
            port=$config_port
            port_source=".backend-config"
            echo "Using port from .backend-config: $port" >&2
        fi
    fi
    
    # Try to use the preferred port with retry logic
    local original_port=$port
    local attempt=1
    
    while [ $attempt -le $max_fallback_attempts ]; do
        print_status "Checking port $port (attempt $attempt/$max_fallback_attempts)..." >&2
        
        if ! check_port $port; then
            print_success "Port $port is available!" >&2
            break
        else
            print_warning "Port $port is currently in use" >&2
            
            if [ $attempt -eq 1 ]; then
                print_status "Attempting to free port $port automatically..." >&2
                if kill_port $port; then
                    # Verify the port is truly available after killing
                    if verify_port_availability $port; then
                        print_success "Port $port is now free and verified!" >&2
                        break
                    else
                        print_warning "Port $port was killed but still appears in use" >&2
                    fi
                else
                    print_warning "Could not free port $port" >&2
                fi
            fi
            
            # Try next available port
            if [ $attempt -lt $max_fallback_attempts ]; then
                if find_available_port $((port + 1)); then
                    port=$((port + 1))
                    print_status "Found alternative port $port" >&2
                else
                    port=$((port + 1))
                    print_status "Trying port $port..." >&2
                fi
            else
                print_error "No available ports found in range $original_port-$port" >&2
                print_status "Please manually stop processes using these ports or change BACKEND_PORT in .env" >&2
                exit 1
            fi
        fi
        
        attempt=$((attempt + 1))
    done
    
    # Save the final port to config file
    echo "BACKEND_PORT=$port" > "$CONFIG_FILE"
    echo "BACKEND_HOST=0.0.0.0" >> "$CONFIG_FILE"
    echo "BACKEND_RELOAD=true" >> "$CONFIG_FILE"
    
    # Show final port information
    if [ "$port" != "$original_port" ]; then
        print_warning "Using port $port instead of preferred port $original_port" >&2
    else
        print_success "Using port $port from $port_source" >&2
    fi
    
    # Return clean port number
    echo "$port"
}

# Get the port to use
PORT=$(get_port)

# Clean the port variable to ensure no color codes or extra output
PORT=$(echo "$PORT" | grep -o '[0-9]*' | head -1)

# Validate port is a number
if ! [[ "$PORT" =~ ^[0-9]+$ ]] || [ "$PORT" -lt 1 ] || [ "$PORT" -gt 65535 ]; then
    print_error "Invalid port number: '$PORT'"
    print_status "Using default port 4700"
    PORT=4700
fi

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

# Function to test database connection
test_database_connection() {
    print_status "🔍 Testing database connection..."
    
    if [ -f ".env" ] && grep -q "^DATABASE_URL=" .env; then
        DB_URL=$(grep "^DATABASE_URL=" .env | cut -d'=' -f2-)
        
        # Extract database info for testing
        DB_HOST=$(echo "$DB_URL" | sed -n 's/.*@\([^:]*\):.*/\1/p')
        DB_PORT=$(echo "$DB_URL" | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
        DB_NAME=$(echo "$DB_URL" | sed -n 's/.*\/\([^?]*\).*/\1/p')
        
        if [ -z "$DB_PORT" ]; then
            DB_PORT=5432  # Default PostgreSQL port
        fi
        
        # Test connection using psql
        if command -v psql >/dev/null 2>&1; then
            if psql -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -c "SELECT 1;" >/dev/null 2>&1; then
                print_success "Database connection successful"
                return 0
            else
                print_error "Database connection failed"
                return 1
            fi
        else
            print_warning "psql not found - skipping database connection test"
            return 0
        fi
    else
        print_warning "No DATABASE_URL found in .env - skipping database test"
        return 0
    fi
}

# Function to test Redis connection
test_redis_connection() {
    print_status "🔍 Testing Redis connection..."
    
    if [ -f ".env" ] && grep -q "^REDIS_URL=" .env; then
        REDIS_URL=$(grep "^REDIS_URL=" .env | cut -d'=' -f2-)
        
        # Extract Redis host and port
        REDIS_HOST=$(echo "$REDIS_URL" | sed -n 's/.*:\/\/\([^:]*\):.*/\1/p')
        REDIS_PORT=$(echo "$REDIS_URL" | sed -n 's/.*:\([0-9]*\).*/\1/p')
        
        if [ -z "$REDIS_PORT" ]; then
            REDIS_PORT=6379  # Default Redis port
        fi
        
        # Test connection using redis-cli
        if command -v redis-cli >/dev/null 2>&1; then
            if redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping >/dev/null 2>&1; then
                print_success "Redis connection successful"
                return 0
            else
                print_error "Redis connection failed"
                return 1
            fi
        else
            print_warning "redis-cli not found - skipping Redis connection test"
            return 0
        fi
    else
        print_warning "No REDIS_URL found in .env - skipping Redis test"
        return 0
    fi
}

# Function to display loaded environment variables
display_env_config() {
    print_status "📋 Environment Configuration Loaded:"
    echo ""
    
    # Load .env file and display key variables
    if [ -f ".env" ]; then
        print_status "From .env file:"
        
        # Database configuration
        if grep -q "^DATABASE_URL=" .env; then
            DB_URL=$(grep "^DATABASE_URL=" .env | cut -d'=' -f2-)
            # Mask password in URL for security
            DB_URL_MASKED=$(echo "$DB_URL" | sed 's/:\/\/[^:]*:[^@]*@/:\/\/***:***@/')
            echo "  🗄️  DATABASE_URL: $DB_URL_MASKED"
        fi
        
        # Redis configuration
        if grep -q "^REDIS_URL=" .env; then
            REDIS_URL=$(grep "^REDIS_URL=" .env | cut -d'=' -f2-)
            echo "  🔴 REDIS_URL: $REDIS_URL"
        fi
        
        # Security
        if grep -q "^SECRET_KEY=" .env; then
            SECRET_KEY=$(grep "^SECRET_KEY=" .env | cut -d'=' -f2-)
            SECRET_KEY_MASKED="${SECRET_KEY:0:10}..."
            echo "  🔐 SECRET_KEY: $SECRET_KEY_MASKED"
        fi
        
        # Celery configuration
        if grep -q "^CELERY_BROKER_URL=" .env; then
            CELERY_BROKER=$(grep "^CELERY_BROKER_URL=" .env | cut -d'=' -f2-)
            echo "  ⚡ CELERY_BROKER_URL: $CELERY_BROKER"
        fi
        
        # Guest access
        if grep -q "^ALLOW_GUEST_ACCESS=" .env; then
            GUEST_ACCESS=$(grep "^ALLOW_GUEST_ACCESS=" .env | cut -d'=' -f2-)
            echo "  👤 ALLOW_GUEST_ACCESS: $GUEST_ACCESS"
        fi
        
        # File upload limits
        if grep -q "^MAX_FILE_SIZE=" .env; then
            MAX_FILE_SIZE=$(grep "^MAX_FILE_SIZE=" .env | cut -d'=' -f2- | sed 's/ *#.*$//')
            MAX_FILE_SIZE_MB=$((MAX_FILE_SIZE / 1024 / 1024))
            echo "  📁 MAX_FILE_SIZE: ${MAX_FILE_SIZE_MB}MB"
        fi
        
        # CORS origins
        if grep -q "^BACKEND_CORS_ORIGINS=" .env; then
            CORS_ORIGINS=$(grep "^BACKEND_CORS_ORIGINS=" .env | cut -d'=' -f2-)
            echo "  🌐 BACKEND_CORS_ORIGINS: $CORS_ORIGINS"
        fi
        
        echo ""
    else
        print_warning "No .env file found - using default values"
    fi
}

# Activate virtual environment using Python 3.11
print_status "Activating virtual environment with Python 3.11..."
source venv/bin/activate

# Display loaded environment configuration
display_env_config

# Test external service connections
print_status "🔍 Testing external service connections..."
echo ""

# Test database connection
if ! test_database_connection; then
    print_error "Database connection test failed. Please check your DATABASE_URL in .env"
    print_status "Continuing anyway - the application will handle connection errors..."
fi

echo ""

# Test Redis connection
if ! test_redis_connection; then
    print_error "Redis connection test failed. Please check your REDIS_URL in .env"
    print_status "Continuing anyway - the application will handle connection errors..."
fi

echo ""

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

# Function to handle graceful shutdown
cleanup() {
    print_status "🛑 Shutting down backend service..."
    if [ ! -z "$BACKEND_PID" ]; then
        kill -TERM "$BACKEND_PID" 2>/dev/null
        wait "$BACKEND_PID" 2>/dev/null
    fi
    print_success "Backend service stopped"
    exit 0
}

# Set up signal handlers for graceful shutdown
trap cleanup SIGINT SIGTERM

# Function to check if backend is ready
check_backend_health() {
    local max_attempts=30
    local attempt=1
    
    print_status "🔍 Waiting for backend to be ready..."
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s "http://localhost:$PORT/health" >/dev/null 2>&1; then
            print_success "Backend is ready and responding!"
            return 0
        fi
        
        if [ $((attempt % 5)) -eq 0 ]; then
            print_status "Still waiting... (attempt $attempt/$max_attempts)"
        fi
        
        sleep 1
        attempt=$((attempt + 1))
    done
    
    print_warning "Backend health check timeout - service may still be starting"
    return 1
}

# Start the service in background
print_status "🚀 Starting backend service in background..."
python -m uvicorn main:app --host 0.0.0.0 --port $PORT --reload &
BACKEND_PID=$!

# Wait a moment for the service to start
sleep 3

# Check if the process is still running
if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    print_error "Backend service failed to start"
    exit 1
fi

# Perform health check
check_backend_health

# Keep the script running and handle shutdown gracefully
print_success "Backend service is running (PID: $BACKEND_PID)"
print_status "Press Ctrl+C to stop the service gracefully"
echo ""

# Wait for the background process
wait "$BACKEND_PID"
