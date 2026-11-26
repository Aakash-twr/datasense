#!/usr/bin/env python3
"""Seed realistic local demo datasets for DataSense interactive walkthroughs."""

from __future__ import annotations

import csv
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
API_ROOT = REPO_ROOT / "services" / "api"
sys.path.insert(0, str(API_ROOT))

SAMPLE_DIR = REPO_ROOT / "data" / "demo"


def write_sample_csvs() -> list[Path]:
    SAMPLE_DIR.mkdir(parents=True, exist_ok=True)
    sales_path = SAMPLE_DIR / "retail_sales_2026.csv"
    segments_path = SAMPLE_DIR / "customer_segments.csv"

    with sales_path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow(["order_id", "order_date", "region", "category", "revenue", "units", "discount_pct"])
        rows = [
            ["ORD-1001", "2026-01-05", "North America", "Electronics", 1420.50, 4, 0.05],
            ["ORD-1002", "2026-01-11", "Europe", "Software", 2890.00, 12, 0.10],
            ["ORD-1003", "2026-01-18", "Asia Pacific", "Hardware", 980.00, 2, 0.00],
            ["ORD-1004", "2026-02-02", "North America", "Software", 4120.00, 18, 0.15],
            ["ORD-1005", "2026-02-14", "Europe", "Electronics", 1650.25, 5, 0.05],
            ["ORD-1006", "2026-02-21", "Asia Pacific", "Software", 3310.75, 14, 0.10],
            ["ORD-1007", "2026-03-04", "North America", "Hardware", 2400.00, 6, 0.00],
            ["ORD-1008", "2026-03-19", "Europe", "Hardware", 1920.00, 4, 0.08],
        ]
        writer.writerows(rows)

    with segments_path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow(["region", "segment_name", "avg_ltv", "churn_rate_pct"])
        writer.writerows(
            [
                ["North America", "Enterprise", 18500.0, 2.4],
                ["Europe", "Mid-Market", 11200.0, 3.8],
                ["Asia Pacific", "Growth", 8900.0, 4.9],
            ]
        )
    return [sales_path, segments_path]


def main() -> int:
    files = write_sample_csvs()
    print("Generated demo CSV datasets:")
    for path in files:
        print(f"  - {path}")
    print("Upload these files inside any DataSense Project -> Data Sources -> Upload Dataset.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
