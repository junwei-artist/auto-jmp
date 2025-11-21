from typing import Dict, Any, List, Optional, Type
from abc import ABC, abstractmethod
import uuid
from dataclasses import dataclass
from enum import Enum


class PortType(str, Enum):
    """Types of ports for node inputs/outputs"""
    DATA = "data"  # General data (DuckDB table, DataFrame, etc.)
    FILE = "file"  # File path or storage key
    STRING = "string"
    NUMBER = "number"
    BOOLEAN = "boolean"
    JSON = "json"


@dataclass
class Port:
    """Represents an input or output port on a node"""
    name: str
    type: PortType
    label: str
    description: Optional[str] = None
    required: bool = True
    default_value: Any = None


@dataclass
class NodeResult:
    """Result from executing a node"""
    success: bool
    outputs: Dict[str, Any]  # Port name -> value
    error: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None  # Additional metadata (e.g., column names, stats)


@dataclass
class NodeGraphContext:
    """Graph context information for a node"""
    node_id: str
    predecessors: List[str]  # Upstream node IDs
    successors: List[str]  # Downstream node IDs
    depth: int  # Depth in DAG
    execution_order: int  # Position in topological sort
    upstream_outputs: Dict[str, Dict[str, Any]]  # node_id -> {port_name: value}
    downstream_requirements: Dict[str, Dict[str, Any]]  # node_id -> {port_name: required_type}


class BaseNode(ABC):
    """Base class for all workflow nodes/modules"""
    
    def __init__(self, node_id: str, config: Optional[Dict[str, Any]] = None, graph_context: Optional['NodeGraphContext'] = None):
        self.node_id = node_id
        self.config = config or {}
        self.state: Dict[str, Any] = {}
        self.graph_context = graph_context  # Graph context (predecessors, successors, etc.)
    
    @property
    @abstractmethod
    def module_type(self) -> str:
        """Unique identifier for this module type"""
        pass
    
    @property
    @abstractmethod
    def display_name(self) -> str:
        """Human-readable name for this module"""
        pass
    
    @property
    @abstractmethod
    def description(self) -> str:
        """Description of what this module does"""
        pass
    
    @property
    @abstractmethod
    def inputs(self) -> List[Port]:
        """List of input ports"""
        pass
    
    @property
    @abstractmethod
    def outputs(self) -> List[Port]:
        """List of output ports"""
        pass
    
    @abstractmethod
    async def execute(self, inputs: Dict[str, Any], io_manager: 'IOManager') -> NodeResult:
        """
        Execute the node with given inputs.
        
        Args:
            inputs: Dictionary mapping input port names to their values
            io_manager: IOManager for saving/loading artifacts
            
        Returns:
            NodeResult with outputs and success status
        """
        pass
    
    def get_config_schema(self) -> Dict[str, Any]:
        """Return JSON schema for configuration panel"""
        return {
            "type": "object",
            "properties": {},
            "required": []
        }
    
    def validate_config(self, config: Dict[str, Any]) -> tuple[bool, Optional[str]]:
        """Validate configuration. Returns (is_valid, error_message)"""
        return True, None
    
    def get_upstream_data(self, port_name: Optional[str] = None) -> Dict[str, Any]:
        """
        Get data from upstream/predecessor nodes.
        
        Args:
            port_name: Optional port name to filter by. If None, returns all upstream data.
            
        Returns:
            Dictionary mapping upstream node_id -> {port_name: value}
        """
        if not self.graph_context:
            return {}
        
        # This will be populated during execution with actual upstream outputs
        return getattr(self, '_upstream_data', {})
    
    def get_downstream_requirements(self) -> Dict[str, Dict[str, Any]]:
        """
        Get requirements from downstream/successor nodes.
        Useful for nodes that need to adapt their output based on downstream needs.
        
        Returns:
            Dictionary mapping downstream node_id -> {port_name: required_type}
        """
        if not self.graph_context:
            return {}
        
        return self.graph_context.downstream_requirements
    
    def on_upstream_changed(self, upstream_node_id: str, outputs: Dict[str, Any]):
        """
        Called when an upstream node's output changes.
        Override this to update config dynamically based on upstream changes.
        
        Args:
            upstream_node_id: ID of the upstream node that changed
            outputs: New outputs from the upstream node
        """
        # Store upstream data for access
        if not hasattr(self, '_upstream_data'):
            self._upstream_data = {}
        self._upstream_data[upstream_node_id] = outputs
        
        # Default implementation: update config if needed
        # Subclasses can override to implement dynamic config updates
        pass
    
    def get_config_schema_with_context(self) -> Dict[str, Any]:
        """
        Get config schema that may depend on upstream nodes.
        Override this to provide dynamic schema based on graph context.
        """
        return self.get_config_schema()


class IOManager(ABC):
    """Manages input/output for workflow execution"""
    
    @abstractmethod
    async def save_artifact(
        self,
        workspace_id: str,
        workflow_id: str,
        execution_id: str,
        node_id: str,
        kind: str,
        data: Any,
        filename: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Save an artifact and return storage key.
        
        Returns:
            storage_key: Key to retrieve the artifact later
        """
        pass
    
    @abstractmethod
    async def load_artifact(self, storage_key: str) -> Any:
        """Load an artifact by storage key"""
        pass
    
    @abstractmethod
    async def get_workspace_path(self, workspace_id: str) -> str:
        """Get the file system path for a workspace"""
        pass


class NodeRegistry:
    """Registry for all available node types"""
    
    def __init__(self):
        self._nodes: Dict[str, Type[BaseNode]] = {}
    
    def register(self, node_class: Type[BaseNode]):
        """Register a node class"""
        instance = node_class(str(uuid.uuid4()))
        self._nodes[instance.module_type] = node_class
        return node_class
    
    def get_node_class(self, module_type: str) -> Optional[Type[BaseNode]]:
        """Get node class by module type"""
        return self._nodes.get(module_type)
    
    def list_modules(self) -> List[Dict[str, Any]]:
        """List all registered modules with their metadata"""
        modules = []
        for module_type, node_class in self._nodes.items():
            instance = node_class(str(uuid.uuid4()))
            modules.append({
                "module_type": module_type,
                "display_name": instance.display_name,
                "description": instance.description,
                "inputs": [
                    {
                        "name": port.name,
                        "type": port.type.value,
                        "label": port.label,
                        "description": port.description,
                        "required": port.required
                    }
                    for port in instance.inputs
                ],
                "outputs": [
                    {
                        "name": port.name,
                        "type": port.type.value,
                        "label": port.label,
                        "description": port.description
                    }
                    for port in instance.outputs
                ],
                "config_schema": instance.get_config_schema()
            })
        return modules

