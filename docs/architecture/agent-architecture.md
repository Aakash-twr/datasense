# Multi-Agent Architecture (LangGraph)

Implemented under [`services/api/app/agents/`](../../services/api/app/agents/), DataSense's multi-agent subsystem orchestrates stateful, checkpointed analytical workflows with mandatory human-in-the-loop SQL execution approval.

---

## 1. Graph Topology & Execution Flow

Compiled cleanly inside `app/agents/graph.py` via `build_analytics_graph(checkpointer)`:

### Nodes
- **`context_loader`** — Loads authorized project catalog tables, columns, and active dataset version snapshots (`AnalyticsGraphState`).
- **`supervisor`** — Classifies the user's request across 7 workflow modes (`simple_question`, `deep_analysis`, `data_quality_audit`, `trend_analysis`, `comparative_analysis`, `anomaly_investigation`, `report_generation`) and constructs a structured `PlannedTask` list.
- **`discovery` & `quality`** (Parallel Fan-Out via LangGraph `Send`) — Concurrently map join relationships, measures/dimensions, and completeness/PII findings bounded by `AGENT_MAX_PARALLEL_TASKS`.
- **`prep_barrier`** — Synchronizes parallel branches cleanly (running sequential `quality` if parallelism was capped at `1`).
- **`sql_analyst`** — Generates DuckDB SQL drafts tailored to the analysis plan.
- **`sql_validation`** — Validates every SQL draft through `QueryValidator` (SQLGlot AST gate) and calculates `compute_approval_hash(project_id, version_snapshot, sql_statements)`.
- **`human_approval`** — Triggers LangGraph `interrupt()` when `approval_required = True`, freezing state in `PostgresSaver` / `SqliteSaver` until the user explicitly approves, selectively checks queries, or rejects.
- **`execution`** — Executes approved queries sequentially via DuckDB and stores bounded, row-capped results inside `ResultArtifactService` (with `query_runs` audit entries).
- **`statistical`** — Computes deterministic Polars summary metrics (`count`, `sum`, `mean`, `median`, `min`, `max`, `std_dev`, `q25`, `q75`, `iqr`) and IQR anomaly flags (`StatisticalService`).
- **`visualization`** — Emits typed Recharts chart specifications (`bar`, `line`, `area`, `pie`, `scatter`, `histogram`) strictly referencing verified executed artifacts.
- **`insight`** — Synthesizes evidence-backed findings and hypotheses referencing `query_run_id` provenance.
- **`report`** — Compiles structured 11-section executive report JSON (`ReportContent`) and downloadable Markdown.
- **`finalize`** — Resolves terminal status (`completed`, `rejected`, or `failed`).

---

## 2. Checkpointing & Resume Safety

Handled by [`CheckpointService`](../../services/api/app/agents/services/checkpoint_service.py):
- **Production PostgreSQL**: Uses `langgraph.checkpoint.postgres.PostgresSaver` over `psycopg_pool.ConnectionPool`.
- **Local Development / SQLite**: Uses `langgraph.checkpoint.sqlite.SqliteSaver` stored under `DATA_STORAGE_ROOT/checkpoints/langgraph_checkpoints.db`.
- **Single-Use Approval Lock**: `WorkflowService.prepare_approval_resume()` transitions `AgentRun` out of `AWAITING_APPROVAL` atomically before invoking `Command(resume=...)` and aborts if `dataset_version_snapshot` changed while paused.

---

## 3. Safeguards & Bounding

- `AGENT_MAX_STEPS` (`15`), `AGENT_MAX_LLM_CALLS` (`8`), `AGENT_MAX_SQL_QUERIES` (`5`), `AGENT_MAX_CONCURRENT_RUNS` (`2`), `AGENT_WORKFLOW_TIMEOUT_SECONDS` (`180`).
- By default (`share_aggregate_summaries = False`), no query result rows leave backend memory toward external LLM providers; only explicitly opted-in bounded aggregates stripped of PII hints are shared for prose synthesis.
