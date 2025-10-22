from typing import Dict, Any, List, Optional
from pathlib import Path
import importlib
import sys
import logging

logger = logging.getLogger(__name__)

class ExtensionManager:
    """Manages all extensions"""
    
    def __init__(self):
        self.extensions: Dict[str, Any] = {}
        self.extensions_dir = Path(__file__).parent.parent.parent / 'extensions'
    
    def load_extension(self, extension_name: str) -> bool:
        """Load an extension"""
        try:
            extension_path = self.extensions_dir / extension_name
            if not extension_path.exists():
                logger.warning(f"Extension directory not found: {extension_path}")
                return False
            
            # Check if extension.py exists
            extension_file = extension_path / 'extension.py'
            if not extension_file.exists():
                logger.warning(f"Extension file not found: {extension_file} - skipping {extension_name}")
                return False
            
            # Add the extensions directory to Python path (not the individual extension)
            extensions_parent = self.extensions_dir.parent
            if str(extensions_parent) not in sys.path:
                sys.path.insert(0, str(extensions_parent))
            
            # Import extension module using the correct path
            module_name = f'extensions.{extension_name}.extension'
            module = importlib.import_module(module_name)
            
            # Get the extension class name
            class_name = f'{extension_name.title().replace("2", "2")}Extension'
            # Handle special cases for specific extensions
            if extension_name == 'excel2boxplotv1':
                class_name = 'Excel2BoxplotV1Extension'
            elif extension_name == 'excel2boxplotv2':
                class_name = 'Excel2BoxplotV2Extension'
            elif extension_name == 'excel2processcapability':
                class_name = 'Excel2ProcessCapabilityExtension'
            elif extension_name == 'excel2cpkv1':
                class_name = 'Excel2CPKV1Extension'
            elif extension_name == 'excel2commonality':
                class_name = 'Excel2CommonalityExtension'
            
            # Check if the class exists in the module
            if not hasattr(module, class_name):
                logger.warning(f"Extension class {class_name} not found in {extension_name} - skipping")
                return False
            
            extension_class = getattr(module, class_name)
            
            # Initialize extension
            extension = extension_class()
            
            # Check dependencies
            if not extension.initialize():
                logger.error(f"Extension {extension_name} failed to initialize")
                return False
            
            # Register extension
            self.extensions[extension_name] = extension
            logger.info(f"Extension loaded: {extension_name} v{extension.version}")
            
            return True
        except ImportError as e:
            logger.warning(f"Failed to import extension {extension_name}: {e} - skipping")
            return False
        except Exception as e:
            logger.error(f"Failed to load extension {extension_name}: {e}")
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
            return False
    
    def load_all_extensions(self) -> List[str]:
        """Load all available extensions"""
        loaded = []
        
        for extension_dir in self.extensions_dir.iterdir():
            if extension_dir.is_dir() and extension_dir.name not in ['base', '__pycache__']:
                if self.load_extension(extension_dir.name):
                    loaded.append(extension_dir.name)
        
        return loaded
    
    def get_extension(self, name: str) -> Optional[Any]:
        """Get extension by name"""
        return self.extensions.get(name)
    
    def get_all_extensions(self) -> Dict[str, Any]:
        """Get all loaded extensions"""
        return self.extensions.copy()
    
    def get_api_routes(self) -> List[Any]:
        """Get all API routes from extensions"""
        routes = []
        for extension in self.extensions.values():
            routes.extend(extension.get_api_routes())
        return routes
    
    def get_extension_info(self) -> List[Dict[str, Any]]:
        """Get information about all loaded extensions"""
        info = []
        for name, extension in self.extensions.items():
            info.append({
                'name': name,
                'version': extension.version,
                'description': extension.description,
                'supported_formats': extension.get_supported_formats(),
                'dependencies': extension.get_dependencies(),
                'status': 'loaded'
            })
        return info
