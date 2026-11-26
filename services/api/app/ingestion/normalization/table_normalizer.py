"""Table name normalization for multi-sheet workbooks and files."""

from __future__ import annotations

import re


def sanitize_table_name(name: str, index: int = 1) -> str:
    """Generate a clean, SQL-friendly physical table name."""
    if not name or not name.strip():
        return f"table_{index}"

    cleaned = name.strip().lower()
    cleaned = re.sub(r"[^\w]+", "_", cleaned)
    cleaned = cleaned.strip("_")

    if not cleaned:
        return f"table_{index}"

    if cleaned[0].isdigit():
        cleaned = f"t_{cleaned}"

    return cleaned[:64]


def deduplicate_table_names(names: list[str]) -> list[tuple[str, str]]:
    """Return pairs of (original_name, unique_normalized_name)."""
    result: list[tuple[str, str]] = []
    seen: dict[str, int] = {}

    for idx, raw_name in enumerate(names, start=1):
        original = raw_name if raw_name else f"Sheet{idx}"
        base = sanitize_table_name(original, idx)

        if base not in seen:
            seen[base] = 1
            unique_name = base
        else:
            seen[base] += 1
            unique_name = f"{base}_{seen[base]}"

        result.append((original, unique_name))

    return result
