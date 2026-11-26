# AI Analytics Copilot

Implemented in [`services/api/app/ai/`](../../services/api/app/ai/) and [`AICopilotWorkspacePage.tsx`](../../apps/web/src/pages/ai/AICopilotWorkspacePage.tsx), AI Copilot converts natural-language questions into validated DuckDB SQL drafts and plain-English analytical insights.

---

## 1. Three-Panel UI Layout

- **Left Panel (Conversations)**: Searchable thread list, `New Analysis` creation, and thread deletion.
- **Center Panel (Conversational Document Feed)**: Suggested starter questions, concise user prompts, structured assistant takeaways, Schema Assumptions callouts, syntax-highlighted **Generated SQL Draft** cards (`Valid` status badge, SQL explanation, `Copy`, `Open in SQL Editor`, and `Run Query`), plus follow-up prompt chips.
- **Right Panel (Collapsible Dataset Scope)**: Interactive dataset checkboxes selecting exact tables in prompt scope, schema-only context status (`2 tables • 14 cols`), PII indicator icons, and `Generate AI Insights` action.

---

## 2. Backend Copilot Pipeline

1. **Privacy Verification**: Checks `users.ai_privacy_acknowledged_at` before sending any LLM request (`PrivacyDisclosureModal` prompts once on first use).
2. **Schema-Only Context (`ContextService`)**: Formats selected tables/columns cleanly within `AI_MAX_SCHEMA_TABLES` (`50`) and `AI_MAX_SCHEMA_COLUMNS` (`500`), excluding raw rows.
3. **Structured Generation & Repair (`SQLGenerationService`)**: Prompts `ChatGoogleGenerativeAI` for structured `AICopilotResponse` JSON (`sql_query`, `clarification`, `explanation`, `conversational`, `unsupported`). SQL responses pass immediately through `QueryValidator`; on failure, DataSense executes a single bounded repair pass before returning any draft to the UI.
4. **Offline Degraded Behavior**: If `GOOGLE_API_KEY` is omitted, status displays `configured: false` cleanly without disrupting deterministic SQL workflows.
