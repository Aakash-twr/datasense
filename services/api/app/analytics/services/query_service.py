"""Query service managing query runs, history, and saved queries."""

from __future__ import annotations

import uuid

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.analytics.exceptions import (
    AnalyticsError,
    CatalogError,
    QueryExecutionError,
    QueryTimeoutError,
    QueryValidationError,
)
from app.analytics.query_executor import QueryExecutor
from app.analytics.schemas import (
    QueryExecutionRequest,
    QueryExecutionResponse,
    SavedQueryCreate,
    SavedQueryUpdate,
)
from app.core.observability import metrics_registry
from app.models.dataset import Dataset
from app.models.project import Project
from app.models.query_run import QueryRun, QueryRunStatus
from app.models.saved_query import SavedQuery
from app.models.user import User


class QueryService:
    """Business logic for analytical SQL execution, history, and saved queries."""

    @staticmethod
    def validate_query_datasets(
        session: Session,
        project_id: uuid.UUID,
        dataset_ids: list[uuid.UUID],
    ) -> None:
        """Ensures that all specified datasets belong to the project and are accessible."""
        if not dataset_ids:
            return

        stmt = select(Dataset.id).where(
            Dataset.id.in_(dataset_ids),
            Dataset.project_id == project_id,
            Dataset.archived_at.is_(None),
        )
        found_ids = set(session.scalars(stmt).all())

        missing = set(dataset_ids) - found_ids
        if missing:
            raise CatalogError(
                f"One or more selected datasets were not found in this project or are archived: "
                f"{', '.join(str(i) for i in missing)}"
            )

    @classmethod
    async def execute_and_record(
        cls,
        session: Session,
        project: Project,
        user: User,
        request: QueryExecutionRequest,
    ) -> QueryExecutionResponse:
        """Executes an analytical query, recording execution telemetry and history in PostgreSQL."""
        cls.validate_query_datasets(session, project.id, request.dataset_ids)

        query_run = QueryRun(
            organization_id=project.organization_id,
            project_id=project.id,
            user_id=user.id,
            sql_query=request.sql,
            selected_dataset_ids=[str(d) for d in request.dataset_ids],
            status=QueryRunStatus.RUNNING,
        )
        session.add(query_run)
        session.commit()
        session.refresh(query_run)

        try:
            response = await QueryExecutor.execute(
                session=session,
                project_id=project.id,
                sql=request.sql,
                dataset_ids=request.dataset_ids,
                limit=request.limit,
            )

            # Update telemetry on success
            query_run.status = QueryRunStatus.SUCCESS
            query_run.execution_time_ms = response.execution_time_ms
            query_run.returned_row_count = response.row_count
            query_run.error_summary = None
            session.commit()
            metrics_registry.record_query(float(response.execution_time_ms or 0.0), failed=False)

            response.query_id = query_run.id
            return response

        except (QueryValidationError, QueryTimeoutError, QueryExecutionError, AnalyticsError) as exc:
            query_run.status = (
                QueryRunStatus.CANCELLED
                if isinstance(exc, QueryTimeoutError)
                else QueryRunStatus.FAILED
            )
            query_run.error_summary = str(exc.message if hasattr(exc, "message") else exc)
            session.commit()
            metrics_registry.record_query(0.0, failed=True)
            raise

        except Exception as exc:
            query_run.status = QueryRunStatus.FAILED
            query_run.error_summary = f"Internal server error: {exc}"
            session.commit()
            metrics_registry.record_query(0.0, failed=True)
            raise QueryExecutionError(f"Query execution failed: {exc}") from exc

    @staticmethod
    def get_query_run(
        session: Session,
        project_id: uuid.UUID,
        query_id: uuid.UUID,
    ) -> QueryRun | None:
        """Retrieves a single query execution history record."""
        stmt = select(QueryRun).where(
            QueryRun.id == query_id,
            QueryRun.project_id == project_id,
        )
        return session.scalars(stmt).one_or_none()

    @staticmethod
    def list_query_history(
        session: Session,
        project_id: uuid.UUID,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[QueryRun], int]:
        """Returns paginated query runs for a project ordered by most recent."""
        count_stmt = select(func.count(QueryRun.id)).where(QueryRun.project_id == project_id)
        total = session.scalar(count_stmt) or 0

        offset = (page - 1) * page_size
        stmt = (
            select(QueryRun)
            .where(QueryRun.project_id == project_id)
            .order_by(QueryRun.created_at.desc())
            .offset(offset)
            .limit(page_size)
        )
        items = list(session.scalars(stmt).all())
        return items, total

    @staticmethod
    def delete_query_history(
        session: Session,
        project_id: uuid.UUID,
        query_id: uuid.UUID,
    ) -> bool:
        """Deletes a query execution history record."""
        stmt = delete(QueryRun).where(
            QueryRun.id == query_id,
            QueryRun.project_id == project_id,
        )
        res = session.execute(stmt)
        session.commit()
        return (res.rowcount or 0) > 0

    @staticmethod
    def create_saved_query(
        session: Session,
        project: Project,
        user: User,
        data: SavedQueryCreate,
    ) -> SavedQuery:
        """Creates a new saved query for a project."""
        saved = SavedQuery(
            organization_id=project.organization_id,
            project_id=project.id,
            user_id=user.id,
            name=data.name.strip(),
            description=data.description.strip() if data.description else None,
            sql_query=data.sql_query.strip(),
            selected_dataset_ids=[str(d) for d in data.selected_dataset_ids],
        )
        session.add(saved)
        session.commit()
        session.refresh(saved)
        return saved

    @staticmethod
    def list_saved_queries(
        session: Session,
        project_id: uuid.UUID,
        page: int = 1,
        page_size: int = 50,
    ) -> tuple[list[SavedQuery], int]:
        """Lists saved queries for a project."""
        count_stmt = select(func.count(SavedQuery.id)).where(SavedQuery.project_id == project_id)
        total = session.scalar(count_stmt) or 0

        offset = (page - 1) * page_size
        stmt = (
            select(SavedQuery)
            .where(SavedQuery.project_id == project_id)
            .order_by(SavedQuery.updated_at.desc())
            .offset(offset)
            .limit(page_size)
        )
        items = list(session.scalars(stmt).all())
        return items, total

    @staticmethod
    def get_saved_query(
        session: Session,
        project_id: uuid.UUID,
        saved_query_id: uuid.UUID,
    ) -> SavedQuery | None:
        """Fetches a saved query by ID."""
        stmt = select(SavedQuery).where(
            SavedQuery.id == saved_query_id,
            SavedQuery.project_id == project_id,
        )
        return session.scalars(stmt).one_or_none()

    @staticmethod
    def update_saved_query(
        session: Session,
        project_id: uuid.UUID,
        saved_query_id: uuid.UUID,
        data: SavedQueryUpdate,
    ) -> SavedQuery | None:
        """Updates a saved query."""
        stmt = select(SavedQuery).where(
            SavedQuery.id == saved_query_id,
            SavedQuery.project_id == project_id,
        )
        saved = session.scalars(stmt).one_or_none()
        if not saved:
            return None

        if data.name is not None:
            saved.name = data.name.strip()
        if data.description is not None:
            saved.description = data.description.strip() if data.description else None
        if data.sql_query is not None:
            saved.sql_query = data.sql_query.strip()
        if data.selected_dataset_ids is not None:
            saved.selected_dataset_ids = [str(d) for d in data.selected_dataset_ids]

        session.commit()
        session.refresh(saved)
        return saved

    @staticmethod
    def delete_saved_query(
        session: Session,
        project_id: uuid.UUID,
        saved_query_id: uuid.UUID,
    ) -> bool:
        """Deletes a saved query."""
        stmt = delete(SavedQuery).where(
            SavedQuery.id == saved_query_id,
            SavedQuery.project_id == project_id,
        )
        res = session.execute(stmt)
        session.commit()
        return (res.rowcount or 0) > 0
