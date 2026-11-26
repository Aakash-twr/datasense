"""Phase 6 schema: agent_runs, agent_run_steps, agent_run_evidence, analysis_reports

Revision ID: 0005_phase6_multi_agent_schema
Revises: 0004_phase5_ai_copilot_schema
Create Date: 2026-11-25 12:35:00.000000+00:00

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0005_phase6_multi_agent_schema"
down_revision: str | None = "0004_phase5_ai_copilot_schema"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UUID_TYPE = sa.UUID(as_uuid=True)
JSONB_TYPE = sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql")


def upgrade() -> None:
    # 1. Agent Runs table
    op.create_table(
        "agent_runs",
        sa.Column("id", UUID_TYPE, primary_key=True),
        sa.Column("organization_id", UUID_TYPE, sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("project_id", UUID_TYPE, sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", UUID_TYPE, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("conversation_id", UUID_TYPE, sa.ForeignKey("ai_conversations.id", ondelete="SET NULL"), nullable=True),
        sa.Column("thread_id", sa.String(length=128), nullable=False, unique=True),
        sa.Column("workflow_type", sa.String(length=64), server_default="deep_analysis", nullable=False),
        sa.Column("user_request", sa.Text(), nullable=False),
        sa.Column("selected_dataset_ids", JSONB_TYPE, server_default="[]", nullable=False),
        sa.Column("dataset_version_snapshot", JSONB_TYPE, server_default="{}", nullable=False),
        sa.Column("share_aggregate_summaries", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("status", sa.String(length=32), server_default="pending", nullable=False),
        sa.Column("current_step", sa.String(length=100), nullable=True),
        sa.Column("approval_status", sa.String(length=32), server_default="not_required", nullable=False),
        sa.Column("approval_hash", sa.String(length=128), nullable=True),
        sa.Column("approval_payload", JSONB_TYPE, nullable=True),
        sa.Column("approved_query_indices", JSONB_TYPE, server_default="[]", nullable=False),
        sa.Column("llm_calls_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("sql_queries_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("token_usage", JSONB_TYPE, nullable=True),
        sa.Column("result_summary", JSONB_TYPE, nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_ms", sa.Float(), nullable=True),
        sa.Column("error_code", sa.String(length=64), nullable=True),
        sa.Column("error_summary", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
    )
    op.create_index("ix_agent_runs_organization_id", "agent_runs", ["organization_id"])
    op.create_index("ix_agent_runs_project_id", "agent_runs", ["project_id"])
    op.create_index("ix_agent_runs_user_id", "agent_runs", ["user_id"])
    op.create_index("ix_agent_runs_conversation_id", "agent_runs", ["conversation_id"])
    op.create_index("ix_agent_runs_thread_id", "agent_runs", ["thread_id"], unique=True)
    op.create_index("ix_agent_runs_workflow_type", "agent_runs", ["workflow_type"])
    op.create_index("ix_agent_runs_status", "agent_runs", ["status"])
    op.create_index("ix_agent_runs_org_proj_status", "agent_runs", ["organization_id", "project_id", "status"])
    op.create_index("ix_agent_runs_user_created", "agent_runs", ["user_id", "created_at"])

    # 2. Agent Run Steps table
    op.create_table(
        "agent_run_steps",
        sa.Column("id", UUID_TYPE, primary_key=True),
        sa.Column("agent_run_id", UUID_TYPE, sa.ForeignKey("agent_runs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("agent_name", sa.String(length=64), nullable=False),
        sa.Column("step_name", sa.String(length=100), nullable=False),
        sa.Column("status", sa.String(length=32), server_default="pending", nullable=False),
        sa.Column("sequence_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_ms", sa.Float(), nullable=True),
        sa.Column("input_summary", JSONB_TYPE, nullable=True),
        sa.Column("output_summary", JSONB_TYPE, nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
    )
    op.create_index("ix_agent_run_steps_agent_run_id", "agent_run_steps", ["agent_run_id"])
    op.create_index("ix_agent_run_steps_run_seq", "agent_run_steps", ["agent_run_id", "sequence_order"])

    # 3. Agent Run Evidence table
    op.create_table(
        "agent_run_evidence",
        sa.Column("id", UUID_TYPE, primary_key=True),
        sa.Column("agent_run_id", UUID_TYPE, sa.ForeignKey("agent_runs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("query_run_id", UUID_TYPE, sa.ForeignKey("query_runs.id", ondelete="SET NULL"), nullable=True),
        sa.Column("dataset_id", UUID_TYPE, sa.ForeignKey("datasets.id", ondelete="SET NULL"), nullable=True),
        sa.Column("dataset_version_id", UUID_TYPE, sa.ForeignKey("dataset_versions.id", ondelete="SET NULL"), nullable=True),
        sa.Column("evidence_type", sa.String(length=64), nullable=False),
        sa.Column("evidence_reference", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
    )
    op.create_index("ix_agent_run_evidence_agent_run_id", "agent_run_evidence", ["agent_run_id"])
    op.create_index("ix_agent_run_evidence_query_run_id", "agent_run_evidence", ["query_run_id"])
    op.create_index("ix_agent_run_evidence_run_type", "agent_run_evidence", ["agent_run_id", "evidence_type"])

    # 4. Analysis Reports table
    op.create_table(
        "analysis_reports",
        sa.Column("id", UUID_TYPE, primary_key=True),
        sa.Column("organization_id", UUID_TYPE, sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("project_id", UUID_TYPE, sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", UUID_TYPE, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("agent_run_id", UUID_TYPE, sa.ForeignKey("agent_runs.id", ondelete="SET NULL"), nullable=True),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("workflow_type", sa.String(length=64), server_default="deep_analysis", nullable=False),
        sa.Column("report_json", JSONB_TYPE, server_default="{}", nullable=False),
        sa.Column("report_markdown", sa.Text(), server_default="", nullable=False),
        sa.Column("evidence_references", JSONB_TYPE, server_default="[]", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
    )
    op.create_index("ix_analysis_reports_organization_id", "analysis_reports", ["organization_id"])
    op.create_index("ix_analysis_reports_project_id", "analysis_reports", ["project_id"])
    op.create_index("ix_analysis_reports_user_id", "analysis_reports", ["user_id"])
    op.create_index("ix_analysis_reports_agent_run_id", "analysis_reports", ["agent_run_id"])
    op.create_index("ix_analysis_reports_org_proj", "analysis_reports", ["organization_id", "project_id"])


def downgrade() -> None:
    op.drop_table("analysis_reports")
    op.drop_table("agent_run_evidence")
    op.drop_table("agent_run_steps")
    op.drop_table("agent_runs")
