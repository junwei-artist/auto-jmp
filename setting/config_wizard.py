"""
Configuration Wizard - Web UI for managing Auto-JMP settings.
Provides a local web interface for configuring backend and frontend settings.
"""
import os
import json
import sys
import socket
import subprocess
import webbrowser
import time
from pathlib import Path
from flask import Flask, render_template, request, jsonify, send_from_directory
from flask_cors import CORS
from setting.utils import SettingsManager

# Initialize Flask app
app = Flask(__name__, template_folder='templates')
CORS(app)

# Initialize settings manager
settings_manager = SettingsManager()

def is_port_in_use(port):
    """Check if a port is currently in use."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind(('127.0.0.1', port))
            return False
        except OSError:
            return True

def get_process_using_port(port):
    """Get the process ID using the specified port."""
    try:
        # Use lsof to find the process using the port
        result = subprocess.run(
            ['lsof', '-ti', f':{port}'],
            capture_output=True,
            text=True
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip().split('\n')[0]
        return None
    except Exception:
        return None

def kill_process(pid):
    """Kill a process by its PID."""
    try:
        subprocess.run(['kill', '-9', str(pid)], check=True)
        return True
    except Exception:
        return False

def wait_for_port_to_be_free(port, timeout=10):
    """Wait for a port to become free."""
    start_time = time.time()
    while time.time() - start_time < timeout:
        if not is_port_in_use(port):
            return True
        time.sleep(0.5)
    return False

@app.route('/')
def index():
    """Serve the main settings page."""
    return render_template('index.html')

@app.route('/api/config')
def get_config():
    """Get current configuration."""
    try:
        config = settings_manager.load_current_config()
        status = settings_manager.get_service_status()
        return jsonify({
            'success': True,
            'backend': config['backend'],
            'frontend': config['frontend'],
            'root': config['root'],
            'status': status
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

@app.route('/api/config/backend', methods=['POST'])
def update_backend_config():
    """Update backend configuration."""
    try:
        config = request.get_json()
        success = settings_manager.update_backend_config(config)
        
        if success:
            return jsonify({
                'success': True,
                'message': 'Backend configuration updated successfully'
            })
        else:
            return jsonify({
                'success': False,
                'message': 'Failed to update backend configuration'
            }), 500
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

@app.route('/api/config/frontend', methods=['POST'])
def update_frontend_config():
    """Update frontend configuration."""
    try:
        config = request.get_json()
        success = settings_manager.update_frontend_config(config)
        
        if success:
            return jsonify({
                'success': True,
                'message': 'Frontend configuration updated successfully'
            })
        else:
            return jsonify({
                'success': False,
                'message': 'Failed to update frontend configuration'
            }), 500
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

@app.route('/api/test/backend')
def test_backend():
    """Test backend connections."""
    try:
        config = settings_manager.load_current_config()
        backend_url = config['frontend'].get('NEXT_PUBLIC_BACKEND_URL', 'http://localhost:4700')
        
        success, message = settings_manager.test_backend_api(backend_url)
        return jsonify({
            'success': success,
            'message': message
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

@app.route('/api/test/frontend')
def test_frontend():
    """Test frontend connections."""
    try:
        config = settings_manager.load_current_config()
        frontend_url = config['frontend'].get('NEXT_PUBLIC_FRONTEND_URL', 'http://localhost:4800')
        
        success, message = settings_manager.test_frontend_api(frontend_url)
        return jsonify({
            'success': success,
            'message': message
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

@app.route('/api/test/database', methods=['POST'])
def test_database():
    """Test database connection."""
    try:
        db_config = request.get_json()
        
        if db_config and all(key in db_config for key in ['host', 'port', 'name', 'user', 'password']):
            # Construct database URL from form data
            database_url = f"postgresql://{db_config['user']}:{db_config['password']}@{db_config['host']}:{db_config['port']}/{db_config['name']}"
        else:
            # Use configured database URL
            database_url = None
        
        success, message = settings_manager.test_database_connection(database_url)
        return jsonify({
            'success': success,
            'message': message
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

@app.route('/api/test/database-simple')
def test_database_simple():
    """Test database connection using current configuration."""
    try:
        success, message = settings_manager.test_database_connection()
        return jsonify({
            'success': success,
            'message': message
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

@app.route('/api/test/redis')
def test_redis():
    """Test Redis connection."""
    try:
        config = settings_manager.load_current_config()
        redis_url = config['backend'].get('REDIS_URL', 'redis://localhost:6379')
        
        success, message = settings_manager.test_redis_connection(redis_url)
        return jsonify({
            'success': success,
            'message': message
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

@app.route('/api/redis/status')
def get_redis_status():
    """Get comprehensive Redis status."""
    try:
        redis_status = settings_manager.get_redis_status()
        return jsonify({
            'success': True,
            'redis_status': redis_status
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

@app.route('/api/celery/status')
def get_celery_status():
    """Get comprehensive Celery status."""
    try:
        celery_status = settings_manager.get_celery_status()
        return jsonify({
            'success': True,
            'celery_status': celery_status
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

@app.route('/api/test/celery')
def test_celery():
    """Test Celery connection."""
    try:
        success, message = settings_manager.test_celery_connection()
        return jsonify({
            'success': success,
            'message': message
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

@app.route('/api/redis-celery/health')
def get_redis_celery_health():
    """Get comprehensive Redis and Celery health status."""
    try:
        health = settings_manager.get_redis_and_celery_health()
        return jsonify({
            'success': True,
            'health': health
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

@app.route('/api/restart/<service>', methods=['POST'])
def restart_service(service):
    """Restart a service (backend or frontend)."""
    try:
        if service == 'backend':
            success, message = settings_manager.restart_backend()
        elif service == 'frontend':
            success, message = settings_manager.restart_frontend()
        else:
            return jsonify({
                'success': False,
                'message': f'Unknown service: {service}'
            }), 400
        
        return jsonify({
            'success': success,
            'message': message
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

@app.route('/api/admin/create', methods=['POST'])
def create_admin():
    """Create admin user."""
    try:
        admin_data = request.get_json()
        username = admin_data.get('username')
        password = admin_data.get('password')
        email = admin_data.get('email')
        
        if not all([username, password, email]):
            return jsonify({
                'success': False,
                'message': 'Username, password, and email are required'
            }), 400
        
        success, message = settings_manager.create_admin_user(username, password, email)
        return jsonify({
            'success': success,
            'message': message
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

@app.route('/api/config/reset', methods=['POST'])
def reset_config():
    """Reset configuration to defaults."""
    try:
        # Create default backend config
        default_backend = {
            'DATABASE_URL': 'postgresql+asyncpg://data_user:password@localhost:5432/data_analysis',
            'REDIS_URL': 'redis://localhost:6379',
            'CELERY_BROKER_URL': 'redis://localhost:6379/0',
            'CELERY_RESULT_BACKEND': 'redis://localhost:6379/0',
            'SECRET_KEY': 'your-secret-key-change-in-production',
            'ALLOW_GUEST_ACCESS': 'true',
            'ENVIRONMENT': 'development',
            'MAX_FILE_SIZE': '104857600',
            'BACKEND_CORS_ORIGINS': '["http://localhost:4800", "http://localhost:4801"]'
        }
        
        # Create default frontend config
        default_frontend = {
            'NEXT_PUBLIC_BACKEND_URL': 'http://localhost:4700',
            'NEXT_PUBLIC_WS_URL': 'ws://localhost:4700',
            'NEXT_PUBLIC_FRONTEND_URL': 'http://localhost:4800'
        }
        
        # Update configurations
        backend_success = settings_manager.update_backend_config(default_backend)
        frontend_success = settings_manager.update_frontend_config(default_frontend)
        
        if backend_success and frontend_success:
            return jsonify({
                'success': True,
                'message': 'Configuration reset to defaults successfully'
            })
        else:
            return jsonify({
                'success': False,
                'message': 'Failed to reset some configurations'
            }), 500
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

@app.route('/api/config-summary')
def get_config_summary():
    """Get comprehensive configuration summary with file paths."""
    try:
        summary = settings_manager.get_configuration_summary()
        return jsonify({
            'success': True,
            'summary': summary
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

@app.route('/api/file-paths')
def get_file_paths():
    """Get all configuration file paths."""
    try:
        file_paths = settings_manager._get_config_file_paths()
        file_status = settings_manager._get_config_file_status()
        return jsonify({
            'success': True,
            'file_paths': file_paths,
            'file_status': file_status
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

@app.route('/api/postgresql-system-check', methods=['POST'])
def check_postgresql_system():
    """Check PostgreSQL system including users and databases."""
    try:
        data = request.get_json()
        
        if not data or not all(key in data for key in ['superuser', 'password']):
            return jsonify({
                'success': False,
                'message': 'Superuser credentials are required'
            }), 400
        
        superuser = data['superuser']
        password = data['password']
        host = data.get('host', 'localhost')
        port = data.get('port', 5432)
        
        # Perform PostgreSQL system check
        results = settings_manager.check_postgresql_system(superuser, password, host, port)
        
        return jsonify({
            'success': True,
            'results': results
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

@app.route('/api/get-database-user')
def get_database_user():
    """Get the database user from backend configuration."""
    try:
        config = settings_manager.load_current_config()
        database_url = config['backend'].get('DATABASE_URL')
        
        if database_url:
            db_info = settings_manager._parse_database_url(database_url)
            if db_info:
                return jsonify({
                    'success': True,
                    'database_user': db_info['user'],
                    'database_host': db_info['host'],
                    'database_port': db_info['port'],
                    'database_name': db_info['database']
                })
        
        return jsonify({
            'success': False,
            'message': 'No database configuration found'
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

@app.route('/api/diagnostics')
def get_diagnostics():
    """Get comprehensive diagnostic information."""
    try:
        diagnostics = settings_manager.get_detailed_diagnostics()
        return jsonify({
            'success': True,
            'diagnostics': diagnostics
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

@app.route('/api/system-info')
def get_system_info():
    """Get system information."""
    try:
        system_info = settings_manager.get_system_info()
        return jsonify({
            'success': True,
            'system_info': system_info
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

@app.route('/api/communication-test')
def test_communication():
    """Test frontend-backend communication."""
    try:
        communication_test = settings_manager.test_frontend_backend_communication()
        return jsonify({
            'success': True,
            'communication_test': communication_test
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

@app.route('/api/consistency-check')
def check_consistency():
    """Check configuration consistency."""
    try:
        consistency_check = settings_manager.check_configuration_consistency()
        return jsonify({
            'success': True,
            'consistency_check': consistency_check
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

@app.route('/api/network-info')
def get_network_info():
    """Get network information."""
    try:
        system_info = settings_manager.get_system_info()
        network_info = {
            'ip_addresses': system_info.get('ip_addresses', {}),
            'network_interfaces': system_info.get('network_interfaces', []),
            'firewall_status': system_info.get('firewall_status', {}),
            'hosts_file': system_info.get('hosts_file', {}),
            'connectivity': settings_manager._test_network_connectivity()
        }
        return jsonify({
            'success': True,
            'network_info': network_info
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

@app.route('/api/status')
def get_status():
    """Get service status."""
    try:
        status = settings_manager.get_service_status()
        return jsonify({
            'success': True,
            'status': status
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

@app.errorhandler(404)
def not_found(error):
    """Handle 404 errors."""
    return jsonify({
        'success': False,
        'message': 'Endpoint not found'
    }), 404

@app.errorhandler(500)
def internal_error(error):
    """Handle 500 errors."""
    return jsonify({
        'success': False,
        'message': 'Internal server error'
    }), 500

def main():
    """Main function to run the configuration wizard."""
    import argparse
    
    parser = argparse.ArgumentParser(description='Auto-JMP Configuration Wizard')
    parser.add_argument('--host', default='127.0.0.1', help='Host to bind to (default: 127.0.0.1)')
    parser.add_argument('--port', type=int, default=4900, help='Port to bind to (default: 4900)')
    parser.add_argument('--debug', action='store_true', help='Enable debug mode')
    parser.add_argument('--no-browser', action='store_true', help='Do not open browser automatically')
    
    args = parser.parse_args()
    
    print(f"🧰 Auto-JMP Configuration Wizard")
    print(f"Checking port {args.port}...")
    
    # Check if port is in use
    if is_port_in_use(args.port):
        pid = get_process_using_port(args.port)
        if pid:
            print(f"⚠️  Port {args.port} is already in use by process {pid}")
            
            # Ask user if they want to kill the process
            while True:
                response = input(f"Would you like to kill process {pid} and use port {args.port}? (y/n): ").lower().strip()
                if response in ['y', 'yes']:
                    print(f"🔪 Killing process {pid}...")
                    if kill_process(pid):
                        print(f"✅ Process {pid} killed successfully")
                        # Wait for port to be free
                        if wait_for_port_to_be_free(args.port):
                            print(f"✅ Port {args.port} is now free")
                            break
                        else:
                            print(f"❌ Port {args.port} is still in use after killing process")
                            sys.exit(1)
                    else:
                        print(f"❌ Failed to kill process {pid}")
                        sys.exit(1)
                elif response in ['n', 'no']:
                    print("❌ Cannot start settings tool on occupied port")
                    sys.exit(1)
                else:
                    print("Please answer 'y' for yes or 'n' for no")
        else:
            print(f"❌ Port {args.port} is in use but cannot identify the process")
            sys.exit(1)
    else:
        print(f"✅ Port {args.port} is available")
    
    print(f"🚀 Starting server on http://{args.host}:{args.port}")
    
    # Open browser automatically unless disabled
    if not args.no_browser:
        print(f"🌐 Opening browser...")
        time.sleep(1)  # Give server a moment to start
        webbrowser.open(f'http://{args.host}:{args.port}')
    
    print(f"📖 Settings tool is now available at: http://{args.host}:{args.port}")
    print(f"Press Ctrl+C to stop the server")
    
    try:
        app.run(host=args.host, port=args.port, debug=args.debug)
    except KeyboardInterrupt:
        print("\n👋 Shutting down configuration wizard...")
        sys.exit(0)

if __name__ == '__main__':
    main()
