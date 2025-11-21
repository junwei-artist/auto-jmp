"""
Settings utility functions for managing configuration, database, and admin operations.
"""
import os
import json
import subprocess
import psycopg2
import redis
import requests
import socket
import platform
import netifaces
from pathlib import Path
from typing import Dict, Any, Optional, Tuple, List
from dotenv import load_dotenv, set_key, unset_key


class SettingsManager:
    """Manages application settings and configuration."""
    
    def __init__(self, project_root: str = None):
        self.project_root = Path(project_root) if project_root else Path(__file__).parent.parent
        self.backend_env_path = self.project_root / "backend" / ".env"
        self.frontend_env_path = self.project_root / "frontend" / ".env.local"
        self.root_env_path = self.project_root / ".env"
        
    def load_current_config(self) -> Dict[str, Any]:
        """Load current configuration from all .env files."""
        config = {
            "backend": {},
            "frontend": {},
            "root": {},
            "file_paths": self._get_config_file_paths(),
            "file_status": self._get_config_file_status()
        }
        
        # Load backend config
        if self.backend_env_path.exists():
            load_dotenv(self.backend_env_path)
            config["backend"] = self._extract_env_vars()
            
        # Load frontend config
        if self.frontend_env_path.exists():
            load_dotenv(self.frontend_env_path)
            config["frontend"] = self._extract_env_vars()
            
        # Load root config
        if self.root_env_path.exists():
            load_dotenv(self.root_env_path)
            config["root"] = self._extract_env_vars()
            
        return config
    
    def _get_config_file_paths(self) -> Dict[str, str]:
        """Get paths to all configuration files."""
        return {
            "backend_env": str(self.backend_env_path),
            "frontend_env": str(self.frontend_env_path),
            "root_env": str(self.root_env_path),
            "backend_example": str(self.project_root / "backend" / "env.example"),
            "frontend_example": str(self.project_root / "frontend" / "env.example"),
            "root_example": str(self.project_root / "env.example"),
            "backend_readme": str(self.project_root / "backend" / "README.md"),
            "frontend_readme": str(self.project_root / "frontend" / "README.md"),
            "main_readme": str(self.project_root / "README.md")
        }
    
    def _get_config_file_status(self) -> Dict[str, Dict[str, Any]]:
        """Get status information for all configuration files."""
        file_paths = self._get_config_file_paths()
        status = {}
        
        for name, path in file_paths.items():
            file_path = Path(path)
            status[name] = {
                "exists": file_path.exists(),
                "path": str(file_path),
                "size": file_path.stat().st_size if file_path.exists() else 0,
                "modified": file_path.stat().st_mtime if file_path.exists() else None,
                "readable": os.access(file_path, os.R_OK) if file_path.exists() else False,
                "writable": os.access(file_path, os.W_OK) if file_path.exists() else False
            }
        
        return status
    
    def get_configuration_summary(self) -> Dict[str, Any]:
        """Get a comprehensive configuration summary with file paths."""
        config = self.load_current_config()
        
        summary = {
            "timestamp": subprocess.run(["date"], capture_output=True, text=True).stdout.strip(),
            "file_paths": config["file_paths"],
            "file_status": config["file_status"],
            "configuration_sources": {
                "backend": {
                    "source_file": config["file_paths"]["backend_env"],
                    "exists": config["file_status"]["backend_env"]["exists"],
                    "variables": list(config["backend"].keys()),
                    "count": len(config["backend"])
                },
                "frontend": {
                    "source_file": config["file_paths"]["frontend_env"],
                    "exists": config["file_status"]["frontend_env"]["exists"],
                    "variables": list(config["frontend"].keys()),
                    "count": len(config["frontend"])
                },
                "root": {
                    "source_file": config["file_paths"]["root_env"],
                    "exists": config["file_status"]["root_env"]["exists"],
                    "variables": list(config["root"].keys()),
                    "count": len(config["root"])
                }
            },
            "key_settings": {
                "backend_url": config["frontend"].get("NEXT_PUBLIC_BACKEND_URL", "Not set"),
                "frontend_url": config["frontend"].get("NEXT_PUBLIC_FRONTEND_URL", "Not set"),
                "ws_url": config["frontend"].get("NEXT_PUBLIC_WS_URL", "Not set"),
                "database_url": config["backend"].get("DATABASE_URL", "Not set"),
                "redis_url": config["backend"].get("REDIS_URL", "Not set"),
                "environment": config["backend"].get("ENVIRONMENT", "Not set")
            },
            "recommendations": self._get_configuration_recommendations(config)
        }
        
        return summary
    
    def _get_configuration_recommendations(self, config: Dict[str, Any]) -> List[str]:
        """Get recommendations for configuration improvements."""
        recommendations = []
        
        # Check for missing files
        if not config["file_status"]["backend_env"]["exists"]:
            recommendations.append(f"Create backend configuration file: {config['file_paths']['backend_env']}")
        
        if not config["file_status"]["frontend_env"]["exists"]:
            recommendations.append(f"Create frontend configuration file: {config['file_paths']['frontend_env']}")
        
        # Check for missing key variables
        if not config["backend"].get("DATABASE_URL"):
            recommendations.append("Set DATABASE_URL in backend configuration")
        
        if not config["backend"].get("REDIS_URL"):
            recommendations.append("Set REDIS_URL in backend configuration")
        
        if not config["frontend"].get("NEXT_PUBLIC_BACKEND_URL"):
            recommendations.append("Set NEXT_PUBLIC_BACKEND_URL in frontend configuration")
        
        # Check for example files
        if config["file_status"]["backend_example"]["exists"] and not config["file_status"]["backend_env"]["exists"]:
            recommendations.append(f"Copy example file: cp {config['file_paths']['backend_example']} {config['file_paths']['backend_env']}")
        
        if config["file_status"]["frontend_example"]["exists"] and not config["file_status"]["frontend_env"]["exists"]:
            recommendations.append(f"Copy example file: cp {config['file_paths']['frontend_example']} {config['file_paths']['frontend_env']}")
        
        return recommendations
    
    def check_postgresql_system(self, superuser: str, password: str, host: str = "localhost", port: int = 5432) -> Dict[str, Any]:
        """Check PostgreSQL system including users and databases."""
        results = {
            "connection_successful": False,
            "users": [],
            "databases": [],
            "roles": [],
            "permissions": {},
            "system_info": {},
            "errors": []
        }
        
        try:
            # Construct superuser connection URL
            superuser_url = f"postgresql://{superuser}:{password}@{host}:{port}/postgres"
            
            # Test connection
            conn = psycopg2.connect(superuser_url)
            results["connection_successful"] = True
            
            cursor = conn.cursor()
            
            # Get PostgreSQL version and system info
            cursor.execute("SELECT version();")
            results["system_info"]["version"] = cursor.fetchone()[0]
            
            cursor.execute("SELECT current_database(), current_user, inet_server_addr(), inet_server_port();")
            db_info = cursor.fetchone()
            results["system_info"]["current_database"] = db_info[0]
            results["system_info"]["current_user"] = db_info[1]
            results["system_info"]["server_address"] = db_info[2]
            results["system_info"]["server_port"] = db_info[3]
            
            # Get all users/roles
            cursor.execute("""
                SELECT 
                    rolname as username,
                    rolsuper as is_superuser,
                    rolinherit as can_inherit,
                    rolcreaterole as can_create_roles,
                    rolcreatedb as can_create_databases,
                    rolcanlogin as can_login,
                    rolreplication as can_replicate,
                    rolconnlimit as connection_limit,
                    rolvaliduntil as password_expires
                FROM pg_roles 
                ORDER BY rolname;
            """)
            
            for row in cursor.fetchall():
                results["users"].append({
                    "username": row[0],
                    "is_superuser": row[1],
                    "can_inherit": row[2],
                    "can_create_roles": row[3],
                    "can_create_databases": row[4],
                    "can_login": row[5],
                    "can_replicate": row[6],
                    "connection_limit": row[7],
                    "password_expires": row[8].strftime('%Y-%m-%d %H:%M:%S') if row[8] else None
                })
            
            # Get all databases
            cursor.execute("""
                SELECT 
                    datname as database_name,
                    pg_size_pretty(pg_database_size(datname)) as size,
                    datowner::regrole as owner,
                    encoding,
                    datcollate as collation,
                    datctype as ctype,
                    datistemplate as is_template,
                    datallowconn as allows_connections,
                    datconnlimit as connection_limit,
                    datlastsysoid,
                    datfrozenxid,
                    datminmxid,
                    dattablespace as tablespace
                FROM pg_database 
                ORDER BY datname;
            """)
            
            for row in cursor.fetchall():
                results["databases"].append({
                    "database_name": row[0],
                    "size": row[1],
                    "owner": row[2],
                    "encoding": row[3],
                    "collation": row[4],
                    "ctype": row[5],
                    "is_template": row[6],
                    "allows_connections": row[7],
                    "connection_limit": row[8],
                    "last_system_oid": row[9],
                    "frozen_xid": row[10],
                    "min_mxid": row[11],
                    "tablespace": row[12]
                })
            
            # Get role memberships
            cursor.execute("""
                SELECT 
                    r.rolname as role_name,
                    m.rolname as member_name,
                    b.rolname as grantor_name,
                    admin_option
                FROM pg_auth_members am
                JOIN pg_roles r ON am.roleid = r.oid
                JOIN pg_roles m ON am.member = m.oid
                LEFT JOIN pg_roles b ON am.grantor = b.oid
                ORDER BY r.rolname, m.rolname;
            """)
            
            for row in cursor.fetchall():
                results["roles"].append({
                    "role_name": row[0],
                    "member_name": row[1],
                    "grantor_name": row[2],
                    "admin_option": row[3]
                })
            
            # Get database permissions
            cursor.execute("""
                SELECT 
                    datname as database_name,
                    pg_catalog.has_database_privilege(current_user, datname, 'CONNECT') as can_connect,
                    pg_catalog.has_database_privilege(current_user, datname, 'CREATE') as can_create,
                    pg_catalog.has_database_privilege(current_user, datname, 'TEMPORARY') as can_create_temp
                FROM pg_database 
                WHERE datname NOT IN ('template0', 'template1')
                ORDER BY datname;
            """)
            
            for row in cursor.fetchall():
                results["permissions"][row[0]] = {
                    "can_connect": row[1],
                    "can_create": row[2],
                    "can_create_temp": row[3]
                }
            
            cursor.close()
            conn.close()
            
        except Exception as e:
            results["errors"].append(f"PostgreSQL system check failed: {str(e)}")
        
        return results
    
    def _extract_env_vars(self) -> Dict[str, str]:
        """Extract environment variables from current environment."""
        relevant_vars = [
            "DATABASE_URL", "REDIS_URL", "CELERY_BROKER_URL", "CELERY_RESULT_BACKEND",
            "SECRET_KEY", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION",
            "S3_BUCKET", "S3_ENDPOINT_URL", "SMTP_HOST", "SMTP_PORT", "SMTP_USER",
            "SMTP_PASSWORD", "EMAILS_FROM_EMAIL", "EMAILS_FROM_NAME", "JMP_TASK_DIR",
            "JMP_MAX_WAIT_TIME", "JMP_START_DELAY", "ALLOW_GUEST_ACCESS", "GUEST_RATE_LIMIT",
            "GUEST_MAX_FILE_SIZE", "MAX_FILE_SIZE", "ALLOWED_FILE_TYPES", "BACKEND_CORS_ORIGINS",
            "NEXT_PUBLIC_BACKEND_URL", "NEXT_PUBLIC_WS_URL", "NEXT_PUBLIC_FRONTEND_URL",
            "ENVIRONMENT", "ALGORITHM", "ACCESS_TOKEN_EXPIRE_MINUTES", "UPLOAD_DIR"
        ]
        
        return {var: os.getenv(var, "") for var in relevant_vars if os.getenv(var)}
    
    def update_backend_config(self, config: Dict[str, str]) -> bool:
        """Update backend .env file with new configuration."""
        try:
            # Create .env file if it doesn't exist
            if not self.backend_env_path.exists():
                self.backend_env_path.touch()
                
            # Update each key-value pair
            for key, value in config.items():
                if value:
                    set_key(self.backend_env_path, key, value)
                else:
                    unset_key(self.backend_env_path, key)
                    
            return True
        except Exception as e:
            print(f"Error updating backend config: {e}")
            return False
    
    def update_frontend_config(self, config: Dict[str, str]) -> bool:
        """Update frontend .env.local file with new configuration."""
        try:
            # Create .env.local file if it doesn't exist
            if not self.frontend_env_path.exists():
                self.frontend_env_path.touch()
                
            # Update each key-value pair
            for key, value in config.items():
                if value:
                    set_key(self.frontend_env_path, key, value)
                else:
                    unset_key(self.frontend_env_path, key)
                    
            return True
        except Exception as e:
            print(f"Error updating frontend config: {e}")
            return False
    
    def test_database_connection(self, database_url: str = None) -> Tuple[bool, str]:
        """Test database connection."""
        try:
            # If no URL provided, get from current config
            if not database_url:
                config = self.load_current_config()
                database_url = config["backend"].get("DATABASE_URL")
                if not database_url:
                    return False, "No database URL configured"
            
            # Parse database URL to extract components
            db_info = self._parse_database_url(database_url)
            if not db_info:
                return False, f"Invalid database URL format: {database_url}"
            
            # Convert to psycopg2 compatible URL
            psycopg2_url = f"postgresql://{db_info['user']}:{db_info['password']}@{db_info['host']}:{db_info['port']}/{db_info['database']}"
            
            conn = psycopg2.connect(psycopg2_url)
            conn.close()
            return True, f"Database connection successful to {db_info['database']} on {db_info['host']}:{db_info['port']}"
        except Exception as e:
            return False, f"Database connection failed: {str(e)}"
    
    def _parse_database_url(self, database_url: str) -> Optional[Dict[str, str]]:
        """Parse database URL into components."""
        try:
            # Handle different URL formats
            if database_url.startswith("postgresql+asyncpg://"):
                database_url = database_url.replace("postgresql+asyncpg://", "postgresql://")
            elif database_url.startswith("postgresql://"):
                pass  # Already correct format
            else:
                return None
            
            # Parse the URL
            from urllib.parse import urlparse
            parsed = urlparse(database_url)
            
            return {
                'user': parsed.username or 'postgres',
                'password': parsed.password or '',
                'host': parsed.hostname or 'localhost',
                'port': str(parsed.port or 5432),
                'database': parsed.path.lstrip('/') if parsed.path else 'postgres'
            }
        except Exception as e:
            print(f"Error parsing database URL: {e}")
            return None
    
    def test_redis_connection(self, redis_url: str) -> Tuple[bool, str]:
        """Test Redis connection."""
        try:
            r = redis.from_url(redis_url)
            r.ping()
            return True, "Redis connection successful"
        except Exception as e:
            return False, f"Redis connection failed: {str(e)}"
    
    def get_redis_status(self) -> Dict[str, Any]:
        """Get comprehensive Redis status information."""
        status = {
            "running": False,
            "version": None,
            "memory_usage": None,
            "connected_clients": None,
            "uptime": None,
            "keys_count": None,
            "info": {},
            "error": None
        }
        
        try:
            config = self.load_current_config()
            redis_url = config["backend"].get("REDIS_URL", "redis://localhost:6379")
            
            r = redis.from_url(redis_url)
            
            # Test basic connection
            r.ping()
            status["running"] = True
            
            # Get Redis info
            info = r.info()
            status["info"] = info
            status["version"] = info.get("redis_version", "Unknown")
            status["memory_usage"] = info.get("used_memory_human", "Unknown")
            status["connected_clients"] = info.get("connected_clients", 0)
            status["uptime"] = info.get("uptime_in_seconds", 0)
            status["keys_count"] = info.get("db0", {}).get("keys", 0)
            
        except Exception as e:
            status["error"] = str(e)
            status["running"] = False
        
        return status
    
    def get_celery_status(self) -> Dict[str, Any]:
        """Get comprehensive Celery status information."""
        status = {
            "workers_running": False,
            "active_tasks": 0,
            "queued_tasks": 0,
            "completed_tasks": 0,
            "failed_tasks": 0,
            "worker_info": [],
            "queue_info": {},
            "error": None
        }
        
        try:
            config = self.load_current_config()
            redis_url = config["backend"].get("CELERY_BROKER_URL", "redis://localhost:6379/0")
            
            r = redis.from_url(redis_url)
            
            # Check if Celery workers are running
            worker_keys = r.keys("celery-task-meta-*")
            if worker_keys:
                status["workers_running"] = True
            
            # Get task information
            for key in worker_keys:
                try:
                    task_data = r.get(key)
                    if task_data:
                        import json
                        task_info = json.loads(task_data)
                        task_status = task_info.get("status", "UNKNOWN")
                        
                        if task_status == "SUCCESS":
                            status["completed_tasks"] += 1
                        elif task_status == "FAILURE":
                            status["failed_tasks"] += 1
                        elif task_status == "PENDING":
                            status["queued_tasks"] += 1
                        elif task_status in ["STARTED", "RETRY"]:
                            status["active_tasks"] += 1
                except:
                    continue
            
            # Get queue information
            queue_keys = r.keys("*")
            for key in queue_keys:
                key_str = key.decode() if isinstance(key, bytes) else str(key)
                if "celery" in key_str.lower():
                    try:
                        queue_data = r.get(key)
                        if queue_data:
                            status["queue_info"][key_str] = len(queue_data) if isinstance(queue_data, (list, str)) else 1
                    except:
                        continue
            
        except Exception as e:
            status["error"] = str(e)
            status["workers_running"] = False
        
        return status
    
    def test_celery_connection(self) -> Tuple[bool, str]:
        """Test Celery connection and worker availability."""
        try:
            config = self.load_current_config()
            redis_url = config["backend"].get("CELERY_BROKER_URL", "redis://localhost:6379/0")
            
            r = redis.from_url(redis_url)
            
            # Test Redis connection (Celery broker)
            r.ping()
            
            # Check for Celery workers
            worker_keys = r.keys("celery-task-meta-*")
            if worker_keys:
                return True, f"Celery broker connected, {len(worker_keys)} task(s) found"
            else:
                return True, "Celery broker connected, no active tasks"
                
        except Exception as e:
            return False, f"Celery connection failed: {str(e)}"
    
    def get_redis_and_celery_health(self) -> Dict[str, Any]:
        """Get comprehensive health status for Redis and Celery."""
        health = {
            "redis": self.get_redis_status(),
            "celery": self.get_celery_status(),
            "overall_status": "healthy",
            "recommendations": []
        }
        
        # Determine overall health
        if not health["redis"]["running"]:
            health["overall_status"] = "unhealthy"
            health["recommendations"].append("Start Redis service")
        elif not health["celery"]["workers_running"]:
            health["overall_status"] = "degraded"
            health["recommendations"].append("Start Celery worker")
        
        # Add specific recommendations
        if health["redis"]["running"] and health["redis"]["connected_clients"] == 0:
            health["recommendations"].append("No clients connected to Redis")
        
        if health["celery"]["workers_running"] and health["celery"]["failed_tasks"] > 0:
            health["recommendations"].append(f"{health['celery']['failed_tasks']} failed tasks need attention")
        
        return health
    
    def test_backend_api(self, backend_url: str) -> Tuple[bool, str]:
        """Test backend API availability."""
        try:
            response = requests.get(f"{backend_url}/health", timeout=5)
            if response.status_code == 200:
                return True, "Backend API is running"
            else:
                return False, f"Backend API returned status {response.status_code}"
        except Exception as e:
            return False, f"Backend API test failed: {str(e)}"
    
    def test_frontend_api(self, frontend_url: str) -> Tuple[bool, str]:
        """Test frontend availability."""
        try:
            response = requests.get(frontend_url, timeout=5)
            if response.status_code == 200:
                return True, "Frontend is running"
            else:
                return False, f"Frontend returned status {response.status_code}"
        except Exception as e:
            return False, f"Frontend test failed: {str(e)}"
    
    def restart_backend(self) -> Tuple[bool, str]:
        """Restart backend service - kills all instances and starts one."""
        try:
            # Kill all backend processes
            backend_patterns = [
                "python.*main.py",
                "uvicorn.*main:app", 
                "python.*uvicorn.*main",
                "fastapi.*main",
                "python.*fastapi.*main"
            ]
            
            killed_count = 0
            for pattern in backend_patterns:
                result = subprocess.run(
                    ["pkill", "-f", pattern],
                    capture_output=True,
                    text=True
                )
                if result.returncode == 0:
                    killed_count += 1
            
            # Start backend in background
            backend_path = self.project_root / "backend"
            result = subprocess.Popen(
                ["python", "main.py"],
                cwd=backend_path,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )
            
            return True, f"Backend restart initiated (killed {killed_count} instances)"
        except Exception as e:
            return False, f"Failed to restart backend: {str(e)}"
    
    def restart_frontend(self) -> Tuple[bool, str]:
        """Restart frontend service - kills all instances and starts one."""
        try:
            # Kill all frontend processes
            frontend_patterns = [
                "next.*dev",
                "npm.*run.*dev",
                "yarn.*dev", 
                "node.*next"
            ]
            
            killed_count = 0
            for pattern in frontend_patterns:
                result = subprocess.run(
                    ["pkill", "-f", pattern],
                    capture_output=True,
                    text=True
                )
                if result.returncode == 0:
                    killed_count += 1
            
            # Start frontend in background
            frontend_path = self.project_root / "frontend"
            result = subprocess.Popen(
                ["npm", "run", "dev"],
                cwd=frontend_path,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )
            
            return True, f"Frontend restart initiated (killed {killed_count} instances)"
        except Exception as e:
            return False, f"Failed to restart frontend: {str(e)}"
    
    def create_admin_user(self, username: str, password: str, email: str) -> Tuple[bool, str]:
        """Create admin user using backend script."""
        try:
            backend_path = self.project_root / "backend"
            result = subprocess.run(
                ["python", "create_admin.py", username, password, email],
                cwd=backend_path,
                capture_output=True,
                text=True
            )
            
            if result.returncode == 0:
                return True, "Admin user created successfully"
            else:
                return False, f"Failed to create admin user: {result.stderr}"
        except Exception as e:
            return False, f"Error creating admin user: {str(e)}"
    
    def get_service_status(self) -> Dict[str, Any]:
        """Get status of backend and frontend services - returns all running instances."""
        status = {
            "backend": {"running": False, "instances": []},
            "frontend": {"running": False, "instances": []}
        }
        
        try:
            # Check backend process - look for various ways backend can be started
            backend_patterns = [
                "python.*main.py",           # Direct python main.py
                "uvicorn.*main:app",         # uvicorn main:app
                "python.*uvicorn.*main",    # python -m uvicorn main:app
                "fastapi.*main",            # fastapi main:app
                "python.*fastapi.*main"     # python -m fastapi main:app
            ]
            
            backend_instances = []
            seen_pids = set()  # Track PIDs to avoid duplicates
            
            for pattern in backend_patterns:
                result = subprocess.run(
                    ["pgrep", "-f", pattern],
                    capture_output=True,
                    text=True
                )
                if result.returncode == 0:
                    pids = result.stdout.strip().split('\n')
                    for pid in pids:
                        if pid.strip() and pid.strip() not in seen_pids:
                            seen_pids.add(pid.strip())
                            # Get the full command for this process
                            cmd_result = subprocess.run(
                                ["ps", "-p", pid.strip(), "-o", "command="],
                                capture_output=True,
                                text=True
                            )
                            if cmd_result.returncode == 0:
                                command = cmd_result.stdout.strip()
                                # Extract port from command if possible
                                port = self._extract_port_from_command(command)
                                if not port:
                                    # Try to get port from config
                                    config = self.load_current_config()
                                    backend_url = config["frontend"].get("NEXT_PUBLIC_BACKEND_URL", "")
                                    if backend_url:
                                        port = backend_url.split(":")[-1]
                                
                                backend_instances.append({
                                    "pid": pid.strip(),
                                    "port": port,
                                    "command": command,
                                    "pattern": pattern
                                })
            
            # Check frontend process
            frontend_patterns = [
                "next.*dev",                # next dev
                "npm.*run.*dev",           # npm run dev
                "yarn.*dev",               # yarn dev
                "node.*next"               # node next dev
            ]
            
            frontend_instances = []
            seen_pids = set()  # Track PIDs to avoid duplicates
            
            for pattern in frontend_patterns:
                result = subprocess.run(
                    ["pgrep", "-f", pattern],
                    capture_output=True,
                    text=True
                )
                if result.returncode == 0:
                    pids = result.stdout.strip().split('\n')
                    for pid in pids:
                        if pid.strip() and pid.strip() not in seen_pids:
                            seen_pids.add(pid.strip())
                            # Get the full command for this process
                            cmd_result = subprocess.run(
                                ["ps", "-p", pid.strip(), "-o", "command="],
                                capture_output=True,
                                text=True
                            )
                            if cmd_result.returncode == 0:
                                command = cmd_result.stdout.strip()
                                # Extract port from command if possible
                                port = self._extract_port_from_command(command)
                                if not port:
                                    # Try to get port from config
                                    config = self.load_current_config()
                                    frontend_url = config["frontend"].get("NEXT_PUBLIC_FRONTEND_URL", "")
                                    if frontend_url:
                                        port = frontend_url.split(":")[-1]
                                
                                frontend_instances.append({
                                    "pid": pid.strip(),
                                    "port": port,
                                    "command": command,
                                    "pattern": pattern
                                })
            
            # Update status with all instances
            status["backend"]["instances"] = backend_instances
            status["backend"]["running"] = len(backend_instances) > 0
            status["frontend"]["instances"] = frontend_instances
            status["frontend"]["running"] = len(frontend_instances) > 0
                    
        except Exception as e:
            print(f"Error checking service status: {e}")
            
        return status
    
    def _extract_port_from_command(self, command: str) -> Optional[str]:
        """Extract port number from a command string."""
        import re
        
        # Look for --port 4700 or -p 4700 patterns (most specific first)
        port_patterns = [
            r'--port\s+(\d+)',           # --port 4700
            r'-p\s+(\d+)',               # -p 4700
            r'0\.0\.0\.0:(\d+)',         # 0.0.0.0:4700
            r'localhost:(\d+)',         # localhost:4700
            r'127\.0\.0\.1:(\d+)',       # 127.0.0.1:4700
            r'--host\s+\S+:\d+.*?(\d+)', # --host 0.0.0.0:4700 (but this is rare)
        ]
        
        for pattern in port_patterns:
            match = re.search(pattern, command)
            if match:
                port = match.group(1)
                # Validate that it's a reasonable port number
                try:
                    port_num = int(port)
                    if 1 <= port_num <= 65535:
                        return port
                except ValueError:
                    continue
        
        return None
    
    def get_system_info(self) -> Dict[str, Any]:
        """Get comprehensive system information."""
        info = {
            "hostname": socket.gethostname(),
            "platform": platform.platform(),
            "python_version": platform.python_version(),
            "ip_addresses": self._get_ip_addresses(),
            "network_interfaces": self._get_network_interfaces(),
            "hosts_file": self._get_hosts_file_info(),
            "firewall_status": self._get_firewall_status()
        }
        return info
    
    def _get_ip_addresses(self) -> Dict[str, List[str]]:
        """Get all IP addresses of the system."""
        addresses = {
            "localhost": ["127.0.0.1", "::1"],
            "external": [],
            "internal": []
        }
        
        try:
            # Get external IP
            try:
                response = requests.get("https://api.ipify.org", timeout=5)
                if response.status_code == 200:
                    addresses["external"].append(response.text.strip())
            except:
                pass
            
            # Get internal IPs
            for interface in netifaces.interfaces():
                addrs = netifaces.ifaddresses(interface)
                if netifaces.AF_INET in addrs:
                    for addr in addrs[netifaces.AF_INET]:
                        ip = addr['addr']
                        if not ip.startswith('127.'):
                            addresses["internal"].append(ip)
        except Exception as e:
            print(f"Error getting IP addresses: {e}")
        
        return addresses
    
    def _get_network_interfaces(self) -> List[Dict[str, Any]]:
        """Get network interface information."""
        interfaces = []
        
        try:
            for interface in netifaces.interfaces():
                interface_info = {
                    "name": interface,
                    "addresses": {}
                }
                
                addrs = netifaces.ifaddresses(interface)
                for addr_type, addr_list in addrs.items():
                    interface_info["addresses"][addr_type] = addr_list
                
                interfaces.append(interface_info)
        except Exception as e:
            print(f"Error getting network interfaces: {e}")
        
        return interfaces
    
    def _get_hosts_file_info(self) -> Dict[str, Any]:
        """Get information about hosts file."""
        hosts_info = {
            "exists": False,
            "path": None,
            "entries": []
        }
        
        hosts_paths = [
            "/etc/hosts",
            "C:\\Windows\\System32\\drivers\\etc\\hosts"
        ]
        
        for path in hosts_paths:
            if os.path.exists(path):
                hosts_info["exists"] = True
                hosts_info["path"] = path
                try:
                    with open(path, 'r') as f:
                        hosts_info["entries"] = f.readlines()[:10]  # First 10 lines
                except:
                    pass
                break
        
        return hosts_info
    
    def _get_firewall_status(self) -> Dict[str, Any]:
        """Get firewall status information."""
        firewall_info = {
            "status": "unknown",
            "rules": []
        }
        
        try:
            # Check macOS firewall
            if platform.system() == "Darwin":
                result = subprocess.run(
                    ["/usr/libexec/ApplicationFirewall/socketfilterfw", "--getglobalstate"],
                    capture_output=True,
                    text=True
                )
                if result.returncode == 0:
                    firewall_info["status"] = result.stdout.strip()
            
            # Check Linux iptables
            elif platform.system() == "Linux":
                result = subprocess.run(
                    ["iptables", "-L", "-n"],
                    capture_output=True,
                    text=True
                )
                if result.returncode == 0:
                    firewall_info["rules"] = result.stdout.split('\n')[:20]  # First 20 lines
                    firewall_info["status"] = "active" if firewall_info["rules"] else "inactive"
        except Exception as e:
            firewall_info["status"] = f"error: {str(e)}"
        
        return firewall_info
    
    def test_frontend_backend_communication(self) -> Dict[str, Any]:
        """Test communication between frontend and backend."""
        results = {
            "backend_accessible": False,
            "frontend_accessible": False,
            "cors_configuration": False,
            "websocket_connection": False,
            "database_connection": False,
            "redis_connection": False,
            "api_endpoints": {},
            "errors": []
        }
        
        try:
            config = self.load_current_config()
            
            # Test backend accessibility
            backend_url = config["frontend"].get("NEXT_PUBLIC_BACKEND_URL", "http://localhost:4700")
            try:
                response = requests.get(f"{backend_url}/health", timeout=5)
                results["backend_accessible"] = response.status_code == 200
                results["api_endpoints"]["health"] = {
                    "status_code": response.status_code,
                    "response_time": response.elapsed.total_seconds()
                }
            except Exception as e:
                results["errors"].append(f"Backend health check failed: {str(e)}")
            
            # Test frontend accessibility
            frontend_url = config["frontend"].get("NEXT_PUBLIC_FRONTEND_URL", "http://localhost:4800")
            try:
                response = requests.get(frontend_url, timeout=5)
                results["frontend_accessible"] = response.status_code == 200
            except Exception as e:
                results["errors"].append(f"Frontend accessibility check failed: {str(e)}")
            
            # Test CORS configuration
            try:
                headers = {
                    "Origin": frontend_url,
                    "Access-Control-Request-Method": "GET",
                    "Access-Control-Request-Headers": "Content-Type"
                }
                response = requests.options(f"{backend_url}/api/v1/", headers=headers, timeout=5)
                results["cors_configuration"] = "Access-Control-Allow-Origin" in response.headers
            except Exception as e:
                results["errors"].append(f"CORS test failed: {str(e)}")
            
            # Test WebSocket connection
            ws_url = config["frontend"].get("NEXT_PUBLIC_WS_URL", "ws://localhost:4700")
            try:
                # Simple WebSocket test (this is a basic test)
                import websocket
                ws = websocket.create_connection(ws_url, timeout=5)
                ws.close()
                results["websocket_connection"] = True
            except Exception as e:
                results["errors"].append(f"WebSocket test failed: {str(e)}")
            
            # Test database connection
            try:
                db_success, db_message = self.test_database_connection()
                results["database_connection"] = db_success
                if not db_success:
                    results["errors"].append(f"Database connection failed: {db_message}")
            except Exception as e:
                results["errors"].append(f"Database test failed: {str(e)}")
            
            # Test Redis connection
            try:
                redis_url = config["backend"].get("REDIS_URL", "redis://localhost:6379")
                redis_success, redis_message = self.test_redis_connection(redis_url)
                results["redis_connection"] = redis_success
                if not redis_success:
                    results["errors"].append(f"Redis connection failed: {redis_message}")
            except Exception as e:
                results["errors"].append(f"Redis test failed: {str(e)}")
                
        except Exception as e:
            results["errors"].append(f"Communication test failed: {str(e)}")
        
        return results
    
    def check_configuration_consistency(self) -> Dict[str, Any]:
        """Check consistency between frontend and backend configurations."""
        consistency = {
            "backend_frontend_urls": False,
            "port_consistency": False,
            "environment_consistency": False,
            "database_config": False,
            "redis_config": False,
            "issues": [],
            "recommendations": []
        }
        
        try:
            config = self.load_current_config()
            
            # Check backend-frontend URL consistency
            backend_url = config["frontend"].get("NEXT_PUBLIC_BACKEND_URL", "")
            frontend_url = config["frontend"].get("NEXT_PUBLIC_FRONTEND_URL", "")
            
            if backend_url and frontend_url:
                backend_port = backend_url.split(":")[-1] if ":" in backend_url else "80"
                frontend_port = frontend_url.split(":")[-1] if ":" in frontend_url else "80"
                
                consistency["backend_frontend_urls"] = True
                consistency["port_consistency"] = backend_port != frontend_port
                
                if backend_port == frontend_port:
                    consistency["issues"].append("Backend and frontend are configured to use the same port")
                    consistency["recommendations"].append("Use different ports for backend and frontend")
            
            # Check environment consistency
            backend_env = config["backend"].get("ENVIRONMENT", "development")
            consistency["environment_consistency"] = backend_env in ["development", "production", "testing"]
            
            if backend_env not in ["development", "production", "testing"]:
                consistency["issues"].append(f"Unknown environment: {backend_env}")
                consistency["recommendations"].append("Use 'development', 'production', or 'testing'")
            
            # Check database configuration
            db_url = config["backend"].get("DATABASE_URL", "")
            if db_url and "postgresql" in db_url:
                consistency["database_config"] = True
            else:
                consistency["issues"].append("Database URL not properly configured")
                consistency["recommendations"].append("Set DATABASE_URL with PostgreSQL connection string")
            
            # Check Redis configuration
            redis_url = config["backend"].get("REDIS_URL", "")
            if redis_url and "redis://" in redis_url:
                consistency["redis_config"] = True
            else:
                consistency["issues"].append("Redis URL not properly configured")
                consistency["recommendations"].append("Set REDIS_URL with Redis connection string")
                
        except Exception as e:
            consistency["issues"].append(f"Configuration check failed: {str(e)}")
        
        return consistency
    
    def get_detailed_diagnostics(self) -> Dict[str, Any]:
        """Get comprehensive diagnostic information."""
        diagnostics = {
            "timestamp": json.dumps({"timestamp": subprocess.run(["date"], capture_output=True, text=True).stdout.strip()}),
            "system_info": self.get_system_info(),
            "service_status": self.get_service_status(),
            "configuration": self.load_current_config(),
            "communication_test": self.test_frontend_backend_communication(),
            "consistency_check": self.check_configuration_consistency(),
            "network_connectivity": self._test_network_connectivity()
        }
        
        return diagnostics
    
    def _test_network_connectivity(self) -> Dict[str, Any]:
        """Test network connectivity to various services."""
        connectivity = {
            "internet": False,
            "dns_resolution": False,
            "external_services": {}
        }
        
        try:
            # Test internet connectivity
            try:
                response = requests.get("https://www.google.com", timeout=5)
                connectivity["internet"] = response.status_code == 200
            except:
                pass
            
            # Test DNS resolution
            try:
                socket.gethostbyname("google.com")
                connectivity["dns_resolution"] = True
            except:
                pass
            
            # Test external services
            services = {
                "github": "https://api.github.com",
                "npm": "https://registry.npmjs.org",
                "pypi": "https://pypi.org"
            }
            
            for service, url in services.items():
                try:
                    response = requests.get(url, timeout=5)
                    connectivity["external_services"][service] = response.status_code == 200
                except:
                    connectivity["external_services"][service] = False
                    
        except Exception as e:
            connectivity["error"] = str(e)
        
        return connectivity


def main():
    """Test the SettingsManager functionality."""
    manager = SettingsManager()
    
    print("Current Configuration:")
    config = manager.load_current_config()
    print(json.dumps(config, indent=2))
    
    print("\nService Status:")
    status = manager.get_service_status()
    print(json.dumps(status, indent=2))


if __name__ == "__main__":
    main()
