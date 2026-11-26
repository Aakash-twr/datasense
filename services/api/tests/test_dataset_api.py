"""Integration tests for dataset upload, background ingestion, preview, and authorization."""

from __future__ import annotations

import io
import uuid
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.ingestion.jobs.ingestion_service import process_dataset_ingestion


def _create_auth_headers(client: TestClient, register_user, email: str, org_name: str) -> tuple[dict[str, str], str]:
    reg = register_user(email=email, organization_name=org_name)
    token = reg["data"]["access_token"]
    # Get current org id
    me_resp = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    org_id = me_resp.json()["current_organization"]["organization_id"]
    return {"Authorization": f"Bearer {token}"}, org_id


def test_upload_and_ingestion_pipeline(client: TestClient, register_user, db: Session, tmp_path: Path) -> None:
    """End-to-end dataset upload, background ingestion, and preview verification."""
    headers, org_id = _create_auth_headers(client, register_user, "data_eng@example.com", "Data Org")

    # 1. Create a project
    proj_resp = client.post(
        "/api/v1/projects",
        headers=headers,
        json={"name": "Sales Analytics", "description": "Analyzing revenue"},
    )
    assert proj_resp.status_code == 201
    project_id = proj_resp.json()["id"]

    # 2. Upload CSV file
    csv_content = (
        b"transaction_id,customer_name,email,amount,country\n"
        b"101,John Doe,john@example.com,250.00,USA\n"
        b"102,Jane Smith,jane@example.com,180.50,UK\n"
        b"103,Bob Brown,bob@example.com,75.25,Canada\n"
    )

    files = {"file": ("orders.csv", io.BytesIO(csv_content), "text/csv")}
    data = {"dataset_name": "Orders Q1", "description": "Q1 sales transactions"}

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

    # 3. Process ingestion job synchronously for test
    def _test_session_factory():
        return db

    process_dataset_ingestion(uuid.UUID(job_id), _test_session_factory)

    # 4. Check dataset status
    status_resp = client.get(f"/api/v1/datasets/{dataset_id}/status", headers=headers)
    assert status_resp.status_code == 200
    st_json = status_resp.json()
    assert st_json["status"] == "ready"
    assert st_json["job"]["progress_percentage"] == 100

    # 5. Check schema endpoint
    schema_resp = client.get(f"/api/v1/datasets/{dataset_id}/schema", headers=headers)
    assert schema_resp.status_code == 200
    schema_json = schema_resp.json()
    assert len(schema_json["tables"]) == 1
    cols = schema_json["tables"][0]["columns"]
    col_names = [c["column_name"] for c in cols]
    assert "transaction_id" in col_names
    assert "email" in col_names

    # Check PII detection on email
    email_col = next(c for c in cols if c["column_name"] == "email")
    assert email_col["pii_category"] == "email"

    # 6. Check data preview endpoint
    preview_resp = client.get(
        f"/api/v1/datasets/{dataset_id}/preview?limit=10",
        headers=headers,
    )
    assert preview_resp.status_code == 200
    preview_json = preview_resp.json()
    assert preview_json["total_rows"] == 3
    assert len(preview_json["rows"]) == 3
    assert preview_json["rows"][0]["customer_name"] == "John Doe"

    # 7. Check data profile endpoint
    profile_resp = client.get(f"/api/v1/datasets/{dataset_id}/profile", headers=headers)
    assert profile_resp.status_code == 200
    profile_json = profile_resp.json()
    assert profile_json["table_stats"]["total_rows"] == 3
    assert "amount" in profile_json["column_stats"]

    # 8. Check dataset versions
    ver_resp = client.get(f"/api/v1/datasets/{dataset_id}/versions", headers=headers)
    assert ver_resp.status_code == 200
    versions = ver_resp.json()
    assert len(versions) == 1
    assert versions[0]["version_number"] == 1
    assert versions[0]["is_active"] is True


def test_cross_organization_dataset_authorization(client: TestClient, register_user, db: Session) -> None:
    """Users in Organization B must not access datasets belonging to Organization A."""
    headers_a, _ = _create_auth_headers(client, register_user, "user_a@org-a.com", "Org A")
    headers_b, _ = _create_auth_headers(client, register_user, "user_b@org-b.com", "Org B")

    # Org A creates project and uploads dataset
    proj_a = client.post(
        "/api/v1/projects",
        headers=headers_a,
        json={"name": "Org A Private Project"},
    ).json()["id"]

    csv_data = b"id,val\n1,private_data\n"
    files = {"file": ("secret.csv", io.BytesIO(csv_data), "text/csv")}
    ds_a = client.post(
        f"/api/v1/projects/{proj_a}/datasets",
        headers=headers_a,
        files=files,
    ).json()["dataset_id"]

    # Org B attempts to access Org A's dataset
    detail_resp = client.get(f"/api/v1/datasets/{ds_a}", headers=headers_b)
    assert detail_resp.status_code == 404

    # Org B attempts to preview Org A's dataset
    preview_resp = client.get(f"/api/v1/datasets/{ds_a}/preview", headers=headers_b)
    assert preview_resp.status_code == 404

    # Org B attempts to upload into Org A's project
    upload_resp = client.post(
        f"/api/v1/projects/{proj_a}/datasets",
        headers=headers_b,
        files={"file": ("hack.csv", io.BytesIO(b"a\n1\n"), "text/csv")},
    )
    assert upload_resp.status_code == 404


def test_dataset_archival(client: TestClient, register_user, db: Session) -> None:
    """Archiving a dataset sets status to archived and excludes it from default listings."""
    headers, _ = _create_auth_headers(client, register_user, "admin@datasense.io", "Archive Org")

    proj_id = client.post(
        "/api/v1/projects",
        headers=headers,
        json={"name": "Archive Test Project"},
    ).json()["id"]

    files = {"file": ("data.csv", io.BytesIO(b"x,y\n1,2\n"), "text/csv")}
    ds_id = client.post(
        f"/api/v1/projects/{proj_id}/datasets",
        headers=headers,
        files=files,
    ).json()["dataset_id"]

    # Archive
    del_resp = client.delete(f"/api/v1/datasets/{ds_id}", headers=headers)
    assert del_resp.status_code == 204

    # Default listing should exclude archived
    list_resp = client.get(f"/api/v1/projects/{proj_id}/datasets", headers=headers).json()
    assert list_resp["total"] == 0

    # With include_archived=true it should appear
    list_archived = client.get(
        f"/api/v1/projects/{proj_id}/datasets?include_archived=true",
        headers=headers,
    ).json()
    assert list_archived["total"] == 1
    assert list_archived["items"][0]["status"] == "archived"
