# Module Framework Documentation

## Overview

The Module Framework is a standardized template for creating reusable, configurable workflow nodes in the application. Each module can be used as a node in workflows and can run independently through a standalone interface.

## Table of Contents

1. [Architecture](#architecture)
2. [Backend Module Implementation](#backend-module-implementation)
3. [Frontend Component Implementation](#frontend-component-implementation)
4. [File Handling Patterns](#file-handling-patterns)
5. [Configuration Management](#configuration-management)
6. [API Endpoints](#api-endpoints)
7. [Standalone Module Execution](#standalone-module-execution)
8. [Best Practices](#best-practices)
9. [Example: Creating a New Module](#example-creating-a-new-module)

---

## Architecture

### Module Structure

```
backend/app/workspaces/modules/
├── {module_name}/
│   ├── __init__.py
│   └── module.py          # Backend module implementation
│
frontend/components/workspace/
├── node-configs/
│   └── {ModuleName}Config.tsx    # Configuration panel (optional)
└── node-embedded/
    ├── {ModuleName}Embedded.tsx  # Embedded interface in node editor
    └── {ModuleName}Wizard.tsx    # Standalone wizard (optional)
    └── {ModuleName}GUI.tsx       # Full-window GUI (optional)
```

### Key Components

1. **Backend Module** (`module.py`): Inherits from `BaseNode`, defines module behavior
2. **Frontend Embedded Interface**: Compact UI shown within the node in the editor
3. **Frontend Standalone Interface**: Full UI for running modules independently
4. **Configuration Schema**: JSON schema for module configuration

---

## Backend Module Implementation

### Base Structure

Every module must inherit from `BaseNode` and implement required properties and methods:

```python
from app.workspaces.engine.node_base import BaseNode, NodeResult, Port, PortType
from typing import Dict, Any, List

class YourModuleNode(BaseNode):
    """Description of what your module does"""
    
    @property
    def module_type(self) -> str:
        """Unique identifier (snake_case)"""
        return "your_module_name"
    
    @property
    def display_name(self) -> str:
        """Human-readable name"""
        return "Your Module Name"
    
    @property
    def description(self) -> str:
        """Brief description"""
        return "What this module does"
    
    @property
    def inputs(self) -> List[Port]:
        """Define input ports"""
        return [
            Port(
                name="file",
                type=PortType.FILE,
                label="Input File",
                description="Description of input",
                required=False  # or True
            ),
            # Add more inputs as needed
        ]
    
    @property
    def outputs(self) -> List[Port]:
        """Define output ports"""
        return [
            Port(
                name="file",
                type=PortType.FILE,
                label="Output File",
                description="Description of output"
            ),
            # Add more outputs as needed
        ]
    
    async def execute(self, inputs: Dict[str, Any], io_manager) -> NodeResult:
        """
        Execute the module logic
        
        Args:
            inputs: Dictionary of input port values
            io_manager: IOManager for saving/loading artifacts
            
        Returns:
            NodeResult with outputs and success status
        """
        try:
            # Get inputs
            file_key = inputs.get("file") or self.config.get("file_key")
            
            if not file_key:
                return NodeResult(
                    success=False,
                    outputs={},
                    error="Required input missing"
                )
            
            # Load file from storage
            file_content = await io_manager.load_artifact(file_key)
            
            # Process data
            # ... your processing logic ...
            
            # Save output
            output_key = await io_manager.save_artifact(
                processed_data,
                f"workflows/{workflow_id}/nodes/{self.node_id}/output/result.xlsx"
            )
            
            return NodeResult(
                success=True,
                outputs={
                    "file": output_key
                }
            )
            
        except Exception as e:
            return NodeResult(
                success=False,
                outputs={},
                error=str(e)
            )
    
    def get_config_schema(self) -> Dict[str, Any]:
        """Return JSON schema for configuration"""
        return {
            "type": "object",
            "properties": {
                "setting1": {
                    "type": "string",
                    "title": "Setting 1",
                    "description": "Description of setting"
                },
                # Add more config properties
            },
            "required": []
        }
```

### Port Types

Available port types:
- `PortType.FILE`: File path or storage key
- `PortType.DATA`: General data (DataFrame, DuckDB table, etc.)
- `PortType.STRING`: String value
- `PortType.NUMBER`: Numeric value
- `PortType.BOOLEAN`: Boolean value
- `PortType.JSON`: JSON object

### Registration

Register your module in `backend/app/workspaces/modules/__init__.py`:

```python
from app.workspaces.modules.your_module.module import YourModuleNode
from app.workspaces.engine.registry import registry

registry.register(YourModuleNode)
```

---

## Frontend Component Implementation

### Embedded Interface

The embedded interface is shown within the node in the workflow editor. It should be compact and provide quick access to key actions.

**File**: `frontend/components/workspace/node-embedded/YourModuleEmbedded.tsx`

```typescript
'use client'

import { Button } from '@/components/ui/button'
import { YourModuleWizard } from './YourModuleWizard'

interface YourModuleEmbeddedProps {
  node: {
    id: string
    module_type: string
    config: any
    state: any
  }
  workflowId: string
  onConfigUpdate?: (config: any) => void
}

export default function YourModuleEmbedded({
  node,
  workflowId,
  onConfigUpdate
}: YourModuleEmbeddedProps) {
  const [wizardOpen, setWizardOpen] = useState(false)

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setWizardOpen(true)}
      >
        Configure
      </Button>
      
      <YourModuleWizard
        node={node}
        workflowId={workflowId}
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onConfigUpdate={onConfigUpdate}
      />
    </>
  )
}
```

### Standalone Wizard

For multi-step configuration, create a wizard component:

**File**: `frontend/components/workspace/node-embedded/YourModuleWizard.tsx`

```typescript
'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useMutation } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'
import toast from 'react-hot-toast'

interface YourModuleWizardProps {
  node: {
    id: string
    module_type: string
    config: any
  }
  workflowId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfigUpdate?: (config: any) => void
}

export default function YourModuleWizard({
  node,
  workflowId,
  open,
  onOpenChange,
  onConfigUpdate
}: YourModuleWizardProps) {
  const [currentStep, setCurrentStep] = useState<'upload' | 'configure' | 'confirm'>('upload')
  const [uploadedFileKey, setUploadedFileKey] = useState<string | null>(node.config?.file_key || null)

  // File upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      return apiClient.post(`/v1/workflows/${workflowId}/nodes/${node.id}/upload`, formData)
    },
    onSuccess: (data) => {
      setUploadedFileKey(data.storage_key)
      setCurrentStep('configure')
      toast.success('File uploaded successfully')
    }
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Configure Your Module</DialogTitle>
        </DialogHeader>
        
        {/* Step content */}
        {currentStep === 'upload' && (
          <div>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) uploadMutation.mutate(file)
              }}
            />
          </div>
        )}
        
        {/* Navigation buttons */}
        <div className="flex justify-between">
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          {currentStep !== 'upload' && (
            <Button onClick={() => setCurrentStep('upload')}>Back</Button>
          )}
          {currentStep === 'confirm' && (
            <Button onClick={handleConfirm}>Confirm</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

### Full-Window GUI

For complex interfaces, create a full-window GUI component:

**File**: `frontend/components/workspace/node-embedded/YourModuleGUI.tsx`

```typescript
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useQuery, useMutation } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'
import toast from 'react-hot-toast'

export default function YourModuleGUI({
  node,
  workflowId
}: {
  node: { id: string; config: any }
  workflowId: string
}) {
  const [showInputFileDialog, setShowInputFileDialog] = useState(false)

  // Fetch input files with metadata
  const { data: inputFilesData } = useQuery({
    queryKey: ['node-files', workflowId, node.id],
    queryFn: async () => {
      return apiClient.get(`/v1/workflows/${workflowId}/nodes/${node.id}/files`)
    }
  })

  return (
    <div className="h-screen flex flex-col">
      {/* Top Menu Bar */}
      <div className="bg-white border-b px-4 py-2">
        <Button onClick={() => setShowInputFileDialog(true)}>
          Switch Input File
        </Button>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        {/* Your module content */}
      </div>

      {/* Input File Selection Dialog */}
      <Dialog open={showInputFileDialog} onOpenChange={setShowInputFileDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Select Input File</DialogTitle>
          </DialogHeader>
          {/* File list with metadata */}
        </DialogContent>
      </Dialog>
    </div>
  )
}
```

### Register Frontend Components

Register your components in `frontend/components/workspace/NodeEditorView.tsx`:

```typescript
import YourModuleConfig from './node-configs/YourModuleConfig'
import YourModuleEmbedded from './node-embedded/YourModuleEmbedded'

// In renderNodeConfig:
case 'your_module_name':
  return <YourModuleConfig node={node} workflowId={workflowId} />

// In renderEmbeddedInterface:
case 'your_module_name':
  return <YourModuleEmbedded node={node} workflowId={workflowId} />
```

---

## File Handling Patterns

### File Upload with UUID and Metadata

When uploading files, the system automatically:
1. Generates a UUID for the filename
2. Preserves the file extension
3. Creates a metadata JSON file alongside the uploaded file

**Backend Pattern**:
```python
# Generate UUID for filename
file_uuid = str(uuid.uuid4())
original_filename = file.filename or "unknown"
file_extension = ""
if "." in original_filename:
    file_extension = "." + original_filename.rsplit(".", 1)[1].lower()

# Save file with UUID name
uuid_filename = f"{file_uuid}{file_extension}"
storage_key = f"workflows/{workflow_id}/nodes/{node_id}/input/{uuid_filename}"
file_path = local_storage.save_file(content, storage_key)

# Create metadata JSON
metadata = {
    "original_filename": original_filename,
    "file_type": file_extension.lstrip("."),
    "uploaded_time": datetime.now(timezone.utc).isoformat(),
    "workflow_id": workflow_id,
    "node_id": node_id,
    "uuid_filename": uuid_filename,
    "file_size": len(content)
}

metadata_filename = f"{file_uuid}_metadata.json"
metadata_storage_key = f"workflows/{workflow_id}/nodes/{node_id}/input/{metadata_filename}"
local_storage.save_file(json.dumps(metadata, indent=2).encode('utf-8'), metadata_storage_key)
```

**Frontend Pattern**:
```typescript
// Fetch files with metadata
const { data: inputFilesData } = useQuery({
  queryKey: ['node-files', workflowId, node.id],
  queryFn: async () => {
    return apiClient.get(`/v1/workflows/${workflowId}/nodes/${node.id}/files`)
  }
})

// Files will have metadata attached:
// file.metadata.original_filename
// file.metadata.file_type
// file.metadata.uploaded_time
// file.metadata.uuid_filename
```

### File Folder Structure

```
workflows/
└── {workflow_id}/
    └── nodes/
        └── {node_id}/
            ├── input/          # Input files (with UUID names)
            │   ├── {uuid}.xlsx
            │   └── {uuid}_metadata.json
            ├── wip/            # Work-in-progress files
            └── output/         # Output files
```

---

## Configuration Management

### Saving Configuration

Configurations can be saved to:
1. **Database**: Node's `config` field
2. **File System**: `config.json` in the node's folder

**Backend Endpoint**: `POST /v1/workflows/{workflow_id}/nodes/{node_id}/config`

**Frontend Pattern**:
```typescript
const saveConfigToFile = async (config: any) => {
  try {
    await apiClient.post(`/v1/workflows/${workflowId}/nodes/${node.id}/config`, config)
  } catch (error) {
    console.error('Failed to save config:', error)
  }
}
```

### Loading Configuration

**Backend Endpoint**: `GET /v1/workflows/{workflow_id}/nodes/{node_id}/config`

**Frontend Pattern**:
```typescript
const { data: loadedConfig } = useQuery({
  queryKey: ['node-config', workflowId, node.id],
  queryFn: async () => {
    return apiClient.get(`/v1/workflows/${workflowId}/nodes/${node.id}/config`)
  },
  enabled: !!workflowId && !!node.id
})

const effectiveConfig = loadedConfig?.config || node.config || {}
```

---

## API Endpoints

### File Management

- `POST /v1/workflows/{workflow_id}/nodes/{node_id}/upload`
  - Upload a file to node's input folder
  - Returns: `{ storage_key, filename, available_sheets? }`

- `GET /v1/workflows/{workflow_id}/nodes/{node_id}/files`
  - List files in node's folders (input, wip, output)
  - Returns files with metadata if available

- `DELETE /v1/workflows/{workflow_id}/nodes/{node_id}/files?folder={folder}`
  - Clear files in specified folder (or all folders)

### Configuration

- `GET /v1/workflows/{workflow_id}/nodes/{node_id}/config`
  - Load node configuration from file or database

- `POST /v1/workflows/{workflow_id}/nodes/{node_id}/config`
  - Save node configuration to file and database

### Execution

- `POST /v1/workflows/{workflow_id}/nodes/{node_id}/execute`
  - Execute the node

### Module-Specific Endpoints

You can create custom endpoints for your module:

```python
@router.post("/workflows/{workflow_id}/nodes/{node_id}/your-custom-action")
async def your_custom_action(
    workflow_id: str,
    node_id: str,
    # ... parameters
):
    # Your custom logic
    pass
```

---

## Standalone Module Execution

### Module Page Route

Modules can be run independently at: `/modules/{module_type}`

**File**: `frontend/app/modules/[moduleType]/page.tsx`

The page handles:
1. Workflow selection/creation
2. Node creation for the module
3. Rendering the appropriate interface (Wizard or GUI)

### Workflow Selection

Users can:
- Select an existing workflow with nodes of the module type
- Create a new workflow
- Switch between workflows

### State Management

- Workflow and node IDs are stored in URL query parameters
- State persists across page refreshes
- Configuration is saved to both database and file system

---

## Best Practices

### 1. Error Handling

Always handle errors gracefully:

```python
try:
    # Your logic
    pass
except Exception as e:
    return NodeResult(
        success=False,
        outputs={},
        error=f"Error message: {str(e)}"
    )
```

### 2. File Validation

Validate file types and sizes:

```python
if not file.filename.lower().endswith(('.xlsx', '.xls')):
    raise HTTPException(status_code=400, detail="Invalid file type")

max_size = 50 * 1024 * 1024  # 50MB
if len(content) > max_size:
    raise HTTPException(status_code=400, detail="File too large")
```

### 3. Configuration Validation

Implement validation in `validate_config`:

```python
def validate_config(self, config: Dict[str, Any]) -> tuple[bool, Optional[str]]:
    if "required_field" not in config:
        return False, "required_field is required"
    return True, None
```

### 4. Frontend State Management

- Use React Query for data fetching and caching
- Invalidate queries after mutations
- Save configuration automatically on changes

### 5. User Feedback

- Show loading states during operations
- Display success/error toasts
- Provide clear error messages

### 6. File Metadata

Always include metadata when creating files:
- Original filename
- File type
- Upload timestamp
- Workflow and node IDs
- File size

---

## Example: Creating a New Module

### Step 1: Create Backend Module

```bash
mkdir -p backend/app/workspaces/modules/my_module
touch backend/app/workspaces/modules/my_module/__init__.py
touch backend/app/workspaces/modules/my_module/module.py
```

### Step 2: Implement Module Class

```python
# backend/app/workspaces/modules/my_module/module.py
from app.workspaces.engine.node_base import BaseNode, NodeResult, Port, PortType

class MyModuleNode(BaseNode):
    @property
    def module_type(self) -> str:
        return "my_module"
    
    # ... implement required methods
```

### Step 3: Register Module

```python
# backend/app/workspaces/modules/__init__.py
from app.workspaces.modules.my_module.module import MyModuleNode
registry.register(MyModuleNode)
```

### Step 4: Create Frontend Components

```bash
touch frontend/components/workspace/node-embedded/MyModuleEmbedded.tsx
touch frontend/components/workspace/node-embedded/MyModuleWizard.tsx
```

### Step 5: Register Frontend Components

Update `NodeEditorView.tsx` to include your module.

### Step 6: Test

1. Start the backend server
2. Verify module appears in `/modules` page
3. Test workflow execution
4. Test standalone execution

---

## Additional Resources

- **BaseNode**: `backend/app/workspaces/engine/node_base.py`
- **Registry**: `backend/app/workspaces/engine/registry.py`
- **Storage**: `backend/app/core/storage.py`
- **Example Modules**: 
  - `backend/app/workspaces/modules/outlier_remover/`
  - `backend/app/workspaces/modules/file_uploader/`
  - `backend/app/workspaces/modules/excel_to_numeric/`

---

## Summary

The Module Framework provides:

✅ **Standardized Structure**: Consistent patterns for all modules  
✅ **Reusability**: Modules can be used in workflows or standalone  
✅ **File Management**: Automatic UUID naming and metadata tracking  
✅ **Configuration Persistence**: Save/load config from database and files  
✅ **Frontend Integration**: Embedded and standalone interfaces  
✅ **Type Safety**: TypeScript types for frontend, Python types for backend  
✅ **Error Handling**: Comprehensive error handling patterns  

Follow this template to create new modules that integrate seamlessly with the workflow system.

