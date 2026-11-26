"""Dataset model."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.dataset_version import DatasetVersion
    from app.models.ingestion_job import IngestionJob
    from app.models.project import Project
    from app.models.user import User


class DatasetStatus(enum.StrEnum):
    """Lifecycle status for a dataset."""

    UPLOADING = "uploading"
    PROCESSING = "processing"
    READY = "ready"
    FAILED = "failed"
    ARCHIVED = "archived"


class DatasetSourceType(enum.StrEnum):
    """File format of the original dataset."""

    CSV = "csv"
    EXCEL = "excel"
    JSON = "json"
    PARQUET = "parquet"


class Dataset(Base, TimestampMixin):
    """Dataset entity representing an uploaded data asset inside a project."""

    __tablename__ = "datasets"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    description: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        default=None,
    )
    source_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default=DatasetSourceType.CSV.value,
    )
    original_filename: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default=DatasetStatus.UPLOADING.value,
        index=True,
    )
    active_version_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey(
            "dataset_versions.id",
            ondelete="SET NULL",
            use_alter=True,
            name="fk_datasets_active_version_id",
        ),
        nullable=True,
        default=None,
        index=True,
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    archived_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        default=None,
        index=True,
    )

    # Relationships
    project: Mapped[Project] = relationship("Project", back_populates="datasets")
    creator: Mapped[User | None] = relationship("User")
    versions: Mapped[list[DatasetVersion]] = relationship(
        "DatasetVersion",
        back_populates="dataset",
        cascade="all, delete-orphan",
        foreign_keys="DatasetVersion.dataset_id",
    )
    active_version: Mapped[DatasetVersion | None] = relationship(
        "DatasetVersion",
        foreign_keys=[active_version_id],
        post_update=True,
    )
    ingestion_jobs: Mapped[list[IngestionJob]] = relationship(
        "IngestionJob",
        back_populates="dataset",
        cascade="all, delete-orphan",
        foreign_keys="IngestionJob.dataset_id",
    )

    __table_args__ = (
        Index("ix_datasets_project_status", "project_id", "status"),
        Index("ix_datasets_project_archived", "project_id", "archived_at"),
    )
