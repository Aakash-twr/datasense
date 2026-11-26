# DataSense Application Screenshots Index

All screenshots below were captured directly from the running DataSense React frontend (`127.0.0.1:5173`) paired with the FastAPI + DuckDB + LangGraph backend (`127.0.0.1:8000`) in headless Chromium using synthetic, non-sensitive demo data (`Northstar Retail Analytics` / `retail_sales_2026.csv` & `customer_segments.csv`).

---

## Desktop Views (`1440×1000`, 2x Retina Capture)

| # | Screen | File | What It Demonstrates |
|---|---|---|---|
| 1 | **Login** | [`login.png`](assets/screenshots/login.png) | Split-screen enterprise SaaS sign-in featuring architectural deep-navy left panel, miniature SQL/workflow preview card, and elevated light auth card. |
| 2 | **Main Dashboard** | [`dashboard-overview.png`](assets/screenshots/dashboard-overview.png) | Organization-scoped KPI summary cards (Projects, Datasets, Queries, AI Workflows, Reports), Recharts activity chart, quick actions, recent workflows, dataset readiness, and SQL telemetry. |
| 3 | **Projects Workspace** | [`projects-workspace.png`](assets/screenshots/projects-workspace.png) | Searchable/sortable project workspace grid with dataset counts, active status badges, and right-hand workspace breakdown sidebar. |
| 4 | **Data Sources** | [`data-sources.png`](assets/screenshots/data-sources.png) | Project dataset repository showing CSV format badges, active `v1` indicators, table/row metrics, upload date, and quick actions. |
| 5 | **Dataset Details (Schema & PII)** | [`dataset-details.png`](assets/screenshots/dataset-details.png) | Multi-tab Dataset Detail workspace (`Overview`, `Tables`, `Schema`, `Data Profile`, `Data Preview`, `Versions`) displaying column types, nullability, and automatic `email` PII tagging on `customer_email`. |
| 6 | **SQL Analytics Workspace** | [`sql-analytics-workspace.png`](assets/screenshots/sql-analytics-workspace.png) | Database Explorer sidebar with dataset schemas & PII indicators, CodeMirror 6 SQL editor with syntax highlighting, Validate/Save/Format controls, and row limit configuration. |
| 7 | **SQL Query Results** | [`sql-query-results.png`](assets/screenshots/sql-query-results.png) | Live DuckDB aggregation results (`Software`, `Electronics`, `Hardware`) with millisecond execution telemetry (`53.36 ms`), tabular display, CSV export, and chart toggle. |
| 8 | **AI Analytics Copilot** | [`ai-copilot.png`](assets/screenshots/ai-copilot.png) | Three-panel conversational analytics UI: thread history sidebar, structured natural-language answer with schema-only assumptions & SQLGlot-validated DuckDB SQL draft card, and collapsible Dataset Scope sidebar. |
| 9 | **Multi-Agent Analytics Overview** | [`multi-agent-overview.png`](assets/screenshots/multi-agent-overview.png) | Multi-agent KPI metrics, pending human approval banner, 7 workflow mode composer, and connected custom SVG DAG graph illustrating parallel `Data Discovery` + `Data Quality` and downstream `Statistical` + `Visualization` stages. |
| 10 | **Agent Execution Timeline** | [`agent-execution-timeline.png`](assets/screenshots/agent-execution-timeline.png) | Chronological step-by-step execution timeline alongside synthesized insights, Recharts visualization gallery, and executive report actions. |
| 11 | **Human-in-the-Loop SQL Approval** | [`sql-approval.png`](assets/screenshots/sql-approval.png) | Paused LangGraph checkpoint awaiting human consent, showing cryptographic SHA-256 plan hash, version snapshot lock, validated SQL drafts, query selection checkboxes, and Approve/Reject/Cancel controls. |
| 12 | **Final Analytical Report** | [`analytics-report.png`](assets/screenshots/analytics-report.png) | 11-section executive business intelligence document featuring Executive Summary, Datasets Analyzed, Key Findings with query evidence IDs, Statistical Analysis, Data Quality, Markdown copy/export, and print layout. |
| 13 | **Settings & Profile** | [`settings-profile.png`](assets/screenshots/settings-profile.png) | Structured multi-section Settings UI for Profile, Account Security, Preferences, AI Settings, Privacy controls, and Organization configuration. |

---

## Responsive Mobile Views (`390×844`)

| # | Screen | File | What It Demonstrates |
|---|---|---|---|
| 14 | **Mobile Login** | [`mobile-login.png`](assets/screenshots/mobile-login.png) | Compact sticky brand bar hiding the desktop preview cleanly, responsive full-width sign-in card, and accessible touch-friendly controls. |
| 15 | **Mobile Dashboard** | [`mobile-dashboard.png`](assets/screenshots/mobile-dashboard.png) | Collapsible navigation drawer button, stacked KPI stat cards, and overflow-free mobile filters and primary actions. |
