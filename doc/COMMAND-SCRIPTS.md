# Data Analysis Platform - Command Scripts

This directory contains macOS command scripts for easy installation and running of the Data Analysis Platform.

## 📋 Available Scripts

### Backend Scripts

#### `install-backend.command`
**Purpose**: Installs Python backend dependencies and sets up the environment

**What it does**:
- ✅ Checks if Python 3.13 exists (installs via Homebrew if missing)
- ✅ Creates a Python virtual environment
- ✅ Activates the virtual environment
- ✅ Installs all dependencies from `requirements.txt`
- ✅ Creates `.env` configuration file from template
- ✅ Initializes Alembic for database migrations

**Usage**:
```bash
./install-backend.command
```

**Requirements**:
- macOS (for Homebrew)
- Internet connection (for downloading packages)

---

#### `run-backend.command`
**Purpose**: Starts the FastAPI backend service with intelligent port management

**What it does**:
- ✅ Creates and checks configuration file for port settings
- ✅ Activates the virtual environment
- ✅ Checks if the configured port is in use
- ✅ Offers options to kill existing processes or use different port
- ✅ Runs database migrations
- ✅ Starts the FastAPI backend service

**Usage**:
```bash
./run-backend.command
```

**Features**:
- **Port Management**: Automatically detects port conflicts and offers solutions
- **Configuration Persistence**: Remembers your port choice for future runs
- **Database Migrations**: Automatically runs pending migrations
- **Error Handling**: Comprehensive error checking and user guidance

**Default Port**: 4700

---

### Frontend Scripts

#### `install-frontend.command`
**Purpose**: Sets up Node.js and frontend dependencies

**What it does**:
- ✅ Checks if Node.js 18+ exists (installs via Homebrew if missing)
- ✅ Verifies npm availability
- ✅ Creates `.env.local` configuration file
- ✅ Installs all Node.js dependencies
- ✅ Verifies key dependencies (Next.js, React, Tailwind CSS)
- ✅ Creates TypeScript and PostCSS configuration files

**Usage**:
```bash
./install-frontend.command
```

**Requirements**:
- macOS (for Homebrew)
- Internet connection (for downloading packages)

---

#### `build-frontend.command`
**Purpose**: Builds the frontend for production deployment

**What it does**:
- ✅ Cleans previous build artifacts
- ✅ Runs TypeScript type checking
- ✅ Runs ESLint linting
- ✅ Builds the Next.js application for production
- ✅ Creates build information file
- ✅ Generates optimized static assets

**Usage**:
```bash
./build-frontend.command
```

**Output**:
- `.next/` directory with production build
- `.next/build-info.json` with build metadata

---

#### `run-frontend.command`
**Purpose**: Runs the frontend service with mode selection and port management

**What it does**:
- ✅ Prompts user to select development or production mode
- ✅ Creates and checks configuration file for port settings
- ✅ Checks if the configured port is in use
- ✅ Offers options to kill existing processes or use different port
- ✅ Starts the appropriate Next.js server

**Usage**:
```bash
./run-frontend.command
```

**Mode Options**:
1. **Development**: Hot reload, debugging, development tools
2. **Production**: Optimized build, better performance

**Default Ports**:
- Development: 4800
- Production: 4801

---

## 🚀 Quick Start Guide

### 1. Install Backend
```bash
./install-backend.command
```

### 2. Install Frontend
```bash
./install-frontend.command
```

### 3. Start Services

**Terminal 1 - Backend**:
```bash
./run-backend.command
```

**Terminal 2 - Frontend (Development)**:
```bash
./run-frontend.command
```

**Terminal 2 - Frontend (Production)**:
```bash
./run-production-frontend.command
```

### 4. Access the Application
- Frontend: http://localhost:4800 (dev) or http://localhost:4801 (prod)
- Backend API: http://localhost:4700
- API Documentation: http://localhost:4700/docs

---

## ⚙️ Configuration Files

### Backend Configuration
- **File**: `backend/.backend-config`
- **Purpose**: Stores backend port and host settings
- **Format**:
  ```
  BACKEND_PORT=4700
  BACKEND_HOST=0.0.0.0
  BACKEND_RELOAD=true
  ```

### Frontend Configuration
- **File**: `frontend/.frontend-config`
- **Purpose**: Stores frontend port settings for different modes
- **Format**:
  ```
  DEV_PORT=4800
  PROD_PORT=3001
  ```

### Environment Files
- **Backend**: `backend/.env` (created from `env.example`)
- **Frontend**: `frontend/.env.local` (auto-created)

---

## 🔧 Port Management Features

All run scripts include intelligent port management:

### Port Conflict Resolution
When a port is in use, you'll be presented with options:

1. **Kill the process** using the port
2. **Use a different port** (with validation)
3. **Exit** the script

### Port Validation
- Ensures ports are between 1024-65535
- Checks if alternative ports are available
- Provides clear error messages

### Configuration Persistence
- Your port choices are saved for future runs
- No need to reconfigure ports each time

---

## 🛠 Troubleshooting

### Common Issues

#### "Command not found" errors
- Ensure scripts are executable: `chmod +x *.command`
- Run from the project root directory

#### Port already in use
- Use the built-in port management options
- Or manually kill processes: `lsof -ti:PORT | xargs kill -9`

#### Python/Node.js not found
- Scripts will attempt to install via Homebrew
- Ensure Homebrew is installed: `/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"`

#### Virtual environment issues
- Delete `backend/venv` and re-run `install-backend.command`
- Ensure Python 3.8+ is available

#### Node modules issues
- Delete `frontend/node_modules` and re-run `install-frontend.command`
- Clear npm cache: `npm cache clean --force`

### Log Files
- Backend logs: Check terminal output
- Frontend logs: Check terminal output
- Build logs: Check `.next/build-info.json`

---

## 📁 Project Structure

```
data-analysis/
├── install-backend.command      # Backend installation
├── run-backend.command         # Backend service runner
├── run-production-frontend.command  # Production frontend runner
├── install-frontend.command    # Frontend installation
├── build-frontend.command      # Frontend build
├── run-frontend.command        # Frontend service runner
├── backend/
│   ├── .backend-config        # Backend port configuration
│   ├── .env                   # Backend environment variables
│   └── venv/                  # Python virtual environment
└── frontend/
    ├── .frontend-config       # Frontend port configuration
    ├── .env.local            # Frontend environment variables
    └── node_modules/          # Node.js dependencies
```

---

## 🎯 Best Practices

### Development Workflow
1. Always run `install-*` scripts first
2. Use development mode for active development
3. Use production mode for testing optimized builds
4. Keep configuration files in version control (except `.env` files)

### Production Deployment
1. Run `build-frontend.command` before deployment
2. Use production mode for live servers
3. Configure proper environment variables
4. Set up reverse proxy (nginx) for production

### Port Management
- Use default ports when possible
- Document custom port choices
- Avoid port conflicts with other services
- Use port ranges: 4800-4899 for frontend, 4700-4799 for backend

---

## 🔒 Security Notes

- Never commit `.env` files to version control
- Use strong secrets in production
- Configure proper CORS settings
- Enable HTTPS in production
- Regular security updates for dependencies

---

## 📞 Support

If you encounter issues:

1. Check the troubleshooting section above
2. Verify all prerequisites are installed
3. Check the terminal output for error messages
4. Ensure you're running scripts from the project root
5. Try deleting and reinstalling dependencies

For additional help, check the main project README.md file.
