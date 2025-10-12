# Auto-JMP: Automated JMP Analysis Platform

A comprehensive web-based platform for automated JMP (JMP Statistical Discovery) analysis with real-time processing, interactive visualization, and seamless file management.

## 🚀 Features

### Core Functionality
- **Automated JMP Analysis**: Upload CSV data and JSL scripts for automated processing
- **Real-time Processing**: Live status updates via WebSocket connections
- **Interactive Image Gallery**: View generated analysis results with zoom and navigation
- **File Management**: Secure upload, storage, and download of analysis files
- **ZIP Downloads**: Download complete analysis results as compressed archives

### User Management
- **Authentication System**: JWT-based user authentication
- **Admin Dashboard**: Comprehensive admin interface for platform management
- **Role-based Access**: Admin and user role management
- **Guest Access**: Optional guest mode for testing

### Technical Features
- **Modern Stack**: FastAPI backend + Next.js frontend
- **Background Processing**: Celery-based task queue for JMP analysis
- **Database Integration**: PostgreSQL with SQLAlchemy ORM
- **File Storage**: Local file system with secure serving
- **Real-time Updates**: WebSocket-based live status updates

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend       │    │   Celery Worker │
│   (Next.js)     │◄──►│   (FastAPI)     │◄──►│   (JMP Runner)  │
│   Port: 3000    │    │   Port: 8000    │    │   Background    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   WebSocket     │    │   PostgreSQL    │    │   Redis         │
│   Real-time     │    │   Database      │    │   Message Queue │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 📋 Prerequisites

### System Requirements
- **macOS**: Required for JMP integration (AppleScript automation)
- **Python 3.11**: Backend and Celery worker
- **Node.js 18+**: Frontend development
- **PostgreSQL**: Database server
- **Redis**: Message broker for Celery
- **JMP Software**: JMP Statistical Discovery installed

### Software Dependencies
- JMP Statistical Discovery (latest version)
- PostgreSQL 14+
- Redis 6+
- Python 3.11
- Node.js 18+

## 🛠️ Installation

### Quick Start

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd auto-jmp
   ```

2. **Install Backend Dependencies**
   ```bash
   ./install-backend.command
   ```

3. **Install Frontend Dependencies**
   ```bash
   ./install-frontend.command
   ```

4. **Start Services**
   ```bash
   # Terminal 1: Backend
   ./run-backend.command
   
   # Terminal 2: Celery Worker
   ./run-worker.command
   
   # Terminal 3: Frontend
   ./run-frontend.command
   ```

### Manual Installation

#### Backend Setup
```bash
cd backend
python3.11 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

#### Frontend Setup
```bash
cd frontend
npm install
```

#### Database Setup
```bash
# Create PostgreSQL database
createdb data_analysis

# Run database reset (creates admin user)
./reset-database.command
```

## 🚀 Usage

### Accessing the Platform

1. **Frontend**: http://localhost:3000
2. **Backend API**: http://localhost:8000
3. **API Documentation**: http://localhost:8000/docs

### Default Admin Credentials
- **Email**: admin@admin.com
- **Password**: admin

### Basic Workflow

1. **Login** to the platform
2. **Create a Project** for your analysis
3. **Upload Files**:
   - CSV data file
   - JSL script file
4. **Start Analysis** and monitor real-time progress
5. **View Results** in the interactive gallery
6. **Download** complete results as ZIP

### JSL Script Requirements

Your JSL script should include:
```jsl
// Open data table
dt = Open( "your_data.csv" );

// Your analysis code here
// ...

// Save output images
Save Picture( "output1.png" );
Save Picture( "output2.png" );
```

## 📁 Project Structure

```
auto-jmp/
├── backend/                 # FastAPI backend
│   ├── app/
│   │   ├── api/            # API endpoints
│   │   ├── core/           # Core functionality
│   │   ├── models/         # Database models
│   │   └── worker/         # Celery tasks
│   ├── tasks/              # JMP analysis outputs
│   ├── uploads/            # File uploads
│   └── venv/               # Python virtual environment
├── frontend/               # Next.js frontend
│   ├── app/                # App router pages
│   ├── components/         # React components
│   └── lib/                # Utilities and hooks
├── demo/                   # Sample files
├── *.command               # Shell scripts
└── README.md              # This file
```

## 🔧 Configuration

### Environment Variables

#### Backend (`.env`)
```env
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/data_analysis
SECRET_KEY=your-secret-key
REDIS_URL=redis://localhost:6379/0
```

#### Frontend (`env.local`)
```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
```

### Database Configuration

The platform uses PostgreSQL with the following default settings:
- **Host**: localhost
- **Port**: 5432
- **Database**: data_analysis
- **User**: postgres
- **Password**: postgres

## 🧪 Testing

### Sample Files

Use the files in the `demo/` directory:
- `jmp_data_20251011_173619.csv`: Sample data
- `jsl_script_20251011_173619.jsl`: Sample JSL script

### Test Workflow

1. Start all services
2. Login with admin credentials
3. Create a new project
4. Upload demo files
5. Start analysis
6. Monitor progress in real-time
7. View generated images
8. Download ZIP results

## 🐛 Troubleshooting

### Common Issues

#### Port Already in Use
```bash
# Kill processes on ports 3000, 8000
lsof -ti:3000 | xargs kill -9
lsof -ti:8000 | xargs kill -9
```

#### Database Connection Issues
```bash
# Reset database
./reset-database.command
```

#### JMP Not Responding
- Ensure JMP is installed and licensed
- Check AppleScript permissions
- Restart JMP application

#### Celery Worker Issues
```bash
# Check Redis status
redis-cli ping

# Restart worker
./run-worker.command
```

### Logs and Debugging

- **Backend logs**: Check terminal running `./run-backend.command`
- **Worker logs**: Check terminal running `./run-worker.command`
- **Frontend logs**: Check browser developer console

## 📚 API Documentation

### Authentication Endpoints
- `POST /api/v1/auth/login` - User login
- `POST /api/v1/auth/register` - User registration
- `POST /api/v1/auth/refresh` - Refresh token

### Project Management
- `GET /api/v1/projects` - List projects
- `POST /api/v1/projects` - Create project
- `GET /api/v1/projects/{id}` - Get project details

### File Operations
- `POST /api/v1/uploads/presign` - Get upload URLs
- `POST /api/v1/uploads/upload/{filename}` - Upload file
- `GET /api/v1/uploads/file-serve` - Serve files

### Analysis Management
- `POST /api/v1/runs` - Create analysis run
- `GET /api/v1/runs/{id}/artifacts` - Get run artifacts
- `GET /api/v1/runs/{id}/download-zip` - Download ZIP

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support and questions:
- Check the troubleshooting section
- Review API documentation at `/docs`
- Check logs for error details
- Ensure all prerequisites are met

## 🔄 Updates

### Recent Changes
- Fixed gallery image loading issues
- Improved ZIP download functionality
- Enhanced real-time status updates
- Added comprehensive error handling
- Optimized file serving performance

### Planned Features
- Batch analysis processing
- Advanced visualization options
- Export to multiple formats
- User collaboration features
- Advanced admin analytics

---

**Auto-JMP** - Making JMP analysis accessible and automated for everyone.
