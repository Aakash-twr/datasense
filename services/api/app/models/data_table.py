"""Data table model representing a logical table/worksheet inside a dataset version."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, PortableJSON

if TYPE_CHECKING:
    from app.models.data_column import DataColumn
    from app.models.dataset_version import DatasetVersion


class DataTable(Base):
    """Logical table corresponding to a parsed tabular file or Excel sheet."""

    __tablename__ = "data_tables"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
    )
    dataset_version_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("dataset_versions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    table_name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    original_table_name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    storage_key: Mapped[str] = mapped_column(
        String(512),
        nullable=False,
    )
    row_count: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
        default=0,
    )
    column_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
    )
    description: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        default=None,
    )
    schema_metadata: Mapped[dict[str, Any]] = mapped_column(
        PortableJSON,
        nullable=False,
        default=dict,
    )
    profile_metadata: Mapped[dict[str, Any]] = mapped_column(
        PortableJSON,
        nullable=False,
        default=dict,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )

    # Relationships
    version: Mapped[DatasetVersion] = relationship("DatasetVersion", back_populates="tables")
    columns: Mapped[list[DataColumn]] = relationship(
        "DataColumn",
        back_populates="table",
        cascade="all, delete-orphan",
        order_by="DataColumn.ordinal_position",
    )

    __table_args__ = (
        UniqueConstraint("dataset_version_id", "table_name", name="uq_data_tables_version_table_name"),
        Index("ix_data_tables_version_id", "dataset_version_id"),
    )
