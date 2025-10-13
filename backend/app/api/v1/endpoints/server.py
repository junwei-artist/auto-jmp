from fastapi import APIRouter

router = APIRouter()

@router.get("/server-info")
async def get_server_info():
    """Get server information including public IP."""
    return {
        "host": "localhost:4700",
        "public_url": None
    }
