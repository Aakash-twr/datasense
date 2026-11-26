"""Phase 5 schema: ai_conversations, ai_messages, users.ai_privacy_acknowledged_at

Revision ID: 0004_phase5_ai_copilot_schema
Revises: 0003_phase4_analytics_schema
Create Date: 2026-11-24 19:45:00.000000+00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0004_phase5_ai_copilot_schema"
down_revision: Union[str, None] = "0003_phase4_analytics_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Portable types
UUID_TYPE = sa.UUID(as_uuid=True)
JSONB_TYPE = sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql")


def upgrade() -> None:
    # 1. Add ai_privacy_acknowledged_at to users
    op.add_column(
        "users",
        sa.Column("ai_privacy_acknowledged_at", sa.DateTime(timezone=True), nullable=True),
    )

    # 2. AI Conversations table
    op.create_table(
        "ai_conversations",
        sa.Column("id", UUID_TYPE, primary_key=True),
        sa.Column("organization_id", UUID_TYPE, sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("project_id", UUID_TYPE, sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", UUID_TYPE, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(length=255), server_default="New Analytics Chat", nullable=False),
        sa.Column("selected_dataset_ids", JSONB_TYPE, server_default="[]", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
    )
    op.create_index("ix_ai_conversations_organization_id", "ai_conversations", ["organization_id"])
    op.create_index("ix_ai_conversations_project_id", "ai_conversations", ["project_id"])
    op.create_index("ix_ai_conversations_user_id", "ai_conversations", ["user_id"])
    op.create_index("ix_ai_conversations_org_proj", "ai_conversations", ["organization_id", "project_id"])

    # 3. AI Messages table
    op.create_table(
        "ai_messages",
        sa.Column("id", UUID_TYPE, primary_key=True),
        sa.Column("conversation_id", UUID_TYPE, sa.ForeignKey("ai_conversations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.String(length=20), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("structured_metadata", JSONB_TYPE, nullable=True),
        sa.Column("generated_sql", sa.Text(), nullable=True),
        sa.Column("sql_explanation", sa.Text(), nullable=True),
        sa.Column("sql_validation_status", sa.String(length=50), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
    )
    op.create_index("ix_ai_messages_conversation_id", "ai_messages", ["conversation_id"])
    op.create_index("ix_ai_messages_conv_created", "ai_messages", ["conversation_id", "created_at"])


def downgrade() -> None:
    op.drop_table("ai_messages")
    op.drop_table("ai_conversations")
    op.drop_column("users", "ai_privacy_acknowledged_at")
