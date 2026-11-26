"""SQL query parsing, validation, and security enforcement using SQLGlot."""

from __future__ import annotations

from dataclasses import dataclass, field

import sqlglot
from sqlglot import exp
from sqlglot.errors import ParseError

# Prohibited AST expression types (DDL, DML, administrative, session)
PROHIBITED_EXPRESSIONS: tuple[type[exp.Expression], ...] = (
    exp.Insert,
    exp.Update,
    exp.Delete,
    exp.Create,
    exp.Drop,
    exp.Alter,
    exp.TruncateTable,
    exp.Merge,
    exp.Command,
    exp.Pragma,
    exp.Set,
    exp.Transaction,
    exp.Commit,
    exp.Rollback,
    exp.Copy,
    exp.Attach,
    exp.Detach,
    exp.LoadData,
    # Specific file-reading AST classes in SQLGlot
    exp.ReadCSV,
)

# Forbidden function names (case-insensitive)
FORBIDDEN_FUNCTIONS: frozenset[str] = frozenset(
    {
        "read_csv",
        "read_csv_auto",
        "read_parquet",
        "scan_parquet",
        "parquet_scan",
        "read_json",
        "read_json_auto",
        "read_ndjson",
        "read_blob",
        "read_text",
        "glob",
        "httpfs",
        "sniff_csv",
        "postgres_scan",
        "sqlite_scan",
        "duckdb_tables",
        "duckdb_schemas",
        "duckdb_settings",
        "duckdb_views",
        "duckdb_extensions",
        "iceberg_scan",
        "delta_scan",
        "install",
        "load",
        "checkpoint",
        "copy",
        "query",
        "system",
        "shell",
        "eval",
        "exec",
        "current_setting",
        "set_variable",
        "get_variable",
    }
)

# Forbidden system catalogs & databases
FORBIDDEN_CATALOGS: frozenset[str] = frozenset(
    {
        "information_schema",
        "pg_catalog",
        "duckdb_catalog",
        "system",
        "temp",
    }
)

# Allowlist of safe analytical, scalar, aggregation, and window functions
ALLOWED_FUNCTIONS: frozenset[str] = frozenset(
    {
        # Aggregation
        "count",
        "sum",
        "avg",
        "min",
        "max",
        "stddev",
        "stddev_pop",
        "stddev_samp",
        "var_pop",
        "var_samp",
        "variance",
        "median",
        "mode",
        "quantile_cont",
        "quantile_disc",
        "approx_count_distinct",
        "string_agg",
        "group_concat",
        "array_agg",
        "list",
        "bit_and",
        "bit_or",
        "bit_xor",
        "bool_and",
        "bool_or",
        # Math & Numerics
        "abs",
        "round",
        "floor",
        "ceil",
        "ceiling",
        "trunc",
        "sign",
        "sqrt",
        "cbrt",
        "power",
        "pow",
        "exp",
        "ln",
        "log",
        "log10",
        "log2",
        "pi",
        "sin",
        "cos",
        "tan",
        "asin",
        "acos",
        "atan",
        "atan2",
        "degrees",
        "radians",
        "greatest",
        "least",
        "mod",
        # String functions
        "length",
        "len",
        "octet_length",
        "bit_length",
        "lower",
        "upper",
        "trim",
        "ltrim",
        "rtrim",
        "substr",
        "substring",
        "concat",
        "concat_ws",
        "replace",
        "regexp_replace",
        "regexp_matches",
        "regexp_extract",
        "split_part",
        "string_split",
        "str_split",
        "position",
        "strpos",
        "instr",
        "left",
        "right",
        "pad",
        "lpad",
        "rpad",
        "repeat",
        "reverse",
        "format",
        "printf",
        # Date & Timestamp
        "now",
        "today",
        "current_date",
        "current_time",
        "current_timestamp",
        "date_part",
        "date_trunc",
        "extract",
        "datediff",
        "date_diff",
        "dateadd",
        "date_add",
        "datesub",
        "date_sub",
        "age",
        "strftime",
        "strptime",
        "to_timestamp",
        "epoch",
        "year",
        "month",
        "day",
        "hour",
        "minute",
        "second",
        "quarter",
        "dayofweek",
        "dayofyear",
        "week",
        "isodow",
        "last_day",
        # Conditional & Utility
        "coalesce",
        "nullif",
        "ifnull",
        "nvl",
        "case",
        "when",
        "then",
        "else",
        "end",
        "cast",
        "try_cast",
        "typeof",
        # Window functions
        "row_number",
        "rank",
        "dense_rank",
        "percent_rank",
        "cume_dist",
        "ntile",
        "lag",
        "lead",
        "first_value",
        "last_value",
        "nth_value",
    }
)


@dataclass
class ValidationResult:
    """Result of SQL query validation."""

    is_valid: bool
    error: str | None = None
    tables_referenced: list[str] = field(default_factory=list)
    suggested_fixes: list[str] = field(default_factory=list)


class QueryValidator:
    """Validates analytical SQL queries for security and semantic correctness."""

    def __init__(self, registered_catalog: dict[str, list[str]] | None = None) -> None:
        """Initialize validator with optional registered catalog.

        Args:
            registered_catalog: Mapping of schema_name -> [table_name, ...]
        """
        self.catalog = registered_catalog or {}
        # Pre-compute valid qualified names and lookup maps
        self.qualified_tables: set[str] = set()
        self.table_to_schemas: dict[str, list[str]] = {}

        for schema, tables in self.catalog.items():
            s_lower = schema.lower()
            for tbl in tables:
                t_lower = tbl.lower()
                self.qualified_tables.add(f"{s_lower}.{t_lower}")
                self.table_to_schemas.setdefault(t_lower, []).append(s_lower)

    def validate(self, sql: str) -> ValidationResult:
        """Validates a SQL query string.

        Returns:
            ValidationResult containing validation status and diagnostics.

        Raises:
            QueryValidationError: If query violates security or syntax rules and fail_fast is needed.
        """
        clean_sql = sql.strip()
        if not clean_sql:
            return ValidationResult(is_valid=False, error="SQL query cannot be empty.")

        # 1. Parse using SQLGlot with DuckDB dialect
        try:
            statements = sqlglot.parse(clean_sql, read="duckdb")
        except ParseError as exc:
            return ValidationResult(
                is_valid=False,
                error=f"SQL syntax error: {exc}",
            )
        except Exception as exc:
            return ValidationResult(
                is_valid=False,
                error=f"Failed to parse SQL: {exc}",
            )

        if not statements:
            return ValidationResult(is_valid=False, error="No executable SQL statements found.")

        # 2. Reject multiple SQL statements
        if len(statements) > 1:
            return ValidationResult(
                is_valid=False,
                error=(
                    "Multiple SQL statements in a single request are forbidden. "
                    "Please submit one query at a time."
                ),
            )

        root = statements[0]
        if root is None:
            return ValidationResult(is_valid=False, error="Empty SQL statement.")

        # 3. Confirm root statement is a read-only SELECT or UNION query
        if not isinstance(root, (exp.Select, exp.Union)):
            op_name = root.key.upper() if hasattr(root, "key") else "NON_SELECT"
            return ValidationResult(
                is_valid=False,
                error=(
                    f"Forbidden statement type '{op_name}'. "
                    "Only read-only analytical SELECT queries are permitted."
                ),
            )

        # 4. Check for prohibited AST expression nodes anywhere in the query
        for prohibited_cls in PROHIBITED_EXPRESSIONS:
            matches = list(root.find_all(prohibited_cls))
            if matches:
                node_name = prohibited_cls.__name__.upper()
                return ValidationResult(
                    is_valid=False,
                    error=(
                        f"Forbidden SQL operation detected: {node_name}. "
                        "Data manipulation (INSERT/UPDATE/DELETE), DDL, and file functions are blocked."
                    ),
                )

        # 5. Check function calls
        func_error = self._validate_functions(root)
        if func_error:
            return ValidationResult(is_valid=False, error=func_error)

        # 6. Check table references against registered catalog
        table_error, tables_ref = self._validate_tables(root)
        if table_error:
            return ValidationResult(is_valid=False, error=table_error)

        return ValidationResult(
            is_valid=True,
            tables_referenced=tables_ref,
        )

    def _validate_functions(self, root: exp.Expression) -> str | None:
        """Inspect all function invocations to reject file-access and dangerous calls."""
        for func in root.find_all(exp.Func, exp.Anonymous):
            func_name = ""
            if isinstance(func, exp.Anonymous):
                func_name = func.name.lower()
            elif hasattr(func, "sql_name"):
                func_name = func.sql_name().lower()
            elif hasattr(func, "key"):
                func_name = func.key.lower()

            if not func_name:
                continue

            # Check explicit forbidden list
            if func_name in FORBIDDEN_FUNCTIONS or func_name.startswith("pragma_"):
                return (
                    f"Forbidden function '{func_name}' is not permitted. "
                    "Direct filesystem, network, or server administrative functions are blocked."
                )

            # Check allowlist if name is known
            # Some standard expressions like CASE, CAST, EXTRACT are handled by specific AST nodes
            if func_name not in ALLOWED_FUNCTIONS:
                # If it's a dotted function e.g. schema.func, reject
                if "." in func_name:
                    return f"Qualified function invocation '{func_name}' is not permitted."
                # If it starts with read_ or scan_, block immediately
                if any(func_name.startswith(p) for p in ("read_", "scan_", "load_", "import_")):
                    return f"Forbidden data access function '{func_name}' is not permitted."

        return None

    def _validate_tables(self, root: exp.Expression) -> tuple[str | None, list[str]]:
        """Validates all referenced tables against CTEs and the registered catalog."""
        # Extract CTE names defined inside this query
        ctes: set[str] = set()
        for cte in root.find_all(exp.CTE):
            alias = cte.alias_or_name
            if alias:
                ctes.add(alias.lower())

        tables_referenced: list[str] = []

        for table in root.find_all(exp.Table):
            # If table.this is an expression rather than an identifier/string (e.g. function call)
            if not isinstance(table.this, (exp.Identifier, exp.Var, str)):
                return (
                    "Table expressions using dynamic function calls are not permitted. "
                    "Only registered catalog tables may be queried.",
                    [],
                )

            table_name = table.name.lower()
            schema_name = (table.db or "").lower()

            # Skip CTE references
            if table_name in ctes and not schema_name:
                continue

            # Reject system catalogs
            if schema_name in FORBIDDEN_CATALOGS or table_name in FORBIDDEN_CATALOGS:
                return (
                    f"Access to system catalog '{schema_name or table_name}' is forbidden.",
                    [],
                )

            # If catalog is provided, enforce that table exists in catalog
            if self.catalog:
                if schema_name:
                    qualified = f"{schema_name}.{table_name}"
                    if qualified not in self.qualified_tables:
                        avail = ", ".join(sorted(self.qualified_tables)) or "none"
                        return (
                            f"Table '{schema_name}.{table_name}' is not registered or not accessible "
                            f"in this query context. Available tables: {avail}",
                            [],
                        )
                    tables_referenced.append(qualified)
                else:
                    # Unqualified table name
                    matching_schemas = self.table_to_schemas.get(table_name, [])
                    if not matching_schemas:
                        avail = ", ".join(sorted(self.qualified_tables)) or "none"
                        return (
                            f"Table '{table_name}' is not registered or not accessible "
                            f"in this query context. Available tables: {avail}",
                            [],
                        )
                    if len(matching_schemas) > 1:
                        # Ambiguous table name
                        opts = [f"{s}.{table_name}" for s in matching_schemas]
                        return (
                            f"Ambiguous table reference '{table_name}' exists in multiple datasets. "
                            f"Please qualify it with schema name: {', '.join(opts)}",
                            [],
                        )
                    tables_referenced.append(f"{matching_schemas[0]}.{table_name}")
            else:
                # No catalog specified, record reference
                ref = f"{schema_name}.{table_name}" if schema_name else table_name
                tables_referenced.append(ref)

        return None, tables_referenced
