"""Natural Language to SQL Generation Service using LangChain & SQLGlot."""

from __future__ import annotations

import logging
from typing import Any

from langchain_core.messages import AIMessage as LCAIMessage
from langchain_core.messages import HumanMessage, SystemMessage

from app.ai.llm_factory import LLMFactory
from app.ai.prompts.analytics_system_prompt import (
    ANALYTICS_SYSTEM_PROMPT,
    REPAIR_SQL_PROMPT,
)
from app.ai.schemas.ai_response import AICopilotResponse
from app.analytics.query_validator import QueryValidator

logger = logging.getLogger(__name__)


class SQLGenerationService:
    """Orchestrates natural language to DuckDB SQL generation, structured parsing,
    and strict AST-based safety validation with controlled repair.
    """

    def __init__(self, validator: QueryValidator | None = None):
        self._default_validator = validator

    def _build_validator(self, allowed_tables: list[str]) -> QueryValidator:
        if self._default_validator is not None:
            return self._default_validator
        catalog_dict: dict[str, list[str]] = {"default": []}
        for t in allowed_tables:
            if "." in t:
                s, tbl = t.split(".", 1)
                catalog_dict.setdefault(s.lower(), []).append(tbl.lower())
            else:
                catalog_dict["default"].append(t.lower())
        return QueryValidator(registered_catalog=catalog_dict)

    def generate_analytical_response(
        self,
        question: str,
        schema_context: str,
        allowed_tables: list[str],
        conversation_history: list[dict[str, str]] | None = None,
    ) -> tuple[AICopilotResponse, str | None]:
        """Generates a structured analytical response and validated SQL draft.

        Returns:
            Tuple of (AICopilotResponse, sql_validation_status)
        """
        model = LLMFactory.get_model()

        # Build prompt message chain
        system_content = f"{ANALYTICS_SYSTEM_PROMPT}\n\nCURRENT PROJECT SCHEMA CONTEXT:\n{schema_context}"
        messages: list[Any] = [SystemMessage(content=system_content)]

        if conversation_history:
            for item in conversation_history[-10:]:  # Bound history for safety and token efficiency
                role = item.get("role", "user")
                content = item.get("content", "")
                if role == "user":
                    messages.append(HumanMessage(content=content))
                elif role == "assistant":
                    messages.append(LCAIMessage(content=content))

        # Add latest question
        messages.append(HumanMessage(content=question))

        try:
            # Bind structured output
            structured_llm = model.with_structured_output(AICopilotResponse)
            ai_response: AICopilotResponse = structured_llm.invoke(messages)
        except Exception as exc:
            logger.exception("Gemini invocation failed: %s", exc)
            LLMFactory.handle_provider_exception(exc)
            raise

        sql_validation_status: str | None = None
        validator = self._build_validator(allowed_tables)

        if ai_response.generated_sql and ai_response.generated_sql.strip():
            raw_sql = ai_response.generated_sql.strip()
            # 1. Validate through Phase 4 SQLGlot AST validator
            val_result = validator.validate(raw_sql)

            if val_result.is_valid:
                sql_validation_status = "valid"
            else:
                error_msg = val_result.error or "SQL validation failed."
                logger.warning("Generated SQL failed validation: %s. Attempting 1 controlled repair...", error_msg)

                # 2. Perform at most ONE controlled repair attempt
                repair_prompt = REPAIR_SQL_PROMPT.format(
                    validation_error=error_msg,
                    attempted_sql=raw_sql,
                    schema_context=schema_context,
                )
                repair_messages = list(messages)
                repair_messages.append(LCAIMessage(content=f"Draft SQL: {raw_sql}"))
                repair_messages.append(HumanMessage(content=repair_prompt))

                try:
                    repaired_response: AICopilotResponse = structured_llm.invoke(repair_messages)
                    if repaired_response.generated_sql and repaired_response.generated_sql.strip():
                        repaired_sql = repaired_response.generated_sql.strip()
                        second_val = validator.validate(repaired_sql)
                        if second_val.is_valid:
                            ai_response.generated_sql = repaired_sql
                            if repaired_response.sql_explanation:
                                ai_response.sql_explanation = repaired_response.sql_explanation
                            sql_validation_status = "repaired"
                        else:
                            logger.error("Repaired SQL failed second validation: %s", second_val.error)
                            sql_validation_status = "invalid"
                            ai_response.message = f"{ai_response.message}\n\nNote: The draft query could not be validated against your schema ({second_val.error})."
                    else:
                        sql_validation_status = "invalid"
                except Exception as repair_exc:
                    logger.warning("Repair invocation failed: %s", repair_exc)
                    sql_validation_status = "invalid"

        return ai_response, sql_validation_status
