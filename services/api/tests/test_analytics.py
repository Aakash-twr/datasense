"""Tests for Phase 4 Analytical Engine & SQL Safety:
DuckDB execution, SQLGlot validation, catalog resolution, query history, saved queries, and multi-tenant isolation.
"""

from __future__ import annotations

import io
import uuid
from typing import Any

import duckdb
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.analytics.connection import DuckDBConnectionFactory
from app.analytics.query_validator import QueryValidator
from app.analytics.result_serializer import serialize_query_results
from app.ingestion.jobs.ingestion_service import process_dataset_ingestion


def _create_auth_headers(client: TestClient, register_user, email: str, org_name: str) -> tuple[dict[str, str], str]:
    reg = register_user(email=email, organization_name=org_name)
    token = reg["data"]["access_token"]
    me_resp = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    org_id = me_resp.json()["current_organization"]["organization_id"]
    return {"Authorization": f"Bearer {token}"}, org_id


# ==============================================================================
# 1. SQLGlot Query Validator Unit Tests
# ==============================================================================


class TestSQLValidator:
    """Unit tests for AST-based SQL validation."""

    validator = QueryValidator(
        registered_catalog={
            "sales": ["orders", "customers", "products"],
            "default": ["orders", "customers"],
        }
    )

    def test_valid_select_queries(self) -> None:
        """Valid SELECT queries should pass validation and extract referenced tables/columns."""
        queries = [
            "SELECT * FROM sales.orders",
            "SELECT customer_id, SUM(amount) AS total FROM sales.orders GROUP BY customer_id HAVING SUM(amount) > 100",
            "SELECT o.id, c.name FROM sales.orders o JOIN sales.customers c ON o.customer_id = c.id WHERE o.amount >= 50.0 ORDER BY o.id DESC LIMIT 10",
            "SELECT id, amount, ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY amount DESC) as rank FROM sales.orders",
        ]
        for sql in queries:
            result = self.validator.validate(sql)
            assert result.is_valid is True
            assert result.error is None
            assert len(result.tables_referenced) > 0

    def test_ctes_and_subqueries(self) -> None:
        """Common Table Expressions (CTEs) should be recognized as temporary and not require catalog lookup."""
        sql = """
        WITH high_value AS (
            SELECT customer_id, amount FROM sales.orders WHERE amount > 500
        )
        SELECT hv.customer_id, c.name, hv.amount
        FROM high_value hv
        JOIN sales.customers c ON hv.customer_id = c.id
        """
        result = self.validator.validate(sql)
        assert result.is_valid is True
        assert "sales.customers" in result.tables_referenced
        assert "sales.orders" in result.tables_referenced
        assert "high_value" not in result.tables_referenced

    def test_reject_multiple_statements(self) -> None:
        """Semicolon-separated multiple statements must be rejected."""
        sql = "SELECT * FROM sales.orders; DROP TABLE sales.orders;"
        result = self.validator.validate(sql)
        assert result.is_valid is False
        assert result.error is not None
        assert "Multiple SQL statements" in result.error

    def test_reject_dml_and_ddl(self) -> None:
        """Data manipulation and definition commands must be rejected."""
        disallowed = [
            "INSERT INTO sales.orders (id, amount) VALUES (1, 100)",
            "UPDATE sales.orders SET amount = 0",
            "DELETE FROM sales.orders WHERE id = 1",
            "DROP TABLE sales.orders",
            "ALTER TABLE sales.orders ADD COLUMN test INT",
            "CREATE TABLE hack (id INT)",
            "TRUNCATE TABLE sales.orders",
        ]
        for sql in disallowed:
            result = self.validator.validate(sql)
            assert result.is_valid is False
            assert result.error is not None
            assert "Forbidden" in result.error or "SELECT" in result.error

    def test_reject_forbidden_duckdb_commands(self) -> None:
        """DuckDB system / environment commands must be rejected."""
        disallowed = [
            "PRAGMA version",
            "COPY sales.orders TO 'out.csv'",
            "ATTACH 'mydb.duckdb'",
            "DETACH mydb",
        ]
        for sql in disallowed:
            result = self.validator.validate(sql)
            assert result.is_valid is False
            assert result.error is not None
            assert "Forbidden" in result.error

    def test_reject_forbidden_file_functions(self) -> None:
        """Direct file reading functions must be strictly blocked."""
        disallowed = [
            "SELECT * FROM read_csv('secret.csv')",
            "SELECT * FROM read_parquet('data.parquet')",
            "SELECT * FROM scan_parquet('data.parquet')",
            "SELECT * FROM read_json('config.json')",
            "SELECT * FROM read_csv_auto('passwd')",
            "SELECT * FROM glob('/etc/*')",
        ]
        for sql in disallowed:
            result = self.validator.validate(sql)
            assert result.is_valid is False
            assert result.error is not None
            assert "Forbidden" in result.error or "Table expressions" in result.error

    def test_reject_unregistered_tables(self) -> None:
        """Referencing tables not in the project catalog must fail validation."""
        sql = "SELECT * FROM secret_passwords"
        result = self.validator.validate(sql)
        assert result.is_valid is False
        assert result.error is not None
        assert "secret_passwords" in result.error

    def test_reject_system_catalogs(self) -> None:
        """Accessing internal system tables or schemas must be blocked."""
        disallowed = [
            "SELECT * FROM duckdb_tables",
            "SELECT * FROM information_schema.tables",
            "SELECT * FROM sqlite_master",
            "SELECT * FROM pg_catalog.pg_tables",
        ]
        for sql in disallowed:
            result = self.validator.validate(sql)
            assert result.is_valid is False
            assert result.error is not None
            assert "forbidden" in result.error.lower() or "not registered" in result.error.lower()


# ==============================================================================
# 2. DuckDB Engine & Execution Unit Tests
# ==============================================================================


class TestDuckDBEngine:
    """Unit tests for DuckDB engine and result serialization."""

    def test_duckdb_connection_security_and_execution(self, tmp_path) -> None:
        """DuckDB connection should register Arrow datasets and execute analytical SQL."""
        import pyarrow as pa
        import pyarrow.parquet as pq

        # Create temporary Parquet file
        table = pa.Table.from_arrays(
            [
                pa.array([1, 2, 3, 4, 5]),
                pa.array(["Electronics", "Clothing", "Electronics", "Home", "Clothing"]),
                pa.array([199.99, 49.50, 89.00, 15.00, None]),
            ],
            names=["id", "category", "price"],
        )
        parquet_file = tmp_path / "sales.parquet"
        pq.write_table(table, str(parquet_file))

        conn = DuckDBConnectionFactory.create_connection(
            schema_tables={},
            unqualified_tables={"sales": parquet_file},
        )
        try:
            # Query the registered view
            cursor = conn.execute("SELECT category, COUNT(*) as cnt, AVG(price) as avg_price FROM sales GROUP BY category ORDER BY category")
            columns, rows, count, truncated = serialize_query_results(
                cursor.description,
                cursor.fetchall(),
                max_rows=10,
            )
            assert truncated is False
            assert count == 3
            assert rows[0][0] == "Clothing"
            assert rows[0][1] == 2
            assert rows[1][0] == "Electronics"
            assert rows[1][1] == 2
        finally:
            conn.close()

    def test_result_truncation(self, tmp_path) -> None:
        """Result serializer properly truncates when rows exceed max_rows."""
        import pyarrow as pa
        import pyarrow.parquet as pq

        table = pa.Table.from_arrays(
            [pa.array(list(range(20)))],
            names=["num"],
        )
        parquet_file = tmp_path / "nums.parquet"
        pq.write_table(table, str(parquet_file))

        conn = DuckDBConnectionFactory.create_connection(
            schema_tables={},
            unqualified_tables={"numbers": parquet_file},
        )
        try:
            cursor = conn.execute("SELECT num FROM numbers")
            # Fetch max_rows + 1 to detect truncation
            raw_rows = cursor.fetchmany(10 + 1)
            columns, rows, count, truncated = serialize_query_results(
                cursor.description,
                raw_rows,
                max_rows=10,
            )
            assert truncated is True
            assert count == 10
            assert len(rows) == 10
        finally:
            conn.close()

    def test_external_file_access_blocked(self, tmp_path) -> None:
        """DuckDB connection with enable_external_access=false must reject direct read_csv / read_parquet."""
        conn = DuckDBConnectionFactory.create_connection(schema_tables={}, unqualified_tables={})
        try:
            with pytest.raises(duckdb.PermissionException):
                conn.execute("SELECT * FROM read_parquet('/tmp/test.parquet')")
        finally:
            conn.close()


# ==============================================================================
# 3. API Integration Tests (Catalog, Validate, Execute, History, Saved Queries)
# ==============================================================================


@pytest.fixture
def sample_project_with_dataset(client: TestClient, register_user, db: Session) -> dict[str, Any]:
    """Helper fixture to create a project and ingest a valid dataset."""
    headers, org_id = _create_auth_headers(client, register_user, "analytics_lead@example.com", "Analytics Org")

    # 1. Create project
    proj_resp = client.post(
        "/api/v1/projects",
        headers=headers,
        json={"name": "Retail Intelligence", "description": "Analyzing retail sales"},
    )
    assert proj_resp.status_code == 201
    project_id = proj_resp.json()["id"]

    # 2. Upload dataset CSV
    csv_content = (
        b"order_id,customer_name,email,amount,category\n"
        b"101,Alice Green,alice@example.com,250.00,Tech\n"
        b"102,Bob White,bob@example.com,180.50,Fashion\n"
        b"103,Charlie Black,charlie@example.com,75.25,Home\n"
        b"104,Diana Grey,diana@example.com,320.00,Tech\n"
        b"105,Edward Blue,edward@example.com,45.00,Fashion\n"
    )
    files = {"file": ("retail_orders.csv", io.BytesIO(csv_content), "text/csv")}
    data = {"dataset_name": "Retail Orders", "description": "Retail transaction records"}

    upload_resp = client.post(
        f"/api/v1/projects/{project_id}/datasets",
        headers=headers,
        files=files,
        data=data,
    )
    assert upload_resp.status_code == 202
    res_json = upload_resp.json()
    dataset_id = res_json["dataset_id"]
    job_id = res_json["job_id"]

    # 3. Synchronously ingest
    def _test_session_factory():
        return db

    process_dataset_ingestion(uuid.UUID(job_id), _test_session_factory)

    return {
        "headers": headers,
        "org_id": org_id,
        "project_id": project_id,
        "dataset_id": dataset_id,
    }


def test_analytics_catalog_endpoint(client: TestClient, sample_project_with_dataset: dict[str, Any]) -> None:
    """Catalog endpoint returns available tables, columns, types, and row count."""
    headers = sample_project_with_dataset["headers"]
    project_id = sample_project_with_dataset["project_id"]

    resp = client.get(f"/api/v1/projects/{project_id}/query/catalog", headers=headers)
    assert resp.status_code == 200
    catalog = resp.json()
    assert len(catalog["datasets"]) >= 1
    dataset = catalog["datasets"][0]
    assert len(dataset["tables"]) >= 1

    orders_table = dataset["tables"][0]
    assert orders_table["row_count"] == 5
    col_names = [c["name"] for c in orders_table["columns"]]
    assert "order_id" in col_names
    assert "customer_name" in col_names
    assert "amount" in col_names
    assert "category" in col_names


def test_analytics_validate_endpoint(client: TestClient, sample_project_with_dataset: dict[str, Any]) -> None:
    """Validate endpoint checks query syntax, safety, and table existence."""
    headers = sample_project_with_dataset["headers"]
    project_id = sample_project_with_dataset["project_id"]

    # 1. Valid query
    resp = client.post(
        f"/api/v1/projects/{project_id}/query/validate",
        headers=headers,
        json={"sql": "SELECT category, SUM(amount) FROM retail_orders GROUP BY category"},
    )
    assert resp.status_code == 200
    val_json = resp.json()
    assert val_json["is_valid"] is True
    assert any("retail_orders" in t for t in val_json["tables_referenced"])

    # 2. Invalid table query
    resp_invalid = client.post(
        f"/api/v1/projects/{project_id}/query/validate",
        headers=headers,
        json={"sql": "SELECT * FROM non_existent_table"},
    )
    assert resp_invalid.status_code == 200
    val_invalid = resp_invalid.json()
    assert val_invalid["is_valid"] is False
    assert val_invalid["error"] is not None
    assert "non_existent_table" in val_invalid["error"]

    # 3. Disallowed statement (DROP TABLE)
    resp_drop = client.post(
        f"/api/v1/projects/{project_id}/query/validate",
        headers=headers,
        json={"sql": "DROP TABLE retail_orders"},
    )
    assert resp_drop.status_code == 200
    val_drop = resp_drop.json()
    assert val_drop["is_valid"] is False
    assert val_drop["error"] is not None
    assert "SELECT" in val_drop["error"] or "Forbidden" in val_drop["error"]


def test_analytics_execute_endpoint(client: TestClient, sample_project_with_dataset: dict[str, Any]) -> None:
    """Execute endpoint runs SQL query on DuckDB and records query run."""
    headers = sample_project_with_dataset["headers"]
    project_id = sample_project_with_dataset["project_id"]

    query_req = {
        "sql": "SELECT category, count(*) AS total_orders, sum(amount) AS total_revenue FROM retail_orders GROUP BY category ORDER BY total_revenue DESC",
        "limit": 100,
    }

    resp = client.post(
        f"/api/v1/projects/{project_id}/query/execute",
        headers=headers,
        json=query_req,
    )
    assert resp.status_code == 200
    result = resp.json()
    assert result["status"] == "success"
    assert result["row_count"] == 3
    assert result["truncated"] is False
    assert result["execution_time_ms"] >= 0
    assert len(result["columns"]) == 3
    assert result["columns"][0]["name"] == "category"

    # Verify rows data: rows are lists of values
    categories = [r[0] for r in result["rows"]]
    assert "Tech" in categories
    assert "Fashion" in categories
    assert "Home" in categories

    query_id = result["query_id"]

    # Check status endpoint
    status_resp = client.get(f"/api/v1/projects/{project_id}/query/{query_id}", headers=headers)
    assert status_resp.status_code == 200
    assert status_resp.json()["status"] == "success"


def test_analytics_history_and_deletion(client: TestClient, sample_project_with_dataset: dict[str, Any]) -> None:
    """Query history records queries and allows deletion."""
    headers = sample_project_with_dataset["headers"]
    project_id = sample_project_with_dataset["project_id"]

    # Execute a query
    client.post(
        f"/api/v1/projects/{project_id}/query/execute",
        headers=headers,
        json={"sql": "SELECT COUNT(*) as count FROM retail_orders"},
    )

    # Get history
    history_resp = client.get(f"/api/v1/projects/{project_id}/query/history", headers=headers)
    assert history_resp.status_code == 200
    history = history_resp.json()
    assert history["total"] >= 1
    latest_run = history["items"][0]
    run_id = latest_run["id"]

    # Delete history item
    del_resp = client.delete(f"/api/v1/projects/{project_id}/query/history/{run_id}", headers=headers)
    assert del_resp.status_code == 204

    # Verify gone
    del_check = client.get(f"/api/v1/projects/{project_id}/query/{run_id}", headers=headers)
    assert del_check.status_code == 404


def test_analytics_saved_queries_crud(client: TestClient, sample_project_with_dataset: dict[str, Any]) -> None:
    """Saved queries full CRUD workflow."""
    headers = sample_project_with_dataset["headers"]
    project_id = sample_project_with_dataset["project_id"]

    # 1. Create saved query
    create_resp = client.post(
        f"/api/v1/projects/{project_id}/saved-queries",
        headers=headers,
        json={
            "name": "Top Selling Categories",
            "description": "Calculates revenue per product category",
            "sql_query": "SELECT category, SUM(amount) FROM retail_orders GROUP BY category",
        },
    )
    assert create_resp.status_code == 201
    saved = create_resp.json()
    saved_id = saved["id"]
    assert saved["name"] == "Top Selling Categories"

    # 2. List saved queries
    list_resp = client.get(f"/api/v1/projects/{project_id}/saved-queries", headers=headers)
    assert list_resp.status_code == 200
    items = list_resp.json()["items"]
    assert any(q["id"] == saved_id for q in items)

    # 3. Get single saved query
    get_resp = client.get(f"/api/v1/projects/{project_id}/saved-queries/{saved_id}", headers=headers)
    assert get_resp.status_code == 200
    assert get_resp.json()["name"] == "Top Selling Categories"

    # 4. Update saved query
    update_resp = client.put(
        f"/api/v1/projects/{project_id}/saved-queries/{saved_id}",
        headers=headers,
        json={
            "name": "Updated Top Categories",
            "description": "Updated description",
            "sql_query": "SELECT category, COUNT(*), SUM(amount) FROM retail_orders GROUP BY category",
        },
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["name"] == "Updated Top Categories"

    # 5. Delete saved query
    del_resp = client.delete(f"/api/v1/projects/{project_id}/saved-queries/{saved_id}", headers=headers)
    assert del_resp.status_code == 204

    # 6. Verify deleted
    get_deleted = client.get(f"/api/v1/projects/{project_id}/saved-queries/{saved_id}", headers=headers)
    assert get_deleted.status_code == 404


def test_cross_tenant_and_cross_project_isolation(
    client: TestClient,
    register_user,
    sample_project_with_dataset: dict[str, Any],
) -> None:
    """Users in Organization/Project B cannot query or access Project A's datasets or saved queries."""
    proj_a_id = sample_project_with_dataset["project_id"]

    # Register User B in Organization B
    headers_b, org_b_id = _create_auth_headers(client, register_user, "user_b@competitor.com", "Competitor Corp")

    # 1. User B tries to view catalog of Project A
    catalog_resp = client.get(f"/api/v1/projects/{proj_a_id}/query/catalog", headers=headers_b)
    assert catalog_resp.status_code == 404

    # 2. User B tries to execute query on Project A
    exec_resp = client.post(
        f"/api/v1/projects/{proj_a_id}/query/execute",
        headers=headers_b,
        json={"sql": "SELECT * FROM retail_orders"},
    )
    assert exec_resp.status_code == 404

    # 3. User B tries to access saved queries of Project A
    saved_resp = client.get(f"/api/v1/projects/{proj_a_id}/saved-queries", headers=headers_b)
    assert saved_resp.status_code == 404
