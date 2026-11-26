"""Ingestion job tracking model."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.dataset import Dataset
    from app.models.dataset_version import DatasetVersion


class IngestionJobStatus(enum.StrEnum):
    """Status of an ingestion job."""

    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class IngestionJobStage(enum.StrEnum):
    """Granular stages of dataset ingestion."""

    VALIDATING = "validating"
    PARSING = "parsing"
    SCHEMA_INFERENCE = "schema_inference"
    PROFILING = "profiling"
    PII_DETECTION = "pii_detection"
    PARQUET_CONVERSION = "parquet_conversion"
    METADATA_REGISTRATION = "metadata_registration"
    COMPLETED = "completed"


class IngestionJob(Base, TimestampMixin):
    """Background ingestion tracking entity."""

    __tablename__ = "ingestion_jobs"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
    )
    dataset_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("datasets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    dataset_version_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("dataset_versions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default=IngestionJobStatus.QUEUED.value,
        index=True,
    )
    current_stage: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
        default=IngestionJobStage.VALIDATING.value,
    )
    progress_percentage: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
    )
    status_message: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        default="Job queued for processing",
    )
    error_code: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
        default=None,
    )
    error_message: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        default=None,
    )
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        default=None,
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        default=None,
    )

    # Relationships
    dataset: Mapped[Dataset] = relationship(
        "Dataset",
        back_populates="ingestion_jobs",
        foreign_keys=[dataset_id],
    )
    version: Mapped[DatasetVersion] = relationship(
        "DatasetVersion",
        back_populates="ingestion_jobs",
        foreign_keys=[dataset_version_id],
    )

    __table_args__ = (
        Index("ix_ingestion_jobs_dataset_status", "dataset_id", "status"),
        Index("ix_ingestion_jobs_status_created", "status", "created_at"),
    )
