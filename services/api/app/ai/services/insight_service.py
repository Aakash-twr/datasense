"""Dataset AI insights service using Phase 3 profiling metadata."""

from __future__ import annotations

import logging
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from app.ai.llm_factory import LLMFactory
from app.ai.schemas.ai_response import AIInsightItem, AIInsightResponse
from app.analytics.schemas import CatalogResponse

logger = logging.getLogger(__name__)


class InsightCollection(BaseModel):
    """Structured insight output from Gemini."""

    insights: list[AIInsightItem] = Field(default_factory=list)


class InsightService:
    """Generates analytical insights, proposed questions, and exploration angles

    based strictly on dataset schemas and Phase 3 statistical profiling summaries.
    """

    INSIGHTS_SYSTEM_PROMPT = """You are DataSense AI Insights Engine.
Your task is to analyze dataset schemas and statistical column summaries to identify high-value analytical angles.

RULES:
1. NEVER invent columns, numbers, or trends that are not in the schema summary.
2. Formulate 3 to 6 practical business or data questions the user can answer using DuckDB SQL.
3. For each insight:
   - Provide a clear 'title'
   - Provide a concise 'description' explaining what the columns tell us
   - Categorize it (e.g., 'trends', 'distributions', 'segmentation', 'quality', 'aggregations')
   - Provide a concrete 'suggested_question'
   - Provide a draft 'suggested_sql' targeting DuckDB using only the provided tables and columns.
"""

    def generate_insights(
        self,
        catalog: CatalogResponse,
        selected_dataset_ids: list[str] | None = None,
    ) -> list[AIInsightResponse]:
        """Generates AI insights for the specified datasets."""
        filtered_datasets = catalog.datasets
        if selected_dataset_ids:
            filtered_datasets = [
                d for d in catalog.datasets if str(d.dataset_id) in selected_dataset_ids
            ]

        results: list[AIInsightResponse] = []

        for ds in filtered_datasets:
            dataset_summary_lines = [
                f"Dataset: {ds.dataset_name}",
                f"Tables count: {len(ds.tables)}",
            ]
            for tbl in ds.tables:
                dataset_summary_lines.append(f"Table: {tbl.table_name} ({tbl.row_count:,} rows)")
                cols_str = ", ".join([f"{c.name}:{c.canonical_type}" for c in tbl.columns[:30]])
                dataset_summary_lines.append(f"Columns: {cols_str}")

            summary_text = "\n".join(dataset_summary_lines)

            # Attempt Gemini structured generation; fallback to deterministic heuristics if AI is offline
            insights: list[AIInsightItem] = []
            try:
                model = LLMFactory.get_model(temperature=0.2)
                structured_model = model.with_structured_output(InsightCollection)
                messages = [
                    SystemMessage(content=self.INSIGHTS_SYSTEM_PROMPT),
                    HumanMessage(content=f"Analyze this schema and suggest key analytical insights:\n\n{summary_text}"),
                ]
                res: InsightCollection = structured_model.invoke(messages)
                insights = res.insights
            except Exception as exc:
                logger.warning("Gemini insight generation skipped (%s). Using schema-driven heuristic insights.", exc)
                insights = self._generate_heuristic_insights(ds)

            results.append(
                AIInsightResponse(
                    dataset_id=str(ds.dataset_id),
                    dataset_name=ds.dataset_name,
                    insights=insights,
                )
            )

        return results

    def _generate_heuristic_insights(self, dataset: Any) -> list[AIInsightItem]:
        """Deterministic fallback insights derived from table and column types."""
        items: list[AIInsightItem] = []
        for tbl in dataset.tables:
            numeric_cols = [c.name for c in tbl.columns if c.canonical_type in ("INTEGER", "FLOAT")]
            date_cols = [c.name for c in tbl.columns if c.canonical_type in ("DATE", "DATETIME")]
            category_cols = [c.name for c in tbl.columns if c.canonical_type == "STRING" and not c.is_sensitive]

            if numeric_cols and category_cols:
                metric = numeric_cols[0]
                dim = category_cols[0]
                items.append(
                    AIInsightItem(
                        title=f"{dim.title()} Breakdown",
                        description=f"Analyze total and average {metric} grouped by {dim}.",
                        category="segmentation",
                        suggested_question=f"What is the total and average {metric} grouped by {dim}?",
                        suggested_sql=f"SELECT {dim}, COUNT(*) AS count, SUM({metric}) AS total_{metric}, ROUND(AVG({metric}), 2) AS avg_{metric} FROM {tbl.table_name} GROUP BY {dim} ORDER BY total_{metric} DESC LIMIT 20;",
                    )
                )

            if date_cols and numeric_cols:
                date_c = date_cols[0]
                metric = numeric_cols[0]
                items.append(
                    AIInsightItem(
                        title="Time-Series Trend",
                        description=f"Track {metric} over time based on {date_c}.",
                        category="trends",
                        suggested_question=f"How has {metric} changed over time by month?",
                        suggested_sql=f"SELECT STRFTIME({date_c}, '%Y-%m') AS period, SUM({metric}) AS total_{metric} FROM {tbl.table_name} GROUP BY 1 ORDER BY 1 ASC;",
                    )
                )

            # Volume summary
            items.append(
                AIInsightItem(
                    title="Volume & Record Count",
                    description=f"Table {tbl.table_name} contains {tbl.row_count:,} records across {len(tbl.columns)} columns.",
                    category="overview",
                    suggested_question=f"What is the total record count and summary of {tbl.table_name}?",
                    suggested_sql=f"SELECT COUNT(*) AS total_records FROM {tbl.table_name};",
                )
            )

        return items
