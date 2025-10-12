# Data Analysis Platform

A web-based platform for data analysis using JMP (Statistical Discovery Software) with a modern React frontend and FastAPI backend.

## Features

- **Project Management**: Create, manage, and share data analysis projects
- **File Upload**: Upload CSV data files and JSL (JMP Scripting Language) scripts
- **Analysis Execution**: Run JMP analysis scripts on uploaded data
- **Real-time Updates**: WebSocket-based real-time status updates for analysis runs
- **Public Sharing**: Share projects publicly via URLs
- **Guest Access**: Full functionality available for guest users
- **Admin Dashboard**: Administrative interface for platform management
- **Image Gallery**: View and download analysis results and charts

## Architecture

- **Frontend**: Next.js 14 with React, TypeScript, Tailwind CSS
- **Backend**: FastAPI with Python 3.11
- **Database**: PostgreSQL with SQLAlchemy ORM
- **Task Queue**: Celery with Redis
- **Real-time**: WebSocket support
- **Storage**: Local file system (configurable)

## Prerequisites

- Python 3.11+
- Node.js 18+
- PostgreSQL 12+
- Redis (for Celery task queue)
- JMP Software (for analysis execution)

## Quick Start

### Option 1: Automated Setup (Recommended)

Run the automated setup script:

```bash
git clone <repository-url>
cd data-analysis
chmod +x setup.sh
./setup.sh
```

### Option 2: Manual Setup

### 1. Clone the Repository

```bash
git clone <repository-url>
cd data-analysis
```

### 2. Backend Setup

#### Install Python Dependencies

```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

#### Database Configuration

1. Create a PostgreSQL database:
```sql
CREATE DATABASE data_analysis;
```

2. Update database configuration in `backend/app/core/config.py`:
```python
DATABASE_URL = "postgresql+asyncpg://username:password@localhost:5432/data_analysis"
```

#### Environment Variables

Create a `.env` file in the `backend` directory:
```env
DATABASE_URL=postgresql+asyncpg://username:password@localhost:5432/data_analysis
SECRET_KEY=your-secret-key-here
ALLOW_GUEST_ACCESS=true
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/0
```

#### Database Migration

```bash
cd backend
source venv/bin/activate
alembic upgrade head
```

#### Create Admin User

```bash
python create_admin.py
```

#### Start Backend Server

```bash
source venv/bin/activate
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

The backend API will be available at `http://localhost:8000`

### 3. Frontend Setup

#### Install Node.js Dependencies

```bash
cd frontend
npm install
```

#### Environment Variables

Create a `.env.local` file in the `frontend` directory:
```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000
```

#### Start Frontend Development Server

```bash
npm run dev
```

The frontend will be available at `http://localhost:3000` (or `http://localhost:3001` if port 3000 is in use)

### 4. Celery Worker Setup

In a separate terminal, start the Celery worker:

```bash
cd backend
source venv/bin/activate
celery -A app.worker.celery_app worker --loglevel=info
```

## Configuration Details

### Backend Configuration

#### Database Models

The platform uses the following main models:
- **AppUser**: User accounts (including guest users)
- **Project**: Data analysis projects
- **Run**: Analysis execution runs
- **Artifact**: Files associated with projects and runs
- **ProjectMember**: Project membership and permissions

#### API Endpoints

- **Authentication**: `/api/v1/auth/` - Login, register, guest access
- **Projects**: `/api/v1/projects/` - Project CRUD operations
- **Runs**: `/api/v1/runs/` - Analysis run management
- **Admin**: `/api/v1/admin/` - Administrative functions
- **Public**: `/api/v1/projects/public/` - Public project access

#### Guest Access

Guest users have full access to all features:
- Create and manage projects
- Upload files and run analyses
- View and delete projects and runs
- Access public projects

### Frontend Configuration

#### Authentication

The frontend supports three types of users:
- **Registered Users**: Full account with email/password
- **Guest Users**: Temporary access with full functionality
- **Admin Users**: Administrative privileges

#### Key Components

- **Dashboard**: Main interface for project management
- **Project Page**: Individual project details and run management
- **Admin Dashboard**: Administrative interface
- **Public Pages**: Public project viewing without authentication

#### Real-time Updates

WebSocket integration provides real-time updates for:
- Run status changes
- Analysis progress
- System notifications

## Development

### Backend Development

#### Adding New API Endpoints

1. Create endpoint in `app/api/v1/endpoints/`
2. Add route to `app/api/v1/api.py`
3. Update Pydantic models for request/response validation
4. Add database migrations if needed

#### Database Migrations

```bash
# Create new migration
alembic revision --autogenerate -m "Description of changes"

# Apply migrations
alembic upgrade head

# Rollback migration
alembic downgrade -1
```

#### Testing

```bash
# Run tests
pytest

# Run with coverage
pytest --cov=app
```

### Frontend Development

#### Adding New Pages

1. Create page in `app/` directory
2. Add routing as needed
3. Update navigation components
4. Add TypeScript interfaces for data models

#### Styling

The project uses Tailwind CSS for styling. Key design patterns:
- Card-based layouts
- Responsive grid systems
- Consistent color scheme
- Loading states and error handling

#### State Management

- **React Query**: Server state management and caching
- **React Context**: Authentication and global state
- **Local State**: Component-specific state with useState

## Docker Deployment

### Quick Start with Docker

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

The application will be available at:
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs

### Docker Services

- **postgres**: PostgreSQL database
- **redis**: Redis for Celery task queue
- **backend**: FastAPI backend service
- **celery**: Celery worker for background tasks
- **frontend**: Next.js frontend application

## Deployment

### Backend Deployment

#### Production Environment Variables

```env
DATABASE_URL=postgresql+asyncpg://username:password@host:port/database
SECRET_KEY=production-secret-key
ALLOW_GUEST_ACCESS=true
ENVIRONMENT=production
```

#### Docker Deployment

```dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .
EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Frontend Deployment

#### Production Build

```bash
npm run build
npm start
```

#### Environment Variables for Production

```env
NEXT_PUBLIC_BACKEND_URL=https://your-api-domain.com
NEXT_PUBLIC_WS_URL=wss://your-api-domain.com
```

## Troubleshooting

### Common Issues

#### Backend Issues

1. **Database Connection Errors**
   - Verify PostgreSQL is running
   - Check database credentials
   - Ensure database exists

2. **Migration Errors**
   - Check Alembic configuration
   - Verify database URL format
   - Run migrations in correct order

3. **Celery Worker Issues**
   - Ensure Redis is running
   - Check Celery configuration
   - Verify task imports

#### Frontend Issues

1. **API Connection Errors**
   - Verify backend URL configuration
   - Check CORS settings
   - Ensure backend is running

2. **Authentication Issues**
   - Clear browser localStorage
   - Check token expiration
   - Verify guest access settings

3. **Build Errors**
   - Clear node_modules and reinstall
   - Check TypeScript errors
   - Verify environment variables

### Logs and Debugging

#### Backend Logs

```bash
# Enable debug logging
export LOG_LEVEL=DEBUG
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

#### Frontend Debugging

```bash
# Enable debug mode
npm run dev -- --debug
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

[Add your license information here]

## Documentation

- **[Backend Documentation](backend/README.md)**: Detailed backend API documentation
- **[Frontend Documentation](frontend/README.md)**: Frontend development guide
- **[Environment Variables](env.example)**: Configuration template

## Support

For support and questions:
- Create an issue in the repository
- Check the troubleshooting section
- Review the API documentation at `/docs` when the backend is running
- Check the detailed documentation in the `backend/` and `frontend/` directories
