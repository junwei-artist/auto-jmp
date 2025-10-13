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

## Testing the JMP Runner

To test the JMP runner functionality with demo files:

```bash
./test-runner.command
```

This script will:
- ✅ Test command line interface
- ✅ Test Python module integration  
- ✅ Verify image generation
- ✅ Run performance tests
- ✅ Check generated files and ZIP archives

**Requirements:**
- JMP installed on macOS
- Python 3.11 with virtual environment
- `applescript` package for automation

**Demo Files:**
- `demo/jmp_data_20251011_173619.csv` - Sample data file
- `demo/jsl_script_20251011_173619.jsl` - JMP script for visualization

**Expected Output:**
- 4 PNG images (FAI10.png, FAI38.png, FAI39.png, FAI40.png)
- ZIP archive with all results
- ~15-20 second execution time

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
python -m uvicorn main:app --host 0.0.0.0 --port 4700 --reload
```

The backend API will be available at `http://localhost:4700`

### 3. Frontend Setup

#### Install Node.js Dependencies

```bash
cd frontend
npm install
```

#### Environment Variables

Create a `.env.local` file in the `frontend` directory:
```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:4700
NEXT_PUBLIC_WS_URL=ws://localhost:4700
```

#### Start Frontend Development Server

```bash
npm run dev
```

#### Start Frontend Production Server

For production deployment, use the production script:

```bash
./run-production-frontend.command
```

This will:
- Build the application for production (if needed)
- Start the optimized production server
- Use port 4801 by default
- Enable performance optimizations

The frontend will be available at `http://localhost:4800` (development) or `http://localhost:4801` (production)

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
- **Frontend**: http://localhost:4800
- **Backend API**: http://localhost:4700
- **API Docs**: http://localhost:4700/docs

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
EXPOSE 4700

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "4700"]
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

#### Network Access Issues

**Problem**: Frontend loads from server IP but can't connect to backend (login/API calls fail)

**Solution**: Configure both frontend and backend for network access:

1. **Update Frontend Configuration** (`frontend/.env.local`):
   ```env
   # Replace localhost with your server IP
   NEXT_PUBLIC_API_URL=http://YOUR_SERVER_IP:4700
   NEXT_PUBLIC_WS_URL=ws://YOUR_SERVER_IP:4700
   ```

2. **Update Backend CORS** (`backend/.env`):
   ```env
   # Allow all origins for network access (recommended for development)
   BACKEND_CORS_ORIGINS=["*"]
   
   # Or specify individual origins for production:
   # BACKEND_CORS_ORIGINS=["http://localhost:4800", "http://localhost:4801", "http://YOUR_SERVER_IP:4800", "http://YOUR_SERVER_IP:4801", "http://CLIENT_IP:4800", "http://CLIENT_IP:4801"]
   ```

3. **Restart Both Services**:
   ```bash
   # Stop services
   pkill -f "uvicorn" && pkill -f "next dev"
   
   # Restart backend
   ./run-backend.command &
   
   # Restart frontend
   ./run-frontend.command &
   ```

**Note**: The frontend is configured to bind to `0.0.0.0` by default using the `--hostname` flag, making it accessible from the network. You should see `TCP *:iims (LISTEN)` in the port listing, indicating it's bound to all interfaces.

**Test CORS**: To verify CORS is working, test with:
```bash
curl -X OPTIONS http://YOUR_SERVER_IP:4700/api/v1/auth/login \
  -H "Origin: http://ANY_CLIENT_IP:4800" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type"
```
You should get a `200 OK` response with `access-control-allow-origin` header. With wildcard CORS (`["*"]`), any client IP will be accepted.

**Test Frontend Assets**: To verify frontend static assets are accessible:
```bash
curl -I http://YOUR_SERVER_IP:4800/_next/static/css/app/layout.css
```
You should get a `200 OK` response. The `allowedDevOrigins` configuration in `next.config.js` allows cross-origin requests to `/_next/*` resources.

#### File Upload Issues

**Problem**: JSL files rejected with "File type 'text/x-jmp-script' not allowed"

**Solution**: Update backend file type configuration (`backend/.env`):
```env
ALLOWED_FILE_TYPES=["text/csv", "application/octet-stream", "text/x-jmp-script", "text/plain"]
```

#### Authentication Issues

**Problem**: Can't log in or authentication fails

**Solutions**:
1. **Clear Browser Storage**: Clear localStorage and cookies
2. **Check Token Expiration**: Tokens expire after 30 minutes by default
3. **Verify Admin User**: Create admin user if needed:
   ```bash
   cd backend
   python create_admin.py
   ```
4. **Check Guest Access**: Ensure guest access is enabled in backend config

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

2. **Cross-Origin Resource Errors**
   - **Problem**: "Cross origin request detected from X.X.X.X to /_next/* resource"
   - **Solution**: Add `allowedDevOrigins` to `frontend/next.config.js`:
     ```javascript
     const nextConfig = {
       allowedDevOrigins: [
         'YOUR_SERVER_IP',
         'localhost',
         '127.0.0.1',
         '0.0.0.0'
       ],
       // ... rest of config
     }
     ```

3. **Hardcoded URL Issues**
   - **Problem**: Frontend uses hardcoded URLs instead of server IP
   - **Solution**: The frontend runner scripts now automatically detect and configure the server IP:
     - `run-frontend.command` and `run-production-frontend.command` automatically detect server IP
     - Updates `.env.local` with correct `NEXT_PUBLIC_FRONTEND_URL`
     - Frontend code uses environment variables instead of hardcoded URLs

4. **Build Errors**
   - Clear node_modules and reinstall
   - Check TypeScript errors
   - Verify environment variables

5. **Module Resolution Errors**
   - Ensure all dependencies are installed
   - Check import paths
   - Verify file extensions (.tsx vs .ts)

### Logs and Debugging

#### Backend Logs

```bash
# Enable debug logging
export LOG_LEVEL=DEBUG
python -m uvicorn main:app --host 0.0.0.0 --port 4700 --reload
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
