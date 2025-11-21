from fastapi import APIRouter, Depends, HTTPException, status, Query, Body, File, UploadFile, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, delete, inspect, text
from sqlalchemy.orm import selectinload, load_only
from sqlalchemy.exc import OperationalError, ProgrammingError
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
import uuid
import json
import traceback
from datetime import datetime, timezone
from pathlib import Path
import pandas as pd
import openpyxl
import io
import shutil

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


class NodeWithWorkflowResponse(BaseModel):
    """Response model for nodes with their workflow information"""
    id: str
    workflow_id: str
    workflow_name: str
    workflow_description: Optional[str] = None
    module_type: str
    module_id: str
    checkpoint_name: Optional[str] = None
    position_x: int
    position_y: int
    config: Optional[dict]
    state: Optional[dict]
    workflow_updated_at: Optional[str] = None
    created_at: Optional[str] = None
    
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
        # Check if created_by column exists in the database using raw SQL
        created_by_exists = False
        try:
            # Use raw SQL to check if column exists in information_schema
            result = await db.execute(
                text("""
                    SELECT column_name 
                    FROM information_schema.columns 
                    WHERE table_name = 'workflow' AND column_name = 'created_by'
                """)
            )
            created_by_exists = result.scalar() is not None
        except Exception as e:
            # If check fails, assume column doesn't exist
            print(f"Note: Could not check for created_by column: {e}")
            created_by_exists = False
        
        # Create workflow
        workflow = Workflow(
            name=workflow_data.name,
            description=workflow_data.description,
            status=WorkflowStatus.DRAFT
        )
        
        # Only set created_by if column exists and user is provided
        if created_by_exists and current_user:
            workflow.created_by = current_user.id
        elif not created_by_exists:
            # If column doesn't exist, we need to prevent SQLAlchemy from including it
            # Remove the attribute from the object's __dict__ to prevent SQLAlchemy from tracking it
            if hasattr(workflow, 'created_by'):
                # Use expunge and recreate to avoid including created_by in INSERT
                # Actually, we can't easily prevent SQLAlchemy from including it
                # So we'll just not set it and handle the error if it occurs
                pass
        
        db.add(workflow)
        
        # Commit - SQLAlchemy will try to insert created_by even if we don't set it
        # because it's defined in the model. We need to handle this error.
        try:
            await db.commit()
            await db.refresh(workflow)
        except (OperationalError, ProgrammingError) as e:
            # If commit fails due to created_by, rollback and use raw SQL to insert
            error_str = str(e).lower()
            if 'created_by' in error_str:
                await db.rollback()
                # Use raw SQL to insert without created_by column
                workflow_id = uuid.uuid4()
                # Get the enum value - PostgreSQL enum expects uppercase
                # The Python enum has lowercase values, but DB enum is uppercase
                status_value = "DRAFT"  # Use uppercase to match PostgreSQL enum definition
                # Use CAST in the SQL to properly cast the string to the enum type
                await db.execute(
                    text("""
                        INSERT INTO workflow (id, name, description, status, created_at, updated_at)
                        VALUES (:id, :name, :description, CAST(:status AS workflowstatus), NOW(), NOW())
                    """),
                    {
                        "id": workflow_id,
                        "name": workflow_data.name,
                        "description": workflow_data.description,
                        "status": status_value
                    }
                )
                await db.commit()
                # Reload the workflow object using load_only to exclude created_by
                result = await db.execute(
                    select(Workflow)
                    .where(Workflow.id == workflow_id)
                    .options(
                        load_only(
                            Workflow.id,
                            Workflow.name,
                            Workflow.description,
                            Workflow.status,
                            Workflow.graph_data,
                            Workflow.folder_path,
                            Workflow.created_at,
                            Workflow.updated_at,
                            Workflow.last_run_at
                        )
                    )
                )
                workflow = result.scalar_one()
                await db.refresh(workflow)
                print(f"Note: Created workflow without created_by (column doesn't exist)")
            else:
                # Some other database error - re-raise
                raise
        
        # Create workflow folder structure and save path
        workflow_id_str = str(workflow.id)
        workflow_path = local_storage.get_workflow_path(workflow_id_str)
        workflow_path.mkdir(parents=True, exist_ok=True)
        print(f"Created workflow folder: {workflow_path} (exists: {workflow_path.exists()})")
        
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
        
        # Try to set created_by after workflow is created (if it wasn't set initially and column exists)
        if current_user:
            try:
                # Check if created_by attribute exists and is None
                if not hasattr(workflow, 'created_by') or getattr(workflow, 'created_by', None) is None:
                    workflow.created_by = current_user.id
                    await db.commit()
                    await db.refresh(workflow)
            except (AttributeError, Exception) as e:
                # Column doesn't exist yet, that's okay - workflow is still created successfully
                print(f"Note: Could not set created_by after creation (column may not exist yet): {e}")
                # Don't rollback - workflow was already created successfully
        
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
    """List workflows created by the authenticated user"""
    if not current_user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")

    try:
        result = await db.execute(
            select(Workflow)
            .options(selectinload(Workflow.workspaces))
            .where(Workflow.created_by == current_user.id)
            .order_by(Workflow.created_at.desc())
        )
        workflows = result.scalars().all()
        
        # Manually construct responses to ensure UUIDs are converted to strings
        response_list = []
        for wf in workflows:
            try:
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


@router.delete("/workflows/{workflow_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workflow(
    workflow_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user)
):
    """Delete a workflow and its files (preserving subfolders and JSON files)"""
    result = await db.execute(
        select(Workflow).options(
            selectinload(Workflow.workspaces)
        ).where(Workflow.id == uuid.UUID(workflow_id))
    )
    workflow = result.scalar_one_or_none()
    
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    # Check access: user must be owner of at least one workspace the workflow belongs to,
    # or be the creator if workflow has no workspaces (independent workflow)
    has_access = False
    
    if workflow.workspaces and len(workflow.workspaces) > 0:
        # Workflow belongs to one or more workspaces - check workspace access
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
        # Workflow has no workspaces (independent workflow) - check if user is creator
        if hasattr(workflow, 'created_by') and workflow.created_by:
            has_access = (workflow.created_by == current_user.id)
        else:
            # If created_by is not set or doesn't exist, allow access (for backwards compatibility)
            has_access = True
    
    if not has_access:
        raise HTTPException(status_code=403, detail="Access denied")
    
    workflow_id_str = str(workflow.id)
    
    # Delete workflow files (preserving subfolders and JSON files)
    try:
        local_storage.delete_workflow_files(workflow_id_str)
    except Exception as e:
        import traceback
        print(f"Error deleting workflow files for {workflow_id_str}: {str(e)}\n{traceback.format_exc()}")
        # Continue with database deletion even if file deletion fails
    
    # Delete the workflow from database (cascade will handle nodes, connections, executions)
    await db.execute(delete(Workflow).where(Workflow.id == uuid.UUID(workflow_id)))
    await db.commit()
    
    return None


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
            node_path = local_storage.ensure_workflow_node_structure(workflow_id, str(node.id))
            print(f"Created node folder structure: {node_path}")
            # Verify folders exist
            input_path = node_path / "input"
            wip_path = node_path / "wip"
            output_path = node_path / "output"
            print(f"  - Input folder: {input_path} (exists: {input_path.exists()})")
            print(f"  - WIP folder: {wip_path} (exists: {wip_path.exists()})")
            print(f"  - Output folder: {output_path} (exists: {output_path.exists()})")
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


@router.get("/workflows/by-module/{module_type}", response_model=List[WorkflowResponse])
async def list_workflows_by_module(
    module_type: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """List all workflows that contain nodes of a specific module type"""
    try:
        # Get current_user_id early to avoid lazy loading issues after rollback
        current_user_id = None
        if current_user:
            # Access id before any database operations that might rollback
            try:
                current_user_id = str(current_user.id)
            except Exception:
                current_user_id = None
        
        # Check if created_by column exists in the database
        # Query workflows that have at least one node of the specified module type
        # First check if created_by column exists by trying a simple query
        created_by_exists = False
        try:
            # Try to query with created_by to see if column exists
            test_result = await db.execute(
                select(Workflow.created_by).limit(1)
            )
            created_by_exists = True
        except (OperationalError, ProgrammingError) as e:
            # Column doesn't exist - rollback the transaction to clear the error state
            await db.rollback()
            created_by_exists = False
        
        # Build query based on whether created_by exists
        # Note: Always exclude graph_data (JSON) from DISTINCT queries to avoid PostgreSQL errors
        if created_by_exists:
            # Column exists - use load_only to exclude graph_data from DISTINCT
            result = await db.execute(
                select(Workflow)
                .join(WorkflowNode, Workflow.id == WorkflowNode.workflow_id)
                .where(WorkflowNode.module_type == module_type)
                .distinct()
                .options(
                    load_only(
                        Workflow.id,
                        Workflow.name,
                        Workflow.description,
                        Workflow.status,
                        # Exclude graph_data (JSON) to avoid "could not identify an equality operator for type json" error
                        # Workflow.graph_data,
                        Workflow.folder_path,
                        Workflow.created_by,
                        Workflow.created_at,
                        Workflow.updated_at,
                        Workflow.last_run_at
                    ),
                    selectinload(Workflow.workspaces)
                )
            )
        else:
            # Column doesn't exist - use load_only to exclude it and graph_data
            result = await db.execute(
                select(Workflow)
                .join(WorkflowNode, Workflow.id == WorkflowNode.workflow_id)
                .where(WorkflowNode.module_type == module_type)
                .distinct()
                .options(
                    load_only(
                        Workflow.id,
                        Workflow.name,
                        Workflow.description,
                        Workflow.status,
                        # Exclude graph_data (JSON) to avoid "could not identify an equality operator for type json" error
                        # Workflow.graph_data,
                        Workflow.folder_path,
                        Workflow.created_at,
                        Workflow.updated_at,
                        Workflow.last_run_at
                    ),
                    selectinload(Workflow.workspaces)
                )
            )
        
        workflows = result.scalars().all()
        
        # Filter workflows based on access
        accessible_workflows = []
        # current_user_id was already set at the beginning of the function
        
        for workflow in workflows:
            has_access = False
            
            # First check if user created this workflow - always allow access
            # Access created_by from __dict__ directly to avoid triggering lazy loading
            workflow_created_by = None
            if hasattr(workflow, '__dict__'):
                workflow_created_by = workflow.__dict__.get('created_by', None)
            
            if current_user_id and workflow_created_by:
                # Compare UUIDs as strings to avoid lazy loading issues
                if str(workflow_created_by) == current_user_id:
                    has_access = True
            elif workflow.workspaces and len(workflow.workspaces) > 0:
                # Workflow belongs to workspaces - check access
                for workspace in workflow.workspaces:
                    # Check if user is owner - use current_user_id to avoid lazy loading
                    workspace_owner_id = getattr(workspace, 'owner_id', None)
                    if current_user_id and workspace_owner_id and str(workspace_owner_id) == current_user_id:
                        has_access = True
                        break
                    # Check if workspace is public
                    elif getattr(workspace, 'is_public', False):
                        has_access = True
                        break
                    # Check if user is a workspace member
                    elif current_user_id:
                        member_result = await db.execute(
                            select(WorkspaceMember).where(
                                and_(
                                    WorkspaceMember.workspace_id == workspace.id,
                                    WorkspaceMember.user_id == uuid.UUID(current_user_id)
                                )
                            )
                        )
                        member = member_result.scalar_one_or_none()
                        if member:
                            has_access = True
                            break
            else:
                # Workflow has no workspaces (independent) - allow access if user created it or if no user (public)
                # Access created_by from __dict__ directly to avoid triggering lazy loading
                workflow_created_by = None
                if hasattr(workflow, '__dict__'):
                    workflow_created_by = workflow.__dict__.get('created_by', None)
                
                if not current_user_id or (workflow_created_by and str(workflow_created_by) == current_user_id):
                    has_access = True
            
            if has_access:
                accessible_workflows.append(workflow)
        
        # Convert to response format
        # Access graph_data from __dict__ to avoid lazy loading since it was excluded from query
        return [
            WorkflowResponse(
                id=str(workflow.id),
                name=workflow.name,
                description=workflow.description,
                status=workflow.status.value if hasattr(workflow.status, 'value') else str(workflow.status),
                graph_data=workflow.__dict__.get('graph_data', None) if hasattr(workflow, '__dict__') else None,
                folder_path=workflow.__dict__.get('folder_path', None) if hasattr(workflow, '__dict__') else None,
                created_at=workflow.created_at.isoformat() if workflow.created_at else None,
                updated_at=workflow.updated_at.isoformat() if workflow.updated_at else None,
                last_run_at=workflow.last_run_at.isoformat() if workflow.last_run_at else None
            )
            for workflow in accessible_workflows
        ]
    except Exception as e:
        import traceback
        print(f"Error listing workflows by module: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/nodes/by-module/{module_type}", response_model=List[NodeWithWorkflowResponse])
async def list_nodes_by_module(
    module_type: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """List all workflow nodes of a specific module type with their workflow information"""
    try:
        # Get current_user_id early to avoid lazy loading issues
        current_user_id = None
        if current_user:
            try:
                current_user_id = str(current_user.id)
            except Exception:
                current_user_id = None
        
        # Query nodes with their workflows, ordered by created_at descending (latest first)
        result = await db.execute(
            select(WorkflowNode, Workflow)
            .join(Workflow, WorkflowNode.workflow_id == Workflow.id)
            .where(WorkflowNode.module_type == module_type)
            .order_by(WorkflowNode.created_at.desc())
            .options(
                selectinload(Workflow.workspaces)
            )
        )
        nodes_with_workflows = result.all()
        
        # Filter nodes based on workflow access
        accessible_nodes = []
        
        # Load checkpoint names from workflow JSON files
        checkpoint_names = {}
        for node, workflow in nodes_with_workflows:
            workflow_id_str = str(workflow.id)
            if workflow_id_str not in checkpoint_names:
                checkpoint_names[workflow_id_str] = {}
                try:
                    workflow_json = local_storage.load_workflow_json(workflow_id_str)
                    if workflow_json and isinstance(workflow_json, dict):
                        nodes_list = workflow_json.get('nodes', [])
                        for n in nodes_list:
                            node_id = n.get('id')
                            if node_id:
                                checkpoint_names[workflow_id_str][node_id] = n.get('checkpoint_name')
                except Exception:
                    pass
        
        for node, workflow in nodes_with_workflows:
            has_access = False
            
            # Check if user created this workflow
            workflow_created_by = None
            if hasattr(workflow, '__dict__'):
                workflow_created_by = workflow.__dict__.get('created_by', None)
            
            if current_user_id and workflow_created_by:
                if str(workflow_created_by) == current_user_id:
                    has_access = True
            elif workflow.workspaces and len(workflow.workspaces) > 0:
                # Workflow belongs to workspaces - check access
                for workspace in workflow.workspaces:
                    workspace_owner_id = getattr(workspace, 'owner_id', None)
                    if current_user_id and workspace_owner_id and str(workspace_owner_id) == current_user_id:
                        has_access = True
                        break
                    elif getattr(workspace, 'is_public', False):
                        has_access = True
                        break
                    elif current_user_id:
                        member_result = await db.execute(
                            select(WorkspaceMember).where(
                                and_(
                                    WorkspaceMember.workspace_id == workspace.id,
                                    WorkspaceMember.user_id == uuid.UUID(current_user_id)
                                )
                            )
                        )
                        member = member_result.scalar_one_or_none()
                        if member:
                            has_access = True
                            break
            else:
                # Workflow has no workspaces (independent) - allow access if user created it or if no user (public)
                if not current_user_id or (workflow_created_by and str(workflow_created_by) == current_user_id):
                    has_access = True
            
            if has_access:
                node_id_str = str(node.id)
                workflow_id_str = str(workflow.id)
                checkpoint_name = checkpoint_names.get(workflow_id_str, {}).get(node_id_str)
                
                accessible_nodes.append(
                    NodeWithWorkflowResponse(
                        id=node_id_str,
                        workflow_id=workflow_id_str,
                        workflow_name=workflow.name,
                        workflow_description=workflow.description,
                        module_type=node.module_type,
                        module_id=node.module_id,
                        checkpoint_name=checkpoint_name,
                        position_x=node.position_x,
                        position_y=node.position_y,
                        config=node.config,
                        state=node.state,
                        workflow_updated_at=workflow.updated_at.isoformat() if workflow.updated_at else None,
                        created_at=node.created_at.isoformat() if node.created_at else None
                    )
                )
        
        return accessible_nodes
    except Exception as e:
        import traceback
        print(f"Error listing nodes by module: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/workflows/{workflow_id}/nodes", response_model=List[NodeResponse])
async def list_nodes(
    workflow_id: str,
    module_type: Optional[str] = Query(None, description="Filter nodes by module type"),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """List nodes in a workflow, optionally filtered by module_type"""
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
    
    # Build query with optional module_type filter
    query = select(WorkflowNode).where(WorkflowNode.workflow_id == uuid.UUID(workflow_id))
    if module_type:
        query = query.where(WorkflowNode.module_type == module_type)
    
    result = await db.execute(query)
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
    try:
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
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_detail = f"Error getting workflow graph: {str(e)}\n{traceback.format_exc()}"
        print(error_detail)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=error_detail)


@router.get("/nodes/{node_id}", response_model=NodeResponse)
async def get_node(
    node_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """Get a single node by ID"""
    try:
        result = await db.execute(
            select(WorkflowNode).where(WorkflowNode.id == uuid.UUID(node_id))
        )
        node = result.scalar_one_or_none()
        
        if not node:
            raise HTTPException(status_code=404, detail="Node not found")
        
        # Load checkpoint name from workflow JSON file
        workflow_id_str = str(node.workflow_id)
        checkpoint_name = None
        try:
            workflow_json = local_storage.load_workflow_json(workflow_id_str)
            if workflow_json and isinstance(workflow_json, dict):
                nodes_list = workflow_json.get('nodes', [])
                for n in nodes_list:
                    if n.get('id') == str(node.id):
                        checkpoint_name = n.get('checkpoint_name')
                        break
        except Exception:
            pass
        
        return NodeResponse(
            id=str(node.id),
            workflow_id=str(node.workflow_id),
            module_type=node.module_type,
            module_id=node.module_id,
            checkpoint_name=checkpoint_name,
            position_x=node.position_x,
            position_y=node.position_y,
            config=node.config,
            state=node.state
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid node ID format: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"Error getting node: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


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
    
    # Delete the node's folder and all its contents (input, wip, output)
    try:
        local_storage.delete_workflow_node_folder(workflow_id, node_id)
    except Exception as e:
        import traceback
        print(f"Error deleting node folder for node {node_id}: {str(e)}\n{traceback.format_exc()}")
        # Continue even if folder deletion fails (node is already deleted from DB)
    
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
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_detail = f"Error creating connection: {str(e)}\n{traceback.format_exc()}"
        print(error_detail)
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=error_detail)


@router.get("/workflows/{workflow_id}/connections", response_model=List[ConnectionResponse])
async def list_connections(
    workflow_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user_optional)
):
    """List connections in a workflow"""
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
        
        # Check access: workflow must be in at least one accessible workspace
        # For now, allow access if workflow exists (can be refined later with workspace permissions)
        # If workflow has no workspaces, allow access (workflow can be standalone)
        
        result = await db.execute(
            select(WorkflowConnection).where(WorkflowConnection.workflow_id == uuid.UUID(workflow_id))
        )
        connections = result.scalars().all()
        
        # Manually construct responses to ensure UUIDs are converted to strings
        return [
            ConnectionResponse(
                id=str(conn.id),
                workflow_id=str(conn.workflow_id),
                source_node_id=str(conn.source_node_id),
                target_node_id=str(conn.target_node_id),
                source_port=conn.source_port,
                target_port=conn.target_port
            )
            for conn in connections
        ]
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_detail = f"Error listing connections: {str(e)}\n{traceback.format_exc()}"
        print(error_detail)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=error_detail)


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
    # If workflow has no workspaces (independent), allow access
    has_access = False
    if connection.workflow.workspaces and len(connection.workflow.workspaces) > 0:
        for workspace in connection.workflow.workspaces:
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
    
    # Validate file type - check if node module type requires specific file types
    # For file_uploader module, allow all file types (validation is done in the module)
    # For other modules like excel_to_numeric, validate Excel files
    # For outlier_remover_duckdb, validate DuckDB files
    node_module_type = node.module_type if hasattr(node, 'module_type') else None
    if node_module_type != 'file_uploader':
        if node_module_type == 'outlier_remover_duckdb' or node_module_type == 'duckdb2jmp':
            # For DuckDB modules, validate DuckDB files only
            if not file.filename or not file.filename.lower().endswith('.duckdb'):
                raise HTTPException(status_code=400, detail=f"Only DuckDB files (.duckdb) are allowed for module type '{node_module_type}'.")
        else:
            # For other non-file-uploader modules, validate Excel files only
            if not file.filename or not file.filename.lower().endswith(('.xlsx', '.xls')):
                raise HTTPException(status_code=400, detail=f"Only Excel files (.xlsx, .xls) are allowed for module type '{node_module_type}'. Use file_uploader module for other file types.")
    
    # Read file content
    content = await file.read()
    
    # Check file size (500MB max for DuckDB modules, 200MB for duckdb_convert, 50MB for others)
    if node_module_type == 'outlier_remover_duckdb' or node_module_type == 'duckdb2jmp':
        max_size = 500 * 1024 * 1024
    elif node_module_type == 'duckdb_convert':
        max_size = 200 * 1024 * 1024
    else:
        max_size = 50 * 1024 * 1024
    if len(content) > max_size:
        file_size_mb = len(content) / (1024 * 1024)
        max_size_mb = max_size / (1024 * 1024)
        raise HTTPException(status_code=400, detail=f"File size ({file_size_mb:.2f} MB) exceeds limit of {max_size_mb} MB")
    
    # Ensure workflow folder structure exists (workflows are now top-level)
    # Note: workspace_id is still in the URL for backward compatibility, but workflows are stored at top level
    local_storage.ensure_workflow_structure(workflow_id)
    # Ensure node folder structure exists (input, wip, output)
    local_storage.ensure_workflow_node_structure(workflow_id, node_id)
    
    # Generate UUID for filename and preserve file extension
    file_uuid = str(uuid.uuid4())
    original_filename = file.filename or "unknown"
    file_extension = ""
    if "." in original_filename:
        file_extension = "." + original_filename.rsplit(".", 1)[1].lower()
    
    # Save file with UUID name
    uuid_filename = f"{file_uuid}{file_extension}"
    storage_key = f"workflows/{workflow_id}/nodes/{node_id}/input/{uuid_filename}"
    
    # Save file
    try:
        file_path = local_storage.save_file(content, storage_key)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")
    
    # Create metadata JSON file
    try:
        upload_time = datetime.now(timezone.utc).isoformat()
        file_type = file_extension.lstrip(".") if file_extension else "unknown"
        
        metadata = {
            "original_filename": original_filename,
            "file_type": file_type,
            "uploaded_time": upload_time,
            "workflow_id": workflow_id,
            "node_id": node_id,
            "uuid_filename": uuid_filename,
            "file_size": len(content)
        }
        
        # Save metadata JSON file alongside the uploaded file
        metadata_filename = f"{file_uuid}_metadata.json"
        metadata_storage_key = f"workflows/{workflow_id}/nodes/{node_id}/input/{metadata_filename}"
        metadata_json = json.dumps(metadata, indent=2)
        metadata_path = local_storage.save_file(metadata_json.encode('utf-8'), metadata_storage_key)
        print(f"Saved metadata file: {metadata_path}")
    except Exception as e:
        import traceback
        print(f"Error saving metadata file: {str(e)}\n{traceback.format_exc()}")
        # Don't fail the upload if metadata save fails, just log it
    
    # Read Excel file to get available sheets (only for Excel-based modules)
    available_sheets = []
    if node_module_type != 'file_uploader' and node_module_type != 'outlier_remover_duckdb' and node_module_type != 'duckdb2jmp':
        try:
            excel_file = io.BytesIO(content)
            xl_file = pd.ExcelFile(excel_file, engine='openpyxl')
            available_sheets = xl_file.sheet_names
            xl_file.close()
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to read Excel file: {str(e)}")
    
    # Update node config with file info
    try:
        if not node.config:
            node.config = {}
        node.config["file_key"] = storage_key
        node.config["filename"] = file.filename
        if available_sheets:
            node.config["available_sheets"] = available_sheets
            if not node.config.get("sheet_name") and available_sheets:
                node.config["sheet_name"] = available_sheets[0]  # Auto-select first sheet
        
        await db.commit()
        await db.refresh(node)
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update node config: {str(e)}")
    
    # Save workflow JSON to file
    try:
        await save_workflow_json_to_file(workflow_id, db)
    except Exception as e:
        # Log error but don't fail the upload if JSON save fails
        import logging
        logging.error(f"Failed to save workflow JSON: {str(e)}")
    
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
    try:
        # Check workflow exists
        workflow_result = await db.execute(
            select(Workflow).where(Workflow.id == uuid.UUID(workflow_id))
        )
        workflow = workflow_result.scalar_one_or_none()
        
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")
    except ValueError as e:
        # Invalid UUID format
        raise HTTPException(status_code=400, detail=f"Invalid workflow ID format: {str(e)}")
    except Exception as e:
        import traceback
        print(f"Error checking workflow: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error checking workflow: {str(e)}")
    
    # Check access: user must be owner of at least one workspace the workflow belongs to, or be a member with edit access
    # If workflow has no workspaces, allow access to any authenticated user (independent workflow)
    has_access = False
    try:
        # Load workspaces with selectinload to check access
        workflow_result_with_workspaces = await db.execute(
            select(Workflow).options(
                selectinload(Workflow.workspaces)
            ).where(Workflow.id == uuid.UUID(workflow_id))
        )
        workflow_with_workspaces = workflow_result_with_workspaces.scalar_one_or_none()
        
        if workflow_with_workspaces and workflow_with_workspaces.workspaces and len(workflow_with_workspaces.workspaces) > 0:
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
    except Exception as e:
        import traceback
        print(f"Error checking access: {str(e)}\n{traceback.format_exc()}")
        # On error, allow access for independent workflows (fail open for now)
        has_access = True
    
    if not has_access:
        raise HTTPException(status_code=403, detail="Access denied")
    
    try:
        # Check node exists
        node_result = await db.execute(
            select(WorkflowNode).where(WorkflowNode.id == uuid.UUID(node_id))
        )
        node = node_result.scalar_one_or_none()
        
        if not node:
            raise HTTPException(status_code=404, detail=f"Node not found: {node_id}")
        
        if str(node.workflow_id) != workflow_id:
            raise HTTPException(
                status_code=400, 
                detail=f"Node {node_id} does not belong to workflow {workflow_id}. Node belongs to workflow {node.workflow_id}"
            )
        
        # Validate file type - check if node module type requires specific file types
        # For file_uploader module, allow all file types (validation is done in the module)
        # For other modules like excel_to_numeric, validate Excel files
        # For outlier_remover_duckdb, validate DuckDB files
        node_module_type = getattr(node, 'module_type', None)
        if not node_module_type:
            raise HTTPException(
                status_code=400, 
                detail="Node module_type is not set. Cannot determine file type validation rules."
            )
        
        # Validate file object
        if not file:
            raise HTTPException(status_code=400, detail="No file provided in request")
        
        print(f"DEBUG: Node module_type: {node_module_type}, filename: {file.filename}, content_type: {getattr(file, 'content_type', 'unknown')}")
        
        if node_module_type != 'file_uploader':
            if node_module_type == 'outlier_remover_duckdb' or node_module_type == 'duckdb2jmp':
                # For DuckDB modules, validate DuckDB files only
                if not file.filename or not file.filename.lower().endswith('.duckdb'):
                    raise HTTPException(status_code=400, detail=f"Only DuckDB files (.duckdb) are allowed for module type '{node_module_type}'. Received file: {file.filename}")
            else:
                # For other non-file-uploader modules, validate Excel files only
                if not file.filename:
                    raise HTTPException(status_code=400, detail="No filename provided")
                if not file.filename.lower().endswith(('.xlsx', '.xls')):
                    raise HTTPException(
                        status_code=400, 
                        detail=f"Only Excel files (.xlsx, .xls) are allowed for module type '{node_module_type}'. Use file_uploader module for other file types. Received file: {file.filename}"
                    )
        
        # Read file content
        try:
            content = await file.read()
        except Exception as e:
            import traceback
            print(f"Error reading file content: {str(e)}\n{traceback.format_exc()}")
            raise HTTPException(status_code=400, detail=f"Failed to read file content: {str(e)}")
        
        # Check if file is empty
        if len(content) == 0:
            raise HTTPException(status_code=400, detail="Uploaded file is empty")
        
        # Check file size (500MB max for DuckDB modules, 200MB for duckdb_convert, 50MB for others)
        if node_module_type == 'outlier_remover_duckdb' or node_module_type == 'duckdb2jmp':
            max_size = 500 * 1024 * 1024
        elif node_module_type == 'duckdb_convert':
            max_size = 200 * 1024 * 1024
        else:
            max_size = 50 * 1024 * 1024
        if len(content) > max_size:
            file_size_mb = len(content) / (1024 * 1024)
            max_size_mb = max_size / (1024 * 1024)
            raise HTTPException(
                status_code=400, 
                detail=f"File size ({file_size_mb:.2f} MB) exceeds limit of {max_size_mb} MB"
            )
        
        # Ensure workflow folder structure exists: workflows/{workflow_id}
        workflow_path = local_storage.get_workflow_path(workflow_id)
        workflow_path.mkdir(parents=True, exist_ok=True)
        print(f"Upload: Workflow folder exists: {workflow_path} (exists: {workflow_path.exists()})")
        
        # Ensure node folder structure exists: workflows/{workflow_id}/nodes/{node_id}/input, wip, output
        node_path = local_storage.get_workflow_node_path(workflow_id, node_id)
        # get_workflow_node_path already creates the folders, but we ensure they exist explicitly
        (node_path / "input").mkdir(parents=True, exist_ok=True)
        (node_path / "wip").mkdir(parents=True, exist_ok=True)
        (node_path / "output").mkdir(parents=True, exist_ok=True)
        print(f"Upload: Node folder structure: {node_path}")
        print(f"  - Input folder: {node_path / 'input'} (exists: {(node_path / 'input').exists()})")
        print(f"  - WIP folder: {node_path / 'wip'} (exists: {(node_path / 'wip').exists()})")
        print(f"  - Output folder: {node_path / 'output'} (exists: {(node_path / 'output').exists()})")
        
        # Generate UUID for filename and preserve file extension
        file_uuid = str(uuid.uuid4())
        original_filename = file.filename or "unknown"
        file_extension = ""
        if "." in original_filename:
            file_extension = "." + original_filename.rsplit(".", 1)[1].lower()
        
        # Save file with UUID name
        uuid_filename = f"{file_uuid}{file_extension}"
        storage_key = f"workflows/{workflow_id}/nodes/{node_id}/input/{uuid_filename}"
        
        # Save file
        try:
            file_path = local_storage.save_file(content, storage_key)
        except Exception as e:
            import traceback
            print(f"Error saving file: {str(e)}\n{traceback.format_exc()}")
            raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")
        
        # Create metadata JSON file
        try:
            upload_time = datetime.now(timezone.utc).isoformat()
            file_type = file_extension.lstrip(".") if file_extension else "unknown"
            
            metadata = {
                "original_filename": original_filename,
                "file_type": file_type,
                "uploaded_time": upload_time,
                "workflow_id": workflow_id,
                "node_id": node_id,
                "uuid_filename": uuid_filename,
                "file_size": len(content)
            }
            
            # Save metadata JSON file alongside the uploaded file
            metadata_filename = f"{file_uuid}_metadata.json"
            metadata_storage_key = f"workflows/{workflow_id}/nodes/{node_id}/input/{metadata_filename}"
            metadata_json = json.dumps(metadata, indent=2)
            metadata_path = local_storage.save_file(metadata_json.encode('utf-8'), metadata_storage_key)
            print(f"Saved metadata file: {metadata_path}")
        except Exception as e:
            import traceback
            print(f"Error saving metadata file: {str(e)}\n{traceback.format_exc()}")
            # Don't fail the upload if metadata save fails, just log it
        
        # Read Excel file to get available sheets (only for Excel-based modules)
        available_sheets = []
        if node_module_type != 'file_uploader' and node_module_type != 'outlier_remover_duckdb' and node_module_type != 'duckdb2jmp':
            try:
                # Reset file pointer if needed
                excel_file = io.BytesIO(content)
                xl_file = pd.ExcelFile(excel_file, engine='openpyxl')
                available_sheets = xl_file.sheet_names
                xl_file.close()
            except Exception as e:
                import traceback
                error_msg = f"Failed to read Excel file: {str(e)}"
                print(f"Error reading Excel file: {error_msg}\n{traceback.format_exc()}")
                # Check if it's a file format issue
                if "not a zip file" in str(e).lower() or "badzipfile" in str(e).lower():
                    raise HTTPException(
                        status_code=400, 
                        detail=f"Invalid Excel file format. The file may be corrupted or not a valid Excel file. Error: {str(e)}"
                    )
                raise HTTPException(status_code=400, detail=error_msg)
        
        # Update node config with file info
        try:
            if not node.config:
                node.config = {}
            node.config["file_key"] = storage_key
            node.config["filename"] = file.filename
            if available_sheets:
                node.config["available_sheets"] = available_sheets
                if not node.config.get("sheet_name") and available_sheets:
                    node.config["sheet_name"] = available_sheets[0]  # Auto-select first sheet
            
            await db.commit()
            await db.refresh(node)
        except Exception as e:
            await db.rollback()
            import traceback
            print(f"Error updating node config: {str(e)}\n{traceback.format_exc()}")
            raise HTTPException(status_code=500, detail=f"Failed to update node config: {str(e)}")
        
        # Save workflow JSON to file
        try:
            await save_workflow_json_to_file(workflow_id, db)
        except Exception as e:
            # Log error but don't fail the upload if JSON save fails
            import logging
            logging.error(f"Failed to save workflow JSON: {str(e)}")
        
        return {
            "storage_key": storage_key,
            "filename": file.filename,
            "available_sheets": available_sheets
        }
    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except ValueError as e:
        # Invalid UUID format
        raise HTTPException(status_code=400, detail=f"Invalid node ID format: {str(e)}")
    except Exception as e:
        # Catch any other unexpected errors
        import traceback
        print(f"Unexpected error in upload_workflow_node_file: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


# Node folder listing endpoint
@router.get("/workflows/{workflow_id}/nodes/{node_id}/files")
async def list_node_files(
    workflow_id: str,
    node_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user)
):
    """List files in a node's folder (input, wip, output)"""
    try:
        # Check workflow exists
        workflow_result = await db.execute(
            select(Workflow).where(Workflow.id == uuid.UUID(workflow_id))
        )
        workflow = workflow_result.scalar_one_or_none()
        
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid workflow ID format: {str(e)}")
    except Exception as e:
        import traceback
        print(f"Error checking workflow: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error checking workflow: {str(e)}")
    
    # Check access
    has_access = False
    try:
        workflow_result_with_workspaces = await db.execute(
            select(Workflow).options(
                selectinload(Workflow.workspaces)
            ).where(Workflow.id == uuid.UUID(workflow_id))
        )
        workflow_with_workspaces = workflow_result_with_workspaces.scalar_one_or_none()
        
        if workflow_with_workspaces and workflow_with_workspaces.workspaces and len(workflow_with_workspaces.workspaces) > 0:
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
            has_access = True
    except Exception as e:
        import traceback
        print(f"Error checking access: {str(e)}\n{traceback.format_exc()}")
        has_access = True
    
    if not has_access:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Check node exists
    try:
        node_result = await db.execute(
            select(WorkflowNode).where(WorkflowNode.id == uuid.UUID(node_id))
        )
        node = node_result.scalar_one_or_none()
        
        if not node or str(node.workflow_id) != workflow_id:
            raise HTTPException(status_code=404, detail="Node not found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid node ID format: {str(e)}")
    except Exception as e:
        import traceback
        print(f"Error checking node: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error checking node: {str(e)}")
    
    # Get node folder path
    try:
        node_path = local_storage.get_workflow_node_path(workflow_id, node_id)
        
        # List files in each subfolder
        folders = {}
        for subfolder in ['input', 'wip', 'output']:
            subfolder_path = node_path / subfolder
            files = []
            if subfolder_path.exists() and subfolder_path.is_dir():
                for file_path in subfolder_path.iterdir():
                    if file_path.is_file():
                        stat = file_path.stat()
                        file_info = {
                            "name": file_path.name,
                            "size": stat.st_size,
                            "modified": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
                            "path": str(file_path.relative_to(local_storage.base_path))
                        }
                        
                        # If this is a metadata JSON file, skip it (we'll attach metadata to the actual file)
                        if file_path.name.endswith('_metadata.json'):
                            continue
                        
                        # Try to load metadata from corresponding JSON file
                        metadata_file = subfolder_path / f"{file_path.stem}_metadata.json"
                        if metadata_file.exists():
                            try:
                                with open(metadata_file, 'r', encoding='utf-8') as f:
                                    metadata = json.load(f)
                                    file_info["metadata"] = metadata
                            except Exception as e:
                                print(f"Error reading metadata file {metadata_file}: {str(e)}")
                        
                        files.append(file_info)
            folders[subfolder] = sorted(files, key=lambda x: x.get('metadata', {}).get('uploaded_time', x['modified']), reverse=True)
        
        return {
            "workflow_id": workflow_id,
            "node_id": node_id,
            "node_path": str(node_path.relative_to(local_storage.base_path)),
            "folders": folders
        }
    except Exception as e:
        import traceback
        print(f"Error listing node files: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error listing node files: {str(e)}")


# Clear node folder files endpoint
@router.delete("/workflows/{workflow_id}/nodes/{node_id}/files")
async def clear_node_files(
    workflow_id: str,
    node_id: str,
    folder: Optional[str] = Query(None, description="Folder to clear: 'input', 'wip', 'output', or None for all"),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user)
):
    """Clear files in a node's folder (input, wip, output, or all)"""
    try:
        # Check workflow exists
        workflow_result = await db.execute(
            select(Workflow).where(Workflow.id == uuid.UUID(workflow_id))
        )
        workflow = workflow_result.scalar_one_or_none()
        
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid workflow ID format: {str(e)}")
    except Exception as e:
        import traceback
        print(f"Error checking workflow: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error checking workflow: {str(e)}")
    
    # Check access
    has_access = False
    try:
        workflow_result_with_workspaces = await db.execute(
            select(Workflow).options(
                selectinload(Workflow.workspaces)
            ).where(Workflow.id == uuid.UUID(workflow_id))
        )
        workflow_with_workspaces = workflow_result_with_workspaces.scalar_one_or_none()
        
        if workflow_with_workspaces and workflow_with_workspaces.workspaces and len(workflow_with_workspaces.workspaces) > 0:
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
            has_access = True
    except Exception as e:
        import traceback
        print(f"Error checking access: {str(e)}\n{traceback.format_exc()}")
        has_access = True
    
    if not has_access:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Check node exists
    try:
        node_result = await db.execute(
            select(WorkflowNode).where(WorkflowNode.id == uuid.UUID(node_id))
        )
        node = node_result.scalar_one_or_none()
        
        if not node or str(node.workflow_id) != workflow_id:
            raise HTTPException(status_code=404, detail="Node not found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid node ID format: {str(e)}")
    except Exception as e:
        import traceback
        print(f"Error checking node: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error checking node: {str(e)}")
    
    # Clear files in specified folder(s)
    try:
        node_path = local_storage.get_workflow_node_path(workflow_id, node_id)
        
        folders_to_clear = [folder] if folder and folder in ['input', 'wip', 'output'] else ['input', 'wip', 'output']
        deleted_files = []
        errors = []
        
        for subfolder in folders_to_clear:
            subfolder_path = node_path / subfolder
            if subfolder_path.exists() and subfolder_path.is_dir():
                for file_path in subfolder_path.iterdir():
                    if file_path.is_file():
                        try:
                            file_path.unlink()
                            deleted_files.append({
                                "name": file_path.name,
                                "folder": subfolder,
                                "path": str(file_path.relative_to(local_storage.base_path))
                            })
                        except Exception as e:
                            errors.append({
                                "name": file_path.name,
                                "folder": subfolder,
                                "error": str(e)
                            })
        
        return {
            "workflow_id": workflow_id,
            "node_id": node_id,
            "folders_cleared": folders_to_clear,
            "deleted_files": deleted_files,
            "deleted_count": len(deleted_files),
            "errors": errors if errors else None
        }
    except Exception as e:
        import traceback
        print(f"Error clearing node files: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error clearing node files: {str(e)}")


# Delete single file endpoint
@router.delete("/workflows/{workflow_id}/nodes/{node_id}/files/{file_path:path}")
async def delete_node_file(
    workflow_id: str,
    node_id: str,
    file_path: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user)
):
    """Delete a single file from a node's folder (input, wip, or output)."""
    try:
        # Check workflow exists
        workflow_result = await db.execute(
            select(Workflow).where(Workflow.id == uuid.UUID(workflow_id))
        )
        workflow = workflow_result.scalar_one_or_none()
        
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid workflow ID format: {str(e)}")
    except Exception as e:
        import traceback
        print(f"Error checking workflow: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error checking workflow: {str(e)}")
    
    # Check access
    has_access = False
    try:
        workflow_result_with_workspaces = await db.execute(
            select(Workflow).options(
                selectinload(Workflow.workspaces)
            ).where(Workflow.id == uuid.UUID(workflow_id))
        )
        workflow_with_workspaces = workflow_result_with_workspaces.scalar_one_or_none()
        
        if workflow_with_workspaces:
            # Check if user has access through workspaces
            if workflow_with_workspaces.workspaces:
                for workspace in workflow_with_workspaces.workspaces:
                    workspace_result = await db.execute(
                        select(Workspace).where(Workspace.id == workspace.id)
                    )
                    ws = workspace_result.scalar_one_or_none()
                    if ws and current_user:
                        # Check if user is owner or has access
                        if ws.owner_id == current_user.id:
                            has_access = True
                            break
                        # Check workspace members
                        members_result = await db.execute(
                            select(WorkspaceMember).where(
                                WorkspaceMember.workspace_id == ws.id,
                                WorkspaceMember.user_id == current_user.id
                            )
                        )
                        if members_result.scalar_one_or_none():
                            has_access = True
                            break
            else:
                # If workflow has no workspaces, allow access (workflow can be standalone)
                has_access = True
    except Exception as e:
        import traceback
        print(f"Error checking access: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error checking access: {str(e)}")
    
    if not has_access:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Check node exists
    try:
        node_result = await db.execute(
            select(WorkflowNode).where(WorkflowNode.id == uuid.UUID(node_id))
        )
        node = node_result.scalar_one_or_none()
        
        if not node or str(node.workflow_id) != workflow_id:
            raise HTTPException(status_code=404, detail="Node not found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid node ID format: {str(e)}")
    except Exception as e:
        import traceback
        print(f"Error checking node: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error checking node: {str(e)}")
    
    # Delete the file
    try:
        node_path = local_storage.get_workflow_node_path(workflow_id, node_id)
        
        # Construct full file path - file_path should be relative to node folder (e.g., "input/filename.duckdb")
        full_file_path = node_path / file_path
        
        # Security check: ensure the file is within the node folder
        try:
            full_file_path.resolve().relative_to(node_path.resolve())
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid file path: file must be within node folder")
        
        if not full_file_path.exists():
            raise HTTPException(status_code=404, detail="File not found")
        
        if not full_file_path.is_file():
            raise HTTPException(status_code=400, detail="Path is not a file")
        
        # Delete the file
        full_file_path.unlink()
        
        return {
            "workflow_id": workflow_id,
            "node_id": node_id,
            "file_path": file_path,
            "deleted": True
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"Error deleting file: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error deleting file: {str(e)}")


# Execute single node endpoint
@router.post("/workflows/{workflow_id}/nodes/{node_id}/execute")
async def execute_node(
    workflow_id: str,
    node_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user)
):
    """Execute a single node: examine input files, validate, and move to output"""
    try:
        # Check workflow exists
        workflow_result = await db.execute(
            select(Workflow).where(Workflow.id == uuid.UUID(workflow_id))
        )
        workflow = workflow_result.scalar_one_or_none()
        
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid workflow ID format: {str(e)}")
    except Exception as e:
        import traceback
        print(f"Error checking workflow: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error checking workflow: {str(e)}")
    
    # Check access
    has_access = False
    try:
        workflow_result_with_workspaces = await db.execute(
            select(Workflow).options(
                selectinload(Workflow.workspaces)
            ).where(Workflow.id == uuid.UUID(workflow_id))
        )
        workflow_with_workspaces = workflow_result_with_workspaces.scalar_one_or_none()
        
        if workflow_with_workspaces and workflow_with_workspaces.workspaces and len(workflow_with_workspaces.workspaces) > 0:
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
            has_access = True
    except Exception as e:
        import traceback
        print(f"Error checking access: {str(e)}\n{traceback.format_exc()}")
        has_access = True
    
    if not has_access:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Check node exists
    try:
        node_result = await db.execute(
            select(WorkflowNode).where(WorkflowNode.id == uuid.UUID(node_id))
        )
        node = node_result.scalar_one_or_none()
        
        if not node or str(node.workflow_id) != workflow_id:
            raise HTTPException(status_code=404, detail="Node not found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid node ID format: {str(e)}")
    except Exception as e:
        import traceback
        print(f"Error checking node: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error checking node: {str(e)}")
    
    # Execute node: examine input files, validate, and move to output
    try:
        node_path = local_storage.get_workflow_node_path(workflow_id, node_id)
        input_path = node_path / "input"
        output_path = node_path / "output"
        
        # Get node config for validation rules
        node_config = node.config or {}
        allowed_types = node_config.get("allowed_types", [])
        max_size = node_config.get("max_size", 50 * 1024 * 1024)  # Default 50MB
        
        processed_files = []
        errors = []
        
        # Examine and process files in input folder
        if input_path.exists() and input_path.is_dir():
            for file_path in input_path.iterdir():
                if file_path.is_file():
                    try:
                        # Get file info
                        stat = file_path.stat()
                        filename = file_path.name
                        file_size = stat.st_size
                        file_extension = file_path.suffix.lower().lstrip('.')
                        
                        # Validate file size
                        if max_size and file_size > max_size:
                            errors.append({
                                "filename": filename,
                                "error": f"File size ({file_size} bytes) exceeds maximum allowed size ({max_size} bytes)"
                            })
                            continue
                        
                        # Validate file type if specified
                        if allowed_types:
                            if file_extension not in [ext.lower().lstrip('.') for ext in allowed_types]:
                                errors.append({
                                    "filename": filename,
                                    "error": f"File type '{file_extension}' is not allowed. Allowed types: {', '.join(allowed_types)}"
                                })
                                continue
                        
                        # Move file to output folder
                        output_file_path = output_path / filename
                        shutil.move(str(file_path), str(output_file_path))
                        
                        processed_files.append({
                            "filename": filename,
                            "size": file_size,
                            "type": file_extension,
                            "input_path": str(file_path.relative_to(local_storage.base_path)),
                            "output_path": str(output_file_path.relative_to(local_storage.base_path))
                        })
                    except Exception as e:
                        errors.append({
                            "filename": file_path.name,
                            "error": str(e)
                        })
        
        return {
            "workflow_id": workflow_id,
            "node_id": node_id,
            "processed_files": processed_files,
            "processed_count": len(processed_files),
            "errors": errors if errors else None,
            "summary": {
                "total_files": len(processed_files) + len(errors),
                "successful": len(processed_files),
                "failed": len(errors),
                "total_size": sum(f["size"] for f in processed_files)
            }
        }
    except Exception as e:
        import traceback
        print(f"Error executing node: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error executing node: {str(e)}")


# Execute DuckDB node endpoint
@router.post("/workflows/{workflow_id}/nodes/{node_id}/execute-duckdb")
async def execute_duckdb_node(
    workflow_id: str,
    node_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user)
):
    """Execute DuckDB node: collect files from input nodes, convert Excel to DuckDB"""
    try:
        # Check workflow exists
        workflow_result = await db.execute(
            select(Workflow).where(Workflow.id == uuid.UUID(workflow_id))
        )
        workflow = workflow_result.scalar_one_or_none()
        
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid workflow ID format: {str(e)}")
    except Exception as e:
        import traceback
        print(f"Error checking workflow: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error checking workflow: {str(e)}")
    
    # Check access
    has_access = False
    try:
        workflow_result_with_workspaces = await db.execute(
            select(Workflow).options(
                selectinload(Workflow.workspaces)
            ).where(Workflow.id == uuid.UUID(workflow_id))
        )
        workflow_with_workspaces = workflow_result_with_workspaces.scalar_one_or_none()
        
        if workflow_with_workspaces and workflow_with_workspaces.workspaces and len(workflow_with_workspaces.workspaces) > 0:
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
            has_access = True
    except Exception as e:
        import traceback
        print(f"Error checking access: {str(e)}\n{traceback.format_exc()}")
        has_access = True
    
    if not has_access:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Check node exists and is DuckDB node
    try:
        node_result = await db.execute(
            select(WorkflowNode).where(WorkflowNode.id == uuid.UUID(node_id))
        )
        node = node_result.scalar_one_or_none()
        
        if not node or str(node.workflow_id) != workflow_id:
            raise HTTPException(status_code=404, detail="Node not found")
        
        if node.module_type != "duckdb_convert":
            raise HTTPException(status_code=400, detail="Node is not a DuckDB convert node")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid node ID format: {str(e)}")
    except Exception as e:
        import traceback
        print(f"Error checking node: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error checking node: {str(e)}")
    
    # Execute DuckDB node
    try:
        import duckdb
        from pathlib import Path
        
        # Get node paths
        duckdb_node_path = local_storage.get_workflow_node_path(workflow_id, node_id)
        duckdb_input_path = duckdb_node_path / "input"
        duckdb_output_path = duckdb_node_path / "output"
        
        # Ensure directories exist
        duckdb_input_path.mkdir(parents=True, exist_ok=True)
        duckdb_output_path.mkdir(parents=True, exist_ok=True)
        
        # Send initial progress via WebSocket
        try:
            await publish_workflow_update(workflow_id, {
                "type": "node_conversion_progress",
                "workflow_id": workflow_id,
                "node_id": node_id,
                "status": "processing",
                "progress": 0,
                "message": "Starting conversion..."
            })
        except Exception as e:
            print(f"Warning: Could not publish WebSocket progress update: {e}")
        
        # Send progress update
        try:
            await publish_workflow_update(workflow_id, {
                "type": "node_conversion_progress",
                "workflow_id": workflow_id,
                "node_id": node_id,
                "status": "processing",
                "progress": 5,
                "message": "Collecting input files..."
            })
        except Exception as e:
            print(f"Warning: Could not publish WebSocket progress update: {e}")
        
        # Get all input connections to this node
        connections_result = await db.execute(
            select(WorkflowConnection).where(
                and_(
                    WorkflowConnection.workflow_id == uuid.UUID(workflow_id),
                    WorkflowConnection.target_node_id == uuid.UUID(node_id)
                )
            )
        )
        connections = connections_result.scalars().all()
        
        # Collect files from input nodes' output folders
        collected_files = []
        try:
            await publish_workflow_update(workflow_id, {
                "type": "node_conversion_progress",
                "workflow_id": workflow_id,
                "node_id": node_id,
                "status": "processing",
                "progress": 10,
                "message": "Collecting files from input nodes..."
            })
        except Exception as e:
            print(f"Warning: Could not publish WebSocket progress update: {e}")
        for conn in connections:
            source_node_id = str(conn.source_node_id)
            source_node_path = local_storage.get_workflow_node_path(workflow_id, source_node_id)
            source_output_path = source_node_path / "output"
            
            if source_output_path.exists() and source_output_path.is_dir():
                for file_path in source_output_path.iterdir():
                    if file_path.is_file():
                        # Copy file to DuckDB node's input folder
                        dest_path = duckdb_input_path / file_path.name
                        shutil.copy2(str(file_path), str(dest_path))
                        collected_files.append({
                            "filename": file_path.name,
                            "source_node": source_node_id,
                            "size": file_path.stat().st_size
                        })
        
        # Create timestamped DuckDB filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        db_filename = f"excel2duckdb_{timestamp}.duckdb"
        db_path = duckdb_output_path / db_filename
        
        try:
            await publish_workflow_update(workflow_id, {
                "type": "node_conversion_progress",
                "workflow_id": workflow_id,
                "node_id": node_id,
                "status": "processing",
                "progress": 15,
                "message": "Scanning input folder..."
            })
        except Exception as e:
            print(f"Warning: Could not publish WebSocket progress update: {e}")
        
        # Convert Excel files to DuckDB
        converted_tables = []
        errors = []
        
        # Also check for files already in the input folder (not just from upstream nodes)
        # This handles cases where files were uploaded directly to the DuckDB node
        # Also collect metadata from input files
        input_files_metadata = []
        if duckdb_input_path.exists() and duckdb_input_path.is_dir():
            for file_path in duckdb_input_path.iterdir():
                if file_path.is_file() and not file_path.name.endswith('_metadata.json'):
                    # Check if file is already in collected_files
                    if file_path.name not in [f["filename"] for f in collected_files]:
                        # File already exists in input folder, add to collected_files
                        collected_files.append({
                            "filename": file_path.name,
                            "source_node": "local",
                            "size": file_path.stat().st_size
                        })
                    
                    # Try to get metadata for this input file
                    file_metadata = {
                        "uuid_filename": file_path.name,
                        "file_path": str(file_path.relative_to(local_storage.base_path)),
                        "file_size": file_path.stat().st_size
                    }
                    
                    # Look for metadata JSON file
                    metadata_file = duckdb_input_path / f"{file_path.stem}_metadata.json"
                    if metadata_file.exists():
                        try:
                            with open(metadata_file, 'r', encoding='utf-8') as f:
                                input_metadata = json.load(f)
                                file_metadata["original_filename"] = input_metadata.get("original_filename", file_path.name)
                                file_metadata["file_type"] = input_metadata.get("file_type", "unknown")
                                file_metadata["uploaded_time"] = input_metadata.get("uploaded_time")
                                file_metadata["input_node_id"] = input_metadata.get("node_id")
                                file_metadata["input_workflow_id"] = input_metadata.get("workflow_id")
                        except Exception as e:
                            print(f"Error reading metadata file {metadata_file}: {str(e)}")
                            file_metadata["original_filename"] = file_path.name
                    else:
                        file_metadata["original_filename"] = file_path.name
                    
                    input_files_metadata.append(file_metadata)
        
        try:
            await publish_workflow_update(workflow_id, {
                "type": "node_conversion_progress",
                "workflow_id": workflow_id,
                "node_id": node_id,
                "status": "processing",
                "progress": 20,
                "message": "Connecting to DuckDB..."
            })
        except Exception as e:
            print(f"Warning: Could not publish WebSocket progress update: {e}")
        
        # Connect to DuckDB database
        conn = duckdb.connect(str(db_path))
        
        try:
            # Check if there are any files to process
            input_files = list(duckdb_input_path.iterdir()) if duckdb_input_path.exists() else []
            # Filter out metadata files
            input_files = [f for f in input_files if f.is_file() and not f.name.endswith('_metadata.json')]
            
            if not input_files:
                return {
                    "workflow_id": workflow_id,
                    "node_id": node_id,
                    "collected_files": collected_files,
                    "converted_tables": [],
                    "db_path": str(db_path.relative_to(local_storage.base_path)),
                    "errors": [{"filename": "N/A", "error": "No files found in input folder"}],
                    "summary": {
                        "files_collected": len(collected_files),
                        "tables_created": 0,
                        "errors": 1
                    }
                }
            
            total_files = len(input_files)
            try:
                await publish_workflow_update(workflow_id, {
                    "type": "node_conversion_progress",
                    "workflow_id": workflow_id,
                    "node_id": node_id,
                    "status": "processing",
                    "progress": 25,
                    "message": f"Processing {total_files} file(s)..."
                })
            except Exception as e:
                print(f"Warning: Could not publish WebSocket progress update: {e}")
            
            for file_idx, file_path in enumerate(input_files):
                if file_path.is_file():
                    filename = file_path.name
                    file_ext = file_path.suffix.lower()
                    
                    # Update progress for current file
                    file_progress = 25 + int((file_idx / total_files) * 70) if total_files > 0 else 25
                    try:
                        await publish_workflow_update(workflow_id, {
                            "type": "node_conversion_progress",
                            "workflow_id": workflow_id,
                            "node_id": node_id,
                            "status": "processing",
                            "progress": file_progress,
                            "message": f"Processing file {file_idx + 1}/{total_files}: {filename}..."
                        })
                    except Exception as e:
                        print(f"Warning: Could not publish WebSocket progress update: {e}")
                    
                    try:
                        if file_ext in ['.xlsx', '.xls']:
                            print(f"Processing Excel file: {filename}")
                            # Read Excel file
                            excel_file = pd.ExcelFile(file_path, engine='openpyxl')
                            
                            print(f"Found {len(excel_file.sheet_names)} sheet(s) in {filename}: {excel_file.sheet_names}")
                            
                            total_sheets = len(excel_file.sheet_names)
                            # Read all sheets
                            for sheet_idx, sheet_name in enumerate(excel_file.sheet_names):
                                # Update progress for current sheet
                                sheet_progress = file_progress + int(((sheet_idx + 1) / total_sheets) * (70 / total_files)) if total_sheets > 0 else file_progress
                                try:
                                    await publish_workflow_update(workflow_id, {
                                        "type": "node_conversion_progress",
                                        "workflow_id": workflow_id,
                                        "node_id": node_id,
                                        "status": "processing",
                                        "progress": min(sheet_progress, 95),
                                        "message": f"Processing {filename} - Sheet {sheet_idx + 1}/{total_sheets}: {sheet_name}..."
                                    })
                                except Exception as e:
                                    print(f"Warning: Could not publish WebSocket progress update: {e}")
                                try:
                                    df = pd.read_excel(excel_file, sheet_name=sheet_name)
                                    print(f"Read sheet '{sheet_name}' with {len(df)} rows and {len(df.columns)} columns")
                                    
                                    # Skip empty DataFrames
                                    if df.empty:
                                        print(f"Skipping empty sheet '{sheet_name}' in {filename}")
                                        continue
                                    
                                    # Convert sheet name to valid SQL table name
                                    # Sanitize: lowercase, replace spaces/hyphens/dots with underscores
                                    table_name = (
                                        sheet_name.lower()
                                        .replace(" ", "_")
                                        .replace("-", "_")
                                        .replace(".", "_")
                                    )
                                    # Remove any remaining invalid characters
                                    import re
                                    table_name = re.sub(r'[^a-z0-9_]', '_', table_name)
                                    # Remove multiple consecutive underscores
                                    table_name = re.sub(r'_+', '_', table_name)
                                    # Remove leading/trailing underscores
                                    table_name = table_name.strip('_')
                                    # Ensure it starts with a letter or underscore
                                    if table_name and not table_name[0].isalpha() and table_name[0] != '_':
                                        table_name = '_' + table_name
                                    # Ensure it's not empty
                                    if not table_name:
                                        table_name = 'sheet'
                                    
                                    # Ensure unique table name within this conversion
                                    original_table_name = table_name
                                    counter = 1
                                    existing_tables = [t["table_name"] for t in converted_tables]
                                    while table_name in existing_tables:
                                        table_name = f"{original_table_name}_{counter}"
                                        counter += 1
                                    
                                    print(f"Creating table '{table_name}' from sheet '{sheet_name}'")
                                    
                                    # Register DataFrame and write to DuckDB (will replace the table if it exists)
                                    conn.register('temp_df', df)
                                    conn.execute(f"CREATE OR REPLACE TABLE {table_name} AS SELECT * FROM temp_df")
                                    conn.unregister('temp_df')
                                    
                                    # Verify table was created
                                    table_check = conn.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()
                                    row_count = table_check[0] if table_check else 0
                                    print(f"Table '{table_name}' created with {row_count} rows")
                                    
                                    converted_tables.append({
                                        "table_name": table_name,
                                        "source_file": filename,
                                        "sheet": sheet_name,
                                        "rows": len(df),
                                        "columns": list(df.columns)
                                    })
                                except Exception as e:
                                    error_msg = f"Error processing sheet '{sheet_name}': {str(e)}"
                                    print(error_msg)
                                    errors.append({
                                        "filename": filename,
                                        "sheet": sheet_name,
                                        "error": error_msg
                                    })
                            
                            excel_file.close()
                        else:
                            errors.append({
                                "filename": filename,
                                "error": f"Unsupported file type: {file_ext}. Only .xlsx and .xls files are supported."
                            })
                    except Exception as e:
                        import traceback
                        error_msg = f"Error processing file {filename}: {str(e)}"
                        print(f"{error_msg}\n{traceback.format_exc()}")
                        errors.append({
                            "filename": filename,
                            "error": error_msg
                        })
        
        finally:
            conn.close()
        
        try:
            await publish_workflow_update(workflow_id, {
                "type": "node_conversion_progress",
                "workflow_id": workflow_id,
                "node_id": node_id,
                "status": "processing",
                "progress": 95,
                "message": "Creating metadata file..."
            })
        except Exception as e:
            print(f"Warning: Could not publish WebSocket progress update: {e}")
        
        # Create metadata JSON file for the output DuckDB file
        try:
            output_metadata = {
                "output_filename": db_filename,
                "original_db_filename": db_filename,
                "file_type": "duckdb",
                "created_time": datetime.now(timezone.utc).isoformat(),
                "workflow_id": workflow_id,
                "node_id": node_id,
                "module_type": "duckdb_convert",
                "db_path": str(db_path.relative_to(local_storage.base_path)),
                "file_size": db_path.stat().st_size if db_path.exists() else 0,
                "input_files": input_files_metadata,
                "converted_tables": converted_tables,
                "summary": {
                    "files_collected": len(collected_files),
                    "tables_created": len(converted_tables),
                    "errors": len(errors)
                },
                "errors": errors if errors else None
            }
            
            # Save metadata JSON file alongside the DuckDB file
            metadata_filename = f"{db_filename}_metadata.json"
            metadata_path = duckdb_output_path / metadata_filename
            with open(metadata_path, 'w', encoding='utf-8') as f:
                json.dump(output_metadata, f, indent=2)
            print(f"Saved output metadata file: {metadata_path}")
        except Exception as e:
            import traceback
            print(f"Error saving output metadata file: {str(e)}\n{traceback.format_exc()}")
            # Don't fail the conversion if metadata save fails, just log it
        
        # Mark conversion as completed via WebSocket
        try:
            await publish_workflow_update(workflow_id, {
                "type": "node_conversion_progress",
                "workflow_id": workflow_id,
                "node_id": node_id,
                "status": "completed",
                "progress": 100,
                "message": "Conversion completed successfully"
            })
        except Exception as e:
            print(f"Warning: Could not publish WebSocket progress update: {e}")
        
        return {
            "workflow_id": workflow_id,
            "node_id": node_id,
            "collected_files": collected_files,
            "converted_tables": converted_tables,
            "db_path": str(db_path.relative_to(local_storage.base_path)),
            "errors": errors if errors else None,
            "summary": {
                "files_collected": len(collected_files),
                "tables_created": len(converted_tables),
                "errors": len(errors)
            }
        }
    except Exception as e:
        import traceback
        print(f"Error executing DuckDB node: {str(e)}\n{traceback.format_exc()}")
        # Mark progress as error via WebSocket
        try:
            await publish_workflow_update(workflow_id, {
                "type": "node_conversion_progress",
                "workflow_id": workflow_id,
                "node_id": node_id,
                "status": "error",
                "progress": 0,
                "message": f"Error executing DuckDB node: {str(e)}"
            })
        except Exception as ws_error:
            print(f"Warning: Could not publish WebSocket error update: {ws_error}")
        raise HTTPException(status_code=500, detail=f"Error executing DuckDB node: {str(e)}")


# Get DuckDB tables endpoint
@router.get("/workflows/{workflow_id}/nodes/{node_id}/duckdb-tables")
async def get_duckdb_tables(
    workflow_id: str,
    node_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user)
):
    """Get all tables from DuckDB database"""
    try:
        # Check workflow and node (similar access checks as above)
        workflow_result = await db.execute(
            select(Workflow).where(Workflow.id == uuid.UUID(workflow_id))
        )
        workflow = workflow_result.scalar_one_or_none()
        
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")
        
        node_result = await db.execute(
            select(WorkflowNode).where(WorkflowNode.id == uuid.UUID(node_id))
        )
        node = node_result.scalar_one_or_none()
        
        if not node or str(node.workflow_id) != workflow_id:
            raise HTTPException(status_code=404, detail="Node not found")
        
        if node.module_type not in ["duckdb_convert", "duckdb2jmp"]:
            raise HTTPException(status_code=400, detail="Node is not a DuckDB module")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid ID format: {str(e)}")
    except Exception as e:
        import traceback
        print(f"Error checking workflow/node: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error checking workflow/node: {str(e)}")
    
    # Get DuckDB database path
    try:
        import duckdb
        
        node_path = local_storage.get_workflow_node_path(workflow_id, node_id)
        
        # For duckdb_convert, look in output folder; for duckdb2jmp, look in input folder
        if node.module_type == "duckdb2jmp":
            search_path = node_path / "input"
        else:
            search_path = node_path / "output"
        
        # Find DuckDB file
        db_files = list(search_path.glob("*.duckdb"))
        
        if not db_files:
            return {
                "workflow_id": workflow_id,
                "node_id": node_id,
                "tables": [],
                "message": f"No DuckDB database file found in {search_path.name} folder"
            }
        
        # Use the first DuckDB file found
        db_path = db_files[0]
        
        # Connect and get tables
        conn = duckdb.connect(str(db_path))
        try:
            # Get all tables
            tables_result = conn.execute("SHOW TABLES").fetchall()
            tables = []
            
            for table_row in tables_result:
                table_name = table_row[0] if table_row else None
                if table_name:
                    # Get table info
                    try:
                        count_result = conn.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()
                        row_count = count_result[0] if count_result else 0
                        
                        # Get column info
                        columns_result = conn.execute(f"DESCRIBE {table_name}").fetchall()
                        columns = [{"name": col[0], "type": col[1]} for col in columns_result]
                        
                        tables.append({
                            "name": table_name,
                            "row_count": row_count,
                            "columns": columns
                        })
                    except Exception as e:
                        tables.append({
                            "name": table_name,
                            "error": str(e)
                        })
            
            return {
                "workflow_id": workflow_id,
                "node_id": node_id,
                "db_path": str(db_path.relative_to(local_storage.base_path)),
                "tables": tables
            }
        finally:
            conn.close()
            
    except Exception as e:
        import traceback
        print(f"Error getting DuckDB tables: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error getting DuckDB tables: {str(e)}")


# Get DuckDB column unique values endpoint
@router.get("/workflows/{workflow_id}/nodes/{node_id}/duckdb-column-unique-values")
async def get_duckdb_column_unique_values(
    workflow_id: str,
    node_id: str,
    column_name: str = Query(..., description="Name of the column to get unique values from"),
    table_name: str = Query(..., description="Name of the table"),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user)
):
    """Get unique values from a DuckDB table column"""
    try:
        # Check workflow and node
        workflow_result = await db.execute(
            select(Workflow).where(Workflow.id == uuid.UUID(workflow_id))
        )
        workflow = workflow_result.scalar_one_or_none()
        
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")
        
        node_result = await db.execute(
            select(WorkflowNode).where(WorkflowNode.id == uuid.UUID(node_id))
        )
        node = node_result.scalar_one_or_none()
        
        if not node or str(node.workflow_id) != workflow_id:
            raise HTTPException(status_code=404, detail="Node not found")
        
        if node.module_type not in ["duckdb_convert", "duckdb2jmp"]:
            raise HTTPException(status_code=400, detail="Node is not a DuckDB module")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid ID format: {str(e)}")
    except Exception as e:
        import traceback
        print(f"Error checking workflow/node: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error checking workflow/node: {str(e)}")
    
    # Get DuckDB database path and query column
    try:
        import duckdb
        import re
        
        node_path = local_storage.get_workflow_node_path(workflow_id, node_id)
        
        # For duckdb_convert, look in output folder; for duckdb2jmp, look in input folder
        if node.module_type == "duckdb2jmp":
            search_path = node_path / "input"
        else:
            search_path = node_path / "output"
        
        # Find DuckDB file
        db_files = list(search_path.glob("*.duckdb"))
        
        if not db_files:
            raise HTTPException(status_code=404, detail=f"No DuckDB database file found in {search_path.name} folder")
        
        # Use the first DuckDB file found
        db_path = db_files[0]
        
        # Sanitize table and column names to prevent SQL injection
        if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', table_name):
            raise HTTPException(status_code=400, detail="Invalid table name")
        if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', column_name):
            raise HTTPException(status_code=400, detail="Invalid column name")
        
        # Connect and query unique values
        conn = duckdb.connect(str(db_path))
        try:
            # Check if table exists
            tables_result = conn.execute("SHOW TABLES").fetchall()
            table_names = [t[0] for t in tables_result]
            if table_name not in table_names:
                raise HTTPException(status_code=404, detail=f"Table '{table_name}' not found")
            
            # Check if column exists
            columns_result = conn.execute(f"DESCRIBE {table_name}").fetchall()
            column_names = [col[0] for col in columns_result]
            if column_name not in column_names:
                raise HTTPException(status_code=404, detail=f"Column '{column_name}' not found in table '{table_name}'")
            
            # Get all unique values from the column (excluding NULL)
            query = f'SELECT DISTINCT "{column_name}" FROM {table_name} WHERE "{column_name}" IS NOT NULL ORDER BY "{column_name}"'
            result = conn.execute(query).fetchall()
            
            # Convert to strings and filter out empty strings
            unique_values = [str(v[0]) for v in result if v[0] is not None and str(v[0]).strip() != '']
            
            # Get total row count
            count_result = conn.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()
            total_rows = count_result[0] if count_result else 0
            
            return {
                "workflow_id": workflow_id,
                "node_id": node_id,
                "table_name": table_name,
                "column_name": column_name,
                "unique_values": unique_values,
                "count": len(unique_values),
                "total_rows": total_rows
            }
        finally:
            conn.close()
            
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"Error getting DuckDB column unique values: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error getting unique values: {str(e)}")


# Get DuckDB table data endpoint
@router.get("/workflows/{workflow_id}/nodes/{node_id}/duckdb-table-data")
async def get_duckdb_table_data(
    workflow_id: str,
    node_id: str,
    table_name: str = Query(..., description="Name of the table to query"),
    limit: int = Query(1000, description="Maximum number of rows to return"),
    offset: int = Query(0, description="Offset for pagination"),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user)
):
    """Get data from a specific DuckDB table"""
    try:
        # Check workflow and node (similar access checks as above)
        workflow_result = await db.execute(
            select(Workflow).where(Workflow.id == uuid.UUID(workflow_id))
        )
        workflow = workflow_result.scalar_one_or_none()
        
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")
        
        node_result = await db.execute(
            select(WorkflowNode).where(WorkflowNode.id == uuid.UUID(node_id))
        )
        node = node_result.scalar_one_or_none()
        
        if not node or str(node.workflow_id) != workflow_id:
            raise HTTPException(status_code=404, detail="Node not found")
        
        if node.module_type not in ["duckdb_convert", "duckdb2jmp"]:
            raise HTTPException(status_code=400, detail="Node is not a DuckDB module")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid ID format: {str(e)}")
    except Exception as e:
        import traceback
        print(f"Error checking workflow/node: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error checking workflow/node: {str(e)}")
    
    # Get DuckDB database path and query table
    try:
        import duckdb
        
        node_path = local_storage.get_workflow_node_path(workflow_id, node_id)
        
        # For duckdb_convert, look in output folder; for duckdb2jmp, look in input folder
        if node.module_type == "duckdb2jmp":
            search_path = node_path / "input"
        else:
            search_path = node_path / "output"
        
        # Find DuckDB file
        db_files = list(search_path.glob("*.duckdb"))
        
        if not db_files:
            raise HTTPException(status_code=404, detail=f"No DuckDB database file found in {search_path.name} folder")
        
        # Use the first DuckDB file found
        db_path = db_files[0]
        
        # Connect and query table
        conn = duckdb.connect(str(db_path))
        try:
            # Sanitize table name to prevent SQL injection
            # Only allow alphanumeric and underscore
            import re
            if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', table_name):
                raise HTTPException(status_code=400, detail="Invalid table name")
            
            # Get total row count
            count_result = conn.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()
            total_rows = count_result[0] if count_result else 0
            
            # Get column names
            columns_result = conn.execute(f"DESCRIBE {table_name}").fetchall()
            columns = [col[0] for col in columns_result]
            
            # Get data with limit and offset
            query = f"SELECT * FROM {table_name} LIMIT {limit} OFFSET {offset}"
            data_result = conn.execute(query).fetchall()
            
            # Convert rows to dictionaries
            data = []
            for row in data_result:
                row_dict = {}
                for i, col_name in enumerate(columns):
                    value = row[i] if i < len(row) else None
                    # Convert numpy types to Python native types
                    if hasattr(value, 'item'):
                        value = value.item()
                    row_dict[col_name] = value
                data.append(row_dict)
            
            return {
                "workflow_id": workflow_id,
                "node_id": node_id,
                "table_name": table_name,
                "columns": columns,
                "data": data,
                "total_rows": total_rows,
                "displayed_rows": len(data),
                "limit": limit,
                "offset": offset
            }
        finally:
            conn.close()
            
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"Error getting DuckDB table data: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error getting DuckDB table data: {str(e)}")


# Excel2JMP endpoints
@router.post("/workflows/{workflow_id}/nodes/{node_id}/execute-excel2jmp")
async def execute_excel2jmp_node(
    workflow_id: str,
    node_id: str,
    cat_var: str = Form("Stage"),
    color_by: Optional[str] = Form(None),
    list_check_values: Optional[str] = Form(None),  # JSON array of strings
    value_order: Optional[str] = Form(None),  # JSON array of strings
    caption_box_statistics: Optional[str] = Form(None),  # JSON array of strings
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user)
):
    """Execute Excel2JMP node: convert Excel to JSL/CSV pairs"""
    try:
        # Check workflow and node
        workflow_result = await db.execute(
            select(Workflow).where(Workflow.id == uuid.UUID(workflow_id))
        )
        workflow = workflow_result.scalar_one_or_none()
        
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")
        
        node_result = await db.execute(
            select(WorkflowNode).where(WorkflowNode.id == uuid.UUID(node_id))
        )
        node = node_result.scalar_one_or_none()
        
        if not node or str(node.workflow_id) != workflow_id:
            raise HTTPException(status_code=404, detail="Node not found")
        
        if node.module_type != "excel2jmp":
            raise HTTPException(status_code=400, detail="Node is not an Excel2JMP node")
        
        # Get node paths
        node_path = local_storage.get_workflow_node_path(workflow_id, node_id)
        input_path = node_path / "input"
        output_path = node_path / "output"
        
        # Ensure directories exist
        input_path.mkdir(parents=True, exist_ok=True)
        output_path.mkdir(parents=True, exist_ok=True)
        
        # Find Excel files in input folder
        excel_files = list(input_path.glob("*.xlsx")) + list(input_path.glob("*.xls"))
        
        if not excel_files:
            raise HTTPException(status_code=400, detail="No Excel files found in input folder")
        
        # Process first Excel file found
        excel_file_path = excel_files[0]
        
        # Get input file metadata (original filename and UUID filename)
        input_file_uuid = excel_file_path.stem
        input_file_original_name = None
        metadata_file = input_path / f"{input_file_uuid}_metadata.json"
        if metadata_file.exists():
            try:
                input_metadata = json.loads(metadata_file.read_text(encoding='utf-8'))
                input_file_original_name = input_metadata.get("original_filename")
            except Exception:
                pass
        
        # If no metadata, use the file name as original name
        if not input_file_original_name:
            input_file_original_name = excel_file_path.name
        
        # Import processors from excel2jmp module
        from app.workspaces.modules.excel2jmp.file_handler import FileHandler
        from app.workspaces.modules.excel2jmp.data_validator import DataValidator
        from app.workspaces.modules.excel2jmp.data_process import DataProcessor
        from app.workspaces.modules.excel2jmp.file_processor import FileProcessor
        
        # Initialize processors
        file_handler = FileHandler()
        validator = DataValidator()
        data_processor = DataProcessor()
        file_processor = FileProcessor()
        
        # Load Excel file
        load_result = file_handler.load_excel_file(str(excel_file_path))
        if not load_result.get("success"):
            raise HTTPException(status_code=400, detail=f"Failed to load Excel: {load_result.get('error')}")
        
        # Set categorical variable
        set_cat_result = file_handler.set_categorical_variable(cat_var)
        if not set_cat_result.get("success"):
            raise HTTPException(status_code=400, detail=f"Failed to set categorical variable: {set_cat_result.get('error')}")
        
        # Validate data
        df_meta = file_handler.df_meta
        df_data = file_handler.df_data_raw
        fai_columns = file_handler.fai_columns
        
        validation_result = validator.run_full_validation(df_meta, df_data, cat_var)
        if not validation_result.get("success"):
            raise HTTPException(status_code=400, detail=f"Validation failed: {validation_result.get('error')}")
        
        # Process data
        process_result = data_processor.process_data(df_meta, df_data, fai_columns, cat_var)
        if not process_result.get("success"):
            raise HTTPException(status_code=400, detail=f"Processing failed: {process_result.get('error')}")
        
        # Parse list_check_values, value_order, and caption_box_statistics if provided
        list_check_list = None
        value_order_list = None
        caption_box_stats_list = None
        if list_check_values:
            try:
                list_check_list = json.loads(list_check_values)
            except Exception:
                pass
        if value_order:
            try:
                value_order_list = json.loads(value_order)
            except Exception:
                pass
        if caption_box_statistics:
            try:
                caption_box_stats_list = json.loads(caption_box_statistics)
            except Exception:
                pass
        
        # Generate files
        file_result = file_processor.generate_files(
            df_meta,
            process_result["processed_data"],
            process_result["boundaries"],
            cat_var,
            fai_columns,
            color_by,
            list_check_values=list_check_list,
            value_order=value_order_list,
            caption_box_statistics=caption_box_stats_list,
        )
        
        if not file_result.get("success"):
            raise HTTPException(status_code=400, detail=f"File generation failed: {file_result.get('error')}")
        
        # Create timestamped pair folder
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        pair_id = str(uuid.uuid4())[:8]
        pair_folder = output_path / f"pair_{timestamp}_{pair_id}"
        pair_folder.mkdir(parents=True, exist_ok=True)
        
        # Save CSV and JSL files
        csv_content = file_result["files"]["csv_content"]
        jsl_content = file_result["files"]["jsl_content"]
        
        csv_filename = f"data_{timestamp}_{pair_id}.csv"
        jsl_filename = f"script_{timestamp}_{pair_id}.jsl"
        
        csv_path = pair_folder / csv_filename
        jsl_path = pair_folder / jsl_filename
        
        csv_path.write_text(csv_content, encoding='utf-8')
        jsl_path.write_text(jsl_content, encoding='utf-8')
        
        # Set JSL file permissions
        jsl_path.chmod(0o644)
        
        # Create metadata JSON
        metadata = {
            "pair_id": pair_id,
            "timestamp": timestamp,
            "csv_filename": csv_filename,
            "jsl_filename": jsl_filename,
            "cat_var": cat_var,
            "color_by": color_by,
            "fai_columns": fai_columns,
            "list_check_values": list_check_list,
            "value_order": value_order_list,
            "caption_box_statistics": caption_box_stats_list,
            "created_at": datetime.now().isoformat(),
            "input_file": {
                "uuid_filename": excel_file_path.name,
                "original_filename": input_file_original_name,
                "file_path": str(excel_file_path.relative_to(local_storage.base_path))
            }
        }
        
        metadata_path = pair_folder / "metadata.json"
        metadata_path.write_text(json.dumps(metadata, indent=2), encoding='utf-8')
        
        return {
            "workflow_id": workflow_id,
            "node_id": node_id,
            "pair_id": pair_id,
            "pair_folder": pair_folder.name,
            "csv_path": str(csv_path.relative_to(local_storage.base_path)),
            "jsl_path": str(jsl_path.relative_to(local_storage.base_path)),
            "csv_filename": csv_filename,
            "jsl_filename": jsl_filename,
            "metadata": metadata
        }
        
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"Error executing Excel2JMP node: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error executing Excel2JMP node: {str(e)}")


# DuckDB2JMP endpoints
@router.post("/workflows/{workflow_id}/nodes/{node_id}/execute-duckdb2jmp")
async def execute_duckdb2jmp_node(
    workflow_id: str,
    node_id: str,
    cat_var: str = Form("Stage"),
    color_by: Optional[str] = Form(None),
    selected_tables: Optional[str] = Form(None),  # JSON array of strings
    chunk_size: int = Form(100000),
    list_check_values: Optional[str] = Form(None),  # JSON array of strings
    value_order: Optional[str] = Form(None),  # JSON array of strings
    caption_box_statistics: Optional[str] = Form(None),  # JSON array of strings
    add_usl: bool = Form(True),  # Whether to add USL reference line
    add_target: bool = Form(True),  # Whether to add Target reference line
    add_lsl: bool = Form(True),  # Whether to add LSL reference line
    add_nominal: bool = Form(False),  # Whether to add Nominal reference line (value: 0)
    add_tol_upper: bool = Form(False),  # Whether to add TOL+ reference line
    add_tol_lower: bool = Form(False),  # Whether to add TOL- reference line
    usl_color: str = Form("Dark Blue"),  # Color for USL reference line (Dark Blue, Dark Red, Dark Yellow)
    target_color: str = Form("Dark Blue"),  # Color for Target reference line (Dark Blue, Dark Red, Dark Yellow)
    lsl_color: str = Form("Dark Blue"),  # Color for LSL reference line (Dark Blue, Dark Red, Dark Yellow)
    nominal_color: str = Form("Dark Blue"),  # Color for Nominal reference line (Dark Blue, Dark Red, Dark Yellow)
    tol_upper_color: str = Form("Dark Blue"),  # Color for TOL+ reference line (Dark Blue, Dark Red, Dark Yellow)
    tol_lower_color: str = Form("Dark Blue"),  # Color for TOL- reference line (Dark Blue, Dark Red, Dark Yellow)
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user)
):
    """Execute DuckDB2JMP node: convert DuckDB tables to JSL/CSV pairs"""
    try:
        # Check workflow and node
        workflow_result = await db.execute(
            select(Workflow).where(Workflow.id == uuid.UUID(workflow_id))
        )
        workflow = workflow_result.scalar_one_or_none()
        
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")
        
        node_result = await db.execute(
            select(WorkflowNode).where(WorkflowNode.id == uuid.UUID(node_id))
        )
        node = node_result.scalar_one_or_none()
        
        if not node or str(node.workflow_id) != workflow_id:
            raise HTTPException(status_code=404, detail="Node not found")
        
        if node.module_type != "duckdb2jmp":
            raise HTTPException(status_code=400, detail="Node is not a DuckDB2JMP node")
        
        # Get node paths
        node_path = local_storage.get_workflow_node_path(workflow_id, node_id)
        input_path = node_path / "input"
        output_path = node_path / "output"
        
        # Ensure directories exist
        input_path.mkdir(parents=True, exist_ok=True)
        output_path.mkdir(parents=True, exist_ok=True)
        
        # Find DuckDB files in input folder
        duckdb_files = list(input_path.glob("*.duckdb"))
        
        if not duckdb_files:
            raise HTTPException(status_code=400, detail="No DuckDB files found in input folder")
        
        # Process first DuckDB file found
        duckdb_file_path = duckdb_files[0]
        
        # Import processors from duckdb2jmp module
        from app.workspaces.modules.duckdb2jmp.file_handler import FileHandler
        from app.workspaces.modules.duckdb2jmp.data_validator import DataValidator
        from app.workspaces.modules.duckdb2jmp.data_process import DataProcessor
        from app.workspaces.modules.duckdb2jmp.file_processor import FileProcessor
        
        # Initialize processors
        file_handler = FileHandler()
        validator = DataValidator()
        data_processor = DataProcessor()
        file_processor = FileProcessor()
        
        # Load DuckDB file
        load_result = file_handler.load_duckdb_file(str(duckdb_file_path))
        if not load_result.get("success"):
            raise HTTPException(status_code=400, detail=f"Failed to load DuckDB: {load_result.get('error')}")
        
        tables = load_result.get("tables", [])
        if not tables:
            raise HTTPException(status_code=400, detail="No tables found in DuckDB file")
        
        # Parse selected_tables if provided
        selected_tables_list = None
        if selected_tables:
            try:
                selected_tables_list = json.loads(selected_tables)
            except Exception:
                pass
        
        # Use all tables if none selected
        if not selected_tables_list:
            selected_tables_list = tables
        
        # Find meta table (look for table with 'meta' in name or first table)
        meta_table = None
        for table in tables:
            if "meta" in table.lower():
                meta_table = table
                break
        
        if not meta_table and len(tables) > 0:
            meta_table = tables[0]
        
        # Load meta table
        meta_result = file_handler.load_meta_table(meta_table)
        if not meta_result.get("success"):
            raise HTTPException(status_code=400, detail=f"Failed to load meta table: {meta_result.get('error')}")
        
        df_meta = file_handler.df_meta
        
        # Parse list_check_values, value_order, and caption_box_statistics if provided
        list_check_list = None
        value_order_list = None
        caption_box_stats_list = None
        if list_check_values:
            try:
                list_check_list = json.loads(list_check_values)
            except Exception:
                pass
        if value_order:
            try:
                value_order_list = json.loads(value_order)
            except Exception:
                pass
        if caption_box_statistics:
            try:
                caption_box_stats_list = json.loads(caption_box_statistics)
            except Exception:
                pass
        
        # Process each selected table
        all_pairs = []
        
        for table_name in selected_tables_list:
            if table_name == meta_table:
                continue  # Skip meta table
            
            if table_name not in tables:
                continue  # Skip if table doesn't exist
            
            # Only process the "data" table (case-insensitive)
            # Categorical variable settings only apply to the data table
            if table_name.lower() != "data":
                print(f"Info: Skipping table {table_name} - categorical variable settings only apply to 'data' table")
                continue
            
            # Load table (with chunking for large tables)
            table_result = file_handler.load_table(table_name, chunk_size=chunk_size)
            if not table_result.get("success"):
                print(f"Warning: Failed to load table {table_name}: {table_result.get('error')}")
                continue
            
            df_data = file_handler.df_data_raw
            fai_columns = file_handler.fai_columns
            
            # Set categorical variable (only for data table)
            set_cat_result = file_handler.set_categorical_variable(cat_var)
            if not set_cat_result.get("success"):
                print(f"Warning: Failed to set categorical variable for {table_name}: {set_cat_result.get('error')}")
                continue
            
            # Use the actual categorical variable name found (case-insensitive match)
            actual_cat_var = file_handler.selected_cat_var or set_cat_result.get("categorical_variable") or cat_var
            
            # Validate data (using sample if chunked)
            validation_result = validator.run_full_validation(df_meta, df_data, actual_cat_var)
            if not validation_result.get("success"):
                print(f"Warning: Data validation failed for {table_name}: {validation_result.get('error')}")
                continue
            
            # Process data (using all data from DuckDB for boundaries calculation)
            # Use actual_cat_var which was set above
            is_large = table_result.get("is_chunked", False)
            if is_large:
                # For large tables, calculate boundaries from all data in DuckDB
                process_result = data_processor.process_data(
                    df_meta, 
                    df_data,  # Sample for validation only
                    fai_columns, 
                    actual_cat_var,  # Use actual categorical variable name
                    duckdb_path=str(duckdb_file_path),
                    table_name=table_name,
                    add_usl=add_usl,
                    add_target=add_target,
                    add_lsl=add_lsl,
                    add_tol_upper=add_tol_upper,
                    add_tol_lower=add_tol_lower
                )
            else:
                # For small tables, use the loaded data
                process_result = data_processor.process_data(
                    df_meta, 
                    df_data, 
                    fai_columns, 
                    actual_cat_var,  # Use actual categorical variable name
                    add_usl=add_usl,
                    add_target=add_target,
                    add_lsl=add_lsl,
                    add_tol_upper=add_tol_upper,
                    add_tol_lower=add_tol_lower
                )
            
            if not process_result.get("success"):
                print(f"Warning: Data processing failed for {table_name}: {process_result.get('error')}")
                continue
            
            # Generate files (with chunked processing if needed)
            # Use actual_cat_var for file generation to ensure correct column name is used
            file_result = file_processor.generate_files(
                df_meta,
                df_data if not is_large else None,  # Only pass df_data for small tables
                process_result["boundaries"],
                actual_cat_var,  # Use actual categorical variable name
                fai_columns,
                color_by,
                duckdb_path=str(duckdb_file_path) if is_large else None,
                table_name=table_name if is_large else None,
                chunk_size=chunk_size if is_large else None,
                list_check_values=list_check_list,
                value_order=value_order_list,
                caption_box_statistics=caption_box_stats_list,
                add_usl=add_usl,
                add_target=add_target,
                add_lsl=add_lsl,
                add_nominal=add_nominal,
                add_tol_upper=add_tol_upper,
                add_tol_lower=add_tol_lower,
                usl_color=usl_color,
                target_color=target_color,
                lsl_color=lsl_color,
                nominal_color=nominal_color,
                tol_upper_color=tol_upper_color,
                tol_lower_color=tol_lower_color
            )
            
            if not file_result.get("success"):
                print(f"Warning: File generation failed for {table_name}: {file_result.get('error')}")
                continue
            
            # Create timestamped pair folder for this table
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            pair_id = str(uuid.uuid4())[:8]
            pair_folder = output_path / f"pair_{table_name}_{timestamp}_{pair_id}"
            pair_folder.mkdir(parents=True, exist_ok=True)
            
            # Save CSV and JSL files
            csv_content = file_result["files"]["csv_content"]
            jsl_content = file_result["files"]["jsl_content"]
            
            csv_filename = f"data_{table_name}_{timestamp}_{pair_id}.csv"
            jsl_filename = f"script_{table_name}_{timestamp}_{pair_id}.jsl"
            
            csv_path = pair_folder / csv_filename
            jsl_path = pair_folder / jsl_filename
            
            csv_path.write_text(csv_content, encoding='utf-8')
            jsl_path.write_text(jsl_content, encoding='utf-8')
            
            # Set JSL file permissions
            jsl_path.chmod(0o644)
            
            # Create metadata JSON
            metadata = {
                "pair_id": pair_id,
                "table_name": table_name,
                "timestamp": timestamp,
                "csv_filename": csv_filename,
                "jsl_filename": jsl_filename,
                "cat_var": cat_var,
                "color_by": color_by,
                "fai_columns": fai_columns,
                "chunked": is_large,
                "chunk_size": chunk_size if is_large else None,
                "list_check_values": list_check_list,
                "value_order": value_order_list,
                "caption_box_statistics": caption_box_stats_list,
                "add_usl": add_usl,
                "add_target": add_target,
                "add_lsl": add_lsl,
                "add_nominal": add_nominal,
                "add_tol_upper": add_tol_upper,
                "add_tol_lower": add_tol_lower,
                "usl_color": usl_color,
                "target_color": target_color,
                "lsl_color": lsl_color,
                "nominal_color": nominal_color,
                "tol_upper_color": tol_upper_color,
                "tol_lower_color": tol_lower_color,
                "created_at": datetime.now().isoformat()
            }
            
            metadata_path = pair_folder / "metadata.json"
            metadata_path.write_text(json.dumps(metadata, indent=2), encoding='utf-8')
            
            pair_info = {
                "pair_id": pair_id,
                "table_name": table_name,
                "pair_folder": pair_folder.name,
                "csv_path": str(csv_path.relative_to(local_storage.base_path)),
                "jsl_path": str(jsl_path.relative_to(local_storage.base_path)),
                "csv_filename": csv_filename,
                "jsl_filename": jsl_filename,
                "metadata": metadata
            }
            
            all_pairs.append(pair_info)
        
        if not all_pairs:
            raise HTTPException(status_code=400, detail="No tables were successfully processed")
        
        return {
            "workflow_id": workflow_id,
            "node_id": node_id,
            "pairs": all_pairs,
            "total_pairs": len(all_pairs),
            "tables_processed": len(selected_tables_list),
            "total_tables": len(tables)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"Error executing DuckDB2JMP node: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error executing DuckDB2JMP node: {str(e)}")


@router.get("/workflows/{workflow_id}/nodes/{node_id}/jsl-csv-pairs")
async def list_jsl_csv_pairs(
    workflow_id: str,
    node_id: str,
    input_file_path: Optional[str] = Query(None, description="Filter pairs by input file path (relative to node folder)"),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user)
):
    """List all JSL/CSV pairs generated by Excel2JMP node, optionally filtered by input file"""
    try:
        # Check workflow and node
        workflow_result = await db.execute(
            select(Workflow).where(Workflow.id == uuid.UUID(workflow_id))
        )
        workflow = workflow_result.scalar_one_or_none()
        
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")
        
        node_result = await db.execute(
            select(WorkflowNode).where(WorkflowNode.id == uuid.UUID(node_id))
        )
        node = node_result.scalar_one_or_none()
        
        if not node or str(node.workflow_id) != workflow_id:
            raise HTTPException(status_code=404, detail="Node not found")
        
        # Get output path
        node_path = local_storage.get_workflow_node_path(workflow_id, node_id)
        output_path = node_path / "output"
        
        pairs = []
        if output_path.exists() and output_path.is_dir():
            # Find all pair folders
            for pair_folder in output_path.iterdir():
                if pair_folder.is_dir() and pair_folder.name.startswith("pair_"):
                    metadata_path = pair_folder / "metadata.json"
                    if metadata_path.exists():
                        try:
                            metadata = json.loads(metadata_path.read_text(encoding='utf-8'))
                            # Find CSV and JSL files
                            csv_file = pair_folder / metadata.get("csv_filename", "")
                            jsl_file = pair_folder / metadata.get("jsl_filename", "")
                            
                            if csv_file.exists() and jsl_file.exists():
                                # Filter by input file if specified
                                input_file_info = metadata.get("input_file", {})
                                if input_file_path:
                                    # Compare file paths (handle both relative and absolute paths)
                                    pair_input_path = input_file_info.get("file_path", "")
                                    if pair_input_path and input_file_path:
                                        # Normalize paths for comparison
                                        pair_path_normalized = str(Path(pair_input_path).as_posix())
                                        filter_path_normalized = str(Path(input_file_path).as_posix())
                                        if pair_path_normalized != filter_path_normalized:
                                            continue
                                
                                pairs.append({
                                    "pair_id": metadata.get("pair_id"),
                                    "pair_folder": pair_folder.name,
                                    "csv_path": str(csv_file.relative_to(local_storage.base_path)),
                                    "jsl_path": str(jsl_file.relative_to(local_storage.base_path)),
                                    "csv_filename": metadata.get("csv_filename"),
                                    "jsl_filename": metadata.get("jsl_filename"),
                                    "csv_size": csv_file.stat().st_size,
                                    "jsl_size": jsl_file.stat().st_size,
                                    "created_at": metadata.get("created_at"),
                                    "cat_var": metadata.get("cat_var"),
                                    "color_by": metadata.get("color_by"),
                                    "input_file": input_file_info,
                                    "metadata": metadata
                                })
                        except Exception as e:
                            print(f"Error reading metadata for {pair_folder.name}: {str(e)}")
                            continue
        
        # Sort by creation time (newest first)
        pairs.sort(key=lambda x: x.get("created_at", ""), reverse=True)
        
        return {
            "workflow_id": workflow_id,
            "node_id": node_id,
            "pairs": pairs
        }
        
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"Error listing JSL/CSV pairs: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error listing pairs: {str(e)}")


@router.post("/workflows/{workflow_id}/nodes/{node_id}/run-jmp")
async def run_jmp_from_pair(
    workflow_id: str,
    node_id: str,
    pair_id: str = Form(...),
    project_id: Optional[str] = Form(None),
    project_name: Optional[str] = Form(None),
    project_description: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user)
):
    """Run JMP analysis using a selected JSL/CSV pair. Automatically creates a project if project_id is not provided."""
    try:
        # Check workflow and node
        workflow_result = await db.execute(
            select(Workflow).where(Workflow.id == uuid.UUID(workflow_id))
        )
        workflow = workflow_result.scalar_one_or_none()
        
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")
        
        node_result = await db.execute(
            select(WorkflowNode).where(WorkflowNode.id == uuid.UUID(node_id))
        )
        node = node_result.scalar_one_or_none()
        
        if not node or str(node.workflow_id) != workflow_id:
            raise HTTPException(status_code=404, detail="Node not found")
        
        # Create project if not provided
        if not project_id:
            from app.models import Project, ProjectMember
            from sqlalchemy import text
            
            # Generate project name from workflow info
            workflow_name = workflow.name or f"Workflow {workflow_id[:8]}"
            generated_project_name = project_name or f"{workflow_name} - JMP Analysis ({workflow_id[:8]})"
            generated_description = project_description or f"JMP analysis from workflow: {workflow_name} (ID: {workflow_id})"
            
            # Create new project
            new_project = Project(
                name=generated_project_name,
                description=generated_description,
                owner_id=current_user.id if current_user else None,
                allow_guest=True,
                is_public=False
            )
            db.add(new_project)
            await db.commit()
            await db.refresh(new_project)
            
            # Add owner as member
            if current_user:
                await db.execute(text("""
                    INSERT INTO project_member (project_id, user_id, role, role_id) 
                    VALUES (:project_id, :user_id, 'OWNER'::role, '00000000-0000-0000-0000-000000000001'::uuid)
                """), {
                    "project_id": str(new_project.id),
                    "user_id": str(current_user.id)
                })
                await db.commit()
            
            project_id = str(new_project.id)
        
        # Get output path and find pair
        node_path = local_storage.get_workflow_node_path(workflow_id, node_id)
        output_path = node_path / "output"
        
        # Find pair folder
        pair_folder = None
        for folder in output_path.iterdir():
            if folder.is_dir() and folder.name.startswith("pair_") and pair_id in folder.name:
                metadata_path = folder / "metadata.json"
                if metadata_path.exists():
                    pair_folder = folder
                    break
        
        if not pair_folder:
            raise HTTPException(status_code=404, detail="Pair not found")
        
        # Load metadata
        metadata = json.loads((pair_folder / "metadata.json").read_text(encoding='utf-8'))
        csv_path = pair_folder / metadata["csv_filename"]
        jsl_path = pair_folder / metadata["jsl_filename"]
        
        if not csv_path.exists() or not jsl_path.exists():
            raise HTTPException(status_code=404, detail="CSV or JSL file not found")
        
        # Create run record (similar to excel2boxplotv2/api.py)
        from app.core.database import AsyncSessionLocal
        from app.core.websocket import publish_run_update
        from app.models import Run, RunStatus, Artifact
        from app.core.celery import celery_app
        
        async with AsyncSessionLocal() as create_db:
            # Create run
            run = Run(
                project_id=uuid.UUID(project_id),
                started_by=current_user.id if current_user else None,
                status=RunStatus.QUEUED,
                task_name="jmp_boxplot",
                message="Run queued"
            )
            create_db.add(run)
            await create_db.commit()
            await create_db.refresh(run)
            
            # Create run folder
            run_dir_key = f"runs/{str(run.id)}"
            run_dir_path = local_storage.get_file_path(run_dir_key)
            run_dir_path.mkdir(parents=True, exist_ok=True)
            
            # Copy files to run folder
            ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
            uid = str(uuid.uuid4())[:8]
            csv_filename = f"data_{ts}_{uid}.csv"
            jsl_filename = f"script_{ts}_{uid}.jsl"
            
            csv_dst = run_dir_path / csv_filename
            jsl_dst = run_dir_path / jsl_filename
            
            csv_dst.write_bytes(csv_path.read_bytes())
            jsl_dst.write_bytes(jsl_path.read_bytes())
            jsl_dst.chmod(0o644)
            
            # Create artifacts
            csv_artifact = Artifact(
                project_id=uuid.UUID(project_id),
                run_id=run.id,
                kind="input_csv",
                storage_key=str(csv_dst.resolve()),
                filename=csv_filename,
                mime_type="text/csv"
            )
            
            jsl_artifact = Artifact(
                project_id=uuid.UUID(project_id),
                run_id=run.id,
                kind="input_jsl",
                storage_key=str(jsl_dst.resolve()),
                filename=jsl_filename,
                mime_type="text/plain"
            )
            
            create_db.add(csv_artifact)
            create_db.add(jsl_artifact)
            await create_db.commit()
            
            # Create task folder and prepare for JMP runner
            from datetime import timezone
            ts_task = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
            task_uid = str(uuid.uuid4())[:8]
            jmp_task_id = f"{ts_task}_{task_uid}"
            
            from app.core.config import settings
            tasks_root = Path(settings.TASKS_DIRECTORY).expanduser().resolve()
            task_dir = tasks_root / f"task_{jmp_task_id}"
            task_dir.mkdir(parents=True, exist_ok=True)
            
            # Copy files to task folder
            csv_task = task_dir / csv_dst.name
            jsl_task = task_dir / jsl_dst.name
            
            csv_task.write_bytes(csv_dst.read_bytes())
            
            # Modify JSL to point to absolute CSV path
            jsl_content = jsl_dst.read_text(encoding='utf-8')
            absolute_csv_path = str(csv_task.resolve())
            
            create_time = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
            jsl_header = f"""// JSL Script generated by Auto-JMP Platform
// Run ID: {str(run.id)}
// Task Folder ID: {jmp_task_id}
// Created: {create_time}
// CSV File: {csv_task.name}
Open("{absolute_csv_path}");
"""
            
            # Get categorical variable settings from metadata if available
            cat_var = metadata.get("cat_var")
            list_check_values = metadata.get("list_check_values")
            value_order = metadata.get("value_order")
            
            # Generate categorical variable settings code if available
            cat_var_settings_code = ""
            if cat_var and (list_check_values or value_order):
                cat_var_settings_code = "\ndt = Current Data Table();\n\n"
                cat_var_settings_code += "// 1. Ensure type + modeling are OK\n"
                cat_var_settings_code += "Try(\n"
                cat_var_settings_code += f'    dt:{cat_var} << Set Data Type("Character");\n'
                cat_var_settings_code += f'    dt:{cat_var} << Set Modeling Type("Ordinal");   // needed for ordered categories\n'
                cat_var_settings_code += ", );\n\n"
                
                # Add List Check if provided
                if list_check_values:
                    list_check_formatted = ", ".join([f'"{v}"' for v in list_check_values])
                    cat_var_settings_code += "// 2. Set List Check (this is what the UI calls \"List Check\")\n"
                    cat_var_settings_code += "Try(\n"
                    cat_var_settings_code += f'    dt:{cat_var} << List Check( {{{list_check_formatted}}} );\n'
                    cat_var_settings_code += ", );\n\n"
                
                # Add Value Order if provided
                if value_order:
                    value_order_formatted = ", ".join([f'"{v}"' for v in value_order])
                    cat_var_settings_code += "// 3. (Optional but recommended) also set Value Order for reports/graphs\n"
                    cat_var_settings_code += "Try(\n"
                    cat_var_settings_code += f'    dt:{cat_var} << Set Property(\n'
                    cat_var_settings_code += f'        "Value Order",\n'
                    cat_var_settings_code += f'        {{{value_order_formatted}}}\n'
                    cat_var_settings_code += f'    );\n'
                    cat_var_settings_code += ", );\n\n"
                
                cat_var_settings_code += "Wait(0.2);\n\n"
            
            import re
            pattern = r'(?:^\s*//.*?\n)*\s*Open\(".*?"\);\s*\n?'
            if re.search(pattern, jsl_content, flags=re.MULTILINE):
                # Replace existing Open() header and insert cat_var_settings after it
                modified_jsl_content = re.sub(pattern, jsl_header + cat_var_settings_code, jsl_content, count=1, flags=re.MULTILINE)
            else:
                # Prepend header and cat_var_settings
                modified_jsl_content = jsl_header + cat_var_settings_code + jsl_content
            
            jsl_task.write_text(modified_jsl_content, encoding='utf-8')
            
            # Set task ID on run
            run.jmp_task_id = jmp_task_id
            await create_db.commit()
            
            # Queue Celery task
            celery_app.send_task("run_jmp_boxplot", args=[str(run.id)])
            
            # Publish status
            await publish_run_update(str(run.id), {
                "type": "run_created",
                "run_id": str(run.id),
                "status": "queued",
                "message": "Run queued for processing"
            })
            
            return {
                "success": True,
                "run_id": str(run.id),
                "project_id": project_id,
                "status": "queued",
                "jmp_task_id": jmp_task_id
            }
        
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"Error running JMP: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error running JMP: {str(e)}")


# Get Excel file data for viewer endpoint
@router.get("/workflows/{workflow_id}/nodes/{node_id}/excel-data")
async def get_excel_data(
    workflow_id: str,
    node_id: str,
    file_path: Optional[str] = Query(None, description="Path to Excel file (relative to node folder)"),
    version: Optional[str] = Query("original", description="Version: 'original' or 'processed'"),
    load_all: Optional[bool] = Query(False, description="Load all rows (default: False, loads first 50 rows)"),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user)
):
    """Get Excel file data (sheets and data) for viewing"""
    try:
        # Check workflow and node (similar access checks as above)
        workflow_result = await db.execute(
            select(Workflow).where(Workflow.id == uuid.UUID(workflow_id))
        )
        workflow = workflow_result.scalar_one_or_none()
        
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")
        
        node_result = await db.execute(
            select(WorkflowNode).where(WorkflowNode.id == uuid.UUID(node_id))
        )
        node = node_result.scalar_one_or_none()
        
        if not node or str(node.workflow_id) != workflow_id:
            raise HTTPException(status_code=404, detail="Node not found")
        
        if node.module_type not in ["excel_viewer", "outlier_remover", "excel2jmp"]:
            raise HTTPException(status_code=400, detail="Node is not an Excel viewer, outlier remover, or excel2jmp node")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid ID format: {str(e)}")
    except Exception as e:
        import traceback
        print(f"Error checking workflow/node: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error checking workflow/node: {str(e)}")
    
    # Get Excel file path
    try:
        node_path = local_storage.get_workflow_node_path(workflow_id, node_id)
        
        if version == "processed":
            # Look for processed file in output folder
            output_path = node_path / "output"
            if not output_path.exists():
                return {
                    "workflow_id": workflow_id,
                    "node_id": node_id,
                    "sheets": [],
                    "message": f"No processed Excel file found - output folder does not exist"
                }
            excel_files = list(output_path.glob("*.xlsx")) + list(output_path.glob("*.xls"))
            
            # When viewing processed files, file_path refers to the input file filename
            # We need to find the processed file that matches this input file
            if file_path:
                # file_path is the input file filename, find matching processed file via metadata
                input_path = node_path / "input"
                input_file_path = input_path / file_path
                if input_file_path.exists():
                    current_input_file = str(input_file_path.relative_to(local_storage.base_path))
                    
                    # Find processed file that matches this input file
                    matched_files = []
                    for excel_file in excel_files:
                        # Check metadata to see if this processed file matches the input file
                        try:
                            file_stem = excel_file.stem
                            metadata_file = output_path / f"{file_stem}_metadata.json"
                            if metadata_file.exists():
                                with open(metadata_file, 'r', encoding='utf-8') as f:
                                    metadata = json.load(f)
                                    processed_input_file = metadata.get("input_file")
                                    # Compare relative paths - normalize both for comparison
                                    # Both should be relative to base_path
                                    if processed_input_file:
                                        # Normalize paths for comparison (handle different separators)
                                        processed_path_normalized = str(Path(processed_input_file)).replace('\\', '/')
                                        current_path_normalized = str(Path(current_input_file)).replace('\\', '/')
                                        
                                        # Also compare just the filenames as a fallback
                                        processed_filename = Path(processed_input_file).name
                                        current_filename = Path(current_input_file).name
                                        
                                        # Match if full paths match OR if filenames match
                                        if processed_path_normalized == current_path_normalized or processed_filename == current_filename:
                                            matched_files.append(excel_file)
                                            print(f"✓ Matched processed file {excel_file.name} with input file {current_input_file}")
                                        else:
                                            # Only log mismatch if we're debugging, don't spam logs
                                            pass
                        except Exception as e:
                            # If metadata read fails, skip this file
                            print(f"Warning: Could not read metadata for {excel_file}: {e}")
                            continue
                    
                    # If we found matching files, use them; otherwise return early with message
                    if matched_files:
                        excel_files = matched_files
                    else:
                        # No processed file found for this input file
                        return {
                            "workflow_id": workflow_id,
                            "node_id": node_id,
                            "sheets": [],
                            "message": f"No processed file found for the current input file. Please process the file first.",
                            "version": version
                        }
                else:
                    # Input file doesn't exist, try to use file_path as processed file name directly
                    file_path_obj = Path(file_path)
                    if file_path_obj.is_absolute():
                        excel_file_path = file_path_obj
                    else:
                        excel_file_path = output_path / file_path
                    if excel_file_path.exists() and excel_file_path.is_file():
                        excel_files = [excel_file_path]
        else:
            # Look for original file in input folder or from config
            input_path = node_path / "input"
            if not input_path.exists():
                return {
                    "workflow_id": workflow_id,
                    "node_id": node_id,
                    "sheets": [],
                    "message": f"No Excel file found - input folder does not exist"
                }
            excel_files = list(input_path.glob("*.xlsx")) + list(input_path.glob("*.xls"))
            
            # If file_path is specified, use it
            if file_path:
                file_path_obj = Path(file_path)
                if file_path_obj.is_absolute():
                    excel_file_path = file_path_obj
                else:
                    excel_file_path = input_path / file_path
                if excel_file_path.exists() and excel_file_path.is_file():
                    excel_files = [excel_file_path]
        
        if not excel_files:
            return {
                "workflow_id": workflow_id,
                "node_id": node_id,
                "sheets": [],
                "message": f"No Excel file found in {version} folder"
            }
        
        # Use the first Excel file found
        excel_file_path = excel_files[0]
        
        # Check if file exists and is readable
        if not excel_file_path.exists():
            return {
                "workflow_id": workflow_id,
                "node_id": node_id,
                "sheets": [],
                "message": f"Excel file not found: {excel_file_path.name}"
            }
        
        if not excel_file_path.is_file():
            return {
                "workflow_id": workflow_id,
                "node_id": node_id,
                "sheets": [],
                "message": f"Path is not a file: {excel_file_path.name}"
            }
        
        # Read Excel file
        try:
            excel_file = pd.ExcelFile(excel_file_path, engine='openpyxl')
        except Exception as e:
            import traceback
            error_msg = f"Failed to read Excel file {excel_file_path.name}: {str(e)}"
            print(f"{error_msg}\n{traceback.format_exc()}")
            return {
                "workflow_id": workflow_id,
                "node_id": node_id,
                "sheets": [],
                "message": error_msg,
                "error": str(e)
            }
        
        try:
            sheets_data = []
            for sheet_name in excel_file.sheet_names:
                try:
                    df = pd.read_excel(excel_file, sheet_name=sheet_name)
                    
                    # Convert DataFrame to JSON-serializable format
                    # Limit to first 50 rows by default for performance, or load all if requested
                    if load_all:
                        df_display = df
                    else:
                        df_display = df.head(50)
                    
                    # Convert data to JSON-serializable format
                    # Handle NaN values and non-serializable types
                    data_records = []
                    for _, row in df_display.iterrows():
                        record = {}
                        for col in df.columns:
                            value = row[col]
                            # Convert NaN to None, and handle other non-serializable types
                            if pd.isna(value):
                                record[col] = None
                            elif isinstance(value, (pd.Timestamp, pd.DatetimeTZDtype)):
                                record[col] = str(value)
                            else:
                                try:
                                    # Try to convert to native Python type
                                    record[col] = value.item() if hasattr(value, 'item') else value
                                except (ValueError, AttributeError):
                                    record[col] = str(value)
                        data_records.append(record)
                    
                    sheets_data.append({
                        "name": sheet_name,
                        "rows": len(df),
                        "columns": list(df.columns),
                        "data": data_records,
                        "total_rows": len(df),
                        "displayed_rows": len(df_display)
                    })
                except Exception as e:
                    import traceback
                    print(f"Error reading sheet '{sheet_name}': {str(e)}\n{traceback.format_exc()}")
                    # Continue with other sheets even if one fails
                    sheets_data.append({
                        "name": sheet_name,
                        "rows": 0,
                        "columns": [],
                        "data": [],
                        "total_rows": 0,
                        "displayed_rows": 0,
                        "error": str(e)
                    })
            
            return {
                "workflow_id": workflow_id,
                "node_id": node_id,
                "file_path": str(excel_file_path.relative_to(local_storage.base_path)),
                "filename": excel_file_path.name,
                "version": version,
                "sheets": sheets_data
            }
        finally:
            if 'excel_file' in locals():
                excel_file.close()
            
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        import traceback
        error_msg = f"Error getting Excel data: {str(e)}"
        print(f"{error_msg}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=error_msg)


@router.get("/workflows/{workflow_id}/nodes/{node_id}/excel-column-unique-values")
async def get_excel_column_unique_values(
    workflow_id: str,
    node_id: str,
    column_name: str = Query(..., description="Name of the column to get unique values from"),
    file_path: Optional[str] = Query(None, description="Path to Excel file (relative to node folder)"),
    sheet_name: Optional[str] = Query(None, description="Name of the sheet (defaults to 'data' or first sheet)"),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user)
):
    """Get all unique values from a specific column in an Excel file (reads all rows, not just first 1000)"""
    try:
        # Check workflow and node
        workflow_result = await db.execute(
            select(Workflow).where(Workflow.id == uuid.UUID(workflow_id))
        )
        workflow = workflow_result.scalar_one_or_none()
        
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")
        
        node_result = await db.execute(
            select(WorkflowNode).where(WorkflowNode.id == uuid.UUID(node_id))
        )
        node = node_result.scalar_one_or_none()
        
        if not node or str(node.workflow_id) != workflow_id:
            raise HTTPException(status_code=404, detail="Node not found")
        
        if node.module_type not in ["excel_viewer", "outlier_remover", "excel2jmp"]:
            raise HTTPException(status_code=400, detail="Node is not an Excel viewer, outlier remover, or excel2jmp node")
        
        # Get Excel file path
        node_path = local_storage.get_workflow_node_path(workflow_id, node_id)
        input_path = node_path / "input"
        
        # Find Excel file
        if file_path:
            excel_file_path = node_path / file_path
        else:
            excel_files = list(input_path.glob("*.xlsx")) + list(input_path.glob("*.xls"))
            if not excel_files:
                raise HTTPException(status_code=404, detail="No Excel files found in input folder")
            excel_file_path = excel_files[0]
        
        if not excel_file_path.exists():
            raise HTTPException(status_code=404, detail="Excel file not found")
        
        # Read Excel file
        try:
            excel_file = pd.ExcelFile(excel_file_path, engine='openpyxl')
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to read Excel file: {str(e)}")
        
        # Determine which sheet to use
        target_sheet = None
        if sheet_name:
            if sheet_name in excel_file.sheet_names:
                target_sheet = sheet_name
            else:
                raise HTTPException(status_code=400, detail=f"Sheet '{sheet_name}' not found")
        else:
            # Default to 'data' sheet or first sheet
            if "data" in [s.lower() for s in excel_file.sheet_names]:
                target_sheet = excel_file.sheet_names[[s.lower() for s in excel_file.sheet_names].index("data")]
            else:
                target_sheet = excel_file.sheet_names[0]
        
        # Read ALL rows from the sheet (not limited to 1000)
        df = pd.read_excel(excel_file, sheet_name=target_sheet)
        
        # Check if column exists
        if column_name not in df.columns:
            raise HTTPException(status_code=400, detail=f"Column '{column_name}' not found in sheet '{target_sheet}'")
        
        # Get all unique values from the column (excluding NaN/None)
        unique_values = df[column_name].dropna().unique().tolist()
        
        # Convert to strings and filter out empty strings
        unique_values = [str(v) for v in unique_values if str(v).strip() != '']
        
        # Sort the values
        unique_values.sort()
        
        return {
            "workflow_id": workflow_id,
            "node_id": node_id,
            "column_name": column_name,
            "sheet_name": target_sheet,
            "unique_values": unique_values,
            "count": len(unique_values),
            "total_rows": len(df)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_msg = f"Error getting unique values: {str(e)}"
        print(f"{error_msg}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=error_msg)


@router.get("/workflows/{workflow_id}/nodes/{node_id}/csv-data")
async def get_csv_data(
    workflow_id: str,
    node_id: str,
    pair_id: str = Query(..., description="Pair ID to get CSV data from"),
    limit: int = Query(1000, description="Maximum number of rows to return"),
    offset: int = Query(0, description="Number of rows to skip"),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user)
):
    """Get CSV data from a JSL/CSV pair"""
    try:
        # Check workflow and node
        workflow_result = await db.execute(
            select(Workflow).where(Workflow.id == uuid.UUID(workflow_id))
        )
        workflow = workflow_result.scalar_one_or_none()
        
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")
        
        node_result = await db.execute(
            select(WorkflowNode).where(WorkflowNode.id == uuid.UUID(node_id))
        )
        node = node_result.scalar_one_or_none()
        
        if not node or str(node.workflow_id) != workflow_id:
            raise HTTPException(status_code=404, detail="Node not found")
        
        # Get output path and find pair folder
        from app.core.storage import LocalFileStorage
        local_storage = LocalFileStorage()
        node_path = local_storage.get_workflow_node_path(workflow_id, node_id)
        output_path = node_path / "output"
        
        if not output_path.exists():
            raise HTTPException(status_code=404, detail="Output folder not found")
        
        # Find pair folder
        pair_folder = None
        for folder in output_path.iterdir():
            if folder.is_dir() and folder.name.startswith("pair_"):
                metadata_path = folder / "metadata.json"
                if metadata_path.exists():
                    try:
                        metadata = json.loads(metadata_path.read_text(encoding='utf-8'))
                        if metadata.get("pair_id") == pair_id:
                            pair_folder = folder
                            break
                    except Exception:
                        continue
        
        if not pair_folder:
            raise HTTPException(status_code=404, detail="Pair not found")
        
        # Read metadata to get CSV filename
        metadata_path = pair_folder / "metadata.json"
        metadata = json.loads(metadata_path.read_text(encoding='utf-8'))
        csv_filename = metadata.get("csv_filename")
        
        if not csv_filename:
            raise HTTPException(status_code=404, detail="CSV filename not found in metadata")
        
        csv_path = pair_folder / csv_filename
        if not csv_path.exists():
            raise HTTPException(status_code=404, detail="CSV file not found")
        
        # Read CSV file
        import pandas as pd
        df = pd.read_csv(csv_path)
        
        total_rows = len(df)
        
        # Apply pagination
        df_display = df.iloc[offset:offset + limit]
        
        # Convert to JSON-serializable format
        columns = df.columns.tolist()
        data = []
        for _, row in df_display.iterrows():
            row_dict = {}
            for col in columns:
                value = row[col]
                if pd.isna(value):
                    row_dict[col] = None
                else:
                    row_dict[col] = str(value)
            data.append(row_dict)
        
        return {
            "workflow_id": workflow_id,
            "node_id": node_id,
            "pair_id": pair_id,
            "csv_filename": csv_filename,
            "columns": columns,
            "data": data,
            "total_rows": total_rows,
            "displayed_rows": len(data),
            "limit": limit,
            "offset": offset
        }
        
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"Error getting CSV data: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error getting CSV data: {str(e)}")


@router.get("/workflows/{workflow_id}/nodes/{node_id}/jsl-content")
async def get_jsl_content(
    workflow_id: str,
    node_id: str,
    pair_id: str = Query(..., description="Pair ID to get JSL content from"),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user)
):
    """Get JSL script content from a JSL/CSV pair"""
    try:
        # Check workflow and node
        workflow_result = await db.execute(
            select(Workflow).where(Workflow.id == uuid.UUID(workflow_id))
        )
        workflow = workflow_result.scalar_one_or_none()
        
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")
        
        node_result = await db.execute(
            select(WorkflowNode).where(WorkflowNode.id == uuid.UUID(node_id))
        )
        node = node_result.scalar_one_or_none()
        
        if not node or str(node.workflow_id) != workflow_id:
            raise HTTPException(status_code=404, detail="Node not found")
        
        # Get output path and find pair folder
        from app.core.storage import LocalFileStorage
        local_storage = LocalFileStorage()
        node_path = local_storage.get_workflow_node_path(workflow_id, node_id)
        output_path = node_path / "output"
        
        if not output_path.exists():
            raise HTTPException(status_code=404, detail="Output folder not found")
        
        # Find pair folder
        pair_folder = None
        for folder in output_path.iterdir():
            if folder.is_dir() and folder.name.startswith("pair_"):
                metadata_path = folder / "metadata.json"
                if metadata_path.exists():
                    try:
                        metadata = json.loads(metadata_path.read_text(encoding='utf-8'))
                        if metadata.get("pair_id") == pair_id:
                            pair_folder = folder
                            break
                    except Exception:
                        continue
        
        if not pair_folder:
            raise HTTPException(status_code=404, detail="Pair not found")
        
        # Read metadata to get JSL filename
        metadata_path = pair_folder / "metadata.json"
        metadata = json.loads(metadata_path.read_text(encoding='utf-8'))
        jsl_filename = metadata.get("jsl_filename")
        
        if not jsl_filename:
            raise HTTPException(status_code=404, detail="JSL filename not found in metadata")
        
        jsl_path = pair_folder / jsl_filename
        if not jsl_path.exists():
            raise HTTPException(status_code=404, detail="JSL file not found")
        
        # Read JSL file
        jsl_content = jsl_path.read_text(encoding='utf-8')
        
        return {
            "workflow_id": workflow_id,
            "node_id": node_id,
            "pair_id": pair_id,
            "jsl_filename": jsl_filename,
            "content": jsl_content
        }
        
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"Error getting JSL content: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error getting JSL content: {str(e)}")


@router.get("/workflows/{workflow_id}/nodes/{node_id}/download-pair")
async def download_jsl_csv_pair(
    workflow_id: str,
    node_id: str,
    pair_id: str = Query(..., description="Pair ID to download"),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user)
):
    """Download a JSL/CSV pair as a ZIP file"""
    try:
        # Check workflow and node
        workflow_result = await db.execute(
            select(Workflow).where(Workflow.id == uuid.UUID(workflow_id))
        )
        workflow = workflow_result.scalar_one_or_none()
        
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")
        
        node_result = await db.execute(
            select(WorkflowNode).where(WorkflowNode.id == uuid.UUID(node_id))
        )
        node = node_result.scalar_one_or_none()
        
        if not node or str(node.workflow_id) != workflow_id:
            raise HTTPException(status_code=404, detail="Node not found")
        
        # Get output path and find pair folder
        from app.core.storage import LocalFileStorage
        from fastapi.responses import FileResponse
        import zipfile
        import tempfile
        
        local_storage = LocalFileStorage()
        node_path = local_storage.get_workflow_node_path(workflow_id, node_id)
        output_path = node_path / "output"
        
        if not output_path.exists():
            raise HTTPException(status_code=404, detail="Output folder not found")
        
        # Find pair folder
        pair_folder = None
        for folder in output_path.iterdir():
            if folder.is_dir() and folder.name.startswith("pair_"):
                metadata_path = folder / "metadata.json"
                if metadata_path.exists():
                    try:
                        metadata = json.loads(metadata_path.read_text(encoding='utf-8'))
                        if metadata.get("pair_id") == pair_id:
                            pair_folder = folder
                            break
                    except Exception:
                        continue
        
        if not pair_folder:
            raise HTTPException(status_code=404, detail="Pair not found")
        
        # Read metadata to get filenames
        metadata_path = pair_folder / "metadata.json"
        metadata = json.loads(metadata_path.read_text(encoding='utf-8'))
        csv_filename = metadata.get("csv_filename")
        jsl_filename = metadata.get("jsl_filename")
        
        if not csv_filename or not jsl_filename:
            raise HTTPException(status_code=404, detail="CSV or JSL filename not found in metadata")
        
        csv_path = pair_folder / csv_filename
        jsl_path = pair_folder / jsl_filename
        
        if not csv_path.exists() or not jsl_path.exists():
            raise HTTPException(status_code=404, detail="CSV or JSL file not found")
        
        # Create temporary ZIP file
        with tempfile.NamedTemporaryFile(delete=False, suffix='.zip') as temp_zip:
            with zipfile.ZipFile(temp_zip.name, 'w', zipfile.ZIP_DEFLATED) as zipf:
                # Add CSV file
                zipf.write(csv_path, csv_filename)
                # Add JSL file
                zipf.write(jsl_path, jsl_filename)
                # Add metadata file
                zipf.write(metadata_path, "metadata.json")
            
            # Return the ZIP file
            pair_folder_name = pair_folder.name
            return FileResponse(
                path=temp_zip.name,
                filename=f"{pair_folder_name}.zip",
                media_type="application/zip"
            )
        
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"Error downloading pair: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error downloading pair: {str(e)}")


# Process Excel file (remove outliers) endpoint
@router.post("/workflows/{workflow_id}/nodes/{node_id}/process-excel")
async def process_excel(
    workflow_id: str,
    node_id: str,
    outlier_rules: List[Dict[str, Any]] = Body(..., description="List of outlier removal rules"),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user)
):
    """Process Excel file by removing outliers based on rules"""
    try:
        # Check workflow and node
        workflow_result = await db.execute(
            select(Workflow).where(Workflow.id == uuid.UUID(workflow_id))
        )
        workflow = workflow_result.scalar_one_or_none()
        
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")
        
        node_result = await db.execute(
            select(WorkflowNode).where(WorkflowNode.id == uuid.UUID(node_id))
        )
        node = node_result.scalar_one_or_none()
        
        if not node or str(node.workflow_id) != workflow_id:
            raise HTTPException(status_code=404, detail="Node not found")
        
        if node.module_type != "excel_viewer":
            raise HTTPException(status_code=400, detail="Node is not an Excel viewer node")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid ID format: {str(e)}")
    except Exception as e:
        import traceback
        print(f"Error checking workflow/node: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error checking workflow/node: {str(e)}")
    
    # Process Excel file
    try:
        import numpy as np
        import tempfile
        
        node_path = local_storage.get_workflow_node_path(workflow_id, node_id)
        input_path = node_path / "input"
        output_path = node_path / "output"
        
        # Find Excel file in input folder
        excel_files = list(input_path.glob("*.xlsx")) + list(input_path.glob("*.xls"))
        
        if not excel_files:
            raise HTTPException(status_code=404, detail="No Excel file found in input folder")
        
        excel_file_path = excel_files[0]
        filename = excel_file_path.name
        
        # Read Excel file
        excel_file = pd.ExcelFile(excel_file_path, engine='openpyxl')
        
        try:
            processed_sheets = {}
            for sheet_name in excel_file.sheet_names:
                df = pd.read_excel(excel_file, sheet_name=sheet_name)
                
                # Apply outlier removal rules
                for rule in outlier_rules:
                    column = rule.get("column")
                    condition = rule.get("condition")
                    value = rule.get("value")
                    
                    if not column or column not in df.columns:
                        continue
                    
                    try:
                        if condition == "greater_than":
                            try:
                                num_value = float(value)
                                df.loc[df[column] > num_value, column] = np.nan
                            except (ValueError, TypeError):
                                pass
                        elif condition == "less_than":
                            try:
                                num_value = float(value)
                                df.loc[df[column] < num_value, column] = np.nan
                            except (ValueError, TypeError):
                                pass
                        elif condition == "equals":
                            df.loc[df[column] == value, column] = np.nan
                        elif condition == "contains":
                            if isinstance(value, str):
                                df.loc[df[column].astype(str).str.contains(value, na=False), column] = np.nan
                    except Exception as e:
                        print(f"Error applying rule to column {column}: {str(e)}")
                        continue
                
                processed_sheets[sheet_name] = df
            
            # Save processed Excel to output folder
            output_filename = f"processed_{filename}"
            output_file_path = output_path / output_filename
            
            with pd.ExcelWriter(str(output_file_path), engine='openpyxl') as writer:
                for sheet_name, df in processed_sheets.items():
                    df.to_excel(writer, sheet_name=sheet_name, index=False)
            
            # Update node config with outlier rules
            node_config = node.config or {}
            node_config["outlier_rules"] = outlier_rules
            node.config = node_config
            await db.commit()
            
            return {
                "workflow_id": workflow_id,
                "node_id": node_id,
                "original_file": str(excel_file_path.relative_to(local_storage.base_path)),
                "processed_file": str(output_file_path.relative_to(local_storage.base_path)),
                "filename": output_filename,
                "sheets_processed": list(processed_sheets.keys())
            }
        finally:
            excel_file.close()
            
    except Exception as e:
        import traceback
        print(f"Error processing Excel: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error processing Excel: {str(e)}")


# Save node config to file
@router.post("/workflows/{workflow_id}/nodes/{node_id}/config")
async def save_node_config(
    workflow_id: str,
    node_id: str,
    config: dict = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user)
):
    """Save node configuration to JSON file in the node folder"""
    try:
        # Verify workflow and node exist
        workflow_result = await db.execute(
            select(Workflow).where(Workflow.id == uuid.UUID(workflow_id))
        )
        workflow = workflow_result.scalar_one_or_none()
        
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")
        
        node_result = await db.execute(
            select(WorkflowNode).where(WorkflowNode.id == uuid.UUID(node_id))
        )
        node = node_result.scalar_one_or_none()
        
        if not node or str(node.workflow_id) != workflow_id:
            raise HTTPException(status_code=404, detail="Node not found")
        
        # Save config to file
        config_file_path = local_storage.save_node_config(workflow_id, node_id, config)
        
        # Also update database config
        node.config = config
        await db.commit()
        
        return {
            "workflow_id": workflow_id,
            "node_id": node_id,
            "config_file": str(config_file_path.relative_to(local_storage.base_path)),
            "message": "Config saved successfully"
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid ID format: {str(e)}")
    except Exception as e:
        import traceback
        print(f"Error saving node config: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error saving node config: {str(e)}")


# Load node config from file
@router.get("/workflows/{workflow_id}/nodes/{node_id}/config")
async def load_node_config(
    workflow_id: str,
    node_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user)
):
    """Load node configuration from JSON file in the node folder"""
    try:
        # Verify workflow and node exist
        workflow_result = await db.execute(
            select(Workflow).where(Workflow.id == uuid.UUID(workflow_id))
        )
        workflow = workflow_result.scalar_one_or_none()
        
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")
        
        node_result = await db.execute(
            select(WorkflowNode).where(WorkflowNode.id == uuid.UUID(node_id))
        )
        node = node_result.scalar_one_or_none()
        
        if not node or str(node.workflow_id) != workflow_id:
            raise HTTPException(status_code=404, detail="Node not found")
        
        # Load config from file
        config = local_storage.load_node_config(workflow_id, node_id)
        
        if config is None:
            # Fallback to database config if file doesn't exist
            config = node.config or {}
        
        return {
            "workflow_id": workflow_id,
            "node_id": node_id,
            "config": config
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid ID format: {str(e)}")
    except Exception as e:
        import traceback
        print(f"Error loading node config: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error loading node config: {str(e)}")


# Process Excel file with outlier remover (remove outliers and generate summary)
class OutlierRemoverRequest(BaseModel):
    outlier_rules: List[Dict[str, Any]]
    selected_columns: Dict[str, List[str]]
    file_key: Optional[str] = None  # Optional: specify which input file to process

@router.post("/workflows/{workflow_id}/nodes/{node_id}/process-outlier-remover")
async def process_outlier_remover(
    workflow_id: str,
    node_id: str,
    request: OutlierRemoverRequest = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user)
):
    """Process Excel file by removing outliers based on rules and generate summary sheet"""
    try:
        # Check workflow and node
        workflow_result = await db.execute(
            select(Workflow).where(Workflow.id == uuid.UUID(workflow_id))
        )
        workflow = workflow_result.scalar_one_or_none()
        
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")
        
        node_result = await db.execute(
            select(WorkflowNode).where(WorkflowNode.id == uuid.UUID(node_id))
        )
        node = node_result.scalar_one_or_none()
        
        if not node or str(node.workflow_id) != workflow_id:
            raise HTTPException(status_code=404, detail="Node not found")
        
        if node.module_type != "outlier_remover":
            raise HTTPException(status_code=400, detail="Node is not an outlier remover node")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid ID format: {str(e)}")
    except Exception as e:
        import traceback
        print(f"Error checking workflow/node: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error checking workflow/node: {str(e)}")
    
    # Process Excel file
    try:
        import numpy as np
        from datetime import datetime
        
        node_path = local_storage.get_workflow_node_path(workflow_id, node_id)
        input_path = node_path / "input"
        output_path = node_path / "output"
        
        # Get the current input file from request or node config
        # Priority: request.file_key > node.config.file_key > config file
        file_key = request.file_key
        print(f"Processing request - file_key from request: {file_key}")
        if not file_key:
            node_config = node.config or {}
            file_key = node_config.get("file_key")
            print(f"file_key from node.config: {file_key}")
            # If still not found, try loading from config file
            if not file_key:
                try:
                    config_file = local_storage.load_node_config(workflow_id, node_id)
                    if config_file:
                        file_key = config_file.get("file_key")
                        print(f"file_key from config file: {file_key}")
                except Exception as e:
                    print(f"Warning: Could not load config file: {e}")
        
        # Find Excel file in input folder
        excel_files = list(input_path.glob("*.xlsx")) + list(input_path.glob("*.xls"))
        print(f"Found {len(excel_files)} Excel files in input folder: {[f.name for f in excel_files]}")
        
        if not excel_files:
            raise HTTPException(status_code=404, detail="No Excel file found in input folder")
        
        # If file_key is specified, use that file; otherwise use first file
        excel_file_path = None
        if file_key:
            # Extract filename from file_key path
            # file_key format: workflows/{workflow_id}/nodes/{node_id}/input/{filename}
            filename_from_key = file_key.split('/')[-1] if '/' in file_key else file_key
            print(f"Extracted filename from file_key: {filename_from_key}")
            potential_path = input_path / filename_from_key
            print(f"Looking for file at: {potential_path} (exists: {potential_path.exists()}, is_file: {potential_path.is_file() if potential_path.exists() else False})")
            if potential_path.exists() and potential_path.is_file():
                excel_file_path = potential_path
                print(f"✓ Using file from file_key: {filename_from_key}")
            else:
                print(f"✗ File not found at expected path, will fall back to first file")
        
        # Fallback to first file if file_key not found or not specified
        if not excel_file_path:
            excel_file_path = excel_files[0]
            print(f"Using first file found: {excel_file_path.name}")
            if file_key:
                # If file_key was provided but file not found, this is an error
                raise HTTPException(
                    status_code=404, 
                    detail=f"File specified in file_key ({file_key}) not found in input folder. Available files: {[f.name for f in excel_files]}"
                )
        
        filename = excel_file_path.name
        
        # Read Excel file
        excel_file = pd.ExcelFile(excel_file_path, engine='openpyxl')
        
        try:
            processed_sheets = {}
            removal_summary = []
            
            for sheet_name in excel_file.sheet_names:
                df = pd.read_excel(excel_file, sheet_name=sheet_name)
                original_row_count = len(df)
                
                # Get columns to process for this sheet
                sheet_columns = request.selected_columns.get(sheet_name, [])
                if not sheet_columns:
                    # If no columns selected, process all columns
                    sheet_columns = list(df.columns)
                
                print(f"Processing sheet: {sheet_name}, columns: {sheet_columns}, rules: {len(request.outlier_rules)}")
                
                # Apply outlier removal rules to selected columns
                for rule_idx, rule in enumerate(request.outlier_rules):
                    print(f"  Applying rule {rule_idx + 1}: {rule}")
                    column = rule.get("column")  # Optional: if None, applies to all selected columns
                    condition = rule.get("condition")
                    value = rule.get("value")
                    rule_sheet = rule.get("sheet")
                    action = rule.get("action", "clear_cell")  # Default to clear_cell if not specified
                    
                    # Skip if rule is for different sheet
                    if rule_sheet and rule_sheet != sheet_name:
                        continue
                    
                    # Determine which columns to apply the rule to
                    columns_to_process = []
                    if column:
                        # Apply to specific column if it's in selected columns
                        if column in sheet_columns and column in df.columns:
                            columns_to_process = [column]
                        else:
                            print(f"    Column '{column}' not found in sheet '{sheet_name}' or not in selected columns")
                    else:
                        # Apply to all selected columns
                        columns_to_process = [col for col in sheet_columns if col in df.columns]
                    
                    print(f"    Columns to process: {columns_to_process}")
                    
                    # Collect all rows to remove for this rule (if action is remove_row)
                    all_rows_to_remove = set()
                    
                    # Apply rule to each column
                    for col in columns_to_process:
                        try:
                            removed_count = 0
                            rows_to_remove = set()
                            
                            if condition == "greater_than":
                                try:
                                    num_value = float(value)
                                    mask = df[col] > num_value
                                    removed_count = mask.sum()
                                    if action == "remove_row":
                                        rows_to_remove.update(df[mask].index.tolist())
                                    else:
                                        df.loc[mask, col] = np.nan
                                except (ValueError, TypeError):
                                    pass
                            elif condition == "less_than":
                                try:
                                    num_value = float(value)
                                    mask = df[col] < num_value
                                    removed_count = mask.sum()
                                    if action == "remove_row":
                                        rows_to_remove.update(df[mask].index.tolist())
                                    else:
                                        df.loc[mask, col] = np.nan
                                except (ValueError, TypeError):
                                    pass
                            elif condition == "equals":
                                mask = df[col] == value
                                removed_count = mask.sum()
                                if action == "remove_row":
                                    rows_to_remove.update(df[mask].index.tolist())
                                else:
                                    df.loc[mask, col] = np.nan
                            elif condition == "contains":
                                if isinstance(value, str):
                                    mask = df[col].astype(str).str.contains(value, na=False)
                                    removed_count = mask.sum()
                                    if action == "remove_row":
                                        rows_to_remove.update(df[mask].index.tolist())
                                    else:
                                        df.loc[mask, col] = np.nan
                            
                            # Collect rows to remove
                            if action == "remove_row":
                                all_rows_to_remove.update(rows_to_remove)
                            
                            # Record removal in summary
                            if removed_count > 0:
                                print(f"      Applied rule to column '{col}': {removed_count} matches found, action: {action}")
                                removal_summary.append({
                                    "sheet": sheet_name,
                                    "column": col,
                                    "condition": condition,
                                    "value": str(value),
                                    "action": action,
                                    "removed_count": int(removed_count),
                                    "timestamp": datetime.now().isoformat()
                                })
                            else:
                                print(f"      No matches found for column '{col}' with condition '{condition}' and value '{value}'")
                        except Exception as e:
                            import traceback
                            print(f"Error applying rule to column {col} in sheet {sheet_name}: {str(e)}\n{traceback.format_exc()}")
                            continue
                    
                    # Remove rows if action is remove_row (after processing all columns for this rule)
                    if action == "remove_row" and all_rows_to_remove:
                        rows_removed = len(all_rows_to_remove)
                        df = df.drop(index=list(all_rows_to_remove))
                        df = df.reset_index(drop=True)
                        print(f"    Removed {rows_removed} rows from sheet '{sheet_name}'")
                    
                    # Update the processed sheet with the modified dataframe
                    processed_sheets[sheet_name] = df
                    final_row_count = len(df)
                    print(f"  Sheet '{sheet_name}': {original_row_count} -> {final_row_count} rows")
            
            # Create summary sheet
            if removal_summary:
                summary_df = pd.DataFrame(removal_summary)
                summary_sheet_name = f"Removal_Summary_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
                processed_sheets[summary_sheet_name] = summary_df
            else:
                # Create empty summary if no removals
                summary_df = pd.DataFrame({
                    "sheet": [],
                    "column": [],
                    "condition": [],
                    "value": [],
                    "removed_count": [],
                    "timestamp": []
                })
                summary_sheet_name = f"Removal_Summary_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
                processed_sheets[summary_sheet_name] = summary_df
            
            # Get input file's original filename from metadata
            input_original_filename = filename  # Default to UUID filename
            try:
                # Try to find metadata file for the input file
                input_file_stem = excel_file_path.stem
                metadata_file = input_path / f"{input_file_stem}_metadata.json"
                if metadata_file.exists():
                    with open(metadata_file, 'r', encoding='utf-8') as f:
                        input_metadata = json.load(f)
                        input_original_filename = input_metadata.get("original_filename", filename)
            except Exception as e:
                print(f"Warning: Could not read input file metadata: {e}")
            
            # Save processed Excel to output folder
            output_filename = f"processed_{filename}"
            output_file_path = output_path / output_filename
            
            with pd.ExcelWriter(str(output_file_path), engine='openpyxl') as writer:
                for sheet_name, df in processed_sheets.items():
                    df.to_excel(writer, sheet_name=sheet_name, index=False)
            
            # Create metadata JSON file for processed file
            try:
                from datetime import timezone
                processed_time = datetime.now(timezone.utc).isoformat()
                output_file_stem = output_file_path.stem
                
                processed_metadata = {
                    "original_filename": f"processed_{input_original_filename}",
                    "input_filename": input_original_filename,
                    "input_file": str(excel_file_path.relative_to(local_storage.base_path)),
                    "file_type": output_file_path.suffix.lstrip(".") if output_file_path.suffix else "xlsx",
                    "processed_time": processed_time,
                    "workflow_id": workflow_id,
                    "node_id": node_id,
                    "uuid_filename": output_filename,
                    "file_size": output_file_path.stat().st_size if output_file_path.exists() else 0,
                    "total_removals": len(removal_summary),
                    "sheets_processed": list(processed_sheets.keys()),
                    "summary_sheet": summary_sheet_name
                }
                
                # Save metadata JSON file alongside the processed file
                metadata_filename = f"{output_file_stem}_metadata.json"
                metadata_file_path = output_path / metadata_filename
                with open(metadata_file_path, 'w', encoding='utf-8') as f:
                    json.dump(processed_metadata, f, indent=2)
                print(f"Saved processed file metadata: {metadata_file_path}")
            except Exception as e:
                import traceback
                print(f"Warning: Could not save processed file metadata: {e}\n{traceback.format_exc()}")
                # Don't fail the processing if metadata save fails
            
            # Update node config
            node_config = node.config or {}
            node_config["outlier_rules"] = request.outlier_rules
            node_config["selected_columns"] = request.selected_columns
            node.config = node_config
            await db.commit()
            
            # Save node config to file in node folder
            try:
                node_config_to_save = {
                    "file_key": node_config.get("file_key"),
                    "filename": filename,
                    "selected_columns": request.selected_columns,
                    "outlier_rules": request.outlier_rules,
                    "available_sheets": list(excel_file.sheet_names) if excel_file else []
                }
                local_storage.save_node_config(workflow_id, node_id, node_config_to_save)
                print(f"Saved node config to: {local_storage.get_workflow_node_path(workflow_id, node_id) / 'config.json'}")
            except Exception as e:
                import traceback
                print(f"Warning: Could not save node config to file: {e}\n{traceback.format_exc()}")
            
            return {
                "workflow_id": workflow_id,
                "node_id": node_id,
                "original_file": str(excel_file_path.relative_to(local_storage.base_path)),
                "processed_file": str(output_file_path.relative_to(local_storage.base_path)),
                "filename": output_filename,
                "sheets_processed": list(processed_sheets.keys()),
                "summary_sheet": summary_sheet_name,
                "total_removals": len(removal_summary),
                "removal_summary": removal_summary
            }
        finally:
            excel_file.close()
            
    except Exception as e:
        import traceback
        print(f"Error processing Excel with outlier remover: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error processing Excel: {str(e)}")


# Download processed Excel file
@router.get("/workflows/{workflow_id}/nodes/{node_id}/download-processed")
async def download_processed_excel(
    workflow_id: str,
    node_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user)
):
    """Download the processed Excel file"""
    try:
        # Check workflow and node
        workflow_result = await db.execute(
            select(Workflow).where(Workflow.id == uuid.UUID(workflow_id))
        )
        workflow = workflow_result.scalar_one_or_none()
        
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")
        
        node_result = await db.execute(
            select(WorkflowNode).where(WorkflowNode.id == uuid.UUID(node_id))
        )
        node = node_result.scalar_one_or_none()
        
        if not node or str(node.workflow_id) != workflow_id:
            raise HTTPException(status_code=404, detail="Node not found")
        
        if node.module_type != "outlier_remover":
            raise HTTPException(status_code=400, detail="Node is not an outlier remover node")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid ID format: {str(e)}")
    except Exception as e:
        import traceback
        print(f"Error checking workflow/node: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error checking workflow/node: {str(e)}")
    
    # Get processed file
    try:
        from fastapi.responses import FileResponse
        
        node_path = local_storage.get_workflow_node_path(workflow_id, node_id)
        output_path = node_path / "output"
        
        # Find processed Excel file
        excel_files = list(output_path.glob("processed_*.xlsx")) + list(output_path.glob("processed_*.xls"))
        
        if not excel_files:
            raise HTTPException(status_code=404, detail="No processed Excel file found")
        
        processed_file = excel_files[0]
        
        return FileResponse(
            path=str(processed_file),
            filename=processed_file.name,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
    except Exception as e:
        import traceback
        print(f"Error downloading processed Excel: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error downloading file: {str(e)}")


# ==================== DuckDB Outlier Remover Endpoints ====================

# Get DuckDB data (list tables and get table data)
@router.get("/workflows/{workflow_id}/nodes/{node_id}/duckdb-data")
async def get_duckdb_data(
    workflow_id: str,
    node_id: str,
    table_name: Optional[str] = Query(None, description="Table name to get data from"),
    file_path: Optional[str] = Query(None, description="DuckDB file path (filename only)"),
    version: str = Query("original", description="Version: 'original' or 'processed'"),
    load_all: Optional[bool] = Query(False, description="Load all rows (default: first 50)"),
    limit: int = Query(50, description="Number of rows to load (default: 50)"),
    offset: int = Query(0, description="Row offset for pagination"),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user)
):
    """Get DuckDB data - list tables or get table data"""
    try:
        # Check workflow and node
        workflow_result = await db.execute(
            select(Workflow).where(Workflow.id == uuid.UUID(workflow_id))
        )
        workflow = workflow_result.scalar_one_or_none()
        
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")
        
        node_result = await db.execute(
            select(WorkflowNode).where(WorkflowNode.id == uuid.UUID(node_id))
        )
        node = node_result.scalar_one_or_none()
        
        if not node or str(node.workflow_id) != workflow_id:
            raise HTTPException(status_code=404, detail="Node not found")
        
        if node.module_type != "outlier_remover_duckdb":
            raise HTTPException(status_code=400, detail="Node is not an outlier remover DuckDB node")
        
        node_path = local_storage.get_workflow_node_path(workflow_id, node_id)
        
        if version == "processed":
            # Look for processed file in output folder
            output_path = node_path / "output"
            if not output_path.exists():
                return {
                    "workflow_id": workflow_id,
                    "node_id": node_id,
                    "tables": [],
                    "message": "No processed DuckDB file found - output folder does not exist"
                }
            
            duckdb_files = list(output_path.glob("*.duckdb"))
            
            # When viewing processed files, file_path refers to the input file filename
            if file_path:
                input_path = node_path / "input"
                input_file_path = input_path / file_path
                if input_file_path.exists():
                    current_input_file = str(input_file_path.relative_to(local_storage.base_path))
                    
                    # Find processed file that matches this input file
                    matched_files = []
                    for duckdb_file in duckdb_files:
                        try:
                            file_stem = duckdb_file.stem
                            metadata_file = output_path / f"{file_stem}_metadata.json"
                            if metadata_file.exists():
                                with open(metadata_file, 'r', encoding='utf-8') as f:
                                    metadata = json.load(f)
                                    processed_input_file = metadata.get("input_file")
                                    if processed_input_file:
                                        processed_path_normalized = str(Path(processed_input_file)).replace('\\', '/')
                                        current_path_normalized = str(Path(current_input_file)).replace('\\', '/')
                                        processed_filename = Path(processed_input_file).name
                                        current_filename = Path(current_input_file).name
                                        
                                        if processed_path_normalized == current_path_normalized or processed_filename == current_filename:
                                            matched_files.append(duckdb_file)
                        except Exception as e:
                            print(f"Warning: Could not read metadata for {duckdb_file}: {e}")
                            continue
                    
                    if matched_files:
                        duckdb_files = matched_files
                    else:
                        return {
                            "workflow_id": workflow_id,
                            "node_id": node_id,
                            "tables": [],
                            "message": "No processed file found for the current input file. Please process the file first.",
                            "version": version
                        }
        else:
            # Original file from input folder
            input_path = node_path / "input"
            if not input_path.exists():
                return {
                    "workflow_id": workflow_id,
                    "node_id": node_id,
                    "tables": [],
                    "message": "No input DuckDB file found"
                }
            
            duckdb_files = list(input_path.glob("*.duckdb"))
            
            if file_path:
                file_path_obj = Path(file_path)
                if file_path_obj.is_absolute():
                    duckdb_file_path = file_path_obj
                else:
                    duckdb_file_path = input_path / file_path
                if duckdb_file_path.exists() and duckdb_file_path.is_file():
                    duckdb_files = [duckdb_file_path]
        
        if not duckdb_files:
            return {
                "workflow_id": workflow_id,
                "node_id": node_id,
                "tables": [],
                "message": "No DuckDB file found"
            }
        
        # Use first file
        duckdb_file_path = duckdb_files[0]
        
        # Connect to DuckDB
        import duckdb
        conn = duckdb.connect(str(duckdb_file_path), read_only=True)
        
        try:
            # Get list of tables
            tables_result = conn.execute("SHOW TABLES").fetchall()
            table_names = [row[0] for row in tables_result]
            
            if not table_name:
                # Return list of tables
                tables_info = []
                for tbl_name in table_names:
                    # Get row count and columns for each table
                    try:
                        row_count = conn.execute(f"SELECT COUNT(*) FROM {tbl_name}").fetchone()[0]
                        columns_result = conn.execute(f"DESCRIBE {tbl_name}").fetchall()
                        columns = [col[0] for col in columns_result]
                        tables_info.append({
                            "name": tbl_name,
                            "row_count": row_count,
                            "columns": columns
                        })
                    except Exception as e:
                        print(f"Error getting info for table {tbl_name}: {e}")
                        tables_info.append({
                            "name": tbl_name,
                            "row_count": 0,
                            "columns": []
                        })
                
                return {
                    "workflow_id": workflow_id,
                    "node_id": node_id,
                    "tables": tables_info,
                    "file_path": str(duckdb_file_path.relative_to(local_storage.base_path)),
                    "version": version
                }
            else:
                # Get data from specific table
                if table_name not in table_names:
                    return {
                        "workflow_id": workflow_id,
                        "node_id": node_id,
                        "tables": [],
                        "message": f"Table '{table_name}' not found"
                    }
                
                # Get columns
                columns_result = conn.execute(f"DESCRIBE {table_name}").fetchall()
                columns = [col[0] for col in columns_result]
                
                # Get total row count
                total_rows = conn.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()[0]
                
                # Get data with pagination
                if load_all:
                    df = conn.execute(f"SELECT * FROM {table_name}").df()
                else:
                    df = conn.execute(f"SELECT * FROM {table_name} LIMIT {limit} OFFSET {offset}").df()
                
                # Convert to list of dictionaries
                data = []
                for _, row in df.iterrows():
                    row_dict = {}
                    for col in columns:
                        value = row[col]
                        if pd.isna(value):
                            row_dict[col] = None
                        else:
                            row_dict[col] = str(value)
                    data.append(row_dict)
                
                return {
                    "workflow_id": workflow_id,
                    "node_id": node_id,
                    "table_name": table_name,
                    "columns": columns,
                    "data": data,
                    "total_rows": int(total_rows),
                    "displayed_rows": len(data),
                    "limit": limit if not load_all else total_rows,
                    "offset": offset,
                    "version": version
                }
        finally:
            conn.close()
            
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"Error getting DuckDB data: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error getting DuckDB data: {str(e)}")


# Process DuckDB file with outlier remover
class OutlierRemoverDuckDBRequest(BaseModel):
    outlier_rules: List[Dict[str, Any]]
    selected_columns: Optional[Dict[str, List[str]]] = None  # Deprecated: columns are now specified in rules
    file_key: Optional[str] = None  # Optional: specify which input file to process

# Progress tracking storage (in-memory, could be moved to Redis for production)
duckdb_progress_store: Dict[str, Dict[str, Any]] = {}

@router.post("/workflows/{workflow_id}/nodes/{node_id}/process-outlier-remover-duckdb")
async def process_outlier_remover_duckdb(
    workflow_id: str,
    node_id: str,
    request: OutlierRemoverDuckDBRequest = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user)
):
    """Process DuckDB file by removing outliers based on rules and generate summary table"""
    progress_key = f"{workflow_id}_{node_id}"
    duckdb_progress_store[progress_key] = {"status": "processing", "progress": 0, "message": "Starting processing..."}
    
    try:
        # Check workflow and node
        workflow_result = await db.execute(
            select(Workflow).where(Workflow.id == uuid.UUID(workflow_id))
        )
        workflow = workflow_result.scalar_one_or_none()
        
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")
        
        node_result = await db.execute(
            select(WorkflowNode).where(WorkflowNode.id == uuid.UUID(node_id))
        )
        node = node_result.scalar_one_or_none()
        
        if not node or str(node.workflow_id) != workflow_id:
            raise HTTPException(status_code=404, detail="Node not found")
        
        if node.module_type != "outlier_remover_duckdb":
            raise HTTPException(status_code=400, detail="Node is not an outlier remover DuckDB node")
    except ValueError as e:
        duckdb_progress_store[progress_key] = {"status": "error", "progress": 0, "message": f"Invalid ID format: {str(e)}"}
        raise HTTPException(status_code=400, detail=f"Invalid ID format: {str(e)}")
    except Exception as e:
        import traceback
        duckdb_progress_store[progress_key] = {"status": "error", "progress": 0, "message": f"Error checking workflow/node: {str(e)}"}
        print(f"Error checking workflow/node: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error checking workflow/node: {str(e)}")
    
    # Process DuckDB file
    try:
        import numpy as np
        from datetime import datetime
        import duckdb
        
        duckdb_progress_store[progress_key] = {"status": "processing", "progress": 10, "message": "Loading DuckDB file..."}
        
        node_path = local_storage.get_workflow_node_path(workflow_id, node_id)
        input_path = node_path / "input"
        output_path = node_path / "output"
        output_path.mkdir(parents=True, exist_ok=True)
        
        # Get the current input file from request or node config
        file_key = request.file_key
        if not file_key:
            node_config = node.config or {}
            file_key = node_config.get("file_key")
            if not file_key:
                try:
                    config_file = local_storage.load_node_config(workflow_id, node_id)
                    if config_file:
                        file_key = config_file.get("file_key")
                except Exception as e:
                    print(f"Warning: Could not load config file: {e}")
        
        # Find DuckDB file in input folder
        duckdb_files = list(input_path.glob("*.duckdb"))
        
        if not duckdb_files:
            duckdb_progress_store[progress_key] = {"status": "error", "progress": 0, "message": "No DuckDB file found in input folder"}
            raise HTTPException(status_code=404, detail="No DuckDB file found in input folder")
        
        # If file_key is specified, use that file
        duckdb_file_path = None
        if file_key:
            filename_from_key = file_key.split('/')[-1] if '/' in file_key else file_key
            potential_path = input_path / filename_from_key
            if potential_path.exists() and potential_path.is_file():
                duckdb_file_path = potential_path
            else:
                if file_key:
                    duckdb_progress_store[progress_key] = {"status": "error", "progress": 0, "message": f"File specified in file_key not found"}
                    raise HTTPException(status_code=404, detail=f"File specified in file_key ({file_key}) not found")
        
        if not duckdb_file_path:
            duckdb_file_path = duckdb_files[0]
        
        filename = duckdb_file_path.name
        input_original_filename = filename
        
        duckdb_progress_store[progress_key] = {"status": "processing", "progress": 20, "message": "Connecting to DuckDB..."}
        
        # Connect to input DuckDB
        conn = duckdb.connect(str(duckdb_file_path), read_only=True)
        
        try:
            # Get list of tables
            tables_result = conn.execute("SHOW TABLES").fetchall()
            table_names = [row[0] for row in tables_result]
            
            if not table_names:
                duckdb_progress_store[progress_key] = {"status": "error", "progress": 0, "message": "No tables found in DuckDB file"}
                raise HTTPException(status_code=400, detail="No tables found in DuckDB file")
            
            duckdb_progress_store[progress_key] = {"status": "processing", "progress": 30, "message": f"Processing {len(table_names)} tables..."}
            
            # Create output DuckDB database
            import tempfile
            import os
            # Generate a unique temp file path - DuckDB will create the file
            temp_dir = tempfile.gettempdir()
            temp_filename = f"duckdb_output_{uuid.uuid4().hex}.duckdb"
            temp_output_path = os.path.join(temp_dir, temp_filename)
            
            output_conn = duckdb.connect(temp_output_path)
            removal_summary = []
            processed_tables = {}
            
            total_tables = len(table_names)
            for table_idx, table_name in enumerate(table_names):
                progress_pct = 30 + int((table_idx / total_tables) * 50)
                duckdb_progress_store[progress_key] = {"status": "processing", "progress": progress_pct, "message": f"Processing table {table_name} ({table_idx + 1}/{total_tables})..."}
                
                # Read table into pandas DataFrame for processing
                df = conn.execute(f"SELECT * FROM {table_name}").df()
                original_row_count = len(df)
                
                # Apply outlier removal rules in sequence order
                # Sort rules by sequence (if present) to ensure correct application order
                sorted_rules = sorted(
                    request.outlier_rules,
                    key=lambda r: r.get("sequence", 999)  # Rules without sequence go last
                )
                
                for rule in sorted_rules:
                    condition = rule.get("condition")
                    value = rule.get("value")
                    action = rule.get("action", "clear_cell")
                    
                    # Support new format (sheets/columns arrays) and legacy format (sheet/column)
                    rule_sheets = rule.get("sheets")  # New format: array of sheet names
                    rule_columns = rule.get("columns")  # New format: {sheetName: [columnNames]}
                    rule_table = rule.get("sheet")  # Legacy format: single sheet
                    column = rule.get("column")  # Legacy format: single column
                    
                    # Determine if this rule applies to the current table
                    should_apply = False
                    if rule_sheets:
                        # New format: check if current table is in sheets array
                        if table_name in rule_sheets:
                            should_apply = True
                    elif rule_table:
                        # Legacy format: check if matches current table
                        if rule_table == table_name:
                            should_apply = True
                    else:
                        # No sheet specified = applies to all tables
                        should_apply = True
                    
                    if not should_apply:
                        continue
                    
                    # Determine which columns to apply the rule to
                    columns_to_process = []
                    if rule_sheets and rule_columns and table_name in rule_columns:
                        # New format: specific columns for this sheet
                        selected_columns = rule_columns.get(table_name, [])
                        if selected_columns:
                            # Only process selected columns that exist in the table
                            columns_to_process = [col for col in selected_columns if col in df.columns]
                        else:
                            # No columns specified for this sheet = all columns
                            columns_to_process = list(df.columns)
                    elif rule_sheets:
                        # New format: all columns for this sheet
                        columns_to_process = list(df.columns)
                    elif column:
                        # Legacy format: specific column
                        if column in df.columns:
                            columns_to_process = [column]
                    else:
                        # No column specified = all columns in the table
                        columns_to_process = list(df.columns)
                    
                    all_rows_to_remove = set()
                    
                    for col in columns_to_process:
                        try:
                            removed_count = 0
                            rows_to_remove = set()
                            
                            if condition == "greater_than":
                                try:
                                    num_value = float(value)
                                    mask = df[col] > num_value
                                    removed_count = mask.sum()
                                    if action == "remove_row":
                                        rows_to_remove.update(df[mask].index.tolist())
                                    else:
                                        df.loc[mask, col] = np.nan
                                except (ValueError, TypeError):
                                    pass
                            
                            elif condition == "less_than":
                                try:
                                    num_value = float(value)
                                    mask = df[col] < num_value
                                    removed_count = mask.sum()
                                    if action == "remove_row":
                                        rows_to_remove.update(df[mask].index.tolist())
                                    else:
                                        df.loc[mask, col] = np.nan
                                except (ValueError, TypeError):
                                    pass
                            
                            elif condition == "equals":
                                try:
                                    num_value = float(value)
                                    if pd.api.types.is_numeric_dtype(df[col]):
                                        mask = (df[col] == num_value) & df[col].notna()
                                    else:
                                        mask = (df[col].astype(str) == str(value)) & df[col].notna()
                                except (ValueError, TypeError):
                                    mask = (df[col].astype(str) == str(value)) & df[col].notna()
                                
                                removed_count = mask.sum()
                                if action == "remove_row":
                                    rows_to_remove.update(df[mask].index.tolist())
                                else:
                                    df.loc[mask, col] = np.nan
                            
                            elif condition == "contains":
                                if isinstance(value, str):
                                    mask = df[col].astype(str).str.contains(value, na=False)
                                    removed_count = mask.sum()
                                    if action == "remove_row":
                                        rows_to_remove.update(df[mask].index.tolist())
                                    else:
                                        df.loc[mask, col] = np.nan
                            
                            elif condition == "iqr":
                                # IQR-based outlier detection
                                try:
                                    multiplier = float(value) if value else 1.5
                                    # Get numeric values only (exclude NaN)
                                    numeric_values = pd.to_numeric(df[col], errors='coerce')
                                    numeric_values_clean = numeric_values.dropna()
                                    
                                    if len(numeric_values_clean) > 0:
                                        q1 = numeric_values_clean.quantile(0.25)
                                        q3 = numeric_values_clean.quantile(0.75)
                                        iqr = q3 - q1
                                        
                                        lower_bound = q1 - multiplier * iqr
                                        upper_bound = q3 + multiplier * iqr
                                        
                                        # Mark values outside bounds as outliers
                                        mask = (numeric_values < lower_bound) | (numeric_values > upper_bound)
                                        removed_count = mask.sum()
                                        
                                        if action == "remove_row":
                                            rows_to_remove.update(df[mask].index.tolist())
                                        else:
                                            df.loc[mask, col] = np.nan
                                except (ValueError, TypeError) as e:
                                    print(f"Error in IQR calculation for column {col}: {e}")
                                    pass
                            
                            elif condition == "sigma":
                                # Sigma (standard deviation) based outlier detection
                                try:
                                    multiplier = float(value) if value else 3.0
                                    # Get numeric values only (exclude NaN)
                                    numeric_values = pd.to_numeric(df[col], errors='coerce')
                                    numeric_values_clean = numeric_values.dropna()
                                    
                                    if len(numeric_values_clean) > 0:
                                        mean_val = numeric_values_clean.mean()
                                        std_val = numeric_values_clean.std()
                                        
                                        if std_val > 0:  # Avoid division by zero
                                            lower_bound = mean_val - multiplier * std_val
                                            upper_bound = mean_val + multiplier * std_val
                                            
                                            # Mark values outside bounds as outliers
                                            mask = (numeric_values < lower_bound) | (numeric_values > upper_bound)
                                            removed_count = mask.sum()
                                            
                                            if action == "remove_row":
                                                rows_to_remove.update(df[mask].index.tolist())
                                            else:
                                                df.loc[mask, col] = np.nan
                                except (ValueError, TypeError) as e:
                                    print(f"Error in sigma calculation for column {col}: {e}")
                                    pass
                            
                            elif condition == "standardized_to_nominal":
                                # Standardize to nominal: calculate mean and replace each value with (value - mean)
                                try:
                                    # Get numeric values only (exclude NaN)
                                    numeric_values = pd.to_numeric(df[col], errors='coerce')
                                    numeric_values_clean = numeric_values.dropna()
                                    
                                    if len(numeric_values_clean) > 0:
                                        mean_val = numeric_values_clean.mean()
                                        # Replace each value with (value - mean)
                                        df[col] = numeric_values - mean_val
                                        removed_count = len(numeric_values_clean)  # Count of standardized values
                                except (ValueError, TypeError) as e:
                                    print(f"Error in standardization for column {col}: {e}")
                                    pass
                            
                            # Collect rows to remove (not applicable for standardized_to_nominal)
                            if condition != "standardized_to_nominal" and action == "remove_row":
                                all_rows_to_remove.update(rows_to_remove)
                            
                            if removed_count > 0:
                                removal_summary.append({
                                    "table": table_name,
                                    "column": col,
                                    "condition": condition,
                                    "value": str(value) if condition != "standardized_to_nominal" else "N/A",
                                    "action": action if condition != "standardized_to_nominal" else "standardize",
                                    "removed_count": int(removed_count),
                                    "timestamp": datetime.now().isoformat()
                                })
                        
                        except Exception as e:
                            print(f"Error applying rule to column {col} in table {table_name}: {str(e)}")
                            continue
                    
                    if condition != "standardized_to_nominal" and action == "remove_row" and all_rows_to_remove:
                        df = df.drop(index=list(all_rows_to_remove))
                        df = df.reset_index(drop=True)
                
                # Write processed table to output database
                output_conn.register('temp_df', df)
                output_conn.execute(f"CREATE TABLE {table_name} AS SELECT * FROM temp_df")
                output_conn.unregister('temp_df')
                processed_tables[table_name] = df
            
            duckdb_progress_store[progress_key] = {"status": "processing", "progress": 85, "message": "Creating summary table..."}
            
            # Create summary table
            if removal_summary:
                summary_df = pd.DataFrame(removal_summary)
                summary_table_name = f"Removal_Summary_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            else:
                summary_df = pd.DataFrame({
                    "table": [],
                    "column": [],
                    "condition": [],
                    "value": [],
                    "removed_count": [],
                    "timestamp": []
                })
                summary_table_name = f"Removal_Summary_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            
            output_conn.register('temp_summary_df', summary_df)
            output_conn.execute(f"CREATE TABLE {summary_table_name} AS SELECT * FROM temp_summary_df")
            output_conn.unregister('temp_summary_df')
            processed_tables[summary_table_name] = summary_df
            
            # Close connections before saving file
            output_conn.close()
            conn.close()
            
            duckdb_progress_store[progress_key] = {"status": "processing", "progress": 90, "message": "Saving processed file..."}
            
            # Generate output filename based on input filename
            # Remove "processed_" prefix if input file is already processed
            input_filename_base = filename
            if input_filename_base.startswith("processed_"):
                input_filename_base = input_filename_base[len("processed_"):]
            
            # Ensure it ends with .duckdb
            if not input_filename_base.endswith('.duckdb'):
                input_filename_base = f"{input_filename_base}.duckdb"
            
            output_filename = f"processed_{input_filename_base}"
            output_file_path = output_path / output_filename
            
            # Remove existing processed file if it exists (to replace it)
            if output_file_path.exists():
                output_file_path.unlink()
                # Also remove associated metadata file if it exists
                metadata_file_path = output_path / f"{output_file_path.stem}_metadata.json"
                if metadata_file_path.exists():
                    metadata_file_path.unlink()
            
            # Copy temp file to output
            import shutil
            shutil.copy2(temp_output_path, output_file_path)
            Path(temp_output_path).unlink(missing_ok=True)
            
            # Create metadata JSON file
            try:
                from datetime import timezone
                processed_time = datetime.now(timezone.utc).isoformat()
                output_file_stem = output_file_path.stem
                
                processed_metadata = {
                    "original_filename": output_filename,
                    "input_filename": input_original_filename,
                    "input_file": str(duckdb_file_path.relative_to(local_storage.base_path)),
                    "file_type": "duckdb",
                    "processed_time": processed_time,
                    "workflow_id": workflow_id,
                    "node_id": node_id,
                    "uuid_filename": output_filename,
                    "file_size": output_file_path.stat().st_size if output_file_path.exists() else 0,
                    "total_removals": len(removal_summary),
                    "tables_processed": list(processed_tables.keys()),
                    "summary_table": summary_table_name
                }
                
                metadata_filename = f"{output_file_stem}_metadata.json"
                metadata_file_path = output_path / metadata_filename
                with open(metadata_file_path, 'w', encoding='utf-8') as f:
                    json.dump(processed_metadata, f, indent=2)
                print(f"Saved processed file metadata: {metadata_file_path}")
            except Exception as e:
                import traceback
                print(f"Warning: Could not save processed file metadata: {e}\n{traceback.format_exc()}")
            
            # Update node config
            node_config = node.config or {}
            node_config["outlier_rules"] = request.outlier_rules
            node_config["selected_columns"] = request.selected_columns
            node.config = node_config
            await db.commit()
            
            # Save node config to file
            try:
                node_config_to_save = {
                    "file_key": node_config.get("file_key"),
                    "filename": filename,
                    "selected_columns": request.selected_columns,
                    "outlier_rules": request.outlier_rules,
                    "available_tables": table_names
                }
                local_storage.save_node_config(workflow_id, node_id, node_config_to_save)
            except Exception as e:
                import traceback
                print(f"Warning: Could not save node config to file: {e}\n{traceback.format_exc()}")
            
            duckdb_progress_store[progress_key] = {"status": "completed", "progress": 100, "message": "Processing completed successfully"}
            
            return {
                "workflow_id": workflow_id,
                "node_id": node_id,
                "original_file": str(duckdb_file_path.relative_to(local_storage.base_path)),
                "processed_file": str(output_file_path.relative_to(local_storage.base_path)),
                "filename": output_filename,
                "tables_processed": list(processed_tables.keys()),
                "summary_table": summary_table_name,
                "total_removals": len(removal_summary),
                "removal_summary": removal_summary
            }
        
        finally:
            if 'conn' in locals():
                try:
                    conn.close()
                except:
                    pass
            if 'output_conn' in locals():
                try:
                    output_conn.close()
                except:
                    pass
            
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        duckdb_progress_store[progress_key] = {"status": "error", "progress": 0, "message": f"Error processing DuckDB: {str(e)}"}
        print(f"Error processing DuckDB with outlier remover: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error processing DuckDB: {str(e)}")


# Get processing progress
@router.get("/workflows/{workflow_id}/nodes/{node_id}/duckdb-progress")
async def get_duckdb_progress(
    workflow_id: str,
    node_id: str,
    operation: Optional[str] = Query("process", description="Operation type: 'process' or 'convert'"),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user)
):
    """Get progress of DuckDB processing or conversion operation"""
    if operation == "convert":
        progress_key = f"{workflow_id}_{node_id}_convert"
    else:
        progress_key = f"{workflow_id}_{node_id}"
    progress = duckdb_progress_store.get(progress_key, {"status": "idle", "progress": 0, "message": "No operation in progress"})
    return progress


# Download processed DuckDB file
@router.get("/workflows/{workflow_id}/nodes/{node_id}/download-processed-duckdb")
async def download_processed_duckdb(
    workflow_id: str,
    node_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user)
):
    """Download the processed DuckDB file"""
    try:
        from fastapi.responses import FileResponse
        
        node_path = local_storage.get_workflow_node_path(workflow_id, node_id)
        output_path = node_path / "output"
        
        # Find processed DuckDB file
        duckdb_files = list(output_path.glob("processed_*.duckdb"))
        
        if not duckdb_files:
            raise HTTPException(status_code=404, detail="No processed DuckDB file found")
        
        # Get most recent file
        duckdb_file = max(duckdb_files, key=lambda p: p.stat().st_mtime)
        
        return FileResponse(
            path=str(duckdb_file),
            filename=duckdb_file.name,
            media_type="application/octet-stream"
        )
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"Error downloading DuckDB file: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error downloading file: {str(e)}")


# ==================== DuckDB2Norminal Endpoints ====================

# Get DuckDB data for normalization (list tables and get table data)
@router.get("/workflows/{workflow_id}/nodes/{node_id}/duckdb2norminal-data")
async def get_duckdb2norminal_data(
    workflow_id: str,
    node_id: str,
    table_name: Optional[str] = Query(None, description="Table name to get data from"),
    file_path: Optional[str] = Query(None, description="DuckDB file path (filename only)"),
    version: str = Query("original", description="Version: 'original' or 'processed'"),
    load_all: Optional[bool] = Query(False, description="Load all rows (default: first 50)"),
    limit: int = Query(50, description="Number of rows to load (default: 50)"),
    offset: int = Query(0, description="Row offset for pagination"),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user)
):
    """Get DuckDB data for normalization - list tables or get table data"""
    try:
        # Check workflow and node
        workflow_result = await db.execute(
            select(Workflow).where(Workflow.id == uuid.UUID(workflow_id))
        )
        workflow = workflow_result.scalar_one_or_none()
        
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")
        
        node_result = await db.execute(
            select(WorkflowNode).where(WorkflowNode.id == uuid.UUID(node_id))
        )
        node = node_result.scalar_one_or_none()
        
        if not node or str(node.workflow_id) != workflow_id:
            raise HTTPException(status_code=404, detail="Node not found")
        
        if node.module_type != "duckdb2norminal":
            raise HTTPException(status_code=400, detail="Node is not a DuckDB2Norminal node")
        
        node_path = local_storage.get_workflow_node_path(workflow_id, node_id)
        
        if version == "processed":
            # Look for processed file in output folder
            output_path = node_path / "output"
            if not output_path.exists():
                return {
                    "workflow_id": workflow_id,
                    "node_id": node_id,
                    "tables": [],
                    "message": "No processed DuckDB file found - output folder does not exist"
                }
            
            duckdb_files = list(output_path.glob("*.duckdb"))
            
            # When viewing processed files, file_path refers to the input file filename
            if file_path:
                input_path = node_path / "input"
                input_file_path = input_path / file_path
                if input_file_path.exists():
                    current_input_file = str(input_file_path.relative_to(local_storage.base_path))
                    
                    # Find processed file that matches this input file
                    matched_files = []
                    for duckdb_file in duckdb_files:
                        try:
                            file_stem = duckdb_file.stem
                            metadata_file = output_path / f"{file_stem}_metadata.json"
                            if metadata_file.exists():
                                with open(metadata_file, 'r', encoding='utf-8') as f:
                                    metadata = json.load(f)
                                    processed_input_file = metadata.get("input_file")
                                    if processed_input_file:
                                        processed_path_normalized = str(Path(processed_input_file)).replace('\\', '/')
                                        current_path_normalized = str(Path(current_input_file)).replace('\\', '/')
                                        processed_filename = Path(processed_input_file).name
                                        current_filename = Path(current_input_file).name
                                        
                                        if processed_path_normalized == current_path_normalized or processed_filename == current_filename:
                                            matched_files.append(duckdb_file)
                        except Exception as e:
                            print(f"Warning: Could not read metadata for {duckdb_file}: {e}")
                            continue
                    
                    if matched_files:
                        duckdb_files = matched_files
                    else:
                        return {
                            "workflow_id": workflow_id,
                            "node_id": node_id,
                            "tables": [],
                            "message": "No processed file found for the current input file. Please process the file first.",
                            "version": version
                        }
        else:
            # Original file from input folder
            input_path = node_path / "input"
            if not input_path.exists():
                return {
                    "workflow_id": workflow_id,
                    "node_id": node_id,
                    "tables": [],
                    "message": "No input DuckDB file found"
                }
            
            duckdb_files = list(input_path.glob("*.duckdb"))
            
            if file_path:
                file_path_obj = Path(file_path)
                if file_path_obj.is_absolute():
                    duckdb_file_path = file_path_obj
                else:
                    duckdb_file_path = input_path / file_path
                if duckdb_file_path.exists() and duckdb_file_path.is_file():
                    duckdb_files = [duckdb_file_path]
        
        if not duckdb_files:
            return {
                "workflow_id": workflow_id,
                "node_id": node_id,
                "tables": [],
                "message": "No DuckDB file found"
            }
        
        # Use first file
        duckdb_file_path = duckdb_files[0]
        
        # Connect to DuckDB
        import duckdb
        conn = duckdb.connect(str(duckdb_file_path), read_only=True)
        
        try:
            # Get list of tables
            tables_result = conn.execute("SHOW TABLES").fetchall()
            table_names = [row[0] for row in tables_result]
            
            if not table_name:
                # Return list of tables
                tables_info = []
                for tbl_name in table_names:
                    # Get row count and columns for each table
                    try:
                        row_count = conn.execute(f"SELECT COUNT(*) FROM {tbl_name}").fetchone()[0]
                        columns_result = conn.execute(f"DESCRIBE {tbl_name}").fetchall()
                        columns = [col[0] for col in columns_result]
                        tables_info.append({
                            "name": tbl_name,
                            "row_count": row_count,
                            "columns": columns
                        })
                    except Exception as e:
                        print(f"Error getting info for table {tbl_name}: {e}")
                        tables_info.append({
                            "name": tbl_name,
                            "row_count": 0,
                            "columns": []
                        })
                
                return {
                    "workflow_id": workflow_id,
                    "node_id": node_id,
                    "tables": tables_info,
                    "file_path": str(duckdb_file_path.relative_to(local_storage.base_path)),
                    "version": version
                }
            else:
                # Get data from specific table
                if table_name not in table_names:
                    return {
                        "workflow_id": workflow_id,
                        "node_id": node_id,
                        "tables": [],
                        "message": f"Table '{table_name}' not found"
                    }
                
                # Get columns
                columns_result = conn.execute(f"DESCRIBE {table_name}").fetchall()
                columns = [col[0] for col in columns_result]
                
                # Get total row count
                total_rows = conn.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()[0]
                
                # Get data with pagination
                if load_all:
                    df = conn.execute(f"SELECT * FROM {table_name}").df()
                else:
                    df = conn.execute(f"SELECT * FROM {table_name} LIMIT {limit} OFFSET {offset}").df()
                
                # Convert to list of dictionaries
                data = []
                for _, row in df.iterrows():
                    row_dict = {}
                    for col in columns:
                        value = row[col]
                        if pd.isna(value):
                            row_dict[col] = None
                        else:
                            row_dict[col] = str(value)
                    data.append(row_dict)
                
                return {
                    "workflow_id": workflow_id,
                    "node_id": node_id,
                    "table_name": table_name,
                    "columns": columns,
                    "data": data,
                    "total_rows": int(total_rows),
                    "displayed_rows": len(data),
                    "limit": limit if not load_all else total_rows,
                    "offset": offset,
                    "version": version
                }
        finally:
            conn.close()
            
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"Error getting DuckDB data for normalization: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error getting DuckDB data: {str(e)}")


# Process DuckDB file with normalization
class DuckDB2NorminalRequest(BaseModel):
    selected_columns: Dict[str, List[str]]  # {table_name: [column_names]}
    file_key: Optional[str] = None  # Optional: specify which input file to process

# Progress tracking storage for normalization
norminal_progress_store: Dict[str, Dict[str, Any]] = {}

@router.post("/workflows/{workflow_id}/nodes/{node_id}/process-duckdb2norminal")
async def process_duckdb2norminal(
    workflow_id: str,
    node_id: str,
    request: DuckDB2NorminalRequest = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user)
):
    """Process DuckDB file by normalizing selected columns (subtract mean from each value)"""
    progress_key = f"{workflow_id}_{node_id}_norminal"
    norminal_progress_store[progress_key] = {"status": "processing", "progress": 0, "message": "Starting normalization..."}
    
    try:
        # Check workflow and node
        workflow_result = await db.execute(
            select(Workflow).where(Workflow.id == uuid.UUID(workflow_id))
        )
        workflow = workflow_result.scalar_one_or_none()
        
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")
        
        node_result = await db.execute(
            select(WorkflowNode).where(WorkflowNode.id == uuid.UUID(node_id))
        )
        node = node_result.scalar_one_or_none()
        
        if not node or str(node.workflow_id) != workflow_id:
            raise HTTPException(status_code=404, detail="Node not found")
        
        if node.module_type != "duckdb2norminal":
            raise HTTPException(status_code=400, detail="Node is not a DuckDB2Norminal node")
    except ValueError as e:
        norminal_progress_store[progress_key] = {"status": "error", "progress": 0, "message": f"Invalid ID format: {str(e)}"}
        raise HTTPException(status_code=400, detail=f"Invalid ID format: {str(e)}")
    except Exception as e:
        import traceback
        norminal_progress_store[progress_key] = {"status": "error", "progress": 0, "message": f"Error checking workflow/node: {str(e)}"}
        print(f"Error checking workflow/node: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error checking workflow/node: {str(e)}")
    
    # Process DuckDB file
    try:
        import numpy as np
        from datetime import datetime
        import duckdb
        
        norminal_progress_store[progress_key] = {"status": "processing", "progress": 10, "message": "Loading DuckDB file..."}
        
        node_path = local_storage.get_workflow_node_path(workflow_id, node_id)
        input_path = node_path / "input"
        output_path = node_path / "output"
        output_path.mkdir(parents=True, exist_ok=True)
        
        # Get the current input file from request or node config
        file_key = request.file_key
        if not file_key:
            node_config = node.config or {}
            file_key = node_config.get("file_key")
            if not file_key:
                try:
                    config_file = local_storage.load_node_config(workflow_id, node_id)
                    if config_file:
                        file_key = config_file.get("file_key")
                except Exception as e:
                    print(f"Warning: Could not load config file: {e}")
        
        # Find DuckDB file in input folder
        duckdb_files = list(input_path.glob("*.duckdb"))
        
        if not duckdb_files:
            norminal_progress_store[progress_key] = {"status": "error", "progress": 0, "message": "No DuckDB file found in input folder"}
            raise HTTPException(status_code=404, detail="No DuckDB file found in input folder")
        
        # If file_key is specified, use that file
        duckdb_file_path = None
        if file_key:
            filename_from_key = file_key.split('/')[-1] if '/' in file_key else file_key
            potential_path = input_path / filename_from_key
            if potential_path.exists() and potential_path.is_file():
                duckdb_file_path = potential_path
            else:
                if file_key:
                    norminal_progress_store[progress_key] = {"status": "error", "progress": 0, "message": f"File specified in file_key not found"}
                    raise HTTPException(status_code=404, detail=f"File specified in file_key ({file_key}) not found")
        
        if not duckdb_file_path:
            duckdb_file_path = duckdb_files[0]
        
        filename = duckdb_file_path.name
        input_original_filename = filename
        
        norminal_progress_store[progress_key] = {"status": "processing", "progress": 20, "message": "Connecting to DuckDB..."}
        
        # Connect to input DuckDB
        conn = duckdb.connect(str(duckdb_file_path), read_only=True)
        
        try:
            # Get list of tables
            tables_result = conn.execute("SHOW TABLES").fetchall()
            table_names = [row[0] for row in tables_result]
            
            if not table_names:
                norminal_progress_store[progress_key] = {"status": "error", "progress": 0, "message": "No tables found in DuckDB file"}
                raise HTTPException(status_code=400, detail="No tables found in DuckDB file")
            
            norminal_progress_store[progress_key] = {"status": "processing", "progress": 30, "message": f"Processing {len(table_names)} tables..."}
            
            # Create output DuckDB database
            import tempfile
            import os
            # Generate a unique temp file path - DuckDB will create the file
            temp_dir = tempfile.gettempdir()
            temp_filename = f"duckdb_norminal_output_{uuid.uuid4().hex}.duckdb"
            temp_output_path = os.path.join(temp_dir, temp_filename)
            
            output_conn = duckdb.connect(temp_output_path)
            normalization_summary = []
            processed_tables = {}
            
            total_tables = len(table_names)
            for table_idx, table_name in enumerate(table_names):
                progress_pct = 30 + int((table_idx / total_tables) * 50)
                norminal_progress_store[progress_key] = {"status": "processing", "progress": progress_pct, "message": f"Processing table {table_name} ({table_idx + 1}/{total_tables})..."}
                
                # Read table into pandas DataFrame for processing
                df = conn.execute(f"SELECT * FROM {table_name}").df()
                
                # Get columns to normalize for this table
                columns_to_normalize = request.selected_columns.get(table_name, [])
                
                # If no columns specified, copy table as-is
                if not columns_to_normalize:
                    output_conn.register('temp_df', df)
                    output_conn.execute(f"CREATE TABLE {table_name} AS SELECT * FROM temp_df")
                    output_conn.unregister('temp_df')
                    processed_tables[table_name] = df
                    continue
                
                # Normalize each selected column
                for col in columns_to_normalize:
                    if col not in df.columns:
                        continue
                    
                    try:
                        # Convert to numeric, coercing errors to NaN
                        numeric_values = pd.to_numeric(df[col], errors='coerce')
                        
                        # Calculate mean (excluding NaN values)
                        mean_val = numeric_values.mean()
                        
                        # Skip if all values are NaN or mean is NaN
                        if pd.isna(mean_val):
                            continue
                        
                        # Normalize: subtract mean from each value
                        df[col] = numeric_values - mean_val
                        
                        # Record normalization in summary
                        normalization_summary.append({
                            "table": table_name,
                            "column": col,
                            "mean": float(mean_val),
                            "timestamp": datetime.now().isoformat()
                        })
                    
                    except Exception as e:
                        print(f"Error normalizing column {col} in table {table_name}: {str(e)}")
                        continue
                
                # Write processed table to output database
                output_conn.register('temp_df', df)
                output_conn.execute(f"CREATE TABLE {table_name} AS SELECT * FROM temp_df")
                output_conn.unregister('temp_df')
                processed_tables[table_name] = df
            
            # Create summary table
            if normalization_summary:
                summary_df = pd.DataFrame(normalization_summary)
                summary_table_name = f"Normalization_Summary_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            else:
                # Create empty summary if no normalizations
                summary_df = pd.DataFrame({
                    "table": [],
                    "column": [],
                    "mean": [],
                    "timestamp": []
                })
                summary_table_name = f"Normalization_Summary_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            
            output_conn.register('temp_summary_df', summary_df)
            output_conn.execute(f"CREATE TABLE {summary_table_name} AS SELECT * FROM temp_summary_df")
            output_conn.unregister('temp_summary_df')
            processed_tables[summary_table_name] = summary_df
            
            # Close output connection
            output_conn.close()
            
            # Generate output filename
            input_filename_base = input_original_filename
            if input_filename_base.startswith("processed_"):
                input_filename_base = input_filename_base[len("processed_"):]
            
            if not input_filename_base.endswith('.duckdb'):
                input_filename_base = f"{input_filename_base}.duckdb"
            
            output_filename = f"processed_{input_filename_base}"
            output_file_path = output_path / output_filename
            
            # Remove existing processed file if it exists
            if output_file_path.exists():
                output_file_path.unlink()
                metadata_file_path = output_path / f"{output_file_path.stem}_metadata.json"
                if metadata_file_path.exists():
                    metadata_file_path.unlink()
            
            # Copy temp file to output location
            import shutil
            shutil.copy2(temp_output_path, output_file_path)
            
            # Save metadata
            metadata = {
                "input_file": str(duckdb_file_path.relative_to(local_storage.base_path)),
                "output_file": str(output_file_path.relative_to(local_storage.base_path)),
                "filename": output_filename,
                "tables_processed": list(processed_tables.keys()),
                "summary_table": summary_table_name,
                "total_normalizations": len(normalization_summary),
                "normalization_summary": normalization_summary,
                "timestamp": datetime.now().isoformat()
            }
            
            metadata_file_path = output_path / f"{output_file_path.stem}_metadata.json"
            with open(metadata_file_path, 'w', encoding='utf-8') as f:
                json.dump(metadata, f, indent=2)
            
            # Clean up temp file
            os.unlink(temp_output_path)
            
            norminal_progress_store[progress_key] = {"status": "completed", "progress": 100, "message": "Normalization completed successfully"}
            
            return {
                "workflow_id": workflow_id,
                "node_id": node_id,
                "original_file": str(duckdb_file_path.relative_to(local_storage.base_path)),
                "processed_file": str(output_file_path.relative_to(local_storage.base_path)),
                "filename": output_filename,
                "tables_processed": list(processed_tables.keys()),
                "summary_table": summary_table_name,
                "total_normalizations": len(normalization_summary),
                "normalization_summary": normalization_summary
            }
        
        finally:
            if 'conn' in locals():
                try:
                    conn.close()
                except:
                    pass
            if 'output_conn' in locals():
                try:
                    output_conn.close()
                except:
                    pass
            
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        norminal_progress_store[progress_key] = {"status": "error", "progress": 0, "message": f"Error processing DuckDB: {str(e)}"}
        print(f"Error processing DuckDB with normalization: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error processing DuckDB: {str(e)}")


# Get normalization progress
@router.get("/workflows/{workflow_id}/nodes/{node_id}/duckdb2norminal-progress")
async def get_duckdb2norminal_progress(
    workflow_id: str,
    node_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user)
):
    """Get progress of DuckDB normalization operation"""
    progress_key = f"{workflow_id}_{node_id}_norminal"
    progress = norminal_progress_store.get(progress_key, {"status": "idle", "progress": 0, "message": "No operation in progress"})
    return progress


# Download converted DuckDB file (for duckdb_convert module)
@router.get("/workflows/{workflow_id}/nodes/{node_id}/download-duckdb")
async def download_duckdb(
    workflow_id: str,
    node_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user)
):
    """Download the converted DuckDB file from duckdb_convert module"""
    try:
        from fastapi.responses import FileResponse
        
        # Check workflow and node exist
        workflow_result = await db.execute(
            select(Workflow).where(Workflow.id == uuid.UUID(workflow_id))
        )
        workflow = workflow_result.scalar_one_or_none()
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")
        
        node_result = await db.execute(
            select(WorkflowNode).where(WorkflowNode.id == uuid.UUID(node_id))
        )
        node = node_result.scalar_one_or_none()
        if not node:
            raise HTTPException(status_code=404, detail="Node not found")
        
        if str(node.workflow_id) != workflow_id:
            raise HTTPException(
                status_code=400, 
                detail=f"Node {node_id} does not belong to workflow {workflow_id}"
            )
        
        node_path = local_storage.get_workflow_node_path(workflow_id, node_id)
        output_path = node_path / "output"
        
        # Find converted DuckDB files (excel2duckdb_*.duckdb pattern)
        duckdb_files = list(output_path.glob("excel2duckdb_*.duckdb"))
        
        if not duckdb_files:
            raise HTTPException(status_code=404, detail="No converted DuckDB file found. Please execute conversion first.")
        
        # Get most recent file
        duckdb_file = max(duckdb_files, key=lambda p: p.stat().st_mtime)
        
        return FileResponse(
            path=str(duckdb_file),
            filename=duckdb_file.name,
            media_type="application/octet-stream"
        )
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"Error downloading DuckDB file: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error downloading file: {str(e)}")


# Move output to next node endpoint
@router.post("/workflows/{workflow_id}/nodes/{node_id}/move-to-next-node")
async def move_to_next_node(
    workflow_id: str,
    node_id: str,
    next_module_type: str = Body(..., embed=True, description="Module type for the next node: 'outlier_remover_duckdb' or 'duckdb2jmp'"),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user)
):
    """Move the output DuckDB file from current node to a new node's input folder"""
    try:
        import shutil
        from pathlib import Path
        
        # Check workflow and source node exist
        workflow_result = await db.execute(
            select(Workflow).where(Workflow.id == uuid.UUID(workflow_id))
        )
        workflow = workflow_result.scalar_one_or_none()
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")
        
        source_node_result = await db.execute(
            select(WorkflowNode).where(WorkflowNode.id == uuid.UUID(node_id))
        )
        source_node = source_node_result.scalar_one_or_none()
        if not source_node:
            raise HTTPException(status_code=404, detail="Source node not found")
        
        if str(source_node.workflow_id) != workflow_id:
            raise HTTPException(
                status_code=400, 
                detail=f"Node {node_id} does not belong to workflow {workflow_id}"
            )
        
        # Validate next_module_type based on source node type
        if source_node.module_type == "duckdb_convert":
            # DuckDB converter can move to outlier_remover_duckdb or duckdb2jmp
            if next_module_type not in ['outlier_remover_duckdb', 'duckdb2jmp']:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Invalid module type '{next_module_type}'. DuckDB converter can only move to 'outlier_remover_duckdb' or 'duckdb2jmp'"
                )
        elif source_node.module_type == "outlier_remover_duckdb":
            # Outlier remover can only move to duckdb2jmp
            if next_module_type != 'duckdb2jmp':
                raise HTTPException(
                    status_code=400, 
                    detail=f"Invalid module type '{next_module_type}'. Outlier remover can only move to 'duckdb2jmp'"
                )
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Source node type '{source_node.module_type}' is not supported for moving to next node."
            )
        
        # Get source node output path
        source_node_path = local_storage.get_workflow_node_path(workflow_id, node_id)
        source_output_path = source_node_path / "output"
        
        # Find DuckDB files based on source node type
        duckdb_files = []
        if source_node.module_type == "duckdb_convert":
            # DuckDB converter creates excel2duckdb_*.duckdb files
            duckdb_files = list(source_output_path.glob("excel2duckdb_*.duckdb"))
            if not duckdb_files:
                raise HTTPException(
                    status_code=404, 
                    detail="No converted DuckDB file found. Please execute conversion first."
                )
        elif source_node.module_type == "outlier_remover_duckdb":
            # Outlier remover creates processed_*.duckdb files
            duckdb_files = list(source_output_path.glob("processed_*.duckdb"))
            if not duckdb_files:
                raise HTTPException(
                    status_code=404, 
                    detail="No processed DuckDB file found. Please execute processing first."
                )
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Source node type '{source_node.module_type}' is not supported for moving to next node."
            )
        
        # Get most recent file
        source_duckdb_file = max(duckdb_files, key=lambda p: p.stat().st_mtime)
        
        # Get metadata from source output if available
        source_metadata = None
        source_metadata_file = source_output_path / f"{source_duckdb_file.stem}_metadata.json"
        if source_metadata_file.exists():
            try:
                with open(source_metadata_file, 'r', encoding='utf-8') as f:
                    source_metadata = json.load(f)
            except Exception as e:
                print(f"Error reading source metadata file: {str(e)}")
        
        # Get original filename from source metadata or use the file name
        original_filename = source_duckdb_file.name
        if source_metadata and source_metadata.get("input_files"):
            # Try to get original filename from first input file
            first_input = source_metadata["input_files"][0] if source_metadata["input_files"] else None
            if first_input and first_input.get("original_filename"):
                original_filename = first_input["original_filename"]
                # Change extension to .duckdb if needed
                if not original_filename.endswith('.duckdb'):
                    original_filename = Path(original_filename).stem + '.duckdb'
        
        # Create new node
        registry = get_registry()
        node_class = registry.get_node_class(next_module_type)
        if not node_class:
            raise HTTPException(status_code=400, detail=f"Unknown module type: {next_module_type}")
        
        # Generate unique module_id
        temp_node = node_class(str(uuid.uuid4()))
        module_display_name = temp_node.display_name.replace(' ', '_').lower()
        unique_module_id = f"{module_display_name}_{str(uuid.uuid4())}"
        
        # Get all nodes in the workflow to find the smallest available x position
        all_nodes_result = await db.execute(
            select(WorkflowNode).where(WorkflowNode.workflow_id == uuid.UUID(workflow_id))
        )
        all_nodes = all_nodes_result.scalars().all()
        
        # Get all x positions from all nodes (check all nodes' x positions)
        used_x_positions = set()
        for node in all_nodes:
            if node.position_x is not None:
                used_x_positions.add(node.position_x)
        
        # Find the smallest available x position (starting from 0)
        new_position_x = 0
        while new_position_x in used_x_positions:
            new_position_x += 1
        
        # Always set y=0
        new_position_y = 0
        
        # Create node
        new_node = WorkflowNode(
            workflow_id=uuid.UUID(workflow_id),
            module_type=next_module_type,
            module_id=unique_module_id,
            position_x=new_position_x,
            position_y=new_position_y,
            config={}
        )
        
        db.add(new_node)
        await db.commit()
        await db.refresh(new_node)
        
        # Create node folder structure
        new_node_path = local_storage.ensure_workflow_node_structure(workflow_id, str(new_node.id))
        new_node_input_path = new_node_path / "input"
        
        # Generate UUID for the copied file
        file_uuid = str(uuid.uuid4())
        uuid_filename = f"{file_uuid}.duckdb"
        dest_file_path = new_node_input_path / uuid_filename
        
        # Copy the DuckDB file to new node's input folder
        shutil.copy2(str(source_duckdb_file), str(dest_file_path))
        
        # Create metadata JSON for the new input file
        new_input_metadata = {
            "original_filename": original_filename,
            "file_type": "duckdb",
            "uploaded_time": datetime.now(timezone.utc).isoformat(),
            "workflow_id": workflow_id,
            "node_id": str(new_node.id),
            "uuid_filename": uuid_filename,
            "file_size": dest_file_path.stat().st_size,
            "source_node_id": node_id,
            "source_node_module_type": source_node.module_type,
            "source_workflow_id": workflow_id,
            "source_file_path": str(source_duckdb_file.relative_to(local_storage.base_path)),
            "source_metadata": source_metadata  # Include full source metadata for traceability
        }
        
        # Save metadata JSON file
        metadata_filename = f"{file_uuid}_metadata.json"
        metadata_path = new_node_input_path / metadata_filename
        with open(metadata_path, 'w', encoding='utf-8') as f:
            json.dump(new_input_metadata, f, indent=2)
        
        print(f"Copied DuckDB file from {source_duckdb_file} to {dest_file_path}")
        print(f"Saved metadata file: {metadata_path}")
        
        # Generate a checkpoint name for the new node based on module type
        checkpoint_name = next_module_type.replace('_', ' ').replace('duckdb', 'DuckDB').title()
        
        # Save workflow JSON to file to include the new node
        try:
            checkpoint_name_updates = {str(new_node.id): checkpoint_name}
            await save_workflow_json_to_file(workflow_id, db, checkpoint_name_updates)
        except Exception as e:
            # Log error but don't fail the request
            import traceback
            print(f"Warning: Could not save workflow JSON: {e}\n{traceback.format_exc()}")
        
        # Publish WebSocket update to notify clients about the new node
        try:
            await publish_workflow_update(workflow_id, {
                "type": "node_created",
                "workflow_id": workflow_id,
                "node": {
                    "id": str(new_node.id),
                    "workflow_id": str(new_node.workflow_id),
                    "module_type": new_node.module_type,
                    "module_id": new_node.module_id,
                    "checkpoint_name": checkpoint_name,
                    "position_x": new_node.position_x,
                    "position_y": new_node.position_y,
                    "config": new_node.config,
                    "state": new_node.state
                }
            })
        except Exception as e:
            # Log WebSocket error but don't fail the request
            import traceback
            print(f"Warning: Could not publish WebSocket update: {e}\n{traceback.format_exc()}")
        
        # Return the relative path from node folder (e.g., "input/uuid_filename.duckdb")
        file_relative_path = f"input/{uuid_filename}"
        
        return {
            "workflow_id": workflow_id,
            "source_node_id": node_id,
            "new_node_id": str(new_node.id),
            "new_node_module_type": next_module_type,
            "file_copied": file_relative_path,  # Return full relative path for file selection
            "original_filename": original_filename
        }
        
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"Error moving to next node: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error moving to next node: {str(e)}")


# Move output to existing node endpoint
@router.post("/workflows/{workflow_id}/nodes/{node_id}/move-to-existing-node")
async def move_to_existing_node(
    workflow_id: str,
    node_id: str,
    target_node_id: str = Body(..., embed=True, description="Target node ID to move the file to"),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user)
):
    """Move the output DuckDB file from current node to an existing node's input folder"""
    try:
        import shutil
        from pathlib import Path
        
        # Check workflow and source node exist
        workflow_result = await db.execute(
            select(Workflow).where(Workflow.id == uuid.UUID(workflow_id))
        )
        workflow = workflow_result.scalar_one_or_none()
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")
        
        source_node_result = await db.execute(
            select(WorkflowNode).where(WorkflowNode.id == uuid.UUID(node_id))
        )
        source_node = source_node_result.scalar_one_or_none()
        if not source_node:
            raise HTTPException(status_code=404, detail="Source node not found")
        
        if str(source_node.workflow_id) != workflow_id:
            raise HTTPException(
                status_code=400, 
                detail=f"Node {node_id} does not belong to workflow {workflow_id}"
            )
        
        # Check target node exists and belongs to the same workflow
        target_node_result = await db.execute(
            select(WorkflowNode).where(WorkflowNode.id == uuid.UUID(target_node_id))
        )
        target_node = target_node_result.scalar_one_or_none()
        if not target_node:
            raise HTTPException(status_code=404, detail="Target node not found")
        
        if str(target_node.workflow_id) != workflow_id:
            raise HTTPException(
                status_code=400, 
                detail=f"Target node {target_node_id} does not belong to workflow {workflow_id}"
            )
        
        # Validate target node module type based on source node type
        if source_node.module_type == "duckdb_convert":
            # DuckDB converter can move to outlier_remover_duckdb or duckdb2jmp
            if target_node.module_type not in ['outlier_remover_duckdb', 'duckdb2jmp']:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Invalid target module type '{target_node.module_type}'. DuckDB converter can only move to 'outlier_remover_duckdb' or 'duckdb2jmp'"
                )
        elif source_node.module_type == "outlier_remover_duckdb":
            # Outlier remover can only move to duckdb2jmp
            if target_node.module_type != 'duckdb2jmp':
                raise HTTPException(
                    status_code=400, 
                    detail=f"Invalid target module type '{target_node.module_type}'. Outlier remover can only move to 'duckdb2jmp'"
                )
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Source node type '{source_node.module_type}' is not supported for moving to existing node."
            )
        
        # Get source node output path
        source_node_path = local_storage.get_workflow_node_path(workflow_id, node_id)
        source_output_path = source_node_path / "output"
        
        # Find DuckDB files based on source node type
        duckdb_files = []
        if source_node.module_type == "duckdb_convert":
            # DuckDB converter creates excel2duckdb_*.duckdb files
            duckdb_files = list(source_output_path.glob("excel2duckdb_*.duckdb"))
            if not duckdb_files:
                raise HTTPException(
                    status_code=404, 
                    detail="No converted DuckDB file found. Please execute conversion first."
                )
        elif source_node.module_type == "outlier_remover_duckdb":
            # Outlier remover creates processed_*.duckdb files
            duckdb_files = list(source_output_path.glob("processed_*.duckdb"))
            if not duckdb_files:
                raise HTTPException(
                    status_code=404, 
                    detail="No processed DuckDB file found. Please execute processing first."
                )
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Source node type '{source_node.module_type}' is not supported for moving to existing node."
            )
        
        # Get most recent file
        source_duckdb_file = max(duckdb_files, key=lambda p: p.stat().st_mtime)
        
        # Get metadata from source output if available
        source_metadata = None
        source_metadata_file = source_output_path / f"{source_duckdb_file.stem}_metadata.json"
        if source_metadata_file.exists():
            try:
                with open(source_metadata_file, 'r', encoding='utf-8') as f:
                    source_metadata = json.load(f)
            except Exception as e:
                print(f"Error reading source metadata file: {str(e)}")
        
        # Get original filename from source metadata or use the file name
        original_filename = source_duckdb_file.name
        if source_metadata and source_metadata.get("input_files"):
            # Try to get original filename from first input file
            first_input = source_metadata["input_files"][0] if source_metadata["input_files"] else None
            if first_input and first_input.get("original_filename"):
                original_filename = first_input["original_filename"]
                # Change extension to .duckdb if needed
                if not original_filename.endswith('.duckdb'):
                    original_filename = Path(original_filename).stem + '.duckdb'
        
        # Ensure target node folder structure exists
        target_node_path = local_storage.ensure_workflow_node_structure(workflow_id, target_node_id)
        target_node_input_path = target_node_path / "input"
        
        # Generate UUID for the copied file
        file_uuid = str(uuid.uuid4())
        uuid_filename = f"{file_uuid}.duckdb"
        dest_file_path = target_node_input_path / uuid_filename
        
        # Copy the DuckDB file to target node's input folder
        shutil.copy2(str(source_duckdb_file), str(dest_file_path))
        
        # Create metadata JSON for the new input file
        new_input_metadata = {
            "original_filename": original_filename,
            "file_type": "duckdb",
            "uploaded_time": datetime.now(timezone.utc).isoformat(),
            "workflow_id": workflow_id,
            "node_id": target_node_id,
            "uuid_filename": uuid_filename,
            "file_size": dest_file_path.stat().st_size,
            "source_node_id": node_id,
            "source_node_module_type": source_node.module_type,
            "source_workflow_id": workflow_id,
            "source_file_path": str(source_duckdb_file.relative_to(local_storage.base_path)),
            "source_metadata": source_metadata  # Include full source metadata for traceability
        }
        
        # Save metadata JSON file
        metadata_filename = f"{file_uuid}_metadata.json"
        metadata_path = target_node_input_path / metadata_filename
        with open(metadata_path, 'w', encoding='utf-8') as f:
            json.dump(new_input_metadata, f, indent=2)
        
        print(f"Copied DuckDB file from {source_duckdb_file} to {dest_file_path}")
        print(f"Saved metadata file: {metadata_path}")
        
        # Return the relative path from node folder (e.g., "input/uuid_filename.duckdb")
        file_relative_path = f"input/{uuid_filename}"
        
        return {
            "workflow_id": workflow_id,
            "source_node_id": node_id,
            "target_node_id": target_node_id,
            "target_node_module_type": target_node.module_type,
            "file_copied": file_relative_path,  # Return full relative path for file selection
            "original_filename": original_filename
        }
        
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"Error moving to existing node: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error moving to existing node: {str(e)}")


# Convert processed DuckDB to CSV bundle
@router.post("/workflows/{workflow_id}/nodes/{node_id}/convert-duckdb-to-csv")
async def convert_duckdb_to_csv(
    workflow_id: str,
    node_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user)
):
    """Convert processed DuckDB file to a zipped collection of CSV files"""
    progress_key = f"{workflow_id}_{node_id}_convert"
    duckdb_progress_store[progress_key] = {"status": "processing", "progress": 0, "message": "Starting conversion..."}
    
    try:
        # Check workflow and node
        workflow_result = await db.execute(
            select(Workflow).where(Workflow.id == uuid.UUID(workflow_id))
        )
        workflow = workflow_result.scalar_one_or_none()
        
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")
        
        node_result = await db.execute(
            select(WorkflowNode).where(WorkflowNode.id == uuid.UUID(node_id))
        )
        node = node_result.scalar_one_or_none()
        
        if not node or str(node.workflow_id) != workflow_id:
            raise HTTPException(status_code=404, detail="Node not found")
        
        if node.module_type != "outlier_remover_duckdb":
            raise HTTPException(status_code=400, detail="Node is not an outlier remover DuckDB node")
        
        node_path = local_storage.get_workflow_node_path(workflow_id, node_id)
        output_path = node_path / "output"
        
        # Find processed DuckDB file
        duckdb_files = list(output_path.glob("processed_*.duckdb"))
        
        if not duckdb_files:
            duckdb_progress_store[progress_key] = {"status": "error", "progress": 0, "message": "No processed DuckDB file found"}
            raise HTTPException(status_code=404, detail="No processed DuckDB file found")
        
        duckdb_file = max(duckdb_files, key=lambda p: p.stat().st_mtime)
        
        duckdb_progress_store[progress_key] = {"status": "processing", "progress": 10, "message": "Connecting to DuckDB..."}
        
        # Connect to DuckDB and export tables to CSV
        import duckdb
        import tempfile
        import zipfile
        import shutil
        import re
        
        conn = duckdb.connect(str(duckdb_file), read_only=True)
        temp_dir = Path(tempfile.mkdtemp(prefix="duckdb_csv_export_"))
        csv_files: List[Path] = []
        
        try:
            tables_result = conn.execute("SHOW TABLES").fetchall()
            table_names = [row[0] for row in tables_result]
            
            if not table_names:
                duckdb_progress_store[progress_key] = {"status": "error", "progress": 0, "message": "No tables found in DuckDB file"}
                raise HTTPException(status_code=400, detail="No tables found in DuckDB file")
            
            duckdb_progress_store[progress_key] = {"status": "processing", "progress": 20, "message": f"Exporting {len(table_names)} tables to CSV..."}
            
            total_tables = len(table_names)
            name_counts: Dict[str, int] = {}
            
            for idx, table_name in enumerate(table_names, start=1):
                progress_pct = 20 + int((idx / total_tables) * 60)
                duckdb_progress_store[progress_key] = {
                    "status": "processing",
                    "progress": min(progress_pct, 80),
                    "message": f"Exporting table {table_name} ({idx}/{total_tables})..."
                }
                
                # Sanitize file name
                safe_name = re.sub(r"[^A-Za-z0-9_-]+", "_", table_name).strip("_") or "table"
                safe_name = safe_name[:100]  # keep names manageable
                count = name_counts.get(safe_name, 0)
                name_counts[safe_name] = count + 1
                if count > 0:
                    safe_name = f"{safe_name}_{count+1}"
                
                csv_path = temp_dir / f"{safe_name}.csv"
                # Quote identifier safely for DuckDB (wrap in double quotes, escape inner quotes)
                quoted_table_name = '"' + table_name.replace('"', '""') + '"'
                conn.execute(f"COPY (SELECT * FROM {quoted_table_name}) TO '{csv_path.as_posix()}' (FORMAT CSV, HEADER TRUE)")
                csv_files.append(csv_path)
            
            duckdb_progress_store[progress_key] = {"status": "processing", "progress": 90, "message": "Compressing CSV files..."}
            
            # Create zip archive
            zip_filename = f"{duckdb_file.stem}_tables.zip"
            zip_file_path = output_path / zip_filename
            if zip_file_path.exists():
                zip_file_path.unlink()
            
            with zipfile.ZipFile(zip_file_path, 'w', compression=zipfile.ZIP_DEFLATED, allowZip64=True) as zipf:
                for csv_file in csv_files:
                    zipf.write(csv_file, arcname=csv_file.name)
            
            duckdb_progress_store[progress_key] = {"status": "completed", "progress": 100, "message": "CSV package ready"}
            
            return {
                "workflow_id": workflow_id,
                "node_id": node_id,
                "csv_zip_file": str(zip_file_path.relative_to(local_storage.base_path)),
                "zip_filename": zip_filename,
                "tables_converted": table_names,
                "csv_count": len(csv_files)
            }
        
        finally:
            conn.close()
            shutil.rmtree(temp_dir, ignore_errors=True)
            
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        duckdb_progress_store[progress_key] = {"status": "error", "progress": 0, "message": f"Error converting DuckDB to CSV: {str(e)}"}
        print(f"Error converting DuckDB to CSV: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error converting DuckDB to CSV: {str(e)}")


# Download converted CSV zip file
@router.get("/workflows/{workflow_id}/nodes/{node_id}/download-csv-zip-from-duckdb")
async def download_csv_zip_from_duckdb(
    workflow_id: str,
    node_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_current_user)
):
    """Download the CSV zip file converted from DuckDB"""
    try:
        from fastapi.responses import FileResponse
        
        node_path = local_storage.get_workflow_node_path(workflow_id, node_id)
        output_path = node_path / "output"
        
        # Find CSV zip file
        zip_files = list(output_path.glob("processed_*_tables.zip"))
        
        if not zip_files:
            raise HTTPException(status_code=404, detail="No converted CSV zip file found. Please convert DuckDB to CSV first.")
        
        # Get most recent file
        zip_file = max(zip_files, key=lambda p: p.stat().st_mtime)
        
        return FileResponse(
            path=str(zip_file),
            filename=zip_file.name,
            media_type="application/zip"
        )
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"Error downloading CSV zip file: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error downloading file: {str(e)}")


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

