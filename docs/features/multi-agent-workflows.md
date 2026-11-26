# Multi-Agent Workflows

Powered by LangGraph (`services/api/app/agents/`) and visualized inside [`MultiAgentWorkspacePage.tsx`](../../apps/web/src/pages/agents/MultiAgentWorkspacePage.tsx), Multi-Agent Workflows coordinate specialized analytical tasks with durable pause/resume SQL approval.

---

## 1. Supported Analytical Modes

1. **Quick Analysis** (`simple_question`) — Fast SQL draft & verification.
2. **Deep Analysis** (`deep_analysis`) — Full 8-agent end-to-end investigation and 11-section report.
3. **Data Quality Audit** (`data_quality_audit`) — Completeness, duplicates, null distributions, and PII flagging.
4. **Trend Analysis** (`trend_analysis`) — Time-series aggregations and growth-rate calculations.
5. **Comparative Analysis** (`comparative_analysis`) — Segment, category, or cross-dataset comparisons.
6. **Anomaly Investigation** (`anomaly_investigation`) — Deterministic IQR and Z-score outlier analysis.
7. **Report Generation** (`report_generation`) — Structured executive BI narrative compilation.

---

## 2. Workspace Interface & Inspector

- **KPI Header & Approval Queue**: Tracks Total Agent Runs, Completed Analyses, Awaiting Approval, and Saved Reports with a banner linking directly to paused approval runs.
- **Agent Workflow Visualization (`AgentWorkflowGraph.tsx`)**: Connected interactive SVG DAG showing `Supervisor`, `Data Discovery`, `Data Quality`, `SQL Analyst`, `Statistical Analyst`, `Visualization`, `Insight`, and `Report Generation` color-coded by live state (Blue running, Green completed, Amber awaiting approval, Red failed, Slate pending).
- **Approval Gate Panel (`ApprovalPanel.tsx`)**: Displays workflow mode, target table scope, SHA-256 `approval_hash`, locked dataset version count, per-query checkboxes, validated DuckDB SQL drafts, and `Approve & Run` / `Reject Plan` / `Cancel Workflow` actions.
- **Execution Timeline & Findings**: Chronological `AgentRunStep` timeline, Inspector tabs (`Insights`, `Statistics`, `Data Quality`, `Discovery`, `Visualization Recommendations`), and embedded `ReportViewer`.
