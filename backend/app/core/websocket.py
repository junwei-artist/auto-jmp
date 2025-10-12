from fastapi import APIRouter, Depends, HTTPException, status, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Dict, List
import json
import redis.asyncio as redis
import asyncio
from datetime import datetime

from app.core.database import get_db
from app.core.auth import get_current_user_optional
from app.core.config import settings
from app.models import Run, RunStatus, AppUser

router = APIRouter()

# Redis connection for pub/sub
redis_client = None

async def get_redis():
    """Get Redis client."""
    global redis_client
    if redis_client is None:
        redis_client = redis.from_url(settings.REDIS_URL)
    return redis_client

class ConnectionManager:
    """Manages WebSocket connections."""
    
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}
    
    async def connect(self, websocket: WebSocket, run_id: str):
        """Connect a WebSocket to a run room."""
        await websocket.accept()
        if run_id not in self.active_connections:
            self.active_connections[run_id] = []
        self.active_connections[run_id].append(websocket)
        print(f"Client connected to run room: {run_id}")
    
    def disconnect(self, websocket: WebSocket, run_id: str):
        """Disconnect a WebSocket from a run room."""
        if run_id in self.active_connections:
            self.active_connections[run_id].remove(websocket)
            if not self.active_connections[run_id]:
                del self.active_connections[run_id]
        print(f"Client disconnected from run room: {run_id}")
    
    async def send_to_run(self, run_id: str, message: dict):
        """Send message to all connections in a run room."""
        if run_id in self.active_connections:
            for connection in self.active_connections[run_id]:
                try:
                    await connection.send_text(json.dumps(message))
                except:
                    # Remove broken connections
                    self.active_connections[run_id].remove(connection)

manager = ConnectionManager()

async def publish_run_update(run_id: str, message: dict):
    """Publish run update to WebSocket room."""
    await manager.send_to_run(run_id, message)
    print(f"Published update to run:{run_id}: {message}")

async def subscribe_to_run_updates(run_id: str):
    """Subscribe to run updates from Redis and forward to WebSocket."""
    redis_client = await get_redis()
    pubsub = redis_client.pubsub()
    await pubsub.subscribe(f"run:{run_id}")
    
    async for message in pubsub.listen():
        if message["type"] == "message":
            try:
                data = json.loads(message["data"])
                await manager.send_to_run(run_id, data)
            except json.JSONDecodeError:
                continue

@router.websocket("/ws/runs/{run_id}")
async def websocket_endpoint(websocket: WebSocket, run_id: str):
    """WebSocket endpoint for real-time run updates."""
    await manager.connect(websocket, run_id)
    
    try:
        # Keep connection alive and listen for messages
        while True:
            try:
                # Wait for any message from client (ping/pong)
                data = await websocket.receive_text()
                # Echo back or handle client messages
                await websocket.send_text(json.dumps({"type": "pong", "data": data}))
            except WebSocketDisconnect:
                break
            except Exception as e:
                print(f"WebSocket error: {e}")
                break
    finally:
        manager.disconnect(websocket, run_id)

@router.get("/runs/{run_id}/status")
async def get_run_status(
    run_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user_optional)
):
    """Get the current status of a run."""
    result = await db.execute(select(Run).where(Run.id == run_id))
    run = result.scalar_one_or_none()
    
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    
    # Check permissions (user must be project member or guest access allowed)
    # This is simplified - you'd want to implement proper project access checks
    
    return {
        "id": str(run.id),
        "status": run.status.value,
        "message": run.message,
        "image_count": run.image_count,
        "created_at": run.created_at.isoformat() if run.created_at else None,
        "started_at": run.started_at.isoformat() if run.started_at else None,
        "finished_at": run.finished_at.isoformat() if run.finished_at else None,
    }

@router.post("/runs/{run_id}/cancel")
async def cancel_run(
    run_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user_optional)
):
    """Cancel a running task."""
    result = await db.execute(select(Run).where(Run.id == run_id))
    run = result.scalar_one_or_none()
    
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    
    if run.status in [RunStatus.SUCCEEDED, RunStatus.FAILED, RunStatus.CANCELED]:
        raise HTTPException(status_code=400, detail="Run is already finished")
    
    # Update run status
    run.status = RunStatus.CANCELED
    run.finished_at = datetime.utcnow()
    run.message = "Canceled by user"
    await db.commit()
    
    # Publish cancellation event
    await publish_run_update(run_id, {
        "type": "run_canceled",
        "run_id": run_id,
        "status": "canceled",
        "message": "Run canceled by user"
    })
    
    return {"message": "Run canceled successfully"}
