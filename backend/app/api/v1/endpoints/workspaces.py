from fastapi import APIRouter, Depends, HTTPException, status, Query, Body, File, UploadFile, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, delete
from sqlalchemy.orm import selectinload
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
import uuid
import json
import traceback
from datetime import datetime, timezone
import pandas as pd
import openpyxl
import io

from app.core.database import get_db
from app.core.auth import get_current_user, get_current_user_optional
from app.models import AppUser
from app.models.workspace import (
    Workspace, Workflow, WorkflowNode, WorkflowConnection,
    WorkflowExecution, WorkflowExecutionStatus, WorkflowArtifact,
    WorkflowStatus, WorkspaceMember, WorkspaceAccessLevel,
    workspace_workflow
)
from app.workspaces.engine.registry import get_registry
from app.workspaces.engine.workflow_runner import WorkflowRunner
from app.workspaces.engine.io_manager import WorkflowIOManager
from app.workspaces.engine.graph_manager import GraphManager
from app.core.storage import local_storage
from app.core.websocket import publish_workflow_update

router = APIRouter()


# Helper function to save workflow JSON
async def save_workflow_json_to_file(workflow_id: str, db: AsyncSession, checkpoint_name_updates: Optional[dict] = None):
    """Build and save workflow JSON file with all nodes, connections, and settings
    
    Args:
        workflow_id: The workflow ID
        db: Database session
        checkpoint_name_updates: Optional dict mapping node_id to checkpoint_name for updates
    """
    try:
        # Get workflow with all nodes, connections, and workspaces
        workflow_result = await db.execute(
            select(Workflow).options(
                selectinload(Workflow.nodes),
                selectinload(Workflow.connections),
                selectinload(Workflow.workspaces)
            ).where(Workflow.id == uuid.UUID(workflow_id))
        )
        workflow = workflow_result.scalar_one_or_none()
        
        if not workflow:
            return
        
        workflow_id_str = str(workflow.id)
        
        # Load existing JSON to preserve checkpoint_name values
        existing_json = None
        try:
            existing_json = local_storage.load_workflow_json(workflow_id_str)
        except Exception:
            pass
        
        # Build checkpoint_name map from existing JSON
        checkpoint_names = {}
        if existing_json and isinstance(existing_json, dict):
            nodes_list = existing_json.get('nodes', [])
            for n in nodes_list:
                node_id = n.get('id')
                if node_id:
                    checkpoint_names[node_id] = n.get('checkpoint_name')
        
        # Apply updates from checkpoint_name_updates
        if checkpoint_name_updates:
            checkpoint_names.update(checkpoint_name_updates)
        
        # Build workflow JSON structure
        # Handle datetime serialization safely
        updated_at_str = None
        try:
            if workflow.updated_at:
                updated_at_str = workflow.updated_at.isoformat()
        except Exception:
            pass
        
        # Get workspace IDs (workflow can be in multiple workspaces)
        # Handle case where workspaces might not be loaded or is None
        workspace_ids = []
        try:
            if hasattr(workflow, 'workspaces') and workflow.workspaces is not None:
                workspace_ids = [str(ws.id) for ws in workflow.workspaces]
        except Exception as e:
            # If there's an error accessing workspaces, just use empty list
            print(f"Warning: Could not access workflow.workspaces: {e}")
            workspace_ids = []
        
        workflow_data = {
            "workflow_id": workflow_id_str,
            "workspace_ids": workspace_ids,  # List of workspace IDs this workflow belongs to
            "name": workflow.name,
            "description": workflow.description if workflow.description else None,
            "status": workflow.status.value if hasattr(workflow.status, 'value') else str(workflow.status),
            "updated_at": updated_at_str,
            "nodes": [],
            "connections": []
        }
        
        # Add all nodes with their information
        for node in workflow.nodes:
            # Get node folder path (for tasks, this would be in tasks/{task_id}/nodes/{node_id})
            # For workflow-level, we store the base node path
            node_base_path = local_storage.get_workflow_path(workflow_id_str) / "nodes" / str(node.id)
            
            # Get checkpoint_name from our map (preserved from existing JSON or updated)
            checkpoint_name = checkpoint_names.get(str(node.id))
            
            node_data = {
                "id": str(node.id),
                "module_type": node.module_type,
                "module_id": node.module_id,
                "checkpoint_name": checkpoint_name,  # User note/mark for what the node is doing (JSON only)
                "position": {
                    "x": node.position_x,
                    "y": node.position_y
                },
                "config": node.config if node.config else {},
                "state": node.state if node.state else {},
                "folder_path": str(node_base_path),
                "input_path": str(node_base_path / "input"),
                "wip_path": str(node_base_path / "wip"),
                "output_path": str(node_base_path / "output")
            }
            workflow_data["nodes"].append(node_data)
        
        # Add all connections
        for connection in workflow.connections:
            connection_data = {
                "id": str(connection.id),
                "source_node_id": str(connection.source_node_id),
                "target_node_id": str(connection.target_node_id),
                "source_port": connection.source_port,
                "target_port": connection.target_port
            }
            workflow_data["connections"].append(connection_data)
        
        # Save to workflow folder
        local_storage.save_workflow_json(workflow_id_str, workflow_data)
    except Exception as e:
        # Log error but don't fail the request
        import traceback
        print(f"Error saving workflow JSON: {e}\n{traceback.format_exc()}")


# Pydantic models
class WorkspaceCreate(BaseModel):
    name: str
    description: Optional[str] = None
    is_public: bool = False


class WorkspaceUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_public: Optional[bool] = None


class WorkspaceResponse(BaseModel):
    id: str
    name: str
    description: Optional[str]
    owner_id: Optional[str]
    is_public: bool
    folder_path: Optional[str]
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class WorkflowCreate(BaseModel):
    name: str
    description: Optional[str] = None


class WorkflowUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    graph_data: Optional[dict] = None


class WorkflowResponse(BaseModel):
    id: str
    name: str
    description: Optional[str]
    status: str
    graph_data: Optional[dict]
    folder_path: Optional[str]
    created_at: datetime
    updated_at: datetime
    last_run_at: Optional[datetime]
    
    class Config:
        from_attributes = True


class NodeCreate(BaseModel):
    module_type: str
    module_id: Optional[str] = None  # Optional: will be auto-generated if not provided (module_name + UUID)
    checkpoint_name: Optional[str] = None  # User note/mark for what the node is doing
    position_x: float = 0  # Accept float, will be converted to int
    position_y: float = 0  # Accept float, will be converted to int
    config: Optional[dict] = None


class NodeUpdate(BaseModel):
    checkpoint_name: Optional[str] = None  # User note/mark for what the node is doing
    position_x: Optional[float] = None  # Accept float, will be converted to int
    position_y: Optional[float] = None  # Accept float, will be converted to int
    config: Optional[dict] = None


class NodeResponse(BaseModel):
    id: str
    workflow_id: str
    module_type: str
    module_id: str
    checkpoint_name: Optional[str] = None  # User note/mark for what the node is doing (stored in JSON)
    position_x: int
    position_y: int
    config: Optional[dict]
    state: Optional[dict]
    
    class Config:
        from_attributes = True


class ConnectionCreate(BaseModel):
    source_node_id: str
    target_node_id: str
    source_port: str
    target_port: str


class ConnectionResponse(BaseModel):
    id: str
    workflow_id: str
    source_node_id: str
    target_node_id: str
    source_port: str
    target_port: str
    
    class Config:
        from_attributes = True


# Workspace endpoints
@router.post("/workspaces", response_model=WorkspaceResponse, status_code=status.HTTP_201_CREATED)
async def create_workspace(
    workspace_data: WorkspaceCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Create a new workspace"""
    try:
        workspace = Workspace(
            name=workspace_data.name,
            description=workspace_data.description,
            owner_id=current_user.id if current_user else None,
            is_public=workspace_data.is_public
        )
        db.add(workspace)
        await db.commit()
        await db.refresh(workspace)
        
        # Create workspace folder structure and save path
        workspace_id_str = str(workspace.id)
        workspace_path = local_storage.get_workspace_path(workspace_id_str)
        workspace_path.mkdir(parents=True, exist_ok=True)
        
        # Save folder path to database (if column exists)
        try:
            workspace.folder_path = str(workspace_path)
            await db.commit()
            await db.refresh(workspace)
        except Exception as e:
            # If folder_path column doesn't exist yet (migration not run), 
            # still create the folder but don't save the path
            print(f"Warning: Could not save folder_path to database (migration may not be run): {e}")
            await db.rollback()
            # Re-commit without folder_path
            await db.commit()
            await db.refresh(workspace)
        
        # Manually construct response to ensure UUIDs are converted to strings
        # Get folder_path if it exists, otherwise use the path we just created
        folder_path_value = getattr(workspace, 'folder_path', None) or str(workspace_path)
        
        return WorkspaceResponse(
            id=str(workspace.id),
            name=workspace.name,
            description=workspace.description,
            owner_id=str(workspace.owner_id) if workspace.owner_id else None,
            is_public=workspace.is_public,
            folder_path=folder_path_value,
            created_at=workspace.created_at,
            updated_at=workspace.updated_at
        )
    except Exception as e:
        import traceback
        error_detail = f"Error creating workspace: {str(e)}\n{traceback.format_exc()}"
        print(error_detail)
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=error_detail)


@router.get("/workspaces", response_model=List[WorkspaceResponse])
async def list_workspaces(
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """List workspaces accessible to the user"""
    query = select(Workspace).where(Workspace.deleted_at.is_(None))
    
    if current_user:
        # Show user's workspaces and public workspaces
        query = query.where(
            (Workspace.owner_id == current_user.id) | (Workspace.is_public == True)
        )
    else:
        # Guest users only see public workspaces
        query = query.where(Workspace.is_public == True)
    
    result = await db.execute(query)
    workspaces = result.scalars().all()
    
    # Manually construct responses to ensure UUIDs are converted to strings
    return [
        WorkspaceResponse(
            id=str(ws.id),
            name=ws.name,
            description=ws.description,
            owner_id=str(ws.owner_id) if ws.owner_id else None,
            is_public=ws.is_public,
            folder_path=getattr(ws, 'folder_path', None) or str(local_storage.get_workspace_path(str(ws.id))),
            created_at=ws.created_at,
            updated_at=ws.updated_at
        )
        for ws in workspaces
    ]


@router.get("/workspaces/{workspace_id}", response_model=WorkspaceResponse)
async def get_workspace(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Get a workspace by ID"""
    result = await db.execute(
        select(Workspace).where(
            and_(
                Workspace.id == uuid.UUID(workspace_id),
                Workspace.deleted_at.is_(None)
            )
        )
    )
    workspace = result.scalar_one_or_none()
    
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    
    # Check access
    if not workspace.is_public and (not current_user or workspace.owner_id != current_user.id):
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Manually construct response to ensure UUIDs are converted to strings
    folder_path_value = getattr(workspace, 'folder_path', None) or str(local_storage.get_workspace_path(str(workspace.id)))
    
    return WorkspaceResponse(
        id=str(workspace.id),
        name=workspace.name,
        description=workspace.description,
        owner_id=str(workspace.owner_id) if workspace.owner_id else None,
        is_public=workspace.is_public,
        folder_path=folder_path_value,
        created_at=workspace.created_at,
        updated_at=workspace.updated_at
    )


@router.put("/workspaces/{workspace_id}", response_model=WorkspaceResponse)
async def update_workspace(
    workspace_id: str,
    workspace_data: WorkspaceUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user)
):
    """Update a workspace"""
    result = await db.execute(
        select(Workspace).where(
            and_(
                Workspace.id == uuid.UUID(workspace_id),
                Workspace.deleted_at.is_(None)
            )
        )
    )
    workspace = result.scalar_one_or_none()
    
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    
    if workspace.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only owner can update workspace")
    
    if workspace_data.name is not None:
        workspace.name = workspace_data.name
    if workspace_data.description is not None:
        workspace.description = workspace_data.description
    if workspace_data.is_public is not None:
        workspace.is_public = workspace_data.is_public
    
    await db.commit()
    await db.refresh(workspace)
    
    folder_path_value = getattr(workspace, 'folder_path', None) or str(local_storage.get_workspace_path(str(workspace.id)))
    
    return WorkspaceResponse(
        id=str(workspace.id),
        name=workspace.name,
        description=workspace.description,
        owner_id=str(workspace.owner_id) if workspace.owner_id else None,
        is_public=workspace.is_public,
        folder_path=folder_path_value,
        created_at=workspace.created_at,
        updated_at=workspace.updated_at
    )


@router.delete("/workspaces/{workspace_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workspace(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user)
):
    """Delete a workspace (soft delete)"""
    result = await db.execute(
        select(Workspace).where(
            and_(
                Workspace.id == uuid.UUID(workspace_id),
                Workspace.deleted_at.is_(None)
            )
        )
    )
    workspace = result.scalar_one_or_none()
    
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    
    if workspace.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only owner can delete workspace")
    
    workspace.deleted_at = datetime.now(timezone.utc)
    await db.commit()


# Workflow endpoints
@router.post("/workflows", response_model=WorkflowResponse, status_code=status.HTTP_201_CREATED)
async def create_workflow(
    workflow_data: WorkflowCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Create a new workflow (independent of workspaces)"""
    try:
        workflow = Workflow(
            name=workflow_data.name,
            description=workflow_data.description,
            status=WorkflowStatus.DRAFT
        )
        db.add(workflow)
        await db.commit()
        await db.refresh(workflow)
        
        # Create workflow folder structure and save path
        workflow_id_str = str(workflow.id)
        workflow_path = local_storage.get_workflow_path(workflow_id_str)
        workflow_path.mkdir(parents=True, exist_ok=True)
        
        # Save folder path to database (if column exists)
        try:
            workflow.folder_path = str(workflow_path)
            await db.commit()
            await db.refresh(workflow)
        except Exception as e:
            # If folder_path column doesn't exist yet (migration not run), 
            # still create the folder but don't save the path
            print(f"Warning: Could not save folder_path to database (migration may not be run): {e}")
            await db.rollback()
            # Re-commit without folder_path
            await db.commit()
            await db.refresh(workflow)
        
        # Create initial workflow JSON file
        # Note: We skip this for now if it fails, as it's not critical for workflow creation
        try:
            # Ensure workflow is fully committed before querying it again
            await db.commit()
            await db.refresh(workflow)
            await save_workflow_json_to_file(workflow_id_str, db)
        except Exception as e:
            # Log error but don't fail the request - JSON file can be created later
            print(f"Warning: Could not save workflow JSON file: {e}\n{traceback.format_exc()}")
        
        # Manually construct response to ensure UUIDs are converted to strings
        folder_path_value = getattr(workflow, 'folder_path', None) or str(workflow_path)
        
        # Ensure status is a string (handle enum)
        status_value = workflow.status.value if hasattr(workflow.status, 'value') else str(workflow.status)
        
        # Ensure all datetime fields are properly handled
        try:
            created_at = workflow.created_at
            updated_at = workflow.updated_at
            last_run_at = workflow.last_run_at  # Can be None
            
            response = WorkflowResponse(
                id=str(workflow.id),
                name=workflow.name,
                description=workflow.description,
                status=status_value,
                graph_data=workflow.graph_data,
                folder_path=folder_path_value,
                created_at=created_at,
                updated_at=updated_at,
                last_run_at=last_run_at
            )
            return response
        except Exception as response_error:
            # Log the response construction error with full details
            error_msg = f"Error constructing WorkflowResponse: {str(response_error)}\n{traceback.format_exc()}"
            print(error_msg)
            print(f"Workflow data: id={workflow.id}, name={workflow.name}, status={workflow.status}, graph_data={workflow.graph_data}")
            print(f"Workflow timestamps: created_at={workflow.created_at}, updated_at={workflow.updated_at}, last_run_at={workflow.last_run_at}")
            print(f"Workflow types: created_at type={type(workflow.created_at)}, updated_at type={type(workflow.updated_at)}, last_run_at type={type(workflow.last_run_at)}")
            raise HTTPException(status_code=500, detail=f"Error constructing response: {str(response_error)}")
    except HTTPException:
        raise
    except Exception as e:
        error_msg = f"Error creating workflow: {str(e)}\n{traceback.format_exc()}"
        print(error_msg)
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/workspaces/{workspace_id}/workflows/{workflow_id}", status_code=status.HTTP_201_CREATED)
async def add_workflow_to_workspace(
    workspace_id: str,
    workflow_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Add an existing workflow to a workspace"""
    # Check workspace access
    workspace_result = await db.execute(
        select(Workspace).where(
            and_(
                Workspace.id == uuid.UUID(workspace_id),
                Workspace.deleted_at.is_(None)
            )
        )
    )
    workspace = workspace_result.scalar_one_or_none()
    
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    
    if not workspace.is_public and (not current_user or workspace.owner_id != current_user.id):
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Check if workflow exists
    workflow_result = await db.execute(
        select(Workflow).where(Workflow.id == uuid.UUID(workflow_id))
    )
    workflow = workflow_result.scalar_one_or_none()
    
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    # Check if already linked
    if workflow in workspace.workflows:
        raise HTTPException(status_code=400, detail="Workflow already in workspace")
    
    # Add workflow to workspace
    workspace.workflows.append(workflow)
    await db.commit()
    
    return {"message": "Workflow added to workspace", "workspace_id": workspace_id, "workflow_id": workflow_id}


@router.delete("/workspaces/{workspace_id}/workflows/{workflow_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_workflow_from_workspace(
    workspace_id: str,
    workflow_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Remove a workflow from a workspace"""
    # Check workspace access
    workspace_result = await db.execute(
        select(Workspace).options(selectinload(Workspace.workflows)).where(
            and_(
                Workspace.id == uuid.UUID(workspace_id),
                Workspace.deleted_at.is_(None)
            )
        )
    )
    workspace = workspace_result.scalar_one_or_none()
    
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    
    if not workspace.is_public and (not current_user or workspace.owner_id != current_user.id):
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Find and remove workflow
    workflow_to_remove = None
    for wf in workspace.workflows:
        if str(wf.id) == workflow_id:
            workflow_to_remove = wf
            break
    
    if not workflow_to_remove:
        raise HTTPException(status_code=404, detail="Workflow not found in workspace")
    
    workspace.workflows.remove(workflow_to_remove)
    await db.commit()
    
    return None


@router.get("/workspaces/{workspace_id}/workflows", response_model=List[WorkflowResponse])
async def list_workflows(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """List workflows in a workspace"""
    # Check workspace access
    workspace_result = await db.execute(
        select(Workspace).options(selectinload(Workspace.workflows)).where(
            and_(
                Workspace.id == uuid.UUID(workspace_id),
                Workspace.deleted_at.is_(None)
            )
        )
    )
    workspace = workspace_result.scalar_one_or_none()
    
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    
    if not workspace.is_public and (not current_user or workspace.owner_id != current_user.id):
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Get workflows through many-to-many relationship
    workflows = workspace.workflows if workspace.workflows else []
    
    # Manually construct responses to ensure UUIDs are converted to strings
    return [
        WorkflowResponse(
            id=str(wf.id),
            name=wf.name,
            description=wf.description,
            status=wf.status.value,
            graph_data=wf.graph_data,
            folder_path=getattr(wf, 'folder_path', None) or str(local_storage.get_workflow_path(str(wf.id))),
            created_at=wf.created_at,
            updated_at=wf.updated_at,
            last_run_at=wf.last_run_at
        )
        for wf in workflows
    ]


@router.get("/workflows", response_model=List[WorkflowResponse])
async def list_all_workflows(
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """List all workflows (across all workspaces)"""
    try:
        result = await db.execute(
            select(Workflow).options(
                selectinload(Workflow.workspaces)
            ).order_by(Workflow.created_at.desc())
        )
        workflows = result.scalars().all()
        
        # Manually construct responses to ensure UUIDs are converted to strings
        response_list = []
        for wf in workflows:
            try:
                # Get first workspace ID if any
                workspace_id = None
                if wf.workspaces and len(wf.workspaces) > 0:
                    workspace_id = str(wf.workspaces[0].id)
                
                # Get folder path
                folder_path_value = getattr(wf, 'folder_path', None)
                if not folder_path_value:
                    folder_path_value = str(local_storage.get_workflow_path(str(wf.id)))
                
                response_list.append(
                    WorkflowResponse(
                        id=str(wf.id),
                        name=wf.name,
                        description=wf.description,
                        status=wf.status.value,
                        graph_data=wf.graph_data,
                        folder_path=folder_path_value,
                        created_at=wf.created_at,
                        updated_at=wf.updated_at,
                        last_run_at=wf.last_run_at
                    )
                )
            except Exception as e:
                # Log error for this specific workflow but continue processing others
                print(f"Error processing workflow {wf.id}: {str(e)}\n{traceback.format_exc()}")
                continue
        
        return response_list
    except Exception as e:
        error_msg = f"Error listing workflows: {str(e)}\n{traceback.format_exc()}"
        print(error_msg)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/workflows/{workflow_id}", response_model=WorkflowResponse)
async def get_workflow(
    workflow_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Get a workflow by ID"""
    result = await db.execute(
        select(Workflow).options(
            selectinload(Workflow.workspaces)
        ).where(Workflow.id == uuid.UUID(workflow_id))
    )
    workflow = result.scalar_one_or_none()
    
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    # Check access through any workspace the workflow belongs to
    # For now, allow access if workflow exists (can be refined later with workspace permissions)
    
    # Manually construct response to ensure UUIDs are converted to strings
    folder_path_value = getattr(workflow, 'folder_path', None) or str(local_storage.get_workflow_path(str(workflow.id)))
    
    return WorkflowResponse(
        id=str(workflow.id),
        name=workflow.name,
        description=workflow.description,
        status=workflow.status.value,
        graph_data=workflow.graph_data,
        folder_path=folder_path_value,
        created_at=workflow.created_at,
        updated_at=workflow.updated_at,
        last_run_at=workflow.last_run_at
    )


@router.put("/workflows/{workflow_id}", response_model=WorkflowResponse)
async def update_workflow(
    workflow_id: str,
    workflow_data: WorkflowUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user)
):
    """Update a workflow"""
    result = await db.execute(
        select(Workflow).options(
            selectinload(Workflow.workspaces)
        ).where(Workflow.id == uuid.UUID(workflow_id))
    )
    workflow = result.scalar_one_or_none()
    
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    # Check if user has access through any workspace the workflow belongs to
    has_access = False
    if workflow.workspaces:
        for workspace in workflow.workspaces:
            if workspace.owner_id == current_user.id:
                has_access = True
                break
    
    if not has_access:
        raise HTTPException(status_code=403, detail="Access denied")
    
    if workflow_data.name is not None:
        workflow.name = workflow_data.name
    if workflow_data.description is not None:
        workflow.description = workflow_data.description
    if workflow_data.graph_data is not None:
        workflow.graph_data = workflow_data.graph_data
    
    await db.commit()
    await db.refresh(workflow)
    
    # Manually construct response to ensure UUIDs are converted to strings
    folder_path_value = getattr(workflow, 'folder_path', None) or str(local_storage.get_workflow_path(str(workflow.id)))
    
    return WorkflowResponse(
        id=str(workflow.id),
        name=workflow.name,
        description=workflow.description,
        status=workflow.status.value,
        graph_data=workflow.graph_data,
        folder_path=folder_path_value,
        created_at=workflow.created_at,
        updated_at=workflow.updated_at,
        last_run_at=workflow.last_run_at
    )


# Node endpoints
@router.post("/workflows/{workflow_id}/nodes", response_model=NodeResponse, status_code=status.HTTP_201_CREATED)
async def create_node(
    workflow_id: str,
    node_data: NodeCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user)
):
    """Create a node in a workflow"""
    try:
        # Check workflow access through workspaces
        workflow_result = await db.execute(
            select(Workflow).options(
                selectinload(Workflow.workspaces)
            ).where(Workflow.id == uuid.UUID(workflow_id))
        )
        workflow = workflow_result.scalar_one_or_none()
        
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")
        
        # Check access: user must be owner of at least one workspace the workflow belongs to
        # or be a member with EDIT access. If workflow has no workspaces (independent), allow access.
        has_access = False
        current_user_id = str(current_user.id) if current_user else None
        
        if workflow.workspaces and len(workflow.workspaces) > 0:
            # Workflow belongs to one or more workspaces - check workspace access
            for workspace in workflow.workspaces:
                # Check if user is owner
                if workspace.owner_id == current_user.id:
                    has_access = True
                    break
                else:
                    # Check if user is a workspace member with EDIT or OWNER access
                    if current_user:
                        member_result = await db.execute(
                            select(WorkspaceMember).where(
                                and_(
                                    WorkspaceMember.workspace_id == workspace.id,
                                    WorkspaceMember.user_id == current_user.id
                                )
                            )
                        )
                        member = member_result.scalar_one_or_none()
                        if member and member.access_level in [WorkspaceAccessLevel.EDIT, WorkspaceAccessLevel.OWNER]:
                            has_access = True
                            break
        else:
            # Workflow has no workspaces (independent workflow) - allow access to any authenticated user
            has_access = True
        
        if not has_access:
            raise HTTPException(status_code=403, detail="Access denied: You must be the owner of at least one workspace this workflow belongs to, or be a member with edit access")
        
        # Validate module type
        registry = get_registry()
        node_class = registry.get_node_class(node_data.module_type)
        if not node_class:
            raise HTTPException(status_code=400, detail=f"Unknown module type: {node_data.module_type}")
        
        # Generate unique module_id: module_name + UUID
        # Get module display name for better readability
        temp_node = node_class(str(uuid.uuid4()))
        module_display_name = temp_node.display_name.replace(' ', '_').lower()
        unique_module_id = f"{module_display_name}_{str(uuid.uuid4())}"
        
        # Create node - checkpoint_name is stored ONLY in JSON, not in database
        node = WorkflowNode(
            workflow_id=uuid.UUID(workflow_id),
            module_type=node_data.module_type,
            module_id=unique_module_id,  # Use generated unique ID instead of user-provided
            position_x=int(node_data.position_x),
            position_y=int(node_data.position_y),
            config=node_data.config or {}
        )
        
        db.add(node)
        await db.commit()
        await db.refresh(node)
        
        # Create node folder structure: workflows/{workflow_id}/nodes/{node_id}/input, wip, output
        try:
            local_storage.ensure_workflow_node_structure(workflow_id, str(node.id))
        except Exception as e:
            # Log error but don't fail the request
            import traceback
            print(f"Warning: Could not create node folder structure: {e}\n{traceback.format_exc()}")
        
        # Save workflow JSON to file (includes checkpoint_name from node_data, not from database)
        checkpoint_name_updates = {}
        if node_data.checkpoint_name:
            checkpoint_name_updates[str(node.id)] = node_data.checkpoint_name
        
        try:
            await save_workflow_json_to_file(workflow_id, db, checkpoint_name_updates)
        except Exception as e:
            # Log error but don't fail the request
            import traceback
            print(f"Warning: Could not save workflow JSON: {e}\n{traceback.format_exc()}")
        
        # Manually construct response - checkpoint_name comes from node_data, not from database
        # Handle None values and ensure all fields are properly set
        try:
            response = NodeResponse(
                id=str(node.id),
                workflow_id=str(node.workflow_id),
                module_type=node.module_type,
                module_id=node.module_id,
                checkpoint_name=node_data.checkpoint_name,  # From request, stored in JSON only
                position_x=node.position_x,
                position_y=node.position_y,
                config=node.config if node.config else {},
                state=node.state if node.state else {}
            )
        except Exception as e:
            # Log error in response construction
            import traceback
            error_msg = f"Error constructing response: {str(e)}\n{traceback.format_exc()}"
            print(error_msg)
            raise HTTPException(status_code=500, detail=f"Error creating node response: {str(e)}")
        
        # Publish WebSocket update
        try:
            await publish_workflow_update(workflow_id, {
                "type": "node_created",
                "workflow_id": workflow_id,
                "node": {
                    "id": str(node.id),
                    "workflow_id": str(node.workflow_id),
                    "module_type": node.module_type,
                    "module_id": node.module_id,
                    "checkpoint_name": node_data.checkpoint_name,  # From request, stored in JSON only
                    "position_x": node.position_x,
                    "position_y": node.position_y,
                    "config": node.config,
                    "state": node.state
                }
            })
        except Exception as e:
            # Log WebSocket error but don't fail the request
            import traceback
            print(f"Warning: Could not publish WebSocket update: {e}\n{traceback.format_exc()}")
        
        return response
    except HTTPException:
        raise
    except Exception as e:
        # Log the full error for debugging
        import traceback
        error_msg = f"Error creating node: {str(e)}\n{traceback.format_exc()}"
        print(error_msg)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/workflows/{workflow_id}/nodes", response_model=List[NodeResponse])
async def list_nodes(
    workflow_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """List nodes in a workflow"""
    # Check workflow access through workspaces
    workflow_result = await db.execute(
        select(Workflow).options(
            selectinload(Workflow.workspaces)
        ).where(Workflow.id == uuid.UUID(workflow_id))
    )
    workflow = workflow_result.scalar_one_or_none()
    
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    # Check access: workflow must be in at least one accessible workspace
    # For now, allow access if workflow exists (can be refined later with workspace permissions)
    # If workflow has no workspaces, allow access (workflow can be standalone)
    
    result = await db.execute(
        select(WorkflowNode).where(WorkflowNode.workflow_id == uuid.UUID(workflow_id))
    )
    nodes = result.scalars().all()
    
    # Manually construct responses - get checkpoint_name from workflow JSON file
    workflow_id_str = str(workflow.id)
    
    # Load checkpoint names from JSON file
    checkpoint_names = {}
    try:
        workflow_json = local_storage.load_workflow_json(workflow_id_str)
        if workflow_json and isinstance(workflow_json, dict):
            nodes_list = workflow_json.get('nodes', [])
            for n in nodes_list:
                node_id = n.get('id')
                if node_id:
                    checkpoint_names[node_id] = n.get('checkpoint_name')
    except Exception:
        pass
    
    return [
        NodeResponse(
            id=str(node.id),
            workflow_id=str(node.workflow_id),
            module_type=node.module_type,
            module_id=node.module_id,
            checkpoint_name=checkpoint_names.get(str(node.id)),  # From JSON file only
            position_x=node.position_x,
            position_y=node.position_y,
            config=node.config,
            state=node.state
        )
        for node in nodes
    ]


# Graph context endpoints
class NodeContextResponse(BaseModel):
    """Response model for node graph context"""
    node_id: str
    predecessors: List[str]  # Upstream node IDs
    successors: List[str]  # Downstream node IDs
    depth: int
    execution_order: int
    upstream_outputs: Dict[str, Dict[str, str]]  # node_id -> {source_port: target_port}
    downstream_inputs: Dict[str, Dict[str, str]]  # node_id -> {source_port: target_port}


@router.get("/workflows/{workflow_id}/nodes/{node_id}/context", response_model=NodeContextResponse)
async def get_node_context(
    workflow_id: str,
    node_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Get graph context for a specific node (predecessors, successors, etc.)"""
    # Check workflow access
    workflow_result = await db.execute(
        select(Workflow).options(
            selectinload(Workflow.workspaces)
        ).where(Workflow.id == uuid.UUID(workflow_id))
    )
    workflow = workflow_result.scalar_one_or_none()
    
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    # Check access: workflow must be in at least one accessible workspace, or be independent
    has_access = False
    if workflow.workspaces and len(workflow.workspaces) > 0:
        for workspace in workflow.workspaces:
            if current_user and workspace.owner_id == current_user.id:
                has_access = True
                break
            elif workspace.is_public:
                has_access = True
                break
    else:
        # Independent workflow - allow access
        has_access = True
    
    if not has_access:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Load nodes and connections
    nodes_result = await db.execute(
        select(WorkflowNode).where(WorkflowNode.workflow_id == uuid.UUID(workflow_id))
    )
    nodes = nodes_result.scalars().all()
    
    connections_result = await db.execute(
        select(WorkflowConnection).where(WorkflowConnection.workflow_id == uuid.UUID(workflow_id))
    )
    connections = connections_result.scalars().all()
    
    # Build graph manager
    graph_manager = GraphManager(nodes, connections)
    
    # Get node context
    node_context = graph_manager.get_node_context(node_id)
    if not node_context:
        raise HTTPException(status_code=404, detail="Node not found")
    
    # Build upstream_outputs mapping (port connections)
    upstream_outputs = {}
    for pred_id in node_context.predecessors:
        conns = [
            conn for conn in graph_manager.get_connections_from(pred_id)
            if str(conn.target_node_id) == node_id
        ]
        upstream_outputs[pred_id] = {
            conn.source_port: conn.target_port
            for conn in conns
        }
    
    # Build downstream_inputs mapping (port connections)
    downstream_inputs = {}
    for succ_id in node_context.successors:
        conns = [
            conn for conn in graph_manager.get_connections_from(node_id)
            if str(conn.target_node_id) == succ_id
        ]
        downstream_inputs[succ_id] = {
            conn.source_port: conn.target_port
            for conn in conns
        }
    
    return NodeContextResponse(
        node_id=node_id,
        predecessors=node_context.predecessors,
        successors=node_context.successors,
        depth=node_context.depth,
        execution_order=node_context.execution_order,
        upstream_outputs=upstream_outputs,
        downstream_inputs=downstream_inputs
    )


@router.get("/workflows/{workflow_id}/graph", response_model=Dict[str, Any])
async def get_workflow_graph(
    workflow_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Get complete graph structure for a workflow"""
    # Check workflow access
    workflow_result = await db.execute(
        select(Workflow).options(
            selectinload(Workflow.workspaces)
        ).where(Workflow.id == uuid.UUID(workflow_id))
    )
    workflow = workflow_result.scalar_one_or_none()
    
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    # Check access
    has_access = False
    if workflow.workspaces and len(workflow.workspaces) > 0:
        for workspace in workflow.workspaces:
            if current_user and workspace.owner_id == current_user.id:
                has_access = True
                break
            elif workspace.is_public:
                has_access = True
                break
    else:
        has_access = True
    
    if not has_access:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Load nodes and connections
    nodes_result = await db.execute(
        select(WorkflowNode).where(WorkflowNode.workflow_id == uuid.UUID(workflow_id))
    )
    nodes = nodes_result.scalars().all()
    
    connections_result = await db.execute(
        select(WorkflowConnection).where(WorkflowConnection.workflow_id == uuid.UUID(workflow_id))
    )
    connections = connections_result.scalars().all()
    
    # Build graph manager
    graph_manager = GraphManager(nodes, connections)
    
    # Get all node contexts
    all_contexts = graph_manager.get_all_contexts()
    
    # Build graph structure
    graph_data = {
        "nodes": {
            node_id: {
                "id": node_id,
                "predecessors": ctx.predecessors,
                "successors": ctx.successors,
                "depth": ctx.depth,
                "execution_order": ctx.execution_order
            }
            for node_id, ctx in all_contexts.items()
        },
        "execution_order": graph_manager.topological_sort(),
        "connections": [
            {
                "id": str(conn.id),
                "source_node_id": str(conn.source_node_id),
                "target_node_id": str(conn.target_node_id),
                "source_port": conn.source_port,
                "target_port": conn.target_port
            }
            for conn in connections
        ]
    }
    
    return graph_data


@router.put("/nodes/{node_id}", response_model=NodeResponse)
async def update_node(
    node_id: str,
    node_data: NodeUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user)
):
    """Update a node"""
    result = await db.execute(
        select(WorkflowNode).options(
            selectinload(WorkflowNode.workflow).selectinload(Workflow.workspaces)
        ).where(WorkflowNode.id == uuid.UUID(node_id))
    )
    node = result.scalar_one_or_none()
    
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    
    # Check access: user must be owner of at least one workspace the workflow belongs to
    # If workflow has no workspaces (independent), allow access
    has_access = False
    if node.workflow.workspaces and len(node.workflow.workspaces) > 0:
        for workspace in node.workflow.workspaces:
            if workspace.owner_id == current_user.id:
                has_access = True
                break
            else:
                # Check if user is a workspace member with EDIT or OWNER access
                member_result = await db.execute(
                    select(WorkspaceMember).where(
                        and_(
                            WorkspaceMember.workspace_id == workspace.id,
                            WorkspaceMember.user_id == current_user.id
                        )
                    )
                )
                member = member_result.scalar_one_or_none()
                if member and member.access_level in [WorkspaceAccessLevel.EDIT, WorkspaceAccessLevel.OWNER]:
                    has_access = True
                    break
    else:
        # Workflow has no workspaces (independent workflow) - allow access
        has_access = True
    
    if not has_access:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Update checkpoint_name is stored ONLY in JSON, not in database
    # Just update position and config in database
    if node_data.position_x is not None:
        node.position_x = int(node_data.position_x)
    if node_data.position_y is not None:
        node.position_y = int(node_data.position_y)
    if node_data.config is not None:
        node.config = node_data.config
    
    await db.commit()
    await db.refresh(node)
    
    # Save workflow JSON to file (includes checkpoint_name from node_data, not from database)
    checkpoint_name_updates = {}
    if node_data.checkpoint_name is not None:
        checkpoint_name_updates[str(node.id)] = node_data.checkpoint_name
    
    try:
        await save_workflow_json_to_file(str(node.workflow_id), db, checkpoint_name_updates)
    except Exception as e:
        # Log error but don't fail the request
        import traceback
        print(f"Warning: Could not save workflow JSON: {e}\n{traceback.format_exc()}")
    
    # Manually construct response - checkpoint_name comes from node_data, not from database
    response = NodeResponse(
        id=str(node.id),
        workflow_id=str(node.workflow_id),
        module_type=node.module_type,
        module_id=node.module_id,
        checkpoint_name=node_data.checkpoint_name,  # From request, stored in JSON only
        position_x=node.position_x,
        position_y=node.position_y,
        config=node.config,
        state=node.state
    )
    
    # Publish WebSocket update
    await publish_workflow_update(str(node.workflow_id), {
        "type": "node_updated",
        "workflow_id": str(node.workflow_id),
        "node": {
            "id": str(node.id),
            "workflow_id": str(node.workflow_id),
            "module_type": node.module_type,
            "module_id": node.module_id,
            "checkpoint_name": node_data.checkpoint_name,  # From request, stored in JSON only
            "position_x": node.position_x,
            "position_y": node.position_y,
            "config": node.config,
            "state": node.state
        }
    })
    
    return response


@router.delete("/nodes/{node_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_node(
    node_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user)
):
    """Delete a node (idempotent - returns 204 even if node doesn't exist)"""
    result = await db.execute(
        select(WorkflowNode).options(
            selectinload(WorkflowNode.workflow).selectinload(Workflow.workspaces)
        ).where(WorkflowNode.id == uuid.UUID(node_id))
    )
    node = result.scalar_one_or_none()
    
    # If node doesn't exist, return 204 (idempotent delete)
    if not node:
        return
    
    # Check access: user must be owner of at least one workspace the workflow belongs to
    # If workflow has no workspaces (independent), allow access
    has_access = False
    if node.workflow.workspaces and len(node.workflow.workspaces) > 0:
        for workspace in node.workflow.workspaces:
            if workspace.owner_id == current_user.id:
                has_access = True
                break
            else:
                # Check if user is a workspace member with EDIT or OWNER access
                member_result = await db.execute(
                    select(WorkspaceMember).where(
                        and_(
                            WorkspaceMember.workspace_id == workspace.id,
                            WorkspaceMember.user_id == current_user.id
                        )
                    )
                )
                member = member_result.scalar_one_or_none()
                if member and member.access_level in [WorkspaceAccessLevel.EDIT, WorkspaceAccessLevel.OWNER]:
                    has_access = True
                    break
    else:
        # Workflow has no workspaces (independent workflow) - allow access
        has_access = True
    
    if not has_access:
        raise HTTPException(status_code=403, detail="Access denied")
    
    workflow_id = str(node.workflow_id)
    
    # Delete the node using SQLAlchemy delete statement
    await db.execute(delete(WorkflowNode).where(WorkflowNode.id == uuid.UUID(node_id)))
    await db.commit()
    
    # Save workflow JSON to file
    await save_workflow_json_to_file(workflow_id, db)
    
    # Publish WebSocket update
    await publish_workflow_update(workflow_id, {
        "type": "node_deleted",
        "workflow_id": workflow_id,
        "node_id": node_id
    })


# Connection endpoints
@router.post("/workflows/{workflow_id}/connections", response_model=ConnectionResponse, status_code=status.HTTP_201_CREATED)
async def create_connection(
    workflow_id: str,
    connection_data: ConnectionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user)
):
    """Create a connection between nodes"""
    # Check workflow access through workspaces
    workflow_result = await db.execute(
        select(Workflow).options(
            selectinload(Workflow.workspaces)
        ).where(Workflow.id == uuid.UUID(workflow_id))
    )
    workflow = workflow_result.scalar_one_or_none()
    
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    # Check access: user must be owner of at least one workspace the workflow belongs to
    # If workflow has no workspaces (independent), allow access
    has_access = False
    if workflow.workspaces and len(workflow.workspaces) > 0:
        for workspace in workflow.workspaces:
            if workspace.owner_id == current_user.id:
                has_access = True
                break
            else:
                # Check if user is a workspace member with EDIT or OWNER access
                member_result = await db.execute(
                    select(WorkspaceMember).where(
                        and_(
                            WorkspaceMember.workspace_id == workspace.id,
                            WorkspaceMember.user_id == current_user.id
                        )
                    )
                )
                member = member_result.scalar_one_or_none()
                if member and member.access_level in [WorkspaceAccessLevel.EDIT, WorkspaceAccessLevel.OWNER]:
                    has_access = True
                    break
    else:
        # Workflow has no workspaces (independent workflow) - allow access
        has_access = True
    
    if not has_access:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Check if connection already exists (prevent duplicates)
    existing_connection_result = await db.execute(
        select(WorkflowConnection).where(
            and_(
                WorkflowConnection.workflow_id == uuid.UUID(workflow_id),
                WorkflowConnection.source_node_id == uuid.UUID(connection_data.source_node_id),
                WorkflowConnection.target_node_id == uuid.UUID(connection_data.target_node_id),
                WorkflowConnection.source_port == connection_data.source_port,
                WorkflowConnection.target_port == connection_data.target_port
            )
        )
    )
    existing_connection = existing_connection_result.scalar_one_or_none()
    
    if existing_connection:
        # Connection already exists, return it
        response = ConnectionResponse(
            id=str(existing_connection.id),
            workflow_id=str(existing_connection.workflow_id),
            source_node_id=str(existing_connection.source_node_id),
            target_node_id=str(existing_connection.target_node_id),
            source_port=existing_connection.source_port,
            target_port=existing_connection.target_port
        )
        # Still save workflow JSON to ensure it's up to date
        try:
            await save_workflow_json_to_file(workflow_id, db)
        except Exception as e:
            import traceback
            print(f"Warning: Could not save workflow JSON: {e}\n{traceback.format_exc()}")
        # Publish WebSocket update even for existing connection
        await publish_workflow_update(workflow_id, {
            "type": "connection_created",
            "workflow_id": workflow_id,
            "connection": {
                "id": str(existing_connection.id),
                "workflow_id": str(existing_connection.workflow_id),
                "source_node_id": str(existing_connection.source_node_id),
                "target_node_id": str(existing_connection.target_node_id),
                "source_port": existing_connection.source_port,
                "target_port": existing_connection.target_port
            }
        })
        return response
    
    # Create new connection
    connection = WorkflowConnection(
        workflow_id=uuid.UUID(workflow_id),
        source_node_id=uuid.UUID(connection_data.source_node_id),
        target_node_id=uuid.UUID(connection_data.target_node_id),
        source_port=connection_data.source_port,
        target_port=connection_data.target_port
    )
    db.add(connection)
    await db.commit()
    await db.refresh(connection)
    
    # Save workflow JSON to file
    try:
        await save_workflow_json_to_file(workflow_id, db)
    except Exception as e:
        # Log error but don't fail the request
        import traceback
        print(f"Warning: Could not save workflow JSON: {e}\n{traceback.format_exc()}")
    
    # Manually construct response
    response = ConnectionResponse(
        id=str(connection.id),
        workflow_id=str(connection.workflow_id),
        source_node_id=str(connection.source_node_id),
        target_node_id=str(connection.target_node_id),
        source_port=connection.source_port,
        target_port=connection.target_port
    )
    
    # Publish WebSocket update
    await publish_workflow_update(workflow_id, {
        "type": "connection_created",
        "workflow_id": workflow_id,
        "connection": {
            "id": str(connection.id),
            "workflow_id": str(connection.workflow_id),
            "source_node_id": str(connection.source_node_id),
            "target_node_id": str(connection.target_node_id),
            "source_port": connection.source_port,
            "target_port": connection.target_port
        }
    })
    
    return response


@router.get("/workflows/{workflow_id}/connections", response_model=List[ConnectionResponse])
async def list_connections(
    workflow_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """List connections in a workflow"""
    # Check workflow access through workspaces
    workflow_result = await db.execute(
        select(Workflow).options(
            selectinload(Workflow.workspaces)
        ).where(Workflow.id == uuid.UUID(workflow_id))
    )
    workflow = workflow_result.scalar_one_or_none()
    
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    # Check access: workflow must be in at least one accessible workspace
    # For now, allow access if workflow exists (can be refined later with workspace permissions)
    # If workflow has no workspaces, allow access (workflow can be standalone)
    
    result = await db.execute(
        select(WorkflowConnection).where(WorkflowConnection.workflow_id == uuid.UUID(workflow_id))
    )
    connections = result.scalars().all()
    return connections


@router.delete("/connections/{connection_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_connection(
    connection_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user)
):
    """Delete a connection (idempotent - returns 204 even if connection doesn't exist)"""
    result = await db.execute(
        select(WorkflowConnection).options(
            selectinload(WorkflowConnection.workflow).selectinload(Workflow.workspaces)
        ).where(WorkflowConnection.id == uuid.UUID(connection_id))
    )
    connection = result.scalar_one_or_none()
    
    # If connection doesn't exist, return 204 (idempotent delete)
    if not connection:
        return
    
    # Check access: user must be owner of at least one workspace the workflow belongs to
    has_access = False
    if connection.workflow.workspaces:
        for workspace in connection.workflow.workspaces:
            if workspace.owner_id == current_user.id:
                has_access = True
                break
    
    if not has_access:
        raise HTTPException(status_code=403, detail="Access denied")
    
    workflow_id = str(connection.workflow_id)
    
    # Delete the connection using SQLAlchemy delete statement
    await db.execute(delete(WorkflowConnection).where(WorkflowConnection.id == uuid.UUID(connection_id)))
    await db.commit()
    
    # Save workflow JSON to file
    await save_workflow_json_to_file(workflow_id, db)
    
    # Publish WebSocket update
    await publish_workflow_update(workflow_id, {
        "type": "connection_deleted",
        "workflow_id": workflow_id,
        "connection_id": connection_id
    })


# Execution endpoints
@router.post("/workflows/{workflow_id}/execute")
async def execute_workflow(
    workflow_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user)
):
    """Execute a workflow"""
    # Check workflow access through workspaces
    workflow_result = await db.execute(
        select(Workflow).options(
            selectinload(Workflow.workspaces)
        ).where(Workflow.id == uuid.UUID(workflow_id))
    )
    workflow = workflow_result.scalar_one_or_none()
    
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    # Check access: user must be owner of at least one workspace the workflow belongs to
    # If workflow has no workspaces (independent), allow access
    has_access = False
    if workflow.workspaces and len(workflow.workspaces) > 0:
        for workspace in workflow.workspaces:
            if workspace.owner_id == current_user.id:
                has_access = True
                break
            else:
                # Check if user is a workspace member with EDIT or OWNER access
                member_result = await db.execute(
                    select(WorkspaceMember).where(
                        and_(
                            WorkspaceMember.workspace_id == workspace.id,
                            WorkspaceMember.user_id == current_user.id
                        )
                    )
                )
                member = member_result.scalar_one_or_none()
                if member and member.access_level in [WorkspaceAccessLevel.EDIT, WorkspaceAccessLevel.OWNER]:
                    has_access = True
                    break
    else:
        # Workflow has no workspaces (independent workflow) - allow access
        has_access = True
    
    if not has_access:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Create execution record
    execution = WorkflowExecution(
        workflow_id=uuid.UUID(workflow_id),
        started_by=current_user.id if current_user else None,
        status=WorkflowExecutionStatus.QUEUED
    )
    db.add(execution)
    await db.commit()
    await db.refresh(execution)
    
    # Update workflow status
    workflow.status = WorkflowStatus.RUNNING
    await db.commit()
    
    try:
        # Execute workflow
        registry = get_registry()
        io_manager = WorkflowIOManager(db, local_storage)
        runner = WorkflowRunner(db, io_manager, registry)
        
        # Get first workspace ID if any (for backward compatibility with execution context)
        workspace_id = str(workflow.workspaces[0].id) if workflow.workspaces and len(workflow.workspaces) > 0 else None
        
        # Execute workflow with graph-aware context
        execution_results = await runner.execute_workflow(
            workflow_id=str(workflow.id),
            workspace_id=workspace_id,
            execution_id=str(execution.id),
            started_by=str(current_user.id) if current_user else None
        )
        
        # Update execution
        execution.status = WorkflowExecutionStatus.COMPLETED if execution_results["status"] == "completed" else WorkflowExecutionStatus.FAILED
        execution.execution_data = execution_results
        execution.finished_at = datetime.now(timezone.utc)
        workflow.status = WorkflowStatus.COMPLETED if execution_results["status"] == "completed" else WorkflowStatus.FAILED
        
    except Exception as e:
        execution.status = WorkflowExecutionStatus.FAILED
        execution.message = str(e)
        execution.finished_at = datetime.now(timezone.utc)
        workflow.status = WorkflowStatus.FAILED
    
    await db.commit()
    await db.refresh(execution)
    
    return {
        "execution_id": str(execution.id),
        "status": execution.status.value,
        "results": execution.execution_data
    }


# Module registry endpoint
@router.get("/modules")
async def list_modules():
    """List all available modules"""
    registry = get_registry()
    return registry.list_modules()


# File upload endpoint for nodes
@router.post("/workspaces/{workspace_id}/workflows/{workflow_id}/nodes/{node_id}/upload")
async def upload_node_file(
    workspace_id: str,
    workflow_id: str,
    node_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user)
):
    """Upload a file for a specific node (e.g., Excel file for Excel loader)"""
    # Check workspace access
    workspace_result = await db.execute(
        select(Workspace).where(Workspace.id == uuid.UUID(workspace_id))
    )
    workspace = workspace_result.scalar_one_or_none()
    
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    
    # Check access (owner or member with edit access)
    has_access = False
    if workspace.owner_id == current_user.id:
        has_access = True
    else:
        member_result = await db.execute(
            select(WorkspaceMember).where(
                and_(
                    WorkspaceMember.workspace_id == uuid.UUID(workspace_id),
                    WorkspaceMember.user_id == current_user.id,
                    WorkspaceMember.access_level.in_([WorkspaceAccessLevel.OWNER, WorkspaceAccessLevel.EDIT])
                )
            )
        )
        if member_result.scalar_one_or_none():
            has_access = True
    
    if not has_access:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Check node exists
    node_result = await db.execute(
        select(WorkflowNode).where(WorkflowNode.id == uuid.UUID(node_id))
    )
    node = node_result.scalar_one_or_none()
    
    if not node or str(node.workflow_id) != workflow_id:
        raise HTTPException(status_code=404, detail="Node not found")
    
    # Validate file type (Excel files only for now)
    if not file.filename or not file.filename.lower().endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="Only Excel files (.xlsx, .xls) are allowed")
    
    # Read file content
    content = await file.read()
    
    # Check file size (50MB max)
    max_size = 50 * 1024 * 1024
    if len(content) > max_size:
        raise HTTPException(status_code=400, detail=f"File size exceeds limit of {max_size} bytes")
    
    # Ensure workflow folder structure exists (workflows are now top-level)
    # Note: workspace_id is still in the URL for backward compatibility, but workflows are stored at top level
    local_storage.ensure_workflow_structure(workflow_id)
    
    # Generate storage key: workflows/{workflow_id}/nodes/{node_id}/input/{filename}
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    file_id = str(uuid.uuid4())[:8]
    safe_filename = "".join(c for c in file.filename if c.isalnum() or c in (' ', '-', '_', '.')).rstrip()
    storage_key = f"workflows/{workflow_id}/nodes/{node_id}/input/{timestamp}_{file_id}_{safe_filename}"
    
    # Save file
    file_path = local_storage.save_file(content, storage_key)
    
    # Read Excel file to get available sheets
    try:
        excel_file = io.BytesIO(content)
        xl_file = pd.ExcelFile(excel_file)
        available_sheets = xl_file.sheet_names
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read Excel file: {str(e)}")
    
    # Update node config with file info
    if not node.config:
        node.config = {}
    node.config["file_key"] = storage_key
    node.config["filename"] = file.filename
    node.config["available_sheets"] = available_sheets
    if not node.config.get("sheet_name") and available_sheets:
        node.config["sheet_name"] = available_sheets[0]  # Auto-select first sheet
    
    await db.commit()
    await db.refresh(node)
    
    # Save workflow JSON to file
    await save_workflow_json_to_file(workflow_id, db)
    
    return {
        "storage_key": storage_key,
        "filename": file.filename,
        "available_sheets": available_sheets
    }


# Direct workflow file upload endpoint (for independent workflows)
@router.post("/workflows/{workflow_id}/nodes/{node_id}/upload")
async def upload_workflow_node_file(
    workflow_id: str,
    node_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user)
):
    """Upload a file for a specific node in an independent workflow"""
    # Check workflow exists
    workflow_result = await db.execute(
        select(Workflow).where(Workflow.id == uuid.UUID(workflow_id))
    )
    workflow = workflow_result.scalar_one_or_none()
    
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    # Check access: user must be owner of at least one workspace the workflow belongs to, or be a member with edit access
    # If workflow has no workspaces, allow access to any authenticated user (independent workflow)
    has_access = False
    if workflow.workspaces and len(workflow.workspaces) > 0:
        # Load workspaces with selectinload
        workflow_result_with_workspaces = await db.execute(
            select(Workflow).options(
                selectinload(Workflow.workspaces)
            ).where(Workflow.id == uuid.UUID(workflow_id))
        )
        workflow_with_workspaces = workflow_result_with_workspaces.scalar_one_or_none()
        
        if workflow_with_workspaces and workflow_with_workspaces.workspaces:
            for workspace in workflow_with_workspaces.workspaces:
                if workspace.owner_id == current_user.id:
                    has_access = True
                    break
                else:
                    member_result = await db.execute(
                        select(WorkspaceMember).where(
                            and_(
                                WorkspaceMember.workspace_id == workspace.id,
                                WorkspaceMember.user_id == current_user.id,
                                WorkspaceMember.access_level.in_([WorkspaceAccessLevel.OWNER, WorkspaceAccessLevel.EDIT])
                            )
                        )
                    )
                    if member_result.scalar_one_or_none():
                        has_access = True
                        break
    else:
        # If workflow has no workspaces, allow access to any authenticated user (independent workflow)
        has_access = True
    
    if not has_access:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Check node exists
    node_result = await db.execute(
        select(WorkflowNode).where(WorkflowNode.id == uuid.UUID(node_id))
    )
    node = node_result.scalar_one_or_none()
    
    if not node or str(node.workflow_id) != workflow_id:
        raise HTTPException(status_code=404, detail="Node not found")
    
    # Validate file type (Excel files only for now)
    if not file.filename or not file.filename.lower().endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="Only Excel files (.xlsx, .xls) are allowed")
    
    # Read file content
    content = await file.read()
    
    # Check file size (50MB max)
    max_size = 50 * 1024 * 1024
    if len(content) > max_size:
        raise HTTPException(status_code=400, detail=f"File size exceeds limit of {max_size} bytes")
    
    # Ensure workflow folder structure exists
    local_storage.ensure_workflow_structure(workflow_id)
    
    # Generate storage key: workflows/{workflow_id}/nodes/{node_id}/input/{filename}
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    file_id = str(uuid.uuid4())[:8]
    safe_filename = "".join(c for c in file.filename if c.isalnum() or c in (' ', '-', '_', '.')).rstrip()
    storage_key = f"workflows/{workflow_id}/nodes/{node_id}/input/{timestamp}_{file_id}_{safe_filename}"
    
    # Save file
    file_path = local_storage.save_file(content, storage_key)
    
    # Read Excel file to get available sheets
    try:
        excel_file = io.BytesIO(content)
        xl_file = pd.ExcelFile(excel_file)
        available_sheets = xl_file.sheet_names
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read Excel file: {str(e)}")
    
    # Update node config with file info
    if not node.config:
        node.config = {}
    node.config["file_key"] = storage_key
    node.config["filename"] = file.filename
    node.config["available_sheets"] = available_sheets
    if not node.config.get("sheet_name") and available_sheets:
        node.config["sheet_name"] = available_sheets[0]  # Auto-select first sheet
    
    await db.commit()
    await db.refresh(node)
    
    # Save workflow JSON to file
    await save_workflow_json_to_file(workflow_id, db)
    
    return {
        "storage_key": storage_key,
        "filename": file.filename,
        "available_sheets": available_sheets
    }


# Workspace member management endpoints
class WorkspaceMemberCreate(BaseModel):
    user_id: str
    access_level: str  # "edit" or "view"


class WorkspaceMemberResponse(BaseModel):
    id: str
    workspace_id: str
    user_id: str
    access_level: str
    created_at: datetime
    updated_at: datetime
    user_name: Optional[str] = None
    user_email: Optional[str] = None


@router.post("/workspaces/{workspace_id}/members", response_model=WorkspaceMemberResponse, status_code=status.HTTP_201_CREATED)
async def add_workspace_member(
    workspace_id: str,
    member_data: WorkspaceMemberCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user)
):
    """Add a member to a workspace"""
    # Check workspace exists
    workspace_result = await db.execute(
        select(Workspace).where(Workspace.id == uuid.UUID(workspace_id))
    )
    workspace = workspace_result.scalar_one_or_none()
    
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    
    # Check if user is owner
    if workspace.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only workspace owner can add members")
    
    # Validate access level
    try:
        access_level = WorkspaceAccessLevel(member_data.access_level)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid access level. Must be 'edit' or 'view'")
    
    # Check if user exists
    user_result = await db.execute(
        select(AppUser).where(AppUser.id == uuid.UUID(member_data.user_id))
    )
    user = user_result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check if member already exists
    existing_member_result = await db.execute(
        select(WorkspaceMember).where(
            and_(
                WorkspaceMember.workspace_id == uuid.UUID(workspace_id),
                WorkspaceMember.user_id == uuid.UUID(member_data.user_id)
            )
        )
    )
    if existing_member_result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="User is already a member of this workspace")
    
    # Create member
    member = WorkspaceMember(
        workspace_id=uuid.UUID(workspace_id),
        user_id=uuid.UUID(member_data.user_id),
        access_level=access_level
    )
    db.add(member)
    await db.commit()
    await db.refresh(member)
    
    return WorkspaceMemberResponse(
        id=str(member.id),
        workspace_id=str(member.workspace_id),
        user_id=str(member.user_id),
        access_level=member.access_level.value,
        created_at=member.created_at,
        updated_at=member.updated_at,
        user_name=user.name,
        user_email=user.email
    )


@router.get("/workspaces/{workspace_id}/members", response_model=List[WorkspaceMemberResponse])
async def list_workspace_members(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user)
):
    """List all members of a workspace"""
    # Check workspace exists
    workspace_result = await db.execute(
        select(Workspace).where(Workspace.id == uuid.UUID(workspace_id))
    )
    workspace = workspace_result.scalar_one_or_none()
    
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    
    # Check access (owner or member)
    has_access = False
    if workspace.owner_id == current_user.id:
        has_access = True
    else:
        member_result = await db.execute(
            select(WorkspaceMember).where(
                and_(
                    WorkspaceMember.workspace_id == uuid.UUID(workspace_id),
                    WorkspaceMember.user_id == current_user.id
                )
            )
        )
        if member_result.scalar_one_or_none():
            has_access = True
    
    if not has_access:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Get all members
    members_result = await db.execute(
        select(WorkspaceMember).options(
            selectinload(WorkspaceMember.user)
        ).where(WorkspaceMember.workspace_id == uuid.UUID(workspace_id))
    )
    members = members_result.scalars().all()
    
    return [
        WorkspaceMemberResponse(
            id=str(member.id),
            workspace_id=str(member.workspace_id),
            user_id=str(member.user_id),
            access_level=member.access_level.value,
            created_at=member.created_at,
            updated_at=member.updated_at,
            user_name=member.user.name if member.user else None,
            user_email=member.user.email if member.user else None
        )
        for member in members
    ]


@router.put("/workspaces/{workspace_id}/members/{member_id}", response_model=WorkspaceMemberResponse)
async def update_workspace_member(
    workspace_id: str,
    member_id: str,
    access_level: str = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user)
):
    """Update a workspace member's access level"""
    # Check workspace exists
    workspace_result = await db.execute(
        select(Workspace).where(Workspace.id == uuid.UUID(workspace_id))
    )
    workspace = workspace_result.scalar_one_or_none()
    
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    
    # Check if user is owner
    if workspace.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only workspace owner can update members")
    
    # Validate access level
    try:
        new_access_level = WorkspaceAccessLevel(access_level)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid access level. Must be 'edit' or 'view'")
    
    # Get member
    member_result = await db.execute(
        select(WorkspaceMember).options(
            selectinload(WorkspaceMember.user)
        ).where(
            and_(
                WorkspaceMember.id == uuid.UUID(member_id),
                WorkspaceMember.workspace_id == uuid.UUID(workspace_id)
            )
        )
    )
    member = member_result.scalar_one_or_none()
    
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    
    # Update access level
    member.access_level = new_access_level
    member.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(member)
    
    return WorkspaceMemberResponse(
        id=str(member.id),
        workspace_id=str(member.workspace_id),
        user_id=str(member.user_id),
        access_level=member.access_level.value,
        created_at=member.created_at,
        updated_at=member.updated_at,
        user_name=member.user.name if member.user else None,
        user_email=member.user.email if member.user else None
    )


@router.delete("/workspaces/{workspace_id}/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_workspace_member(
    workspace_id: str,
    member_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user)
):
    """Remove a member from a workspace"""
    # Check workspace exists
    workspace_result = await db.execute(
        select(Workspace).where(Workspace.id == uuid.UUID(workspace_id))
    )
    workspace = workspace_result.scalar_one_or_none()
    
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    
    # Check if user is owner
    if workspace.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only workspace owner can remove members")
    
    # Get member
    member_result = await db.execute(
        select(WorkspaceMember).where(
            and_(
                WorkspaceMember.id == uuid.UUID(member_id),
                WorkspaceMember.workspace_id == uuid.UUID(workspace_id)
            )
        )
    )
    member = member_result.scalar_one_or_none()
    
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    
    # Delete member
    await db.execute(delete(WorkspaceMember).where(WorkspaceMember.id == uuid.UUID(member_id)))
    await db.commit()
    
    return None


# Workflow task/execution creation endpoint
@router.post("/workflows/{workflow_id}/tasks")
async def create_workflow_task(
    workflow_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user)
):
    """Create a new workflow task (execution) with UUID and folder structure"""
    # Check workflow access through workspaces
    workflow_result = await db.execute(
        select(Workflow).options(
            selectinload(Workflow.workspaces)
        ).where(Workflow.id == uuid.UUID(workflow_id))
    )
    workflow = workflow_result.scalar_one_or_none()
    
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    # Check access: user must be owner of at least one workspace the workflow belongs to
    # or be a member with edit access
    has_access = False
    accessible_workspace_id = None
    
    if workflow.workspaces:
        for workspace in workflow.workspaces:
            if workspace.owner_id == current_user.id:
                has_access = True
                accessible_workspace_id = str(workspace.id)
                break
            else:
                # Check if user is a member with edit access
                member_result = await db.execute(
                    select(WorkspaceMember).where(
                        and_(
                            WorkspaceMember.workspace_id == workspace.id,
                            WorkspaceMember.user_id == current_user.id,
                            WorkspaceMember.access_level.in_([WorkspaceAccessLevel.OWNER, WorkspaceAccessLevel.EDIT])
                        )
                    )
                )
                if member_result.scalar_one_or_none():
                    has_access = True
                    accessible_workspace_id = str(workspace.id)
                    break
    
    if not has_access:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Create execution record (task)
    task_id = uuid.uuid4()
    execution = WorkflowExecution(
        id=task_id,
        workflow_id=uuid.UUID(workflow_id),
        started_by=current_user.id if current_user else None,
        status=WorkflowExecutionStatus.QUEUED
    )
    db.add(execution)
    await db.commit()
    await db.refresh(execution)
    
    # Create folder structure: workflow_id -> task_id -> node_id -> input/output
    # Note: workflows are now top-level, not nested in workspaces
    workflow_id_str = str(workflow.id)
    task_id_str = str(task_id)
    
    # Ensure workflow structure exists (workflows are top-level now)
    local_storage.ensure_workflow_structure(workflow_id_str, task_id_str)
    
    # Create node folders for each node in the workflow
    nodes_result = await db.execute(
        select(WorkflowNode).where(WorkflowNode.workflow_id == uuid.UUID(workflow_id))
    )
    nodes = nodes_result.scalars().all()
    
    for node in nodes:
        node_id_str = str(node.id)
        local_storage.ensure_workflow_structure(workflow_id_str, task_id_str, node_id_str)
    
    return {
        "task_id": str(task_id),
        "workflow_id": workflow_id,
        "status": execution.status.value,
        "created_at": execution.created_at
    }

