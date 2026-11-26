"""DuckDB connection lifecycle and resource configuration."""

from __future__ import annotations

from pathlib import Path

import duckdb
import pyarrow.dataset as ds

from app.analytics.exceptions import QueryExecutionError
from app.core.config import settings


class DuckDBConnectionFactory:
    """Manages creation, security hardening, and table registration for DuckDB sessions."""

    @staticmethod
    def create_connection(
        schema_tables: dict[str, dict[str, Path]],
        unqualified_tables: dict[str, Path],
    ) -> duckdb.DuckDBPyConnection:
        """Creates an in-memory DuckDB connection, registers dataset Parquet tables, and locks security.

        Args:
            schema_tables: Mapping of schema_name -> {table_name: Path to parquet}
            unqualified_tables: Mapping of table_name -> Path to parquet for unique tables

        Returns:
            Configured duckdb.DuckDBPyConnection
        """
        # Ensure temporary directory exists
        temp_dir = Path(settings.duckdb_temp_directory).resolve()
        temp_dir.mkdir(parents=True, exist_ok=True)

        try:
            conn = duckdb.connect(database=":memory:")

            # 1. Resource limits
            conn.execute(f"SET memory_limit = '{settings.duckdb_memory_limit}';")
            conn.execute(f"SET threads = {settings.duckdb_threads};")
            conn.execute(f"SET temp_directory = '{temp_dir}';")

            # 2. Register Arrow datasets and views
            # Register qualified schema.table views
            for schema_name, tables in schema_tables.items():
                conn.execute(f'CREATE SCHEMA IF NOT EXISTS "{schema_name}";')
                for table_name, parquet_path in tables.items():
                    temp_key = f"__arrow_{schema_name}_{table_name}"
                    arrow_ds = ds.dataset(str(parquet_path), format="parquet")
                    conn.register(temp_key, arrow_ds)
                    conn.execute(
                        f'CREATE VIEW "{schema_name}"."{table_name}" AS SELECT * FROM "{temp_key}";'
                    )

            # Register unqualified views for unique table names
            for table_name, parquet_path in unqualified_tables.items():
                temp_key = f"__arrow_unq_{table_name}"
                arrow_ds = ds.dataset(str(parquet_path), format="parquet")
                conn.register(temp_key, arrow_ds)
                conn.execute(
                    f'CREATE VIEW "{table_name}" AS SELECT * FROM "{temp_key}";'
                )

            # 3. Security Lockdown: Disable external access and lock configuration
            conn.execute("SET enable_external_access = false;")
            conn.execute("SET lock_configuration = true;")

            return conn
        except Exception as exc:
            raise QueryExecutionError(f"Failed to initialize DuckDB session: {exc}") from exc
