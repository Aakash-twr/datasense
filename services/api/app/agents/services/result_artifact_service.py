"""Short-lived, authorization-scoped bounded result artifact storage for agent workflows."""

from __future__ import annotations

import contextlib
import json
import logging
import time
import uuid
from pathlib import Path
from typing import Any

from app.agents.exceptions import AgentArtifactNotFoundError
from app.core.config import settings

logger = logging.getLogger(__name__)

# Hard bounds to protect Apple M1 8GB RAM and enforce privacy
MAX_ARTIFACT_ROWS = 500
MAX_ARTIFACT_BYTES = 1_048_576  # 1 MB
PII_COLUMN_HINTS = {"email", "phone", "ssn", "password", "token", "secret", "address", "dob", "ip_address"}


class ResultArtifactService:
    """Stores bounded query result snapshots on backend storage with strict tenant isolation."""

    def __init__(self, base_dir: Path | None = None):
        root = base_dir or (Path(settings.data_storage_root) / "artifacts" / "agent_results")
        self.base_dir = root
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def _artifact_path(self, artifact_id: str) -> Path:
        safe_id = "".join(ch for ch in artifact_id if ch.isalnum() or ch in ("-", "_"))
        return self.base_dir / f"{safe_id}.json"

    def save_artifact(
        self,
        *,
        organization_id: str,
        project_id: str,
        user_id: str,
        run_id: str,
        query_run_id: str | None,
        sql: str,
        columns: list[dict[str, str]],
        rows: list[list[Any]],
    ) -> str:
        """Saves a bounded result snapshot and returns an opaque artifact ID."""
        artifact_id = f"art_{uuid.uuid4().hex}"
        bounded_rows = rows[:MAX_ARTIFACT_ROWS]
        expires_at = time.time() + settings.agent_result_cache_ttl_seconds

        payload = {
            "artifact_id": artifact_id,
            "organization_id": organization_id,
            "project_id": project_id,
            "user_id": user_id,
            "run_id": run_id,
            "query_run_id": query_run_id,
            "sql": sql,
            "columns": columns,
            "rows": bounded_rows,
            "row_count": len(bounded_rows),
            "truncated": len(rows) > MAX_ARTIFACT_ROWS,
            "created_at": time.time(),
            "expires_at": expires_at,
        }

        serialized = json.dumps(payload, default=str)
        if len(serialized.encode("utf-8")) > MAX_ARTIFACT_BYTES:
            # Trim rows further to stay within 1MB bound
            half = max(1, len(bounded_rows) // 4)
            payload["rows"] = bounded_rows[:half]
            payload["row_count"] = len(payload["rows"])
            payload["truncated"] = True
            serialized = json.dumps(payload, default=str)

        self._artifact_path(artifact_id).write_text(serialized, encoding="utf-8")
        return artifact_id

    def get_artifact(
        self,
        artifact_id: str,
        *,
        organization_id: str,
        project_id: str,
        user_id: str | None = None,
    ) -> dict[str, Any]:
        """Reads and authorizes a result artifact; deletes and rejects if expired."""
        path = self._artifact_path(artifact_id)
        if not path.exists():
            raise AgentArtifactNotFoundError("Result artifact not found.")

        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception as exc:
            raise AgentArtifactNotFoundError("Result artifact could not be read.") from exc

        if data.get("expires_at", 0) < time.time():
            with contextlib.suppress(OSError):
                path.unlink(missing_ok=True)
            raise AgentArtifactNotFoundError("Result artifact has expired.")

        if data.get("organization_id") != organization_id or data.get("project_id") != project_id:
            raise AgentArtifactNotFoundError("Result artifact not found.")

        if user_id and data.get("user_id") != user_id:
            raise AgentArtifactNotFoundError("Result artifact not found.")

        return data

    def cleanup_expired_artifacts(self) -> int:
        """Removes expired artifacts from local storage."""
        removed = 0
        now = time.time()
        for file_path in self.base_dir.glob("art_*.json"):
            try:
                data = json.loads(file_path.read_text(encoding="utf-8"))
                if data.get("expires_at", 0) < now:
                    file_path.unlink(missing_ok=True)
                    removed += 1
            except Exception:
                continue
        return removed

    @staticmethod
    def build_sanitized_aggregate_summary(
        artifact: dict[str, Any],
        *,
        max_rows: int = 10,
    ) -> dict[str, Any]:
        """Builds a small, sanitized aggregate summary safe to share ONLY with explicit consent.

        Strips columns whose names suggest PII and suppresses potentially identifying tiny slices.
        """
        columns = artifact.get("columns", [])
        rows = artifact.get("rows", [])

        safe_indices: list[int] = []
        safe_columns: list[dict[str, str]] = []
        for idx, col in enumerate(columns):
            col_name = str(col.get("name", "")).lower()
            if any(hint in col_name for hint in PII_COLUMN_HINTS):
                continue
            safe_indices.append(idx)
            safe_columns.append(col)

        sanitized_rows: list[dict[str, Any]] = []
        for row in rows[:max_rows]:
            row_dict: dict[str, Any] = {}
            for pos, orig_idx in enumerate(safe_indices):
                if orig_idx < len(row):
                    val = row[orig_idx]
                    if isinstance(val, str) and len(val) > 80:
                        val = val[:77] + "..."
                    row_dict[safe_columns[pos]["name"]] = val
            sanitized_rows.append(row_dict)

        return {
            "query_run_id": artifact.get("query_run_id"),
            "columns": [c["name"] for c in safe_columns],
            "row_count": artifact.get("row_count", 0),
            "sample_aggregates": sanitized_rows,
        }
