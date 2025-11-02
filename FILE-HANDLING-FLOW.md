# CSV and JSL File Handling Flow

This document explains how CSV and JSL files are received, processed, and stored in the system.

## File Upload Flow

### 1. File Upload (Frontend → Backend)

When files are uploaded through the frontend:

**Endpoint**: `POST /api/v1/uploads/upload`
- Location: `backend/app/api/v1/endpoints/uploads.py`
- Receives: CSV or JSL files as `UploadFile`
- Saves to: **`backend/uploads/runs/`** directory

**Storage Structure**:
```
backend/uploads/
├── runs/
│   ├── csv_YYYYMMDD_HHMMSS_XXXXXXXX.csv    # CSV files
│   └── jsl_YYYYMMDD_HHMMSS_XXXXXXXX.jsl     # JSL files
├── projects/
│   └── {project_id}/
│       └── {timestamp}_{file_id}_{filename}
└── temp/                                    # Temporary files
```

### 2. File Storage Details

**Storage Class**: `LocalFileStorage` 
- Location: `backend/app/core/storage.py`
- Base Path: `backend/uploads/` (default)
- Creates subdirectories automatically:
  - `uploads/projects/` - Project-specific files
  - `uploads/runs/` - Run input/output files
  - `uploads/temp/` - Temporary files

**Storage Key Generation**:
- CSV files: `runs/csv_{timestamp}_{uuid}.csv`
- JSL files: `runs/jsl_{timestamp}_{uuid}.jsl`
- Format: `YYYYMMDD_HHMMSS_XXXXXXXX` (8 char UUID)

### 3. Run Creation with CSV and JSL

**Endpoint**: `POST /api/v1/runs/`
- Location: `backend/app/api/v1/endpoints/runs.py`
- Receives: `RunCreate` with `csv_key` and `jsl_key`
- Creates:
  1. `Run` record in database
  2. `Artifact` records for CSV and JSL files
  3. `ProjectAttachment` records for project files

**File Paths in Database**:
- CSV artifact: `storage_key` = `runs/csv_YYYYMMDD_HHMMSS_XXXXXXXX.csv`
- JSL artifact: `storage_key` = `runs/jsl_YYYYMMDD_HHMMSS_XXXXXXXX.jsl`

### 4. JMP Runner Processing (Celery Task)

**Task**: `run_jmp_boxplot`
- Location: `backend/app/worker/tasks.py`
- Reads files from: `backend/uploads/{storage_key}`

**File Path Construction**:
```python
# In tasks.py line 111-112
csv_path = os.path.join(backend_dir, "uploads", csv_artifact.storage_key)
jsl_path = os.path.join(backend_dir, "uploads", jsl_artifact.storage_key)

# Example:
# /home/junwei/Downloads/auto-jmp-main/backend/uploads/runs/csv_20251101_120000_abc12345.csv
# /home/junwei/Downloads/auto-jmp-main/backend/uploads/runs/jsl_20251101_120000_def67890.jsl
```

### 5. Temporary Folder for JMP Execution

**JMP Runner Temporary Directory**:
- Location: `backend/jmp_runner.py`
- Default: `./tasks/` (relative to backend directory)
- Configurable via: `JMP_TASK_DIR` environment variable
- Default from config: `/tmp/jmp_tasks`

**JMP Task Directory Structure**:
```
/tmp/jmp_tasks/           # or backend/tasks/
└── task_YYYYMMDD_HHMMSS_XXXXXXXX/
    ├── data.csv          # Copy of input CSV
    ├── script.jsl        # Copy of input JSL
    ├── initial.png       # Generated images
    ├── final.png
    ├── FAI10.png
    └── ...
```

**How JMP Runner Uses Temp Directory**:
1. Creates a task-specific directory: `task_{timestamp}_{uuid}/`
2. Copies CSV and JSL files to task directory
3. Modifies JSL paths to use task directory
4. Runs JMP with modified JSL
5. Collects generated images from task directory
6. Returns image paths relative to task directory

## Configuration

### Environment Variables

**Backend `.env` file**:
```env
# JMP Configuration
JMP_TASK_DIR=/tmp/jmp_tasks           # Default temporary directory for JMP
JMP_MAX_WAIT_TIME=300                 # Maximum wait time (5 minutes)
JMP_START_DELAY=4                     # Delay after opening JMP (seconds)
```

### Storage Configuration

**Default Storage Paths**:
- Base upload directory: `backend/uploads/`
- CSV files: `backend/uploads/runs/csv_*.csv`
- JSL files: `backend/uploads/runs/jsl_*.jsl`
- Temp files: `backend/uploads/temp/`

## File Processing Flow Summary

```
1. Frontend Upload
   ↓
   POST /api/v1/uploads/upload
   ↓
2. LocalFileStorage.save_file()
   ↓
   backend/uploads/runs/{storage_key}
   ↓
3. Create Run
   ↓
   POST /api/v1/runs/ (with csv_key, jsl_key)
   ↓
4. Celery Task: run_jmp_boxplot
   ↓
   Reads: backend/uploads/{storage_key}
   ↓
5. JMPRunner.run_csv_jsl()
   ↓
   Copies to: /tmp/jmp_tasks/task_XXX/
   ↓
   Runs JMP → Generates Images
   ↓
6. Save Results
   ↓
   Creates Artifacts for output images
```

## Important Paths

### Upload Storage
- **CSV files**: `backend/uploads/runs/csv_*.csv`
- **JSL files**: `backend/uploads/runs/jsl_*.jsl`
- **Project files**: `backend/uploads/projects/{project_id}/*`

### Temporary Processing
- **JMP task dir**: `/tmp/jmp_tasks/` or `backend/tasks/`
- **Task subdirectory**: `task_{timestamp}_{uuid}/`
- **Files in task dir**: `data.csv`, `script.jsl`, generated PNGs

### Code References

1. **Storage**: `backend/app/core/storage.py` - `LocalFileStorage` class
2. **Upload API**: `backend/app/api/v1/endpoints/uploads.py` - `upload_file()` function
3. **Run Creation**: `backend/app/api/v1/endpoints/runs.py` - `create_run()` function
4. **JMP Runner**: `backend/jmp_runner.py` - `JMPRunner` class
5. **Celery Task**: `backend/app/worker/tasks.py` - `run_jmp_boxplot()` function

## Notes

- CSV and JSL files are **permanently stored** in `backend/uploads/runs/`
- Temporary files for JMP execution are in `/tmp/jmp_tasks/` or `backend/tasks/`
- The system does NOT delete uploaded CSV/JSL files automatically
- JMP task directories may accumulate - consider cleanup routine
- Storage keys are stored in database `Artifact` table
- Files are accessed via storage keys, not direct file paths

