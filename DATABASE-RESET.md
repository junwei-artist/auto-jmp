# Database Reset Scripts

This directory contains scripts to reset the database and create a fresh admin user.

## Available Scripts

### 1. Shell Script (macOS)
```bash
./reset-database.command
```

**Features:**
- Automatically detects and uses PostgreSQL credentials from `.env` file
- Drops and recreates the entire database
- Creates fresh database tables
- Creates/updates admin user with default credentials
- Provides detailed status messages and error handling

### 2. Python Script (Cross-platform)
```bash
cd backend
source venv/bin/activate
python reset_db.py
```

**Features:**
- Same functionality as shell script
- Works on any platform with Python
- Can be run directly from the backend directory

## Admin Credentials

After running either script, you can login with:

- **Email**: `admin@admin.com`
- **Password**: `admin`

## What the Scripts Do

1. **Database Connection**: Connect to PostgreSQL using credentials from `.env` file
2. **Drop Tables**: Remove all existing database tables
3. **Create Tables**: Recreate all database tables using SQLAlchemy models
4. **Create Admin User**: Create or update the admin user with default credentials
5. **Verification**: Verify that the admin user was created successfully

## Prerequisites

- PostgreSQL must be running
- Virtual environment must be activated (for Python script)
- `.env` file must exist with correct `DATABASE_URL`
- All Python dependencies must be installed

## Usage Examples

### Quick Reset (macOS)
```bash
# From project root
./reset-database.command
```

### Manual Reset (Any Platform)
```bash
# From project root
cd backend
source venv/bin/activate
python reset_db.py
```

### After Reset
1. Start the backend: `./run-backend-dev.command`
2. Start the frontend: `./run-frontend-dev.command`
3. Login at: http://localhost:4800
4. Access admin dashboard: http://localhost:4800/admin/dashboard

## Troubleshooting

### Database Connection Issues
- Ensure PostgreSQL is running: `brew services start postgresql@14`
- Check `.env` file has correct `DATABASE_URL`
- Verify database user has proper permissions

### Permission Issues
- Make scripts executable: `chmod +x reset-database.command`
- Ensure virtual environment is activated

### Import Errors
- Run from correct directory (backend for Python script)
- Ensure all dependencies are installed: `pip install -r requirements.txt`
