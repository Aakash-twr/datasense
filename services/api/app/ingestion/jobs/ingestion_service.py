"""Dataset ingestion execution service."""

from __future__ import annotations

import json
import logging
import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.ingestion.normalization.column_normalizer import apply_column_normalization
from app.ingestion.parsers import get_parser_for_type
from app.ingestion.profiling import (
    detect_data_quality_issues,
    detect_table_pii,
    infer_table_schema,
    profile_column_statistics,
    profile_table_statistics,
)
from app.ingestion.storage.local_storage import (
    build_manifest_key,
    build_normalized_parquet_key,
    default_storage,
)
from app.ingestion.validation import FileValidationError, validate_file_content
from app.models.data_column import DataColumn
from app.models.data_table import DataTable
from app.models.dataset import Dataset, DatasetStatus
from app.models.dataset_version import DatasetVersion, DatasetVersionStatus
from app.models.ingestion_job import IngestionJob, IngestionJobStage, IngestionJobStatus

logger = logging.getLogger(__name__)


def process_dataset_ingestion(
    job_id: uuid.UUID,
    session_factory=SessionLocal,
) -> None:
    """Execute the end-to-end ingestion pipeline in a background worker."""
    db: Session = session_factory()
    try:
        job = db.scalar(select(IngestionJob).where(IngestionJob.id == job_id))
        if not job:
            logger.error("Ingestion job %s not found", job_id)
            return

        dataset = db.scalar(select(Dataset).where(Dataset.id == job.dataset_id))
        version = db.scalar(select(DatasetVersion).where(DatasetVersion.id == job.dataset_version_id))
        if not dataset or not version:
            logger.error("Dataset or Version not found for job %s", job_id)
            return

        # Start job
        job.status = IngestionJobStatus.PROCESSING.value
        job.started_at = datetime.now(UTC)
        job.current_stage = IngestionJobStage.VALIDATING.value
        job.progress_percentage = 10
        job.status_message = "Validating uploaded file..."
        db.commit()

        # Step 1: Validate file content & signatures
        org_id = str(dataset.project.organization_id)
        proj_id = str(dataset.project_id)
        ds_id = str(dataset.id)
        ver_id = str(version.id)

        file_path = default_storage.get_file_path(version.original_file_key)
        validate_file_content(file_path, dataset.source_type)

        # Step 2: Parse file
        job.current_stage = IngestionJobStage.PARSING.value
        job.progress_percentage = 25
        job.status_message = f"Parsing {dataset.source_type.upper()} tabular structure..."
        db.commit()

        parser = get_parser_for_type(dataset.source_type)
        parsed_tables = parser.parse(file_path)

        # Step 3: Schema inference, Normalization, Profiling, PII Detection
        job.current_stage = IngestionJobStage.SCHEMA_INFERENCE.value
        job.progress_percentage = 40
        job.status_message = "Inferring schema and normalizing column names..."
        db.commit()

        total_rows_all_tables = 0
        total_cols_all_tables = 0
        version_tables_manifest: list[dict] = []
        created_tables: list[DataTable] = []

        for p_table in parsed_tables:
            # Normalize column names for safe SQL/Parquet physical names
            norm_df, col_mappings = apply_column_normalization(p_table.df)
            col_map_dict = {m.physical_name: m.original_name for m in col_mappings}

            total_rows_all_tables += norm_df.height
            total_cols_all_tables += norm_df.width

            # Schema inference
            inferred_schemas = infer_table_schema(norm_df, col_map_dict)
            schema_type_map = {s.physical_name: s.canonical_type for s in inferred_schemas}

            # Profiling: column stats
            col_stats: dict[str, dict] = {}
            for s in inferred_schemas:
                col_stats[s.physical_name] = profile_column_statistics(
                    norm_df[s.physical_name],
                    s.canonical_type,
                    norm_df.height,
                )

            # Table level stats
            table_stats = profile_table_statistics(norm_df)

            # Data quality warnings
            quality_warnings = detect_data_quality_issues(norm_df, col_stats, col_map_dict)

            # PII detection
            pii_results = detect_table_pii(norm_df, col_map_dict, schema_type_map)

            # Step 4: Parquet conversion
            parquet_key = build_normalized_parquet_key(
                org_id, proj_id, ds_id, ver_id, p_table.table_name
            )
            parquet_path = default_storage._resolve_and_verify(parquet_key)
            parquet_path.parent.mkdir(parents=True, exist_ok=True)
            norm_df.write_parquet(parquet_path, compression="snappy")

            # Create DataTable model
            data_table = DataTable(
                dataset_version_id=version.id,
                table_name=p_table.table_name,
                original_table_name=p_table.original_table_name,
                storage_key=parquet_key,
                row_count=norm_df.height,
                column_count=norm_df.width,
                description=f"Table {p_table.original_table_name}",
                schema_metadata={
                    "columns": [
                        {
                            "physical_name": s.physical_name,
                            "original_name": s.original_name,
                            "canonical_type": s.canonical_type,
                            "polars_type": s.polars_type,
                            "ordinal_position": s.ordinal_position,
                            "nullable": s.nullable,
                        }
                        for s in inferred_schemas
                    ]
                },
                profile_metadata={
                    "statistics": table_stats,
                    "quality_warnings": quality_warnings,
                },
            )
            db.add(data_table)
            db.flush()  # Generate data_table.id

            # Create DataColumn models
            for s in inferred_schemas:
                c_stats = col_stats.get(s.physical_name, {})
                pii_info = pii_results.get(s.physical_name)
                pii_cat = pii_info[0] if pii_info else None
                pii_conf = pii_info[1] if pii_info else None

                col_model = DataColumn(
                    table_id=data_table.id,
                    column_name=s.original_name,
                    physical_name=s.physical_name,
                    data_type=s.canonical_type,
                    ordinal_position=s.ordinal_position,
                    nullable=s.nullable,
                    unique_count=c_stats.get("unique_count"),
                    null_count=c_stats.get("null_count"),
                    null_percentage=c_stats.get("null_percentage"),
                    semantic_type=pii_cat,
                    pii_category=pii_cat,
                    pii_confidence=pii_conf,
                    profile_stats=c_stats,
                )
                db.add(col_model)

            created_tables.append(data_table)

            version_tables_manifest.append(
                {
                    "table_name": p_table.table_name,
                    "original_table_name": p_table.original_table_name,
                    "storage_key": parquet_key,
                    "row_count": norm_df.height,
                    "column_count": norm_df.width,
                    "columns": [
                        {
                            "physical_name": s.physical_name,
                            "original_name": s.original_name,
                            "data_type": s.canonical_type,
                            "nullable": s.nullable,
                            "pii_category": pii_results.get(s.physical_name, (None, None))[0],
                        }
                        for s in inferred_schemas
                    ],
                    "quality_warnings": quality_warnings,
                }
            )

        # Step 5: Manifest Generation
        job.current_stage = IngestionJobStage.PARQUET_CONVERSION.value
        job.progress_percentage = 75
        job.status_message = "Generating dataset manifest and finalizing storage..."
        db.commit()

        manifest_data = {
            "dataset_id": ds_id,
            "dataset_version_id": ver_id,
            "original_filename": dataset.original_filename,
            "source_format": dataset.source_type,
            "processing_timestamp": datetime.now(UTC).isoformat(),
            "table_count": len(created_tables),
            "total_rows": total_rows_all_tables,
            "total_columns": total_cols_all_tables,
            "tables": version_tables_manifest,
        }
        manifest_key = build_manifest_key(org_id, proj_id, ds_id, ver_id)
        default_storage.save_file(
            json.dumps(manifest_data, indent=2).encode("utf-8"),
            manifest_key,
        )

        # Step 6: Metadata Registration & Activation
        job.current_stage = IngestionJobStage.METADATA_REGISTRATION.value
        job.progress_percentage = 90
        job.status_message = "Registering metadata and activating dataset version..."
        db.commit()

        version.manifest_file_key = manifest_key
        version.total_row_count = total_rows_all_tables
        version.total_column_count = total_cols_all_tables
        version.status = DatasetVersionStatus.READY.value
        version.profile_metadata = {
            "table_count": len(created_tables),
            "total_rows": total_rows_all_tables,
            "total_columns": total_cols_all_tables,
            "tables": [t.table_name for t in created_tables],
        }

        # Atomically set active version on Dataset
        dataset.active_version_id = version.id
        dataset.status = DatasetStatus.READY.value

        # Complete job
        job.status = IngestionJobStatus.COMPLETED.value
        job.current_stage = IngestionJobStage.COMPLETED.value
        job.progress_percentage = 100
        job.status_message = "Dataset successfully ingested and ready for analysis."
        job.completed_at = datetime.now(UTC)
        db.commit()

        logger.info(
            "Ingestion job %s completed successfully for dataset %s (v%s, %d rows)",
            job_id,
            dataset.id,
            version.version_number,
            total_rows_all_tables,
        )

    except FileValidationError as fve:
        db.rollback()
        logger.warning("Ingestion validation error on job %s: %s", job_id, fve.message)
        _handle_job_failure(db, job_id, fve.code, fve.message)
    except Exception as exc:
        db.rollback()
        logger.exception("Unexpected error processing ingestion job %s: %s", job_id, exc)
        _handle_job_failure(
            db,
            job_id,
            "PROCESSING_ERROR",
            f"An error occurred while processing the dataset: {str(exc)[:200]}",
        )
    finally:
        db.close()


def _handle_job_failure(
    db: Session,
    job_id: uuid.UUID,
    error_code: str,
    error_message: str,
) -> None:
    """Safely mark job and version as failed while protecting previous active versions."""
    try:
        job = db.scalar(select(IngestionJob).where(IngestionJob.id == job_id))
        if not job:
            return

        job.status = IngestionJobStatus.FAILED.value
        job.error_code = error_code
        job.error_message = error_message
        job.status_message = f"Failed: {error_message}"
        job.completed_at = datetime.now(UTC)

        version = db.scalar(select(DatasetVersion).where(DatasetVersion.id == job.dataset_version_id))
        if version:
            version.status = DatasetVersionStatus.FAILED.value

        dataset = db.scalar(select(Dataset).where(Dataset.id == job.dataset_id))
        if dataset and dataset.active_version_id is None:
            dataset.status = DatasetStatus.FAILED.value
        # If dataset ALREADY has a functioning active version, leave active version intact!

        db.commit()
    except Exception as exc:
        logger.error("Failed to persist job failure state: %s", exc)
        db.rollback()
