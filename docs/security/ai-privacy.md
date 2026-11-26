# AI Data Privacy Architecture

DataSense enforces strict boundaries between analytical datasets stored inside your environment and external Gemini LLM APIs.

---

## 1. Explicit User Privacy Consent Gate

Before any Copilot prompt, explanation request, or insight generation succeeds:
- `GET /api/v1/ai/status` exposes `privacy_acknowledged`.
- If unacknowledged, `AICopilotWorkspacePage` presents `PrivacyDisclosureModal`, explaining exactly what schema metadata is shared with Google Gemini.
- Consent is persisted cleanly via `POST /api/v1/ai/privacy/acknowledge` (`users.ai_privacy_acknowledged_at`). Requests arriving beforehand receive `403`.

---

## 2. Schema-Only Default Context (`ContextService`)

Implemented in [`services/api/app/ai/services/context_service.py`](../../services/api/app/ai/services/context_service.py):
- Constructs prompts containing strictly:
  - Dataset name and schema namespace
  - Logical table name and total row count
  - Column identifiers, canonical types, nullability, and heuristic sensitivity annotations (`[Sensitive: email]`)
- **Zero raw row samples or record values** are transmitted when generating SQL drafts or conversational schema explanations.

---

## 3. Bounded Opt-In Aggregate Summaries in Multi-Agent Runs

In Multi-Agent workflows (`AgentRun.share_aggregate_summaries`):
- Defaults strictly to `false` (`allow Gemini to process a limited, sanitized summary...` checkbox starts unchecked).
- Even when enabled, `ResultArtifactService` bounds stored analytical snapshots (`MAX_ARTIFACT_ROWS = 500`, `1 MB` cap), skips PII-hinted columns (`email`, `phone`, `ssn`, `password`, `token`, `secret`, `address`, `dob`, `ip_address`), and passes compact computed aggregates rather than raw CSV dumps.

---

## 4. Cryptographic SQL Approval Binding

No Multi-Agent workflow executes SQL without explicit human confirmation. LangGraph freezes via `interrupt()` and verifies a SHA-256 `approval_hash` covering `project_id`, `dataset_version_snapshot`, and exact SQL statements before resuming `Command(resume=...)`.
