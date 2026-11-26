"""Tests for Phase 5 Gemini-Powered AI Analytics Copilot:
LangChain integration, LLM factory, context generation, NL-to-SQL generation,
safety guardrails, conversation history, insights, and API endpoints.
"""

from __future__ import annotations

import io
import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.ai.exceptions import (
    AIConfigurationError,
    AIQuotaExceededError,
    AIRateLimitExceededError,
    AIServiceUnavailableError,
    AITimeoutError,
)
from app.ai.llm_factory import LLMFactory
from app.ai.schemas.ai_response import (
    AICopilotResponse,
    ResponseType,
    VisualizationRecommendation,
)
from app.ai.services.context_service import ContextService
from app.ai.services.explanation_service import SQLExplanationService
from app.ai.services.insight_service import InsightService
from app.ai.services.sql_generation_service import SQLGenerationService
from app.analytics.schemas import (
    CatalogDataset,
    CatalogResponse,
    CatalogTable,
    CatalogTableColumn,
)
from app.core.config import settings
from app.ingestion.jobs.ingestion_service import process_dataset_ingestion


class MockStructuredChatModel:
    """Mock LangChain chat model for testing structured outputs without real API calls."""

    def __init__(self, response: Any = None, raise_exc: Exception | None = None):
        self.response = response
        self.raise_exc = raise_exc
        self.invoked_messages: list[Any] = []

    def with_structured_output(self, schema: Any) -> MockStructuredChatModel:
        return self

    def invoke(self, messages: list[Any]) -> Any:
        self.invoked_messages = messages
        if self.raise_exc:
            raise self.raise_exc
        return self.response


def _create_auth_headers(client: TestClient, register_user, email: str, org_name: str) -> tuple[dict[str, str], str]:
    reg = register_user(email=email, organization_name=org_name)
    token = reg["data"]["access_token"]
    me_resp = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    org_id = me_resp.json()["current_organization"]["organization_id"]
    return {"Authorization": f"Bearer {token}"}, org_id


# ==============================================================================
# 1. LLM Factory & Error Handling Unit Tests
# ==============================================================================


class TestLLMFactory:
    """Tests for model creation, configuration validation, and error translation."""

    def test_missing_api_key_raises_configuration_error(self, monkeypatch) -> None:
        LLMFactory.set_mock_model(None)
        monkeypatch.setattr(settings, "google_api_key", None)
        monkeypatch.setattr(settings, "ai_enabled", True)

        with pytest.raises(AIConfigurationError) as exc_info:
            LLMFactory.get_model()
        assert "Google Gemini API key is not configured" in str(exc_info.value)

    def test_disabled_ai_raises_configuration_error(self, monkeypatch) -> None:
        LLMFactory.set_mock_model(None)
        monkeypatch.setattr(settings, "ai_enabled", False)

        with pytest.raises(AIConfigurationError) as exc_info:
            LLMFactory.get_model()
        assert "disabled in application settings" in str(exc_info.value)

    def test_mock_injection_returns_mock(self) -> None:
        mock_model = MockStructuredChatModel()
        LLMFactory.set_mock_model(mock_model)
        assert LLMFactory.get_model() is mock_model
        LLMFactory.set_mock_model(None)

    def test_provider_error_translation(self) -> None:
        # Rate limit translation
        with pytest.raises(AIRateLimitExceededError):
            LLMFactory.handle_provider_exception(Exception("Resource_Exhausted: Too Many Requests (Rate limit)"))

        # Quota translation
        with pytest.raises(AIQuotaExceededError):
            LLMFactory.handle_provider_exception(Exception("Resource_Exhausted: Quota exceeded for project"))

        # Timeout translation
        with pytest.raises(AITimeoutError):
            LLMFactory.handle_provider_exception(Exception("Deadline_Exceeded: Request timed out"))

        # High-demand 503 should translate to transient AIServiceUnavailableError, not model-not-found
        with pytest.raises(AIServiceUnavailableError):
            LLMFactory.handle_provider_exception(
                Exception("503 UNAVAILABLE: This model is currently experiencing high demand.")
            )

        # 404 model not found should translate to AIConfigurationError
        with pytest.raises(AIConfigurationError):
            LLMFactory.handle_provider_exception(
                Exception("404 NOT_FOUND: models/gemini-1.5-flash is not found")
            )


# ==============================================================================
# 2. Context Service Unit Tests
# ==============================================================================


class TestContextService:
    """Tests that schema context accurately extracts tables and never leaks row data."""

    def test_build_schema_context_and_privacy(self) -> None:
        svc = ContextService(max_tables=10, max_columns=50)
        catalog = CatalogResponse(
            project_id=uuid.uuid4(),
            datasets=[
                CatalogDataset(
                    dataset_id=uuid.uuid4(),
                    dataset_name="E-Commerce Sales",
                    schema_name="ecommerce_sales",
                    version_id=uuid.uuid4(),
                    version_number=1,
                    source_format="csv",
                    tables=[
                        CatalogTable(
                            table_name="orders",
                            schema_name="ecommerce_sales",
                            qualified_name="ecommerce_sales.orders",
                            display_name="orders",
                            row_count=1500,
                            column_count=3,
                            columns=[
                                CatalogTableColumn(
                                    name="order_id",
                                    display_name="order_id",
                                    data_type="INTEGER",
                                    canonical_type="INTEGER",
                                    is_nullable=False,
                                    is_sensitive=False,
                                    sensitivity_category=None,
                                ),
                                CatalogTableColumn(
                                    name="customer_email",
                                    display_name="customer_email",
                                    data_type="VARCHAR",
                                    canonical_type="STRING",
                                    is_nullable=True,
                                    is_sensitive=True,
                                    sensitivity_category="EMAIL",
                                ),
                            ],
                        )
                    ],
                )
            ],
        )

        context_text = svc.build_schema_context(catalog)

        # Context contains metadata
        assert "E-Commerce Sales" in context_text
        assert "orders" in context_text
        assert "order_id: INTEGER" in context_text
        assert "customer_email: STRING (nullable) [Sensitive: EMAIL]" in context_text

        # Privacy guarantee: no row values, passwords, or raw file dumps
        assert "secret" not in context_text.lower()
        assert "jane@example.com" not in context_text

        # Allowed tables extraction
        allowed = svc.get_allowed_tables(catalog)
        assert "orders" in allowed
        assert "ecommerce_sales.orders" in allowed


# ==============================================================================
# 3. Natural Language to SQL Generation & Safety Guardrail Tests
# ==============================================================================


class TestSQLGenerationService:
    """Tests generation, AST validation, repair attempts, and malicious SQL rejection."""

    def test_valid_sql_generation(self) -> None:
        expected_response = AICopilotResponse(
            response_type=ResponseType.SQL_QUERY,
            message="Here is the total sales by product category.",
            generated_sql="SELECT category, SUM(amount) AS total_sales FROM sales.orders GROUP BY category ORDER BY total_sales DESC LIMIT 10",
            sql_explanation="Aggregates sales revenue by category in descending order.",
            assumptions=["Assuming completed orders only"],
            requires_clarification=False,
            visualization_recommendation=VisualizationRecommendation(
                chart_type="bar",
                x_axis="category",
                y_axis="total_sales",
                title="Total Sales by Category",
            ),
            suggested_follow_up_questions=["Which category had the highest growth?"],
        )

        mock_llm = MockStructuredChatModel(response=expected_response)
        LLMFactory.set_mock_model(mock_llm)

        svc = SQLGenerationService()
        res, status_val = svc.generate_analytical_response(
            question="Show top categories by revenue",
            schema_context="Table: orders in sales",
            allowed_tables=["orders", "sales.orders"],
        )

        assert res.response_type == ResponseType.SQL_QUERY
        assert status_val == "valid"
        assert "SELECT category" in res.generated_sql

        LLMFactory.set_mock_model(None)

    def test_rejection_of_destructive_and_forbidden_sql(self) -> None:
        malicious_queries = [
            "DROP TABLE orders",
            "DELETE FROM orders WHERE id = 1",
            "UPDATE orders SET amount = 0",
            "SELECT * FROM read_parquet('/etc/passwd')",
            "SELECT * FROM unauthorized_table",
        ]

        for mal_sql in malicious_queries:
            mock_llm = MockStructuredChatModel(
                response=AICopilotResponse(
                    response_type=ResponseType.SQL_QUERY,
                    message="Malicious draft",
                    generated_sql=mal_sql,
                )
            )
            LLMFactory.set_mock_model(mock_llm)

            svc = SQLGenerationService()
            res, status_val = svc.generate_analytical_response(
                question="Run query",
                schema_context="Table: orders",
                allowed_tables=["orders"],
            )

            # Destructive or unauthorized queries must NOT receive 'valid' status
            assert status_val != "valid"
            assert status_val == "invalid"

        LLMFactory.set_mock_model(None)

    def test_controlled_repair_attempt(self) -> None:
        # First return invalid SQL, then return valid repaired SQL on second invocation
        invalid_resp = AICopilotResponse(
            response_type=ResponseType.SQL_QUERY,
            message="Initial draft",
            generated_sql="SELECT * FROM unknown_table",
        )
        valid_repaired_resp = AICopilotResponse(
            response_type=ResponseType.SQL_QUERY,
            message="Repaired draft",
            generated_sql="SELECT id, amount FROM orders LIMIT 10",
        )

        class RepairMockModel:
            def __init__(self):
                self.calls = 0

            def with_structured_output(self, schema):
                return self

            def invoke(self, messages):
                self.calls += 1
                if self.calls == 1:
                    return invalid_resp
                return valid_repaired_resp

        repair_model = RepairMockModel()
        LLMFactory.set_mock_model(repair_model)

        svc = SQLGenerationService()
        res, status_val = svc.generate_analytical_response(
            question="Show orders",
            schema_context="Table: orders",
            allowed_tables=["orders"],
        )

        assert repair_model.calls == 2  # exactly 1 repair attempt
        assert status_val == "repaired"
        assert res.generated_sql == "SELECT id, amount FROM orders LIMIT 10"

        LLMFactory.set_mock_model(None)


# ==============================================================================
# 4. Insights & Explanations Unit Tests
# ==============================================================================


def test_heuristic_insights_and_explanations(monkeypatch) -> None:
    LLMFactory.set_mock_model(None)
    monkeypatch.setattr(settings, "google_api_key", None)
    catalog = CatalogResponse(
        project_id=uuid.uuid4(),
        datasets=[
            CatalogDataset(
                dataset_id=uuid.uuid4(),
                dataset_name="Sales",
                schema_name="sales",
                version_id=uuid.uuid4(),
                version_number=1,
                source_format="csv",
                tables=[
                    CatalogTable(
                        table_name="orders",
                        schema_name="sales",
                        qualified_name="sales.orders",
                        display_name="orders",
                        row_count=1000,
                        column_count=3,
                        columns=[
                            CatalogTableColumn(
                                name="order_date",
                                display_name="order_date",
                                data_type="DATE",
                                canonical_type="DATE",
                                is_nullable=False,
                                is_sensitive=False,
                            ),
                            CatalogTableColumn(
                                name="category",
                                display_name="category",
                                data_type="VARCHAR",
                                canonical_type="STRING",
                                is_nullable=False,
                                is_sensitive=False,
                            ),
                            CatalogTableColumn(
                                name="revenue",
                                display_name="revenue",
                                data_type="FLOAT",
                                canonical_type="FLOAT",
                                is_nullable=False,
                                is_sensitive=False,
                            ),
                        ],
                    )
                ],
            )
        ],
    )

    insight_svc = InsightService()
    insights = insight_svc.generate_insights(catalog)
    assert len(insights) == 1
    assert len(insights[0].insights) >= 2
    assert any(i.category in ("trends", "segmentation", "overview") for i in insights[0].insights)

    explain_svc = SQLExplanationService()
    exp = explain_svc.explain_sql(
        sql="SELECT category, SUM(revenue) FROM orders WHERE revenue > 50 GROUP BY category",
        allowed_tables=["orders"],
    )
    assert "orders" in exp.accessed_tables
    assert len(exp.explanation) > 0


# ==============================================================================
# 5. Full End-to-End API Integration Tests
# ==============================================================================


def test_ai_status_and_privacy_acknowledgment(client: TestClient, register_user) -> None:
    headers, org_id = _create_auth_headers(client, register_user, "copilot_user@example.com", "Copilot Corp")

    # 1. Get status - initially privacy not acknowledged
    resp = client.get("/api/v1/ai/status", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["enabled"] is True
    assert data["privacy_acknowledged"] is False

    # 2. Acknowledge privacy
    ack_resp = client.post("/api/v1/ai/privacy/acknowledge", headers=headers)
    assert ack_resp.status_code == 200
    assert ack_resp.json()["acknowledged"] is True

    # 3. Status now reflects acknowledged
    resp_after = client.get("/api/v1/ai/status", headers=headers)
    assert resp_after.status_code == 200
    assert resp_after.json()["privacy_acknowledged"] is True


def test_ai_conversation_lifecycle_and_prompting(client: TestClient, register_user, db: Session) -> None:
    headers, org_id = _create_auth_headers(client, register_user, "analyst_chat@example.com", "Chat Corp")

    # Acknowledge privacy first
    client.post("/api/v1/ai/privacy/acknowledge", headers=headers)

    # Create project
    proj_resp = client.post("/api/v1/projects", json={"name": "Retail Intelligence"}, headers=headers)
    project_id = proj_resp.json()["id"]

    # Ingest a real sample dataset so catalog has tables
    csv_data = b"order_id,category,amount\n1,Electronics,120.5\n2,Furniture,450.0\n3,Electronics,99.9\n"
    up_resp = client.post(
        f"/api/v1/projects/{project_id}/datasets",
        files={"file": ("sales.csv", io.BytesIO(csv_data), "text/csv")},
        data={"dataset_name": "Retail Sales"},
        headers=headers,
    )
    assert up_resp.status_code == 202
    dataset_id = up_resp.json()["dataset_id"]
    job_id = up_resp.json()["job_id"]
    process_dataset_ingestion(uuid.UUID(job_id), lambda: db)

    # 1. Create AI Conversation
    conv_resp = client.post(
        f"/api/v1/projects/{project_id}/ai/conversations",
        json={"title": "Q3 Sales Review", "dataset_ids": [dataset_id]},
        headers=headers,
    )
    assert conv_resp.status_code == 201
    conv_data = conv_resp.json()
    conv_id = conv_data["id"]
    assert conv_data["title"] == "Q3 Sales Review"

    # 2. List Conversations
    list_resp = client.get(f"/api/v1/projects/{project_id}/ai/conversations", headers=headers)
    assert list_resp.status_code == 200
    assert list_resp.json()["total"] == 1

    # 3. Inject mock LLM response
    mock_resp = AICopilotResponse(
        response_type=ResponseType.SQL_QUERY,
        message="Here is the total sales grouped by category.",
        generated_sql="SELECT category, SUM(amount) AS total FROM retail_sales.sales GROUP BY category",
        sql_explanation="Calculates sum of amount grouped by category.",
        assumptions=["Using all transactions"],
        requires_clarification=False,
        suggested_follow_up_questions=["Which item was the top seller?"],
    )
    LLMFactory.set_mock_model(MockStructuredChatModel(response=mock_resp))

    # 4. Send Message to Copilot
    msg_resp = client.post(
        f"/api/v1/projects/{project_id}/ai/conversations/{conv_id}/messages",
        json={"message": "Show total sales by category"},
        headers=headers,
    )
    assert msg_resp.status_code == 200
    msg_data = msg_resp.json()
    assert msg_data["role"] == "assistant"
    assert "total sales grouped by category" in msg_data["content"]
    assert "SELECT category" in msg_data["generated_sql"]
    assert msg_data["sql_validation_status"] == "valid"

    # 5. Retrieve conversation details and verify history persisted
    detail_resp = client.get(f"/api/v1/projects/{project_id}/ai/conversations/{conv_id}", headers=headers)
    assert detail_resp.status_code == 200
    messages = detail_resp.json()["messages"]
    assert len(messages) == 2  # 1 user, 1 assistant
    assert messages[0]["role"] == "user"
    assert messages[1]["role"] == "assistant"

    # 6. Delete conversation
    del_resp = client.delete(f"/api/v1/projects/{project_id}/ai/conversations/{conv_id}", headers=headers)
    assert del_resp.status_code == 204

    # Verification: conversation gone
    get_gone = client.get(f"/api/v1/projects/{project_id}/ai/conversations/{conv_id}", headers=headers)
    assert get_gone.status_code == 404

    LLMFactory.set_mock_model(None)


def test_cross_tenant_ai_isolation(client: TestClient, register_user) -> None:
    """Verifies that Org B cannot view or post messages to Org A's AI conversations."""
    headers_a, _ = _create_auth_headers(client, register_user, "tenant_a_user@example.com", "Tenant A Corp")
    headers_b, _ = _create_auth_headers(client, register_user, "tenant_b_user@example.com", "Tenant B Corp")

    client.post("/api/v1/ai/privacy/acknowledge", headers=headers_a)
    client.post("/api/v1/ai/privacy/acknowledge", headers=headers_b)

    proj_a = client.post("/api/v1/projects", json={"name": "Secret Project A"}, headers=headers_a).json()["id"]
    conv_a = client.post(
        f"/api/v1/projects/{proj_a}/ai/conversations",
        json={"title": "Private Strategy"},
        headers=headers_a,
    ).json()["id"]

    # Tenant B tries to access Tenant A's conversation -> 403 or 404
    forbidden_get = client.get(f"/api/v1/projects/{proj_a}/ai/conversations/{conv_a}", headers=headers_b)
    assert forbidden_get.status_code in (403, 404)

    forbidden_post = client.post(
        f"/api/v1/projects/{proj_a}/ai/conversations/{conv_a}/messages",
        json={"message": "Infiltrating conversation"},
        headers=headers_b,
    )
    assert forbidden_post.status_code in (403, 404)
