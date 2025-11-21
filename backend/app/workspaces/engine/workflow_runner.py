import asyncio
from typing import Dict, List, Any, Optional
from collections import deque
from app.workspaces.engine.node_base import BaseNode, NodeResult, IOManager, NodeRegistry, NodeGraphContext
from app.workspaces.engine.graph_manager import GraphManager
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.workspace import WorkflowNode, WorkflowConnection, WorkflowExecution, WorkflowExecutionStatus
import uuid


class WorkflowRunner:
    """Executes workflows by running nodes in topological order"""
    
    def __init__(self, db: AsyncSession, io_manager: IOManager, registry: NodeRegistry):
        self.db = db
        self.io_manager = io_manager
        self.registry = registry
    
    async def build_dag(self, workflow_id: str) -> tuple[Dict[str, WorkflowNode], Dict[str, List[str]]]:
        """
        Build a DAG from workflow nodes and connections.
        
        Returns:
            (nodes_dict, adjacency_list) where adjacency_list[node_id] = [connected_node_ids]
        """
        # Load all nodes
        nodes_result = await self.db.execute(
            select(WorkflowNode).where(WorkflowNode.workflow_id == uuid.UUID(workflow_id))
        )
        nodes = nodes_result.scalars().all()
        nodes_dict = {str(node.id): node for node in nodes}
        
        # Load all connections
        connections_result = await self.db.execute(
            select(WorkflowConnection).where(WorkflowConnection.workflow_id == uuid.UUID(workflow_id))
        )
        connections = connections_result.scalars().all()
        
        # Build adjacency list (source -> targets)
        adjacency: Dict[str, List[str]] = {node_id: [] for node_id in nodes_dict.keys()}
        in_degree: Dict[str, int] = {node_id: 0 for node_id in nodes_dict.keys()}
        
        for conn in connections:
            source_id = str(conn.source_node_id)
            target_id = str(conn.target_node_id)
            if source_id in adjacency and target_id in nodes_dict:
                adjacency[source_id].append(target_id)
                in_degree[target_id] = in_degree.get(target_id, 0) + 1
        
        return nodes_dict, adjacency
    
    async def build_graph_manager(self, workflow_id: str) -> GraphManager:
        """Build a GraphManager for the workflow"""
        # Load all nodes
        nodes_result = await self.db.execute(
            select(WorkflowNode).where(WorkflowNode.workflow_id == uuid.UUID(workflow_id))
        )
        nodes = nodes_result.scalars().all()
        
        # Load all connections
        connections_result = await self.db.execute(
            select(WorkflowConnection).where(WorkflowConnection.workflow_id == uuid.UUID(workflow_id))
        )
        connections = connections_result.scalars().all()
        
        return GraphManager(nodes, connections)
    
    def topological_sort(self, nodes_dict: Dict[str, WorkflowNode], adjacency: Dict[str, List[str]]) -> List[str]:
        """Topological sort of nodes for execution order"""
        in_degree = {node_id: 0 for node_id in nodes_dict.keys()}
        
        # Calculate in-degrees
        for source_id, targets in adjacency.items():
            for target_id in targets:
                in_degree[target_id] = in_degree.get(target_id, 0) + 1
        
        # Find nodes with no dependencies
        queue = deque([node_id for node_id, degree in in_degree.items() if degree == 0])
        result = []
        
        while queue:
            node_id = queue.popleft()
            result.append(node_id)
            
            # Reduce in-degree for connected nodes
            for target_id in adjacency.get(node_id, []):
                in_degree[target_id] -= 1
                if in_degree[target_id] == 0:
                    queue.append(target_id)
        
        # Check for cycles
        if len(result) != len(nodes_dict):
            raise ValueError("Workflow contains cycles or disconnected nodes")
        
        return result
    
    async def execute_workflow(
        self,
        workflow_id: str,
        workspace_id: Optional[str],
        execution_id: str,
        started_by: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Execute a workflow.
        
        Args:
            workflow_id: The workflow ID
            workspace_id: Optional workspace ID (for backward compatibility)
            execution_id: The execution ID
            started_by: Optional user ID who started the execution
            
        Returns:
            Execution results with node outputs and status
        """
        # Build GraphManager for graph-aware operations
        graph_manager = await self.build_graph_manager(workflow_id)
        nodes_dict = graph_manager.nodes
        
        if not nodes_dict:
            raise ValueError("Workflow has no nodes")
        
        # Topological sort
        execution_order = graph_manager.topological_sort()
        
        # Store node outputs for passing between nodes
        node_outputs: Dict[str, Dict[str, Any]] = {}
        execution_results: Dict[str, Any] = {
            "nodes": {},
            "status": "running"
        }
        
        try:
            # Execute nodes in order
            for node_id in execution_order:
                node = nodes_dict[node_id]
                
                # Get node class from registry
                node_class = self.registry.get_node_class(node.module_type)
                if not node_class:
                    raise ValueError(f"Unknown module type: {node.module_type}")
                
                # Get node context from graph manager
                node_context_data = graph_manager.get_node_context(node_id)
                
                # Build NodeGraphContext
                graph_context = None
                if node_context_data:
                    # Build downstream requirements from connections
                    downstream_requirements = {}
                    for succ_id in node_context_data.successors:
                        succ_node = nodes_dict[succ_id]
                        succ_node_class = self.registry.get_node_class(succ_node.module_type)
                        if succ_node_class:
                            succ_instance = succ_node_class(str(succ_node.id))
                            downstream_requirements[succ_id] = {
                                port.name: port.type.value
                                for port in succ_instance.inputs
                            }
                    
                    graph_context = NodeGraphContext(
                        node_id=node_id,
                        predecessors=node_context_data.predecessors,
                        successors=node_context_data.successors,
                        depth=node_context_data.depth,
                        execution_order=node_context_data.execution_order,
                        upstream_outputs=node_context_data.upstream_outputs,
                        downstream_requirements=downstream_requirements
                    )
                
                # Create node instance with graph context
                node_instance = node_class(node_id, node.config, graph_context)
                
                # Inject execution context into node config
                node_instance.config = {
                    **(node.config or {}),
                    "workflow_id": workflow_id,
                    "execution_id": execution_id,
                    "node_id": node_id
                }
                if workspace_id:
                    node_instance.config["workspace_id"] = workspace_id
                
                # Collect inputs from connected nodes
                inputs: Dict[str, Any] = {}
                
                # Find connections to this node
                connections_result = await self.db.execute(
                    select(WorkflowConnection).where(
                        WorkflowConnection.target_node_id == node.id
                    )
                )
                connections = connections_result.scalars().all()
                
                for conn in connections:
                    source_id = str(conn.source_node_id)
                    source_outputs = node_outputs.get(source_id, {})
                    
                    if conn.source_port in source_outputs:
                        inputs[conn.target_port] = source_outputs[conn.source_port]
                
                # Notify node of upstream changes (for dynamic config updates)
                for pred_id in node_context_data.predecessors if node_context_data else []:
                    pred_outputs = node_outputs.get(pred_id, {})
                    if pred_outputs:
                        node_instance.on_upstream_changed(pred_id, pred_outputs)
                
                # Execute node
                result = await node_instance.execute(inputs, self.io_manager)
                
                # Notify downstream nodes of changes (for dynamic config updates)
                for succ_id in node_context_data.successors if node_context_data else []:
                    succ_node = nodes_dict[succ_id]
                    succ_node_class = self.registry.get_node_class(succ_node.module_type)
                    if succ_node_class:
                        # Create temporary instance to notify
                        succ_context = graph_manager.get_node_context(succ_id)
                        succ_graph_context = None
                        if succ_context:
                            succ_graph_context = NodeGraphContext(
                                node_id=succ_id,
                                predecessors=succ_context.predecessors,
                                successors=succ_context.successors,
                                depth=succ_context.depth,
                                execution_order=succ_context.execution_order,
                                upstream_outputs=succ_context.upstream_outputs,
                                downstream_requirements={}
                            )
                        succ_instance = succ_node_class(str(succ_node.id), succ_node.config, succ_graph_context)
                        succ_instance.on_upstream_changed(node_id, result.outputs)
                
                # Store outputs
                node_outputs[node_id] = result.outputs
                
                # Update node state
                node.state = {
                    "success": result.success,
                    "outputs": result.outputs,
                    "error": result.error,
                    "metadata": result.metadata
                }
                
                execution_results["nodes"][node_id] = {
                    "success": result.success,
                    "outputs": result.outputs,
                    "error": result.error,
                    "metadata": result.metadata
                }
                
                # If node failed, stop execution
                if not result.success:
                    execution_results["status"] = "failed"
                    execution_results["error"] = f"Node {node.module_id} failed: {result.error}"
                    break
                
                # Save node state to database
                await self.db.commit()
            
            if execution_results["status"] != "failed":
                execution_results["status"] = "completed"
        
        except Exception as e:
            execution_results["status"] = "failed"
            execution_results["error"] = str(e)
            raise
        
        return execution_results

