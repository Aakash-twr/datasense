"""Phase 4 schema: query_runs, saved_queries

Revision ID: 0003_phase4_analytics_schema
Revises: 0002_phase3_datasets_schema
Create Date: 2026-11-24 18:25:00.000000+00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0003_phase4_analytics_schema"
down_revision: Union[str, None] = "0002_phase3_datasets_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Portable types
UUID_TYPE = sa.UUID(as_uuid=True)
JSONB_TYPE = sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql")


def upgrade() -> None:
    # 1. Query Runs table
    op.create_table(
        "query_runs",
        sa.Column("id", UUID_TYPE, primary_key=True),
        sa.Column("organization_id", UUID_TYPE, sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("project_id", UUID_TYPE, sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", UUID_TYPE, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sql_query", sa.Text(), nullable=False),
        sa.Column("selected_dataset_ids", JSONB_TYPE, server_default="[]", nullable=False),
        sa.Column("status", sa.String(length=50), server_default="pending", nullable=False),
        sa.Column("execution_time_ms", sa.Float(), nullable=True),
        sa.Column("returned_row_count", sa.Integer(), nullable=True),
        sa.Column("error_summary", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
    )
    op.create_index("ix_query_runs_organization_id", "query_runs", ["organization_id"])
    op.create_index("ix_query_runs_project_id", "query_runs", ["project_id"])
    op.create_index("ix_query_runs_user_id", "query_runs", ["user_id"])
    op.create_index("ix_query_runs_status", "query_runs", ["status"])
    op.create_index("ix_query_runs_project_created", "query_runs", ["project_id", "created_at"])
    op.create_index("ix_query_runs_user_created", "query_runs", ["user_id", "created_at"])

    # 2. Saved Queries table
    op.create_table(
        "saved_queries",
        sa.Column("id", UUID_TYPE, primary_key=True),
        sa.Column("organization_id", UUID_TYPE, sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("project_id", UUID_TYPE, sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", UUID_TYPE, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("sql_query", sa.Text(), nullable=False),
        sa.Column("selected_dataset_ids", JSONB_TYPE, server_default="[]", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
    )
    op.create_index("ix_saved_queries_organization_id", "saved_queries", ["organization_id"])
    op.create_index("ix_saved_queries_project_id", "saved_queries", ["project_id"])
    op.create_index("ix_saved_queries_user_id", "saved_queries", ["user_id"])
    op.create_index("ix_saved_queries_project_created", "saved_queries", ["project_id", "created_at"])
    op.create_index("ix_saved_queries_user_name", "saved_queries", ["user_id", "name"])


def downgrade() -> None:
    op.drop_table("saved_queries")
    op.drop_table("query_runs")
