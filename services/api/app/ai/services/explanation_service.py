"""SQL explanation and optimization recommendation service."""

from __future__ import annotations

import logging

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from app.ai.llm_factory import LLMFactory
from app.ai.schemas.ai_response import AISQLExplanationResponse
from app.analytics.query_validator import QueryValidator

logger = logging.getLogger(__name__)


class SQLExplanationData(BaseModel):
    explanation: str
    accessed_tables: list[str] = Field(default_factory=list)
    applied_filters: list[str] = Field(default_factory=list)
    aggregations_and_calculations: list[str] = Field(default_factory=list)
    suggested_improvements: list[str] = Field(default_factory=list)
    improved_sql: str | None = None


class SQLExplanationService:
    """Explains SQL queries in plain English and suggests query optimizations."""

    EXPLAIN_SYSTEM_PROMPT = """You are DataSense SQL Explainer and Optimization Expert.
Your goal is to explain SQL queries in plain English and propose clean optimizations targeting DuckDB SQL dialect.

RULES:
1. Explain what the query does clearly and concisely.
2. Identify tables accessed, filters applied, and calculations performed.
3. Suggest 1 to 3 concrete query improvements (e.g. clearer aliases, cleaner joins, date functions, indexing advice).
4. If an improved query is provided, it must be valid read-only DuckDB SQL adhering to the original logic.
5. Do not execute the query or claim it has been run.
"""

    def __init__(self, validator: QueryValidator | None = None):
        self.validator = validator or QueryValidator()

    def explain_sql(
        self,
        sql: str,
        schema_context: str | None = None,
        allowed_tables: list[str] | None = None,
    ) -> AISQLExplanationResponse:
        """Explains the given SQL query using Gemini with AST heuristic fallback."""
        prompt_content = f"Explain this SQL query:\n\n```sql\n{sql}\n```"
        if schema_context:
            prompt_content += f"\n\nSchema Context:\n{schema_context}"

        try:
            model = LLMFactory.get_model(temperature=0.1)
            structured_model = model.with_structured_output(SQLExplanationData)
            messages = [
                SystemMessage(content=self.EXPLAIN_SYSTEM_PROMPT),
                HumanMessage(content=prompt_content),
            ]
            res: SQLExplanationData = structured_model.invoke(messages)

            # Validate improved SQL if provided
            valid_improved_sql = None
            if res.improved_sql and res.improved_sql.strip():
                catalog_dict: dict[str, list[str]] = {"default": []}
                if allowed_tables:
                    for t in allowed_tables:
                        if "." in t:
                            s, tbl = t.split(".", 1)
                            catalog_dict.setdefault(s.lower(), []).append(tbl.lower())
                        else:
                            catalog_dict["default"].append(t.lower())
                validator = QueryValidator(registered_catalog=catalog_dict) if allowed_tables else self.validator
                improved_val = validator.validate(res.improved_sql.strip())
                if improved_val.is_valid:
                    valid_improved_sql = res.improved_sql.strip()

            return AISQLExplanationResponse(
                explanation=res.explanation,
                accessed_tables=res.accessed_tables,
                applied_filters=res.applied_filters,
                aggregations_and_calculations=res.aggregations_and_calculations,
                suggested_improvements=res.suggested_improvements,
                improved_sql=valid_improved_sql,
            )
        except Exception as exc:
            logger.warning("LLM SQL explanation failed (%s). Using AST fallback.", exc)
            return self._heuristic_explanation(sql, allowed_tables)

    def _heuristic_explanation(
        self,
        sql: str,
        allowed_tables: list[str] | None = None,
    ) -> AISQLExplanationResponse:
        """Fallback deterministic explanation using SQLGlot AST inspection."""
        tables: list[str] = []
        try:
            import sqlglot
            from sqlglot import exp
            parsed = sqlglot.parse_one(sql, read="duckdb")
            for table_node in parsed.find_all(exp.Table):
                tables.append(table_node.name)
        except Exception:
            pass

        return AISQLExplanationResponse(
            explanation=f"This analytical query queries data from {', '.join(set(tables)) if tables else 'the dataset'}.",
            accessed_tables=list(set(tables)),
            applied_filters=["Filter criteria defined in WHERE clause" if "WHERE" in sql.upper() else "No filter applied"],
            aggregations_and_calculations=["Grouping and aggregates defined" if "GROUP BY" in sql.upper() else "Direct row selection"],
            suggested_improvements=["Ensure proper column aliasing for visualization clarity"],
            improved_sql=None,
        )
