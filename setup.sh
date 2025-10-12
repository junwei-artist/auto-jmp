#!/bin/bash

# Data Analysis Platform Setup Script
# This script sets up the complete data analysis platform with JMP boxplot functionality

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

# Check if we're on macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
    print_error "This platform requires macOS for JMP integration"
    exit 1
fi

print_status "Checking system requirements..."

# Check for required tools
check_command() {
    if ! command -v $1 &> /dev/null; then
        print_error "$1 is not installed. Please install it first."
        exit 1
    fi
}

# Check for Python 3.8+
if ! python3 -c "import sys; exit(0 if sys.version_info >= (3, 8) else 1)" 2>/dev/null; then
    print_error "Python 3.8+ is required"
    exit 1
fi

# Check for Node.js 18+
if ! node -e "process.exit(0 if parseInt(process.version.slice(1).split('.')[0]) >= 18 else 1)" 2>/dev/null; then
    print_error "Node.js 18+ is required"
    exit 1
fi

check_command "docker"
check_command "docker-compose"
check_command "git"

print_success "System requirements check passed"

# Create environment files
print_status "Setting up environment configuration..."

# Backend environment
if [ ! -f backend/.env ]; then
    cp backend/env.example backend/.env
    print_success "Created backend/.env file"
else
    print_warning "backend/.env already exists, skipping..."
fi

# Frontend environment
if [ ! -f frontend/.env.local ]; then
    cat > frontend/.env.local << EOF
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000
EOF
    print_success "Created frontend/.env.local file"
else
    print_warning "frontend/.env.local already exists, skipping..."
fi

# Setup backend
print_status "Setting up backend..."

cd backend

# Create virtual environment
if [ ! -d "venv" ]; then
    python3 -m venv venv
    print_success "Created Python virtual environment"
fi

# Activate virtual environment
source venv/bin/activate

# Install Python dependencies
print_status "Installing Python dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

# Initialize Alembic
if [ ! -d "alembic/versions" ]; then
    alembic init alembic
    print_success "Initialized Alembic for database migrations"
fi

cd ..

# Setup frontend
print_status "Setting up frontend..."

cd frontend

# Install Node.js dependencies
print_status "Installing Node.js dependencies..."
npm install

cd ..

# Setup Docker services
print_status "Setting up Docker services..."

# Create docker-compose.yml
cat > docker-compose.yml << 'EOF'
version: '3.8'

services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: data_analysis
      POSTGRES_USER: user
      POSTGRES_PASSWORD: password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U user -d data_analysis"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin123
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - minio_data:/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 30s
      timeout: 20s
      retries: 3

volumes:
  postgres_data:
  redis_data:
  minio_data:
EOF

print_success "Created docker-compose.yml"

# Start Docker services
print_status "Starting Docker services..."
docker-compose up -d

# Wait for services to be ready
print_status "Waiting for services to be ready..."
sleep 10

# Check if services are running
if ! docker-compose ps | grep -q "Up"; then
    print_error "Failed to start Docker services"
    exit 1
fi

print_success "Docker services started successfully"

# Setup database
print_status "Setting up database..."

cd backend
source venv/bin/activate

# Run database migrations
alembic upgrade head

print_success "Database setup completed"

cd ..

# Create startup scripts
print_status "Creating startup scripts..."

# Backend startup script
cat > start-backend.sh << 'EOF'
#!/bin/bash
cd backend
source venv/bin/activate
export PYTHONPATH="${PYTHONPATH}:$(pwd)"
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
EOF

# Celery worker startup script
cat > start-worker.sh << 'EOF'
#!/bin/bash
cd backend
source venv/bin/activate
export PYTHONPATH="${PYTHONPATH}:$(pwd)"
celery -A app.worker.celery_app worker --loglevel=info --queue=jmp
EOF

# Frontend startup script
cat > start-frontend.sh << 'EOF'
#!/bin/bash
cd frontend
npm run dev
EOF

# Make scripts executable
chmod +x start-backend.sh start-worker.sh start-frontend.sh

print_success "Created startup scripts"

# Create comprehensive README
cat > README.md << 'EOF'
# Data Analysis Platform

A comprehensive data analysis platform with JMP boxplot functionality, real-time processing, and interactive image galleries.

## Features

- **JMP Integration**: Upload CSV and JSL files to generate boxplot visualizations
- **Real-time Processing**: Watch analysis progress with live WebSocket updates
- **Interactive Gallery**: Zoom, pan, and navigate through generated images
- **User Management**: JWT authentication with guest access support
- **Project Sharing**: Share results via email or public links
- **Admin Interface**: Manage users, projects, and system settings

## Architecture

- **Frontend**: Next.js 14 with Tailwind CSS and shadcn/ui
- **Backend**: FastAPI with PostgreSQL and Redis
- **Worker**: Celery with macOS-specific JMP integration
- **Storage**: MinIO (S3-compatible) for file storage
- **Real-time**: WebSocket for live progress updates

## Prerequisites

- macOS (required for JMP integration)
- Python 3.8+
- Node.js 18+
- Docker and Docker Compose
- JMP software installed

## Quick Start

1. **Run the setup script**:
   ```bash
   chmod +x setup.sh
   ./setup.sh
   ```

2. **Start the services**:
   ```bash
   # Terminal 1: Backend API
   ./start-backend.sh
   
   # Terminal 2: Celery Worker (on macOS)
   ./start-worker.sh
   
   # Terminal 3: Frontend
   ./start-frontend.sh
   ```

3. **Access the application**:
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8000
   - MinIO Console: http://localhost:9001 (minioadmin/minioadmin123)

## Configuration

### Backend Configuration

Edit `backend/.env`:

```env
# Database
DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/data_analysis

# Redis
REDIS_URL=redis://localhost:6379

# Security
SECRET_KEY=your-secret-key-change-in-production

# Object Storage
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin123
S3_BUCKET=data-analysis-platform
S3_ENDPOINT_URL=http://localhost:9000

# JMP Configuration
JMP_TASK_DIR=/tmp/jmp_tasks
JMP_MAX_WAIT_TIME=300
JMP_START_DELAY=4
```

### Frontend Configuration

Edit `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000
```

## Usage

### Creating a Project

1. Sign up for an account or use guest access
2. Click "New Project" to create a project
3. Upload CSV and JSL files
4. Start the analysis run

### Guest Access

- Limited file size (10MB)
- Cannot create projects
- Rate limited (10 requests/hour)
- Perfect for trying the platform

### JMP Integration

The platform integrates with JMP through:
- AppleScript automation
- macOS-specific worker processes
- Queue management for single JMP instance
- Progress monitoring and error handling

## API Documentation

Once the backend is running, visit:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## Development

### Backend Development

```bash
cd backend
source venv/bin/activate
uvicorn main:app --reload
```

### Frontend Development

```bash
cd frontend
npm run dev
```

### Database Migrations

```bash
cd backend
source venv/bin/activate
alembic revision --autogenerate -m "Description"
alembic upgrade head
```

## Troubleshooting

### JMP Permissions

If JMP automation fails:
1. Go to System Preferences → Security & Privacy
2. Privacy tab → Automation
3. Enable Terminal/Python for JMP

### Docker Issues

```bash
# Reset Docker services
docker-compose down -v
docker-compose up -d
```

### Database Issues

```bash
# Reset database
docker-compose down -v
docker-compose up -d postgres
cd backend && source venv/bin/activate && alembic upgrade head
```

## Production Deployment

For production deployment:

1. Use a proper PostgreSQL instance
2. Configure Redis clustering
3. Set up S3-compatible storage
4. Use a reverse proxy (nginx)
5. Enable HTTPS
6. Configure proper logging and monitoring

## License

This project is licensed under the MIT License.
EOF

print_success "Created comprehensive README.md"

# Final instructions
echo ""
print_success "🎉 Setup completed successfully!"
echo ""
print_status "Next steps:"
echo "1. Start the backend: ./start-backend.sh"
echo "2. Start the Celery worker (on macOS): ./start-worker.sh"
echo "3. Start the frontend: ./start-frontend.sh"
echo "4. Open http://localhost:3000 in your browser"
echo ""
print_warning "Important: The Celery worker must run on macOS for JMP integration"
echo ""
print_status "Services running:"
echo "- PostgreSQL: localhost:5432"
echo "- Redis: localhost:6379"
echo "- MinIO: localhost:9000 (Console: localhost:9001)"
echo "- Backend API: localhost:8000"
echo "- Frontend: localhost:3000"
echo ""
print_status "Default credentials:"
echo "- MinIO: minioadmin / minioadmin123"
echo "- Database: user / password"
echo ""
print_success "Happy analyzing! 📊"
