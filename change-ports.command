#!/bin/bash

# change-ports.command
# Simple script to change all port configurations from a single place
# Usage: ./change-ports.command [backend-port] [frontend-dev-port] [frontend-prod-port]

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

echo "🔧 Port Configuration Manager"
echo "============================"

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MASTER_CONFIG_FILE="$SCRIPT_DIR/.master-config"

# Check if master config exists
if [ ! -f "$MASTER_CONFIG_FILE" ]; then
    print_error "Master configuration file not found: $MASTER_CONFIG_FILE"
    exit 1
fi

# Load the master config reader
source "$SCRIPT_DIR/master-config-reader.sh"

# Get current configuration
CURRENT_BACKEND_PORT=$(get_config_value "BACKEND_PORT" "4750")
CURRENT_FRONTEND_DEV_PORT=$(get_config_value "FRONTEND_DEV_PORT" "4850")
CURRENT_FRONTEND_PROD_PORT=$(get_config_value "FRONTEND_PROD_PORT" "4851")

print_status "Current Configuration:"
echo "  Backend Port: $CURRENT_BACKEND_PORT"
echo "  Frontend Dev Port: $CURRENT_FRONTEND_DEV_PORT"
echo "  Frontend Prod Port: $CURRENT_FRONTEND_PROD_PORT"
echo ""

# Parse command line arguments
NEW_BACKEND_PORT=${1:-$CURRENT_BACKEND_PORT}
NEW_FRONTEND_DEV_PORT=${2:-$CURRENT_FRONTEND_DEV_PORT}
NEW_FRONTEND_PROD_PORT=${3:-$CURRENT_FRONTEND_PROD_PORT}

# Validate ports
validate_port() {
    local port=$1
    local name=$2
    
    if ! [[ "$port" =~ ^[0-9]+$ ]] || [ "$port" -lt 1024 ] || [ "$port" -gt 65535 ]; then
        print_error "Invalid $name: $port (must be between 1024-65535)"
        return 1
    fi
    return 0
}

if ! validate_port "$NEW_BACKEND_PORT" "backend port"; then
    exit 1
fi

if ! validate_port "$NEW_FRONTEND_DEV_PORT" "frontend dev port"; then
    exit 1
fi

if ! validate_port "$NEW_FRONTEND_PROD_PORT" "frontend prod port"; then
    exit 1
fi

# Check if ports are different
if [ "$NEW_BACKEND_PORT" = "$CURRENT_BACKEND_PORT" ] && 
   [ "$NEW_FRONTEND_DEV_PORT" = "$CURRENT_FRONTEND_DEV_PORT" ] && 
   [ "$NEW_FRONTEND_PROD_PORT" = "$CURRENT_FRONTEND_PROD_PORT" ]; then
    print_warning "All ports are already set to the requested values"
    exit 0
fi

print_status "Updating ports:"
echo "  Backend: $CURRENT_BACKEND_PORT → $NEW_BACKEND_PORT"
echo "  Frontend Dev: $CURRENT_FRONTEND_DEV_PORT → $NEW_FRONTEND_DEV_PORT"
echo "  Frontend Prod: $CURRENT_FRONTEND_PROD_PORT → $NEW_FRONTEND_PROD_PORT"
echo ""

# Update master config
print_status "Updating master configuration..."
sed -i '' "s/BACKEND_PORT=.*/BACKEND_PORT=$NEW_BACKEND_PORT/" "$MASTER_CONFIG_FILE"
sed -i '' "s/FRONTEND_DEV_PORT=.*/FRONTEND_DEV_PORT=$NEW_FRONTEND_DEV_PORT/" "$MASTER_CONFIG_FILE"
sed -i '' "s/FRONTEND_PROD_PORT=.*/FRONTEND_PROD_PORT=$NEW_FRONTEND_PROD_PORT/" "$MASTER_CONFIG_FILE"

# Update all derived configs
print_status "Updating all configuration files..."
update_all_configs

print_success "Port configuration updated successfully!"
print_status "All services will use the new ports on next restart"
echo ""
print_status "To apply changes, restart your services:"
echo "  ./run-backend.command"
echo "  ./run-frontend.command"
