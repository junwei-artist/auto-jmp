from pydantic_settings import BaseSettings
from typing import List, Optional
import os

class Settings(BaseSettings):
    # API Configuration
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "Data Analysis Platform"
    
    # Server Configuration
    BACKEND_PORT: int = int(os.getenv("BACKEND_PORT", "4700"))
    
    # Security
    SECRET_KEY: str = os.getenv("SECRET_KEY", "your-secret-key-change-in-production")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    
    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql+asyncpg://data_user:data_userpassword@localhost/data_analysis")
    
    # Redis
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379")
    
    # Celery
    CELERY_BROKER_URL: str = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0")
    CELERY_RESULT_BACKEND: str = os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6379/0")
    
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
    
    # File Upload
    MAX_FILE_SIZE: int = 100 * 1024 * 1024  # 100MB
    MAX_ATTACHMENT_SIZE: int = 200 * 1024 * 1024  # 200MB for project attachments
    ALLOWED_FILE_TYPES: List[str] = ["text/csv", "text/plain", "application/octet-stream", "application/x-javascript", "text/x-jmp-script"]
    ALLOWED_ATTACHMENT_TYPES: List[str] = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "text/plain", "text/csv", "image/jpeg", "image/png", "image/gif", "application/zip", "application/x-zip-compressed", "application/x-rar-compressed", "application/octet-stream"]
    
    # Guest Access
    ALLOW_GUEST_ACCESS: bool = True
    GUEST_RATE_LIMIT: int = 10  # requests per hour
    GUEST_MAX_FILE_SIZE: int = 10 * 1024 * 1024  # 10MB
    
    # JMP Configuration
    JMP_TASK_DIR: str = os.getenv("JMP_TASK_DIR", "/tmp/jmp_tasks")
    JMP_MAX_WAIT_TIME: int = 300  # 5 minutes
    JMP_START_DELAY: int = 4  # seconds
    
    # WebSocket
    WS_HEARTBEAT_INTERVAL: int = 30  # seconds
    
    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()
