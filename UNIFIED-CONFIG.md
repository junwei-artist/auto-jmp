# Unified Configuration System

This project now uses a **single source of truth** for all port and configuration settings to eliminate confusion and maintenance issues.

## 🎯 Single Source of Truth

**Master Configuration File**: `.master-config`

All port settings are defined in one place and automatically synchronized across all configuration files.

## 📁 Configuration Files

### Primary (Source of Truth)
- **`.master-config`** - Master configuration file (EDIT THIS ONE)

### Derived (Auto-Generated)
- `backend/.env` - Backend environment variables
- `backend/.backend-config` - Backend runtime config
- `frontend/.env.local` - Frontend environment variables  
- `frontend/.frontend-config` - Frontend runtime config
- `frontend/next.config.js` - Next.js configuration

## 🔧 How to Change Ports

### Method 1: Use the Port Manager (Recommended)
```bash
# Change all ports at once
./change-ports.command [backend-port] [frontend-dev-port] [frontend-prod-port]

# Examples:
./change-ports.command 4750 4800 4801    # Set specific ports
./change-ports.command                    # Show current config
```

### Method 2: Edit Master Config Directly
1. Edit `.master-config`
2. Run: `source master-config-reader.sh && update_all_configs`

## 📋 Current Configuration

```bash
# View current settings
./change-ports.command

# Or check master config directly
cat .master-config
```

## 🔄 How It Works

1. **Master Config** (`.master-config`) defines all port settings
2. **Master Reader** (`master-config-reader.sh`) provides functions to read config
3. **Port Manager** (`change-ports.command`) updates master config and syncs all files
4. **Run Scripts** automatically load the master config when starting services

## 🚀 Benefits

- ✅ **Single source of truth** - no more conflicting configurations
- ✅ **Automatic synchronization** - all files stay in sync
- ✅ **Easy port changes** - one command updates everything
- ✅ **No manual editing** - scripts handle all file updates
- ✅ **Consistent URLs** - backend/frontend URLs automatically match

## 📝 Configuration Keys

| Key | Description | Default |
|-----|-------------|---------|
| `BACKEND_PORT` | Backend API port | 4750 |
| `FRONTEND_DEV_PORT` | Frontend development port | 4800 |
| `FRONTEND_PROD_PORT` | Frontend production port | 4801 |
| `BACKEND_HOST` | Backend host binding | 0.0.0.0 |
| `FRONTEND_HOST` | Frontend host binding | 0.0.0.0 |
| `SERVER_IP` | Server IP (auto-detected if not set) | Auto |

## 🔧 Advanced Usage

### Manual Configuration Sync
```bash
# Load the master config reader
source master-config-reader.sh

# Get specific values
get_config_value "BACKEND_PORT"
get_server_ip

# Generate URLs
generate_backend_url
generate_frontend_url

# Update all configs
update_all_configs
```

### Custom Server IP
To use a specific server IP instead of auto-detection:
```bash
# Edit .master-config and uncomment/modify:
SERVER_IP=192.168.1.100
```

## 🚨 Important Notes

- **Never edit derived config files directly** - they will be overwritten
- **Always use `.master-config`** as your single source of truth
- **Restart services** after changing ports to apply changes
- **Ports must be between 1024-65535** (validation included)

## 🔍 Troubleshooting

### Port conflicts
```bash
# Check what's using a port
lsof -i :4750

# Kill process using port
lsof -ti:4750 | xargs kill -9
```

### Configuration issues
```bash
# Reset all configs from master
source master-config-reader.sh && update_all_configs

# Verify configuration
./change-ports.command
```

This unified system eliminates the confusion of multiple configuration sources and makes port management simple and reliable.
