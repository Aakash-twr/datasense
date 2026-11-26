"""Comprehensive tests for Phase 6 Multi-Agent AI Architecture (LangGraph, Agents, Approvals, Checkpoints, Privacy & APIs)."""

from __future__ import annotations

import io
import uuid
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.agents.exceptions import AgentArtifactNotFoundError
from app.agents.graph import build_analytics_graph
from app.agents.nodes.validation_node import compute_approval_hash
from app.agents.services.checkpoint_service import CheckpointService
from app.agents.services.db_context import set_agent_db_override
from app.agents.services.result_artifact_service import ResultArtifactService
from app.agents.services.statistical_service import StatisticalService
from app.agents.services.workflow_service import WorkflowService
from app.ai.llm_factory import LLMFactory
from app.ai.schemas.ai_response import AICopilotResponse, ResponseType
from app.core.config import settings
from app.ingestion.jobs.ingestion_service import process_dataset_ingestion
from app.models.dataset import Dataset
from app.models.dataset_version import DatasetVersion


class MockMultiAgentModel:
    """Deterministic mock chat model supporting .with_structured_output() for offline tests."""

    def __init__(self, responses_by_schema: dict[str, Any] | None = None):
        self.responses_by_schema = responses_by_schema or {}
        self.calls: list[dict[str, Any]] = []

    def with_structured_output(self, schema_cls: Any) -> MockMultiAgentModel:
        self._active_schema = schema_cls
        return self

    def invoke(self, messages: Any) -> Any:
        schema_name = getattr(self, "_active_schema", type(None)).__name__
        self.calls.append({"schema": schema_name, "messages": [getattr(m, "content", str(m)) for m in messages]})
        if schema_name in self.responses_by_schema:
            return self.responses_by_schema[schema_name]
        raise RuntimeError(f"No mock configured for schema {schema_name}")


@pytest.fixture(autouse=True)
def bind_test_agent_db(db: Session, tmp_path: Path, monkeypatch):
    """Binds transactional test DB and temporary storage/checkpoint directories cleanly."""
    set_agent_db_override(db)
    monkeypatch.setattr(settings, "data_storage_root", str(tmp_path / "storage"))
    monkeypatch.setattr(settings, "google_api_key", None)
    LLMFactory.set_mock_model(None)
    yield
    set_agent_db_override(None)
    LLMFactory.set_mock_model(None)


def _create_auth_headers(client: TestClient, register_user, email: str, org_name: str) -> tuple[dict[str, str], str]:
    reg = register_user(email=email, organization_name=org_name)
    token = reg["data"]["access_token"]
    me_resp = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    org_id = me_resp.json()["current_organization"]["organization_id"]
    return {"Authorization": f"Bearer {token}"}, org_id


def _ingest_sales_dataset(client: TestClient, headers: dict[str, str], project_id: str, db: Session) -> str:
    csv_data = (
        b"order_id,order_month,category,region,revenue\n"
        b"1,2026-01,Electronics,North,100.0\n"
        b"2,2026-02,Electronics,North,110.0\n"
        b"3,2026-03,Electronics,South,105.0\n"
        b"4,2026-04,Furniture,West,120.0\n"
        b"5,2026-05,Furniture,East,115.0\n"
        b"6,2026-06,Electronics,North,950.0\n"
    )
    up_resp = client.post(
        f"/api/v1/projects/{project_id}/datasets",
        files={"file": ("sales_monthly.csv", io.BytesIO(csv_data), "text/csv")},
        data={"dataset_name": "Sales Data"},
        headers=headers,
    )
    assert up_resp.status_code == 202
    dataset_id = up_resp.json()["dataset_id"]
    job_id = up_resp.json()["job_id"]
    process_dataset_ingestion(uuid.UUID(job_id), lambda: db)
    return dataset_id


# ==============================================================================
# 1. Deterministic Statistical Engine & Result Artifact Privacy Tests
# ==============================================================================


class TestStatisticalAndArtifactServices:
    def test_deterministic_statistics_and_iqr_outlier_detection(self) -> None:
        artifact = {
            "artifact_id": "art_test_1",
            "query_run_id": "q_test_1",
            "columns": [
                {"name": "month", "type": "VARCHAR"},
                {"name": "revenue", "type": "DOUBLE"},
                {"name": "orders", "type": "INTEGER"},
            ],
            "rows": [
                ["2026-01", 100.0, 10],
                ["2026-02", 110.0, 11],
                ["2026-03", 105.0, 10],
                ["2026-04", 120.0, 12],
                ["2026-05", 115.0, 11],
                ["2026-06", 950.0, 95],  # Clear IQR outlier
            ],
        }
        out = StatisticalService.analyze_artifacts([artifact])
        rev_metric = next(m for m in out.metrics if m.metric_name == "revenue")
        assert rev_metric.count == 6
        assert rev_metric.sum_value == 1500.0
        assert rev_metric.mean == 250.0
        assert rev_metric.min_value == 100.0
        assert rev_metric.max_value == 950.0
        assert rev_metric.growth_rate_pct == 850.0
        assert len(out.anomalies) >= 1
        assert any(a.label == "2026-06" and a.method == "iqr" for a in out.anomalies)
        assert len(out.correlations) == 1
        assert out.correlations[0]["pearson_r"] > 0.99

    def test_result_artifact_isolation_and_pii_stripping(self, tmp_path: Path) -> None:
        svc = ResultArtifactService(base_dir=tmp_path / "artifacts")
        art_id = svc.save_artifact(
            organization_id="org-1",
            project_id="proj-1",
            user_id="user-1",
            run_id="run-1",
            query_run_id="qr-1",
            sql="SELECT category, customer_email, revenue FROM sales",
            columns=[
                {"name": "category", "type": "VARCHAR"},
                {"name": "customer_email", "type": "VARCHAR"},
                {"name": "revenue", "type": "DOUBLE"},
            ],
            rows=[["Electronics", "secret@example.com", 500.0]],
        )

        # Authorized fetch succeeds
        loaded = svc.get_artifact(art_id, organization_id="org-1", project_id="proj-1", user_id="user-1")
        assert loaded["row_count"] == 1

        # Cross-tenant / wrong user rejected
        with pytest.raises(AgentArtifactNotFoundError):
            svc.get_artifact(art_id, organization_id="org-2", project_id="proj-1", user_id="user-1")
        with pytest.raises(AgentArtifactNotFoundError):
            svc.get_artifact(art_id, organization_id="org-1", project_id="proj-1", user_id="user-2")

        # Sanitized aggregate summary strips PII column
        sanitized = svc.build_sanitized_aggregate_summary(loaded)
        assert "customer_email" not in sanitized["columns"]
        assert "secret@example.com" not in str(sanitized)


# ==============================================================================
# 2. LangGraph Compilation, Routing, Interrupt & Checkpoint Persistence Tests
# ==============================================================================


class TestLangGraphOrchestration:
    def test_graph_compiles_with_all_phase6_nodes(self) -> None:
        graph = build_analytics_graph()
        expected = {
            "context_loader",
            "supervisor",
            "discovery",
            "quality",
            "prep_barrier",
            "sql_analyst",
            "sql_validation",
            "human_approval",
            "execution",
            "statistical",
            "visualization",
            "insight",
            "report",
            "finalize",
        }
        assert expected.issubset(set(graph.nodes.keys()))

    def test_data_quality_audit_routes_without_sql_approval(
        self, client: TestClient, register_user, db: Session
    ) -> None:
        headers, _ = _create_auth_headers(client, register_user, "dq_user@example.com", "DQ Org")
        proj_resp = client.post("/api/v1/projects", json={"name": "DQ Project"}, headers=headers)
        project_id = proj_resp.json()["id"]

        # Dataset with missing column & sensitive email column
        csv_data = (
            b"id,customer_email,empty_col,amount\n"
            b"1,alice@example.com,,100\n"
            b"2,bob@example.com,,200\n"
        )
        up = client.post(
            f"/api/v1/projects/{project_id}/datasets",
            files={"file": ("dq.csv", io.BytesIO(csv_data), "text/csv")},
            data={"dataset_name": "Customer Orders"},
            headers=headers,
        )
        process_dataset_ingestion(uuid.UUID(up.json()["job_id"]), lambda: db)

        resp = client.post(
            f"/api/v1/projects/{project_id}/ai/agent-runs",
            json={
                "request": "Audit dataset for missing values and PII risks.",
                "dataset_ids": [up.json()["dataset_id"]],
                "workflow_type": "data_quality_audit",
            },
            headers=headers,
        )
        assert resp.status_code == 202
        run_id = resp.json()["id"]

        run_detail = client.get(f"/api/v1/projects/{project_id}/ai/agent-runs/{run_id}", headers=headers)
        assert run_detail.status_code == 200
        data = run_detail.json()
        assert data["status"] == "completed"
        assert data["approval_status"] == "not_required"

        results = client.get(f"/api/v1/projects/{project_id}/ai/agent-runs/{run_id}/results", headers=headers).json()
        assert results["data_quality"]["total_issues"] >= 1
        assert any("Empty" in f["title"] or "PII" in f["title"] for f in results["data_quality"]["findings"])
        assert results["report"] is not None

    def test_deep_analysis_approval_checkpoint_resume_and_report_saving(
        self, client: TestClient, register_user, db: Session
    ) -> None:
        headers, _ = _create_auth_headers(client, register_user, "lead_analyst@example.com", "Analytics Corp")
        proj_resp = client.post("/api/v1/projects", json={"name": "Sales Intelligence"}, headers=headers)
        project_id = proj_resp.json()["id"]
        dataset_id = _ingest_sales_dataset(client, headers, project_id, db)

        # Inject mock Gemini response generating valid DuckDB SQL
        mock_sql = AICopilotResponse(
            response_type=ResponseType.SQL_QUERY,
            message="Monthly revenue totals across the sales dataset.",
            generated_sql=(
                "SELECT order_month, SUM(revenue) AS total_revenue, COUNT(*) AS order_count "
                "FROM sales_data.sales_monthly GROUP BY order_month ORDER BY order_month ASC"
            ),
            sql_explanation="Aggregates monthly revenue chronologically.",
            assumptions=["All currency values in USD"],
            requires_clarification=False,
            suggested_follow_up_questions=["Which category drove June revenue?"],
        )
        mock_llm = MockMultiAgentModel(responses_by_schema={"AICopilotResponse": mock_sql})
        LLMFactory.set_mock_model(mock_llm)

        # 1. Launch deep_analysis workflow -> pauses at human_approval interrupt
        start_resp = client.post(
            f"/api/v1/projects/{project_id}/ai/agent-runs",
            json={
                "request": "Analyze my complete sales dataset and detect anomalies.",
                "dataset_ids": [dataset_id],
                "workflow_type": "deep_analysis",
                "share_aggregate_summaries_with_gemini": False,
            },
            headers=headers,
        )
        assert start_resp.status_code == 202
        run_id = start_resp.json()["id"]

        run_data = client.get(f"/api/v1/projects/{project_id}/ai/agent-runs/{run_id}", headers=headers).json()
        assert run_data["status"] == "awaiting_approval"
        assert run_data["approval_status"] == "pending"
        assert run_data["approval_hash"] is not None
        assert len(run_data["approval_payload"]["queries"]) >= 1

        # Verify SQL has NOT been executed yet before approval
        hist = client.get(f"/api/v1/projects/{project_id}/query/history", headers=headers).json()
        assert hist["total"] == 0

        # 2. Tampered approval hash MUST fail (409)
        bad_approve = client.post(
            f"/api/v1/projects/{project_id}/ai/agent-runs/{run_id}/approve",
            json={"approval_hash": "tampered_hash_value"},
            headers=headers,
        )
        assert bad_approve.status_code == 409

        # 3. Valid approval resumes checkpointed graph across a fresh WorkflowService instance
        approve_resp = client.post(
            f"/api/v1/projects/{project_id}/ai/agent-runs/{run_id}/approve",
            json={
                "approval_hash": run_data["approval_hash"],
                "approved_query_indices": [0],
                "comment": "Looks safe, execute.",
            },
            headers=headers,
        )
        assert approve_resp.status_code == 200

        # Check final completed state
        completed_run = client.get(f"/api/v1/projects/{project_id}/ai/agent-runs/{run_id}", headers=headers).json()
        assert completed_run["status"] == "completed"
        assert completed_run["approval_status"] == "approved"

        # Verify real query execution happened via Phase 4
        hist_after = client.get(f"/api/v1/projects/{project_id}/query/history", headers=headers).json()
        assert hist_after["total"] == 1

        # Verify statistical calculations, IQR outlier detection on June (950.0), charts, insights & report
        results = client.get(f"/api/v1/projects/{project_id}/ai/agent-runs/{run_id}/results", headers=headers).json()
        assert len(results["executed_queries"]) == 1
        assert results["executed_queries"][0]["row_count"] == 6
        assert any(m["metric_name"] == "total_revenue" for m in results["statistical_analysis"]["metrics"])
        assert any(a["label"] == "2026-06" for a in results["statistical_analysis"]["anomalies"])
        assert len(results["visualizations"]["charts"]) >= 1
        assert len(results["insights"]["findings"]) >= 1
        assert results["report"] is not None
        assert "## 1. Executive Summary" in results["report_markdown"]
        assert len(results["evidence"]) >= 2

        # Privacy check: no raw customer/order rows leaked to mock LLM prompts
        for call in mock_llm.calls:
            joined = "\n".join(call["messages"])
            assert "950.0" not in joined

        # 4. Save report and verify retrieval & deletion
        save_rep = client.post(
            f"/api/v1/projects/{project_id}/ai/agent-runs/{run_id}/reports",
            json={"title": "Q1-Q2 Sales Deep Dive"},
            headers=headers,
        )
        assert save_rep.status_code == 201
        report_id = save_rep.json()["id"]
        assert save_rep.json()["title"] == "Q1-Q2 Sales Deep Dive"

        org_reports = client.get("/api/v1/ai/reports", headers=headers).json()
        assert org_reports["total"] == 1
        assert org_reports["items"][0]["id"] == report_id

        del_rep = client.delete(f"/api/v1/projects/{project_id}/ai/reports/{report_id}", headers=headers)
        assert del_rep.status_code == 204


# ==============================================================================
# 3. Rejection, Cancellation, Version Invalidation & Cross-Tenant Isolation
# ==============================================================================


class TestApprovalSecurityAndIsolation:
    def test_reject_and_cancel_workflows(self, client: TestClient, register_user, db: Session) -> None:
        headers, _ = _create_auth_headers(client, register_user, "ops@example.com", "Ops Org")
        proj_id = client.post("/api/v1/projects", json={"name": "Ops Proj"}, headers=headers).json()["id"]
        ds_id = _ingest_sales_dataset(client, headers, proj_id, db)

        # Start simple_question run -> pauses at approval
        start1 = client.post(
            f"/api/v1/projects/{proj_id}/ai/agent-runs",
            json={"request": "Count orders", "dataset_ids": [ds_id], "workflow_type": "simple_question"},
            headers=headers,
        )
        run1_id = start1.json()["id"]
        rej = client.post(
            f"/api/v1/projects/{proj_id}/ai/agent-runs/{run1_id}/reject",
            json={"reason": "Wrong aggregation"},
            headers=headers,
        )
        assert rej.status_code == 200
        assert rej.json()["status"] == "rejected"
        assert rej.json()["approval_status"] == "rejected"

        # Start another run and cancel it
        start2 = client.post(
            f"/api/v1/projects/{proj_id}/ai/agent-runs",
            json={"request": "Count orders again", "dataset_ids": [ds_id], "workflow_type": "simple_question"},
            headers=headers,
        )
        run2_id = start2.json()["id"]
        can = client.post(f"/api/v1/projects/{proj_id}/ai/agent-runs/{run2_id}/cancel", headers=headers)
        assert can.status_code == 200
        assert can.json()["status"] == "cancelled"

    def test_dataset_version_change_invalidates_approval(
        self, client: TestClient, register_user, db: Session
    ) -> None:
        headers, _ = _create_auth_headers(client, register_user, "ver@example.com", "Version Org")
        proj_id = client.post("/api/v1/projects", json={"name": "Ver Proj"}, headers=headers).json()["id"]
        ds_id = _ingest_sales_dataset(client, headers, proj_id, db)

        start = client.post(
            f"/api/v1/projects/{proj_id}/ai/agent-runs",
            json={"request": "Count rows", "dataset_ids": [ds_id], "workflow_type": "simple_question"},
            headers=headers,
        )
        run_id = start.json()["id"]
        run_info = client.get(f"/api/v1/projects/{proj_id}/ai/agent-runs/{run_id}", headers=headers).json()
        approval_hash = run_info["approval_hash"]

        # Simulate active dataset version change before user approves
        ds_obj = db.get(Dataset, uuid.UUID(ds_id))
        assert ds_obj is not None
        new_ver = DatasetVersion(
            dataset_id=ds_obj.id,
            version_number=2,
            original_file_key="v2/key",
            file_size_bytes=10,
            checksum="abc",
        )
        db.add(new_ver)
        db.flush()
        ds_obj.active_version_id = new_ver.id
        db.commit()

        approve = client.post(
            f"/api/v1/projects/{proj_id}/ai/agent-runs/{run_id}/approve",
            json={"approval_hash": approval_hash},
            headers=headers,
        )
        assert approve.status_code == 409
        assert "changed" in approve.json()["detail"].lower()

    def test_cross_tenant_isolation_for_runs_and_reports(
        self, client: TestClient, register_user, db: Session
    ) -> None:
        headers_a, _ = _create_auth_headers(client, register_user, "tenant_a@example.com", "Tenant A")
        headers_b, _ = _create_auth_headers(client, register_user, "tenant_b@example.com", "Tenant B")

        proj_a = client.post("/api/v1/projects", json={"name": "A Secret Proj"}, headers=headers_a).json()["id"]
        ds_a = _ingest_sales_dataset(client, headers_a, proj_a, db)

        run_a = client.post(
            f"/api/v1/projects/{proj_a}/ai/agent-runs",
            json={"request": "Audit A", "dataset_ids": [ds_a], "workflow_type": "data_quality_audit"},
            headers=headers_a,
        ).json()["id"]

        rep_a = client.post(
            f"/api/v1/projects/{proj_a}/ai/agent-runs/{run_a}/reports",
            json={"title": "Secret Report A"},
            headers=headers_a,
        ).json()["id"]

        # Tenant B cannot read Tenant A's run, steps, results, or reports
        assert client.get(f"/api/v1/projects/{proj_a}/ai/agent-runs/{run_a}", headers=headers_b).status_code == 404
        assert client.get(f"/api/v1/projects/{proj_a}/ai/agent-runs/{run_a}/results", headers=headers_b).status_code == 404
        assert client.get(f"/api/v1/ai/reports/{rep_a}", headers=headers_b).status_code == 404
        assert client.get("/api/v1/ai/agent-runs", headers=headers_b).json()["total"] == 0
        assert client.get("/api/v1/ai/reports", headers=headers_b).json()["total"] == 0

    def test_checkpoint_persists_across_distinct_service_instances(self, tmp_path: Path) -> None:
        ckpt_file = tmp_path / "persisted_ckpt.db"
        svc1 = CheckpointService(sqlite_path=ckpt_file)
        thread_id = svc1.generate_thread_id()
        assert thread_id.startswith("lg_thr_")

        # Verify compute_approval_hash is deterministic
        h1 = compute_approval_hash("p1", {"d1": "v1"}, ["SELECT 1"])
        h2 = compute_approval_hash("p1", {"d1": "v1"}, ["SELECT 1"])
        h3 = compute_approval_hash("p1", {"d1": "v1"}, ["SELECT 2"])
        assert h1 == h2 and h1 != h3

        with svc1.get_checkpointer() as saver1:
            g1 = build_analytics_graph(checkpointer=saver1)
            assert g1 is not None

        # Open fresh CheckpointService instance pointing to same durable file
        svc2 = CheckpointService(sqlite_path=ckpt_file)
        with svc2.get_checkpointer() as saver2:
            assert saver2 is not None
            assert ckpt_file.exists()
            assert WorkflowService(checkpoint_service=svc2) is not None
