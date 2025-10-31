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
- **Settings Tool**: Web-based configuration management for backend and frontend settings

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

## Database Configuration

### PostgreSQL Setup

The platform uses PostgreSQL as the primary database. Here's how to configure it:

#### 1. Install PostgreSQL

**macOS (using Homebrew):**
```bash
brew install postgresql@16
brew services start postgresql@16
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
```

**Windows:**
Download and install from [postgresql.org](https://www.postgresql.org/download/windows/)

#### 2. Create Database and User

```bash
# Connect to PostgreSQL
psql -U postgres

# Create database and user
CREATE DATABASE data_analysis;
CREATE USER data_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE data_analysis TO data_user;
\q
```

#### 3. Configure Database Connection

The database configuration is specified in multiple locations:

**Primary Configuration - Environment Variables:**
- **File**: `backend/.env` (create from `backend/env.example`)
- **Key**: `DATABASE_URL=postgresql+asyncpg://username:password@localhost/data_analysis`

**Application Configuration:**
- **File**: `backend/app/core/config.py` (lines 16-17)
- **Default**: `postgresql+asyncpg://user:password@localhost/data_analysis`

**Migration Configuration:**
- **File**: `backend/alembic.ini` (line 59)
- **URL**: `postgresql+asyncpg://user:password@localhost/data_analysis`

#### 4. Database URL Format

```
postgresql+asyncpg://username:password@host:port/database_name
```

**Examples:**
- Local: `postgresql+asyncpg://postgres:mypassword@localhost:5432/data_analysis`
- Remote: `postgresql+asyncpg://user:pass@192.168.1.100:5432/data_analysis`
- Cloud: `postgresql+asyncpg://user:pass@db.example.com:5432/data_analysis`

#### 5. Redis Configuration (for Celery)

**Redis URL Format:**
```
redis://localhost:6379
```

**Celery Configuration:**
- **Broker**: `redis://localhost:6379/0`
- **Result Backend**: `redis://localhost:6379/0`

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

## Settings Tool

The platform includes a dedicated settings tool for easy configuration management:

### 🧰 Auto-JMP Settings Tool

A local web-based configuration tool located in the `setting/` directory that provides:

- **Web Interface**: Modern, responsive UI for configuration management
- **Service Management**: Start, stop, and restart backend/frontend services
- **Database Testing**: Test database and Redis connections
- **Port Configuration**: Change backend and frontend ports
- **Environment Variables**: Manage all configuration settings
- **Admin User Creation**: Create admin users through the interface
- **Service Status**: Real-time monitoring of running services

#### Quick Start

```bash
# Navigate to settings directory
cd setting

# Run setup (creates venv and installs dependencies)
./setup.sh

# Start the settings tool
python -m setting
```

Then open your browser to `http://localhost:4900` to access the settings interface.

#### Features

- **Overview Tab**: Service status and quick actions
- **Backend Tab**: Database, Redis, and backend configuration
- **Frontend Tab**: Port and URL configuration
- **Database Tab**: Database connection testing and management
- **Admin Tab**: User account management

The settings tool uses its own isolated virtual environment to avoid conflicts with the main application dependencies.

For detailed documentation, see [setting/README.md](setting/README.md).

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

## Plugin Development Guide

The platform supports a modular plugin architecture that allows you to create custom data analysis extensions. The `excel2boxplotv1` plugin serves as the standard template for all plugins.

### Plugin Architecture Overview

Plugins follow a modular architecture with clear separation of concerns:

```
backend/extensions/your-plugin/
├── __init__.py
├── extension.py          # Main extension class
├── analyzer.py           # Analysis-specific logic
├── api.py               # API endpoints
├── data_process.py      # Data processing logic
├── file_handler.py      # File handling utilities
├── data_validator.py    # Data validation
├── file_processor.py    # File generation (CSV, JSL)
├── analysis_runner.py   # JMP runner integration
├── processor.py         # Main orchestrator
└── README.md           # Plugin documentation

frontend/plugins/your-plugin/
├── config.ts           # Plugin configuration
├── components/         # React components
│   ├── AnalysisForm.tsx
│   ├── DataPreview.tsx
│   └── ResultsView.tsx
└── hooks/              # Custom React hooks
    ├── useExcelAnalysis.ts
    └── useYourAnalysis.ts
```

### Standard Plugin Module Structure

#### 1. Extension Class (`extension.py`)

Every plugin must extend the `BaseExtension` class:

```python
from ..base.extension import BaseExtension
from .analyzer import YourAnalyzer
from typing import List, Dict, Any

class YourPluginExtension(BaseExtension):
    """Your plugin description"""
    
    def __init__(self):
        super().__init__()
        self.analyzer = YourAnalyzer()
    
    def get_name(self) -> str:
        return "your-plugin-name"
    
    def get_version(self) -> str:
        return "1.0.0"
    
    def get_description(self) -> str:
        return "Your plugin description"
    
    def get_supported_formats(self) -> List[str]:
        return ['.xlsx', '.csv', '.txt']  # Supported file formats
    
    def get_api_routes(self) -> List[Dict[str, Any]]:
        return [
            {
                'router': 'your_plugin_router',
                'prefix': '/your-plugin',
                'tags': ['your-plugin']
            }
        ]
    
    def get_celery_tasks(self) -> List[Dict[str, Any]]:
        return [
            {
                'name': 'run_your_analysis',
                'function': 'run_your_analysis'
            }
        ]
    
    def get_dependencies(self) -> List[str]:
        return [
            'pandas==2.1.4',
            'numpy==1.24.0',
            # Add your specific dependencies
        ]
    
    def initialize(self) -> bool:
        """Initialize plugin-specific resources"""
        try:
            # Import required packages
            import pandas
            import numpy
            return True
        except ImportError:
            return False
```

#### 2. Analyzer Class (`analyzer.py`)

The analyzer handles analysis-specific logic and must extend `BaseAnalyzer`:

```python
import pandas as pd
import numpy as np
from typing import Dict, Any, List
from ..base.analyzer import BaseAnalyzer

class YourAnalyzer(BaseAnalyzer):
    """Your analysis-specific analyzer"""
    
    def get_analysis_type(self) -> str:
        return "your_analysis_type"
    
    def get_supported_charts(self) -> List[str]:
        return [
            'chart_type_1',
            'chart_type_2',
            'chart_type_3'
        ]
    
    def get_required_columns(self) -> Dict[str, List[str]]:
        return {
            'chart_type_1': ['column1', 'column2'],
            'chart_type_2': ['column1', 'column2', 'column3'],
            'chart_type_3': ['value_column']
        }
    
    def validate_data(self, df: pd.DataFrame, chart_type: str) -> Dict[str, Any]:
        """Validate data for specific analysis"""
        required = self.required_columns.get(chart_type, [])
        missing = [col for col in required if col not in df.columns]
        
        if missing:
            return {
                'valid': False,
                'missing_columns': missing,
                'message': f"Missing required columns: {', '.join(missing)}"
            }
        
        # Add your specific validation logic
        return {
            'valid': True,
            'message': "Data is valid for analysis"
        }
    
    def preprocess_data(self, df: pd.DataFrame, chart_type: str) -> pd.DataFrame:
        """Preprocess data for analysis"""
        # Add your preprocessing logic
        return df
    
    def generate_jsl_template(self, df: pd.DataFrame, chart_type: str) -> str:
        """Generate JSL template for analysis"""
        # Return JSL script template
        return "// Your JSL template here"
    
    def _calculate_confidence(self, df: pd.DataFrame, chart_type: str) -> float:
        """Calculate confidence for analysis suggestions"""
        # Add your confidence calculation logic
        return 0.8
```

#### 3. API Endpoints (`api.py`)

Define your plugin's API endpoints:

```python
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Form
from fastapi.responses import JSONResponse
from typing import Dict, Any, List
import pandas as pd
import tempfile
import os
import logging

from .processor import YourProcessor

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/your-plugin", tags=["your-plugin"])

# Initialize processor
processor = YourProcessor()

@router.post("/validate")
async def validate_file(file: UploadFile = File(...)):
    """Validate uploaded file"""
    try:
        # Save uploaded file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as tmp_file:
            content = await file.read()
            tmp_file.write(content)
            tmp_file.flush()
            
            # Run validation
            result = processor.validate_file(tmp_file.name)
            
            # Clean up
            os.unlink(tmp_file.name)
            
            return result
            
    except Exception as e:
        logger.error(f"Validation failed: {str(e)}")
        return JSONResponse(
            status_code=400,
            content={"error": str(e)}
        )

@router.post("/process")
async def process_file(
    file: UploadFile = File(...),
    project_id: str = Form(None)
):
    """Process uploaded file"""
    try:
        # Your processing logic here
        return {"success": True, "message": "File processed successfully"}
        
    except Exception as e:
        logger.error(f"Processing failed: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
```

#### 4. Data Processing (`data_process.py`)

Handle data transformation and processing:

```python
import pandas as pd
import numpy as np
from typing import Dict, List, Any, Optional
import logging

logger = logging.getLogger(__name__)

class DataProcessor:
    """Processes and transforms data for analysis"""
    
    def __init__(self):
        self.processed_data: Optional[pd.DataFrame] = None
    
    def process_data(self, df: pd.DataFrame, **kwargs) -> Dict[str, Any]:
        """Process data for analysis"""
        try:
            # Your data processing logic here
            processed_df = df.copy()
            
            # Example processing steps
            # 1. Clean data
            # 2. Transform columns
            # 3. Calculate derived metrics
            
            self.processed_data = processed_df
            
            return {
                "success": True,
                "message": "Data processing completed",
                "processed_data": processed_df,
                "details": {
                    "rows": len(processed_df),
                    "columns": len(processed_df.columns)
                }
            }
            
        except Exception as e:
            logger.error(f"Error processing data: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }
```

#### 5. File Handler (`file_handler.py`)

Handle file loading and exploration:

```python
import pandas as pd
from typing import Dict, List, Any, Optional
import logging

logger = logging.getLogger(__name__)

class FileHandler:
    """Handles file loading and column exploration"""
    
    def __init__(self):
        self.file_path: Optional[str] = None
        self.data: Optional[pd.DataFrame] = None
    
    def load_file(self, file_path: str) -> Dict[str, Any]:
        """Load file and analyze structure"""
        try:
            self.file_path = file_path
            
            # Load file based on extension
            if file_path.endswith('.xlsx'):
                self.data = pd.read_excel(file_path)
            elif file_path.endswith('.csv'):
                self.data = pd.read_csv(file_path)
            else:
                raise ValueError(f"Unsupported file format: {file_path}")
            
            return {
                "success": True,
                "file_path": file_path,
                "shape": self.data.shape,
                "columns": self.data.columns.tolist(),
                "data_types": self.data.dtypes.to_dict()
            }
            
        except Exception as e:
            logger.error(f"Error loading file: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }
```

#### 6. Data Validator (`data_validator.py`)

Validate data structure and quality:

```python
import pandas as pd
from typing import Dict, Any
import logging

logger = logging.getLogger(__name__)

class DataValidator:
    """Validates data structure and content"""
    
    def __init__(self):
        self.required_columns = ["column1", "column2"]  # Define required columns
    
    def validate_structure(self, df: pd.DataFrame) -> Dict[str, Any]:
        """Validate basic data structure"""
        warnings = []
        
        # Check required columns
        missing_columns = [col for col in self.required_columns if col not in df.columns]
        if missing_columns:
            warnings.append({
                "type": "missing_columns",
                "message": f"Missing required columns: {missing_columns}"
            })
        
        # Check for empty rows
        empty_rows = df.isnull().all(axis=1).sum()
        if empty_rows > 0:
            warnings.append({
                "type": "empty_rows",
                "message": f"Found {empty_rows} empty rows"
            })
        
        return {
            "valid": True,
            "warnings": warnings,
            "details": {
                "shape": df.shape,
                "missing_columns": len(missing_columns)
            }
        }
    
    def validate_data_quality(self, df: pd.DataFrame) -> Dict[str, Any]:
        """Validate data quality"""
        warnings = []
        
        # Add your quality checks here
        # Example: Check for outliers, missing values, etc.
        
        return {
            "valid": True,
            "warnings": warnings
        }
```

#### 7. File Processor (`file_processor.py`)

Generate output files (CSV, JSL, etc.):

```python
import pandas as pd
from typing import Dict, Any, Optional
import logging

logger = logging.getLogger(__name__)

class FileProcessor:
    """Generates output files"""
    
    def generate_csv(self, df: pd.DataFrame, **kwargs) -> str:
        """Generate CSV content"""
        return df.to_csv(index=False)
    
    def generate_jsl(self, df: pd.DataFrame, **kwargs) -> str:
        """Generate JSL script content"""
        # Use your analyzer to generate JSL
        analyzer = YourAnalyzer()
        return analyzer.generate_jsl_template(df, "default_chart_type")
    
    def generate_files(self, df: pd.DataFrame, **kwargs) -> Dict[str, Any]:
        """Generate all output files"""
        try:
            csv_content = self.generate_csv(df)
            jsl_content = self.generate_jsl(df)
            
            return {
                "success": True,
                "files": {
                    "csv_content": csv_content,
                    "jsl_content": jsl_content
                },
                "details": {
                    "csv_rows": len(df),
                    "jsl_length": len(jsl_content)
                }
            }
            
        except Exception as e:
            logger.error(f"Error generating files: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }
```

#### 8. Main Processor (`processor.py`)

Orchestrate all processing modules:

```python
from typing import Dict, Any
import logging

from .file_handler import FileHandler
from .data_validator import DataValidator
from .data_process import DataProcessor
from .file_processor import FileProcessor

logger = logging.getLogger(__name__)

class YourProcessor:
    """Main processor that orchestrates all modules"""
    
    def __init__(self):
        self.file_handler = FileHandler()
        self.validator = DataValidator()
        self.data_processor = DataProcessor()
        self.file_processor = FileProcessor()
    
    def validate_file(self, file_path: str) -> Dict[str, Any]:
        """Validate file structure and content"""
        try:
            # Load file
            load_result = self.file_handler.load_file(file_path)
            if not load_result["success"]:
                return load_result
            
            # Validate structure
            structure_result = self.validator.validate_structure(self.file_handler.data)
            
            # Validate quality
            quality_result = self.validator.validate_data_quality(self.file_handler.data)
            
            return {
                "valid": True,
                "message": "File validation completed",
                "structure": structure_result,
                "quality": quality_result
            }
            
        except Exception as e:
            logger.error(f"Error validating file: {str(e)}")
            return {
                "valid": False,
                "error": str(e)
            }
    
    def process_file(self, file_path: str, **kwargs) -> Dict[str, Any]:
        """Process file end-to-end"""
        try:
            # Load file
            load_result = self.file_handler.load_file(file_path)
            if not load_result["success"]:
                return load_result
            
            # Process data
            process_result = self.data_processor.process_data(
                self.file_handler.data, **kwargs
            )
            if not process_result["success"]:
                return process_result
            
            # Generate files
            file_result = self.file_processor.generate_files(
                process_result["processed_data"], **kwargs
            )
            
            return {
                "success": True,
                "message": "File processing completed",
                "files": file_result["files"],
                "details": file_result["details"]
            }
            
        except Exception as e:
            logger.error(f"Error processing file: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }
```

### Frontend Plugin Structure

#### 1. Plugin Configuration (`config.ts`)

```typescript
import { Plugin } from '@/lib/plugins/types'
import AnalysisForm from './components/AnalysisForm'
import DataPreview from './components/DataPreview'
import ResultsView from './components/ResultsView'
import { useYourAnalysis } from './hooks/useYourAnalysis'

const plugin: Plugin = {
  config: {
    id: 'your-plugin',
    name: 'Your Plugin Name',
    version: '1.0.0',
    description: 'Your plugin description',
    icon: '📊',
    category: 'analysis',
    supportedFormats: ['.xlsx', '.csv'],
    routes: [
      {
        path: '/plugins/your-plugin',
        component: 'AnalysisForm',
        title: 'Your Analysis Tool',
        description: 'Upload files and run your analysis'
      }
    ],
    apiEndpoints: [
      '/api/v1/extensions/your-plugin/validate',
      '/api/v1/extensions/your-plugin/process'
    ]
  },
  
  components: {
    AnalysisForm: {
      name: 'AnalysisForm',
      component: AnalysisForm
    },
    DataPreview: {
      name: 'DataPreview', 
      component: DataPreview
    },
    ResultsView: {
      name: 'ResultsView',
      component: ResultsView
    }
  },
  
  hooks: {
    useYourAnalysis: {
      name: 'useYourAnalysis',
      hook: useYourAnalysis
    }
  }
}

export default plugin
```

#### 2. React Components

Create React components for your plugin UI:

```typescript
// components/AnalysisForm.tsx
import React, { useState } from 'react'
import { useYourAnalysis } from '../hooks/useYourAnalysis'

export default function AnalysisForm() {
  const [file, setFile] = useState<File | null>(null)
  const { processFile, isLoading, error } = useYourAnalysis()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (file) {
      await processFile(file)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="file" className="block text-sm font-medium">
          Upload File
        </label>
        <input
          type="file"
          id="file"
          accept=".xlsx,.csv"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="mt-1 block w-full"
        />
      </div>
      
      <button
        type="submit"
        disabled={!file || isLoading}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {isLoading ? 'Processing...' : 'Process File'}
      </button>
      
      {error && (
        <div className="text-red-600">
          Error: {error}
        </div>
      )}
    </form>
  )
}
```

#### 3. Custom Hooks

Create custom hooks for API integration:

```typescript
// hooks/useYourAnalysis.ts
import { useState } from 'react'
import { api } from '@/lib/api'

export function useYourAnalysis() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const processFile = async (file: File) => {
    setIsLoading(true)
    setError(null)
    
    try {
      const formData = new FormData()
      formData.append('file', file)
      
      const response = await api.post('/extensions/your-plugin/process', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })
      
      return response.data
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      throw err
    } finally {
      setIsLoading(false)
    }
  }

  return {
    processFile,
    isLoading,
    error
  }
}
```

### How to Add a New Plugin

#### 1. Create Backend Plugin

1. **Create plugin directory**:
   ```bash
   mkdir backend/extensions/your-plugin
   cd backend/extensions/your-plugin
   ```

2. **Create required files**:
   ```bash
   touch __init__.py extension.py analyzer.py api.py data_process.py file_handler.py data_validator.py file_processor.py processor.py README.md
   ```

3. **Implement each module** following the template structure above

4. **Register the plugin** in `backend/extensions/__init__.py`:
   ```python
   from .your_plugin.extension import YourPluginExtension

   EXTENSIONS = [
       Excel2BoxplotV1Extension(),
       Excel2ProcessCapabilityExtension(),
       YourPluginExtension(),  # Add your plugin here
   ]
   ```

#### 2. Create Frontend Plugin

1. **Create plugin directory**:
   ```bash
   mkdir frontend/plugins/your-plugin
   cd frontend/plugins/your-plugin
   ```

2. **Create required files**:
   ```bash
   mkdir components hooks
   touch config.ts
   touch components/AnalysisForm.tsx components/DataPreview.tsx components/ResultsView.tsx
   touch hooks/useYourAnalysis.ts
   ```

3. **Implement components and hooks** following the template structure

4. **Register the plugin** in `frontend/lib/plugins/index.ts`:
   ```typescript
   import yourPlugin from '../plugins/your-plugin/config'

   export const plugins = [
     excel2boxplotv1Plugin,
     excel2processcapabilityPlugin,
     yourPlugin,  // Add your plugin here
   ]
   ```

#### 3. Configure Plugin Routes

Add your plugin routes to the main API router in `backend/app/api/v1/api.py`:

```python
from app.extensions.your_plugin.api import router as your_plugin_router

api_router.include_router(
    your_plugin_router,
    prefix="/extensions/your-plugin",
    tags=["your-plugin"]
)
```

### Plugin Configuration

#### Environment Variables

Add plugin-specific environment variables to your `.env` files:

```env
# Backend .env
YOUR_PLUGIN_API_KEY=your-api-key
YOUR_PLUGIN_CONFIG_PATH=/path/to/config

# Frontend .env.local
NEXT_PUBLIC_YOUR_PLUGIN_ENABLED=true
```

#### Database Configuration

If your plugin needs database tables, create migrations:

```bash
cd backend
alembic revision --autogenerate -m "Add your plugin tables"
alembic upgrade head
```

#### Celery Tasks

Register your plugin's Celery tasks in `backend/app/worker/tasks.py`:

```python
from app.extensions.your_plugin.tasks import run_your_analysis

# The task will be automatically registered
```

### Plugin Best Practices

1. **Follow the Template**: Use `excel2boxplotv1` as your reference implementation
2. **Modular Design**: Keep each module focused on a single responsibility
3. **Error Handling**: Implement comprehensive error handling and logging
4. **Validation**: Always validate input data before processing
5. **Documentation**: Document your plugin's functionality and API endpoints
6. **Testing**: Write tests for your plugin components
7. **Versioning**: Use semantic versioning for plugin updates
8. **Dependencies**: Minimize external dependencies and document them clearly

### Plugin API Standards

All plugins should implement these standard endpoints:

- `POST /validate` - Validate uploaded files
- `POST /process` - Process files and generate outputs
- `GET /status` - Get plugin status and health
- `GET /config` - Get plugin configuration

### Plugin Development Checklist

- [ ] Backend extension class extends `BaseExtension`
- [ ] Analyzer class extends `BaseAnalyzer`
- [ ] All required modules implemented
- [ ] API endpoints follow standard patterns
- [ ] Frontend components created
- [ ] Custom hooks implemented
- [ ] Plugin registered in both backend and frontend
- [ ] Documentation written
- [ ] Error handling implemented
- [ ] Logging configured
- [ ] Tests written (optional but recommended)

## Support

For support and questions:
- Create an issue in the repository
- Check the troubleshooting section
- Review the API documentation at `/docs` when the backend is running
- Check the detailed documentation in the `backend/` and `frontend/` directories
- Refer to the plugin development guide above for creating custom plugins
