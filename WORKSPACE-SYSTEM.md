# Workspace System Documentation

## Overview

The workspace system is a higher-level abstraction that allows users to create node-based workflows for data analysis. It's similar to ComfyUI, n8n, or Node-RED, but specifically designed for data processing pipelines.

## Architecture

### Backend Structure

```
backend/
├── app/
│   ├── models/
│   │   └── workspace.py          # Database models (Workspace, Workflow, WorkflowNode, etc.)
│   ├── workspaces/
│   │   ├── engine/
│   │   │   ├── node_base.py       # BaseNode class and interfaces
│   │   │   ├── workflow_runner.py  # Workflow execution engine
│   │   │   ├── io_manager.py      # I/O manager for artifacts
│   │   │   └── registry.py        # Module registry
│   │   └── modules/
│   │       ├── excel_loader/       # Excel file loader module
│   │       ├── duckdb_convert/     # DataFrame to DuckDB converter
│   │       └── boxplot_stats/      # Box plot and statistics generator
│   └── api/
│       └── v1/
│           └── endpoints/
│               └── workspaces.py   # API endpoints
```

### Frontend Structure

```
frontend/
├── app/
│   └── workspace/
│       ├── page.tsx                # Workspace list page
│       └── [workspaceId]/
│           ├── page.tsx            # Workspace detail page
│           └── workflow/
│               └── [workflowId]/
│                   └── page.tsx    # Workflow editor page
└── components/
    └── workspace/
        └── NodeEditorView.tsx       # Node editor component
```

## Database Models

### Workspace
- Contains multiple workflows
- Owned by a user
- Can be public or private

### Workflow
- DAG (Directed Acyclic Graph) of nodes
- Has status (draft, running, completed, failed)
- Stores graph_data (node positions, etc.)

### WorkflowNode
- Represents a module instance in a workflow
- Has position (x, y) for UI
- Stores module-specific config
- Stores runtime state (outputs, errors)

### WorkflowConnection
- Connects two nodes
- Specifies source/target ports

### WorkflowExecution
- Execution history
- Stores execution results and status

### WorkflowArtifact
- Artifacts produced by workflows
- Can be DuckDB files, plots, statistics, etc.

## Modules

### Excel Loader (`excel_loader`)
- **Inputs**: Excel file (FILE)
- **Outputs**: DataFrame (DATA), Sheet name (STRING)
- **Config**: Sheet name selection

### DuckDB Converter (`duckdb_convert`)
- **Inputs**: DataFrame (DATA)
- **Outputs**: DuckDB path (FILE), Table name (STRING)
- **Config**: Table name

### Box Plot & Statistics (`boxplot_stats`)
- **Inputs**: DuckDB path (FILE), Table name (STRING)
- **Outputs**: Plot image (FILE), Statistics (JSON)
- **Config**: Column name to analyze

## API Endpoints

### Workspaces
- `POST /api/v1/workspaces` - Create workspace
- `GET /api/v1/workspaces` - List workspaces
- `GET /api/v1/workspaces/{id}` - Get workspace
- `PUT /api/v1/workspaces/{id}` - Update workspace
- `DELETE /api/v1/workspaces/{id}` - Delete workspace

### Workflows
- `POST /api/v1/workspaces/{workspace_id}/workflows` - Create workflow
- `GET /api/v1/workspaces/{workspace_id}/workflows` - List workflows
- `GET /api/v1/workflows/{id}` - Get workflow
- `PUT /api/v1/workflows/{id}` - Update workflow

### Nodes
- `POST /api/v1/workflows/{workflow_id}/nodes` - Create node
- `GET /api/v1/workflows/{workflow_id}/nodes` - List nodes
- `PUT /api/v1/nodes/{id}` - Update node
- `DELETE /api/v1/nodes/{id}` - Delete node

### Connections
- `POST /api/v1/workflows/{workflow_id}/connections` - Create connection
- `GET /api/v1/workflows/{workflow_id}/connections` - List connections
- `DELETE /api/v1/connections/{id}` - Delete connection

### Execution
- `POST /api/v1/workflows/{workflow_id}/execute` - Execute workflow

### Modules
- `GET /api/v1/modules` - List available modules

## Workflow Execution

1. **Build DAG**: Load nodes and connections, build directed graph
2. **Topological Sort**: Determine execution order (no cycles allowed)
3. **Execute Nodes**: Run each node in order, passing outputs as inputs
4. **Store Results**: Save node outputs and execution state

## Next Steps

### Database Migration
Create an Alembic migration to add the new tables:

```bash
cd backend
alembic revision -m "add_workspace_tables"
```

Then add the table creation code to the migration file.

### Frontend Enhancements
1. **Node Editor Improvements**:
   - Better connection UI (drag from port to port)
   - Port visualization
   - Node configuration panel
   - Properties panel for selected node

2. **Table View Component**:
   - Display DataFrame/table data
   - Column selection UI

3. **Artifact Viewer**:
   - Display plots
   - Show statistics
   - Download artifacts

### Module Enhancements
1. **Excel Loader**:
   - Sheet selection UI
   - Preview table view

2. **DuckDB Converter**:
   - Save as artifact properly
   - Table preview

3. **Box Plot**:
   - Column selection dropdown
   - Better plot styling
   - Statistics display

### Testing
- Unit tests for workflow runner
- Integration tests for workflow execution
- E2E tests for node editor

## Usage Example

1. Create a workspace
2. Create a workflow in the workspace
3. Add nodes (Excel Loader → DuckDB Converter → Box Plot)
4. Connect nodes (Excel Loader.dataframe → DuckDB Converter.dataframe)
5. Configure nodes (select sheet, column, etc.)
6. Execute workflow
7. View artifacts (plots, statistics)

## File Storage

Workspace files are stored in:
```
backend/uploads/workspaces/{workspace_id}/{workflow_id}/{execution_id}/{node_id}/
```

This includes:
- DuckDB database files
- Plot images
- Other artifacts

