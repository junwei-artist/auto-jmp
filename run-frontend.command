#!/bin/bash

# run-frontend.command
# Runs the frontend, select production or dev, create and check config file for port, check if port is in use, free it if needed

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

echo "🌐 Frontend Service Runner"
echo "========================="

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Check if we're in the right directory or if the script is in the project root
if [ ! -f "frontend/package.json" ] && [ ! -f "$SCRIPT_DIR/frontend/package.json" ]; then
    print_error "Please run this script from the project root directory"
    print_error "Expected to find: frontend/package.json"
    print_error "Current directory: $(pwd)"
    print_error "Script location: $SCRIPT_DIR"
    exit 1
fi

# If we're not in the project root, change to the script directory
if [ ! -f "frontend/package.json" ]; then
    print_status "Changing to project root directory: $SCRIPT_DIR"
    cd "$SCRIPT_DIR"
fi

# Configuration file path
CONFIG_FILE="frontend/.frontend-config"

# Default ports
DEFAULT_DEV_PORT=3000
DEFAULT_PROD_PORT=3001

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
    local mode=$1
    local default_port=$2
    local port=$default_port
    
    # Check if config file exists
    if [ -f "$CONFIG_FILE" ]; then
        local config_key="${mode}_PORT"
        local config_port=$(grep "^$config_key=" "$CONFIG_FILE" | cut -d'=' -f2)
        if [ ! -z "$config_port" ]; then
            port=$config_port
            print_status "Using port from config: $port" >&2
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
            print_status "Trying alternative port $((port + 1))..." >&2
            port=$((port + 1))
            
            if check_port $port; then
                print_error "Port $port is also in use" >&2
                print_status "Please manually stop the processes using these ports" >&2
                exit 1
            else
                print_success "Using alternative port $port" >&2
            fi
        fi
    fi
    
    # Save port to config file
    local config_key="${mode}_PORT"
    if [ -f "$CONFIG_FILE" ]; then
        # Update existing config
        if grep -q "^$config_key=" "$CONFIG_FILE"; then
            sed -i '' "s/^$config_key=.*/$config_key=$port/" "$CONFIG_FILE"
        else
            echo "$config_key=$port" >> "$CONFIG_FILE"
        fi
    else
        # Create new config file
        echo "$config_key=$port" > "$CONFIG_FILE"
    fi
    
    echo $port
}

# Select mode (default to development)
MODE="dev"
DEFAULT_PORT=$DEFAULT_DEV_PORT

print_status "Using development mode (default)"

# Get the port to use
PORT=$(get_port $MODE $DEFAULT_PORT)

print_status "Starting frontend service in $MODE mode on port $PORT..."

# Navigate to frontend directory
cd frontend

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    print_error "node_modules not found. Please run './install-frontend.command' first"
    exit 1
fi

# Check if package.json exists
if [ ! -f "package.json" ]; then
    print_error "package.json not found in frontend directory"
    exit 1
fi

# Check if .env.local exists
if [ ! -f ".env.local" ]; then
    print_warning ".env.local not found. Creating default configuration..."
    cat > .env.local << EOF
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000
EOF
    print_warning "Using default configuration. Please edit .env.local if needed."
fi

# Check Node.js version
NODE_VERSION=$(node --version)
print_status "Using Node.js: $NODE_VERSION"

# Check npm version
NPM_VERSION=$(npm --version)
print_status "Using npm: $NPM_VERSION"

# Start the frontend service
if [ "$MODE" = "dev" ]; then
    print_success "Starting Next.js development server..."
    print_status "Service will be available at: http://localhost:$PORT"
    print_status "Hot reload enabled"
    print_status "Press Ctrl+C to stop the service"
    echo ""
    
    # Start development server
    npm run dev -- --port $PORT
else
    # Check if build exists
    if [ ! -d ".next" ]; then
        print_warning ".next directory not found. Building application..."
        npm run build
        if [ $? -ne 0 ]; then
            print_error "Build failed"
            exit 1
        fi
        print_success "Build completed"
    fi
    
    print_success "Starting Next.js production server..."
    print_status "Service will be available at: http://localhost:$PORT"
    print_status "Production mode (optimized)"
    print_status "Press Ctrl+C to stop the service"
    echo ""
    
    # Start production server
    npm run start -- --port $PORT
fi
