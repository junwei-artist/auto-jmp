#!/bin/bash

# install-backend.command
# Checks Python version → creates virtual environment → installs all dependencies from requirements.txt

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

echo "🐍 Backend Installation Script"
echo "=============================="

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Check if we're in the right directory or if the script is in the project root
if [ ! -f "backend/requirements.txt" ] && [ ! -f "$SCRIPT_DIR/backend/requirements.txt" ]; then
    print_error "Please run this script from the project root directory"
    print_error "Expected to find: backend/requirements.txt"
    print_error "Current directory: $(pwd)"
    print_error "Script location: $SCRIPT_DIR"
    exit 1
fi

# If we're not in the project root, change to the script directory
if [ ! -f "backend/requirements.txt" ]; then
    print_status "Changing to project root directory: $SCRIPT_DIR"
    cd "$SCRIPT_DIR"
fi

# Check if Python 3.11 is installed
print_status "Checking for Python 3.11..."

if command -v python3.11 &> /dev/null; then
    PYTHON_VERSION_OUTPUT=$(python3.11 --version 2>&1)
    if [ $? -ne 0 ]; then
        print_error "Failed to get Python 3.11 version"
        exit 1
    fi
    PYTHON_VERSION=$(echo "$PYTHON_VERSION_OUTPUT" | grep -oE '[0-9]+\.[0-9]+(\.[0-9]+)?' | head -1)
    if [ -z "$PYTHON_VERSION" ]; then
        print_error "Could not parse Python 3.11 version"
        exit 1
    fi
    MAJOR_VERSION=$(echo "$PYTHON_VERSION" | cut -d'.' -f1)
    MINOR_VERSION=$(echo "$PYTHON_VERSION" | cut -d'.' -f2)
    
    if ! [[ "$MAJOR_VERSION" =~ ^[0-9]+$ ]] || ! [[ "$MINOR_VERSION" =~ ^[0-9]+$ ]]; then
        print_error "Invalid Python version format: $PYTHON_VERSION"
        exit 1
    fi
    
    if [ "$MAJOR_VERSION" -eq 3 ] && [ "$MINOR_VERSION" -eq 11 ]; then
        print_success "Python 3.11 found: $PYTHON_VERSION"
        PYTHON_CMD="python3.11"
    else
        print_error "Python 3.11 is required. Found: $PYTHON_VERSION"
        exit 1
    fi
elif command -v python3 &> /dev/null; then
    PYTHON_VERSION_OUTPUT=$(python3 --version 2>&1)
    if [ $? -ne 0 ]; then
        print_error "Failed to get Python 3 version"
        exit 1
    fi
    PYTHON_VERSION=$(echo "$PYTHON_VERSION_OUTPUT" | grep -oE '[0-9]+\.[0-9]+(\.[0-9]+)?' | head -1)
    if [ -z "$PYTHON_VERSION" ]; then
        print_error "Could not parse Python 3 version"
        exit 1
    fi
    MAJOR_VERSION=$(echo "$PYTHON_VERSION" | cut -d'.' -f1)
    MINOR_VERSION=$(echo "$PYTHON_VERSION" | cut -d'.' -f2)
    
    if ! [[ "$MAJOR_VERSION" =~ ^[0-9]+$ ]] || ! [[ "$MINOR_VERSION" =~ ^[0-9]+$ ]]; then
        print_error "Invalid Python version format: $PYTHON_VERSION"
        exit 1
    fi
    
    if [ "$MAJOR_VERSION" -eq 3 ] && [ "$MINOR_VERSION" -eq 11 ]; then
        print_success "Python 3.11 found: $PYTHON_VERSION (compatible)"
        PYTHON_CMD="python3"
    else
        print_error "Python 3.11 is required. Found: $PYTHON_VERSION"
        print_status "Please install Python 3.11 or run: brew install python@3.11"
        exit 1
    fi
else
    print_error "Python 3.11 is not installed"
    print_status "Installing Python 3.11 via Homebrew..."
    
    # Check if Homebrew is installed
    if ! command -v brew &> /dev/null; then
        print_error "Homebrew is not installed. Please install Homebrew first:"
        echo "  /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
        exit 1
    fi
    
    # Install Python 3.11
    brew install python@3.11
    PYTHON_CMD="python3.11"
    print_success "Python 3.11 installed successfully"
fi

# Navigate to backend directory
cd backend

# Create virtual environment if it doesn't exist, or recreate if Python version doesn't match
if [ ! -d "venv" ]; then
    print_status "Creating virtual environment..."
    $PYTHON_CMD -m venv venv
    print_success "Virtual environment created"
else
    print_warning "Virtual environment already exists"
    
    # Verify existing venv is using Python 3.11
    if [ -f "venv/bin/python" ] && [ -x "venv/bin/python" ]; then
        print_status "Verifying existing virtual environment Python version..."
        VENV_PYTHON_VERSION_OUTPUT=$(venv/bin/python --version 2>&1)
        if [ $? -eq 0 ]; then
            VENV_PYTHON_VERSION=$(echo "$VENV_PYTHON_VERSION_OUTPUT" | grep -oE '[0-9]+\.[0-9]+(\.[0-9]+)?' | head -1)
            if [ ! -z "$VENV_PYTHON_VERSION" ]; then
                VENV_MAJOR=$(echo "$VENV_PYTHON_VERSION" | cut -d'.' -f1)
                VENV_MINOR=$(echo "$VENV_PYTHON_VERSION" | cut -d'.' -f2)
                
                if [[ "$VENV_MAJOR" =~ ^[0-9]+$ ]] && [[ "$VENV_MINOR" =~ ^[0-9]+$ ]]; then
                    if [ "$VENV_MAJOR" -eq 3 ] && [ "$VENV_MINOR" -eq 11 ]; then
                        print_success "Existing virtual environment is using Python $VENV_PYTHON_VERSION"
                    else
                        print_warning "Existing virtual environment is using Python $VENV_PYTHON_VERSION, but Python 3.11 is required"
                        print_status "Removing old virtual environment..."
                        rm -rf venv
                        print_status "Creating new virtual environment with Python 3.11..."
                        $PYTHON_CMD -m venv venv
                        print_success "Virtual environment recreated with Python 3.11"
                    fi
                else
                    print_warning "Could not parse Python version from existing venv, recreating..."
                    rm -rf venv
                    print_status "Creating new virtual environment with Python 3.11..."
                    $PYTHON_CMD -m venv venv
                    print_success "Virtual environment recreated with Python 3.11"
                fi
            else
                print_warning "Could not parse Python version from existing venv, recreating..."
                rm -rf venv
                print_status "Creating new virtual environment with Python 3.11..."
                $PYTHON_CMD -m venv venv
                print_success "Virtual environment recreated with Python 3.11"
            fi
        else
            print_warning "Could not get Python version from existing venv, recreating..."
            rm -rf venv
            print_status "Creating new virtual environment with Python 3.11..."
            $PYTHON_CMD -m venv venv
            print_success "Virtual environment recreated with Python 3.11"
        fi
    else
        print_warning "Virtual environment Python executable not found or not executable, recreating..."
        rm -rf venv
        print_status "Creating new virtual environment with Python 3.11..."
        $PYTHON_CMD -m venv venv
        print_success "Virtual environment recreated with Python 3.11"
    fi
fi

# Verify the venv Python version one more time before activation
print_status "Verifying virtual environment Python version..."
if [ ! -f "venv/bin/python" ] || [ ! -x "venv/bin/python" ]; then
    print_error "Virtual environment Python executable not found or not executable"
    exit 1
fi

VENV_PYTHON_VERSION_OUTPUT=$(venv/bin/python --version 2>&1)
if [ $? -ne 0 ]; then
    print_error "Failed to get Python version from virtual environment"
    exit 1
fi

VENV_PYTHON_VERSION=$(echo "$VENV_PYTHON_VERSION_OUTPUT" | grep -oE '[0-9]+\.[0-9]+(\.[0-9]+)?' | head -1)
if [ -z "$VENV_PYTHON_VERSION" ]; then
    print_error "Could not parse Python version from virtual environment"
    exit 1
fi

VENV_MAJOR=$(echo "$VENV_PYTHON_VERSION" | cut -d'.' -f1)
VENV_MINOR=$(echo "$VENV_PYTHON_VERSION" | cut -d'.' -f2)

if ! [[ "$VENV_MAJOR" =~ ^[0-9]+$ ]] || ! [[ "$VENV_MINOR" =~ ^[0-9]+$ ]]; then
    print_error "Invalid Python version format from virtual environment: $VENV_PYTHON_VERSION"
    exit 1
fi

if [ "$VENV_MAJOR" -eq 3 ] && [ "$VENV_MINOR" -eq 11 ]; then
    print_success "Virtual environment is using Python $VENV_PYTHON_VERSION"
else
    print_error "Virtual environment is using Python $VENV_PYTHON_VERSION, but Python 3.11 is required"
    exit 1
fi

# Activate virtual environment
print_status "Activating virtual environment..."
source venv/bin/activate

# Verify virtual environment is properly activated
if [ -z "$VIRTUAL_ENV" ]; then
    print_error "Virtual environment is not properly activated"
    print_status "VIRTUAL_ENV is not set. Please check the activation."
    exit 1
else
    print_success "Virtual environment activated: $VIRTUAL_ENV"
fi

# Verify activated Python is 3.11
print_status "Verifying activated Python version..."
ACTIVATED_PYTHON_VERSION_OUTPUT=$(python --version 2>&1)
if [ $? -ne 0 ]; then
    print_error "Failed to get Python version from activated environment"
    exit 1
fi

ACTIVATED_PYTHON_VERSION=$(echo "$ACTIVATED_PYTHON_VERSION_OUTPUT" | grep -oE '[0-9]+\.[0-9]+(\.[0-9]+)?' | head -1)
if [ -z "$ACTIVATED_PYTHON_VERSION" ]; then
    print_error "Could not parse Python version from activated environment"
    exit 1
fi

ACTIVATED_MAJOR=$(echo "$ACTIVATED_PYTHON_VERSION" | cut -d'.' -f1)
ACTIVATED_MINOR=$(echo "$ACTIVATED_PYTHON_VERSION" | cut -d'.' -f2)

if ! [[ "$ACTIVATED_MAJOR" =~ ^[0-9]+$ ]] || ! [[ "$ACTIVATED_MINOR" =~ ^[0-9]+$ ]]; then
    print_error "Invalid Python version format from activated environment: $ACTIVATED_PYTHON_VERSION"
    exit 1
fi

if [ "$ACTIVATED_MAJOR" -eq 3 ] && [ "$ACTIVATED_MINOR" -eq 11 ]; then
    print_success "Activated environment is using Python $ACTIVATED_PYTHON_VERSION"
else
    print_error "Activated environment is using Python $ACTIVATED_PYTHON_VERSION, expected Python 3.11"
    exit 1
fi

# Upgrade pip
print_status "Upgrading pip..."
pip install --upgrade pip

# Install dependencies
print_status "Installing Python dependencies..."
pip install -r requirements.txt

# Check if installation was successful
if [ $? -eq 0 ]; then
    print_success "Dependencies installed successfully"
else
    print_error "Failed to install dependencies"
    exit 1
fi

print_success "🎉 Backend installation completed successfully!"
echo ""
print_status "Next steps:"
echo "1. Run './setup-backend.command' to configure database and run migrations"
echo "2. Run './create-admin.command' to create an admin user"
echo "3. Run './run-backend-dev.command' to start the backend service"
echo ""
print_status "Virtual environment location: $(pwd)/venv"
print_status "Python version: $(python --version 2>&1)"