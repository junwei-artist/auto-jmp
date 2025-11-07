"""
Graph Manager for workflow DAG operations.
Manages node relationships, dependencies, and graph structure.
"""
from typing import Dict, List, Set, Optional, Tuple
from collections import defaultdict, deque
from dataclasses import dataclass
from app.models.workspace import WorkflowNode, WorkflowConnection


@dataclass
class NodeContext:
    """Context information for a node in the workflow graph"""
    node_id: str
    node: WorkflowNode
    predecessors: List[str]  # Upstream node IDs
    successors: List[str]  # Downstream node IDs
    depth: int  # Depth in the DAG (0 for root nodes)
    execution_order: int  # Position in topological sort
    upstream_outputs: Dict[str, Dict[str, any]]  # node_id -> {port_name: value}
    downstream_inputs: Dict[str, Dict[str, any]]  # node_id -> {port_name: value}


class GraphManager:
    """Manages workflow graph structure and node relationships"""
    
    def __init__(self, nodes: List[WorkflowNode], connections: List[WorkflowConnection]):
        self.nodes = {str(node.id): node for node in nodes}
        self.connections = connections
        self._build_graph()
    
    def _build_graph(self):
        """Build internal graph structures"""
        # Forward adjacency: source -> targets
        self.forward_adj: Dict[str, List[str]] = defaultdict(list)
        # Reverse adjacency: target -> sources
        self.reverse_adj: Dict[str, List[str]] = defaultdict(list)
        # Connection details: (source_id, target_id) -> connection
        self.connection_map: Dict[Tuple[str, str], WorkflowConnection] = {}
        
        for conn in self.connections:
            source_id = str(conn.source_node_id)
            target_id = str(conn.target_node_id)
            
            if source_id in self.nodes and target_id in self.nodes:
                self.forward_adj[source_id].append(target_id)
                self.reverse_adj[target_id].append(source_id)
                self.connection_map[(source_id, target_id)] = conn
    
    def get_predecessors(self, node_id: str) -> List[str]:
        """Get all upstream/predecessor node IDs"""
        return self.reverse_adj.get(node_id, [])
    
    def get_successors(self, node_id: str) -> List[str]:
        """Get all downstream/successor node IDs"""
        return self.forward_adj.get(node_id, [])
    
    def get_connections_to(self, node_id: str) -> List[WorkflowConnection]:
        """Get all connections that target this node"""
        return [
            conn for (source, target), conn in self.connection_map.items()
            if target == node_id
        ]
    
    def get_connections_from(self, node_id: str) -> List[WorkflowConnection]:
        """Get all connections that originate from this node"""
        return [
            conn for (source, target), conn in self.connection_map.items()
            if source == node_id
        ]
    
    def get_node_context(self, node_id: str) -> Optional[NodeContext]:
        """Get full context for a node"""
        if node_id not in self.nodes:
            return None
        
        predecessors = self.get_predecessors(node_id)
        successors = self.get_successors(node_id)
        depth = self._calculate_depth(node_id)
        execution_order = self._calculate_execution_order(node_id)
        
        # Get upstream outputs structure
        upstream_outputs = {}
        for pred_id in predecessors:
            pred_node = self.nodes[pred_id]
            # Get connections from this predecessor to current node
            conns = [
                conn for conn in self.get_connections_from(pred_id)
                if str(conn.target_node_id) == node_id
            ]
            upstream_outputs[pred_id] = {
                conn.source_port: conn.target_port
                for conn in conns
            }
        
        # Get downstream inputs structure
        downstream_inputs = {}
        for succ_id in successors:
            succ_node = self.nodes[succ_id]
            # Get connections from current node to this successor
            conns = [
                conn for conn in self.get_connections_from(node_id)
                if str(conn.target_node_id) == succ_id
            ]
            downstream_inputs[succ_id] = {
                conn.source_port: conn.target_port
                for conn in conns
            }
        
        return NodeContext(
            node_id=node_id,
            node=self.nodes[node_id],
            predecessors=predecessors,
            successors=successors,
            depth=depth,
            execution_order=execution_order,
            upstream_outputs=upstream_outputs,
            downstream_inputs=downstream_inputs
        )
    
    def _calculate_depth(self, node_id: str) -> int:
        """Calculate the depth of a node in the DAG (0 for root nodes)"""
        if not self.reverse_adj.get(node_id):
            return 0
        
        # Use BFS from root nodes to find depth
        # Find all root nodes (nodes with no predecessors)
        root_nodes = [nid for nid in self.nodes.keys() if not self.reverse_adj.get(nid)]
        
        if not root_nodes:
            # If no root nodes, this node is at depth 0
            return 0
        
        # BFS from root nodes to find depth
        visited = set()
        depth_map = {}
        queue = deque([(root_id, 0) for root_id in root_nodes])
        
        while queue:
            current_id, depth = queue.popleft()
            if current_id in visited:
                continue
            visited.add(current_id)
            depth_map[current_id] = depth
            
            # Process successors
            for succ_id in self.forward_adj.get(current_id, []):
                if succ_id not in visited:
                    queue.append((succ_id, depth + 1))
        
        return depth_map.get(node_id, 0)
    
    def _calculate_execution_order(self, node_id: str) -> int:
        """Calculate execution order using topological sort"""
        # Calculate in-degrees
        in_degree = {nid: len(self.reverse_adj.get(nid, [])) for nid in self.nodes.keys()}
        
        # Topological sort
        queue = deque([nid for nid, degree in in_degree.items() if degree == 0])
        order = 0
        execution_order_map = {}
        
        while queue:
            current_id = queue.popleft()
            execution_order_map[current_id] = order
            order += 1
            
            for succ_id in self.forward_adj.get(current_id, []):
                in_degree[succ_id] -= 1
                if in_degree[succ_id] == 0:
                    queue.append(succ_id)
        
        return execution_order_map.get(node_id, -1)
    
    def topological_sort(self) -> List[str]:
        """Get nodes in topological execution order"""
        in_degree = {nid: len(self.reverse_adj.get(nid, [])) for nid in self.nodes.keys()}
        queue = deque([nid for nid, degree in in_degree.items() if degree == 0])
        result = []
        
        while queue:
            node_id = queue.popleft()
            result.append(node_id)
            
            for succ_id in self.forward_adj.get(node_id, []):
                in_degree[succ_id] -= 1
                if in_degree[succ_id] == 0:
                    queue.append(succ_id)
        
        if len(result) != len(self.nodes):
            raise ValueError("Workflow contains cycles or disconnected nodes")
        
        return result
    
    def get_all_contexts(self) -> Dict[str, NodeContext]:
        """Get context for all nodes"""
        return {
            node_id: self.get_node_context(node_id)
            for node_id in self.nodes.keys()
        }
    
    def get_upstream_chain(self, node_id: str) -> List[str]:
        """Get all upstream nodes in dependency chain (breadth-first)"""
        visited = set()
        result = []
        queue = deque([node_id])
        
        while queue:
            current_id = queue.popleft()
            if current_id in visited:
                continue
            visited.add(current_id)
            
            predecessors = self.reverse_adj.get(current_id, [])
            for pred_id in predecessors:
                if pred_id not in visited:
                    result.append(pred_id)
                    queue.append(pred_id)
        
        return result
    
    def get_downstream_chain(self, node_id: str) -> List[str]:
        """Get all downstream nodes that depend on this node (breadth-first)"""
        visited = set()
        result = []
        queue = deque([node_id])
        
        while queue:
            current_id = queue.popleft()
            if current_id in visited:
                continue
            visited.add(current_id)
            
            successors = self.forward_adj.get(current_id, [])
            for succ_id in successors:
                if succ_id not in visited:
                    result.append(succ_id)
                    queue.append(succ_id)
        
        return result

