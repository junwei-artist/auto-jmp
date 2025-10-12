from celery import Celery
from app.core.config import settings

# Create Celery instance
celery_app = Celery(
    "data_analysis_worker",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=["app.worker.tasks"]
)

# Celery configuration
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=30 * 60,  # 30 minutes
    task_soft_time_limit=25 * 60,  # 25 minutes
    worker_prefetch_multiplier=1,
    worker_max_tasks_per_child=1,  # Restart worker after each task
)

# Optional configuration for better error handling
celery_app.conf.update(
    task_acks_late=True,
    worker_disable_rate_limits=True,
)

# Task routing configuration
celery_app.conf.update(
    task_routes={
        'run_jmp_boxplot': {'queue': 'jmp'},
    }
)
