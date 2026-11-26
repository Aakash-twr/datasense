"""Data column model storing inferred schema, data types, and profiling stats."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, PortableJSON

if TYPE_CHECKING:
    from app.models.data_table import DataTable


class DataColumn(Base):
    """Inferred column metadata and profiling statistics."""

    __tablename__ = "data_columns"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
    )
    table_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("data_tables.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    column_name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    physical_name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    data_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )
    ordinal_position: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )
    nullable: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
    )
    unique_count: Mapped[int | None] = mapped_column(
        BigInteger,
        nullable=True,
        default=None,
    )
    null_count: Mapped[int | None] = mapped_column(
        BigInteger,
        nullable=True,
        default=None,
    )
    null_percentage: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
        default=None,
    )
    semantic_type: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
        default=None,
    )
    pii_category: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
        default=None,
    )
    pii_confidence: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
        default=None,
    )
    description: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        default=None,
    )
    profile_stats: Mapped[dict[str, Any]] = mapped_column(
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
    table: Mapped[DataTable] = relationship("DataTable", back_populates="columns")

    __table_args__ = (
        Index("ix_data_columns_table_ordinal", "table_id", "ordinal_position"),
    )
