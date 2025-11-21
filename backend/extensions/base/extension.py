from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional
from pathlib import Path

class BaseExtension(ABC):
    """Base class for all extensions"""
    
    def __init__(self):
        self.name = self.get_name()
        self.version = self.get_version()
        self.description = self.get_description()
    
    @abstractmethod
    def get_name(self) -> str:
        """Return extension name"""
        pass
    
    @abstractmethod
    def get_version(self) -> str:
        """Return extension version"""
        pass
    
    @abstractmethod
    def get_description(self) -> str:
        """Return extension description"""
        pass
    
    @abstractmethod
    def get_supported_formats(self) -> List[str]:
        """Return list of supported file formats"""
        pass
    
    @abstractmethod
    def get_api_routes(self) -> List[Dict[str, Any]]:
        """Return API routes for this extension"""
        pass
    
    @abstractmethod
    def get_celery_tasks(self) -> List[Dict[str, Any]]:
        """Return Celery tasks for this extension"""
        pass
    
    def get_dependencies(self) -> List[str]:
        """Return required Python packages"""
        return []
    
    def initialize(self) -> bool:
        """Initialize the extension"""
        return True
    
    def cleanup(self) -> None:
        """Cleanup extension resources"""
        pass
