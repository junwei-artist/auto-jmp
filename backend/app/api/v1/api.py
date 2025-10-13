from fastapi import APIRouter
from app.api.v1.endpoints import auth, projects, runs, uploads, admin, setup, server, profile

api_router = APIRouter()

# Include all endpoint routers
api_router.include_router(auth.router, prefix="/auth", tags=["authentication"])
api_router.include_router(profile.router, prefix="/profile", tags=["profile"])
api_router.include_router(projects.router, prefix="/projects", tags=["projects"])
api_router.include_router(runs.router, prefix="/runs", tags=["runs"])
api_router.include_router(uploads.router, prefix="/uploads", tags=["uploads"])
api_router.include_router(admin.router, prefix="/admin", tags=["admin"])
api_router.include_router(setup.router, prefix="/setup", tags=["setup"])
api_router.include_router(server.router, prefix="/server", tags=["server"])
