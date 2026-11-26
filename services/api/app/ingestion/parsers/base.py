"""Base parser interface and data structures."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path

import polars as pl


@dataclass
class ParsedTable:
    """In-memory representation of a parsed table."""

    table_name: str
    original_table_name: str
    df: pl.DataFrame


class BaseParser(ABC):
    """Abstract parser interface for structured file formats."""

    @abstractmethod
    def parse(self, file_path: Path) -> list[ParsedTable]:
        """Parse source file into one or more logical tables."""
