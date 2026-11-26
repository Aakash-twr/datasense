"""Phase 3 schema: datasets, dataset_versions, data_tables, data_columns, ingestion_jobs

Revision ID: 0002_phase3_datasets_schema
Revises: 0001_initial_phase2_schema
Create Date: 2026-11-24 14:35:00.000000+00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0002_phase3_datasets_schema"
down_revision: Union[str, None] = "0001_initial_phase2_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Portable types
UUID_TYPE = sa.UUID(as_uuid=True)
JSONB_TYPE = sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql")


def upgrade() -> None:
    # 1. Datasets table
    op.create_table(
        "datasets",
        sa.Column("id", UUID_TYPE, primary_key=True),
        sa.Column("project_id", UUID_TYPE, sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("source_type", sa.String(length=50), server_default="csv", nullable=False),
        sa.Column("original_filename", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=50), server_default="uploading", nullable=False),
        sa.Column("active_version_id", UUID_TYPE, nullable=True),
        sa.Column("created_by", UUID_TYPE, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
    )
    op.create_index("ix_datasets_project_id", "datasets", ["project_id"])
    op.create_index("ix_datasets_status", "datasets", ["status"])
    op.create_index("ix_datasets_archived_at", "datasets", ["archived_at"])
    op.create_index("ix_datasets_active_version_id", "datasets", ["active_version_id"])
    op.create_index("ix_datasets_project_status", "datasets", ["project_id", "status"])
    op.create_index("ix_datasets_project_archived", "datasets", ["project_id", "archived_at"])

    # 2. Dataset Versions table
    op.create_table(
        "dataset_versions",
        sa.Column("id", UUID_TYPE, primary_key=True),
        sa.Column("dataset_id", UUID_TYPE, sa.ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("original_file_key", sa.String(length=512), nullable=False),
        sa.Column("manifest_file_key", sa.String(length=512), nullable=True),
        sa.Column("checksum", sa.String(length=64), nullable=False),
        sa.Column("file_size_bytes", sa.BigInteger(), server_default="0", nullable=False),
        sa.Column("total_row_count", sa.BigInteger(), server_default="0", nullable=False),
        sa.Column("total_column_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("profile_metadata", JSONB_TYPE, server_default=sa.text("'{}'"), nullable=False),
        sa.Column("status", sa.String(length=50), server_default="processing", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.UniqueConstraint("dataset_id", "version_number", name="uq_dataset_versions_dataset_version"),
    )
    op.create_index("ix_dataset_versions_dataset_id", "dataset_versions", ["dataset_id"])
    op.create_index("ix_dataset_versions_status", "dataset_versions", ["status"])
    op.create_index("ix_dataset_versions_dataset_version", "dataset_versions", ["dataset_id", "version_number"])

    # Foreign key for active_version_id (deferred)
    with op.batch_alter_table("datasets") as batch_op:
        batch_op.create_foreign_key(
            "fk_datasets_active_version_id",
            "dataset_versions",
            ["active_version_id"],
            ["id"],
            ondelete="SET NULL",
            use_alter=True,
        )

    # 3. Data Tables table
    op.create_table(
        "data_tables",
        sa.Column("id", UUID_TYPE, primary_key=True),
        sa.Column("dataset_version_id", UUID_TYPE, sa.ForeignKey("dataset_versions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("table_name", sa.String(length=255), nullable=False),
        sa.Column("original_table_name", sa.String(length=255), nullable=False),
        sa.Column("storage_key", sa.String(length=512), nullable=False),
        sa.Column("row_count", sa.BigInteger(), server_default="0", nullable=False),
        sa.Column("column_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("schema_metadata", JSONB_TYPE, server_default=sa.text("'{}'"), nullable=False),
        sa.Column("profile_metadata", JSONB_TYPE, server_default=sa.text("'{}'"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.UniqueConstraint("dataset_version_id", "table_name", name="uq_data_tables_version_table_name"),
    )
    op.create_index("ix_data_tables_dataset_version_id", "data_tables", ["dataset_version_id"])

    # 4. Data Columns table
    op.create_table(
        "data_columns",
        sa.Column("id", UUID_TYPE, primary_key=True),
        sa.Column("table_id", UUID_TYPE, sa.ForeignKey("data_tables.id", ondelete="CASCADE"), nullable=False),
        sa.Column("column_name", sa.String(length=255), nullable=False),
        sa.Column("physical_name", sa.String(length=255), nullable=False),
        sa.Column("data_type", sa.String(length=50), nullable=False),
        sa.Column("ordinal_position", sa.Integer(), nullable=False),
        sa.Column("nullable", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("unique_count", sa.BigInteger(), nullable=True),
        sa.Column("null_count", sa.BigInteger(), nullable=True),
        sa.Column("null_percentage", sa.Float(), nullable=True),
        sa.Column("semantic_type", sa.String(length=100), nullable=True),
        sa.Column("pii_category", sa.String(length=100), nullable=True),
        sa.Column("pii_confidence", sa.Float(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("profile_stats", JSONB_TYPE, server_default=sa.text("'{}'"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
    )
    op.create_index("ix_data_columns_table_id", "data_columns", ["table_id"])
    op.create_index("ix_data_columns_table_ordinal", "data_columns", ["table_id", "ordinal_position"])

    # 5. Ingestion Jobs table
    op.create_table(
        "ingestion_jobs",
        sa.Column("id", UUID_TYPE, primary_key=True),
        sa.Column("dataset_id", UUID_TYPE, sa.ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("dataset_version_id", UUID_TYPE, sa.ForeignKey("dataset_versions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(length=50), server_default="queued", nullable=False),
        sa.Column("current_stage", sa.String(length=50), nullable=True),
        sa.Column("progress_percentage", sa.Integer(), server_default="0", nullable=False),
        sa.Column("status_message", sa.Text(), nullable=True),
        sa.Column("error_code", sa.String(length=100), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
    )
    op.create_index("ix_ingestion_jobs_dataset_id", "ingestion_jobs", ["dataset_id"])
    op.create_index("ix_ingestion_jobs_dataset_version_id", "ingestion_jobs", ["dataset_version_id"])
    op.create_index("ix_ingestion_jobs_status", "ingestion_jobs", ["status"])
    op.create_index("ix_ingestion_jobs_dataset_status", "ingestion_jobs", ["dataset_id", "status"])
    op.create_index("ix_ingestion_jobs_status_created", "ingestion_jobs", ["status", "created_at"])


def downgrade() -> None:
    op.drop_table("ingestion_jobs")
    op.drop_table("data_columns")
    op.drop_table("data_tables")
    with op.batch_alter_table("datasets") as batch_op:
        batch_op.drop_constraint("fk_datasets_active_version_id", type_="foreignkey")
    op.drop_table("dataset_versions")
    op.drop_table("datasets")
