"""Phase 7 schema: rate_limit_buckets and performance indexes

Revision ID: 0006_phase7_hardening_indexes
Revises: 0005_phase6_multi_agent_schema
Create Date: 2026-11-25 13:25:00.000000+00:00

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0006_phase7_hardening_indexes"
down_revision: str | None = "0005_phase6_multi_agent_schema"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "rate_limit_buckets",
        sa.Column("key", sa.String(length=255), primary_key=True),
        sa.Column("window_start", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("count", sa.Integer(), server_default="1", nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_rate_limit_buckets_expires_at", "rate_limit_buckets", ["expires_at"])

    # Additional access-pattern indexes verified against Phases 2-6
    op.create_index("ix_auth_sessions_expires_at", "auth_sessions", ["expires_at"])
    op.create_index("ix_query_runs_org_created", "query_runs", ["organization_id", "created_at"])
    op.create_index("ix_analysis_reports_org_created", "analysis_reports", ["organization_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_analysis_reports_org_created", table_name="analysis_reports")
    op.drop_index("ix_query_runs_org_created", table_name="query_runs")
    op.drop_index("ix_auth_sessions_expires_at", table_name="auth_sessions")
    op.drop_table("rate_limit_buckets")
