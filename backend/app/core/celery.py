from celery import Celery
from celery.signals import task_prerun, task_postrun, task_failure
import logging
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

# Signal hooks for richer debug logs
logger = logging.getLogger(__name__)

@task_prerun.connect
def _on_task_prerun(sender=None, task_id=None, task=None, args=None, kwargs=None, **extras):
    try:
        logger.info("[Celery] Task received: %s id=%s args=%s kwargs=%s", sender, task_id, args, kwargs)
    except Exception:
        pass

@task_postrun.connect
def _on_task_postrun(sender=None, task_id=None, retval=None, state=None, **extras):
    try:
        logger.info("[Celery] Task finished: %s id=%s state=%s retval_summary=%s", sender, task_id, state, str(retval)[:200])
    except Exception:
        pass

@task_failure.connect
def _on_task_failure(sender=None, task_id=None, exception=None, einfo=None, **extras):
    try:
        logger.error("[Celery] Task failed: %s id=%s exc=%s", sender, task_id, exception)
    except Exception:
        pass

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
