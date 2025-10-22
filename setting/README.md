# 🧰 Auto-JMP Settings Tool

A local web-based configuration tool for managing Auto-JMP backend and frontend settings. This tool provides an intuitive interface to configure database connections, ports, environment variables, and manage admin users.

## Features

- **Web-based Interface**: Modern, responsive web UI for easy configuration
- **Service Management**: Start, stop, and restart backend and frontend services
- **Database Testing**: Test database and Redis connections
- **Configuration Management**: Update backend and frontend environment variables
- **Admin User Creation**: Create admin users through the interface
- **Service Status Monitoring**: Real-time status of running services
- **Configuration Export/Import**: Backup and restore configurations
- **Comprehensive Diagnostics**: Detailed system and network information
- **Communication Testing**: Test frontend-backend communication and CORS
- **Configuration Consistency**: Check for configuration issues and conflicts
- **Network Analysis**: IP addresses, firewall status, and connectivity tests

## Quick Start

### 1. Setup

Run the setup script to create the virtual environment and install dependencies:

```bash
cd setting
./setup.sh
```

### 2. Run the Settings Tool

```bash
# Option 1: Run as a module from project root (recommended)
cd ..  # Go to project root
python -m setting

# Option 2: Use the runner script
./run-settings.command

# Option 3: Activate venv and run directly
source venv/bin/activate
python config_wizard.py
```

### 3. Access the Web Interface

Open your browser and navigate to:
```
http://localhost:4900
```

## Usage

### Overview Tab
- View service status (Backend/Frontend)
- Quick actions (Refresh, Export, Reset)
- Restart services

### Backend Tab
- Configure backend port
- Set database URL
- Configure Redis URL
- Set secret key
- Choose environment (development/production/testing)

### Frontend Tab
- Configure frontend port
- Set backend URL
- Configure WebSocket URL

### Database Tab
- Test database connections
- Configure database settings
- Reset database

### Admin Tab
- Create admin users
- Manage user accounts

### Diagnostics Tab
- **System Information**: Hostname, platform, IP addresses, firewall status
- **Network Analysis**: Network interfaces, connectivity tests, external services
- **Communication Testing**: Frontend-backend communication, CORS, WebSocket tests
- **Configuration Consistency**: Check for configuration issues and recommendations
- **Full Diagnostics**: Comprehensive system report with all information

## Configuration Files

The settings tool manages these configuration files:

- `backend/.env` - Backend environment variables
- `frontend/.env.local` - Frontend environment variables
- `.env` - Root project environment variables

## API Endpoints

The settings tool provides a REST API for programmatic access:

- `GET /api/config` - Get current configuration
- `POST /api/config/backend` - Update backend configuration
- `POST /api/config/frontend` - Update frontend configuration
- `GET /api/test/backend` - Test backend connections
- `GET /api/test/frontend` - Test frontend connections
- `POST /api/test/database` - Test database connection
- `POST /api/restart/<service>` - Restart service
- `POST /api/admin/create` - Create admin user
- `POST /api/config/reset` - Reset to defaults
- `GET /api/system-info` - Get system information
- `GET /api/network-info` - Get network information
- `GET /api/communication-test` - Test frontend-backend communication
- `GET /api/consistency-check` - Check configuration consistency
- `GET /api/diagnostics` - Get comprehensive diagnostics

## Dependencies

The settings tool uses these Python packages:

- `flask` - Web framework
- `flask-cors` - CORS support
- `python-dotenv` - Environment variable management
- `psycopg2-binary` - PostgreSQL adapter
- `redis` - Redis client
- `requests` - HTTP client
- `pyyaml` - YAML support
- `netifaces` - Network interface information
- `websocket-client` - WebSocket testing

## Virtual Environment

The settings tool uses its own isolated virtual environment located at `setting/venv/`. This ensures that the settings tool dependencies don't interfere with the main backend or frontend dependencies.

## Security Notes

- The settings tool runs on `127.0.0.1` by default (localhost only)
- No authentication is required (local access only)
- Sensitive data like passwords are handled securely
- The tool only modifies local configuration files

## Troubleshooting

### Virtual Environment Issues
```bash
# Recreate virtual environment
rm -rf venv
./setup.sh
```

### Permission Issues
```bash
# Make setup script executable
chmod +x setup.sh
```

### Port Conflicts
```bash
# Run on different port
python config_wizard.py --port 5001
```

### Dependencies Issues
```bash
# Reinstall dependencies
source venv/bin/activate
pip install -r requirements.txt --force-reinstall
```

## Development

To modify the settings tool:

1. Edit the relevant files:
   - `config_wizard.py` - Flask application and API endpoints
   - `utils.py` - Core functionality and settings management
   - `templates/index.html` - Web interface

2. Test changes:
   ```bash
   source venv/bin/activate
   python config_wizard.py --debug
   ```

3. The debug mode enables auto-reload for development

## License

This tool is part of the Auto-JMP project and follows the same license terms.
