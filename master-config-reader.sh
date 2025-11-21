#!/bin/bash

# master-config-reader.sh
# Utility script to read configuration from .master-config
# Usage: source master-config-reader.sh

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[CONFIG]${NC} $1"
}

print_error() {
    echo -e "${RED}[CONFIG ERROR]${NC} $1"
}

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MASTER_CONFIG_FILE="$SCRIPT_DIR/.master-config"

# Function to read a value from master config
get_config_value() {
    local key=$1
    local default_value=$2
    
    if [ -f "$MASTER_CONFIG_FILE" ]; then
        local value=$(grep "^$key=" "$MASTER_CONFIG_FILE" | cut -d'=' -f2 | sed 's/ *#.*$//')
        if [ ! -z "$value" ]; then
            echo "$value"
            return 0
        fi
    fi
    
    if [ ! -z "$default_value" ]; then
        echo "$default_value"
        return 0
    fi
    
    print_error "Configuration key '$key' not found in $MASTER_CONFIG_FILE and no default provided"
    return 1
}

# Function to get server IP (auto-detect or from config)
get_server_ip() {
    # Check if SERVER_IP is explicitly set in config
    if [ -f "$MASTER_CONFIG_FILE" ] && grep -q "^SERVER_IP=" "$MASTER_CONFIG_FILE"; then
        local config_ip=$(grep "^SERVER_IP=" "$MASTER_CONFIG_FILE" | cut -d'=' -f2 | sed 's/ *#.*$//')
        if [ ! -z "$config_ip" ] && [ "$config_ip" != "" ]; then
            echo "$config_ip"
            return 0
        fi
    fi
    
    # Auto-detect server IP
    local detected_ip=$(ifconfig | grep -E "inet [0-9]" | grep -v "127.0.0.1" | head -1 | awk '{print $2}')
    if [ ! -z "$detected_ip" ]; then
        echo "$detected_ip"
        return 0
    fi
    
    echo "localhost"
}

# Function to generate URLs based on config
generate_backend_url() {
    local server_ip=$(get_server_ip)
    local backend_port=$(get_config_value "BACKEND_PORT" "4750")
    echo "http://$server_ip:$backend_port"
}

generate_ws_url() {
    local server_ip=$(get_server_ip)
    local backend_port=$(get_config_value "BACKEND_PORT" "4750")
    echo "ws://$server_ip:$backend_port"
}

generate_frontend_url() {
    local server_ip=$(get_server_ip)
    local frontend_port=$(get_config_value "FRONTEND_DEV_PORT" "4800")
    echo "http://$server_ip:$frontend_port"
}

# Function to update all derived config files
update_all_configs() {
    print_status "Updating all configuration files from master config..."
    
    local server_ip=$(get_server_ip)
    local backend_port=$(get_config_value "BACKEND_PORT" "4750")
    local frontend_dev_port=$(get_config_value "FRONTEND_DEV_PORT" "4800")
    local frontend_prod_port=$(get_config_value "FRONTEND_PROD_PORT" "4801")
    
    # Update backend config
    if [ -f "backend/.backend-config" ]; then
        sed -i '' "s/BACKEND_PORT=.*/BACKEND_PORT=$backend_port/" backend/.backend-config
        print_status "Updated backend/.backend-config"
    fi
    
    # Update backend .env
    if [ -f "backend/.env" ]; then
        sed -i '' "s/BACKEND_PORT=.*/BACKEND_PORT=$backend_port/" backend/.env
        print_status "Updated backend/.env"
    fi
    
    # Update frontend config
    if [ -f "frontend/.frontend-config" ]; then
        sed -i '' "s/DEV_PORT=.*/DEV_PORT=$frontend_dev_port/" frontend/.frontend-config
        sed -i '' "s/dev_PORT=.*/dev_PORT=$frontend_dev_port/" frontend/.frontend-config
        sed -i '' "s/PROD_PORT=.*/PROD_PORT=$frontend_prod_port/" frontend/.frontend-config
        print_status "Updated frontend/.frontend-config"
    fi
    
    # Update frontend .env.local
    if [ -f "frontend/.env.local" ]; then
        local backend_url=$(generate_backend_url)
        local ws_url=$(generate_ws_url)
        local frontend_url=$(generate_frontend_url)
        
        sed -i '' "s|NEXT_PUBLIC_BACKEND_URL=.*|NEXT_PUBLIC_BACKEND_URL=$backend_url|" frontend/.env.local
        sed -i '' "s|NEXT_PUBLIC_WS_URL=.*|NEXT_PUBLIC_WS_URL=$ws_url|" frontend/.env.local
        sed -i '' "s|NEXT_PUBLIC_FRONTEND_URL=.*|NEXT_PUBLIC_FRONTEND_URL=$frontend_url|" frontend/.env.local
        print_status "Updated frontend/.env.local"
    fi
    
    print_status "All configuration files updated successfully"
}

# Export functions for use by other scripts
export -f get_config_value
export -f get_server_ip
export -f generate_backend_url
export -f generate_ws_url
export -f generate_frontend_url
export -f update_all_configs
export MASTER_CONFIG_FILE

print_status "Master configuration reader loaded"
print_status "Master config file: $MASTER_CONFIG_FILE"
