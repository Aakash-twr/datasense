"""Dataset version model."""

from __future__ import annotations

import enum
import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, PortableJSON

if TYPE_CHECKING:
    from app.models.data_table import DataTable
    from app.models.dataset import Dataset
    from app.models.ingestion_job import IngestionJob


class DatasetVersionStatus(enum.StrEnum):
    """Lifecycle status for an immutable dataset version."""

    PROCESSING = "processing"
    READY = "ready"
    FAILED = "failed"


class DatasetVersion(Base):
    """Immutable version of an uploaded dataset."""

    __tablename__ = "dataset_versions"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
    )
    dataset_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("datasets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    version_number: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )
    original_file_key: Mapped[str] = mapped_column(
        String(512),
        nullable=False,
    )
    manifest_file_key: Mapped[str | None] = mapped_column(
        String(512),
        nullable=True,
        default=None,
    )
    checksum: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
    )
    file_size_bytes: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
        default=0,
    )
    total_row_count: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
        default=0,
    )
    total_column_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
    )
    profile_metadata: Mapped[dict[str, Any]] = mapped_column(
        PortableJSON,
        nullable=False,
        default=dict,
    )
    status: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default=DatasetVersionStatus.PROCESSING.value,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )

    # Relationships
    dataset: Mapped[Dataset] = relationship(
        "Dataset",
        back_populates="versions",
        foreign_keys=[dataset_id],
    )
    tables: Mapped[list[DataTable]] = relationship(
        "DataTable",
        back_populates="version",
        cascade="all, delete-orphan",
    )
    ingestion_jobs: Mapped[list[IngestionJob]] = relationship(
        "IngestionJob",
        back_populates="version",
        cascade="all, delete-orphan",
        foreign_keys="IngestionJob.dataset_version_id",
    )

    __table_args__ = (
        UniqueConstraint("dataset_id", "version_number", name="uq_dataset_versions_dataset_version"),
        Index("ix_dataset_versions_dataset_version", "dataset_id", "version_number"),
    )
