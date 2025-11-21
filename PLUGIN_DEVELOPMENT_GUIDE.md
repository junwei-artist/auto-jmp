# Plugin Development Guide

This guide documents the complete process of designing and implementing plugins for the auto-jmp system, including common issues and their solutions.

## Table of Contents

1. [Plugin Architecture Overview](#plugin-architecture-overview)
2. [Plugin Development Process](#plugin-development-process)
3. [Backend Implementation](#backend-implementation)
4. [Frontend Integration](#frontend-integration)
5. [Common Issues and Solutions](#common-issues-and-solutions)
6. [Testing and Validation](#testing-and-validation)
7. [Best Practices](#best-practices)

## Plugin Architecture Overview

The auto-jmp system uses a hybrid plugin architecture that combines:

- **Shared Base Classes**: Common functionality for all plugins
- **Individual Plugin Implementations**: Plugin-specific logic for validation, processing, and API endpoints
- **Dynamic Registration**: Both backend and frontend plugins are dynamically loaded and registered

### Key Components

#### Backend Components
- `BaseExtension`: Abstract base class for all plugins
- `BaseAnalyzer`: Abstract base class for analysis-specific processors
- `ExtensionManager`: Manages loading and registration of backend extensions
- `API Routes`: FastAPI routers for each plugin

#### Frontend Components
- `PluginRegistry`: Manages frontend plugin registration
- `Plugin Config`: TypeScript configuration for each plugin
- `Components`: React components for plugin UI
- `Hooks`: Custom React hooks for API interaction

## Plugin Development Process

### Step 1: Backend Plugin Creation

#### 1.1 Create Plugin Directory Structure
```
backend/extensions/[plugin_name]/
├── __init__.py
├── extension.py          # Main extension class
├── analyzer.py           # Analysis logic
├── processor.py          # Main orchestrator
├── api.py               # FastAPI routes
└── README.md            # Plugin documentation
```

#### 1.2 Implement Core Classes

**Extension Class (`extension.py`)**:
```python
from ..base.extension import BaseExtension
from .analyzer import YourAnalyzer

class YourPluginExtension(BaseExtension):
    def __init__(self):
        super().__init__()
        self.analyzer = YourAnalyzer()

    def get_name(self) -> str:
        return "your_plugin_name"

    def get_version(self) -> str:
        return "1.0.0"

    def get_description(self) -> str:
        return "Your plugin description"

    def get_supported_formats(self) -> List[str]:
        return ['.xlsx', '.xls', '.xlsm', '.xlsb']

    def get_api_routes(self) -> List[Dict[str, Any]]:
        return [{
            'router': 'your_plugin_router',
            'prefix': '/your_plugin_name',
            'tags': ['your_plugin_name']
        }]

    def get_celery_tasks(self) -> List[Dict[str, Any]]:
        return []

    def get_dependencies(self) -> List[str]:
        return ['pandas==2.1.4', 'openpyxl==3.1.2']

    def initialize(self) -> bool:
        try:
            import pandas
            import openpyxl
            return True
        except ImportError:
            return False
```

**Analyzer Class (`analyzer.py`)**:
```python
from ..base.analyzer import BaseAnalyzer

class YourAnalyzer(BaseAnalyzer):
    def get_analysis_type(self) -> str:
        return "your_analysis_type"

    def get_supported_charts(self) -> List[str]:
        return ['your_chart_type']

    def get_required_columns(self) -> Dict[str, List[str]]:
        return {
            'your_chart_type': ['required', 'columns']
        }

    def validate_data(self, df: pd.DataFrame, chart_type: str) -> Dict[str, Any]:
        # Validation logic
        pass

    def preprocess_data(self, df: pd.DataFrame, chart_type: str) -> pd.DataFrame:
        # Data preprocessing
        pass

    def generate_jsl_template(self, data: Any) -> str:
        # JSL generation logic
        pass
```

#### 1.3 Implement API Endpoints

**API Routes (`api.py`)**:
```python
from fastapi import APIRouter, UploadFile, File, Form
from fastapi.responses import JSONResponse
import httpx
from app.core.storage import local_storage

router = APIRouter(prefix="/your_plugin_name", tags=["your_plugin_name"])

@router.post("/validate")
async def validate_excel_file(file: UploadFile = File(...)):
    """Validate Excel file structure"""
    # Implementation
    pass

@router.post("/load-file")
async def load_file(file: UploadFile = File(...)):
    """Load file for wizard compatibility"""
    # Implementation with checkpoint structure
    pass

@router.post("/process-data")
async def process_data(file: UploadFile = File(...), cat_var: str = Form("dummy")):
    """Process data for wizard compatibility"""
    # Implementation with checkpoint structure
    pass

@router.post("/run-analysis")
async def run_analysis(
    file: UploadFile = File(...),
    project_id: str = Form(...),
    project_name: str = Form("Your Analysis"),
    project_description: str = Form("")
):
    """Run complete analysis using JMP runner"""
    # Implementation with JMP runner integration
    pass
```

### Step 2: Frontend Plugin Creation

#### 2.1 Create Frontend Directory Structure
```
frontend/plugins/[plugin_name]/
├── config.ts
├── components/
│   ├── AnalysisForm.tsx
│   ├── DataPreview.tsx
│   └── ResultsView.tsx
└── hooks/
    └── useYourPluginAnalysis.ts
```

#### 2.2 Plugin Configuration (`config.ts`)
```typescript
import { Plugin } from '@/lib/plugins/types'
import AnalysisForm from './components/AnalysisForm'
import DataPreview from './components/DataPreview'
import ResultsView from './components/ResultsView'
import { useYourPluginAnalysis } from './hooks/useYourPluginAnalysis'

const plugin: Plugin = {
  config: {
    id: 'your_plugin_name',
    name: 'Your Plugin Name',
    version: '1.0.0',
    description: 'Your plugin description',
    icon: '🔧',
    category: 'analysis',
    supportedFormats: ['.xlsx', '.xls', '.xlsm', '.xlsb'],
    routes: [
      {
        path: '/plugins/your_plugin_name',
        component: 'AnalysisForm',
        title: 'Your Analysis',
        description: 'Upload Excel file for analysis'
      }
    ],
    apiEndpoints: [
      '/api/v1/extensions/your_plugin_name/validate',
      '/api/v1/extensions/your_plugin_name/process',
      '/api/v1/extensions/your_plugin_name/run-analysis'
    ]
  },
  components: {
    AnalysisForm: { name: 'AnalysisForm', component: AnalysisForm },
    DataPreview: { name: 'DataPreview', component: DataPreview },
    ResultsView: { name: 'ResultsView', component: ResultsView }
  },
  hooks: {
    useYourPluginAnalysis: { name: 'useYourPluginAnalysis', hook: useYourPluginAnalysis }
  }
}

export default plugin
```

#### 2.3 React Components

**Analysis Form (`components/AnalysisForm.tsx`)**:
```typescript
'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useYourPluginAnalysis } from '../hooks/useYourPluginAnalysis'

const AnalysisForm: React.FC = () => {
  const router = useRouter()
  const [excelFile, setExcelFile] = useState<File | null>(null)
  const [projectName, setProjectName] = useState<string>('')
  
  const { validateFile, processFile, isLoading, error } = useYourPluginAnalysis()

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setExcelFile(event.target.files[0])
    }
  }

  const handleProcessFile = async () => {
    if (!excelFile || !projectName) return

    try {
      const result = await processFile(excelFile, projectName)
      if (result.success) {
        router.push(`/plugins/your_plugin_name/results/${result.run_id}`)
      }
    } catch (err) {
      console.error('Error processing file:', err)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Your Analysis Setup</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="projectName">Project Name</Label>
            <Input
              id="projectName"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="excelFile">Excel File</Label>
            <Input
              id="excelFile"
              type="file"
              accept=".xlsx,.xls,.xlsm,.xlsb"
              onChange={handleFileChange}
            />
          </div>
          <Button onClick={handleProcessFile} disabled={isLoading || !excelFile || !projectName}>
            {isLoading ? 'Processing...' : 'Start Analysis'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

export default AnalysisForm
```

#### 2.4 Custom Hook (`hooks/useYourPluginAnalysis.ts`)
```typescript
'use client'

import { useState } from 'react'

export function useYourPluginAnalysis() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const processFile = async (file: File, projectName: string) => {
    setIsLoading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('project_name', projectName)

      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/extensions/your_plugin_name/run-analysis`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      return await response.json()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      throw err
    } finally {
      setIsLoading(false)
    }
  }

  return {
    processFile,
    isLoading,
    error
  }
}
```

### Step 3: Plugin Registration

#### 3.1 Backend Registration

**Add to `backend/main.py`**:
```python
from extensions.your_plugin_name.api import router as your_plugin_router

# Add to FastAPI app
app.include_router(your_plugin_router, prefix=f"{settings.API_V1_STR}/extensions")
```

**Add to `backend/app/core/extensions.py`**:
```python
elif extension_name == 'your_plugin_name':
    class_name = 'YourPluginExtension'
```

**Add to `backend/app/api/v1/endpoints/admin.py`**:
```python
{
    "id": "your_plugin_name",
    "name": "Your Plugin Name",
    "version": "1.0.0",
    "description": "Your plugin description",
    "icon": "🔧",
    "category": "analysis",
    "supported_formats": [".xlsx", ".xls", ".xlsm", ".xlsb"],
    "english_name": "Your Plugin Name",
    "english_description": "Your plugin description",
    "chinese_name": "你的插件名称",
    "chinese_description": "你的插件描述",
    "english_features": ["Feature 1", "Feature 2"],
    "chinese_features": ["功能1", "功能2"]
}
```

#### 3.2 Frontend Registration

**Add to `frontend/lib/plugins/registry.ts`**:
```typescript
const pluginModules = [
  // ... existing plugins
  { name: 'your_plugin_name', import: () => import('../../plugins/your_plugin_name/config') }
]
```

**Add to `frontend/app/plugins/page.tsx`**:
```typescript
{
  config: {
    id: 'your_plugin_name',
    name: 'Your Plugin Name',
    version: '1.0.0',
    description: 'Your plugin description',
    icon: '🔧',
    category: 'analysis',
    supportedFormats: ['.xlsx', '.xls', '.xlsm', '.xlsb'],
    routes: [
      {
        path: '/plugins/your_plugin_name',
        component: 'AnalysisForm',
        title: 'Your Analysis',
        description: 'Upload Excel file for analysis'
      }
    ],
    apiEndpoints: [
      '/api/v1/extensions/your_plugin_name/validate',
      '/api/v1/extensions/your_plugin_name/process',
      '/api/v1/extensions/your_plugin_name/run-analysis'
    ]
  },
  components: {},
  hooks: {}
}
```

**Add to `frontend/app/plugins/create-project/page.tsx`**:
```typescript
{
  id: 'your_plugin_name',
  name: getTranslation('plugin.your_plugin_name.name', 'Your Plugin Name'),
  description: getTranslation('plugin.your_plugin_name.description', 'Your plugin description'),
  icon: <YourIcon className="h-8 w-8 text-blue-600" />,
  features: [
    getTranslation('plugin.your_plugin_name.features.0', 'Feature 1'),
    getTranslation('plugin.your_plugin_name.features.1', 'Feature 2')
  ]
}
```

**Create `frontend/app/plugins/your_plugin_name/page.tsx`**:
```typescript
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function YourPluginPage() {
  const router = useRouter()

  useEffect(() => {
    router.push('/plugins/create-project?plugin=your_plugin_name')
  }, [router])

  return (
    <div className="container mx-auto py-8 text-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
      <p className="text-gray-600 mt-2">Redirecting to plugin selection...</p>
    </div>
  )
}
```

## Common Issues and Solutions

### Issue 1: File Format Compatibility

**Problem**: "File is not a zip file" error when uploading `.xls` files.

**Root Cause**: API endpoints hardcoded to use `.xlsx` extension, but pandas requires different engines for different Excel formats.

**Solution**:
```python
# Get the original file extension
file_ext = Path(file.filename).suffix.lower()
if not file_ext:
    file_ext = '.xlsx'  # Default fallback

# Save uploaded file temporarily with correct extension
with tempfile.NamedTemporaryFile(delete=False, suffix=file_ext) as tmp_file:
    # Process file...
```

**Prevention**: Always use the original file extension when creating temporary files.

### Issue 2: Frontend Wizard Checkpoint Structure

**Problem**: Frontend wizard expects `checkpoints` array but API returns single checkpoint.

**Root Cause**: Wizard expects multi-step validation process with checkpoint array.

**Solution**:
```python
# Convert single result to checkpoint structure
checkpoint1 = {
    "valid": True,
    "checkpoint": 1,
    "message": "Excel file structure validated successfully",
    "details": result.get("details", {})
}

checkpoint2 = {
    "valid": True,
    "checkpoint": 2,
    "message": "Required columns validation passed",
    "details": {
        "required_columns": result.get("details", {}).get("required_columns", []),
        "data_sheet": result.get("details", {}).get("data_sheet", "data")
    }
}

return {
    "valid": True,
    "message": "Validation completed successfully",
    "checkpoints": [checkpoint1, checkpoint2],
    "categorical_columns": ["Go to Analysis"],
    "sheets": [result.get("details", {}).get("data_sheet", "data")],
    "data_shape": [0, 0],
    "fai_columns": [],
    "summary": {
        "total_checkpoints": 2,
        "passed_checkpoints": 2,
        "fix_applied": False
    }
}
```

**Prevention**: Always return checkpoint structure for wizard-compatible endpoints.

### Issue 3: Categorical Variable Selection

**Problem**: "No Categorical Variables Found" error in wizard.

**Root Cause**: Plugin doesn't need categorical variable selection but wizard requires it.

**Solution**:
```python
# Add dummy categorical variable for plugins that don't need it
result["categorical_columns"] = ["Go to Analysis"]
```

**Prevention**: Always provide categorical variables for wizard compatibility.

### Issue 4: JMP Runner Integration

**Problem**: `/run-analysis` endpoint not following standard pattern.

**Root Cause**: Missing JMP runner integration and proper response format.

**Solution**:
```python
@router.post("/run-analysis")
async def run_analysis(
    file: UploadFile = File(...),
    project_id: str = Form(...),
    project_name: str = Form("Analysis"),
    project_description: str = Form("")
):
    # Generate CSV and JSL files
    result = processor.analyzer.analyze_excel_file(tmp_file.name)
    
    # Read generated files
    with open(csv_path, 'rb') as f:
        csv_bytes = f.read()
    with open(jsl_path, 'rb') as f:
        jsl_bytes = f.read()
    
    # Generate storage keys
    csv_key = local_storage.generate_storage_key("data.csv", "text/csv")
    jsl_key = local_storage.generate_storage_key("analysis.jsl", "text/plain")
    
    # Save files to storage
    local_storage.save_file(csv_bytes, csv_key)
    local_storage.save_file(jsl_bytes, jsl_key)
    
    # Create run via standard API
    backend_base = os.getenv("NEXT_PUBLIC_BACKEND_URL", "http://localhost:4700")
    async with httpx.AsyncClient(timeout=30.0) as client:
        run_resp = await client.post(
            f"{backend_base}/api/v1/runs/",
            json={
                "project_id": project_id,
                "csv_key": csv_key,
                "jsl_key": jsl_key
            }
        )
        run_resp.raise_for_status()
        run_json = run_resp.json()
    
    return {
        "success": True,
        "message": "Run created and queued",
        "run": run_json,
        "storage": {"csv_key": csv_key, "jsl_key": jsl_key}
    }
```

**Prevention**: Always follow the standard JMP runner integration pattern.

### Issue 5: TypeScript Import Errors

**Problem**: Module not found errors in frontend components.

**Root Cause**: Incorrect import paths or missing default exports.

**Solution**:
```typescript
// Correct import path
import { useYourPluginAnalysis } from '../hooks/useYourPluginAnalysis'

// Add default export
export default AnalysisForm
```

**Prevention**: Always use correct relative paths and add default exports.

### Issue 6: Component Export Issues

**Problem**: Components not found when importing.

**Root Cause**: Missing default exports in component files.

**Solution**:
```typescript
// Add to each component file
export default ComponentName
```

**Prevention**: Always add default exports to all component files.

### Issue 7: API Client Import Errors

**Problem**: `Module '"@/lib/api"' has no exported member 'api'`.

**Root Cause**: Incorrect import name for API client.

**Solution**:
```typescript
// Correct import
import { apiClient } from '@/lib/api'

// Use apiClient instead of api
```

**Prevention**: Check the actual export names in the API library.

## Testing and Validation

### Backend Testing

```python
# Test processor functionality
from extensions.your_plugin_name.processor import YourPluginProcessor

processor = YourPluginProcessor()
result = processor.validate_excel_structure('/path/to/test.xlsx')
print(f'Valid: {result.get("valid", False)}')
```

### Frontend Testing

```bash
# Build frontend to check for TypeScript errors
cd frontend && npm run build
```

### Integration Testing

1. **Upload Test File**: Use a real Excel file with required columns
2. **Check Validation**: Verify all checkpoints pass
3. **Test Processing**: Ensure files are generated correctly
4. **Verify Storage**: Check that files are saved to storage
5. **Test JMP Runner**: Confirm run is created and queued

## Best Practices

### Backend Development

1. **Follow Base Classes**: Always extend `BaseExtension` and `BaseAnalyzer`
2. **Use Correct File Extensions**: Always preserve original file extensions
3. **Implement Checkpoint Structure**: Return proper checkpoint arrays for wizard compatibility
4. **Add Error Handling**: Include comprehensive error handling and logging
5. **Follow JMP Runner Pattern**: Always integrate with JMP runner for analysis execution
6. **Clean Up Resources**: Remove temporary files after processing

### Frontend Development

1. **Use TypeScript**: Always use TypeScript for type safety
2. **Add Default Exports**: Include default exports for all components
3. **Follow Plugin Config**: Use the standard plugin configuration structure
4. **Implement Error Handling**: Add proper error handling in components and hooks
5. **Use Correct Imports**: Verify import paths and export names

### General Guidelines

1. **Document Everything**: Add comprehensive documentation for each plugin
2. **Test Thoroughly**: Test with various file formats and edge cases
3. **Follow Naming Conventions**: Use consistent naming patterns
4. **Version Control**: Use semantic versioning for plugin versions
5. **Error Messages**: Provide clear, actionable error messages
6. **Logging**: Add appropriate logging for debugging and monitoring

## Conclusion

This guide provides a comprehensive framework for developing plugins in the auto-jmp system. By following these patterns and avoiding the common issues documented here, you can create robust, maintainable plugins that integrate seamlessly with the existing system architecture.

Remember to always test thoroughly and follow the established patterns to ensure consistency and reliability across all plugins.
