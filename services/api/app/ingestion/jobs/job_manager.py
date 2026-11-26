"""Background job dispatcher and startup crash recovery."""

from __future__ import annotations

import concurrent.futures
import logging
import uuid
from datetime import UTC, datetime

from fastapi import BackgroundTasks
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.ingestion.jobs.ingestion_service import process_dataset_ingestion
from app.models.dataset import Dataset, DatasetStatus
from app.models.dataset_version import DatasetVersion, DatasetVersionStatus
from app.models.ingestion_job import IngestionJob, IngestionJobStatus

logger = logging.getLogger(__name__)

# Lightweight thread executor for background execution when FastAPI BackgroundTasks is not present
_executor = concurrent.futures.ThreadPoolExecutor(max_workers=2, thread_name_prefix="ingestion_worker")


def dispatch_ingestion_job(
    job_id: uuid.UUID,
    background_tasks: BackgroundTasks | None = None,
) -> None:
    """Dispatch ingestion processing asynchronously."""
    if background_tasks is not None:
        background_tasks.add_task(process_dataset_ingestion, job_id, SessionLocal)
    else:
        _executor.submit(process_dataset_ingestion, job_id, SessionLocal)
    logger.info("Dispatched ingestion job %s", job_id)


def recover_interrupted_jobs(db: Session) -> int:
    """Recover jobs left in queued/processing state across application restarts."""
    interrupted_jobs = db.scalars(
        select(IngestionJob).where(
            IngestionJob.status.in_([
                IngestionJobStatus.QUEUED.value,
                IngestionJobStatus.PROCESSING.value,
            ])
        )
    ).all()

    count = len(interrupted_jobs)
    if count == 0:
        return 0

    logger.warning("Found %d interrupted ingestion jobs on startup; marking failed", count)
    for job in interrupted_jobs:
        job.status = IngestionJobStatus.FAILED.value
        job.error_code = "INTERRUPTED_BY_RESTART"
        job.error_message = "Ingestion processing was interrupted by an application restart."
        job.status_message = "Failed: Server restarted during processing."
        job.completed_at = datetime.now(UTC)

        version = db.scalar(select(DatasetVersion).where(DatasetVersion.id == job.dataset_version_id))
        if version:
            version.status = DatasetVersionStatus.FAILED.value

        dataset = db.scalar(select(Dataset).where(Dataset.id == job.dataset_id))
        if dataset and dataset.active_version_id is None:
            dataset.status = DatasetStatus.FAILED.value

    db.commit()
    return count
