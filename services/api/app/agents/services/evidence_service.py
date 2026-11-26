"""Evidence persistence and citation helper for Phase 6 agent runs."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.models.agent_run_evidence import AgentRunEvidence


class EvidenceService:
    """Persists verifiable provenance records tying findings to queries and dataset versions."""

    @staticmethod
    def record_evidence_batch(
        db: Session,
        agent_run_id: uuid.UUID,
        records: list[dict[str, Any]],
    ) -> list[AgentRunEvidence]:
        """Persists a list of evidence records for an agent run."""
        created: list[AgentRunEvidence] = []
        seen_keys: set[tuple[str, str]] = set()

        for rec in records:
            ev_type = str(rec.get("evidence_type", "query_execution"))[:64]
            ev_ref = str(rec.get("evidence_reference", ""))[:255]
            if not ev_ref or (ev_type, ev_ref) in seen_keys:
                continue
            seen_keys.add((ev_type, ev_ref))

            query_run_id = _try_uuid(rec.get("query_run_id"))
            dataset_id = _try_uuid(rec.get("dataset_id"))
            dataset_version_id = _try_uuid(rec.get("dataset_version_id"))

            row = AgentRunEvidence(
                agent_run_id=agent_run_id,
                query_run_id=query_run_id,
                dataset_id=dataset_id,
                dataset_version_id=dataset_version_id,
                evidence_type=ev_type,
                evidence_reference=ev_ref,
                description=str(rec.get("description", ""))[:2000],
            )
            db.add(row)
            created.append(row)

        if created:
            db.commit()
        return created


def _try_uuid(value: Any) -> uuid.UUID | None:
    if not value:
        return None
    if isinstance(value, uuid.UUID):
        return value
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError):
        return None
