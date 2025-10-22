#!/bin/zsh

# This script resets the database and creates a fresh admin user.

# --- Configuration ---
PROJECT_ROOT="$(dirname "$0")"
BACKEND_DIR="$PROJECT_ROOT/backend"
VENV_DIR="$BACKEND_DIR/venv"
PYTHON_VERSION="3.11"

# --- Helper Functions ---
print_status() {
    echo "[\033[0;34mINFO\033[0m] $1"
}

print_success() {
    echo "[\033[0;32mSUCCESS\033[0m] $1"
}

print_warning() {
    echo "[\033[0;33mWARNING\033[0m] $1"
}

print_error() {
    echo "[\033[0;31mERROR\033[0m] $1"
}

# --- Script Start ---
echo "🗄️  Database Reset & Admin Creation"
echo "===================================="

# Navigate to the backend directory
if [ ! -d "$BACKEND_DIR" ]; then
    print_error "Backend directory not found at $BACKEND_DIR"
    exit 1
fi
cd "$BACKEND_DIR" || exit 1
print_status "Navigated to backend directory: $(pwd)"

# Check for Python 3.11
if ! command -v python$PYTHON_VERSION &> /dev/null; then
    print_error "Python $PYTHON_VERSION is not installed. Please run install-backend.command first."
    exit 1
fi
print_success "Python $PYTHON_VERSION found: $(python$PYTHON_VERSION --version)"

# Activate virtual environment
if [ ! -d "venv" ]; then
    print_error "Virtual environment not found at ./venv. Please run install-backend.command first."
    exit 1
fi

source "venv/bin/activate"
if [ $? -ne 0 ]; then
    print_error "Failed to activate virtual environment."
    exit 1
fi
print_success "Virtual environment activated: $VIRTUAL_ENV"

# Check if PostgreSQL is running
print_status "Checking if PostgreSQL is running..."
if ! pgrep -x "postgres" > /dev/null; then
    print_warning "PostgreSQL is not running. Attempting to start it via Homebrew..."
    if command -v brew &> /dev/null; then
        brew services start postgresql@14
        sleep 3 # Give PostgreSQL a moment to start
        if pgrep -x "postgres" > /dev/null; then
            print_success "PostgreSQL started successfully."
        else
            print_error "Failed to start PostgreSQL. Please start it manually (e.g., 'brew services start postgresql@14')."
            deactivate
            exit 1
        fi
    else
        print_error "Homebrew not found. Please install PostgreSQL manually and ensure it's running."
        deactivate
        exit 1
    fi
else
    print_success "PostgreSQL is already running."
fi

# Get PostgreSQL credentials from .env file
if [ ! -f ".env" ]; then
    print_error ".env file not found. Please run install-backend.command first."
    deactivate
    exit 1
fi

# Extract database URL from .env
DATABASE_URL=$(grep "^DATABASE_URL=" .env | cut -d'=' -f2-)
if [ -z "$DATABASE_URL" ]; then
    print_error "DATABASE_URL not found in .env file."
    deactivate
    exit 1
fi

# Parse database credentials
# Format: postgresql+asyncpg://username:password@host:port/database
DB_USER=$(echo "$DATABASE_URL" | sed -n 's/.*:\/\/\([^:]*\):.*/\1/p')
DB_PASSWORD=$(echo "$DATABASE_URL" | sed -n 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/p')
DB_HOST=$(echo "$DATABASE_URL" | sed -n 's/.*@\([^:]*\):.*/\1/p')
DB_PORT=$(echo "$DATABASE_URL" | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
DB_NAME=$(echo "$DATABASE_URL" | sed -n 's/.*\/\([^?]*\).*/\1/p')

print_status "Database configuration:"
print_status "  Host: $DB_HOST"
print_status "  Port: $DB_PORT"
print_status "  Database: $DB_NAME"
print_status "  User: $DB_USER"

# Test database connection
print_status "Testing database connection..."
export PGPASSWORD="$DB_PASSWORD"
if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" > /dev/null 2>&1; then
    print_success "Database connection successful."
else
    print_error "Failed to connect to database. Please check your credentials."
    deactivate
    exit 1
fi

# Drop and recreate database
print_status "Dropping existing database..."
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS $DB_NAME;" > /dev/null 2>&1
if [ $? -eq 0 ]; then
    print_success "Database dropped successfully."
else
    print_warning "Failed to drop database (may not exist)."
fi

print_status "Creating new database..."
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;" > /dev/null 2>&1
if [ $? -eq 0 ]; then
    print_success "Database created successfully."
else
    print_error "Failed to create database."
    deactivate
    exit 1
fi

# Create database tables using SQLAlchemy
print_status "Creating database tables..."
python -c "
import asyncio
import sys
import os
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from app.core.database import Base
from app.models import *

async def create_tables():
    engine = create_async_engine('$DATABASE_URL')
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await engine.dispose()
    print('✅ Database tables created successfully.')

asyncio.run(create_tables())
"

if [ $? -ne 0 ]; then
    print_error "Failed to create database tables."
    deactivate
    exit 1
fi

# Create admin user
print_status "Creating admin user..."
python -c "
import asyncio
import sys
import os
import uuid
from datetime import datetime
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from app.models import AppUser
from app.core.auth import get_password_hash

async def create_admin():
    engine = create_async_engine('$DATABASE_URL')
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    
    async with session_factory() as db:
        # Check if admin user already exists
        from sqlalchemy import select
        result = await db.execute(select(AppUser).where(AppUser.email == 'admin@admin.com'))
        existing_admin = result.scalar_one_or_none()
        
        if existing_admin:
            print('⚠️  Admin user already exists. Updating password...')
            existing_admin.password_hash = get_password_hash('admin')
            existing_admin.last_login = datetime.utcnow()
        else:
            print('➕ Creating new admin user...')
            admin_user = AppUser(
                id=uuid.uuid4(),
                email='admin@admin.com',
                password_hash=get_password_hash('admin'),
                is_admin=True,
                is_guest=False,
                created_at=datetime.utcnow()
            )
            db.add(admin_user)
        
        await db.commit()
        print('✅ Admin user created/updated successfully!')
        print('   Email: admin@admin.com')
        print('   Password: admin')
    
    await engine.dispose()

asyncio.run(create_admin())
"

if [ $? -ne 0 ]; then
    print_error "Failed to create admin user."
    deactivate
    exit 1
fi

# Verify admin user
print_status "Verifying admin user..."
python -c "
import asyncio
import sys
import os
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from app.models import AppUser
from sqlalchemy import select

async def verify_admin():
    engine = create_async_engine('$DATABASE_URL')
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    
    async with session_factory() as db:
        result = await db.execute(select(AppUser).where(AppUser.email == 'admin@admin.com'))
        admin_user = result.scalar_one_or_none()
        
        if admin_user:
            print('✅ Admin user verified:')
            print(f'   ID: {admin_user.id}')
            print(f'   Email: {admin_user.email}')
            print(f'   Is Admin: {admin_user.is_admin}')
            print(f'   Is Guest: {admin_user.is_guest}')
            print(f'   Created: {admin_user.created_at}')
        else:
            print('❌ Admin user not found!')
            return False
    
    await engine.dispose()
    return True

success = asyncio.run(verify_admin())
sys.exit(0 if success else 1)
"

if [ $? -eq 0 ]; then
    print_success "Database reset and admin user creation completed successfully!"
    echo ""
    echo "🎉 Ready to use!"
    echo "================"
    echo "You can now login with:"
    echo "  Email: admin@admin.com"
    echo "  Password: admin"
    echo ""
    echo "Frontend: http://localhost:4800"
    echo "Backend:  http://localhost:4700"
    echo "Admin Dashboard: http://localhost:4800/admin/dashboard"
else
    print_error "Failed to verify admin user."
    deactivate
    exit 1
fi

# Deactivate virtual environment
deactivate
print_success "Database reset complete!"
