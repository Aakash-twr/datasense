"""Application configuration loaded from environment variables."""

from __future__ import annotations

from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

API_DIR = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    """Central settings object for the DataSense API."""

    model_config = SettingsConfigDict(
        env_file=(".env", str(API_DIR / ".env")),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ----- Application -----
    app_name: str = "DataSense API"
    app_version: str = "0.3.0"
    debug: bool = False
    environment: str = "development"

    # ----- Server -----
    host: str = "0.0.0.0"
    port: int = 8000

    # ----- Database -----
    database_url: str = "postgresql+psycopg://datasense_user:datasense_pass@localhost:5432/datasense"

    # ----- Security / JWT -----
    jwt_secret_key: str = "datasense-development-jwt-secret-key-must-be-changed-in-production-min-32-chars"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7

    # ----- Cookies -----
    refresh_cookie_name: str = "datasense_refresh_token"
    cookie_secure: bool = False
    cookie_samesite: str = "lax"
    cookie_domain: str | None = None

    # ----- CORS -----
    cors_origins: str | list[str] = ["http://localhost:5173"]

    # ----- Storage & Ingestion Limits -----
    data_storage_root: str = ".local_storage/datasense"
    max_upload_size_bytes: int = 25 * 1024 * 1024  # 25 MB
    max_dataset_rows: int = 500_000
    max_dataset_columns: int = 200
    default_preview_rows: int = 100
    max_preview_rows: int = 500

    # ----- Phase 4: DuckDB Analytical Engine Settings -----
    duckdb_memory_limit: str = "512MB"
    duckdb_threads: int = 2
    duckdb_query_timeout_seconds: int = 30
    duckdb_max_result_rows: int = 2000
    duckdb_max_datasets_per_query: int = 10
    duckdb_max_concurrent_queries: int = 2
    duckdb_temp_directory: str = ".local_storage/datasense/temp/duckdb"

    # ----- Phase 5: Gemini AI Analytics Copilot Settings -----
    google_api_key: str | None = None
    gemini_model: str = "gemini-3.5-flash"
    gemini_temperature: float = 0.1
    gemini_max_output_tokens: int = 4096
    gemini_request_timeout_seconds: int = 45
    ai_enabled: bool = True
    ai_max_requests_per_minute: int = 5
    ai_max_conversation_messages: int = 20
    ai_max_schema_tables: int = 50
    ai_max_schema_columns: int = 500

    # ----- Phase 6: Multi-Agent LangGraph Workflow Settings -----
    agent_workflows_enabled: bool = True
    agent_max_steps: int = 15
    agent_max_llm_calls: int = 8
    agent_max_sql_queries: int = 5
    agent_max_concurrent_runs: int = 2
    agent_workflow_timeout_seconds: int = 180
    agent_checkpoint_retention_days: int = 30
    agent_max_parallel_tasks: int = 2
    agent_result_cache_ttl_seconds: int = 900
    agent_default_mode: str = "deep_analysis"

    # ----- Phase 7: Production Hardening, Pooling, Rate Limits & Observability -----
    frontend_url: str = "http://localhost:5173"
    db_pool_size: int = 5
    db_max_overflow: int = 10
    db_pool_timeout: int = 30
    db_pool_recycle: int = 1800
    log_level: str = "INFO"
    structured_logging: bool = False
    rate_limit_enabled: bool = True
    rate_limit_auth_per_minute: int = 20
    rate_limit_upload_per_minute: int = 15
    rate_limit_query_per_minute: int = 40
    rate_limit_ai_per_minute: int = 12
    rate_limit_agent_per_minute: int = 8
    otel_enabled: bool = False
    otel_exporter_otlp_endpoint: str | None = None
    metrics_token: str | None = None

    @property
    def is_production(self) -> bool:
        """Returns True when running in production environment."""
        return self.environment.strip().lower() in ("production", "prod")

    def validate_production_settings(self) -> None:
        """Fail closed if production starts with unsafe development defaults."""
        if not self.is_production:
            return

        errors: list[str] = []
        if self.debug:
            errors.append("DEBUG must be false in production.")
        if (
            not self.jwt_secret_key
            or self.jwt_secret_key.startswith("datasense-development")
            or len(self.jwt_secret_key.strip()) < 32
        ):
            errors.append("JWT_SECRET_KEY must be a unique strong secret (at least 32 characters) in production.")
        if not self.cookie_secure:
            errors.append("COOKIE_SECURE must be true in production (HTTPS required).")
        if not self.cors_origins or "*" in self.cors_origins:
            errors.append("CORS_ORIGINS must specify explicit origins without '*' in production.")
        if self.database_url.startswith("sqlite"):
            errors.append("DATABASE_URL should point to PostgreSQL in production rather than SQLite.")

        if errors:
            raise ValueError("Invalid production configuration: " + " ".join(errors))

    @field_validator("debug", mode="before")
    @classmethod
    def parse_debug(cls, value: object) -> bool:
        """Parse debug flag safely, handling strings like 'release', 'production', etc."""
        if isinstance(value, str):
            val_lower = value.strip().lower()
            if val_lower in ("true", "1", "yes", "y", "t", "debug", "development", "dev"):
                return True
            if val_lower in ("false", "0", "no", "n", "f", "release", "production", "prod", ""):
                return False
        return bool(value)

    @field_validator("database_url", mode="after")
    @classmethod
    def resolve_sqlite_url(cls, value: str) -> str:
        """Resolve relative SQLite paths to absolute paths relative to services/api directory."""
        if value.startswith("sqlite:///") and not value.startswith("sqlite:////") and ":memory:" not in value:
            rel_path = value.removeprefix("sqlite:///")
            if rel_path.startswith("./"):
                rel_path = rel_path[2:]
            abs_db_path = (API_DIR / rel_path).resolve()
            return f"sqlite:///{abs_db_path}"
        return value

    @field_validator("data_storage_root", mode="after")
    @classmethod
    def resolve_storage_root(cls, value: str) -> str:
        """Resolve relative storage root to absolute path."""
        p = Path(value)
        if not p.is_absolute():
            repo_root = API_DIR.parent.parent
            return str((repo_root / p).resolve())
        return str(p.resolve())

    @field_validator("cors_origins", mode="after")
    @classmethod
    def parse_cors_origins(cls, value: object) -> list[str]:
        """Accept a comma-separated string or a list."""
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        if isinstance(value, list):
            return [str(origin).strip() for origin in value if str(origin).strip()]
        return ["http://localhost:5173"]


settings = Settings()
