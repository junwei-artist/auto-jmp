from pydantic_settings import BaseSettings
from pydantic import field_validator
from typing import List, Optional, Union
import os
import json

class Settings(BaseSettings):
    # API Configuration
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "Data Analysis Platform"
    
    # Server Configuration
    BACKEND_PORT: int = int(os.getenv("BACKEND_PORT", "4700"))
    
    # Security
    SECRET_KEY: str = os.getenv("SECRET_KEY", "your-secret-key-change-in-production")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 hours
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    
    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql+asyncpg://data_user:data_userpassword@localhost/data_analysis")
    
    # Redis
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:4378")
    
    # Celery
    CELERY_BROKER_URL: str = os.getenv("CELERY_BROKER_URL", "redis://localhost:4378/0")
    CELERY_RESULT_BACKEND: str = os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:4378/0")
    
    # Object Storage (S3/MinIO)
    AWS_ACCESS_KEY_ID: str = os.getenv("AWS_ACCESS_KEY_ID", "")
    AWS_SECRET_ACCESS_KEY: str = os.getenv("AWS_SECRET_ACCESS_KEY", "")
    AWS_REGION: str = os.getenv("AWS_REGION", "us-east-1")
    S3_BUCKET: str = os.getenv("S3_BUCKET", "data-analysis-platform")
    S3_ENDPOINT_URL: Optional[str] = os.getenv("S3_ENDPOINT_URL", "http://localhost:4901")  # For MinIO
    
    # Email
    SMTP_TLS: bool = True
    SMTP_PORT: Optional[int] = None
    SMTP_HOST: Optional[str] = None
    SMTP_USER: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    EMAILS_FROM_EMAIL: Optional[str] = None
    EMAILS_FROM_NAME: Optional[str] = None
    
    # CORS - Allow specific origins for network access
    BACKEND_CORS_ORIGINS: List[str] = [
        "http://10.5.216.11",
        "http://10.5.216.11:4800",
        "http://localhost:4800",
        "http://localhost:4801",
        "http://127.0.0.1:4800",
        "http://localhost:3000",
        "http://localhost:3001",
    ]
    
    @field_validator('BACKEND_CORS_ORIGINS', mode='before')
    @classmethod
    def parse_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        """Parse CORS origins from string (JSON) or return as list."""
        if isinstance(v, str):
            try:
                # Try parsing as JSON array
                parsed = json.loads(v)
                if isinstance(parsed, list):
                    return parsed
                elif isinstance(parsed, str):
                    # If it's a single string, split by comma
                    return [origin.strip() for origin in parsed.split(',') if origin.strip()]
            except (json.JSONDecodeError, ValueError):
                # If JSON parsing fails, try splitting by comma
                return [origin.strip() for origin in v.split(',') if origin.strip()]
        return v if isinstance(v, list) else list(v) if v else []
    
    # File Upload
    MAX_FILE_SIZE: int = 100 * 1024 * 1024  # 100MB
    MAX_ATTACHMENT_SIZE: int = 200 * 1024 * 1024  # 200MB for project attachments
    ALLOWED_FILE_TYPES: List[str] = ["text/csv", "text/plain", "application/octet-stream", "application/x-javascript", "text/x-jmp-script"]
    ALLOWED_ATTACHMENT_TYPES: List[str] = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "text/plain", "text/csv", "image/jpeg", "image/png", "image/gif", "application/zip", "application/x-zip-compressed", "application/x-rar-compressed", "application/octet-stream"]
    
    # Guest Access
    ALLOW_GUEST_ACCESS: bool = True
    GUEST_RATE_LIMIT: int = 10  # requests per hour
    GUEST_MAX_FILE_SIZE: int = 10 * 1024 * 1024  # 10MB
    
    # Public Media Access
    ALLOW_PUBLIC_MEDIA_ACCESS: bool = os.getenv("ALLOW_PUBLIC_MEDIA_ACCESS", "false").lower() == "true"  # Allow direct access to images/attachments without auth
    
    # File Storage Configuration
    UPLOADS_DIR: str = os.getenv("UPLOADS_DIR", "/Users/lytech/Documents/service/auto-jmp/backend/uploads")  # Hardcoded uploads directory path
    
    # JMP Configuration
    JMP_TASK_DIR: str = os.getenv("JMP_TASK_DIR", "/tmp/jmp_tasks")
    TASKS_DIRECTORY: str = os.getenv("TASKS_DIRECTORY", "/Users/lytech/Documents/service/auto-jmp/backend/tasks")  # Hardcoded tasks directory path
    JMP_MAX_WAIT_TIME: int = 300  # 5 minutes
    JMP_START_DELAY: int = 4  # seconds
    
    # WebSocket
    WS_HEARTBEAT_INTERVAL: int = 30  # seconds
    
    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()

async def get_jmp_max_wait_time(db_session=None) -> int:
    """
    Get JMP_MAX_WAIT_TIME from database setting, with fallback to config/env.
    
    Args:
        db_session: Optional database session. If provided, will query database.
                   If None, will return config value.
    
    Returns:
        Timeout in seconds
    """
    import logging
    logger = logging.getLogger(__name__)
    
    # If no database session provided, return config value
    if db_session is None:
        env_value = os.getenv("JMP_MAX_WAIT_TIME")
        if env_value:
            timeout = int(env_value)
            logger.info(f"[CONFIG] Using timeout from environment variable: {timeout}s")
            return timeout
        timeout = settings.JMP_MAX_WAIT_TIME
        logger.info(f"[CONFIG] Using timeout from config default: {timeout}s")
        return timeout
    
    # Try to get from database
    try:
        from sqlalchemy import select
        from app.models import AppSetting
        
        result = await db_session.execute(
            select(AppSetting).where(AppSetting.k == "jmp_max_wait_time")
        )
        setting = result.scalar_one_or_none()
        
        if setting:
            try:
                timeout = int(json.loads(setting.v))
                logger.info(f"[CONFIG] Using timeout from database setting: {timeout}s")
                return timeout
            except (json.JSONDecodeError, ValueError) as e:
                logger.warning(f"[CONFIG] Failed to parse database timeout setting: {e}, falling back to config")
        else:
            logger.info("[CONFIG] No timeout setting found in database, using config default")
    except Exception as e:
        # If database query fails, fall back to config
        logger.warning(f"[CONFIG] Failed to query database for timeout setting: {e}, falling back to config")
    
    # Fallback to environment variable or config default
    env_value = os.getenv("JMP_MAX_WAIT_TIME")
    if env_value:
        timeout = int(env_value)
        logger.info(f"[CONFIG] Using timeout from environment variable (fallback): {timeout}s")
        return timeout
    timeout = settings.JMP_MAX_WAIT_TIME
    logger.info(f"[CONFIG] Using timeout from config default (fallback): {timeout}s")
    return timeout
