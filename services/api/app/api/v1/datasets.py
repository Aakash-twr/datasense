"""Dataset API routes: upload, listing, details, schema, profile, preview, and jobs."""

from __future__ import annotations

import hashlib
import math
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated, Any

import polars as pl
from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app.api.deps import (
    OrganizationContext,
    get_authorized_dataset,
    get_authorized_ingestion_job,
    get_authorized_project,
    get_current_user,
    require_role,
)
from app.core.config import settings
from app.core.observability import is_shutting_down
from app.core.rate_limit import rate_limit_dep
from app.db.session import get_db
from app.ingestion.jobs import dispatch_ingestion_job
from app.ingestion.storage.local_storage import (
    build_original_file_key,
    default_storage,
    sanitize_filename,
)
from app.ingestion.validation import validate_file_metadata
from app.models.data_column import DataColumn
from app.models.data_table import DataTable
from app.models.dataset import Dataset, DatasetStatus
from app.models.dataset_version import DatasetVersion, DatasetVersionStatus
from app.models.ingestion_job import IngestionJob
from app.models.membership import MembershipRole
from app.models.project import Project
from app.models.user import User
from app.schemas.dataset import (
    DataColumnRead,
    DatasetListResponse,
    DatasetPreviewResponse,
    DatasetProfileResponse,
    DatasetRead,
    DatasetSchemaResponse,
    DatasetStatusResponse,
    DatasetUploadResponse,
    DatasetVersionSummary,
    DataTableRead,
    IngestionJobRead,
    QualityWarningItem,
)

router = APIRouter(tags=["Datasets"])


def _clean_json_val(val: Any) -> Any:
    """Ensure floats do not contain NaN/Infinity for valid JSON serialization."""
    if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
        return None
    return val


# ---------------------------------------------------------------------------
# Upload Dataset
# ---------------------------------------------------------------------------
@router.post(
    "/projects/{project_id}/datasets",
    response_model=DatasetUploadResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Upload dataset",
    description="Upload a CSV, Excel, JSON, or Parquet dataset for asynchronous ingestion.",
    dependencies=[Depends(rate_limit_dep("upload", "rate_limit_upload_per_minute"))],
)
async def upload_dataset(
    project_id: uuid.UUID,
    file: Annotated[UploadFile, File(...)],
    dataset_name: Annotated[str | None, Form()] = None,
    description: Annotated[str | None, Form()] = None,
    background_tasks: BackgroundTasks = None,  # type: ignore[assignment]
    project: Annotated[Project, Depends(get_authorized_project)] = None,  # type: ignore[assignment]
    org_context: Annotated[
        OrganizationContext,
        Depends(require_role([MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.ANALYST])),
    ] = None,  # type: ignore[assignment]
    user: Annotated[User, Depends(get_current_user)] = None,  # type: ignore[assignment]
    db: Annotated[Session, Depends(get_db)] = None,  # type: ignore[assignment]
) -> DatasetUploadResponse:
    """Accept and store uploaded file, create records, and launch background ingestion."""
    if is_shutting_down():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Server is shutting down")
    filename = file.filename or "uploaded_dataset"
    safe_filename = sanitize_filename(filename)

    # Initial check on filename extension
    source_type = validate_file_metadata(safe_filename, 1)  # validates extension

    dataset_id = uuid.uuid4()
    version_id = uuid.uuid4()
    org_id = str(org_context.organization.id)

    original_key = build_original_file_key(
        org_id=org_id,
        project_id=str(project.id),
        dataset_id=str(dataset_id),
        version_id=str(version_id),
        filename=safe_filename,
    )

    # Stream write to storage while calculating sha256 and enforcing byte limits
    hasher = hashlib.sha256()
    total_bytes = 0
    chunk_size = 1024 * 1024  # 1 MB chunk

    try:
        with default_storage.open_file(original_key, mode="wb") as dest:
            while chunk := await file.read(chunk_size):
                total_bytes += len(chunk)
                if total_bytes > settings.max_upload_size_bytes:
                    max_mb = settings.max_upload_size_bytes // (1024 * 1024)
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail=f"Uploaded file exceeds maximum limit of {max_mb} MB.",
                    )
                hasher.update(chunk)
                dest.write(chunk)
    except HTTPException:
        default_storage.delete_file(original_key)
        raise
    except Exception as exc:
        default_storage.delete_file(original_key)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save uploaded file: {exc}",
        ) from exc

    if total_bytes == 0:
        default_storage.delete_file(original_key)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The uploaded file is empty (0 bytes).",
        )

    checksum = hasher.hexdigest()
    final_name = dataset_name.strip() if dataset_name and dataset_name.strip() else Path(safe_filename).stem

    # Create DB entities
    dataset = Dataset(
        id=dataset_id,
        project_id=project.id,
        name=final_name,
        description=description.strip() if description else None,
        source_type=source_type,
        original_filename=safe_filename,
        status=DatasetStatus.PROCESSING.value,
        created_by=user.id,
    )
    db.add(dataset)

    version = DatasetVersion(
        id=version_id,
        dataset_id=dataset.id,
        version_number=1,
        original_file_key=original_key,
        checksum=checksum,
        file_size_bytes=total_bytes,
        status=DatasetVersionStatus.PROCESSING.value,
    )
    db.add(version)

    job = IngestionJob(
        dataset_id=dataset.id,
        dataset_version_id=version.id,
        status="queued",
        current_stage="validating",
        progress_percentage=0,
        status_message="Job queued for processing",
    )
    db.add(job)
    db.commit()

    # Launch background processing
    dispatch_ingestion_job(job.id, background_tasks)

    return DatasetUploadResponse(
        dataset_id=dataset.id,
        version_id=version.id,
        job_id=job.id,
        status=dataset.status,
        message="Dataset uploaded successfully. Processing started in background.",
    )


# ---------------------------------------------------------------------------
# List Datasets
# ---------------------------------------------------------------------------
@router.get(
    "/projects/{project_id}/datasets",
    response_model=DatasetListResponse,
    summary="List project datasets",
)
def list_datasets(
    project_id: uuid.UUID,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    search: str | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    include_archived: bool = Query(default=False),
    project: Annotated[Project, Depends(get_authorized_project)] = None,  # type: ignore[assignment]
    db: Annotated[Session, Depends(get_db)] = None,  # type: ignore[assignment]
) -> DatasetListResponse:
    """Return paginated list of datasets belonging to the authorized project."""
    stmt = select(Dataset).where(Dataset.project_id == project.id)

    if not include_archived:
        stmt = stmt.where(Dataset.archived_at.is_(None))

    if status_filter:
        stmt = stmt.where(Dataset.status == status_filter)

    if search and search.strip():
        term = f"%{search.strip().lower()}%"
        stmt = stmt.where(func.lower(Dataset.name).like(term))

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    total_pages = max(1, math.ceil(total / page_size))

    offset = (page - 1) * page_size
    datasets = db.scalars(
        stmt.order_by(desc(Dataset.created_at)).offset(offset).limit(page_size)
    ).all()

    items: list[DatasetRead] = []
    for ds in datasets:
        ds_read = DatasetRead.model_validate(ds)
        if ds.active_version:
            ds_read.active_version = DatasetVersionSummary.model_validate(ds.active_version)
            ds_read.active_version.is_active = True
        items.append(ds_read)

    return DatasetListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


# ---------------------------------------------------------------------------
# Dataset Details
# ---------------------------------------------------------------------------
@router.get(
    "/datasets/{dataset_id}",
    response_model=DatasetRead,
    summary="Get dataset details",
)
def get_dataset(
    dataset_id: uuid.UUID,
    dataset: Annotated[Dataset, Depends(get_authorized_dataset)] = None,  # type: ignore[assignment]
) -> DatasetRead:
    """Return dataset metadata and currently active version summary."""
    ds_read = DatasetRead.model_validate(dataset)
    if dataset.active_version:
        ds_read.active_version = DatasetVersionSummary.model_validate(dataset.active_version)
        ds_read.active_version.is_active = True
    return ds_read


# ---------------------------------------------------------------------------
# Dataset Status
# ---------------------------------------------------------------------------
@router.get(
    "/datasets/{dataset_id}/status",
    response_model=DatasetStatusResponse,
    summary="Get dataset ingestion status",
)
def get_dataset_status(
    dataset_id: uuid.UUID,
    dataset: Annotated[Dataset, Depends(get_authorized_dataset)] = None,  # type: ignore[assignment]
    db: Annotated[Session, Depends(get_db)] = None,  # type: ignore[assignment]
) -> DatasetStatusResponse:
    """Return dataset status and latest ingestion job progress."""
    latest_job = db.scalar(
        select(IngestionJob)
        .where(IngestionJob.dataset_id == dataset.id)
        .order_by(desc(IngestionJob.created_at))
        .limit(1)
    )

    return DatasetStatusResponse(
        dataset_id=dataset.id,
        status=dataset.status,
        active_version_id=dataset.active_version_id,
        job=IngestionJobRead.model_validate(latest_job) if latest_job else None,
    )


# ---------------------------------------------------------------------------
# Job Details
# ---------------------------------------------------------------------------
@router.get(
    "/ingestion-jobs/{job_id}",
    response_model=IngestionJobRead,
    summary="Get ingestion job details",
)
def get_ingestion_job(
    job_id: uuid.UUID,
    job: Annotated[IngestionJob, Depends(get_authorized_ingestion_job)] = None,  # type: ignore[assignment]
) -> IngestionJobRead:
    """Return status, stage, and safe error details for an ingestion job."""
    return IngestionJobRead.model_validate(job)


# ---------------------------------------------------------------------------
# Schema Details
# ---------------------------------------------------------------------------
@router.get(
    "/datasets/{dataset_id}/schema",
    response_model=DatasetSchemaResponse,
    summary="Get dataset schema",
)
def get_dataset_schema(
    dataset_id: uuid.UUID,
    version_id: uuid.UUID | None = None,
    dataset: Annotated[Dataset, Depends(get_authorized_dataset)] = None,  # type: ignore[assignment]
    db: Annotated[Session, Depends(get_db)] = None,  # type: ignore[assignment]
) -> DatasetSchemaResponse:
    """Return table and column definitions for the active or requested dataset version."""
    target_version_id = version_id or dataset.active_version_id
    if not target_version_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset has no active version yet. It may still be processing.",
        )

    version = db.scalar(
        select(DatasetVersion).where(
            DatasetVersion.id == target_version_id,
            DatasetVersion.dataset_id == dataset.id,
        )
    )
    if not version:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Version not found.")

    tables = db.scalars(
        select(DataTable).where(DataTable.dataset_version_id == version.id)
    ).all()

    tables_read: list[DataTableRead] = []
    for tbl in tables:
        tbl_read = DataTableRead.model_validate(tbl)
        tbl_read.columns = [DataColumnRead.model_validate(col) for col in tbl.columns]
        tables_read.append(tbl_read)

    return DatasetSchemaResponse(
        dataset_id=dataset.id,
        version_id=version.id,
        version_number=version.version_number,
        tables=tables_read,
    )


# ---------------------------------------------------------------------------
# Data Profile
# ---------------------------------------------------------------------------
@router.get(
    "/datasets/{dataset_id}/profile",
    response_model=DatasetProfileResponse,
    summary="Get dataset profiling statistics",
)
def get_dataset_profile(
    dataset_id: uuid.UUID,
    version_id: uuid.UUID | None = None,
    table_id: uuid.UUID | None = None,
    dataset: Annotated[Dataset, Depends(get_authorized_dataset)] = None,  # type: ignore[assignment]
    db: Annotated[Session, Depends(get_db)] = None,  # type: ignore[assignment]
) -> DatasetProfileResponse:
    """Return dataset profiling statistics and quality warnings."""
    target_ver_id = version_id or dataset.active_version_id
    if not target_ver_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset has no active version yet.",
        )

    version = db.scalar(
        select(DatasetVersion).where(
            DatasetVersion.id == target_ver_id,
            DatasetVersion.dataset_id == dataset.id,
        )
    )
    if not version:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Version not found.")

    # Select target table
    if table_id:
        table = db.scalar(
            select(DataTable).where(
                DataTable.id == table_id,
                DataTable.dataset_version_id == version.id,
            )
        )
    else:
        table = db.scalar(
            select(DataTable).where(DataTable.dataset_version_id == version.id).limit(1)
        )

    if not table:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Table not found.")

    table_stats = table.profile_metadata.get("statistics", {})
    quality_warnings = [
        QualityWarningItem(**w) for w in table.profile_metadata.get("quality_warnings", [])
    ]

    # Collect column stats from DataColumn records
    columns = db.scalars(
        select(DataColumn).where(DataColumn.table_id == table.id)
    ).all()
    col_stats = {col.column_name: col.profile_stats for col in columns}

    return DatasetProfileResponse(
        dataset_id=dataset.id,
        version_id=version.id,
        table_id=table.id,
        table_name=table.table_name,
        table_stats=table_stats,
        column_stats=col_stats,
        quality_warnings=quality_warnings,
    )


# ---------------------------------------------------------------------------
# Data Preview
# ---------------------------------------------------------------------------
@router.get(
    "/datasets/{dataset_id}/preview",
    response_model=DatasetPreviewResponse,
    summary="Preview dataset records",
)
def get_dataset_preview(
    dataset_id: uuid.UUID,
    table_id: uuid.UUID | None = None,
    limit: int = Query(default=100, ge=1, le=settings.max_preview_rows),
    offset: int = Query(default=0, ge=0),
    dataset: Annotated[Dataset, Depends(get_authorized_dataset)] = None,  # type: ignore[assignment]
    db: Annotated[Session, Depends(get_db)] = None,  # type: ignore[assignment]
) -> DatasetPreviewResponse:
    """Read paginated rows directly from the normalized Parquet table."""
    if not dataset.active_version_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset has no active version ready for preview.",
        )

    # Resolve table
    if table_id:
        table = db.scalar(
            select(DataTable).where(
                DataTable.id == table_id,
                DataTable.dataset_version_id == dataset.active_version_id,
            )
        )
    else:
        table = db.scalar(
            select(DataTable).where(DataTable.dataset_version_id == dataset.active_version_id).limit(1)
        )

    if not table:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Table not found.")

    try:
        parquet_path = default_storage.get_file_path(table.storage_key)
        # Efficient Polars slice without loading entire dataset into memory
        df_slice = pl.read_parquet(parquet_path).slice(offset, limit)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to read parquet preview: {exc}",
        ) from exc

    # Clean floats for JSON serialization
    raw_dicts = df_slice.to_dicts()
    cleaned_rows = [
        {col: _clean_json_val(val) for col, val in row.items()}
        for row in raw_dicts
    ]

    # Map physical column names to original display names if available
    col_records = db.scalars(
        select(DataColumn).where(DataColumn.table_id == table.id)
    ).all()
    phys_to_orig = {c.physical_name: c.column_name for c in col_records}
    types_map = {c.column_name: c.data_type for c in col_records}

    display_columns = [phys_to_orig.get(c, c) for c in df_slice.columns]
    display_rows: list[dict[str, Any]] = []
    for r in cleaned_rows:
        display_rows.append({phys_to_orig.get(k, k): v for k, v in r.items()})

    return DatasetPreviewResponse(
        dataset_id=dataset.id,
        version_id=dataset.active_version_id,
        table_id=table.id,
        table_name=table.table_name,
        columns=display_columns,
        column_types=types_map,
        rows=display_rows,
        total_rows=table.row_count,
        limit=limit,
        offset=offset,
    )


# ---------------------------------------------------------------------------
# Dataset Versions
# ---------------------------------------------------------------------------
@router.get(
    "/datasets/{dataset_id}/versions",
    response_model=list[DatasetVersionSummary],
    summary="Get dataset version history",
)
def get_dataset_versions(
    dataset_id: uuid.UUID,
    dataset: Annotated[Dataset, Depends(get_authorized_dataset)] = None,  # type: ignore[assignment]
    db: Annotated[Session, Depends(get_db)] = None,  # type: ignore[assignment]
) -> list[DatasetVersionSummary]:
    """Return all versions for a dataset."""
    versions = db.scalars(
        select(DatasetVersion)
        .where(DatasetVersion.dataset_id == dataset.id)
        .order_by(desc(DatasetVersion.version_number))
    ).all()

    results: list[DatasetVersionSummary] = []
    for v in versions:
        v_summary = DatasetVersionSummary.model_validate(v)
        v_summary.is_active = (v.id == dataset.active_version_id)
        results.append(v_summary)

    return results


# ---------------------------------------------------------------------------
# Upload New Version
# ---------------------------------------------------------------------------
@router.post(
    "/datasets/{dataset_id}/versions",
    response_model=DatasetUploadResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Upload new dataset version",
    dependencies=[Depends(rate_limit_dep("upload_version", "rate_limit_upload_per_minute"))],
)
async def upload_dataset_version(
    dataset_id: uuid.UUID,
    file: Annotated[UploadFile, File(...)],
    background_tasks: BackgroundTasks = None,  # type: ignore[assignment]
    dataset: Annotated[Dataset, Depends(get_authorized_dataset)] = None,  # type: ignore[assignment]
    org_context: Annotated[
        OrganizationContext,
        Depends(require_role([MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.ANALYST])),
    ] = None,  # type: ignore[assignment]
    db: Annotated[Session, Depends(get_db)] = None,  # type: ignore[assignment]
) -> DatasetUploadResponse:
    """Upload a replacement file as a new immutable version."""
    if is_shutting_down():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Server is shutting down")
    filename = file.filename or "updated_dataset"
    safe_filename = sanitize_filename(filename)
    validate_file_metadata(safe_filename, 1)

    # Next version number
    current_max = db.scalar(
        select(func.max(DatasetVersion.version_number)).where(
            DatasetVersion.dataset_id == dataset.id
        )
    )
    next_ver_num = (current_max or 0) + 1
    new_version_id = uuid.uuid4()
    org_id = str(org_context.organization.id)

    original_key = build_original_file_key(
        org_id=org_id,
        project_id=str(dataset.project_id),
        dataset_id=str(dataset.id),
        version_id=str(new_version_id),
        filename=safe_filename,
    )

    hasher = hashlib.sha256()
    total_bytes = 0
    chunk_size = 1024 * 1024

    try:
        with default_storage.open_file(original_key, mode="wb") as dest:
            while chunk := await file.read(chunk_size):
                total_bytes += len(chunk)
                if total_bytes > settings.max_upload_size_bytes:
                    max_mb = settings.max_upload_size_bytes // (1024 * 1024)
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail=f"Uploaded file exceeds {max_mb} MB limit.",
                    )
                hasher.update(chunk)
                dest.write(chunk)
    except HTTPException:
        default_storage.delete_file(original_key)
        raise
    except Exception as exc:
        default_storage.delete_file(original_key)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save version file: {exc}",
        ) from exc

    checksum = hasher.hexdigest()

    version = DatasetVersion(
        id=new_version_id,
        dataset_id=dataset.id,
        version_number=next_ver_num,
        original_file_key=original_key,
        checksum=checksum,
        file_size_bytes=total_bytes,
        status=DatasetVersionStatus.PROCESSING.value,
    )
    db.add(version)

    job = IngestionJob(
        dataset_id=dataset.id,
        dataset_version_id=version.id,
        status="queued",
        current_stage="validating",
        progress_percentage=0,
        status_message=f"Version {next_ver_num} queued for processing",
    )
    db.add(job)
    db.commit()

    dispatch_ingestion_job(job.id, background_tasks)

    return DatasetUploadResponse(
        dataset_id=dataset.id,
        version_id=version.id,
        job_id=job.id,
        status=version.status,
        message=f"Dataset version {next_ver_num} uploaded successfully. Processing started in background.",
    )


# ---------------------------------------------------------------------------
# Archive Dataset
# ---------------------------------------------------------------------------
@router.delete(
    "/datasets/{dataset_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Archive dataset",
)
def archive_dataset(
    dataset_id: uuid.UUID,
    dataset: Annotated[Dataset, Depends(get_authorized_dataset)] = None,  # type: ignore[assignment]
    role_check: Annotated[
        OrganizationContext,
        Depends(require_role([MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.ANALYST])),
    ] = None,  # type: ignore[assignment]
    db: Annotated[Session, Depends(get_db)] = None,  # type: ignore[assignment]
) -> None:
    """Soft-archive a dataset."""
    dataset.archived_at = datetime.now(UTC)
    dataset.status = DatasetStatus.ARCHIVED.value
    db.commit()
