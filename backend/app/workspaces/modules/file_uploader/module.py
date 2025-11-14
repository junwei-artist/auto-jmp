import shutil
from typing import Dict, Any, List, Optional
from app.workspaces.engine.node_base import BaseNode, NodeResult, Port, PortType
from pathlib import Path


class FileUploaderNode(BaseNode):
    """Uploads a file to the workflow node folder and copies it to output"""
    
    @property
    def module_type(self) -> str:
        return "file_uploader"
    
    @property
    def display_name(self) -> str:
        return "File Uploader"
    
    @property
    def description(self) -> str:
        return "Upload a file to the workflow node folder, validate file type and size, then copy to output folder"
    
    @property
    def inputs(self) -> List[Port]:
        return []  # No inputs - file is uploaded via config
    
    @property
    def outputs(self) -> List[Port]:
        return [
            Port(
                name="file",
                type=PortType.FILE,
                label="File",
                description="Storage key to the uploaded file in output folder"
            )
        ]
    
    async def execute(self, inputs: Dict[str, Any], io_manager) -> NodeResult:
        """Execute the file uploader node"""
        # Get file from config (uploaded via API)
        file_key = self.config.get("file_key")
        
        if not file_key:
            return NodeResult(
                success=False,
                outputs={},
                error="No file provided. Please upload a file."
            )
        
        try:
            # Load the file from storage
            file_content = await io_manager.load_artifact(file_key)
            
            if not isinstance(file_content, bytes):
                return NodeResult(
                    success=False,
                    outputs={},
                    error="Failed to load file content"
                )
            
            # Get file info from config
            filename = self.config.get("filename", "uploaded_file")
            file_size = len(file_content)
            
            # Validate file size
            max_size = self.config.get("max_size", 50 * 1024 * 1024)  # Default 50MB
            if file_size > max_size:
                return NodeResult(
                    success=False,
                    outputs={},
                    error=f"File size ({file_size} bytes) exceeds maximum allowed size ({max_size} bytes)"
                )
            
            # Validate file type if specified
            allowed_types = self.config.get("allowed_types", [])  # Empty list means all types allowed
            if allowed_types:
                file_extension = Path(filename).suffix.lower().lstrip('.')
                if file_extension not in [ext.lower().lstrip('.') for ext in allowed_types]:
                    return NodeResult(
                        success=False,
                        outputs={},
                        error=f"File type '{file_extension}' is not allowed. Allowed types: {', '.join(allowed_types)}"
                    )
            
            # Get the workflow_id and node_id from the graph context or config
            # The file_key should be in format: workflows/{workflow_id}/nodes/{node_id}/input/{filename}
            # We need to extract workflow_id and node_id to construct the output path
            parts = file_key.split('/')
            if len(parts) >= 5 and parts[0] == 'workflows' and parts[2] == 'nodes' and parts[4] == 'input':
                workflow_id = parts[1]
                node_id = parts[3]
                filename_from_path = '/'.join(parts[5:])  # Get filename (may include subdirectories)
                
                # Construct output storage key
                output_key = f"workflows/{workflow_id}/nodes/{node_id}/output/{filename_from_path}"
                
                # Save file to output folder using storage directly
                # We'll use the storage's save_file method
                from app.core.storage import local_storage
                local_storage.save_file(file_content, output_key)
                
                return NodeResult(
                    success=True,
                    outputs={
                        "file": output_key
                    },
                    metadata={
                        "filename": filename,
                        "file_size": file_size,
                        "file_type": Path(filename).suffix.lower().lstrip('.'),
                        "input_file_key": file_key,
                        "output_file_key": output_key
                    }
                )
            else:
                # Fallback: try to save using the storage directly
                # Extract filename from file_key
                if "/input/" in file_key:
                    output_key = file_key.replace("/input/", "/output/")
                    from app.core.storage import local_storage
                    local_storage.save_file(file_content, output_key)
                    
                    return NodeResult(
                        success=True,
                        outputs={
                            "file": output_key
                        },
                        metadata={
                            "filename": filename,
                            "file_size": file_size,
                            "file_type": Path(filename).suffix.lower().lstrip('.'),
                            "input_file_key": file_key,
                            "output_file_key": output_key
                        }
                    )
                else:
                    return NodeResult(
                        success=False,
                        outputs={},
                        error=f"Could not determine output path from file_key: {file_key}"
                    )
        
        except Exception as e:
            return NodeResult(
                success=False,
                outputs={},
                error=f"Failed to process file: {str(e)}"
            )
    
    def get_config_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "allowed_types": {
                    "type": "array",
                    "title": "Allowed File Types",
                    "description": "List of allowed file extensions (e.g., ['pdf', 'docx', 'xlsx']). Leave empty to allow all types.",
                    "items": {
                        "type": "string"
                    },
                    "default": []
                },
                "max_size": {
                    "type": "number",
                    "title": "Maximum File Size (bytes)",
                    "description": "Maximum file size in bytes (default: 52428800 = 50MB)",
                    "default": 52428800
                }
            },
            "required": []
        }

