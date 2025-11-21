# Plugin Flow Documentation: Excel Upload → JSL/CSV → Redis/Celery → JMP Image Generation

This document explains the complete flow of how plugins handle Excel file uploads, convert them to JSL and CSV, send tasks to Redis/Celery, and generate images using JMP.

## High-Level Flow Overview

```
User Uploads Excel
    ↓
Plugin Extension API Processes Excel
    ↓
Generate CSV and JSL Files
    ↓
Save Files to Local Storage
    ↓
Create Run Record in Database
    ↓
Prepare Task Folder with Files
    ↓
Queue Celery Task (via Redis)
    ↓
Celery Worker Picks Up Task
    ↓
JMP Runner Executes JSL with CSV
    ↓
Generate Images
    ↓
Save Images as Artifacts
```

---

## Detailed Flow Breakdown

### 1. User Uploads Excel File

**Location:** `frontend/app/plugins/[plugin]/wizard/page.tsx`

- User selects an Excel file through the plugin wizard UI
- File is uploaded via FormData to the plugin's `/run-analysis` endpoint
- Example plugins: `excel2boxplotv2`, `excel2cpkv1`, `excel2commonality`, `excel2processcapability`

**API Endpoints:**
- `POST /api/v1/extensions/{plugin_name}/run-analysis`
- Examples:
  - `/api/v1/extensions/excel2boxplotv2/run-analysis`
  - `/api/v1/extensions/excel2cpkv1/run-analysis`
  - `/api/v1/extensions/excel2commonality/run-analysis`

---

### 2. Excel Processing and Conversion to JSL/CSV

**Location:** `backend/extensions/{plugin_name}/api.py` → `run_analysis_modular()`

#### Step 2.1: Save Uploaded File Temporarily
```python
with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as tmp_file:
    content = await file.read()
    tmp_file.write(content)
    tmp_file.flush()
```

#### Step 2.2: Load and Process Excel File
Each plugin has its own processor that:
- **Loads Excel file** using pandas/openpyxl
- **Extracts data** (FAI columns, metadata, specifications)
- **Processes data** (calculates boundaries, matches specs, etc.)
- **Generates CSV** from processed data
- **Generates JSL** (JMP Script Language) with visualization commands

**Key Files:**
- `backend/extensions/excel2boxplotv2/`: Uses `FileHandler`, `DataProcessor`, `FileProcessor`
- `backend/extensions/excel2cpkv1/processor.py`: Uses `CPKAnalyzer`
- `backend/extensions/excel2commonality/processor.py`: Uses `CommonalityAnalyzer`

#### Step 2.3: Generate Output Files
The processor returns:
```python
{
    "success": True,
    "files": {
        "csv_content": str,  # CSV data as string
        "jsl_content": str,  # JSL script as string
        "csv_filename": str,
        "jsl_filename": str
    },
    "details": {...}
}
```

---

### 3. Persist Files to Local Storage

**Location:** `backend/app/core/storage.py` → `LocalFileStorage`

#### Step 3.1: Generate Storage Keys
```python
csv_key = local_storage.generate_storage_key("data.csv", "text/csv")
jsl_key = local_storage.generate_storage_key("analysis.jsl", "text/plain")
```

Storage keys are generated with timestamps and unique IDs:
- CSV: `runs/csv_{timestamp}_{uuid}.csv`
- JSL: `runs/jsl_{timestamp}_{uuid}.jsl`

#### Step 3.2: Save Files to Filesystem
```python
csv_bytes = file_result["files"]["csv_content"].encode("utf-8")
jsl_bytes = file_result["files"]["jsl_content"].encode("utf-8")

local_storage.save_file(csv_bytes, csv_key)
local_storage.save_file(jsl_bytes, jsl_key)
```

Files are saved to `backend/uploads/` directory structure.

---

### 4. Create Run Record in Database

**Location:** `backend/extensions/{plugin_name}/api.py` → `run_analysis_modular()`

#### Step 4.1: Create Run Record
```python
run = Run(
    project_id=uuid.UUID(project_id),
    started_by=current_user.id if current_user else None,
    status=RunStatus.QUEUED,
    task_name="jmp_boxplot",
    message="Run queued"
)
db.add(run)
await db.commit()
```

#### Step 4.2: Create Run Directory
```python
run_dir_key = f"runs/{str(run.id)}"
run_dir_path = local_storage.get_file_path(run_dir_key)
run_dir_path.mkdir(parents=True, exist_ok=True)
```

#### Step 4.3: Copy Files to Run Folder
Files are copied from temporary storage to the run's dedicated folder:
```python
dst_csv_path = local_storage.get_file_path(f"{run_dir_key}/{csv_filename}")
dst_jsl_path = local_storage.get_file_path(f"{run_dir_key}/{jsl_filename}")

dst_csv_path.write_bytes(src_csv_path.read_bytes())
dst_jsl_path.write_bytes(src_jsl_path.read_bytes())
```

#### Step 4.4: Create Artifact Records
```python
csv_artifact = Artifact(
    project_id=project_id,
    run_id=run.id,
    kind="input_csv",
    storage_key=dst_csv_path,
    filename=csv_filename,
    mime_type="text/csv"
)

jsl_artifact = Artifact(
    project_id=project_id,
    run_id=run.id,
    kind="input_jsl",
    storage_key=dst_jsl_path,
    filename=jsl_filename,
    mime_type="text/plain"
)
```

---

### 5. Prepare Task Folder and Queue Celery Task

**Location:** `backend/extensions/{plugin_name}/api.py` → `run_analysis_modular()`

#### Step 5.1: Create Task Folder
A task folder is created for JMP execution:
```python
from app.core.config import settings
tasks_root = Path(settings.TASKS_DIRECTORY).expanduser().resolve()
task_dir = tasks_root / f"task_{jmp_task_id}"
task_dir.mkdir(parents=True, exist_ok=True)
```

#### Step 5.2: Copy Files to Task Folder
```python
csv_dst = task_dir / csv_filename
jsl_dst = task_dir / jsl_filename

csv_dst.write_bytes(csv_path.read_bytes())
```

#### Step 5.3: Modify JSL with Metadata Header
The JSL file is modified to include metadata and ensure correct CSV path:
```python
jsl_header = f"""// JSL Script generated by Auto-JMP Platform
// Run ID: {str(run.id)}
// Task Folder ID: {jmp_task_id}
// Created: {create_time}
// CSV File: {csv_dst.name}
Open("{absolute_csv_path}");
"""

# Prepend or replace existing Open() statement
modified_jsl_content = jsl_header + jsl_content
jsl_dst.write_text(modified_jsl_content, encoding='utf-8')
```

#### Step 5.4: Save Task ID to Run Record
```python
run.jmp_task_id = jmp_task_id
await db.commit()
```

#### Step 5.5: Queue Celery Task via Redis
**Location:** `backend/app/core/celery.py`

Celery uses Redis as the message broker:
```python
from app.core.celery import celery_app

celery_app.send_task("run_jmp_boxplot", args=[str(run.id)])
```

**Configuration:**
- **Broker:** Redis (configured via `CELERY_BROKER_URL`)
- **Backend:** Redis (configured via `CELERY_RESULT_BACKEND`)
- **Task Name:** `run_jmp_boxplot`
- **Queue:** `jmp` (configured in `task_routes`)

The task message is sent to Redis, where it waits for a Celery worker to pick it up.

---

### 6. Celery Worker Picks Up Task

**Location:** `backend/app/worker/tasks.py` → `run_jmp_boxplot()`

#### Step 6.1: Worker Receives Task
The Celery worker (running as a separate process) picks up the task from Redis:
```python
@celery_app.task(bind=True, name="run_jmp_boxplot")
def run_jmp_boxplot(self, run_id: str) -> Dict[str, Any]:
    # Task received from Redis queue
```

#### Step 6.2: Update Run Status
```python
await db.execute(
    update(Run)
    .where(Run.id == uuid.UUID(run_id))
    .values(
        status=RunStatus.RUNNING,
        started_at=datetime.utcnow(),
        message="Starting JMP analysis..."
    )
)
```

#### Step 6.3: Get Task Folder Path
```python
tasks_root = Path(settings.TASKS_DIRECTORY).expanduser().resolve()
task_dir = tasks_root / f"task_{run.jmp_task_id}"

# Find CSV and JSL files in task folder
csv_path = next(task_dir.glob("*.csv"))
jsl_path = next(task_dir.glob("*.jsl"))
```

---

### 7. JMP Runner Executes JSL with CSV

**Location:** `backend/jmp_runner.py` → `JMPRunner.run_csv_jsl()`

#### Step 7.1: Initialize JMP Runner
```python
jmp_runner = JMPRunner(
    base_task_dir=settings.TASKS_DIRECTORY,
    max_wait_time=300,
    jmp_start_delay=6
)
```

#### Step 7.2: Execute JSL Script
```python
result = jmp_runner.run_csv_jsl(
    csv_path=str(csv_path),
    jsl_path=str(jsl_path),
    task_id=run.jmp_task_id,
    on_task_ready=callback,
    on_progress=progress_callback
)
```

**What happens:**
1. **Close existing JMP processes** (to avoid conflicts)
2. **Modify JSL** to ensure correct CSV path
3. **Open JSL file with JMP** using `subprocess.run(["open", jsl_path])`
4. **Execute JSL script** via AppleScript (macOS) or subprocess
5. **Wait for JMP completion** by monitoring process and output files
6. **Collect generated images** (PNG files) from task folder

#### Step 7.3: Process Images
- **OCR processing** for validation (checks initial.png and final.png)
- **Image validation** to ensure quality
- **Return results**:
```python
{
    "status": "completed",
    "task_id": task_id,
    "task_dir": str(task_dir),
    "images": ["image1.png", "image2.png", ...],
    "image_count": len(images),
    "ocr_results": {...}
}
```

---

### 8. Save Images as Artifacts

**Location:** `backend/app/worker/tasks.py` → `run_jmp_boxplot()`

#### Step 8.1: Update Run Status to SUCCEEDED
```python
await db.execute(
    update(Run)
    .where(Run.id == uuid.UUID(run_id))
    .values(
        status=RunStatus.SUCCEEDED,
        finished_at=datetime.utcnow(),
        message="Analysis completed successfully",
        image_count=result.get("image_count", 0)
    )
)
```

#### Step 8.2: Create Artifact Records for Images
```python
for image_file in result["images"]:
    artifact = Artifact(
        project_id=run.project_id,
        run_id=run.id,
        kind="output_image",
        storage_key=f"{task_dir}/{image_file}",
        filename=image_file,
        mime_type="image/png"
    )
    db.add(artifact)
```

#### Step 8.3: Publish WebSocket Update
```python
await publish_run_update(run_id, {
    "type": "run_completed",
    "run_id": run_id,
    "status": "succeeded",
    "message": "Analysis completed successfully",
    "image_count": result.get("image_count", 0)
})
```

The frontend receives the update via WebSocket and displays the generated images.

---

## Key Components Summary

### Storage
- **Files stored in:** `backend/uploads/`
- **Structure:**
  - `uploads/runs/{run_id}/` - Run-specific files
  - `uploads/tasks/task_{task_id}/` - Task execution folders
  - `uploads/projects/{project_id}/` - Project attachments

### Redis/Celery
- **Purpose:** Message queue for async task processing
- **Configuration:** `CELERY_BROKER_URL` and `CELERY_RESULT_BACKEND`
- **Task:** `run_jmp_boxplot`
- **Queue:** `jmp`

### Database
- **Run table:** Tracks analysis runs
- **Artifact table:** Stores references to CSV, JSL, and generated images
- **Project table:** Groups runs by project

### JMP Runner
- **Location:** `backend/jmp_runner.py`
- **Function:** Executes JSL scripts with CSV data in JMP to generate visualizations
- **Output:** PNG image files saved in task folder

---

## Error Handling and Queue Mode

### Queue Mode
The system supports two modes:
- **Parallel Mode (default):** Tasks run immediately when queued
- **Queue Mode:** Tasks wait for other tasks to complete (sequential processing)

Configuration via `AppSetting` with key `queue_mode`.

### Error Handling
- Failed runs are marked as `RunStatus.FAILED`
- Error messages are stored in `run.message`
- Failure images may be generated and saved as artifacts
- WebSocket notifications inform the frontend of failures

---

## Example Plugin Flow

### excel2boxplotv2 Plugin

1. User uploads Excel via frontend wizard
2. `POST /api/v1/extensions/excel2boxplotv2/run-analysis`
3. `FileHandler.load_excel_file()` loads Excel
4. `DataProcessor.process_data()` processes data with categorical variable
5. `FileProcessor.generate_files()` generates CSV and JSL
6. Files saved to local storage
7. Run created in database
8. Task folder prepared with files
9. Celery task queued via Redis
10. Worker picks up task
11. JMP Runner executes JSL
12. Images generated and saved
13. Artifacts created in database
14. Frontend displays results

---

## Related Files

### Backend
- `backend/app/core/celery.py` - Celery configuration
- `backend/app/worker/tasks.py` - Celery task implementation
- `backend/app/core/storage.py` - Local file storage
- `backend/jmp_runner.py` - JMP execution logic
- `backend/extensions/{plugin}/api.py` - Plugin API endpoints
- `backend/extensions/{plugin}/processor.py` - Plugin processing logic

### Frontend
- `frontend/app/plugins/[plugin]/wizard/page.tsx` - Plugin wizard UI
- `frontend/components/plugins/PluginWizard.tsx` - Wizard component

---

This flow ensures that Excel files are properly processed, converted to JSL and CSV, queued for async processing, and executed by JMP to generate visualizations, all while maintaining proper tracking in the database and providing real-time updates to users via WebSocket.

