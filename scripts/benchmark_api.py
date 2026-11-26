#!/usr/bin/env python3
"""Controlled local performance benchmark measuring FastAPI/DuckDB/Polars execution and memory on Apple M1."""

from __future__ import annotations

import resource
import statistics
import sys
import tempfile
import time
import uuid
from pathlib import Path

API_ROOT = Path(__file__).resolve().parent.parent / "services" / "api"
sys.path.insert(0, str(API_ROOT))

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.db.session import get_db  # noqa: E402
from app.ingestion.jobs.ingestion_service import process_dataset_ingestion  # noqa: E402
from app.ingestion.storage.local_storage import default_storage  # noqa: E402
from app.main import app  # noqa: E402


def percentile(sorted_vals: list[float], pct: float) -> float:
    if not sorted_vals:
        return 0.0
    k = int(round((pct / 100.0) * (len(sorted_vals) - 1)))
    return sorted_vals[max(0, min(k, len(sorted_vals) - 1))]


def run_benchmark() -> int:
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine, expire_on_commit=False)
    Base.metadata.create_all(bind=engine)
    db = TestingSession()

    def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db
    orig_rl = settings.rate_limit_enabled
    settings.rate_limit_enabled = False

    with tempfile.TemporaryDirectory() as tmpdir:
        orig_storage = settings.data_storage_root
        orig_default_root = default_storage.root_dir
        settings.data_storage_root = tmpdir
        default_storage.root_dir = Path(tmpdir).resolve()
        try:
            with TestClient(app) as client:
                reg = client.post(
                    "/api/v1/auth/register",
                    json={
                        "name": "Bench User",
                        "email": "bench@example.com",
                        "password": "BenchPassword123!",
                        "organization_name": "Bench Workspace",
                    },
                ).json()
                headers = {
                    "Authorization": f"Bearer {reg['access_token']}",
                    "X-Requested-With": "DataSense",
                }
                proj = client.post("/api/v1/projects", headers=headers, json={"name": "Bench Project"}).json()
                pid = proj["id"]

                # Generate a 10,000-row CSV (~400 KB) for ingestion + analytical query testing
                csv_lines = ["id,region,category,amount,quantity"]
                regions = ["North", "South", "East", "West"]
                cats = ["Software", "Hardware", "Services"]
                for idx in range(10000):
                    csv_lines.append(
                        f"{idx},{regions[idx % 4]},{cats[idx % 3]},{round((idx % 500) * 1.25 + 10.0, 2)},{(idx % 12) + 1}"
                    )
                payload_bytes = "\n".join(csv_lines).encode("utf-8")

                t_ing0 = time.perf_counter()
                up = client.post(
                    f"/api/v1/projects/{pid}/datasets",
                    headers=headers,
                    files={"file": ("bench_10k.csv", payload_bytes, "text/csv")},
                )
                assert up.status_code == 202
                ds_id = up.json()["dataset_id"]
                job_id = up.json()["job_id"]
                process_dataset_ingestion(uuid.UUID(job_id), lambda: db)
                ing_ms = (time.perf_counter() - t_ing0) * 1000.0

                cat = client.get(f"/api/v1/projects/{pid}/query/catalog", headers=headers).json()
                tname = cat["datasets"][0]["tables"][0]["table_name"]

                # Warmup + 30 health/catalog/SQL requests
                health_lat: list[float] = []
                for _ in range(30):
                    t0 = time.perf_counter()
                    r = client.get("/api/v1/health/live")
                    assert r.status_code == 200
                    health_lat.append((time.perf_counter() - t0) * 1000.0)

                sql_lat: list[float] = []
                query_body = {
                    "sql": (
                        f"SELECT region, category, COUNT(*) AS rows_cnt, "
                        f"ROUND(SUM(amount), 2) AS sum_amt, ROUND(AVG(quantity), 2) AS avg_qty "
                        f"FROM {tname} GROUP BY region, category ORDER BY sum_amt DESC"
                    ),
                    "dataset_ids": [ds_id],
                }
                for _ in range(25):
                    t0 = time.perf_counter()
                    r = client.post(f"/api/v1/projects/{pid}/query/execute", headers=headers, json=query_body)
                    assert r.status_code == 200
                    sql_lat.append((time.perf_counter() - t0) * 1000.0)

                rss_mb = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / (1024 * 1024)
                # Note on macOS ru_maxrss is bytes, on Linux it is kilobytes
                if sys.platform != "darwin":
                    rss_mb = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024.0

                health_sorted = sorted(health_lat)
                sql_sorted = sorted(sql_lat)
                print("=== DataSense Local Benchmark Results ===")
                print(f"Ingestion (10,000 rows CSV -> Parquet): {ing_ms:.2f} ms")
                print(
                    f"/health/live (30 reqs): min={health_sorted[0]:.2f}ms "
                    f"p50={percentile(health_sorted, 50):.2f}ms p95={percentile(health_sorted, 95):.2f}ms "
                    f"mean={statistics.mean(health_sorted):.2f}ms"
                )
                print(
                    f"DuckDB Group-By 10k rows (25 reqs): min={sql_sorted[0]:.2f}ms "
                    f"p50={percentile(sql_sorted, 50):.2f}ms p95={percentile(sql_sorted, 95):.2f}ms "
                    f"mean={statistics.mean(sql_sorted):.2f}ms"
                )
                print(f"Peak Process RSS Memory: {rss_mb:.2f} MB")
        finally:
            settings.data_storage_root = orig_storage
            default_storage.root_dir = orig_default_root
            settings.rate_limit_enabled = orig_rl
            app.dependency_overrides.clear()
            db.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(run_benchmark())
