#!/bin/bash

# Data Analysis Platform Setup Script
# This script sets up the development environment for the Data Analysis Platform

set -e

echo "🚀 Setting up Data Analysis Platform..."

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

# Check if running on macOS, Linux, or Windows
if [[ "$OSTYPE" == "darwin"* ]]; then
    OS="macos"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    OS="linux"
elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]]; then
    OS="windows"
else
    print_error "Unsupported operating system: $OSTYPE"
    exit 1
fi

print_status "Detected operating system: $OS"

# Check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    # Check Python
    if command -v python3 &> /dev/null; then
        PYTHON_VERSION=$(python3 --version | cut -d' ' -f2)
        print_success "Python $PYTHON_VERSION found"
    else
        print_error "Python 3.11+ is required but not installed"
        exit 1
    fi
    
    # Check Node.js
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node --version)
        print_success "Node.js $NODE_VERSION found"
    else
        print_error "Node.js 18+ is required but not installed"
        exit 1
    fi
    
    # Check npm
    if command -v npm &> /dev/null; then
        NPM_VERSION=$(npm --version)
        print_success "npm $NPM_VERSION found"
    else
        print_error "npm is required but not installed"
        exit 1
    fi
    
    # Check PostgreSQL
    if command -v psql &> /dev/null; then
        PSQL_VERSION=$(psql --version | cut -d' ' -f3)
        print_success "PostgreSQL $PSQL_VERSION found"
    else
        print_warning "PostgreSQL not found. Please install PostgreSQL 12+"
        print_status "Installation instructions:"
        if [[ "$OS" == "macos" ]]; then
            echo "  brew install postgresql"
        elif [[ "$OS" == "linux" ]]; then
            echo "  sudo apt install postgresql postgresql-contrib"
        else
            echo "  Download from https://www.postgresql.org/download/windows/"
        fi
    fi
    
    # Check Redis
    if command -v redis-server &> /dev/null; then
        REDIS_VERSION=$(redis-server --version | cut -d' ' -f3)
        print_success "Redis $REDIS_VERSION found"
    else
        print_warning "Redis not found. Please install Redis for Celery task queue"
        print_status "Installation instructions:"
        if [[ "$OS" == "macos" ]]; then
            echo "  brew install redis"
        elif [[ "$OS" == "linux" ]]; then
            echo "  sudo apt install redis-server"
        else
            echo "  Download from https://redis.io/download or use Docker"
        fi
    fi
}

# Setup backend
setup_backend() {
    print_status "Setting up backend..."
    
    cd backend
    
    # Create virtual environment
    if [[ ! -d "venv" ]]; then
        print_status "Creating Python virtual environment..."
        python3 -m venv venv
    fi
    
    # Activate virtual environment
    print_status "Activating virtual environment..."
    source venv/bin/activate
    
    # Install Python dependencies
    print_status "Installing Python dependencies..."
    pip install --upgrade pip
    pip install -r requirements.txt
    
    # Create .env file if it doesn't exist
    if [[ ! -f ".env" ]]; then
        print_status "Creating .env file..."
        cat > .env << EOF
# Database Configuration
DATABASE_URL=postgresql+asyncpg://data_user:password@localhost:5432/data_analysis

# Security
SECRET_KEY=your-super-secret-key-change-this-in-production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# Application Settings
ALLOW_GUEST_ACCESS=true
ENVIRONMENT=development

# Celery Configuration
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/0

# File Storage
UPLOAD_DIR=uploads
MAX_FILE_SIZE=10485760
EOF
        print_warning "Please update the .env file with your database credentials"
    fi
    
    # Create uploads directory
    mkdir -p uploads
    
    # Run database migrations
    print_status "Running database migrations..."
    alembic upgrade head
    
    print_success "Backend setup completed!"
    cd ..
}

# Setup frontend
setup_frontend() {
    print_status "Setting up frontend..."
    
    cd frontend
    
    # Install Node.js dependencies
    print_status "Installing Node.js dependencies..."
    npm install
    
    # Create .env.local file if it doesn't exist
    if [[ ! -f ".env.local" ]]; then
        print_status "Creating .env.local file..."
        cat > .env.local << EOF
# Backend API URL
NEXT_PUBLIC_BACKEND_URL=http://localhost:4700

# WebSocket URL for real-time updates
NEXT_PUBLIC_WS_URL=ws://localhost:4700
EOF
    fi
    
    print_success "Frontend setup completed!"
    cd ..
}

# Create database setup script
create_database_setup() {
    print_status "Creating database setup script..."
    
    cat > setup_database.sql << EOF
-- Database setup script for Data Analysis Platform
-- Run this script as PostgreSQL superuser

-- Create database
CREATE DATABASE data_analysis;

-- Create user
CREATE USER data_user WITH PASSWORD 'password';

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE data_analysis TO data_user;

-- Connect to the database
\c data_analysis;

-- Grant schema privileges
GRANT ALL ON SCHEMA public TO data_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO data_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO data_user;

-- Set default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO data_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO data_user;
EOF
    
    print_success "Database setup script created: setup_database.sql"
    print_warning "Please run this script as PostgreSQL superuser:"
    echo "  psql -U postgres -f setup_database.sql"
}

# Create startup scripts
create_startup_scripts() {
    print_status "Creating startup scripts..."
    
    # Backend startup script
    cat > start_backend.sh << 'EOF'
#!/bin/bash
cd backend
source venv/bin/activate
python -m uvicorn main:app --host 0.0.0.0 --port 4700 --reload
EOF
    chmod +x start_backend.sh
    
    # Frontend startup script
    cat > start_frontend.sh << 'EOF'
#!/bin/bash
cd frontend
npm run dev
EOF
    chmod +x start_frontend.sh
    
    # Celery worker startup script
    cat > start_celery.sh << 'EOF'
#!/bin/bash
cd backend
source venv/bin/activate
celery -A app.worker.celery_app worker --loglevel=info
EOF
    chmod +x start_celery.sh
    
    print_success "Startup scripts created:"
    echo "  - start_backend.sh"
    echo "  - start_frontend.sh"
    echo "  - start_celery.sh"
}

# Main setup function
main() {
    print_status "Starting Data Analysis Platform setup..."
    
    check_prerequisites
    setup_backend
    setup_frontend
    create_database_setup
    create_startup_scripts
    
    print_success "Setup completed successfully!"
    echo ""
    print_status "Next steps:"
    echo "1. Set up PostgreSQL database:"
    echo "   psql -U postgres -f setup_database.sql"
    echo ""
    echo "2. Update backend/.env with your database credentials"
    echo ""
    echo "3. Start the services:"
    echo "   ./start_backend.sh    # Terminal 1"
    echo "   ./start_frontend.sh   # Terminal 2"
    echo "   ./start_celery.sh     # Terminal 3"
    echo ""
    echo "4. Access the application:"
    echo "   Frontend: http://localhost:4800"
    echo "   Backend API: http://localhost:4700"
    echo "   API Docs: http://localhost:4700/docs"
    echo ""
    print_status "Happy coding! 🎉"
}

# Run main function
main "$@"