# Database Schema Reference

> **Target Engine**: PostgreSQL 14+ (`psycopg` 3 driver) with local SQLite compatibility via `PortableJSON`  
> **Migrations**: Alembic `0001` through `0006` (`services/api/alembic/versions/`)  
> **Primary Keys**: UUID v4 across domain entities (plus string key on `rate_limit_buckets`)

---

## 1. Relational Schema Summary

For the visual Entity Relationship Diagram, see [Architecture Diagrams — F. Database ER Diagram](../architecture.md#f-database-entity-relationship-diagram).

### Identity & Workspace Core (`0001_initial_phase2_schema.py`)
- **`users`**: `id` (UUID PK), `name`, `email` (unique indexed), `password_hash` (Argon2), `avatar_url`, `is_active`, `ai_privacy_acknowledged_at`, `created_at`, `updated_at`.
- **`organizations`**: `id` (UUID PK), `name`, `slug` (unique indexed), `owner_id` (FK `users.id`), timestamps.
- **`memberships`**: `id` (UUID PK), `organization_id` (FK), `user_id` (FK), `role` (`owner | admin | analyst | viewer`), unique `(organization_id, user_id)`.
- **`auth_sessions`**: `id` (UUID PK), `user_id` (FK), `refresh_token_hash` (SHA-256 unique), `expires_at` (indexed in `0006`), `revoked_at`, `created_at`.
- **`projects`**: `id` (UUID PK), `organization_id` (FK), `name`, `description`, `created_by` (FK `users.id`), `settings` (JSON), `archived_at`, timestamps.

### Datasets & Ingestion (`0002_phase3_datasets_schema.py`)
- **`datasets`**: `id` (UUID PK), `project_id` (FK), `name`, `description`, `created_by`, `status` (`pending | processing | ready | error | archived`), `active_version_id`, `archived_at`, timestamps.
- **`dataset_versions`**: `id` (UUID PK), `dataset_id` (FK), `version_number`, `checksum`, `file_size_bytes`, `total_row_count`, `total_column_count`, `source_format`, `original_filename`, `storage_key`, `status`, `is_active`.
- **`data_tables`**: `id` (UUID PK), `dataset_version_id` (FK), `table_name` (normalized SQL identifier), `original_table_name`, `storage_key`, `row_count`, `column_count`, `schema_metadata` (JSON), `profile_metadata` (JSON).
- **`data_columns`**: `id` (UUID PK), `data_table_id` (FK), `column_name`, `physical_name`, `data_type`, `ordinal_position`, `nullable`, `unique_count`, `null_count`, `null_percentage`, `semantic_type`, `pii_category`, `pii_confidence`, `profile_stats` (JSON).
- **`ingestion_jobs`**: `id` (UUID PK), `dataset_id`, `dataset_version_id`, `status`, `current_stage`, `progress_percentage`, `status_message`, `error_code`, `error_message`, `started_at`, `completed_at`.

### SQL Analytics (`0003_phase4_analytics_schema.py`)
- **`query_runs`**: `id` (UUID PK), `organization_id`, `project_id`, `user_id`, `sql_query`, `selected_dataset_ids` (JSON list), `status` (`pending | running | success | failed | cancelled`), `execution_time_ms`, `returned_row_count`, `error_summary`, `created_at`. Indexed on `(organization_id, created_at)` in `0006`.
- **`saved_queries`**: `id` (UUID PK), `organization_id`, `project_id`, `user_id`, `name`, `description`, `sql_query`, `selected_dataset_ids`, timestamps.

### AI Analytics Copilot (`0004_phase5_ai_copilot_schema.py`)
- **`ai_conversations`**: `id` (UUID PK), `organization_id`, `project_id`, `user_id`, `title`, `selected_dataset_ids`, timestamps.
- **`ai_messages`**: `id` (UUID PK), `conversation_id` (FK `ai_conversations.id`), `role` (`user | assistant`), `content`, `generated_sql`, `sql_explanation`, `sql_validation_status`, `structured_metadata` (JSON), `created_at`.

### Multi-Agent Workflows & Reports (`0005_phase6_multi_agent_schema.py`)
- **`agent_runs`**: `id` (UUID PK), `organization_id`, `project_id`, `user_id`, `conversation_id`, `thread_id` (unique LangGraph checkpoint identifier), `workflow_type`, `user_request`, `selected_dataset_ids`, `dataset_version_snapshot`, `share_aggregate_summaries`, `status`, `current_step`, `approval_status`, `approval_hash`, `approval_payload`, `approved_query_indices`, `llm_calls_count`, `sql_queries_count`, `token_usage`, `result_summary` (JSON), `duration_ms`, `error_code`, `error_summary`.
- **`agent_run_steps`**: `id` (UUID PK), `agent_run_id` (FK), `agent_name`, `step_name`, `status`, `sequence_order`, `started_at`, `completed_at`, `duration_ms`, `input_summary`, `output_summary`, `error_message`.
- **`agent_run_evidence`**: `id` (UUID PK), `agent_run_id` (FK), `query_run_id` (FK `query_runs.id`), `dataset_id`, `dataset_version_id`, `evidence_type`, `evidence_reference`, `description`.
- **`analysis_reports`**: `id` (UUID PK), `organization_id`, `project_id`, `user_id`, `agent_run_id` (FK), `title`, `workflow_type`, `report_json`, `report_markdown`, `evidence_references`. Indexed on `(organization_id, created_at)` in `0006`.

### Production Hardening (`0006_phase7_hardening_indexes.py`)
- **`rate_limit_buckets`**: `key` (`VARCHAR(255)` PK), `window_start`, `count`, `expires_at` (indexed for periodic startup cleanup).
- **Additional Indexes**: `auth_sessions(expires_at)`, `query_runs(organization_id, created_at)`, `analysis_reports(organization_id, created_at)`, `rate_limit_buckets(expires_at)`.
