from fastapi import APIRouter
from app.api.v1.endpoints import auth, projects, runs, uploads, admin, setup, server, profile, members, organization, roles, artifacts, attachments, oauth, community, drawings, powerpoint, workspaces

api_router = APIRouter()

# Include all endpoint routers
api_router.include_router(auth.router, prefix="/auth", tags=["authentication"])
api_router.include_router(profile.router, prefix="/profile", tags=["profile"])
api_router.include_router(projects.router, prefix="/projects", tags=["projects"])
api_router.include_router(attachments.router, prefix="/projects", tags=["attachments"])
api_router.include_router(drawings.router, prefix="/projects", tags=["drawings"])
api_router.include_router(runs.router, prefix="/runs", tags=["runs"])
api_router.include_router(uploads.router, prefix="/uploads", tags=["uploads"])
api_router.include_router(admin.router, prefix="/admin", tags=["admin"])
api_router.include_router(setup.router, prefix="/setup", tags=["setup"])
api_router.include_router(server.router, prefix="/server", tags=["server"])
api_router.include_router(members.router, prefix="/members", tags=["members"])
api_router.include_router(organization.router, prefix="/organization", tags=["organization"])
api_router.include_router(roles.router, prefix="/roles", tags=["roles"])
api_router.include_router(artifacts.router, prefix="/artifacts", tags=["artifacts"])
api_router.include_router(oauth.router, prefix="/oauth", tags=["oauth2"])
api_router.include_router(community.router, prefix="/community", tags=["community"])
api_router.include_router(powerpoint.router, prefix="/powerpoint", tags=["powerpoint"])
api_router.include_router(workspaces.router, prefix="", tags=["workspaces"])
