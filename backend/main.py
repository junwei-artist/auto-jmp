from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.security import HTTPBearer
from contextlib import asynccontextmanager
import uvicorn
import os
from dotenv import load_dotenv

from app.core.config import settings
from app.core.database import engine, Base
from app.api.v1.api import api_router
from app.core.websocket import router as websocket_router
from app.core.exceptions import setup_exception_handlers
from app.core.extensions import ExtensionManager
from extensions.excel2boxplotv1.api import router as excel2boxplotv1_router
from extensions.excel2boxplotv2.api import router as excel2boxplotv2_router
from extensions.excel2processcapability.api import router as excel2processcapability_router

# Load environment variables
load_dotenv()

# Create database tables
async def create_tables():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

# Initialize extension manager
extension_manager = ExtensionManager()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await create_tables()
    
    # Load all extensions
    loaded_extensions = extension_manager.load_all_extensions()
    print(f"Loaded {len(loaded_extensions)} extensions: {loaded_extensions}")
    
    yield
    # Shutdown
    pass

# Create FastAPI app
app = FastAPI(
    title="Data Analysis Platform",
    description="JMP Boxplot Analysis Platform with Real-time Processing",
    version="1.0.0",
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan
)

# Security
security = HTTPBearer()

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Trusted host middleware - temporarily disabled for testing
# if settings.BACKEND_CORS_ORIGINS:
#     app.add_middleware(
#         TrustedHostMiddleware,
#         allowed_hosts=settings.BACKEND_CORS_ORIGINS
#     )

# Setup exception handlers
setup_exception_handlers(app)

# Include API router
app.include_router(api_router, prefix=settings.API_V1_STR)

# Include extension API routers
app.include_router(excel2boxplotv1_router, prefix=f"{settings.API_V1_STR}/extensions")
app.include_router(excel2boxplotv2_router, prefix=f"{settings.API_V1_STR}/extensions")
app.include_router(excel2processcapability_router, prefix=f"{settings.API_V1_STR}/extensions")

# Include WebSocket router
app.include_router(websocket_router)

@app.get("/")
async def root():
    return {"message": "Data Analysis Platform API", "version": "1.0.0"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=4700,
        reload=True,
        log_level="info"
    )
