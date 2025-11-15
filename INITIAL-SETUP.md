# Auto-JMP Initial Setup Guide

This document describes the complete initialization and setup process for the Auto-JMP platform, including conda environment creation, dependency installation, database setup, and service configuration.

## Overview

This setup process was performed on a Linux system and includes:
1. Conda environment creation
2. Backend and frontend dependency installation
3. Database setup
4. Configuration file setup
5. Path fixes for cross-platform compatibility
6. Service runner scripts creation

## Prerequisites

Before starting, ensure you have:
- **Linux system** (tested on Ubuntu/Debian)
- **PostgreSQL** installed and running
- **Redis** installed and running (for Celery worker)
- **Node.js 18+** installed
- **Internet connection** for downloading packages

## Step 1: Install Conda (Miniconda)

If conda is not already installed:

```bash
cd /home/junwei/service/auto-jmp
bash install-conda.sh
```

This script:
- Downloads Miniconda installer
- Installs to `~/miniconda3`
- Initializes conda for bash

After installation, accept the Terms of Service:
```bash
source ~/miniconda3/etc/profile.d/conda.sh
conda tos accept --override-channels --channel https://repo.anaconda.com/pkgs/main
conda tos accept --override-channels --channel https://repo.anaconda.com/pkgs/r
```

## Step 2: Create Conda Environment

Create a conda environment with Python 3.11:

```bash
source ~/miniconda3/etc/profile.d/conda.sh
conda create -n auto-jmp python=3.11 -y
```

This creates an isolated environment named `auto-jmp` with Python 3.11.

## Step 3: Install Backend Dependencies

Install all Python packages required by the backend:

```bash
cd /home/junwei/service/auto-jmp/backend
source ~/miniconda3/etc/profile.d/conda.sh
conda activate auto-jmp
pip install --upgrade pip
pip install -r requirements.txt
```

**Key dependencies installed:**
- FastAPI and Uvicorn (web framework)
- SQLAlchemy and asyncpg (database)
- Celery and Redis (background tasks)
- Pandas, NumPy, SciPy (data processing)
- Pillow, PyMuPDF (image/PDF processing)
- And many more (see `requirements.txt`)

## Step 4: Install Frontend Dependencies

Install Node.js packages for the frontend:

```bash
cd /home/junwei/service/auto-jmp/frontend
npm install
```

This installs all dependencies including:
- Next.js 14
- React 18
- TypeScript
- Tailwind CSS
- And other frontend libraries

## Step 5: Configure Backend Environment

Create and configure the backend `.env` file:

```bash
cd /home/junwei/service/auto-jmp/backend
cp env.example .env
```

**Key configuration in `.env`:**
- `DATABASE_URL`: PostgreSQL connection string
- `SECRET_KEY`: Application secret key
- `REDIS_URL`: Redis connection for Celery
- `CELERY_BROKER_URL`: Celery message broker
- `UPLOADS_DIR`: File upload directory (relative path)
- `TASKS_DIRECTORY`: Tasks directory (relative path)

**Important:** Update the database credentials in `.env`:
```env
DATABASE_URL=postgresql+asyncpg://data_user:data_userpassword@localhost/data_analysis
```

## Step 6: Fix Path Configuration

The original configuration had hardcoded macOS paths. These were fixed for Linux:

### 6.1 Update `.env` File

Changed from macOS paths to relative paths:
```env
# Before (macOS):
UPLOADS_DIR=/Users/lytech/Documents/service/auto-jmp/backend/uploads
TASKS_DIRECTORY=/Users/lytech/Documents/service/auto-jmp/backend/tasks

# After (Linux, relative):
UPLOADS_DIR=uploads
TASKS_DIRECTORY=tasks
```

### 6.2 Update `config.py`

Modified `backend/app/core/config.py` to calculate paths dynamically:

```python
# Before:
UPLOADS_DIR: str = os.getenv("UPLOADS_DIR", "/Users/lytech/Documents/service/auto-jmp/backend/uploads")

# After:
from pathlib import Path
_backend_dir = Path(__file__).resolve().parents[2]  # Go up from app/core/config.py to backend/
_default_uploads_dir = str(_backend_dir / "uploads")
UPLOADS_DIR: str = os.getenv("UPLOADS_DIR", _default_uploads_dir)
```

### 6.3 Create Required Directories

```bash
cd /home/junwei/service/auto-jmp/backend
mkdir -p uploads tasks
```

## Step 7: Set Up PostgreSQL Database

### 7.1 Create Database and User

Run the SQL script to create the database:

```bash
psql -U postgres -f setup-database.sql
```

Or manually:
```sql
CREATE DATABASE data_analysis;
CREATE USER data_user WITH PASSWORD 'data_userpassword';
GRANT ALL PRIVILEGES ON DATABASE data_analysis TO data_user;
\c data_analysis;
GRANT ALL ON SCHEMA public TO data_user;
```

### 7.2 Run Database Migrations

Apply Alembic migrations to create database tables:

```bash
cd /home/junwei/service/auto-jmp/backend
source ~/miniconda3/etc/profile.d/conda.sh
conda activate auto-jmp
alembic upgrade head
```

## Step 8: Create Admin User

Create the initial admin user:

```bash
cd /home/junwei/service/auto-jmp/backend
conda activate auto-jmp
python create_admin.py
```

This creates an admin user with:
- **Email**: `admin@admin.com`
- **Password**: `admin`

## Step 9: Create Service Runner Scripts

Created executable scripts for running services:

### 9.1 `run-backend.sh`
Starts the FastAPI backend server:
- Activates conda environment
- Starts uvicorn on port 4700
- Auto-reload enabled

### 9.2 `run-frontend.sh`
Starts the Next.js frontend:
- Runs on port 4800
- Auto-configures `.env.local`
- Hot reload enabled

### 9.3 `run-worker.sh`
Starts the Celery worker:
- Processes background tasks
- Requires Redis to be running
- Uses conda environment

### 9.4 `start.sh` (All-in-One)
Starts all three services together:
- Backend (background)
- Worker (background)
- Frontend (background)
- All logs saved to `/tmp/`

### 9.5 `run-all.sh`
Starts services in separate terminals:
- Backend and worker in current terminal
- Frontend in new terminal window

Make scripts executable:
```bash
chmod +x run-backend.sh run-frontend.sh run-worker.sh start.sh run-all.sh
```

## Step 10: Verify Setup

### 10.1 Check Services

Verify all services can start:

```bash
# Test backend
./run-backend.sh
# Should start on http://localhost:4700

# Test frontend (in another terminal)
./run-frontend.sh
# Should start on http://localhost:4800

# Test worker (in another terminal)
./run-worker.sh
# Should start processing tasks
```

### 10.2 Check Database Connection

```bash
psql -U data_user -d data_analysis -c "SELECT 1;"
```

### 10.3 Check Redis Connection

```bash
redis-cli ping
# Should return: PONG
```

## Complete Setup Summary

After completing all steps, you should have:

✅ **Conda Environment**: `auto-jmp` with Python 3.11  
✅ **Backend Dependencies**: All Python packages installed  
✅ **Frontend Dependencies**: All npm packages installed  
✅ **Database**: PostgreSQL database created and migrated  
✅ **Admin User**: Created with credentials (admin@admin.com / admin)  
✅ **Configuration**: `.env` files configured  
✅ **Directories**: `uploads/` and `tasks/` created  
✅ **Scripts**: Executable runner scripts created  
✅ **Path Fixes**: Cross-platform path configuration  

## Quick Start After Setup

Once setup is complete, start all services:

```bash
cd /home/junwei/service/auto-jmp
./start.sh
```

Access the application:
- **Frontend**: http://localhost:4800
- **Backend API**: http://localhost:4700
- **API Docs**: http://localhost:4700/docs
- **Login**: admin@admin.com / admin

## Troubleshooting

### Conda Environment Issues
```bash
# Activate conda
source ~/miniconda3/etc/profile.d/conda.sh

# List environments
conda env list

# Activate environment
conda activate auto-jmp
```

### Database Connection Issues
- Verify PostgreSQL is running: `pg_isready`
- Check credentials in `backend/.env`
- Ensure database exists: `psql -U postgres -l | grep data_analysis`

### Redis Connection Issues
- Check Redis is running: `redis-cli ping`
- Start Redis: `sudo systemctl start redis` (Linux)
- Verify Redis URL in `backend/.env`

### Path Issues
- Ensure `uploads/` and `tasks/` directories exist in `backend/`
- Check `.env` uses relative paths, not absolute macOS paths
- Verify `config.py` calculates paths dynamically

### Port Conflicts
```bash
# Find process using port
lsof -i :4700  # Backend
lsof -i :4800  # Frontend

# Kill process
kill -9 <PID>
```

## Files Created/Modified

### New Files Created
- `setup-conda.sh` - Conda setup script
- `install-conda.sh` - Conda installation helper
- `setup-database.sql` - Database setup SQL
- `setup-database.sh` - Database setup helper
- `run-backend.sh` - Backend runner
- `run-frontend.sh` - Frontend runner
- `run-worker.sh` - Worker runner
- `start.sh` - All-in-one runner
- `run-all.sh` - Multi-terminal runner
- `SETUP-COMPLETE.md` - Setup completion guide
- `RUN-SERVICES.md` - Service running guide
- `FIX-PATHS.md` - Path fix documentation
- `INITIAL-SETUP.md` - This document

### Files Modified
- `backend/.env` - Environment configuration (created from env.example)
- `backend/app/core/config.py` - Dynamic path calculation
- `frontend/.env.local` - Frontend environment (auto-created)

### Directories Created
- `backend/uploads/` - File upload directory
- `backend/tasks/` - Tasks directory
- `~/miniconda3/` - Conda installation
- `~/miniconda3/envs/auto-jmp/` - Conda environment

## Next Steps

After initial setup:

1. **Customize Configuration**: Edit `backend/.env` with your specific settings
2. **Create Additional Users**: Use the admin interface or API
3. **Configure Storage**: Set up S3/MinIO if needed (optional)
4. **Set Up SSL**: Configure HTTPS for production
5. **Set Up Monitoring**: Add logging and monitoring tools
6. **Backup Strategy**: Set up database backups

## Notes

- All paths are now relative or dynamically calculated for cross-platform compatibility
- The conda environment isolates Python dependencies
- Services can run together or separately based on your needs
- Logs are saved to `/tmp/` when using `start.sh` for easy debugging
- The worker requires Redis for background task processing

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review `SETUP-COMPLETE.md` for detailed next steps
3. Review `RUN-SERVICES.md` for service management
4. Check application logs in `/tmp/` or terminal output

---

**Setup Date**: November 15, 2025  
**System**: Linux (Ubuntu/Debian)  
**Python Version**: 3.11  
**Node.js Version**: 18+  
**Database**: PostgreSQL  
**Task Queue**: Redis + Celery

