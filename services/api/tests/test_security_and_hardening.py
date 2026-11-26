"""Phase 7 comprehensive tests for security hardening, RBAC, rate limiting, observability, storage safety, and E2E journeys."""

from __future__ import annotations

import os
import tempfile
import uuid
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.ai.llm_factory import LLMFactory
from app.ai.schemas.ai_response import ResponseType, VisualizationRecommendation
from app.core.config import Settings, settings
from app.core.observability import redact_sensitive_text, set_shutting_down
from app.core.security import hash_password
from app.ingestion.jobs.ingestion_service import process_dataset_ingestion
from app.ingestion.storage.local_storage import LocalStorageService, default_storage
from app.models.membership import Membership, MembershipRole
from app.models.organization import Organization
from app.models.user import User


def _auth_headers(token: str, org_id: str | None = None) -> dict[str, str]:
    headers = {
        "Authorization": f"Bearer {token}",
        "X-Requested-With": "DataSense",
    }
    if org_id:
        headers["X-Organization-Id"] = org_id
    return headers


class TestProductionConfigValidation:
    """Verify startup configuration guards refuse unsafe production setups."""

    def test_rejects_default_jwt_and_sqlite_and_insecure_cookies_in_production(self) -> None:
        cfg = Settings(
            environment="production",
            jwt_secret_key="datasense-development-only-secret-key",
            database_url="sqlite:///./datasense_dev.db",
            cookie_secure=False,
            cors_origins=["*"],
        )
        try:
            cfg.validate_production_settings()
            raise AssertionError("Expected ValueError for insecure production settings")
        except ValueError as exc:
            msg = str(exc)
            assert "JWT_SECRET_KEY" in msg
            assert "SQLite" in msg
            assert "COOKIE_SECURE" in msg
            assert "CORS_ORIGINS" in msg

    def test_accepts_hardened_production_config(self) -> None:
        cfg = Settings(
            environment="production",
            jwt_secret_key="x" * 48,
            database_url="postgresql+psycopg://user:strongpw@db:5432/datasense",
            cookie_secure=True,
            cors_origins=["https://datasense.example.com"],
        )
        cfg.validate_production_settings()


class TestAuthSecurityHardening:
    """Verify password complexity, CSRF protection, refresh-token reuse revocation, and rate limits."""

    def test_password_strength_enforced(self, client: TestClient) -> None:
        # Missing digit
        resp1 = client.post(
            "/api/v1/auth/register",
            json={
                "name": "Weak User",
                "email": "weak1@example.com",
                "password": "OnlyLettersPassword",
                "organization_name": "Weak Org",
            },
        )
        assert resp1.status_code == 422

        # Missing letter
        resp2 = client.post(
            "/api/v1/auth/register",
            json={
                "name": "Weak User 2",
                "email": "weak2@example.com",
                "password": "123456789012",
                "organization_name": "Weak Org 2",
            },
        )
        assert resp2.status_code == 422

    def test_refresh_token_reuse_revokes_entire_session_family(
        self, client: TestClient, register_user
    ) -> None:
        reg = register_user(email="reuse@example.com", organization_name="Reuse Co")
        assert reg["response"].status_code == 201
        cookie1 = reg["response"].cookies.get(settings.refresh_cookie_name)
        assert cookie1

        # Rotate once -> issues cookie2 and revokes cookie1
        rot = client.post(
            "/api/v1/auth/refresh",
            cookies={settings.refresh_cookie_name: cookie1},
            headers={"X-Requested-With": "DataSense"},
        )
        assert rot.status_code == 200
        cookie2 = rot.cookies.get(settings.refresh_cookie_name)
        assert cookie2 and cookie2 != cookie1

        # Replay old cookie1 -> triggers family revocation
        replay = client.post(
            "/api/v1/auth/refresh",
            cookies={settings.refresh_cookie_name: cookie1},
            headers={"X-Requested-With": "DataSense"},
        )
        assert replay.status_code == 401

        # Active cookie2 must now also be revoked!
        followup = client.post(
            "/api/v1/auth/refresh",
            cookies={settings.refresh_cookie_name: cookie2},
            headers={"X-Requested-With": "DataSense"},
        )
        assert followup.status_code == 401

    def test_csrf_cross_origin_rejected_on_cookie_routes(self, client: TestClient) -> None:
        resp = client.post(
            "/api/v1/auth/refresh",
            headers={"Origin": "https://attacker.evil.example"},
        )
        assert resp.status_code == 403

        resp_logout = client.post(
            "/api/v1/auth/logout",
            headers={"Referer": "https://attacker.evil.example/steal"},
        )
        assert resp_logout.status_code == 403

    def test_database_rate_limiter_enforces_429(self, client: TestClient) -> None:
        orig_limit = settings.rate_limit_auth_per_minute
        settings.rate_limit_auth_per_minute = 2
        try:
            for _ in range(2):
                r = client.post(
                    "/api/v1/auth/login",
                    json={"email": "nobody@example.com", "password": "WrongPassword123"},
                )
                assert r.status_code == 401
            blocked = client.post(
                "/api/v1/auth/login",
                json={"email": "nobody@example.com", "password": "WrongPassword123"},
            )
            assert blocked.status_code == 429
            assert "Retry-After" in blocked.headers
        finally:
            settings.rate_limit_auth_per_minute = orig_limit


class TestRBACAndStorageSecurity:
    """Verify Viewer read-only boundaries, Admin observability protection, headers, and storage safety."""

    def test_security_headers_and_correlation_ids(self, client: TestClient) -> None:
        resp = client.get("/api/v1/health/live")
        assert resp.status_code == 200
        assert resp.headers.get("X-Content-Type-Options") == "nosniff"
        assert resp.headers.get("X-Frame-Options") == "DENY"
        assert resp.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"
        assert "Content-Security-Policy" in resp.headers
        assert resp.headers.get("X-Request-Id")
        assert resp.headers.get("X-Correlation-Id")

    def test_viewer_blocked_from_all_mutating_analytics_ai_agent_and_admin_routes(
        self, client: TestClient, db: Session, register_user
    ) -> None:
        owner_reg = register_user(email="owner7@example.com", organization_name="Strict Org")
        owner_data = owner_reg["data"]
        owner_token = owner_data["access_token"]

        org = db.query(Organization).filter(Organization.slug.like("strict-org%")).first()
        assert org is not None
        org_id = str(org.id)

        # Create a project as Owner
        proj_resp = client.post(
            "/api/v1/projects",
            headers=_auth_headers(owner_token, org_id),
            json={"name": "Governed Project", "description": "RBAC verification"},
        )
        assert proj_resp.status_code == 201
        project_id = proj_resp.json()["id"]

        # Create a Viewer user directly inside the same organization
        viewer = User(
            name="Victor Viewer",
            email="viewer7@example.com",
            password_hash=hash_password("ViewerPass123!"),
            is_active=True,
        )
        db.add(viewer)
        db.flush()
        db.add(
            Membership(
                organization_id=org.id,
                user_id=viewer.id,
                role=MembershipRole.VIEWER,
            )
        )
        db.commit()

        v_login = client.post(
            "/api/v1/auth/login",
            json={"email": "viewer7@example.com", "password": "ViewerPass123!"},
        )
        assert v_login.status_code == 200
        viewer_token = v_login.json()["access_token"]
        v_headers = _auth_headers(viewer_token, org_id)

        # Read endpoints remain accessible to Viewer
        assert client.get(f"/api/v1/projects/{project_id}", headers=v_headers).status_code == 200
        assert client.get("/api/v1/ai/reports", headers=v_headers).status_code == 200
        assert client.get("/api/v1/ai/agent-runs", headers=v_headers).status_code == 200

        # Mutating endpoints must reject Viewer with 403
        upload_resp = client.post(
            f"/api/v1/projects/{project_id}/datasets",
            headers=v_headers,
            files={"file": ("sales.csv", b"a,b\n1,2\n", "text/csv")},
        )
        assert upload_resp.status_code == 403

        sql_resp = client.post(
            f"/api/v1/projects/{project_id}/query/execute",
            headers=v_headers,
            json={"sql": "SELECT 1", "dataset_ids": []},
        )
        assert sql_resp.status_code == 403

        saved_resp = client.post(
            f"/api/v1/projects/{project_id}/saved-queries",
            headers=v_headers,
            json={"name": "Read check", "sql_query": "SELECT 1"},
        )
        assert saved_resp.status_code == 403

        conv_resp = client.post(
            f"/api/v1/projects/{project_id}/ai/conversations",
            headers=v_headers,
            json={"title": "Viewer thread", "dataset_ids": []},
        )
        assert conv_resp.status_code == 403

        agent_resp = client.post(
            f"/api/v1/projects/{project_id}/ai/agent-runs",
            headers=v_headers,
            json={"user_request": "Analyze revenue trends", "dataset_ids": []},
        )
        assert agent_resp.status_code == 403

        # Admin observability and /metrics restricted from Viewer
        assert client.get("/api/v1/admin/observability", headers=v_headers).status_code == 403
        assert client.get("/api/v1/metrics", headers=v_headers).status_code == 403

        # Owner succeeds on observability and metrics
        o_headers = _auth_headers(owner_token, org_id)
        obs_resp = client.get("/api/v1/admin/observability", headers=o_headers)
        assert obs_resp.status_code == 200
        obs_body = obs_resp.json()
        assert "dependencies" in obs_body
        assert "metrics" in obs_body
        assert "database_pool" in obs_body

        metrics_resp = client.get("/api/v1/metrics", headers=o_headers)
        assert metrics_resp.status_code == 200
        assert "datasense_http_requests_total" in metrics_resp.text

    def test_storage_rejects_symlinks_and_null_bytes(self) -> None:
        with tempfile.TemporaryDirectory() as root_tmp, tempfile.TemporaryDirectory() as outside_tmp:
            outside_file = Path(outside_tmp) / "secret.txt"
            outside_file.write_text("TOP_SECRET", encoding="utf-8")

            storage = LocalStorageService(root_dir=root_tmp)
            link_path = Path(root_tmp) / "escape_link"
            os.symlink(outside_file, link_path)

            try:
                storage.get_file_path("escape_link")
                raise AssertionError("Expected ValueError for symlink inside storage")
            except ValueError as exc:
                assert "Symlink" in str(exc) or "traversal" in str(exc)

            try:
                storage.get_file_path("bad\x00key.csv")
                raise AssertionError("Expected ValueError for null-byte key")
            except ValueError:
                pass


class TestObservabilityProbesAndShutdownDrain:
    """Verify probes, Prometheus token auth, log redaction, and shutdown draining."""

    def test_readiness_and_shutdown_drain_returns_503(self, client: TestClient, register_user) -> None:
        live = client.get("/api/v1/health/live")
        assert live.status_code == 200
        assert live.json()["status"] == "alive"

        ready = client.get("/api/v1/health/ready")
        assert ready.status_code == 200
        assert ready.json()["ready"] is True
        assert ready.json()["checks"]["database"] == "ok"
        assert ready.json()["checks"]["duckdb"] == "ok"
        assert ready.json()["checks"]["storage"] == "ok"

        reg = register_user(email="drain@example.com", organization_name="Drain Org")
        token = reg["data"]["access_token"]
        proj = client.post(
            "/api/v1/projects",
            headers=_auth_headers(token),
            json={"name": "Drain Project"},
        ).json()

        set_shutting_down(True)
        try:
            draining = client.get("/api/v1/health/ready")
            assert draining.status_code == 503
            assert draining.json()["ready"] is False
            assert draining.json()["shutting_down"] is True

            rejected_sql = client.post(
                f"/api/v1/projects/{proj['id']}/query/execute",
                headers=_auth_headers(token),
                json={"sql": "SELECT 1", "dataset_ids": []},
            )
            assert rejected_sql.status_code == 503
        finally:
            set_shutting_down(False)

    def test_metrics_token_authorization(self, client: TestClient) -> None:
        orig_tok = settings.metrics_token
        settings.metrics_token = "super-secret-scrape-token"
        try:
            unauth = client.get("/api/v1/metrics")
            assert unauth.status_code == 401

            bad = client.get("/api/v1/metrics", headers={"X-Metrics-Token": "wrong"})
            assert bad.status_code == 403

            good = client.get("/api/v1/metrics", headers={"X-Metrics-Token": "super-secret-scrape-token"})
            assert good.status_code == 200
            assert "datasense_http_requests_total" in good.text
        finally:
            settings.metrics_token = orig_tok

    def test_log_redaction_strips_secrets_and_db_passwords(self) -> None:
        raw = (
            'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig '
            'google_api_key="AIzaSyDummyKey1234567890ABCD" '
            'url=postgresql+psycopg://datasense:MyUltraSecretPw@db:5432/prod'
        )
        redacted = redact_sensitive_text(raw)
        assert "eyJhbGciOiJIUzI1NiJ9" not in redacted
        assert "AIzaSyDummyKey1234567890ABCD" not in redacted
        assert "MyUltraSecretPw" not in redacted
        assert "[REDACTED]" in redacted


class TestEndToEndWorkflowJourney:
    """Offline integrated E2E check spanning Register -> Project -> Upload -> SQL -> Mocked AI -> Admin."""

    def test_end_to_end_core_workflow(
        self, client: TestClient, db: Session, register_user, tmp_path: Path
    ) -> None:
        orig_root = default_storage.root_dir
        default_storage.root_dir = tmp_path.resolve()
        try:
            self._run_e2e_journey(client, db, register_user)
        finally:
            default_storage.root_dir = orig_root

    def _run_e2e_journey(self, client: TestClient, db: Session, register_user) -> None:
        reg = register_user(email="e2e@example.com", organization_name="E2E Workspace")
        assert reg["response"].status_code == 201
        token = reg["data"]["access_token"]
        headers = _auth_headers(token)

        # Create project
        proj_resp = client.post(
            "/api/v1/projects",
            headers=headers,
            json={"name": "E2E Revenue Analytics", "description": "Phase 7 verification"},
        )
        assert proj_resp.status_code == 201
        project_id = proj_resp.json()["id"]

        # Upload CSV dataset and process synchronously against test DB
        csv_bytes = b"region,revenue,units\nNorth,1200.5,4\nSouth,850.0,3\nNorth,400.0,2\n"
        up_resp = client.post(
            f"/api/v1/projects/{project_id}/datasets",
            headers=headers,
            files={"file": ("e2e_sales.csv", csv_bytes, "text/csv")},
        )
        assert up_resp.status_code == 202
        dataset_id = up_resp.json()["dataset_id"]
        job_id = up_resp.json()["job_id"]
        process_dataset_ingestion(uuid.UUID(job_id), lambda: db)

        # Verify ingestion completed and catalog shows the dataset
        ds_detail = client.get(f"/api/v1/datasets/{dataset_id}", headers=headers)
        assert ds_detail.status_code == 200
        assert ds_detail.json()["status"] == "ready"

        catalog = client.get(f"/api/v1/projects/{project_id}/query/catalog", headers=headers)
        assert catalog.status_code == 200
        datasets = catalog.json()["datasets"]
        assert len(datasets) == 1
        table_name = datasets[0]["tables"][0]["qualified_name"]

        # Execute deterministic analytical SQL
        sql_resp = client.post(
            f"/api/v1/projects/{project_id}/query/execute",
            headers=headers,
            json={
                "sql": f"SELECT region, SUM(revenue) AS total_rev FROM {table_name} GROUP BY region ORDER BY total_rev DESC",
                "dataset_ids": [dataset_id],
            },
        )
        assert sql_resp.status_code == 200
        rows = sql_resp.json()["rows"]
        assert rows[0][0] == "North"
        assert float(rows[0][1]) == 1600.5

        # Acknowledge AI privacy and run mocked Gemini copilot message without live calls
        ack = client.post("/api/v1/ai/privacy/acknowledge", headers=headers)
        assert ack.status_code == 200 and ack.json()["acknowledged"] is True

        conv = client.post(
            f"/api/v1/projects/{project_id}/ai/conversations",
            headers=headers,
            json={"title": "E2E Copilot", "dataset_ids": [dataset_id]},
        )
        assert conv.status_code == 201
        conv_id = conv.json()["id"]

        class FakeStructuredLLM:
            def with_structured_output(self, schema):
                class Runner:
                    def invoke(self_inner, messages):
                        return schema(
                            response_type=ResponseType.SQL_QUERY,
                            message="North leads total revenue at 1,600.50.",
                            generated_sql=f"SELECT region, SUM(revenue) AS total_rev FROM {table_name} GROUP BY region",
                            sql_explanation="Aggregates revenue grouped by region.",
                            assumptions=["Revenue summed cleanly per region"],
                            requires_clarification=False,
                            clarification_question=None,
                            visualization_recommendation=VisualizationRecommendation(
                                chart_type="bar", x_axis="region", y_axis="total_rev", title="Revenue by Region"
                            ),
                            suggested_follow_up_questions=["Break down by units sold"],
                        )
                return Runner()

        LLMFactory.set_mock_model(FakeStructuredLLM())
        try:
            with patch.object(settings, "google_api_key", None):
                msg_resp = client.post(
                    f"/api/v1/projects/{project_id}/ai/conversations/{conv_id}/messages",
                    headers=headers,
                    json={"message": "Which region has highest revenue?"},
                )
            assert msg_resp.status_code == 200
            body = msg_resp.json()
            assert body["sql_validation_status"] == "valid"
            assert "North leads" in body["content"]
        finally:
            LLMFactory.set_mock_model(None)

        # Admin observability reflects recorded query execution
        obs = client.get("/api/v1/admin/observability", headers=headers)
        assert obs.status_code == 200
        assert obs.json()["metrics"]["query_executions"] >= 1
        assert obs.json()["dependencies"]["duckdb"] == "ok"
