#!/bin/bash

# install-frontend.command
# Sets up Node.js/Frontend dependencies

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

echo "📦 Frontend Installation Script"
echo "==============================="

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

# Check if Node.js is installed
print_status "Checking for Node.js..."

if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed"
    print_status "Installing Node.js via Homebrew..."
    
    # Check if Homebrew is installed
    if ! command -v brew &> /dev/null; then
        print_error "Homebrew is not installed. Please install Homebrew first:"
        echo "  /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
        exit 1
    fi
    
    # Install Node.js
    brew install node
    print_success "Node.js installed successfully"
else
    NODE_VERSION=$(node --version)
    print_success "Node.js found: $NODE_VERSION"
    
    # Check if version is 18+
    MAJOR_VERSION=$(echo $NODE_VERSION | cut -d'.' -f1 | sed 's/v//')
    if [ "$MAJOR_VERSION" -lt 18 ]; then
        print_warning "Node.js 18+ is recommended. Current version: $NODE_VERSION"
        read -p "Do you want to continue anyway? (y/N): " continue_anyway
        if [[ ! $continue_anyway =~ ^[Yy]$ ]]; then
            print_status "Installing Node.js 18+ via Homebrew..."
            brew install node
            print_success "Node.js updated successfully"
        fi
    fi
fi

# Check if npm is available
if ! command -v npm &> /dev/null; then
    print_error "npm is not available"
    exit 1
fi

NPM_VERSION=$(npm --version)
print_success "npm found: $NPM_VERSION"

# Navigate to frontend directory
cd frontend

# Check if package.json exists
if [ ! -f "package.json" ]; then
    print_error "package.json not found in frontend directory"
    exit 1
fi

# Create .env.local file if it doesn't exist
if [ ! -f ".env.local" ]; then
    print_status "Creating .env.local configuration file..."
    cat > .env.local << EOF
NEXT_PUBLIC_BACKEND_URL=http://localhost:4700
NEXT_PUBLIC_WS_URL=ws://localhost:4700
NEXT_PUBLIC_FRONTEND_URL=http://localhost:4800
EOF
    print_success "Created .env.local file"
    print_warning "Please edit frontend/.env.local with your configuration"
else
    print_warning ".env.local file already exists"
fi

# Install dependencies
print_status "Installing Node.js dependencies..."
print_status "This may take a few minutes..."

# Clear npm cache
npm cache clean --force

# Install dependencies
npm install

# Check if installation was successful
if [ $? -eq 0 ]; then
    print_success "Dependencies installed successfully"
else
    print_error "Failed to install dependencies"
    exit 1
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    print_error "node_modules directory not found after installation"
    exit 1
fi

# Verify key dependencies
print_status "Verifying key dependencies..."

# Check if Next.js is installed
if [ ! -d "node_modules/next" ]; then
    print_error "Next.js not found in node_modules"
    exit 1
fi

# Check if React is installed
if [ ! -d "node_modules/react" ]; then
    print_error "React not found in node_modules"
    exit 1
fi

# Check if Tailwind CSS is installed
if [ ! -d "node_modules/tailwindcss" ]; then
    print_error "Tailwind CSS not found in node_modules"
    exit 1
fi

print_success "All key dependencies verified"

print_success "🎉 Frontend installation completed successfully!"
echo ""
print_status "Next steps:"
echo "1. Edit frontend/.env.local with your configuration"
echo "2. Run './run-frontend.command' to start the frontend service"
echo "3. Frontend will be available at http://localhost:4800"
echo "4. Backend should be running on http://localhost:4700"
echo ""
print_status "Node.js version: $(node --version)"
print_status "npm version: $(npm --version)"
print_status "Dependencies installed in: $(pwd)/node_modules"
