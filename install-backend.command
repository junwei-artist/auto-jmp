#!/bin/bash

# install-backend.command
# Checks if Python 3.13 exists → installs if missing → creates a virtual environment → activates it → installs all dependencies from requirements.txt.

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
    PYTHON_VERSION=$(python3.11 --version 2>&1 | cut -d' ' -f2)
    print_success "Python 3.11 found: $PYTHON_VERSION"
    PYTHON_CMD="python3.11"
elif command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version 2>&1 | cut -d' ' -f2)
    MAJOR_VERSION=$(echo $PYTHON_VERSION | cut -d'.' -f1)
    MINOR_VERSION=$(echo $PYTHON_VERSION | cut -d'.' -f2)
    
    if [ "$MAJOR_VERSION" -eq 3 ] && [ "$MINOR_VERSION" -ge 8 ]; then
        print_success "Python $PYTHON_VERSION found (compatible)"
        PYTHON_CMD="python3"
    else
        print_error "Python 3.8+ is required. Found: $PYTHON_VERSION"
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
else
    print_error "Python 3 is not installed"
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

# Check if PostgreSQL is installed
print_status "Checking for PostgreSQL..."

if ! command -v psql &> /dev/null; then
    print_status "PostgreSQL not found. Installing via Homebrew..."
    
    # Check if Homebrew is installed
    if ! command -v brew &> /dev/null; then
        print_error "Homebrew is not installed. Please install Homebrew first:"
        echo "  /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
        exit 1
    fi
    
    # Install PostgreSQL
    brew install postgresql@16
    brew services start postgresql@16
    
    # Add PostgreSQL to PATH
    echo 'export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"' >> ~/.zshrc
    export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"
    
    print_success "PostgreSQL installed and started"
    
    # Configure PostgreSQL user and password
    print_status "Configuring PostgreSQL..."
    echo ""
    print_warning "PostgreSQL setup requires configuration:"
    echo "1. Default user: postgres"
    echo "2. You can use your system username or create a new user"
    echo ""
    
    # Get PostgreSQL username
    read -p "Enter PostgreSQL username (default: postgres): " PG_USERNAME
    PG_USERNAME=${PG_USERNAME:-postgres}
    
    # Get PostgreSQL password
    read -s -p "Enter PostgreSQL password for user '$PG_USERNAME': " PG_PASSWORD
    echo ""
    
    # Set password for the user
    if [ "$PG_USERNAME" = "postgres" ]; then
        print_status "Setting password for postgres user..."
        psql -U postgres -c "ALTER USER postgres PASSWORD '$PG_PASSWORD';" 2>/dev/null || {
            print_warning "Could not set password for postgres user"
            print_status "You may need to run: sudo -u postgres psql -c \"ALTER USER postgres PASSWORD '$PG_PASSWORD';\""
        }
    else
        print_status "Creating user '$PG_USERNAME'..."
        psql -U postgres -c "CREATE USER $PG_USERNAME WITH PASSWORD '$PG_PASSWORD';" 2>/dev/null || print_warning "User '$PG_USERNAME' may already exist"
        psql -U postgres -c "ALTER USER $PG_USERNAME CREATEDB;" 2>/dev/null || print_warning "Could not grant CREATEDB privilege"
    fi
    
    print_status "Creating database 'data_analysis'..."
    PGPASSWORD="$PG_PASSWORD" createdb -U "$PG_USERNAME" data_analysis 2>/dev/null || print_status "Database 'data_analysis' may already exist"
    
else
    print_success "PostgreSQL found"
    
    # Get PostgreSQL configuration
    echo ""
    print_warning "PostgreSQL configuration required:"
    echo "Please provide your PostgreSQL credentials"
    echo ""
    
    # Get PostgreSQL username
    read -p "Enter PostgreSQL username (default: $(whoami)): " PG_USERNAME
    PG_USERNAME=${PG_USERNAME:-$(whoami)}
    
    # Get PostgreSQL password
    read -s -p "Enter PostgreSQL password for user '$PG_USERNAME': " PG_PASSWORD
    echo ""
    
    # Check if database exists
    if ! PGPASSWORD="$PG_PASSWORD" psql -U "$PG_USERNAME" -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw data_analysis; then
        print_status "Creating database 'data_analysis'..."
        PGPASSWORD="$PG_PASSWORD" createdb -U "$PG_USERNAME" data_analysis 2>/dev/null || print_error "Failed to create database. Please check PostgreSQL configuration."
    else
        print_success "Database 'data_analysis' already exists"
    fi
fi

# Test PostgreSQL connection
print_status "Testing PostgreSQL connection..."
if PGPASSWORD="$PG_PASSWORD" psql -U "$PG_USERNAME" -d data_analysis -c "SELECT 1;" &>/dev/null; then
    print_success "PostgreSQL connection successful!"
else
    print_error "PostgreSQL connection failed!"
    print_warning "Please check your credentials and try again."
    print_status "You can also manually configure PostgreSQL and run this script again."
    exit 1
fi

# Store PostgreSQL credentials for later use
export PG_USERNAME
export PG_PASSWORD

# Check if Redis is installed
print_status "Checking for Redis..."

if ! command -v redis-server &> /dev/null; then
    print_status "Redis not found. Installing via Homebrew..."
    
    # Check if Homebrew is installed
    if ! command -v brew &> /dev/null; then
        print_error "Homebrew is not installed. Please install Homebrew first:"
        echo "  /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
        exit 1
    fi
    
    # Install Redis
    brew install redis
    brew services start redis
    
    print_success "Redis installed and started"
else
    print_success "Redis found"
    
    # Check if Redis is running
    if ! redis-cli ping &> /dev/null; then
        print_status "Starting Redis..."
        brew services start redis
        print_success "Redis started"
    else
        print_success "Redis is running"
    fi
fi

# Navigate to backend directory
cd backend

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    print_status "Creating virtual environment..."
    $PYTHON_CMD -m venv venv
    print_success "Virtual environment created"
else
    print_warning "Virtual environment already exists"
fi

# Activate virtual environment
print_status "Activating virtual environment..."
source venv/bin/activate

# Upgrade pip
print_status "Upgrading pip..."
pip install --upgrade pip

# Install dependencies
print_status "Installing Python dependencies..."
pip install -r requirements.txt

# Create .env file if it doesn't exist
if [ ! -f ".env" ]; then
    print_status "Creating .env configuration file..."
    cp env.example .env
    
    # Update the database URL with the PostgreSQL credentials
    DATABASE_URL="postgresql+asyncpg://$PG_USERNAME:$PG_PASSWORD@localhost/data_analysis"
    sed -i.bak "s|postgresql+asyncpg://username@localhost/data_analysis|$DATABASE_URL|g" .env
    rm .env.bak 2>/dev/null || true
    
    # Generate a random secret key
    SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_urlsafe(32))")
    sed -i.bak "s/your-secret-key-change-in-production/$SECRET_KEY/g" .env
    rm .env.bak 2>/dev/null || true
    
    print_success "Created .env file with your PostgreSQL configuration"
    print_status "Database URL: postgresql+asyncpg://$PG_USERNAME:***@localhost/data_analysis"
    print_warning "Please edit backend/.env if you need to customize further"
else
    print_warning ".env file already exists"
    print_status "If you need to update PostgreSQL credentials, edit backend/.env manually"
fi

# Initialize Alembic if not already done
if [ ! -d "alembic/versions" ]; then
    print_status "Initializing Alembic for database migrations..."
    alembic init alembic
    print_success "Alembic initialized"
else
    print_success "Alembic already initialized"
fi

print_success "🎉 Backend installation completed successfully!"
echo ""
print_status "Next steps:"
echo "1. Edit backend/.env with your configuration"
echo "2. Run './run-backend.command' to start the backend service"
echo ""
print_status "Virtual environment location: $(pwd)/venv"
print_status "Python version: $($PYTHON_CMD --version)"
