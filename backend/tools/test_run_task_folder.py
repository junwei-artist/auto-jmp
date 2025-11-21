import os
import sys
import uuid
import asyncio
from datetime import datetime
from pathlib import Path

# Ensure backend is on sys.path
BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.celery import celery_app
from app.models import Run, RunStatus, Artifact
from sqlalchemy import select


async def create_run_with_task_folder(task_id: str, task_dir: Path) -> uuid.UUID:
    """Create a Run and input artifacts pointing to files in the provided task folder.

    This prepares the database so the standard Celery task can process the
    already-prepared task folder (task_{task_id}).
    """
    # Discover CSV and JSL inside the task folder
    csv_path = None
    jsl_path = None
    for p in task_dir.glob("*"):
        if p.is_file():
            if p.suffix.lower() == ".csv" and csv_path is None:
                csv_path = p
            elif p.suffix.lower() == ".jsl" and jsl_path is None:
                jsl_path = p

    if not task_dir.exists() or not task_dir.is_dir():
        raise FileNotFoundError(f"Task folder not found: {task_dir}")
    if not csv_path or not csv_path.exists():
        raise FileNotFoundError(f"CSV not found in task folder: {task_dir}")
    if not jsl_path or not jsl_path.exists():
        raise FileNotFoundError(f"JSL not found in task folder: {task_dir}")

    async with AsyncSessionLocal() as db:
        # Create a new Run with QUEUED status
        run = Run(
            project_id=uuid.uuid4(),  # standalone test run
            status=RunStatus.QUEUED,
            task_name="jmp_boxplot",
            message="Test run queued",
            created_at=datetime.utcnow(),
        )
        db.add(run)
        await db.commit()
        await db.refresh(run)

        # Create input artifacts referencing discovered files
        csv_artifact = Artifact(
            project_id=run.project_id,
            run_id=run.id,
            kind="input_csv",
            storage_key=str(csv_path.resolve()),
            filename=csv_path.name,
            mime_type="text/csv",
        )
        jsl_artifact = Artifact(
            project_id=run.project_id,
            run_id=run.id,
            kind="input_jsl",
            storage_key=str(jsl_path.resolve()),
            filename=jsl_path.name,
            mime_type="text/plain",
        )
        db.add(csv_artifact)
        db.add(jsl_artifact)

        # Persist jmp_task_id so worker uses the prepared task folder
        run.jmp_task_id = task_id
        await db.commit()

        return run.id


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Test running an existing task folder with Celery/JMPRunner")
    parser.add_argument("task_id", help="Task ID, e.g. 20251031_060448_64d8abd1")
    args = parser.parse_args()

    tasks_root = Path(settings.TASKS_DIRECTORY).expanduser().resolve()
    task_dir = tasks_root / f"task_{args.task_id}"
    print(f"[INFO] Using task folder: {task_dir}")

    # Create run and artifacts, link jmp_task_id, then queue Celery task
    run_id = asyncio.run(create_run_with_task_folder(args.task_id, task_dir))
    print(f"[INFO] Created run: {run_id}")

    # Queue the standard Celery task
    celery_app.send_task("run_jmp_boxplot", args=[str(run_id)])
    print(f"[INFO] Queued Celery task 'run_jmp_boxplot' for run {run_id}")
    print("[NOTE] Check worker logs and frontend for progress updates.")


if __name__ == "__main__":
    main()


