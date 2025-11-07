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
        self.general_connections: List[WebSocket] = []
        self.subscriptions: Dict[str, List[WebSocket]] = {}  # run_id -> list of websockets
        self.redis_subscriptions: Dict[str, asyncio.Task] = {}  # run_id -> Redis subscription task
    
    async def connect(self, websocket: WebSocket, run_id: str):
        """Connect a WebSocket to a run room."""
        await websocket.accept()
        if run_id not in self.active_connections:
            self.active_connections[run_id] = []
        self.active_connections[run_id].append(websocket)
        print(f"Client connected to run room: {run_id}")
    
    async def connect_general(self, websocket: WebSocket):
        """Connect a WebSocket to general connection pool."""
        await websocket.accept()
        self.general_connections.append(websocket)
        print("Client connected to general WebSocket")
    
    def disconnect(self, websocket: WebSocket, run_id: str):
        """Disconnect a WebSocket from a run room."""
        if run_id in self.active_connections:
            self.active_connections[run_id].remove(websocket)
            if not self.active_connections[run_id]:
                del self.active_connections[run_id]
        print(f"Client disconnected from run room: {run_id}")
    
    def disconnect_general(self, websocket: WebSocket):
        """Disconnect a WebSocket from general connection pool."""
        if websocket in self.general_connections:
            self.general_connections.remove(websocket)
        # Also remove from all subscriptions
        for run_id, connections in self.subscriptions.items():
            if websocket in connections:
                connections.remove(websocket)
        print("Client disconnected from general WebSocket")
    
    async def send_to_run(self, run_id: str, message: dict):
        """Send message to all connections in a run room."""
        if run_id in self.active_connections:
            for connection in self.active_connections[run_id]:
                try:
                    await connection.send_text(json.dumps(message))
                except:
                    # Remove broken connections
                    self.active_connections[run_id].remove(connection)
    
    async def send_to_subscribers(self, run_id: str, message: dict):
        """Send message to all subscribers of a specific run."""
        if run_id in self.subscriptions:
            for connection in self.subscriptions[run_id].copy():
                try:
                    await connection.send_text(json.dumps(message))
                except:
                    # Remove broken connections
                    self.subscriptions[run_id].remove(connection)
    
    async def handle_subscription(self, websocket: WebSocket, message: dict):
        """Handle subscription/unsubscription messages."""
        if message.get("type") == "subscribe" and "run_id" in message:
            run_id = message["run_id"]
            if run_id not in self.subscriptions:
                self.subscriptions[run_id] = []
            if websocket not in self.subscriptions[run_id]:
                self.subscriptions[run_id].append(websocket)
            print(f"WebSocket subscribed to run: {run_id}")
            
            # Start Redis subscription if not already started
            if run_id not in self.redis_subscriptions:
                task = asyncio.create_task(self._subscribe_to_redis(run_id))
                self.redis_subscriptions[run_id] = task
            
        elif message.get("type") == "unsubscribe" and "run_id" in message:
            run_id = message["run_id"]
            if run_id in self.subscriptions and websocket in self.subscriptions[run_id]:
                self.subscriptions[run_id].remove(websocket)
            print(f"WebSocket unsubscribed from run: {run_id}")
            
            # Clean up Redis subscription if no more subscribers
            if run_id in self.subscriptions and not self.subscriptions[run_id]:
                if run_id in self.redis_subscriptions:
                    self.redis_subscriptions[run_id].cancel()
                    del self.redis_subscriptions[run_id]
    
    async def _subscribe_to_redis(self, run_id: str):
        """Subscribe to Redis updates for a run and forward to WebSocket subscribers."""
        pubsub = None
        try:
            redis_client = await get_redis()
            pubsub = redis_client.pubsub()
            await pubsub.subscribe(f"run:{run_id}")
            print(f"Subscribed to Redis channel: run:{run_id}")
            
            async for message in pubsub.listen():
                if message["type"] == "message":
                    try:
                        data = json.loads(message["data"])
                        # Forward to all subscribers
                        await self.send_to_subscribers(run_id, data)
                    except json.JSONDecodeError:
                        continue
                    except asyncio.CancelledError:
                        break
                elif message["type"] == "subscribe":
                    print(f"Redis subscription confirmed for run:{run_id}")
        except asyncio.CancelledError:
            print(f"Redis subscription cancelled for run: {run_id}")
        except Exception as e:
            print(f"Error in Redis subscription for run {run_id}: {e}")
        finally:
            if pubsub:
                try:
                    await pubsub.unsubscribe(f"run:{run_id}")
                    await pubsub.close()
                except Exception as e:
                    print(f"Error closing Redis pubsub for run {run_id}: {e}")

manager = ConnectionManager()

async def publish_run_update(run_id: str, message: dict):
    """Publish run update to WebSocket room and Redis pub/sub."""
    # Send to direct WebSocket connections
    await manager.send_to_run(run_id, message)
    await manager.send_to_subscribers(run_id, message)
    
    # Also publish to Redis for real-time transient updates
    try:
        redis_client = await get_redis()
        await redis_client.publish(f"run:{run_id}", json.dumps(message))
        print(f"Published update to Redis run:{run_id}: {message}")
    except Exception as e:
        print(f"Failed to publish to Redis: {e}")
    
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

@router.websocket("/ws/general")
async def general_websocket_endpoint(websocket: WebSocket):
    """General WebSocket endpoint for real-time updates."""
    await manager.connect_general(websocket)
    
    try:
        # Keep connection alive and listen for messages
        while True:
            try:
                # Wait for any message from client
                data = await websocket.receive_text()
                
                try:
                    message = json.loads(data)
                    # Handle subscription messages
                    await manager.handle_subscription(websocket, message)
                    
                    # Echo back ping messages
                    if message.get("type") == "ping":
                        await websocket.send_text(json.dumps({"type": "pong", "data": message.get("data", "")}))
                        
                except json.JSONDecodeError:
                    # Handle non-JSON messages (like simple ping)
                    await websocket.send_text(json.dumps({"type": "pong", "data": data}))
                    
            except WebSocketDisconnect:
                break
            except Exception as e:
                print(f"WebSocket error: {e}")
                break
    finally:
        manager.disconnect_general(websocket)

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
