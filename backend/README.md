# Backend API Documentation

FastAPI-based backend for the Data Analysis Platform.

## Quick Start

### 1. Environment Setup

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### 2. Database Setup

#### PostgreSQL Installation

**macOS (using Homebrew):**
```bash
brew install postgresql
brew services start postgresql
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
```

**Windows:**
Download and install from [postgresql.org](https://www.postgresql.org/download/windows/)

#### Create Database

```bash
# Connect to PostgreSQL
psql -U postgres

# Create database and user
CREATE DATABASE data_analysis;
CREATE USER data_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE data_analysis TO data_user;
\q
```

### 3. Configuration

#### Environment Variables

Create a `.env` file in the backend directory:

```env
# Database Configuration
DATABASE_URL=postgresql+asyncpg://data_user:your_password@localhost:5432/data_analysis

# Security
SECRET_KEY=your-super-secret-key-change-this-in-production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# Application Settings
ALLOW_GUEST_ACCESS=true
ENVIRONMENT=development

# Celery Configuration (for background tasks)
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/0

# File Storage
UPLOAD_DIR=uploads
MAX_FILE_SIZE=10485760  # 10MB

# JMP Configuration (if using JMP for analysis)
JMP_PATH=/Applications/JMP.app/Contents/MacOS/JMP  # macOS
# JMP_PATH=C:\Program Files\SAS\JMP\18\JMP.exe  # Windows
```

#### Redis Setup (for Celery)

**macOS:**
```bash
brew install redis
brew services start redis
```

**Ubuntu/Debian:**
```bash
sudo apt install redis-server
sudo systemctl start redis-server
```

**Windows:**
Download from [redis.io](https://redis.io/download) or use Docker

### 4. Database Migration

```bash
# Initialize Alembic (if not already done)
alembic init alembic

# Create initial migration
alembic revision --autogenerate -m "Initial migration"

# Apply migrations
alembic upgrade head
```

### 5. Create Admin User

```bash
python create_admin.py
```

Follow the prompts to create an admin user.

### 6. Start the Server

```bash
# Development server with auto-reload
python -m uvicorn main:app --host 0.0.0.0 --port 4700 --reload

# Production server
python -m uvicorn main:app --host 0.0.0.0 --port 4700
```

The API will be available at:
- **API**: http://localhost:4700
- **Interactive API Docs**: http://localhost:4700/docs
- **ReDoc Documentation**: http://localhost:4700/redoc

### 7. Start Celery Worker

In a separate terminal:

```bash
celery -A app.worker.celery_app worker --loglevel=info
```

## API Endpoints

### Authentication

- `POST /api/v1/auth/login` - User login
- `POST /api/v1/auth/register` - User registration
- `POST /api/v1/auth/guest` - Create guest session
- `POST /api/v1/auth/refresh` - Refresh access token

### Projects

- `GET /api/v1/projects/` - List projects
- `POST /api/v1/projects/` - Create project
- `GET /api/v1/projects/{project_id}` - Get project details
- `PATCH /api/v1/projects/{project_id}` - Update project
- `DELETE /api/v1/projects/{project_id}` - Delete project
- `GET /api/v1/projects/{project_id}/runs` - List project runs
- `GET /api/v1/projects/{project_id}/artifacts` - List project artifacts

### Runs

- `GET /api/v1/runs/` - List runs
- `POST /api/v1/runs/` - Create run
- `GET /api/v1/runs/{run_id}` - Get run details
- `DELETE /api/v1/runs/{run_id}` - Delete run

### Public Access

- `GET /api/v1/projects/public/{project_id}` - Get public project
- `GET /api/v1/projects/public/{project_id}/runs` - List public project runs
- `GET /api/v1/projects/public/{project_id}/artifacts` - List public project artifacts
- `GET /api/v1/projects/public/{project_id}/artifacts/{artifact_id}/download` - Download public artifact

### Admin

- `GET /api/v1/admin/stats` - Get platform statistics
- `GET /api/v1/admin/users` - List all users
- `GET /api/v1/admin/projects` - List all projects
- `GET /api/v1/admin/runs` - List all runs
- `GET /api/v1/admin/settings` - Get system settings

### File Upload

- `POST /api/v1/uploads/presign` - Get presigned upload URL
- `POST /api/v1/uploads/{storage_key}` - Upload file

## Database Models

### AppUser
- `id`: UUID primary key
- `email`: Optional email address
- `password_hash`: Hashed password
- `is_guest`: Boolean flag for guest users
- `is_admin`: Boolean flag for admin users
- `created_at`: Timestamp

### Project
- `id`: UUID primary key
- `name`: Project name
- `description`: Optional description
- `owner_id`: Foreign key to AppUser
- `allow_guest`: Boolean flag for guest access
- `is_public`: Boolean flag for public sharing
- `created_at`: Timestamp
- `deleted_at`: Soft delete timestamp

### Run
- `id`: UUID primary key
- `project_id`: Foreign key to Project
- `started_by`: Foreign key to AppUser
- `status`: Run status (queued, running, completed, failed)
- `task_name`: Name of the analysis task
- `message`: Status message
- `image_count`: Number of output images
- `created_at`: Timestamp
- `started_at`: Start timestamp
- `finished_at`: Completion timestamp
- `deleted_at`: Soft delete timestamp

### Artifact
- `id`: UUID primary key
- `project_id`: Foreign key to Project
- `run_id`: Optional foreign key to Run
- `kind`: Artifact type (input_csv, input_jsl, output_png, etc.)
- `storage_key`: File storage identifier
- `filename`: Original filename
- `mime_type`: MIME type
- `size_bytes`: File size
- `created_at`: Timestamp

## Configuration Options

### Core Settings (`app/core/config.py`)

```python
class Settings:
    # Database
    DATABASE_URL: str
    
    # Security
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    # Application
    ALLOW_GUEST_ACCESS: bool = True
    ENVIRONMENT: str = "development"
    
    # File Storage
    UPLOAD_DIR: str = "uploads"
    MAX_FILE_SIZE: int = 10485760  # 10MB
    
    # Celery
    CELERY_BROKER_URL: str
    CELERY_RESULT_BACKEND: str
```

### Database Configuration

The application uses SQLAlchemy with asyncpg for PostgreSQL:

```python
# Database URL format
DATABASE_URL = "postgresql+asyncpg://username:password@host:port/database"

# Connection pool settings
engine = create_async_engine(
    DATABASE_URL,
    pool_size=20,
    max_overflow=0,
    pool_pre_ping=True,
    pool_recycle=300,
)
```

## Development

### Adding New Endpoints

1. Create endpoint file in `app/api/v1/endpoints/`
2. Define Pydantic models for request/response
3. Add route to `app/api/v1/api.py`
4. Update database models if needed
5. Create migration if database changes

### Database Migrations

```bash
# Create new migration
alembic revision --autogenerate -m "Description of changes"

# Apply migrations
alembic upgrade head

# Rollback migration
alembic downgrade -1

# Show migration history
alembic history
```

### Testing

```bash
# Install test dependencies
pip install pytest pytest-asyncio httpx

# Run tests
pytest

# Run with coverage
pytest --cov=app --cov-report=html
```

### Logging

Configure logging in `main.py`:

```python
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
```

## Production Deployment

### Environment Variables

```env
DATABASE_URL=postgresql+asyncpg://user:pass@host:port/db
SECRET_KEY=production-secret-key
ENVIRONMENT=production
ALLOW_GUEST_ACCESS=true
```

### Docker Deployment

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .

# Create upload directory
RUN mkdir -p uploads

# Expose port
EXPOSE 4700

# Start server
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "4700"]
```

### Nginx Configuration

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:4700;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /ws {
        proxy_pass http://localhost:4700;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Troubleshooting

### Common Issues

1. **Database Connection Errors**
   - Verify PostgreSQL is running
   - Check connection string format
   - Ensure database exists

2. **Migration Errors**
   - Check Alembic configuration
   - Verify database permissions
   - Run migrations in order

3. **Celery Worker Issues**
   - Ensure Redis is running
   - Check Celery configuration
   - Verify task imports

4. **File Upload Issues**
   - Check upload directory permissions
   - Verify file size limits
   - Ensure storage configuration

### Debug Mode

Enable debug logging:

```python
import logging
logging.basicConfig(level=logging.DEBUG)
```

### Health Check

The API provides a health check endpoint:

```bash
curl http://localhost:4700/health
```

## Security Considerations

1. **Authentication**: JWT tokens with expiration
2. **Authorization**: Role-based access control
3. **Input Validation**: Pydantic models for all inputs
4. **SQL Injection**: SQLAlchemy ORM protection
5. **File Upload**: File type and size validation
6. **CORS**: Configured for frontend domain

## Performance Optimization

1. **Database**: Connection pooling, indexes
2. **Caching**: Redis for session storage
3. **File Storage**: Efficient file handling
4. **Background Tasks**: Celery for long-running operations
5. **API**: Async/await for concurrent requests
