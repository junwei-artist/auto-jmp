#!/bin/bash

# check-port.command
# Checks and manages ports based on .env configuration
# Usage: ./check-port.command [port_number]

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

echo "🔍 Port Management Tool"
echo "======================"

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Check if we're in the right directory
if [ ! -f "backend/main.py" ] && [ ! -f "$SCRIPT_DIR/backend/main.py" ]; then
    print_error "Please run this script from the project root directory"
    print_error "Expected to find: backend/main.py"
    exit 1
fi

# If we're not in the project root, change to the script directory
if [ ! -f "backend/main.py" ]; then
    print_status "Changing to project root directory: $SCRIPT_DIR"
    cd "$SCRIPT_DIR"
fi

# Configuration file paths
CONFIG_FILE="backend/.backend-config"
ENV_FILE="backend/.env"

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

# Function to get process info on port
get_port_process_info() {
    local port=$1
    local pid=$(lsof -Pi :$port -sTCP:LISTEN -t 2>/dev/null)
    if [ ! -z "$pid" ]; then
        local process_info=$(ps -p $pid -o pid,ppid,user,command --no-headers 2>/dev/null)
        echo "$process_info"
    else
        echo ""
    fi
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
            local process_info=$(get_port_process_info $port)
            print_status "Found process: $process_info"
            
            # Try graceful termination first
            print_status "Attempting graceful termination (SIGTERM)..."
            kill -TERM $pid 2>/dev/null || true
            sleep 3
            
            # Check if process is still running
            if kill -0 $pid 2>/dev/null; then
                print_warning "Process $pid still running, using force kill (SIGKILL)..."
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

# Function to get port from configuration
get_configured_port() {
    local port=$DEFAULT_PORT
    local port_source="default"
    
    # First check .env file for BACKEND_PORT
    if [ -f "$ENV_FILE" ]; then
        local env_port=$(grep "^BACKEND_PORT=" "$ENV_FILE" | cut -d'=' -f2 | sed 's/ *#.*$//')
        if [ ! -z "$env_port" ] && [ "$env_port" -gt 0 ] 2>/dev/null; then
            port=$env_port
            port_source=".env file"
        fi
    fi
    
    # Then check config file exists (but don't override .env)
    if [ "$port_source" = "default" ] && [ -f "$CONFIG_FILE" ]; then
        local config_port=$(grep "^BACKEND_PORT=" "$CONFIG_FILE" | cut -d'=' -f2)
        if [ ! -z "$config_port" ] && [ "$config_port" -gt 0 ] 2>/dev/null; then
            port=$config_port
            port_source=".backend-config"
        fi
    fi
    
    echo "$port|$port_source"
}

# Function to display port status
display_port_status() {
    local port=$1
    local source=$2
    
    echo ""
    print_status "Port Configuration:"
    echo "  📍 Port: $port"
    echo "  📂 Source: $source"
    echo ""
    
    if check_port $port; then
        print_warning "Port $port is currently IN USE"
        
        # Get process information
        local process_info=$(get_port_process_info $port)
        if [ ! -z "$process_info" ]; then
            echo "  🔍 Process using port $port:"
            echo "    $process_info"
        fi
        
        return 1
    else
        print_success "Port $port is AVAILABLE"
        return 0
    fi
}

# Function to manage port (free if needed)
manage_port() {
    local port=$1
    local source=$2
    local auto_free=${3:-false}
    
    if check_port $port; then
        if [ "$auto_free" = "true" ]; then
            print_warning "Port $port is in use. Auto-freeing..."
            response="y"
        else
            print_warning "Port $port is in use. Do you want to free it? (y/N)"
            read -r response
        fi
        
        if [[ "$response" =~ ^[Yy]$ ]]; then
            if kill_port $port; then
                if verify_port_availability $port; then
                    print_success "Port $port is now free and verified!"
                    return 0
                else
                    print_error "Port $port verification failed"
                    return 1
                fi
            else
                print_error "Failed to free port $port"
                return 1
            fi
        else
            print_status "Skipping port freeing"
            return 1
        fi
    else
        print_success "Port $port is already available"
        return 0
    fi
}

# Main logic
main() {
    local target_port=""
    local auto_free=false
    
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -f|--force)
                auto_free=true
                shift
                ;;
            -h|--help)
                echo "Usage: $0 [OPTIONS] [PORT]"
                echo ""
                echo "Options:"
                echo "  -f, --force    Automatically free the port if it's in use"
                echo "  -h, --help     Show this help message"
                echo ""
                echo "Examples:"
                echo "  $0                    # Check port from .env configuration"
                echo "  $0 8080              # Check specific port"
                echo "  $0 -f 8080           # Check and auto-free specific port"
                echo "  $0 --force           # Check and auto-free port from .env"
                exit 0
                ;;
            *)
                if [[ "$1" =~ ^[0-9]+$ ]]; then
                    target_port=$1
                else
                    print_error "Invalid argument: $1"
                    print_status "Use -h or --help for usage information"
                    exit 1
                fi
                shift
                ;;
        esac
    done
    
    # Check if port was provided as argument
    if [ ! -z "$target_port" ]; then
        if [ "$target_port" -lt 1 ] || [ "$target_port" -gt 65535 ]; then
            print_error "Invalid port number: $target_port"
            print_status "Port must be a number between 1 and 65535"
            exit 1
        fi
        print_status "Checking specified port: $target_port"
    else
        print_status "Checking configured port from environment..."
    fi
    
    # Get port configuration
    if [ -z "$target_port" ]; then
        local port_config=$(get_configured_port)
        target_port=$(echo "$port_config" | cut -d'|' -f1)
        local port_source=$(echo "$port_config" | cut -d'|' -f2)
    else
        local port_source="command line argument"
    fi
    
    # Display port status
    display_port_status "$target_port" "$port_source"
    local port_status=$?
    
    # Manage port if needed
    if [ $port_status -ne 0 ]; then
        echo ""
        manage_port "$target_port" "$port_source" "$auto_free"
    fi
    
    echo ""
    print_status "Port check completed"
}

# Run main function
main "$@"
