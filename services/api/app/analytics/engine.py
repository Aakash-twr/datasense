"""DuckDB analytical engine managing concurrency, execution, and timeout safety."""

from __future__ import annotations

import asyncio
import contextlib
import re
import time
from pathlib import Path
from typing import Any

import duckdb

from app.analytics.connection import DuckDBConnectionFactory
from app.analytics.exceptions import (
    ConcurrencyLimitError,
    QueryExecutionError,
    QueryTimeoutError,
)
from app.analytics.result_serializer import serialize_query_results
from app.analytics.schemas import QueryColumn
from app.core.config import settings


class DuckDBEngine:
    """Analytical SQL query execution engine using DuckDB."""

    _semaphore: asyncio.Semaphore | None = None

    @classmethod
    def get_semaphore(cls) -> asyncio.Semaphore:
        """Returns lazy singleton semaphore for bounding concurrent queries."""
        if cls._semaphore is None:
            cls._semaphore = asyncio.Semaphore(settings.duckdb_max_concurrent_queries)
        return cls._semaphore

    @classmethod
    async def execute_query(
        cls,
        sql: str,
        schema_tables: dict[str, dict[str, Path]],
        unqualified_tables: dict[str, Path],
        limit: int | None = None,
    ) -> tuple[list[QueryColumn], list[list[Any]], int, bool, float]:
        """Executes a validated analytical SQL query against DuckDB."""
        max_rows = min(limit or settings.duckdb_max_result_rows, settings.duckdb_max_result_rows)
        semaphore = cls.get_semaphore()

        # Try to acquire semaphore with a timeout
        try:
            await asyncio.wait_for(semaphore.acquire(), timeout=5.0)
        except TimeoutError:
            raise ConcurrencyLimitError(
                f"Too many concurrent analytical queries are currently executing (max {settings.duckdb_max_concurrent_queries}). "
                "Please retry in a few moments."
            ) from None

        start_time = time.perf_counter()
        conn: duckdb.DuckDBPyConnection | None = None

        try:
            # Create connection and register tables
            conn = DuckDBConnectionFactory.create_connection(schema_tables, unqualified_tables)

            def _execute_sync() -> tuple[list[Any], list[Any]]:
                # Fetch max_rows + 1 to detect truncation without reading entire huge datasets
                result = conn.execute(sql)
                fetched_rows = result.fetchmany(max_rows + 1)
                description = result.description
                return description, fetched_rows

            timeout_sec = float(settings.duckdb_query_timeout_seconds)

            try:
                description, fetched_rows = await asyncio.wait_for(
                    asyncio.to_thread(_execute_sync),
                    timeout=timeout_sec,
                )
            except TimeoutError:
                if conn:
                    with contextlib.suppress(Exception):
                        conn.interrupt()
                raise QueryTimeoutError(
                    f"Query execution exceeded the configured timeout limit of {int(timeout_sec)} seconds."
                ) from None

            elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)
            columns, rows, count, truncated = serialize_query_results(
                description,
                fetched_rows,
                max_rows=max_rows,
            )

            return columns, rows, count, truncated, elapsed_ms

        except duckdb.OutOfMemoryException as exc:
            raise QueryExecutionError(
                f"Query exceeded analytical memory limit ({settings.duckdb_memory_limit}). "
                "Please add a LIMIT clause or refine your filters."
            ) from exc
        except (duckdb.InterruptException, QueryTimeoutError):
            raise
        except duckdb.Error as exc:
            err_msg = str(exc)
            # Sanitize any raw filesystem paths or internal details from DuckDB error
            err_msg = re.sub(r'/[^\s"]+\.parquet', "[parquet_data]", err_msg)
            raise QueryExecutionError(f"Database query error: {err_msg}") from exc
        except Exception as exc:
            if isinstance(exc, (QueryTimeoutError, ConcurrencyLimitError, QueryExecutionError)):
                raise
            raise QueryExecutionError(f"Unexpected query execution error: {exc}") from exc
        finally:
            if conn:
                with contextlib.suppress(Exception):
                    conn.close()
            semaphore.release()
