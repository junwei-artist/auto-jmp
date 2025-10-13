#!/bin/bash

# build-frontend.command
# Builds the frontend for production

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

echo "🔨 Frontend Build Script"
echo "======================="

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
NEXT_PUBLIC_API_URL=http://localhost:4700
NEXT_PUBLIC_WS_URL=ws://localhost:4700
EOF
    print_warning "Using default configuration. Please edit .env.local if needed."
fi

# Clean previous build
print_status "Cleaning previous build..."
if [ -d ".next" ]; then
    rm -rf .next
    print_success "Cleaned .next directory"
fi

if [ -d "out" ]; then
    rm -rf out
    print_success "Cleaned out directory"
fi

# Check Node.js version
NODE_VERSION=$(node --version)
print_status "Using Node.js: $NODE_VERSION"

# Check npm version
NPM_VERSION=$(npm --version)
print_status "Using npm: $NPM_VERSION"

# Install dependencies (in case of updates)
print_status "Ensuring dependencies are up to date..."
npm ci

# Run type checking
print_status "Running TypeScript type checking..."
if [ -f "tsconfig.json" ]; then
    npx tsc --noEmit
    print_success "Type checking passed"
else
    print_warning "tsconfig.json not found, skipping type checking"
fi

# Run linting
print_status "Running ESLint..."
if npx eslint --version >/dev/null 2>&1; then
    npx eslint . --ext .ts,.tsx --max-warnings 0 || {
        print_warning "ESLint found issues. Continuing with build..."
    }
else
    print_warning "ESLint not configured, skipping linting"
fi

# Build the application
print_status "Building Next.js application..."
print_status "This may take a few minutes..."

# Set build environment variables
export NODE_ENV=production
export NEXT_TELEMETRY_DISABLED=1

# Run the build
npm run build

# Check if build was successful
if [ $? -eq 0 ]; then
    print_success "Build completed successfully"
else
    print_error "Build failed"
    exit 1
fi

# Check if .next directory was created
if [ ! -d ".next" ]; then
    print_error ".next directory not found after build"
    exit 1
fi

# Check build output
print_status "Build output:"
if [ -d ".next/static" ]; then
    STATIC_SIZE=$(du -sh .next/static | cut -f1)
    print_status "Static assets: $STATIC_SIZE"
fi

if [ -d ".next/server" ]; then
    SERVER_SIZE=$(du -sh .next/server | cut -f1)
    print_status "Server files: $SERVER_SIZE"
fi

# Create build info file
BUILD_INFO_FILE=".next/build-info.json"
cat > "$BUILD_INFO_FILE" << EOF
{
  "buildTime": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "nodeVersion": "$NODE_VERSION",
  "npmVersion": "$NPM_VERSION",
  "buildCommand": "npm run build",
  "environment": "production"
}
EOF

print_success "Created build info file: $BUILD_INFO_FILE"

# Optional: Create standalone build for deployment
print_status "Creating standalone build..."
if npm run build -- --standalone >/dev/null 2>&1; then
    print_success "Standalone build created"
else
    print_warning "Standalone build not available or failed"
fi

print_success "🎉 Frontend build completed successfully!"
echo ""
print_status "Build artifacts:"
echo "- .next/ directory contains the built application"
echo "- Ready for production deployment"
echo ""
print_status "Next steps:"
echo "1. Run './run-frontend.command' to start the production server"
echo "2. Or deploy the .next/ directory to your hosting platform"
echo ""
print_status "Build completed at: $(date)"
