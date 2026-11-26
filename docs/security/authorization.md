# Multi-Tenant Authorization & RBAC

Every API resource in DataSense—projects, datasets, versions, jobs, SQL runs, saved queries, AI threads, LangGraph runs, and reports—is isolated per organization and guarded by role checks (`app/api/deps.py`).

---

## 1. Tenant Resolution & Cross-Tenant Isolation

- Users belong to organizations via `memberships` (`(organization_id, user_id)` unique pair).
- Requests resolve active organization context from the default membership or `X-Organization-Id` header.
- Attempting to access an organization without membership returns `403 Forbidden`.
- Accessing a `project_id`, `dataset_id`, `conversation_id`, or `agent_run_id` belonging to another organization returns **`404 Not Found`** across all domain endpoints to avoid leaking entity existence across tenant boundaries.

---

## 2. Role-Based Access Control (RBAC) Matrix

| Operation / Resource Group | `owner` | `admin` | `analyst` | `viewer` |
|---|:---:|:---:|:---:|:---:|
| Read projects, datasets, schemas, previews & profiles | ✅ | ✅ | ✅ | ✅ |
| Read query history, saved queries, AI threads, runs & reports | ✅ | ✅ | ✅ | ✅ |
| Create or edit projects | ✅ | ✅ | ✅ | ❌ (`403`) |
| Archive / delete projects | ✅ | ✅ | ❌ (`403`) | ❌ (`403`) |
| Upload datasets, new versions & archive datasets | ✅ | ✅ | ✅ | ❌ (`403`) |
| Validate/execute DuckDB SQL & manage saved queries | ✅ | ✅ | ✅ | ❌ (`403`) |
| Start/delete AI Copilot threads & send prompts | ✅ | ✅ | ✅ | ❌ (`403`) |
| Start, approve, reject, cancel or delete Agent runs & save/delete reports | ✅ | ✅ | ✅ | ❌ (`403`) |
| Modify organization settings & view Admin Observability | ✅ | ✅ | ❌ (`403`) | ❌ (`403`) |

All RBAC checks and cross-tenant isolation rules are covered by `services/api/tests/test_authorization.py` and `services/api/tests/test_security_and_hardening.py`.
