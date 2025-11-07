from app.workspaces.engine.node_base import NodeRegistry

# Global registry instance
registry = NodeRegistry()

def get_registry() -> NodeRegistry:
    """Get the global node registry"""
    return registry

