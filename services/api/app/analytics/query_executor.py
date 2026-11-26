"""Query executor coordinating catalog resolution, validation, and engine execution."""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.analytics.catalog import CatalogService
from app.analytics.engine import DuckDBEngine
from app.analytics.exceptions import (
    QueryValidationError,
)
from app.analytics.query_validator import QueryValidator
from app.analytics.schemas import (
    QueryExecutionResponse,
    QueryValidationResponse,
)


class QueryExecutor:
    """Executes validated analytical queries against project datasets."""

    @staticmethod
    def validate_query(
        session: Session,
        project_id: uuid.UUID,
        sql: str,
        dataset_ids: list[uuid.UUID] | None = None,
    ) -> QueryValidationResponse:
        """Validates a query against the authorized project catalog."""
        # Resolve catalog for validation context
        mapping = CatalogService.resolve_parquet_tables(
            session=session,
            project_id=project_id,
            dataset_ids=dataset_ids,
        )
        catalog_dict = mapping["catalog_dict"]

        validator = QueryValidator(catalog_dict)
        result = validator.validate(sql)

        return QueryValidationResponse(
            is_valid=result.is_valid,
            error=result.error,
            tables_referenced=result.tables_referenced,
            suggested_fixes=result.suggested_fixes,
        )

    @staticmethod
    async def execute(
        session: Session,
        project_id: uuid.UUID,
        sql: str,
        dataset_ids: list[uuid.UUID] | None = None,
        limit: int | None = None,
    ) -> QueryExecutionResponse:
        """Validates and executes an analytical query, returning structured results."""
        query_id = uuid.uuid4()

        # 1. Resolve Parquet mappings & catalog
        mapping = CatalogService.resolve_parquet_tables(
            session=session,
            project_id=project_id,
            dataset_ids=dataset_ids,
        )
        schema_tables = mapping["schema_tables"]
        unqualified_tables = mapping["unqualified_tables"]
        catalog_dict = mapping["catalog_dict"]

        # 2. Validate SQL via SQLGlot
        validator = QueryValidator(catalog_dict)
        val_result = validator.validate(sql)
        if not val_result.is_valid:
            raise QueryValidationError(val_result.error or "Invalid SQL query.")

        # 3. Execute query in DuckDB
        columns, rows, count, truncated, elapsed_ms = await DuckDBEngine.execute_query(
            sql=sql,
            schema_tables=schema_tables,
            unqualified_tables=unqualified_tables,
            limit=limit,
        )

        return QueryExecutionResponse(
            query_id=query_id,
            status="success",
            columns=columns,
            rows=rows,
            row_count=count,
            truncated=truncated,
            execution_time_ms=elapsed_ms,
            error_message=None,
        )
