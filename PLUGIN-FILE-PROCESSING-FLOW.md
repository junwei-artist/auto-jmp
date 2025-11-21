# Plugin Excel → CSV/JSL Processing Flow

This document explains how plugins process Excel files and generate CSV/JSL files, including all temporary file handling.

## Complete Processing Flow

### 1. Excel File Upload (Frontend → Plugin API)

**Endpoint**: `POST /api/v1/extensions/{plugin}/run-analysis`
- Example: `POST /api/v1/extensions/excel2boxplotv1/run-analysis`
- Receives: Excel file as `UploadFile` via form data
- Location: `backend/extensions/{plugin}/api.py`

**Temporary Excel File Storage**:
```python
# Excel file is saved to system temp directory
with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as tmp_file:
    content = await file.read()
    tmp_file.write(content)
    tmp_file.flush()
    tmp_file.name  # Path: /tmp/tmpXXXXXXXX.xlsx (system temp)
```

**Temp File Location**:
- System temp directory: `/tmp/tmpXXXXXXXX.xlsx` (Linux/Mac)
- Or: `C:\Users\...\AppData\Local\Temp\tmpXXXXXXXX.xlsx` (Windows)
- File is **NOT automatically deleted** (uses `delete=False`)
- Cleanup: `os.unlink(tmp_file.name)` after processing

### 2. Excel File Processing

**Plugin Processor**:
- Location: `backend/extensions/{plugin}/processor.py`
- Method: `processor.process_excel_file(tmp_file.name, ...)`
- Steps:
  1. Load Excel file using pandas: `pd.read_excel(tmp_file.name, sheet_name="meta"|"data")`
  2. Validate structure
  3. Process data
  4. Generate CSV content (in memory as string)
  5. Generate JSL content (in memory as string)

**CSV/JSL Generation**:
- Location: `backend/extensions/{plugin}/file_processor.py`
- Method: `file_processor.generate_files(...)`
- **No temporary files** - CSV and JSL are generated as **strings in memory**
- Returns:
  ```python
  {
      "files": {
          "csv_content": "...",  # String, not file path
          "jsl_content": "...",   # String, not file path
          "zip_path": "/tmp/tmpXXXXXX.zip"  # Optional ZIP file
      }
  }
  ```

### 3. CSV/JSL File Persistence

**Save to Permanent Storage**:
```python
# Convert string content to bytes
csv_bytes = result["files"]["csv_content"].encode("utf-8")
jsl_bytes = result["files"]["jsl_content"].encode("utf-8")

# Generate storage keys
csv_key = local_storage.generate_storage_key("data.csv", "text/csv")
# Result: "runs/csv_20251101_120000_abc12345.csv"

jsl_key = local_storage.generate_storage_key("analysis.jsl", "text/plain")
# Result: "runs/jsl_20251101_120000_def67890.jsl"

# Save to permanent storage
local_storage.save_file(csv_bytes, csv_key)
# Saves to: backend/uploads/runs/csv_20251101_120000_abc12345.csv

local_storage.save_file(jsl_bytes, jsl_key)
# Saves to: backend/uploads/runs/jsl_20251101_120000_def67890.jsl
```

**Storage Structure**:
```
backend/uploads/
└── runs/
    ├── csv_YYYYMMDD_HHMMSS_XXXXXXXX.csv    # Generated CSV
    └── jsl_YYYYMMDD_HHMMSS_XXXXXXXX.jsl     # Generated JSL
```

### 4. Run Creation

**API Call to Create Run**:
```python
async with httpx.AsyncClient() as client:
    run_resp = await client.post(
        f"{backend_base}/api/v1/runs/",
        json={
            "project_id": project_id,
            "csv_key": csv_key,  # "runs/csv_..."
            "jsl_key": jsl_key   # "runs/jsl_..."
        }
    )
```

**Run Creation Process**:
- Location: `backend/app/api/v1/endpoints/runs.py`
- Creates `Run` record in database
- Creates `Artifact` records with storage keys
- Triggers Celery task `run_jmp_boxplot`

### 5. Cleanup

**Temporary Files Cleaned Up**:
```python
# Clean up temporary Excel file
os.unlink(tmp_file.name)  # Delete /tmp/tmpXXXXXXXX.xlsx

# Clean up temporary ZIP file (if created)
if zip_result.get("zip_path"):
    os.unlink(zip_result["zip_path"])  # Delete /tmp/tmpXXXXXX.zip
```

**Files NOT Cleaned Up**:
- Permanent CSV/JSL files in `backend/uploads/runs/` - **kept permanently**
- Generated files are needed for JMP execution

## Temporary Files Summary

### Temporary Excel File
- **Location**: System temp directory (`/tmp/` or OS equivalent)
- **Format**: `tmpXXXXXXXX.xlsx`
- **Created**: When Excel file is uploaded
- **Deleted**: After plugin processing completes
- **Lifetime**: Short (during API request)

### CSV/JSL Files (In Memory)
- **Location**: RAM (Python strings)
- **Format**: String content, not files
- **Created**: During plugin processing
- **Deleted**: N/A (garbage collected)
- **Lifetime**: During API request only

### Permanent CSV/JSL Files
- **Location**: `backend/uploads/runs/`
- **Format**: `csv_YYYYMMDD_HHMMSS_XXXXXXXX.csv`, `jsl_YYYYMMDD_HHMMSS_XXXXXXXX.jsl`
- **Created**: When saved via `local_storage.save_file()`
- **Deleted**: **NEVER** (manual cleanup required)
- **Lifetime**: Permanent until manually deleted

### Optional ZIP File
- **Location**: System temp directory (`/tmp/`)
- **Format**: `tmpXXXXXX.zip`
- **Created**: When generating ZIP for download
- **Deleted**: After saving to storage (if uploaded as attachment)
- **Lifetime**: Short (during API request)

## Code Locations

### Plugin API Endpoints
- `backend/extensions/excel2boxplotv1/api.py` - Boxplot plugin
- `backend/extensions/excel2cpkv1/api.py` - CPK plugin
- `backend/extensions/excel2commonality/api.py` - Commonality plugin
- `backend/extensions/excel2boxplotv2/api.py` - Boxplot V2 plugin

### Processing Logic
- `backend/extensions/{plugin}/processor.py` - Main processor
- `backend/extensions/{plugin}/file_processor.py` - CSV/JSL generator
- `backend/extensions/{plugin}/file_handler.py` - Excel file loader

### Storage
- `backend/app/core/storage.py` - `LocalFileStorage` class
- Storage base path: `backend/uploads/`

## File Flow Diagram

```
1. Excel Upload
   ↓
   tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx')
   ↓
   /tmp/tmpXXXXXXXX.xlsx (Temporary Excel)
   ↓
2. Plugin Processing
   ↓
   processor.process_excel_file(tmp_file.name)
   ↓
   Reads Excel → Processes Data → Generates Strings
   ↓
   {
       "csv_content": "..." (string in memory),
       "jsl_content": "..." (string in memory)
   }
   ↓
3. Save to Storage
   ↓
   local_storage.save_file(csv_bytes, csv_key)
   local_storage.save_file(jsl_bytes, jsl_key)
   ↓
   backend/uploads/runs/csv_*.csv (Permanent)
   backend/uploads/runs/jsl_*.jsl (Permanent)
   ↓
4. Create Run
   ↓
   POST /api/v1/runs/ with csv_key, jsl_key
   ↓
5. Cleanup
   ↓
   os.unlink(tmp_file.name)  # Delete temp Excel
```

## Important Notes

1. **Excel files are temporary** - Saved to system temp, deleted after processing
2. **CSV/JSL are generated in memory** - No temporary CSV/JSL files created
3. **CSV/JSL are saved permanently** - Stored in `backend/uploads/runs/`
4. **ZIP files are temporary** - Created in temp dir, deleted after upload
5. **No cleanup of permanent files** - CSV/JSL files persist indefinitely

## Configuration

### System Temp Directory
- Linux/Mac: `/tmp/`
- Windows: `%TEMP%` or `%TMP%`
- Controlled by Python's `tempfile` module

### Permanent Storage Directory
- Base: `backend/uploads/`
- CSV/JSL: `backend/uploads/runs/`
- Configurable via `LocalFileStorage.__init__(base_path="uploads")`

## Storage Key Format

**CSV Files**:
```
runs/csv_YYYYMMDD_HHMMSS_XXXXXXXX.csv
```
- `YYYYMMDD_HHMMSS`: Timestamp
- `XXXXXXXX`: 8-character UUID

**JSL Files**:
```
runs/jsl_YYYYMMDD_HHMMSS_XXXXXXXX.jsl
```

## Example File Paths

**Temporary Excel**:
```
/tmp/tmpA7b8c9D.xlsx
```

**Permanent CSV**:
```
/home/junwei/Downloads/auto-jmp-main/backend/uploads/runs/csv_20251101_120530_a1b2c3d4.csv
```

**Permanent JSL**:
```
/home/junwei/Downloads/auto-jmp-main/backend/uploads/runs/jsl_20251101_120530_e5f6g7h8.jsl
```

## Cleanup Recommendations

**Automatic Cleanup**:
- Temporary Excel files: ✅ Automatically deleted
- Temporary ZIP files: ✅ Automatically deleted (if not saved)

**Manual Cleanup Required**:
- Permanent CSV/JSL files: ⚠️ Need manual cleanup or scheduled task
- Consider implementing:
  - Retention policy (delete files older than X days)
  - Periodic cleanup job
  - Storage quota management

